import { notFound } from "next/navigation";
import { ProductCard } from "../../components/product-card";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { getProductDetail } from "@/lib/api";
import { ProductDetail } from "./product-detail";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getProductDetail(slug);
  if (!detail) notFound();

  const { product, recommendations } = detail;

  return (
    <main className="min-w-0 overflow-x-clip pb-24 sm:pb-0">
      <SiteHeader />
      <ProductDetail product={product} />
      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <p className="eyebrow">Recommended</p>
        <h2 className="mt-2 font-serif text-4xl font-semibold">Complete the look</h2>
        <div className="mt-8 grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-4">
          {recommendations.map((item) => (
            <ProductCard key={item.id} product={item} />
          ))}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
