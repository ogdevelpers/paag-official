import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { listCatalogProducts } from "@/lib/api";
import { AccountClient } from "./account-client";

export default async function AccountPage() {
  return (
    <main className="min-w-0 overflow-x-clip">
      <SiteHeader />
      <AccountClient products={await listCatalogProducts()} />
      <SiteFooter />
    </main>
  );
}
