"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { customerFromPhone, type Customer } from "../_data/auth";

/*
  Mock auth session — logged-in customer localStorage-এ ধরে রাখে।

  ⚠️ কোনো নিরাপত্তা নেই — শুধু frontend flow। token/cookie নেই,
     কারণ backend নেই।

  ⇄ SWAP HERE — Auth module lock হলে session server-side cookie হবে;
     এই store শুধু hydration/UI flag ধরে রাখবে, customer আসবে /me থেকে।
*/

interface AuthStore {
  customer: Customer | null;
  /** verified phone দিয়ে session শুরু */
  login: (phone: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist<AuthStore, [], [], Pick<AuthStore, "customer">>(
    (set) => ({
      customer: null,
      login: (phone) => set({ customer: customerFromPhone(phone) }),
      logout: () => set({ customer: null }),
    }),
    {
      name: "radian-auth",
      version: 1,
      partialize: (s) => ({ customer: s.customer }),
    },
  ),
);

/** SSR/hydration mismatch এড়াতে — localStorage পড়া শেষ কিনা */
export function useAuthHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useAuthStore.persist.onFinishHydration(onChange),
    () => useAuthStore.persist.hasHydrated(),
    () => false,
  );
}
