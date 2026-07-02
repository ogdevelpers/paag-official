import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { CheckoutClient } from "./checkout-page";

export default function CheckoutRoute() {
  return (
    <main className="min-w-0 overflow-x-clip">
      <SiteHeader />
      <CheckoutClient />
      <SiteFooter />
    </main>
  );
}
