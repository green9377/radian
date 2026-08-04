"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Zone = "dhaka" | "bangladesh";

interface ZoneStore {
  zone: Zone | null;
  setZone: (zone: Zone) => void;
}

export const useZoneStore = create<ZoneStore>()(
  persist(
    (set) => ({
      zone: null,
      setZone: (zone) => set({ zone }),
    }),
    {
      name: "radian-zone", // saves to localStorage — next visit won't ask again
    }
  )
);
