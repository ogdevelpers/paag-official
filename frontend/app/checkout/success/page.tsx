import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { OrderSuccessClient } from "./success-client";

export default function OrderSuccessPage() {
  return (
    <main className="min-w-0 overflow-x-clip">
      <SiteHeader />
      <OrderSuccessClient />
      <SiteFooter />
    </main>
  );
}
