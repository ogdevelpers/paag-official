import { listCatalogProducts } from "@/lib/api";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { WishlistClient } from "./wishlist-client";

export default async function WishlistPage() {
  return (
    <main className="min-w-0 overflow-x-clip">
      <SiteHeader />
      <WishlistClient products={await listCatalogProducts()} />
      <SiteFooter />
    </main>
  );
}
