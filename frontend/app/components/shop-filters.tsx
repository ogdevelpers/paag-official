"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { categories, liveCategories, sizes } from "@/lib/domain";

type ShopFiltersProps = {
  params: Record<string, string | string[] | undefined>;
  category: string;
  size: string;
  sort: string;
  availability: string;
  discount: string;
  style?: string;
};

function FilterForm({
  params,
  category,
  size,
  sort,
  availability,
  discount,
  style = "",
  onSubmit,
}: ShopFiltersProps & { onSubmit?: () => void }) {
  return (
    <form
      className="grid min-w-0 gap-4"
      action="/shop"
      onSubmit={() => onSubmit?.()}
    >
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Search
        <span className="relative block min-w-0">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-dim)]"
            size={16}
          />
          <input
            className="field w-full min-w-0 pl-9"
            defaultValue={String(params.q || "")}
            name="q"
            placeholder="Search co-ord sets"
          />
        </span>
      </label>
      {style ? <input name="style" type="hidden" value={style} /> : null}
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Category
        <select className="field w-full min-w-0" defaultValue={category} name="category">
          <option value={liveCategories[0] || "Co-ords"}>{liveCategories[0] || "Co-ords"}</option>
          <option value="New In">New In</option>
          {categories
            .filter((item) => item !== "New In" && !liveCategories.includes(item))
            .map((item) => (
              <option disabled key={item} value={item}>
                {item} (coming soon)
              </option>
            ))}
        </select>
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Size
        <select className="field w-full min-w-0" defaultValue={size} name="size">
          <option>All</option>
          {sizes.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <label className="grid min-w-0 gap-2 text-sm font-medium">
          Min price
          <input
            className="field w-full min-w-0"
            defaultValue={params.minPrice ? String(params.minPrice) : ""}
            min="0"
            name="minPrice"
            placeholder="₹"
            type="number"
          />
        </label>
        <label className="grid min-w-0 gap-2 text-sm font-medium">
          Max price
          <input
            className="field w-full min-w-0"
            defaultValue={params.maxPrice ? String(params.maxPrice) : ""}
            min="0"
            name="maxPrice"
            placeholder="₹"
            type="number"
          />
        </label>
      </div>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Availability
        <select className="field w-full min-w-0" defaultValue={availability} name="availability">
          <option value="all">All products</option>
          <option value="in-stock">In stock only</option>
        </select>
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Offer
        <select className="field w-full min-w-0" defaultValue={discount} name="discount">
          <option value="all">All offers</option>
          <option value="10">10% and above</option>
          <option value="15">15% and above</option>
        </select>
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Sort
        <select className="field w-full min-w-0" defaultValue={sort} name="sort">
          <option value="featured">Featured</option>
          <option value="new">Newest first</option>
          <option value="price-low">Price low to high</option>
          <option value="price-high">Price high to low</option>
          <option value="discount">Highest discount</option>
          <option value="reviews">Most reviewed</option>
        </select>
      </label>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <button className="btn-primary w-full justify-center" type="submit">
          Apply filters
        </button>
        <a className="btn-secondary w-full justify-center" href="/shop">
          Clear all
        </a>
      </div>
    </form>
  );
}

export function ShopFiltersSidebar(props: ShopFiltersProps) {
  return (
    <aside className="hidden min-w-0 lg:block lg:sticky lg:top-28 lg:self-start">
      <div className="surface p-4 xl:p-5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={18} className="shrink-0 text-[var(--gold-soft)]" />
          <h2 className="font-semibold">Filters</h2>
        </div>
        <div className="mt-5">
          <FilterForm {...props} />
        </div>
      </div>
    </aside>
  );
}

export function ShopFiltersMobile(props: ShopFiltersProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <div className="mb-4 lg:hidden">
        <button
          className="btn-secondary w-full justify-center py-3"
          type="button"
          onClick={() => setOpen(true)}
        >
          <SlidersHorizontal size={16} /> Filters & sort
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close filters"
            className="absolute inset-0 bg-black/40"
            type="button"
            onClick={() => setOpen(false)}
          />
          <div
            aria-modal="true"
            className="filter-drawer absolute inset-x-0 bottom-0 flex max-h-[min(90dvh,720px)] flex-col rounded-t-[1.5rem]"
            role="dialog"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-lg font-semibold">Filters & sort</h2>
              <button aria-label="Close" className="icon-button" type="button" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              <FilterForm {...props} onSubmit={() => setOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** @deprecated Use ShopFiltersSidebar + ShopFiltersMobile in the shop layout. */
export function ShopFilters(props: ShopFiltersProps) {
  return (
    <>
      <ShopFiltersSidebar {...props} />
      <ShopFiltersMobile {...props} />
    </>
  );
}
