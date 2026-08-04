"use client";

import { create } from "zustand";
import type { Occasion, Recipient } from "../_data/products";

/*
  Gift Finder — category page-এর filter engine।
  Filter toolbar আমরা ইচ্ছে করেই বাদ দিয়েছি (approved board decision);
  dropdown-এর বদলে Gift Finder সেই কাজটাই করে, কিন্তু মানুষের ভাষায়।

  Result সেট হলে CategoryProductGrid নিজে থেকেই filter হয়ে যায়।
  Persist করা হয়নি — এটা একটা session-এর সিদ্ধান্ত, মনে রাখার জিনিস নয়।
*/

export interface GiftFinderResult {
  recipient: Recipient;
  occasion: Occasion;
  /** paisa — Constitution: money always integer paisa */
  minPaisa: number;
  maxPaisa: number;
  budgetLabel: string;
}

interface GiftFinderStore {
  open: boolean;
  /** প্রতিবার খোলার সময় বাড়ে — modal-এর React key, তাই wizard সবসময় step 1 থেকে fresh শুরু হয় */
  openCount: number;
  result: GiftFinderResult | null;
  openFinder: () => void;
  closeFinder: () => void;
  setResult: (result: GiftFinderResult) => void;
  clearResult: () => void;
}

export const useGiftFinderStore = create<GiftFinderStore>((set) => ({
  open: false,
  openCount: 0,
  result: null,
  openFinder: () => set((s) => ({ open: true, openCount: s.openCount + 1 })),
  closeFinder: () => set({ open: false }),
  setResult: (result) => set({ result, open: false }),
  clearResult: () => set({ result: null }),
}));
