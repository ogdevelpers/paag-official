"use client";

import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import type { CustomerAddress } from "@/lib/domain";

type AddressForm = {
  label: string;
  name: string;
  phone: string;
  city: string;
  address: string;
  isDefault: boolean;
};

const emptyForm = (defaults?: Partial<AddressForm>): AddressForm => ({
  label: defaults?.label || "Home",
  name: defaults?.name || "",
  phone: defaults?.phone || "",
  city: defaults?.city || "",
  address: defaults?.address || "",
  isDefault: defaults?.isDefault ?? false,
});

export function AccountAddresses({
  sessionName,
  sessionPhone,
}: {
  sessionName: string;
  sessionPhone?: string;
}) {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddressForm>(
    emptyForm({ name: sessionName, phone: sessionPhone || "" }),
  );

  async function loadAddresses() {
    setLoading(true);
    try {
      const response = await fetch("/api/account/addresses", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        setAddresses([]);
        return;
      }

      const data = (await response.json()) as { addresses?: CustomerAddress[] };
      setAddresses(data.addresses || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAddresses();
  }, []);

  function resetForm() {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyForm({ name: sessionName, phone: sessionPhone || "" }));
  }

  function startCreate() {
    setEditingId(null);
    setShowForm(true);
    setForm(
      emptyForm({
        name: sessionName,
        phone: sessionPhone || "",
        isDefault: addresses.length === 0,
      }),
    );
    setMessage("");
  }

  function startEdit(address: CustomerAddress) {
    setEditingId(address.id);
    setShowForm(true);
    setForm({
      label: address.label,
      name: address.name,
      phone: address.phone,
      city: address.city,
      address: address.address,
      isDefault: address.isDefault,
    });
    setMessage("");
  }

  async function submitAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    const response = await fetch(
      editingId ? `/api/account/addresses/${editingId}` : "/api/account/addresses",
      {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(form),
      },
    );
    const data = (await response.json()) as { address?: CustomerAddress; error?: string };

    setSubmitting(false);
    if (!response.ok || !data.address) {
      setMessage(data.error || "Unable to save address.");
      return;
    }

    setMessage(editingId ? "Address updated." : "Address saved.");
    resetForm();
    await loadAddresses();
  }

  async function removeAddress(addressId: string) {
    setMessage("");
    const response = await fetch(`/api/account/addresses/${addressId}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      setMessage(data.error || "Unable to delete address.");
      return;
    }

    if (editingId === addressId) {
      resetForm();
    }

    setMessage("Address removed.");
    await loadAddresses();
  }

  async function makeDefault(addressId: string) {
    setMessage("");
    const response = await fetch(`/api/account/addresses/${addressId}/default`, {
      method: "POST",
      credentials: "same-origin",
    });
    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      setMessage(data.error || "Unable to set default address.");
      return;
    }

    setMessage("Default address updated.");
    await loadAddresses();
  }

  return (
    <section className="surface mt-5 p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#241c12] text-[var(--gold)]">
            <MapPin size={20} />
          </span>
          <div>
            <p className="text-sm text-[var(--muted)]">Delivery</p>
            <h2 className="text-2xl font-semibold">Saved addresses</h2>
          </div>
        </div>
        <button className="btn-secondary justify-center" type="button" onClick={startCreate}>
          <Plus size={16} /> Add address
        </button>
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-[var(--muted)]">Loading addresses...</p>
      ) : addresses.length ? (
        <div className="mt-5 grid gap-3">
          {addresses.map((address) => (
            <article className="surface-soft p-4" key={address.id}>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{address.label}</p>
                    {address.isDefault ? (
                      <span className="rounded-full bg-[#2b2112] px-2.5 py-0.5 text-xs font-semibold text-[var(--gold-soft)]">
                        Default
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {address.name} · {address.phone}
                  </p>
                  <p className="mt-2 text-sm leading-6">
                    {address.address}
                    <br />
                    {address.city}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!address.isDefault ? (
                    <button
                      className="btn-secondary px-3 py-2 text-xs"
                      type="button"
                      onClick={() => makeDefault(address.id)}
                    >
                      <Star size={14} /> Set default
                    </button>
                  ) : null}
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => startEdit(address)}
                    aria-label={`Edit ${address.label}`}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button text-[#ffb39d]"
                    type="button"
                    onClick={() => removeAddress(address.id)}
                    aria-label={`Delete ${address.label}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm text-[var(--muted)]">
          No saved addresses yet. Add one for faster checkout.
        </p>
      )}

      {showForm ? (
        <form className="surface-soft mt-5 grid gap-4 p-4" onSubmit={submitAddress}>
          <p className="font-semibold">{editingId ? "Edit address" : "New address"}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              Label
              <input
                className="field"
                value={form.label}
                onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                placeholder="Home, Work, Parents"
                required
              />
            </label>
            <label className="grid gap-2 text-sm">
              Full name
              <input
                className="field"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </label>
            <label className="grid gap-2 text-sm">
              Phone
              <input
                className="field"
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                required
              />
            </label>
            <label className="grid gap-2 text-sm">
              City
              <input
                className="field"
                value={form.city}
                onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                required
              />
            </label>
          </div>
          <label className="grid gap-2 text-sm">
            Address
            <textarea
              className="field min-h-24 p-3"
              value={form.address}
              onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              required
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              checked={form.isDefault}
              type="checkbox"
              onChange={(event) =>
                setForm((current) => ({ ...current, isDefault: event.target.checked }))
              }
            />
            Use as default address
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={submitting} type="submit">
              {submitting ? "Saving..." : editingId ? "Update address" : "Save address"}
            </button>
            <button className="btn-secondary" type="button" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {message ? <p className="mt-4 text-sm text-[var(--gold-soft)]">{message}</p> : null}
    </section>
  );
}
