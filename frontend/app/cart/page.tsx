import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { CartPageClient } from "./cart-page";

export default function CartRoute() {
  return (
    <main className="min-w-0 overflow-x-clip">
      <SiteHeader />
      <CartPageClient />
      <SiteFooter />
    </main>
  );
}
