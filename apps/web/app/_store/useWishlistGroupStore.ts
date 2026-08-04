"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/*
  Wishlist folders — customer-created group। slug → groupId assign।
  wishlist slug useWishlistStore-এ; এখানে শুধু grouping meta।

  ⇄ SWAP HERE — Customer module lock হলে group হবে /wishlist/collections।
*/

export interface WishlistGroup {
  id: string;
  name: string;
}

interface WishlistGroupStore {
  groups: WishlistGroup[];
  /** slug → groupId (না থাকলে ungrouped) */
  assign: Record<string, string>;
  createGroup: (name: string) => void;
  renameGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  assignItem: (slug: string, groupId: string | null) => void;
}

function newId(): string {
  return "grp-" + Math.random().toString(36).slice(2, 9);
}

export const useWishlistGroupStore = create<WishlistGroupStore>()(
  persist(
    (set) => ({
      groups: [],
      assign: {},

      createGroup: (name) =>
        set((s) => ({
          groups: [...s.groups, { id: newId(), name: name.trim() }],
        })),

      renameGroup: (id, name) =>
        set((s) => ({
          groups: s.groups.map((g) => (g.id === id ? { ...g, name: name.trim() } : g)),
        })),

      deleteGroup: (id) =>
        set((s) => {
          const assign = { ...s.assign };
          for (const slug of Object.keys(assign)) {
            if (assign[slug] === id) delete assign[slug];
          }
          return { groups: s.groups.filter((g) => g.id !== id), assign };
        }),

      assignItem: (slug, groupId) =>
        set((s) => {
          const assign = { ...s.assign };
          if (groupId) assign[slug] = groupId;
          else delete assign[slug];
          return { assign };
        }),
    }),
    {
      name: "radian-wishlist-groups",
      version: 1,
    },
  ),
);

export function useWishlistGroupHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useWishlistGroupStore.persist.onFinishHydration(onChange),
    () => useWishlistGroupStore.persist.hasHydrated(),
    () => false,
  );
}
