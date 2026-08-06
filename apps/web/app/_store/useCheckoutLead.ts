"use client";

import { useEffect, useRef } from "react";
import { sendCheckoutLead, type CheckoutLeadIn } from "../_data/checkoutApi";

/*
  ═══════════════════════════════════════════════════════════════════════════
  অসমাপ্ত CHECKOUT — গ্রাহক যা টাইপ করছেন, তা server-এ রেখে দেওয়া।
  DEC-WA-004, DEC-WA-008 (মালিকের সিদ্ধান্ত, ৬ আগস্ট ২০২৬)।

  ⚠️ প্রতিটা keystroke-এ পাঠানো হয় না। মানুষ টাইপ করে থেমে থেমে, আর প্রতিটা
  অক্ষরে একটা request মানে একজন গ্রাহকের জন্য কয়েকশো request — ফ্রি
  সার্ভারে যেটা আত্মহত্যার সমান। তাই দুটো পাহারা:
     · থামার ১.৫ সেকেন্ড পর পাঠানো হয় (debounce)
     · একই লেখা আবার পাঠানো হয় না (`lastSent` মিলিয়ে দেখা)

  ⚠️ পাতা ছেড়ে যাওয়ার মুহূর্তেও একবার পাঠানো হয় — `visibilitychange`, কারণ
  মোবাইলে `beforeunload` প্রায়ই চলে না। ঠিক ওই মুহূর্তের তথ্যটাই সবচেয়ে
  দরকারি: গ্রাহক ঠিক কতদূর গিয়ে থেমেছেন।

  ⚠️ clientKey — ব্রাউজারের নিজের পরিচয়, localStorage-এ। একই মানুষ দশবার
  checkout খুললে দশটা সারি নয়, একটাই। নাহলে একজনকে দশবার বার্তা পাঠানোর
  সুযোগ তৈরি হতো।

  ⚠️ কোনো ব্যর্থতা checkout-কে ছোঁবে না। সব try/catch-এর ভেতরে, উত্তরের
  অপেক্ষা নেই।
  ═══════════════════════════════════════════════════════════════════════════
*/

const KEY = "radian.clientKey";

/** এই ব্রাউজারের স্থায়ী পরিচয় — ব্যক্তিগত কিছু নয়, শুধু একটা এলোমেলো সংখ্যা */
export function clientKey(): string {
  if (typeof window === "undefined") return "";
  try {
    let k = window.localStorage.getItem(KEY);
    if (!k) {
      k =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(KEY, k);
    }
    return k;
  } catch {
    /*  private mode-এ localStorage বন্ধ থাকতে পারে। তখন সারিও তৈরি হবে না —
        একটা সুযোগ হারানো, কিন্তু কিছু ভাঙে না।  */
    return "";
  }
}

export function useCheckoutLead(snapshot: Omit<CheckoutLeadIn, "clientKey"> | null) {
  const lastSent = useRef<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Omit<CheckoutLeadIn, "clientKey"> | null>(null);

  latest.current = snapshot;

  /** পাঠানোর একমাত্র পথ — একই জিনিস দুবার নয় */
  const flush = (s: Omit<CheckoutLeadIn, "clientKey"> | null) => {
    if (!s) return;
    const key = clientKey();
    if (!key) return;
    /*  ⚠️ নাম বা নম্বর কিছুই নেই মানে ফেরানোর কোনো উপায়ও নেই। শুধু
        "কেউ একজন cart খুলেছিল" জেনে লাভ নেই, অথচ সারিটা জমা থাকত।  */
    if (!s.phone?.trim() && !s.name?.trim() && !s.email?.trim()) return;

    const fingerprint = JSON.stringify(s);
    if (fingerprint === lastSent.current) return;
    lastSent.current = fingerprint;
    void sendCheckoutLead({ clientKey: key, ...s });
  };

  // থামার ১.৫ সেকেন্ড পর
  useEffect(() => {
    if (!snapshot) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(snapshot), 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(snapshot)]);

  // পাতা ছেড়ে যাওয়ার মুহূর্তে শেষবার
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush(latest.current);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", () => flush(latest.current));
    return () => {
      document.removeEventListener("visibilitychange", onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
