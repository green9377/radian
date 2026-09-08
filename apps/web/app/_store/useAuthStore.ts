"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  setSessionExpiredHandler,
  type AccountCustomer,
} from "../_data/accountApi";

/*
  The signed-in customer.

  ⚠️ WHAT CHANGED, 8 Sep 2026. This store used to BE the login: it took a
  phone number and made a customer out of a hand-written constant, so every
  account screen showed the same invented person. Now it holds two things the
  server gave it — a session token and the customer's real record — and every
  screen asks the server for the rest.

  What is kept in localStorage is the TOKEN, not the identity: the browser
  cannot make itself somebody by editing it, because the server checks the
  token against `CustomerSession` on every call. The customer object beside it
  is only so the page can draw a name before `/me` answers.

  A 401 anywhere means the session is over (30 days, logged out elsewhere, or
  the account was deleted). `setSessionExpiredHandler` routes every one of
  those to `signOut()`, so the app can never sit half-signed-in.
*/

interface AuthStore {
  token: string | null;
  customer: AccountCustomer | null;
  signIn: (token: string, customer: AccountCustomer) => void;
  setCustomer: (customer: AccountCustomer) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist<AuthStore, [], [], Pick<AuthStore, "token" | "customer">>(
    (set) => ({
      token: null,
      customer: null,
      signIn: (token, customer) => set({ token, customer }),
      setCustomer: (customer) => set({ customer }),
      signOut: () => set({ token: null, customer: null }),
    }),
    {
      name: "radian-auth",
      version: 2,
      partialize: (s) => ({ token: s.token, customer: s.customer }),
      /*  v1 kept a hand-made customer and no token. Anything from that world
          is not a session, so it is dropped rather than migrated.  */
      migrate: () => ({ token: null, customer: null }),
    },
  ),
);

setSessionExpiredHandler(() => useAuthStore.getState().signOut());

/** has localStorage been read — avoids the SSR/hydration mismatch */
export function useAuthHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useAuthStore.persist.onFinishHydration(onChange),
    () => useAuthStore.persist.hasHydrated(),
    () => false,
  );
}

/** the token, or null — what every account screen needs before it can ask */
export function useToken(): string | null {
  return useAuthStore((s) => s.token);
}
