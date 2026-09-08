"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { customerFromPhone, type Customer } from "../_data/auth";

/*
  The signed-in customer, kept in localStorage.

  The code and the Google sign-in are checked by the server; the session
  itself is still this browser's memory — there is no server-side cookie
  yet. SWAP HERE once the Auth module lands: this store keeps only the
  hydration / UI flag and the customer comes from /me.
*/

interface AuthStore {
  customer: Customer | null;
  /** start the session for a verified phone (name and email when Google supplied them) */
  login: (phone: string, extra?: { name?: string; email?: string }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist<AuthStore, [], [], Pick<AuthStore, "customer">>(
    (set) => ({
      customer: null,
      login: (phone, extra) => set({ customer: customerFromPhone(phone, extra) }),
      logout: () => set({ customer: null }),
    }),
    {
      name: "radian-auth",
      version: 1,
      partialize: (s) => ({ customer: s.customer }),
    },
  ),
);

/** has localStorage been read — avoids the SSR/hydration mismatch */
export function useAuthHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useAuthStore.persist.onFinishHydration(onChange),
    () => useAuthStore.persist.hasHydrated(),
    () => false,
  );
}
