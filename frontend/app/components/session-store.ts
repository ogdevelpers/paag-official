"use client";

export type ShopperSession = {
  id: string;
  email: string;
  name: string;
  phone?: string;
  emailVerifiedAt?: string;
  phoneVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
};

let serverSyncEnabled = false;

export function isServerSyncEnabled() {
  return serverSyncEnabled;
}

export function setServerSyncEnabled(enabled: boolean) {
  serverSyncEnabled = enabled;
}

export async function fetchSession(): Promise<ShopperSession | null> {
  const response = await fetch("/api/account/session", {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    authenticated?: boolean;
    customer?: ShopperSession;
  };

  const session = data.authenticated && data.customer ? data.customer : null;
  setServerSyncEnabled(Boolean(session));
  return session;
}

export async function clearSession() {
  await fetch("/api/account/session", {
    method: "DELETE",
    credentials: "same-origin",
  });
  setServerSyncEnabled(false);
  window.dispatchEvent(new Event("paag-session-change"));
}
