"use client";

import { useEffect, useRef } from "react";
import { sendCheckoutLead, type CheckoutLeadIn } from "../_data/checkoutApi";

/*
  Reports what the customer has typed at checkout, so an unfinished order can
  be followed up.

  Not on every keystroke: 1.5s after they stop, skipped if the same snapshot
  was already sent, and once more when the page is hidden — that last moment is
  the one worth having. clientKey lives in localStorage so one person is one
  row, not ten. Nothing here can break checkout.
*/

const KEY = "radian.clientKey";

/** A random id for this browser. Nothing personal. */
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
    /* private mode blocks localStorage — no lead, but nothing breaks */
    return "";
  }
}

export function useCheckoutLead(snapshot: Omit<CheckoutLeadIn, "clientKey"> | null) {
  const lastSent = useRef<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Omit<CheckoutLeadIn, "clientKey"> | null>(null);

  latest.current = snapshot;

  /** The one send path; never the same snapshot twice. */
  const flush = (s: Omit<CheckoutLeadIn, "clientKey"> | null) => {
    if (!s) return;
    const key = clientKey();
    if (!key) return;
    // No name or number means no way back to them, so there is nothing to store.
    if (!s.phone?.trim() && !s.name?.trim() && !s.email?.trim()) return;

    const fingerprint = JSON.stringify(s);
    if (fingerprint === lastSent.current) return;
    lastSent.current = fingerprint;
    void sendCheckoutLead({ clientKey: key, ...s });
  };

  // 1.5s after they stop typing
  useEffect(() => {
    if (!snapshot) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(snapshot), 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(snapshot)]);

  // One last send as the page goes away
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
