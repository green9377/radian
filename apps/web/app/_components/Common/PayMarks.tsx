"use client";

import { useEffect, useState } from "react";
import { getShopFooter, type ShopFooter } from "../../_data/shop";

/*
  The row of payment marks — ONE shape, drawn in three places (owner, 9 Sep
  2026: the marks on /pay looked right, so the checkout's Place Order and the
  footer take the same row and lose their own).

  ⚠️ THE MARKS COME FROM THE ADMIN (Storefront -> Footer), not from this file.
  The day a wallet is added or dropped it changes everywhere at once, and no
  screen claims a method the shop no longer takes. The fallback list below is
  only for the moment before the admin answers.
*/

export interface PayMarkItem {
  label: string;
  imageUrl: string | null;
}

const FALLBACK: PayMarkItem[] = ["bKash", "Nagad", "Rocket", "VISA", "Mastercard", "COD"].map(
  (label) => ({ label, imageUrl: null }),
);

/*  Each wallet's own colour, because a row of identical grey chips reads as
    decoration rather than as "these are the ways you can pay".  */
const MARK_COLOUR: Record<string, string> = {
  bkash: "#E2136E",
  nagad: "#EC1C24",
  rocket: "#8C3494",
  visa: "#1A1F71",
  mastercard: "#EB001B",
  upay: "#00A651",
  cellfin: "#0E7A3D",
  cod: "#0E7A3D",
};

const isCod = (label: string) => /^(cod|cash on delivery)$/i.test(label.trim());

/** The admin's badge list, with the fallback until it answers. */
export function usePayMarks(enabled = true): PayMarkItem[] {
  const [marks, setMarks] = useState<PayMarkItem[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let stale = false;
    getShopFooter().then((f: ShopFooter | null) => {
      if (!stale && f?.badges?.length) setMarks(f.badges);
    });
    return () => {
      stale = true;
    };
  }, [enabled]);
  return marks ?? FALLBACK;
}

export function PayMark({
  label,
  url,
  tone = "light",
}: {
  label: string;
  url: string | null;
  tone?: "light" | "dark";
}) {
  const border = tone === "dark" ? "border-white/25" : "border-lavender-deep";
  if (url) {
    return (
      <span
        className={`inline-flex h-[27px] items-center rounded-[9px] border-[1.5px] ${border} bg-white px-2.5`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className="h-[15px] w-auto object-contain" />
      </span>
    );
  }
  const colour = MARK_COLOUR[label.toLowerCase().replace(/\s+/g, "")] ?? "#3a2547";
  return (
    <span
      className={`inline-flex h-[27px] items-center rounded-[9px] border-[1.5px] ${border} bg-white px-[11px] text-[11.5px] font-extrabold`}
      style={{ color: colour }}
    >
      {label}
    </span>
  );
}

export default function PayMarks({
  marks,
  tone = "light",
  align = "center",
  hideCod = false,
  className = "",
}: {
  /** pass the admin's list when the page already has it; otherwise it is fetched */
  marks?: PayMarkItem[];
  tone?: "light" | "dark";
  align?: "center" | "start";
  /** the online-payment card: cash is not a way to pay online */
  hideCod?: boolean;
  className?: string;
}) {
  const fetched = usePayMarks(!marks?.length);
  const list = (marks?.length ? marks : fetched).filter((m) => !(hideCod && isCod(m.label)));
  return (
    <div
      className={`flex flex-wrap gap-[7px] ${align === "center" ? "justify-center" : "justify-start"} ${className}`}
    >
      {list.map((m) => (
        <PayMark key={m.label} label={m.label} url={m.imageUrl} tone={tone} />
      ))}
    </div>
  );
}
