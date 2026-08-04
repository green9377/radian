"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { SEED_DELIVERY_ADDRESSES, type Address } from "../_data/auth";

/*
  Delivery/recipient address — add/edit/delete/default (functional mock)।
  seed = SEED_DELIVERY_ADDRESSES; এরপর customer-এর বদল localStorage-এ থাকে।

  ⇄ SWAP HERE — Customer module lock হলে CRUD হবে /addresses API।
*/

interface AddressStore {
  addresses: Address[];
  add: (a: Omit<Address, "id">) => void;
  update: (id: string, patch: Partial<Omit<Address, "id">>) => void;
  remove: (id: string) => void;
  setDefault: (id: string) => void;
}

function newId(): string {
  return "addr-" + Math.random().toString(36).slice(2, 9);
}

export const useAddressStore = create<AddressStore>()(
  persist(
    (set) => ({
      addresses: SEED_DELIVERY_ADDRESSES,

      add: (a) =>
        set((s) => {
          const addr: Address = { ...a, id: newId() };
          const list = addr.isDefault
            ? s.addresses.map((x) => ({ ...x, isDefault: false }))
            : s.addresses.slice();
          // প্রথম address হলে সেটাই default
          if (list.length === 0) addr.isDefault = true;
          return { addresses: [...list, addr] };
        }),

      update: (id, patch) =>
        set((s) => ({
          addresses: s.addresses.map((x) =>
            x.id === id ? { ...x, ...patch } : patch.isDefault ? { ...x, isDefault: false } : x,
          ),
        })),

      remove: (id) =>
        set((s) => {
          const left = s.addresses.filter((x) => x.id !== id);
          // default মুছে গেলে প্রথমটাকে default
          if (left.length && !left.some((x) => x.isDefault)) {
            left[0] = { ...left[0], isDefault: true };
          }
          return { addresses: left };
        }),

      setDefault: (id) =>
        set((s) => ({
          addresses: s.addresses.map((x) => ({ ...x, isDefault: x.id === id })),
        })),
    }),
    {
      name: "radian-addresses",
      version: 1,
    },
  ),
);

export function useAddressHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useAddressStore.persist.onFinishHydration(onChange),
    () => useAddressStore.persist.hasHydrated(),
    () => false,
  );
}
