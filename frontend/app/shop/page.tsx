import { ProductCard } from "../components/product-card";
import { ShopFiltersMobile, ShopFiltersSidebar } from "../components/shop-filters";
import { ShopSortBar } from "../components/shop-sort-bar";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import {
  DEFAULT_STORE_CATEGORY,
  filterCatalogProducts,
  getShopQuickFilters,
  isLiveCategory,
  shopHref,
} from "@/lib/domain";
import { listCatalogProducts } from "@/lib/api";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = String(params.q || "").toLowerCase();
  const requestedCategory = String(params.category || DEFAULT_STORE_CATEGORY);
  const category =
    requestedCategory === "All" || isLiveCategory(requestedCategory) || requestedCategory === "New In"
      ? requestedCategory
      : DEFAULT_STORE_CATEGORY;
  const size = String(params.size || "All");
  const sort = String(params.sort || "featured");
  const style = String(params.style || "");
  const minPrice = Number(params.minPrice || 0);
  const maxPrice = Number(params.maxPrice || 0);
  const availability = String(params.availability || "all");
  const discount = String(params.discount || "all");

  const filterProps = {
    availability,
    category,
    discount,
    params,
    size,
    sort,
    style,
  };

  const products = filterCatalogProducts(await listCatalogProducts(), {
    availability,
    category,
    discount,
    maxPrice,
    minPrice,
    query,
    size,
    sort,
    style,
  });
  const activeCategory =
    category === "All"
      ? "All co-ord sets"
      : category === DEFAULT_STORE_CATEGORY && !style
        ? "Co-ord sets"
        : style
          ? `${category} · ${style}`
          : category;
  const quickFilters = getShopQuickFilters();

  return (
    <main className="min-w-0 overflow-x-clip">
      <SiteHeader />

      <section className="page-band">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <p className="eyebrow">Shop</p>
          <h1 className="text-balance mt-2 font-serif text-3xl font-semibold sm:text-4xl lg:text-5xl">
            {activeCategory}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)] sm:text-base">
            Discover matching co-ordinated sets with size-level stock, wishlist saves, and secure
            checkout.
          </p>
          <div className="category-rail -mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1">
            {quickFilters.map((item) => (
              <a
                className={`chip shrink-0 ${item.href.includes(`category=${encodeURIComponent(category)}`) && !style ? "chip-active" : ""}`}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)] lg:items-start lg:gap-8">
          <ShopFiltersSidebar {...filterProps} />

          <div className="min-w-0">
            <ShopFiltersMobile {...filterProps} />

            <div className="mb-5 flex flex-col gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">{products.length} styles</p>
                <p className="text-xs text-[var(--muted)]">Matching co-ord ensembles</p>
              </div>
              <ShopSortBar params={params} sort={sort} />
            </div>

            <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 xl:grid-cols-3">
              {products.length ? (
                products.map((product) => <ProductCard key={product.id} product={product} />)
              ) : (
                <div className="surface col-span-full p-8 text-center sm:p-10">
                  <h2 className="font-serif text-2xl font-semibold">No co-ord sets found</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Try clearing filters or browsing all co-ord sets.
                  </p>
                  <a
                    className="btn-primary mt-5 inline-flex"
                    href={shopHref(DEFAULT_STORE_CATEGORY)}
                  >
                    View all co-ords
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
