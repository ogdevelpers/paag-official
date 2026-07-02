import Link from "next/link";
import { ProductCard } from "./product-card";
import type { Product } from "@/lib/domain";

type CollectionSpotlightProps = {
  title: string;
  description: string;
  href: string;
  image?: string;
  products: Product[];
  reverse?: boolean;
};

export function CollectionSpotlight({
  title,
  description,
  href,
  image,
  products,
  reverse = false,
}: CollectionSpotlightProps) {
  return (
    <section className="border-t border-[var(--line)] py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={`grid items-center gap-8 lg:grid-cols-2 lg:gap-12 ${reverse ? "lg:[direction:rtl]" : ""}`}
        >
          <Link
            className={`group relative block overflow-hidden rounded-sm ${reverse ? "lg:[direction:ltr]" : ""}`}
            href={href}
          >
            <div className="aspect-[4/5] overflow-hidden bg-[var(--panel-2)] sm:aspect-[5/6]">
              {image ? (
                <img
                  alt={title}
                  className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
                  src={image}
                />
              ) : (
                <div className="flex h-full w-full items-end bg-[linear-gradient(160deg,var(--panel-2),var(--ink))] p-6">
                  <p className="font-serif text-2xl text-white sm:text-3xl">{title}</p>
                </div>
              )}
            </div>
            {image ? (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-6">
                <p className="font-serif text-2xl text-white sm:text-3xl">{title}</p>
              </div>
            ) : null}
          </Link>

          <div className={reverse ? "lg:[direction:ltr]" : ""}>
            <p className="max-w-lg text-sm leading-7 text-[var(--muted)] sm:text-base">{description}</p>
            <Link className="inline-link mt-4 inline-block text-sm font-semibold uppercase tracking-[0.12em]" href={href}>
              View all
            </Link>
            <div className="mt-8 grid grid-cols-1 gap-4 min-[480px]:grid-cols-2">
              {products.slice(0, 2).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
