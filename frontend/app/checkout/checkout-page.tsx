"use client";

import { AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { currency } from "@/lib/domain";
import { applyPromotion, promotions } from "@/lib/domain";
import type { CartLine, CustomerAddress, Order } from "@/lib/domain";
import {
  completeOnlinePayment,
  markOrderPaymentFailed,
  payMockOrder,
  type PaymentInit,
} from "@/lib/payments/order-payment";
import { OnlinePaymentModal } from "../components/online-payment-modal";
import { clearCart, hydrateCartFromServer, readCart } from "../components/cart-store";
import { saveOrderConfirmation } from "../components/order-confirmation-store";
import { fetchSession, type ShopperSession } from "../components/session-store";

export function CheckoutClient() {
  const router = useRouter();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [mounted, setMounted] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  const [session, setSession] = useState<ShopperSession | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [selectedPaymentMode, setSelectedPaymentMode] = useState("Cash on Delivery");
  const [pendingPayment, setPendingPayment] = useState<{
    order: Order;
    payment: PaymentInit;
    mode: string;
  } | null>(null);
  const [paymentActionLoading, setPaymentActionLoading] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [addressesLoaded, setAddressesLoaded] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<"new" | string>("new");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [saveAddress, setSaveAddress] = useState(false);
  const [addressLabel, setAddressLabel] = useState("Home");

  useEffect(() => {
    function syncCart() {
      setLines(readCart());
      setMounted(true);
    }

    function hydrateCart() {
      void fetchSession()
        .then(() => hydrateCartFromServer())
        .then(() => syncCart());
    }

    syncCart();
    hydrateCart();
    window.addEventListener("paag-cart-change", syncCart);
    window.addEventListener("paag-session-change", hydrateCart);
    window.addEventListener("storage", syncCart);
    return () => {
      window.removeEventListener("paag-cart-change", syncCart);
      window.removeEventListener("paag-session-change", hydrateCart);
      window.removeEventListener("storage", syncCart);
    };
  }, []);

  useEffect(() => {
    void fetchSession()
      .then(setSession)
      .finally(() => setSessionLoaded(true));

    function refreshSession() {
      void fetchSession()
        .then(setSession)
        .then(() => hydrateCartFromServer())
        .then(() => setLines(readCart()));
    }

    window.addEventListener("paag-session-change", refreshSession);
    return () => window.removeEventListener("paag-session-change", refreshSession);
  }, []);

  useEffect(() => {
    if (!session) {
      setSavedAddresses([]);
      setAddressesLoaded(true);
      setSelectedAddressId("new");
      setCustomerName("");
      setPhone("");
      setEmail("");
      setCity("");
      setAddress("");
      setSaveAddress(false);
      return;
    }

    setCustomerName(session.name);
    setPhone(session.phone || "");
    setEmail(session.email);
    setAddressesLoaded(false);

    void fetch("/api/account/addresses", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((response) => (response.ok ? response.json() : { addresses: [] }))
      .then((data: { addresses?: CustomerAddress[] }) => {
        const addresses = data.addresses || [];
        setSavedAddresses(addresses);
        const preferred = addresses.find((item) => item.isDefault) || addresses[0];
        if (preferred) {
          setSelectedAddressId(preferred.id);
          setCustomerName(preferred.name);
          setPhone(preferred.phone);
          setCity(preferred.city);
          setAddress(preferred.address);
          setAddressLabel(preferred.label);
          setSaveAddress(false);
          return;
        }

        setSelectedAddressId("new");
        setCity("");
        setAddress("");
      })
      .finally(() => setAddressesLoaded(true));
  }, [session?.id, session?.email, session?.name, session?.phone]);

  function selectSavedAddress(addressId: string) {
    const saved = savedAddresses.find((item) => item.id === addressId);
    if (!saved) return;

    setSelectedAddressId(addressId);
    setCustomerName(saved.name);
    setPhone(saved.phone);
    setCity(saved.city);
    setAddress(saved.address);
    setAddressLabel(saved.label);
    setSaveAddress(false);
  }

  function selectNewAddress() {
    setSelectedAddressId("new");
    setCustomerName(session?.name || "");
    setPhone(session?.phone || "");
    setCity("");
    setAddress("");
    setSaveAddress(false);
    setAddressLabel("Home");
  }

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
    [lines],
  );
  const delivery = subtotal >= 5000 || subtotal === 0 ? 0 : 149;
  const promotion = useMemo(() => applyPromotion(subtotal, couponCode), [couponCode, subtotal]);
  const total = Math.max(0, subtotal + delivery - promotion.discount);

  function applyCoupon() {
    const nextCode = couponInput.trim().toUpperCase();
    const nextPromotion = applyPromotion(subtotal, nextCode);
    setCouponCode(nextPromotion.error ? "" : nextCode);
    setCouponMessage(nextPromotion.error || `${nextCode} applied.`);
  }

  async function failPendingPayment(orderId: string) {
    try {
      await markOrderPaymentFailed(orderId);
    } catch {
      // Best effort — order may already be marked failed server-side.
    }
  }

  async function cancelPendingPayment() {
    if (!pendingPayment) return;

    await failPendingPayment(pendingPayment.order.id);
    setPendingPayment(null);
    showError(
      `Payment failed for ${pendingPayment.order.id}. You can retry payment from your account orders.`,
    );
  }

  function finish(order: Order) {
    clearCart();
    setLines([]);
    setPendingPayment(null);
    saveOrderConfirmation(order);
    router.push("/checkout/success");
  }

  function showError(text: string) {
    setMessageTone("error");
    setMessage(text);
  }

  async function completeMockPayment() {
    if (!pendingPayment) return;

    setPaymentActionLoading(true);
    setMessage("");
    try {
      const order = await payMockOrder(pendingPayment.payment);
      finish(order);
    } catch (error) {
      await failPendingPayment(pendingPayment.order.id);
      showError(
        error instanceof Error
          ? `${error.message} Retry from your account orders.`
          : "Payment verification failed. Retry from your account orders.",
      );
    } finally {
      setPaymentActionLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const formElement = event.currentTarget;
    if (selectedAddressId === "new") {
      if (!formElement.checkValidity()) {
        formElement.reportValidity();
        return;
      }
    }

    if (!lines.length) {
      showError("Your bag is empty. Add items before checkout.");
      return;
    }

    if (!session) {
      router.push("/sign-in?next=/checkout");
      return;
    }

    setLoading(true);

    try {
      const validateResponse = await fetch("/api/orders/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ lines }),
      });
      const validateData = (await validateResponse.json()) as { ok?: boolean; error?: string };

      if (!validateData.ok) {
        showError(validateData.error || "Some items in your bag are out of stock.");
        return;
      }
    } catch {
      showError("Unable to verify stock availability. Try again.");
      return;
    } finally {
      setLoading(false);
    }

    setLoading(true);

    const paymentMode = selectedPaymentMode;
    const payload =
      selectedAddressId !== "new"
        ? {
            addressId: selectedAddressId,
            email,
            paymentMode,
            couponCode,
            lines,
          }
        : {
            customerName,
            email,
            phone,
            address,
            city,
            saveAddress,
            addressLabel: saveAddress ? addressLabel : undefined,
            paymentMode,
            couponCode,
            lines,
          };

    try {
      if (paymentMode === "Cash on Delivery") {
        const response = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        });
        const data = (await response.json()) as { order?: Order; error?: string };

        if (!response.ok || !data.order) {
          showError(data.error || "Unable to place order.");
          return;
        }

        finish(data.order);
        return;
      }

      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        order?: Order;
        payment?: PaymentInit;
        error?: string;
      };

      if (!response.ok || !data.order || !data.payment) {
        showError(data.error || "Unable to initialize payment.");
        return;
      }

      if (data.payment.provider === "mock") {
        setPendingPayment({
          order: data.order,
          payment: data.payment,
          mode: paymentMode,
        });
        setMessageTone("success");
        setMessage("Payment is pending. Complete the payment step to confirm the order.");
        return;
      }

      try {
        const paid = await completeOnlinePayment({
          order: data.order,
          payment: data.payment,
          customerName,
          email: email || session?.email || "",
          phone,
          onDismiss: async () => {
            await failPendingPayment(data.order!.id);
          },
        });
        finish(paid.order);
      } catch (error) {
        await failPendingPayment(data.order.id);
        showError(
          error instanceof Error
            ? `${error.message} Retry from your account orders.`
            : "Payment failed. Retry from your account orders.",
        );
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to complete checkout.");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = mounted && lines.length > 0 && sessionLoaded && !loading;

  return (
    <section className="mx-auto grid min-w-0 max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:px-8">
      <div className="surface p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#241c12] text-[var(--gold)]">
            <ShieldCheck size={20} />
          </span>
          <div>
            <p className="text-sm text-[var(--muted)]">Secure checkout</p>
            <h1 className="text-3xl font-semibold">Delivery details</h1>
          </div>
        </div>
        {sessionLoaded && !session ? (
          <div className="surface-soft mt-5 flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-semibold">Sign in to continue checkout</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                PAAG orders are linked to your account for tracking and support.
              </p>
            </div>
            <Link className="btn-primary justify-center" href="/sign-in?next=/checkout">
              Sign In
            </Link>
          </div>
        ) : null}
        <form className="mt-6 grid gap-4 sm:grid-cols-2" key={session?.id || "guest"} onSubmit={submit}>
          {session && addressesLoaded && savedAddresses.length ? (
            <div className="grid gap-3 sm:col-span-2">
              <p className="text-sm font-semibold">Saved addresses</p>
              <div className="grid gap-2">
                {savedAddresses.map((saved) => (
                  <label
                    className={`surface-soft cursor-pointer p-4 ${
                      selectedAddressId === saved.id ? "ring-2 ring-[var(--gold)]/30" : ""
                    }`}
                    key={saved.id}
                  >
                    <input
                      checked={selectedAddressId === saved.id}
                      className="sr-only"
                      name="savedAddress"
                      type="radio"
                      onChange={() => selectSavedAddress(saved.id)}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{saved.label}</p>
                      {saved.isDefault ? (
                        <span className="rounded-full bg-[#2b2112] px-2.5 py-0.5 text-xs font-semibold text-[var(--gold-soft)]">
                          Default
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {saved.name} · {saved.phone}
                    </p>
                    <p className="mt-2 text-sm leading-6">
                      {saved.address}, {saved.city}
                    </p>
                  </label>
                ))}
                <label
                  className={`surface-soft cursor-pointer p-4 ${
                    selectedAddressId === "new" ? "ring-2 ring-[var(--gold)]/30" : ""
                  }`}
                >
                  <input
                    checked={selectedAddressId === "new"}
                    className="sr-only"
                    name="savedAddress"
                    type="radio"
                    onChange={selectNewAddress}
                  />
                  <p className="font-semibold">Deliver to a new address</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Enter delivery details manually for this order.
                  </p>
                </label>
              </div>
            </div>
          ) : null}
          <label className="grid gap-2 text-sm">
            Full name
            <input
              className="field"
              name="customerName"
              readOnly={selectedAddressId !== "new"}
              required={selectedAddressId === "new"}
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm">
            Phone
            <input
              className="field"
              name="phone"
              readOnly={selectedAddressId !== "new"}
              required={selectedAddressId === "new"}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm">
            Email
            <input
              className="field"
              name="email"
              readOnly={Boolean(session)}
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm">
            City
            <input
              className="field"
              name="city"
              placeholder="Delhi"
              readOnly={selectedAddressId !== "new"}
              required={selectedAddressId === "new"}
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm sm:col-span-2">
            Address
            <textarea
              className="field min-h-24 p-3"
              name="address"
              placeholder="House / street / landmark"
              readOnly={selectedAddressId !== "new"}
              required={selectedAddressId === "new"}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </label>
          {selectedAddressId === "new" ? (
            <div className="grid gap-3 sm:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  checked={saveAddress}
                  type="checkbox"
                  onChange={(event) => setSaveAddress(event.target.checked)}
                />
                Save this address for future orders
              </label>
              {saveAddress ? (
                <label className="grid gap-2 text-sm">
                  Address label
                  <input
                    className="field"
                    placeholder="Home, Work, Parents"
                    value={addressLabel}
                    onChange={(event) => setAddressLabel(event.target.value)}
                  />
                </label>
              ) : null}
            </div>
          ) : null}
          <label className="grid gap-2 text-sm sm:col-span-2">
            Payment
            <select
              className="field"
              name="paymentMode"
              value={selectedPaymentMode}
              onChange={(event) => setSelectedPaymentMode(event.target.value)}
            >
              <option>Cash on Delivery</option>
              <option>UPI</option>
              <option>Card</option>
            </select>
          </label>
          {!sessionLoaded ? (
            <p className="text-sm text-[var(--muted)] sm:col-span-2">Loading your account...</p>
          ) : !session ? (
            <p className="text-sm text-[var(--muted)] sm:col-span-2">
              Sign in is required. You&apos;ll be redirected to sign in when you continue.
            </p>
          ) : !lines.length ? (
            <p className="text-sm text-[var(--muted)] sm:col-span-2">
              Your bag is empty.{" "}
              <Link className="text-[var(--gold-soft)]" href="/shop">
                Continue shopping
              </Link>
            </p>
          ) : null}
            <button
              className="btn-primary justify-center sm:col-span-2"
              disabled={!canSubmit}
              type="submit"
            >
            {loading
              ? selectedPaymentMode === "Cash on Delivery"
                ? "Placing order..."
                : "Opening payment..."
              : !session
                ? "Sign in to continue"
              : selectedPaymentMode === "Cash on Delivery"
                ? "Place order"
                : "Proceed to payment"}
          </button>
        </form>
        {message ? (
          <p
            className={`surface-soft mt-5 flex items-center gap-2 p-3 text-sm ${
              messageTone === "error" ? "text-[#ffb39d]" : "text-[var(--gold-soft)]"
            }`}
          >
            {messageTone === "error" ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}{" "}
            {message}
          </p>
        ) : null}
      </div>

      <aside className="surface h-fit p-5 lg:sticky lg:top-28">
        <h2 className="text-2xl font-semibold">Order summary</h2>
        <div className="mt-5 grid gap-4">
          {mounted && lines.length ? (
            lines.map((line) => (
              <div className="grid grid-cols-[60px_1fr_auto] gap-3" key={`${line.productId}-${line.size}`}>
                <img alt={line.name} className="h-16 w-14 rounded-md object-cover" src={line.image} />
                <div>
                  <p className="text-sm font-semibold">{line.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {line.size} x {line.quantity}
                  </p>
                </div>
                <p className="text-sm font-semibold">
                  {currency.format(line.price * line.quantity)}
                </p>
              </div>
            ))
          ) : mounted ? (
            <p className="surface-soft p-4 text-sm text-[var(--muted)]">
              Your bag is empty. <Link className="text-[var(--gold-soft)]" href="/shop">Shop now</Link>
            </p>
          ) : (
            <p className="surface-soft p-4 text-sm text-[var(--muted)]">
              Loading order summary...
            </p>
          )}
        </div>
        <div className="mt-6 space-y-3 border-t border-[var(--line)] pt-5 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Subtotal</span>
            <span>{currency.format(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Delivery</span>
            <span>{delivery ? currency.format(delivery) : "Free"}</span>
          </div>
          {promotion.discount ? (
            <div className="flex justify-between text-[var(--gold-soft)]">
              <span>Coupon {promotion.couponCode}</span>
              <span>-{currency.format(promotion.discount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-lg font-semibold">
            <span>Total</span>
            <span>{currency.format(total)}</span>
          </div>
        </div>
        <div className="surface-soft mt-5 p-4">
          <p className="text-sm font-semibold">Apply coupon</p>
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <input
              className="field"
              placeholder="PAAG10"
              value={couponInput}
              onChange={(event) => setCouponInput(event.target.value)}
            />
            <button className="btn-secondary px-3" type="button" onClick={applyCoupon}>
              Apply
            </button>
          </div>
          {couponMessage ? (
            <p className="mt-2 text-xs text-[var(--gold-soft)]">{couponMessage}</p>
          ) : (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Try {promotions.map((item) => item.code).join(" or ")}.
            </p>
          )}
        </div>
      </aside>

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
