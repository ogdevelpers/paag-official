"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import type { Product } from "@/lib/domain";
import { ProductCard } from "./product-card";

type ProductCarouselProps = {
  products: Product[];
  showDiscountBadge?: boolean;
  title: string;
  viewAllHref?: string;
};

export function ProductCarousel({
  products,
  showDiscountBadge = true,
  title,
  viewAllHref = "/shop",
}: ProductCarouselProps) {
  const railRef = useRef<HTMLDivElement>(null);

  function scrollBy(direction: "left" | "right") {
    const rail = railRef.current;
    if (!rail) return;
    const amount = direction === "left" ? -rail.clientWidth * 0.85 : rail.clientWidth * 0.85;
    rail.scrollBy({ left: amount, behavior: "smooth" });
  }

  if (!products.length) return null;

  return (
    <section className="py-10 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="font-serif text-2xl font-semibold sm:text-3xl">{title}</h2>
          <div className="flex items-center gap-2">
            <button
              aria-label="Previous products"
              className="carousel-btn"
              type="button"
              onClick={() => scrollBy("left")}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              aria-label="Next products"
              className="carousel-btn"
              type="button"
              onClick={() => scrollBy("right")}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="category-rail mt-6 flex gap-4 overflow-x-auto pb-2" ref={railRef}>
          {products.map((product) => (
            <div className="w-[11.5rem] shrink-0 sm:w-[13rem]" key={product.id}>
              <ProductCard product={product} showDiscountBadge={showDiscountBadge} variant="compact" />
            </div>
          ))}
        </div>

        <div className="mt-6 text-center">
          <Link className="inline-link text-sm font-semibold uppercase tracking-[0.12em]" href={viewAllHref}>
            View all
          </Link>
        </div>
      </div>
    </section>
  );
}
