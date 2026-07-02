"use client";

import { Pencil, Trash2, Upload, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { Product } from "@/lib/domain";
import { currency, DEFAULT_STORE_CATEGORY, sizes, STORE_CATEGORIES, getSizeStock, getTotalStock, formatSizeStockSummary } from "@/lib/domain";
import { ProductImage } from "../../components/product-image";
import { StudioShell } from "../studio-shell";
import { useStudioData } from "../studio-data";

const defaultSelectedSizes = ["XS", "S", "M", "L", "XL", "XXL"];

function toDatetimeLocalValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-[var(--line)] pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted-dim)]">{title}</h3>
      {children}
    </section>
  );
}

function buildProductPayload(
  form: FormData,
  selectedSizes: string[],
  images: string[],
  sizeStockBySize: Record<string, number>,
) {
  const discountRaw = String(form.get("discount") || "").trim();
  const createdAtRaw = String(form.get("createdAt") || "").trim();
  const sizeStock = Object.fromEntries(
    selectedSizes.map((size) => [size, Math.max(0, Number(sizeStockBySize[size] ?? 0))]),
  );

  return {
    id: form.get("id"),
    name: form.get("name"),
    slug: form.get("slug"),
    category: form.get("category"),
    status: form.get("status"),
    price: Number(form.get("price")),
    mrp: Number(form.get("mrp") || form.get("price")),
    discount: discountRaw === "" ? undefined : Number(discountRaw),
    sizeStock,
    color: form.get("color"),
    fabric: form.get("fabric"),
    fit: form.get("fit"),
    badge: form.get("badge"),
    description: form.get("description"),
    tags: form.get("tags"),
    sizes: selectedSizes,
    rating: Number(form.get("rating") || 0),
    reviews: Number(form.get("reviews") || 0),
    images,
    createdAt: createdAtRaw || undefined,
  };
}

export function ProductsClient() {
  const { loading, products, refresh } = useStudioData();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>(defaultSelectedSizes);
  const [sizeStockBySize, setSizeStockBySize] = useState<Record<string, number>>(
    Object.fromEntries(defaultSelectedSizes.map((size) => [size, 10])),
  );
  const [pricePreview, setPricePreview] = useState("");
  const [mrpPreview, setMrpPreview] = useState("");
  const [discountPreview, setDiscountPreview] = useState("");

  const computedDiscount = useMemo(() => {
    const price = Number(pricePreview);
    const mrp = Number(mrpPreview || pricePreview);
    if (!Number.isFinite(price) || !Number.isFinite(mrp) || mrp <= price) return 0;
    return Math.round((1 - price / mrp) * 100);
  }, [mrpPreview, pricePreview]);

  function resetFormState() {
    setEditingProduct(null);
    setExistingImages([]);
    setSelectedSizes(defaultSelectedSizes);
    setSizeStockBySize(Object.fromEntries(defaultSelectedSizes.map((size) => [size, 10])));
    setPricePreview("");
    setMrpPreview("");
    setDiscountPreview("");
  }

  function startEdit(product: Product) {
    const nextSizes = product.sizes.length ? product.sizes : defaultSelectedSizes;
    setEditingProduct(product);
    setExistingImages(product.images);
    setSelectedSizes(nextSizes);
    setSizeStockBySize(
      Object.fromEntries(nextSizes.map((size) => [size, getSizeStock(product, size)])),
    );
    setPricePreview(String(product.price));
    setMrpPreview(String(product.mrp));
    setDiscountPreview(product.discount ? String(product.discount) : "");
    setMessage("");
  }

  function cancelEdit() {
    resetFormState();
    setMessage("");
  }

  function toggleSize(size: string) {
    setSelectedSizes((current) => {
      const removing = current.includes(size);
      const nextSizes = removing ? current.filter((item) => item !== size) : [...current, size];

      setSizeStockBySize((stockMap) => {
        const nextStock = { ...stockMap };
        if (removing) {
          delete nextStock[size];
        } else {
          nextStock[size] = nextStock[size] ?? 10;
        }
        return nextStock;
      });

      return nextSizes;
    });
  }

  function removeExistingImage(url: string) {
    setExistingImages((current) => current.filter((image) => image !== url));
  }

  function getSelectedImageFiles(formElement: HTMLFormElement) {
    const input = formElement.elements.namedItem("imageFiles");
    if (!(input instanceof HTMLInputElement) || input.type !== "file") {
      return null;
    }
    return input.files?.length ? input.files : null;
  }

  async function uploadImages(files: FileList | null) {
    if (!files?.length) {
      return { images: [] as string[] };
    }

    const uploadForm = new FormData();
    for (const file of Array.from(files)) {
      uploadForm.append("files", file);
    }

    const uploadResponse = await fetch("/api/studio/uploads/product-images", {
      method: "POST",
      credentials: "same-origin",
      body: uploadForm,
    });
    const uploadData = (await uploadResponse.json()) as {
      assets?: { url?: string }[];
      error?: string;
    };

    if (!uploadResponse.ok || !uploadData.assets?.length) {
      return {
        error: uploadData.error || "Unable to upload product images.",
        images: [] as string[],
      };
    }

    return {
      images: uploadData.assets.map((asset) => asset.url).filter(Boolean) as string[],
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    if (!selectedSizes.length) {
      setMessage("Select at least one size.");
      setSubmitting(false);
      return;
    }

    const upload = await uploadImages(getSelectedImageFiles(formElement));
    if (upload.error) {
      setMessage(upload.error);
      setSubmitting(false);
      return;
    }

    const images = [...existingImages, ...upload.images];
    if (!images.length) {
      setMessage("Upload at least one product image.");
      setSubmitting(false);
      return;
    }

    const payload = buildProductPayload(form, selectedSizes, images, sizeStockBySize);
    const response = await fetch(
      editingProduct ? `/api/products/${editingProduct.slug}` : "/api/products",
      {
        method: editingProduct ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      },
    );

    if (response.ok) {
      const wasEditing = Boolean(editingProduct);
      formElement.reset();
      resetFormState();
      setMessage(wasEditing ? "Product updated." : "Product saved to catalogue.");
      refresh();
    } else {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(data?.error || "Unable to save product.");
    }
    setSubmitting(false);
  }

  async function remove(slug: string) {
    if (editingProduct?.slug === slug) {
      cancelEdit();
    }

    await fetch(`/api/products/${slug}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    refresh();
  }

  const formKey = editingProduct?.slug ?? "new";

  return (
    <StudioShell>
      <div>
        <p className="eyebrow">Catalogue</p>
        <h1 className="mt-2 font-serif text-5xl font-semibold">Products</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
          All fields map to the <code className="text-[var(--gold-soft)]">products</code> table,
          including the product ID you assign (e.g.{" "}
          <code className="text-[var(--gold-soft)]">paag_prod_coord_1</code>).
        </p>
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[540px_1fr]">
        <form
          key={formKey}
          className="h-fit max-h-[calc(100vh-8rem)] overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5"
          onSubmit={submit}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-2xl font-semibold">
              {editingProduct ? "Edit product" : "Add product"}
            </h2>
            {editingProduct ? (
              <button className="text-sm text-[var(--muted)] underline-offset-4 hover:underline" type="button" onClick={cancelEdit}>
                Cancel
              </button>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4">
            <Section title="Identity">
              <label className="grid gap-2 text-sm">
                Product ID *
                <input
                  className="field read-only:opacity-70"
                  defaultValue={editingProduct?.id}
                  name="id"
                  placeholder="paag_prod_coord_1"
                  readOnly={Boolean(editingProduct)}
                  required
                />
              </label>
              <label className="grid gap-2 text-sm">
                Name *
                <input className="field" defaultValue={editingProduct?.name} name="name" required />
              </label>
              <label className="grid gap-2 text-sm">
                Slug
                <input
                  className="field"
                  defaultValue={editingProduct?.slug}
                  name="slug"
                  placeholder="auto-generated from name"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  Category *
                  <select
                    className="field"
                    defaultValue={editingProduct?.category || DEFAULT_STORE_CATEGORY}
                    name="category"
                    required
                  >
                    {STORE_CATEGORIES.map((item) => (
                      <option key={item.slug} value={item.label}>
                        {item.label}
                        {!item.live ? " (not live)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  Status *
                  <select
                    className="field"
                    defaultValue={editingProduct?.status || "live"}
                    name="status"
                    required
                  >
                    <option value="live">live</option>
                    <option value="draft">draft</option>
                  </select>
                </label>
              </div>
            </Section>

            <Section title="Pricing">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  Price (₹) *
                  <input
                    className="field"
                    defaultValue={editingProduct?.price}
                    name="price"
                    required
                    type="number"
                    min="1"
                    onChange={(event) => setPricePreview(event.target.value)}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  MRP (₹) *
                  <input
                    className="field"
                    defaultValue={editingProduct?.mrp}
                    name="mrp"
                    type="number"
                    min="1"
                    onChange={(event) => setMrpPreview(event.target.value)}
                  />
                </label>
              </div>
              <label className="grid gap-2 text-sm">
                Discount (%)
                <input
                  className="field"
                  name="discount"
                  type="number"
                  min="0"
                  max="95"
                  placeholder={`Auto: ${computedDiscount}% from price & MRP`}
                  value={discountPreview}
                  onChange={(event) => setDiscountPreview(event.target.value)}
                />
              </label>
            </Section>

            <Section title="Inventory">
              <fieldset className="grid gap-3">
                <legend className="text-sm">Sizes *</legend>
                <div className="flex flex-wrap gap-2">
                  {sizes.map((size) => (
                    <label
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1.5 text-sm"
                      key={size}
                    >
                      <input
                        checked={selectedSizes.includes(size)}
                        type="checkbox"
                        onChange={() => toggleSize(size)}
                      />
                      {size}
                    </label>
                  ))}
                </div>
              </fieldset>
              {selectedSizes.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {selectedSizes.map((size) => (
                    <label className="grid gap-2 text-sm" key={size}>
                      Stock · {size} *
                      <input
                        className="field"
                        min="0"
                        required
                        type="number"
                        value={sizeStockBySize[size] ?? 0}
                        onChange={(event) =>
                          setSizeStockBySize((current) => ({
                            ...current,
                            [size]: Math.max(0, Number(event.target.value || 0)),
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">Select at least one size.</p>
              )}
            </Section>

            <Section title="Product details">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  Color *
                  <input
                    className="field"
                    defaultValue={editingProduct?.color}
                    name="color"
                    placeholder="Rose Gold"
                    required
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Fabric
                  <input
                    className="field"
                    defaultValue={editingProduct?.fabric}
                    name="fabric"
                    placeholder="Chanderi silk blend"
                  />
                </label>
              </div>
              <label className="grid gap-2 text-sm">
                Fit
                <input
                  className="field"
                  defaultValue={editingProduct?.fit}
                  name="fit"
                  placeholder="Straight kurta & palazzo"
                />
              </label>
              <label className="grid gap-2 text-sm">
                Badge
                <input
                  className="field"
                  defaultValue={editingProduct?.badge}
                  name="badge"
                  placeholder="New, Bestseller, 50% off"
                />
              </label>
              <label className="grid gap-2 text-sm">
                Tags
                <input
                  className="field"
                  defaultValue={editingProduct?.tags.join(", ")}
                  name="tags"
                  placeholder="printed, cotton, daily, festive"
                />
              </label>
              <label className="grid gap-2 text-sm">
                Description
                <textarea
                  className="field min-h-28 p-3"
                  defaultValue={editingProduct?.description}
                  name="description"
                />
              </label>
            </Section>

            <Section title="Reviews & rating">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  Rating (0–5)
                  <input
                    className="field"
                    defaultValue={editingProduct?.rating ?? 0}
                    name="rating"
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Reviews count
                  <input
                    className="field"
                    defaultValue={editingProduct?.reviews ?? 0}
                    name="reviews"
                    type="number"
                    min="0"
                  />
                </label>
              </div>
            </Section>

            <Section title="Media">
              {existingImages.length ? (
                <div className="grid gap-2">
                  <p className="text-sm">Current images</p>
                  <div className="flex flex-wrap gap-2">
                    {existingImages.map((url) => (
                      <div className="relative" key={url}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="" className="h-20 w-16 rounded-md object-cover" src={url} />
                        <button
                          aria-label="Remove image"
                          className="absolute -right-1 -top-1 rounded-full bg-[var(--ink)] p-1 text-white"
                          type="button"
                          onClick={() => removeExistingImage(url)}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <label className="grid gap-2 text-sm">
                {editingProduct ? "Add more images" : "Images *"}
                <input
                  className="field"
                  name="imageFiles"
                  type="file"
                  accept="image/*"
                  multiple
                  required={!existingImages.length}
                />
              </label>
              <p className="text-xs leading-5 text-[var(--muted-dim)]">
                {editingProduct
                  ? "Keep existing photos above or upload replacements. At least one image is required."
                  : "Upload one or more photos. Files are stored in Supabase and saved as images[] URLs on the product row."}
              </p>
            </Section>

            <Section title="Timestamps">
              <label className="grid gap-2 text-sm">
                Created at
                <input
                  className="field"
                  defaultValue={
                    editingProduct?.createdAt
                      ? toDatetimeLocalValue(new Date(editingProduct.createdAt))
                      : undefined
                  }
                  name="createdAt"
                  type="datetime-local"
                  placeholder={toDatetimeLocalValue()}
                />
              </label>
              <p className="text-xs leading-5 text-[var(--muted-dim)]">
                Leave blank to use the current time when publishing a new product.
              </p>
            </Section>

            <button className="btn-primary justify-center" disabled={submitting} type="submit">
              <Upload size={17} />{" "}
              {submitting
                ? "Saving..."
                : editingProduct
                  ? "Update product"
                  : "Save product"}
            </button>
            {message ? <p className="text-sm text-[var(--gold-soft)]">{message}</p> : null}
          </div>
        </form>

        <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
          <div className="border-b border-[var(--line)] p-5">
            <h2 className="text-2xl font-semibold">Inventory</h2>
          </div>
          {loading ? (
            <p className="p-5 text-[var(--muted)]">Loading products...</p>
          ) : products.length === 0 ? (
            <p className="p-5 text-sm leading-7 text-[var(--muted)]">
              No products yet. Add your first item using the form.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-[var(--panel-2)] text-[var(--muted)]">
                  <tr>
                    <th className="px-5 py-3">Product</th>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Price</th>
                    <th className="px-5 py-3">Discount</th>
                    <th className="px-5 py-3">Rating</th>
                    <th className="px-5 py-3">Stock</th>
                    <th className="px-5 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr
                      className={`border-t border-[var(--line)] ${
                        editingProduct?.slug === product.slug ? "bg-[var(--panel-2)]/60" : ""
                      }`}
                      key={product.id}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <ProductImage
                            alt={product.name}
                            className="h-12 w-10 rounded-md object-cover"
                            product={product}
                          />
                          <div>
                            <span className="font-semibold">{product.name}</span>
                            <p className="text-xs text-[var(--muted)]">{product.id}</p>
                            <p className="text-xs text-[var(--muted-dim)]">{product.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">{product.category}</td>
                      <td className="px-5 py-4 capitalize">{product.status}</td>
                      <td className="px-5 py-4">{currency.format(product.price)}</td>
                      <td className="px-5 py-4">{product.discount ? `${product.discount}%` : "—"}</td>
                      <td className="px-5 py-4">
                        {product.rating ? `${product.rating} (${product.reviews})` : "—"}
                      </td>
                      <td className="px-5 py-4">
                        <p>{getTotalStock(product)} total</p>
                        <p className="text-xs text-[var(--muted)]">{formatSizeStockSummary(product)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            aria-label={`Edit ${product.name}`}
                            className={`icon-button ${
                              editingProduct?.slug === product.slug
                                ? "border-[var(--gold)] text-[var(--gold-soft)]"
                                : ""
                            }`}
                            type="button"
                            onClick={() => startEdit(product)}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            aria-label={`Delete ${product.name}`}
                            className="icon-button text-[#ffb39d]"
                            type="button"
                            onClick={() => remove(product.slug)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </StudioShell>
  );
}
