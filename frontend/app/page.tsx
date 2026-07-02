import Link from "next/link";
import { ProductCarousel } from "./components/product-carousel";
import { SiteFooter } from "./components/site-footer";
import { SiteHeader } from "./components/site-header";
import {
  DEFAULT_STORE_CATEGORY,
  getHomeNewArrivals,
  SALE_DISCOUNT_THRESHOLD,
  shopHref,
} from "@/lib/domain";
import { listCatalogProducts } from "@/lib/api";

export default async function Home() {
  const products = await listCatalogProducts();
  const newArrivals = getHomeNewArrivals(products);
  const saleItems = [...products]
    .filter((p) => p.discount >= SALE_DISCOUNT_THRESHOLD)
    .sort((a, b) => b.discount - a.discount)
    .slice(0, 12);
  const heroProduct = newArrivals[0] || products[0];
  const heroImage = heroProduct?.images[0];

  return (
    <main className="min-w-0 overflow-x-clip bg-white">
      <SiteHeader />

      <section className="hero-editorial">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-center lg:gap-12 lg:px-8 lg:py-16">
          <div className="max-w-xl">
            <p className="eyebrow">Spring Summer &apos;26</p>
            <h1 className="text-balance mt-4 font-serif text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-6xl">
              Co-ord sets that feel as good as they look
            </h1>
            <p className="mt-5 text-base leading-8 text-[var(--muted)]">
              Curated matching ensembles in premium fabrics — designed for the modern Indian
              wardrobe, with virtual try-on before you checkout.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn-primary px-8" href="/shop?category=New+In&sort=new">
                Shop new in
              </Link>
              <Link className="btn-secondary px-8" href={shopHref(DEFAULT_STORE_CATEGORY)}>
                Explore all sets
              </Link>
            </div>
          </div>

          {heroImage && heroProduct ? (
            <Link
              className="hero-editorial__media group relative block overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel-2)]"
              href={`/product/${heroProduct.slug}`}
            >
              <img
                alt={heroProduct.name}
                className="aspect-[4/5] w-full object-cover transition duration-700 group-hover:scale-[1.02]"
                src={heroImage}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
                  Featured set
                </p>
                <p className="mt-2 font-serif text-2xl text-white">{heroProduct.name}</p>
              </div>
            </Link>
          ) : null}
        </div>
      </section>

      <ProductCarousel
        products={newArrivals}
        showDiscountBadge={false}
        title="New co-ord arrivals"
        viewAllHref="/shop?category=New+In&sort=new"
      />

      <ProductCarousel
        products={saleItems}
        title="Co-ord sets on sale"
        viewAllHref={`/shop?category=${encodeURIComponent(DEFAULT_STORE_CATEGORY)}&discount=${SALE_DISCOUNT_THRESHOLD}&sort=discount`}
      />

      <section className="border-y border-[var(--line)] bg-[var(--panel-2)] py-14">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="eyebrow">The PAAG difference</p>
          <h2 className="mt-3 font-serif text-3xl font-semibold sm:text-4xl">
            Try the fit. Love the set. Checkout with confidence.
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)] sm:text-base">
            Use PAAG Lens on any style, save favourites to your wishlist, and checkout with saved
            addresses and secure payments.
          </p>
          <Link className="btn-primary mt-8" href="/try-on">
            Start virtual try-on
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
