"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Order } from "../_data/order";

/*
  Holds the last order so /order-success can show it.

  Why a store and not a query param: a whole order does not fit in a URL, so
  checkout keeps what it built in localStorage and the success page reads it.

  ⚠️ IT IS NOT THE SUCCESS PAGE'S ONLY SOURCE ANY MORE (27 Aug 2026). This is
  ONE browser's memory of ONE order, and after a gateway payment the customer
  can come back on a device that never held it — or one holding an older order
  entirely, which is exactly what happened on demo. `OrderSuccessView` now
  trusts this store only when its order number matches the `?id=` in the URL,
  and asks the server otherwise. Read the note at the top of that file before
  changing either side.
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
