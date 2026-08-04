"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { SEED_REMINDERS, type Reminder } from "../_data/reminders";

/*
  Occasion reminder — add/delete (functional mock, localStorage)।
  ⇄ SWAP HERE — CRM module lock হলে /me/reminders API।
*/

interface ReminderStore {
  reminders: Reminder[];
  add: (r: Omit<Reminder, "id">) => void;
  remove: (id: string) => void;
}

function newId(): string {
  return "rem-" + Math.random().toString(36).slice(2, 9);
}

export const useReminderStore = create<ReminderStore>()(
  persist(
    (set) => ({
      reminders: SEED_REMINDERS,
      add: (r) =>
        set((s) => ({ reminders: [...s.reminders, { ...r, id: newId() }] })),
      remove: (id) =>
        set((s) => ({ reminders: s.reminders.filter((x) => x.id !== id) })),
    }),
    {
      name: "radian-reminders",
      version: 1,
    },
  ),
);

export function useReminderHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useReminderStore.persist.onFinishHydration(onChange),
    () => useReminderStore.persist.hasHydrated(),
    () => false,
  );
}
