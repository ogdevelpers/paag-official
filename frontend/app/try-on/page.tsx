import { listCatalogProducts } from "@/lib/api";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { TryOnClient } from "./try-on-client";

export default async function TryOnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const selectedSlug = String(params.product || "");

  return (
    <main>
      <SiteHeader />
      <TryOnClient products={await listCatalogProducts()} selectedSlug={selectedSlug} />
      <SiteFooter />
    </main>
  );
}
