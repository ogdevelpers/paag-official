"use client";

import {
  AlertCircle,
  Heart,
  LogOut,
  Mail,
  MessageCircle,
  PackageSearch,
  RotateCcw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { currency, formatDate } from "@/lib/domain";
import type { Order, Product } from "@/lib/domain";
import {
  canRetryOnlinePayment,
  completeOnlinePayment,
  getPaymentRetryMinutesLeft,
  isOnlinePaymentMode,
  isOutOfStockPaymentError,
  isWithinPaymentRetryWindow,
  markOrderPaymentFailed,
  orderStatusLabel,
  payMockOrder,
  retryOrderPayment,
  type PaymentInit,
} from "@/lib/payments/order-payment";
import { addProduct } from "../components/cart-store";
import { OnlinePaymentModal } from "../components/online-payment-modal";
import { saveOrderConfirmation } from "../components/order-confirmation-store";
import {
  clearSession,
  fetchSession,
  type ShopperSession,
} from "../components/session-store";
import {
  hydrateWishlistFromServer,
  readWishlist,
  writeWishlist,
} from "../components/wishlist-store";
import { AccountAddresses } from "./account-addresses";

type VerificationChannel = "email" | "sms";

export function AccountClient({ products }: { products: Product[] }) {
  const router = useRouter();
  const [session, setSession] = useState<ShopperSession | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [accountLoading, setAccountLoading] = useState(true);
  const [verificationChannel, setVerificationChannel] = useState<VerificationChannel>("email");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");
  const [devCode, setDevCode] = useState("");
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [orderActionMessage, setOrderActionMessage] = useState("");
  const [paymentAlert, setPaymentAlert] = useState<{
    message: string;
    orderId: string;
    type: "error" | "out_of_stock";
  } | null>(null);
  const [retryLoadingOrderId, setRetryLoadingOrderId] = useState<string | null>(null);
  const [paymentActionLoading, setPaymentActionLoading] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<{
    order: Order;
    payment: PaymentInit;
    mode: string;
  } | null>(null);

  async function loadOrders() {
    const response = await fetch("/api/account/orders", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) {
      setOrders([]);
      return;
    }

    const data = (await response.json()) as { orders?: Order[] };
    setOrders(data.orders || []);
  }

  useEffect(() => {
    function syncSession() {
      setAccountLoading(true);
      void fetchSession().then(async (nextSession) => {
        setSession(nextSession);
        if (!nextSession) {
          setOrders([]);
          setAccountLoading(false);
          return;
        }

        await loadOrders();
        setAccountLoading(false);
      });
    }
    function syncWishlist() {
      setWishlistIds(readWishlist());
    }

    syncSession();
    syncWishlist();
    void hydrateWishlistFromServer().then(() => syncWishlist());
    window.addEventListener("paag-session-change", syncSession);
    window.addEventListener("paag-wishlist-change", syncWishlist);
    window.addEventListener("storage", syncSession);
    window.addEventListener("storage", syncWishlist);
    return () => {
      window.removeEventListener("paag-session-change", syncSession);
      window.removeEventListener("paag-wishlist-change", syncWishlist);
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("storage", syncWishlist);
    };
  }, []);

  const wishlistProducts = wishlistIds
    .map((id) => products.find((product) => product.id === id))
    .filter(Boolean) as Product[];

  function buyAgain(order: Order) {
    order.lines.forEach((line) => {
      const product = products.find((item) => item.id === line.productId);
      if (product) addProduct(product, line.size, line.quantity);
    });
  }

  function finishPaidOrder(order: Order) {
    setPendingPayment(null);
    saveOrderConfirmation(order);
    router.push("/checkout/success");
  }

  async function cancelPendingPayment() {
    if (!pendingPayment) return;

    try {
      await markOrderPaymentFailed(pendingPayment.order.id);
      await loadOrders();
      setOrderActionMessage(`Payment failed for ${pendingPayment.order.id}.`);
    } catch (error) {
      setOrderActionMessage(
        error instanceof Error ? error.message : "Unable to update payment status.",
      );
    } finally {
      setPendingPayment(null);
    }
  }

  async function completeMockPayment() {
    if (!pendingPayment) return;

    setPaymentActionLoading(true);
    setOrderActionMessage("");
    try {
      const order = await payMockOrder(pendingPayment.payment);
      finishPaidOrder(order);
    } catch (error) {
      try {
        await markOrderPaymentFailed(pendingPayment.order.id);
        await loadOrders();
      } catch {
        // Ignore secondary failure.
      }
      setOrderActionMessage(
        error instanceof Error ? error.message : "Payment verification failed.",
      );
      setPendingPayment(null);
    } finally {
      setPaymentActionLoading(false);
    }
  }

  async function retryPayment(order: Order) {
    setRetryLoadingOrderId(order.id);
    setOrderActionMessage("");
    setPaymentAlert(null);
    try {
      const { order: refreshedOrder, payment } = await retryOrderPayment(order.id);

      if (payment.provider === "mock") {
        setPendingPayment({
          order: refreshedOrder,
          payment,
          mode: refreshedOrder.paymentMode,
        });
        await loadOrders();
        return;
      }

      const paid = await completeOnlinePayment({
        order: refreshedOrder,
        payment,
        customerName: refreshedOrder.customerName,
        email: refreshedOrder.email,
        phone: refreshedOrder.phone,
        onDismiss: async () => {
          await markOrderPaymentFailed(refreshedOrder.id);
        },
      });
      finishPaidOrder(paid.order);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to retry payment.";
      const outOfStock = isOutOfStockPaymentError(message);

      if (!outOfStock) {
        try {
          await markOrderPaymentFailed(order.id);
          await loadOrders();
        } catch {
          // Ignore secondary failure.
        }
      }

      if (outOfStock) {
        setPaymentAlert({
          orderId: order.id,
          type: "out_of_stock",
          message:
            "One or more items in this order are no longer available in the selected size. Payment cannot be completed.",
        });
      } else {
        setPaymentAlert({
          orderId: order.id,
          type: "error",
          message,
        });
        setOrderActionMessage(message);
      }
    } finally {
      setRetryLoadingOrderId(null);
    }
  }

  async function requestVerification(channel: VerificationChannel) {
    setVerificationLoading(true);
    setVerificationChannel(channel);
    setVerificationCode("");
    setVerificationMessage("");
    setDevCode("");

    const response = await fetch("/api/account/verification/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ channel }),
    });
    const data = (await response.json()) as {
      destination?: string;
      devCode?: string;
      error?: string;
    };

    setVerificationLoading(false);
    if (!response.ok) {
      setVerificationMessage(data.error || "Unable to send verification code.");
      return;
    }

    setDevCode(data.devCode || "");
    setVerificationMessage(`Code sent to ${data.destination}.`);
  }

  async function confirmVerification() {
    setVerificationLoading(true);
    setVerificationMessage("");

    const response = await fetch("/api/account/verification/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ channel: verificationChannel, code: verificationCode }),
    });
    const data = (await response.json()) as {
      customer?: ShopperSession;
      error?: string;
    };

    setVerificationLoading(false);
    if (!response.ok || !data.customer) {
      setVerificationMessage(data.error || "Unable to verify code.");
      return;
    }

    setSession(data.customer);
    setVerificationCode("");
    setDevCode("");
    setVerificationMessage(`${verificationChannel === "email" ? "Email" : "Phone"} verified.`);
    window.dispatchEvent(new Event("paag-session-change"));
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <p className="eyebrow">My PAAG</p>
      <h1 className="mt-2 font-serif text-5xl font-semibold">Orders and wardrobe</h1>
      <p className="mt-4 max-w-2xl text-[var(--muted)]">
        Track orders, manage returns, save wishlist styles and keep delivery
        details ready for faster checkout.
      </p>

      {session ? (
        <div className="surface mt-6 flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm text-[var(--muted)]">Signed in as</p>
            <p className="mt-1 text-xl font-semibold">{session.name}</p>
            <p className="text-sm text-[var(--muted)]">{session.email}</p>
          </div>
          <button
            className="btn-secondary justify-center"
            type="button"
            onClick={() => {
              void clearSession().then(() => {
                setSession(null);
                setOrders([]);
              });
            }}
          >
            <LogOut size={17} /> Sign Out
          </button>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="btn-primary" href="/sign-in">
            Sign In
          </Link>
          <Link className="btn-secondary" href="/sign-in">
            Create Account
          </Link>
        </div>
      )}

      {session ? (
        <section className="surface mt-5 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#241c12] text-[var(--gold)]">
              <ShieldCheck size={20} />
            </span>
            <div>
              <p className="text-sm text-[var(--muted)]">Identity security</p>
              <h2 className="text-2xl font-semibold">Verify contact details</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="surface-soft p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    <Mail size={17} /> Email
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{session.email}</p>
                </div>
                <span className="rounded-md bg-[#2b2112] px-3 py-1 text-xs font-semibold text-[var(--gold-soft)]">
                  {session.emailVerifiedAt ? "Verified" : "Pending"}
                </span>
              </div>
              {!session.emailVerifiedAt ? (
                <button
                  className="btn-secondary mt-4"
                  disabled={verificationLoading}
                  type="button"
                  onClick={() => requestVerification("email")}
                >
                  Send email code
                </button>
              ) : null}
            </div>
            <div className="surface-soft p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    <MessageCircle size={17} /> Phone
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {session.phone || "No phone number on account"}
                  </p>
                </div>
                <span className="rounded-md bg-[#2b2112] px-3 py-1 text-xs font-semibold text-[var(--gold-soft)]">
                  {session.phoneVerifiedAt ? "Verified" : "Pending"}
                </span>
              </div>
              {!session.phoneVerifiedAt ? (
                <button
                  className="btn-secondary mt-4"
                  disabled={verificationLoading || !session.phone}
                  type="button"
                  onClick={() => requestVerification("sms")}
                >
                  Send SMS code
                </button>
              ) : null}
            </div>
          </div>
          <div className="surface-soft mt-4 grid gap-3 p-4 sm:grid-cols-[150px_1fr_auto]">
            <select
              className="field"
              value={verificationChannel}
              onChange={(event) => setVerificationChannel(event.target.value as VerificationChannel)}
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
            <input
              className="field"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ""))}
            />
            <button
              className="btn-primary justify-center"
              disabled={verificationLoading || verificationCode.length !== 6}
              type="button"
              onClick={confirmVerification}
            >
              Verify
            </button>
          </div>
          {verificationMessage ? (
            <p className="mt-3 text-sm text-[var(--gold-soft)]">{verificationMessage}</p>
          ) : null}
          {devCode ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Dev code: <span className="font-semibold text-[var(--gold-soft)]">{devCode}</span>
            </p>
          ) : null}
        </section>
      ) : null}

      {session ? (
        <AccountAddresses sessionName={session.name} sessionPhone={session.phone} />
      ) : null}

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Track orders", "Check packing, shipped and delivered states.", PackageSearch],
          ["Wishlist", "Save styles and move them to bag later.", Heart],
          ["Returns", "Start a 7-day exchange or return request.", RotateCcw],
          ["Refunds", "View pending and completed refund updates.", WalletCards],
        ].map(([title, text, Icon]) => (
          <article
            className="surface-soft p-5"
            key={title as string}
          >
            <Icon className="text-[var(--gold)]" size={22} />
            <h2 className="mt-5 text-xl font-semibold">{title as string}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{text as string}</p>
          </article>
        ))}
      </div>

      <section className="surface mt-10 p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Wishlist</p>
            <h2 className="mt-2 text-3xl font-semibold">Saved styles</h2>
          </div>
          <Link className="btn-secondary" href="/wishlist">
            View wishlist
          </Link>
        </div>
        {wishlistProducts.length ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {wishlistProducts.slice(0, 3).map((product) => (
              <article
                className="surface-soft grid grid-cols-[72px_1fr] gap-3 p-3"
                key={product.id}
              >
                <img
                  alt={product.name}
                  className="h-24 w-full rounded-md object-cover"
                  src={product.images[0]}
                />
                <div>
                  <Link className="font-semibold" href={`/product/${product.slug}`}>
                    {product.name}
                  </Link>
                  <p className="mt-1 text-sm text-[var(--muted)]">{currency.format(product.price)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="btn-primary px-3 py-2"
                      type="button"
                      onClick={() => addProduct(product, product.sizes[0])}
                    >
                      Add to bag
                    </button>
                    <button
                      className="btn-secondary px-3 py-2"
                      type="button"
                      onClick={() => writeWishlist(wishlistIds.filter((id) => id !== product.id))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="surface-soft mt-5 p-4 text-sm text-[var(--muted)]">
            Save items with the heart icon and they will appear here.
          </p>
        )}
      </section>

      <section className="surface mt-10 p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Order tracking</p>
            <h2 className="mt-2 text-3xl font-semibold">Your orders</h2>
          </div>
          {!session ? (
            <Link className="btn-primary" href="/sign-in">
              Sign In to Track
            </Link>
          ) : null}
        </div>

        {!session ? (
          <p className="surface-soft mt-5 p-4 text-sm text-[var(--muted)]">
            Sign in with the same email used at checkout to see order status and
            item details.
          </p>
        ) : accountLoading ? (
          <p className="surface-soft mt-5 p-4 text-sm text-[var(--muted)]">
            Loading your order history...
          </p>
        ) : orders.length ? (
          <div className="mt-5 grid gap-4">
            {paymentAlert?.type === "out_of_stock" ? (
              <div
                className="rounded-lg border border-[#7a3434] bg-[#3b1717] p-4 text-[#ffb39d]"
                role="alert"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 shrink-0" size={20} />
                  <div>
                    <p className="text-base font-semibold text-white">Out of stock</p>
                    <p className="mt-1 text-sm leading-6">{paymentAlert.message}</p>
                    <p className="mt-2 text-sm text-[#ffb39d]/90">
                      Order <span className="font-semibold">{paymentAlert.orderId}</span> could not
                      be repaid. Try again from the shop if items are restocked.
                    </p>
                  </div>
                </div>
              </div>
            ) : paymentAlert ? (
              <p className="surface-soft flex items-start gap-2 p-4 text-sm text-[#ffb39d]" role="alert">
                <AlertCircle className="mt-0.5 shrink-0" size={18} />
                {paymentAlert.message}
              </p>
            ) : orderActionMessage ? (
              <p className="surface-soft p-4 text-sm text-[var(--gold-soft)]">{orderActionMessage}</p>
            ) : null}
            {orders.map((order) => {
              const statusLabel = orderStatusLabel(order);
              const failed = statusLabel === "Failed";
              const retryAllowed = canRetryOnlinePayment(order);
              const retryMinutesLeft = getPaymentRetryMinutesLeft(order);
              const retryExpired =
                isOnlinePaymentMode(order.paymentMode) &&
                order.paymentStatus !== "paid" &&
                (order.paymentStatus === "failed" || order.paymentStatus === "pending") &&
                !isWithinPaymentRetryWindow(order);

              return (
              <article
                className="surface-soft p-4"
                key={order.id}
              >
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-lg font-semibold">{order.id}</p>
                    <p className="text-sm text-[var(--muted)]">
                      Placed {formatDate(order.createdAt)} · {order.city}
                    </p>
                  </div>
                  <span
                    className={`w-fit rounded-md px-3 py-2 text-sm font-semibold ${
                      failed
                        ? "bg-[#3b1717] text-[#ffb39d]"
                        : "bg-[#2b2112] text-[var(--gold-soft)]"
                    }`}
                  >
                    {statusLabel}
                  </span>
                </div>
                <div className="mt-4 grid gap-3">
                  {order.lines.map((line) => (
                    <div
                      className="grid grid-cols-[52px_1fr_auto] gap-3 text-sm"
                      key={`${order.id}-${line.productId}-${line.size}`}
                    >
                      <img
                        alt={line.name}
                        className="h-14 w-12 rounded-md object-cover"
                        src={line.image}
                      />
                      <div>
                        <p className="font-semibold">{line.name}</p>
                        <p className="text-xs text-[var(--muted)]">
                          Size {line.size} · Qty {line.quantity}
                        </p>
                      </div>
                      <p className="font-semibold">
                        {currency.format(line.price * line.quantity)}
                      </p>
                    </div>
                  ))}
                </div>
                {paymentAlert?.orderId === order.id && paymentAlert.type === "out_of_stock" ? (
                  <div
                    className="mt-4 rounded-lg border border-[#7a3434] bg-[#3b1717]/90 p-4 text-[#ffb39d]"
                    role="alert"
                  >
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 shrink-0" size={18} />
                      <div>
                        <p className="font-semibold text-white">Out of stock</p>
                        <p className="mt-1 text-sm leading-6">
                          These items are unavailable right now, so retry payment cannot continue.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-col justify-between gap-2 border-t border-[var(--line)] pt-4 text-sm sm:flex-row">
                  <div className="text-[var(--muted)]">
                    <p>
                      Delivery: {order.address || "Address saved at checkout"} · Payment:{" "}
                      {order.paymentStatus}
                    </p>
                    {retryAllowed ? (
                      <p className="mt-1 text-[var(--gold-soft)]">
                        Retry payment within {retryMinutesLeft} min
                      </p>
                    ) : null}
                    {retryExpired ? (
                      <p className="mt-1 text-[#ffb39d]">
                        Payment retry window expired (30 minutes).
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {order.discount ? (
                      <span className="text-[var(--gold-soft)]">
                        Saved {currency.format(order.discount)}
                      </span>
                    ) : null}
                    <p className="font-semibold">{currency.format(order.total)}</p>
                    {retryAllowed ? (
                      <button
                        className="btn-primary px-3 py-2"
                        disabled={retryLoadingOrderId === order.id || Boolean(pendingPayment)}
                        type="button"
                        onClick={() => void retryPayment(order)}
                      >
                        {retryLoadingOrderId === order.id ? "Checking..." : "Retry payment"}
                      </button>
                    ) : null}
                    <button className="btn-secondary px-3 py-2" type="button" onClick={() => buyAgain(order)}>
                      Buy again
                    </button>
                  </div>
                </div>
              </article>
            );
            })}
          </div>
        ) : (
          <p className="surface-soft mt-5 p-4 text-sm text-[var(--muted)]">
            No orders found for {session.email}. Place an order with this email
            and it will appear here.
          </p>
        )}
      </section>

      {pendingPayment ? (
        <OnlinePaymentModal
          loading={paymentActionLoading}
          mode={pendingPayment.mode}
          order={pendingPayment.order}
          payment={pendingPayment.payment}
          onCancel={() => void cancelPendingPayment()}
          onPay={() => void completeMockPayment()}
        />
      ) : null}
    </section>
  );
}
