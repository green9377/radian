"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Order } from "../_data/order";

/*
  শেষ order-টা ধরে রাখে, যাতে /order-success page দেখাতে পারে।

  ⚠️ কেন store, query param নয়:
  URL-এ পুরো order বসানো যায় না, আর API এখনো নেই — তাই checkout যা
  বানাল, সেটাই localStorage-এ রেখে success page পড়ে নেয়।

  ⇄ SWAP HERE — Ecommerce lock হলে /order-success/[id] server থেকে
  order fetch করবে, এই store-টা তখন শুধু "সদ্য কেনা" flag হয়ে থাকবে।
*/

interface OrderStore {
  last: Order | null;
  place: (order: Order) => void;
  clear: () => void;
}

export const useOrderStore = create<OrderStore>()(
  persist<OrderStore, [], [], Pick<OrderStore, "last">>(
    (set) => ({
      last: null,
      place: (order) => set({ last: order }),
      clear: () => set({ last: null }),
    }),
    {
      name: "radian-last-order",
      version: 1,
      partialize: (s) => ({ last: s.last }),
    },
  ),
);

export function useOrderHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useOrderStore.persist.onFinishHydration(onChange),
    () => useOrderStore.persist.hasHydrated(),
    () => false,
  );
}
