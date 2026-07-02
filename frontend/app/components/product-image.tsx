import type { Product } from "@/lib/domain";

export function productImageUrl(product: Pick<Product, "images">, index = 0) {
  return product.images[index] || product.images[0] || "";
}

type ProductImageProps = {
  alt: string;
  className?: string;
  product: Pick<Product, "images">;
  index?: number;
};

export function ProductImage({ alt, className = "", product, index = 0 }: ProductImageProps) {
  const src = productImageUrl(product, index);

  if (!src) {
    return (
      <div
        aria-hidden="true"
        className={`flex items-center justify-center bg-[linear-gradient(145deg,var(--panel-2),var(--panel))] text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[var(--muted-dim)] ${className}`}
      >
        PAAG
      </div>
    );
  }

  return <img alt={alt} className={className} src={src} />;
}
