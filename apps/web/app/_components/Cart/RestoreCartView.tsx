"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchSavedCart, type SavedCart } from "../../_data/checkoutApi";
import { useCartStore, type CartItem } from "../../_store/useCartStore";
import { formatTaka } from "../../_data/products";

/*
  ═══════════════════════════════════════════════════════════════════════════
  রেখে যাওয়া basket ফিরিয়ে দেওয়া — `/cart/{leadId}`। DEC-WA-004।

  ⚠️ নিজে থেকে cart বদলে দেওয়া হয় না, **একটা বোতাম দেখানো হয়**। গ্রাহকের
  ব্রাউজারে এর মধ্যে নতুন কিছু জমে থাকতে পারে; পুরনো লিংকে ঢুকলেই সেটা মুছে
  গেলে সেটা সাহায্য নয়, ক্ষতি। কী ফিরবে তা দেখিয়ে তাঁকেই সিদ্ধান্ত নিতে দিই।

  ⚠️ ব্যক্তিগত কিছু দেখানো হয় না — নাম, ঠিকানা, ফোন কিছুই নয়। server-ও
  পাঠায় না। লিংকটা WhatsApp-এ যায়, আর WhatsApp-এর বার্তা ভুল হাতেও পড়তে পারে।
  ═══════════════════════════════════════════════════════════════════════════
*/

export default function RestoreCartView({ leadId }: { leadId: string }) {
  const router = useRouter();
  const replaceAll = useCartStore((s) => s.replaceAll);
  const existing = useCartStore((s) => s.items);

  const [saved, setSaved] = useState<SavedCart | null | undefined>(undefined);

  useEffect(() => {
    let stale = false;
    fetchSavedCart(leadId).then((d) => {
      if (!stale) setSaved(d);
    });
    return () => {
      stale = true;
    };
  }, [leadId]);

  function restore() {
    const items = (saved?.cart?.items ?? []) as CartItem[];
    if (items.length) replaceAll(items);
    router.push("/checkout");
  }

  const shell = (children: React.ReactNode) => (
    <main className="min-h-[70vh] flex items-center justify-center px-5 py-16">
      <div className="w-full max-w-[460px] rounded-[28px] bg-white p-7 sm:p-9 shadow-[0_18px_50px_rgba(90,40,110,0.10)]">
        {children}
      </div>
    </main>
  );

  if (saved === undefined) {
    return shell(
      <p className="text-center text-[14px] text-neutral-500">Finding your basket…</p>,
    );
  }

  if (!saved?.found || !(saved.cart?.summary?.length)) {
    return shell(
      <>
        <h1 className="font-display text-[22px] font-bold text-neutral-900">
          We couldn&rsquo;t find that basket
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-neutral-600">
          It may have been a while — we don&rsquo;t keep unfinished baskets
          forever. Everything is still in the shop, though.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-[13.5px] font-semibold text-purple-700"
        >
          Browse the shop →
        </Link>
      </>,
    );
  }

  if (saved.alreadyOrdered) {
    return shell(
      <>
        <h1 className="font-display text-[22px] font-bold text-neutral-900">
          You already finished this one
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-neutral-600">
          Your order went through — nothing left to do. Thank you.
        </p>
        <Link href="/track" className="mt-6 inline-block text-[13.5px] font-semibold text-purple-700">
          Track your order →
        </Link>
      </>,
    );
  }

  return shell(
    <>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-purple-600">
        Still saved for you
      </p>
      <h1 className="mt-2 font-display text-[24px] font-bold text-neutral-900">
        Pick up where you left off
      </h1>

      <ul className="mt-5 space-y-2.5">
        {saved.cart.summary.map((l, i) => (
          <li key={i} className="flex items-start justify-between gap-3 text-[14px]">
            <span className="text-neutral-800">
              {l.qty ? `${l.qty} × ` : ""}
              {l.name}
              {(l.size || l.variant) && (
                <span className="text-neutral-500">
                  {" "}
                  ({[l.variant, l.size].filter(Boolean).join(", ")})
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {saved.totalPaisa > 0 && (
        <div className="mt-5 rounded-2xl bg-[#faf7fd] px-5 py-4">
          <p className="text-[12px] font-semibold text-neutral-500">Basket total</p>
          <p className="font-display text-[26px] font-bold leading-tight text-neutral-900">
            {formatTaka(saved.totalPaisa)}
          </p>
        </div>
      )}

      {existing.length > 0 && (
        <p className="mt-4 text-[12.5px] leading-relaxed text-amber-800">
          You have {existing.length} item{existing.length > 1 ? "s" : ""} in your
          basket right now. Restoring will replace them.
        </p>
      )}

      <button
        type="button"
        onClick={restore}
        className="mt-5 w-full rounded-2xl bg-gradient-to-r from-[#a021b8] to-[#d98cb3] py-4 text-[15px] font-extrabold text-white shadow-lg transition-transform active:scale-[0.98]"
      >
        Restore my basket
      </button>

      <Link
        href="/"
        className="mt-4 block text-center text-[13px] font-semibold text-neutral-500"
      >
        No thanks, take me to the shop
      </Link>
    </>,
  );
}
