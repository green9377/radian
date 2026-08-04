"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEMO_OWN_ADDRESS, type OwnAddress } from "../_data/auth";

/*
  Profile-এর editable অংশ — avatar (data-URL) + নিজের address (functional mock)।
  name/phone/email auth store-এ (session), তাই এখানে নয়।

  ⇄ SWAP HERE — Customer module lock হলে avatar upload হবে /me/avatar,
  ownAddress হবে /me।
*/

interface ProfileStore {
  avatar: string | null; // data URL
  ownAddress: OwnAddress | null;
  setAvatar: (dataUrl: string | null) => void;
  setOwnAddress: (a: OwnAddress | null) => void;
}

export const useProfileStore = create<ProfileStore>()(
  persist(
    (set) => ({
      avatar: null,
      ownAddress: DEMO_OWN_ADDRESS,
      setAvatar: (dataUrl) => set({ avatar: dataUrl }),
      setOwnAddress: (a) => set({ ownAddress: a }),
    }),
    {
      name: "radian-profile",
      version: 1,
    },
  ),
);

export function useProfileHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useProfileStore.persist.onFinishHydration(onChange),
    () => useProfileStore.persist.hasHydrated(),
    () => false,
  );
}
