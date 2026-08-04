"use client";

import { useState } from "react";
import Link from "next/link";

import { formatTaka } from "../../_data/products";
import type { ResolvedCart } from "../../_data/cart";
import type { Quote } from "../../_data/checkoutApi";
import { useCartStore } from "../../_store/useCartStore";
import type { IconName } from "../../_data/productDetails";
import Icon from "../Pdp/PdpIcons";

/*
  Order Summary.

  ⚠️ Board থেকে যা বাদ গেছে:
  - "Order this cart on WhatsApp" button (§11 retro-fix — WhatsApp order channel নয়)
  - Delivery slot picker (D13 — Checkout-এ)
  - Gift message (D14 — Checkout-এ)

  Checkout button কখনো disable হয় না। held item থাকলেও deliverable
  item নিয়ে checkout চলবে — cart page-এর একমাত্র কাজ checkout-এ পাঠানো,
  সেটাই block করা conversion-এর জন্য সবচেয়ে খারাপ।
*/

function Row({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: string;
  tone?: "normal" | "soft" | "save" | "hold";
}) {
  const valueTone =
    tone === "save"
      ? "text-[#0E7A3D] font-semibold"
      : tone === "hold"
        ? "text-[#8A5A00] font-semibold"
        : tone === "soft"
          ? "text-body-soft"
          : "text-purple font-semibold";

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]">
      <span className="text-body-soft">{label}</span>
      <span className={`text-right ${valueTone}`}>{value}</span>
    </div>
  );
}

export default function CartSummary({
  cart,
  quote,
  quoting,
}: {
  cart: ResolvedCart;
  /** null = the shop could not be reached, or has not answered yet */
  quote: Quote | null;
  quoting: boolean;
}) {
  /*
    Coupon CODE store-এ persist হয় (D20-এর যুক্তি — কোড config, দাম নয়)।
    তাই cart-এ apply করলে checkout-এ বসেই থাকে, আবার লিখতে হয় না।
  */
  const couponCode = useCartStore((s) => s.couponCode);
  const setCoupon = useCartStore((s) => s.setCoupon);

  const [code, setCode] = useState(couponCode ?? "");
  const [open, setOpen] = useState(false);

  const { totals, held } = cart;

  /*
    ═══ WHERE THESE NUMBERS COME FROM NOW, 3 Aug 2026 ═══

    All of them: the server. `applyCoupon()` used to run here, against three
    codes written into `_data/promo.ts`, and it decided on this page whether a
    discount was real. It was not — no order ever honoured it, because the
    order is priced by the offer engine, which had never heard of NEW15.

    ⚠️ The coupon is no longer "applied" by a button. Typing it re-quotes, and
    the SERVER says whether it worked and why not (OFR-R08). The button now
    only saves the code, which is what it always should have done: a code is
    config, a discount is a decision.
  */
  const promo = quote?.nextReward ?? null;
  /*  While a fresh quote is in flight the LAST total stays on screen. A cart
      that blanks its total between keystrokes reads as "it lost my order".  */
  const totalPaisa = quote?.totalPaisa ?? null;
  const couponError = quote?.couponError ?? null;
  const appliedCoupon = quote?.applied.find((a) => a.code) ?? null;
  const canCheckout = totals.activeQty > 0;

  function onApply() {
    /*  The effect in CartView re-quotes on `couponCode` changing; the answer
        arrives from the shop, not from a table in this app.  */
    setCoupon(code.trim().toUpperCase() || null);
  }

  return (
    <aside className="lg:sticky lg:top-[124px] bg-white border-[1.5px] border-lavender-deep rounded-[24px] p-5 sm:p-6 shadow-soft">
      <h2 className="font-display text-[20px] text-purple font-semibold mb-4">
        Order Summary
      </h2>

      {/*
        ─── "spend ৳X more" ───
        ⚠️ There is no "unlocked!" half any more, and its absence is the point.
        This bar exists only while a reward is still out of reach; the moment it
        is reached the offer stops being a promise and becomes a line in the
        totals below, with the money on it. One state, one place, no chance of
        the banner and the arithmetic disagreeing.
      */}
      {promo && (
        <div className="rounded-[16px] p-4 mb-4 border bg-lavender border-lavender-deep">
          <div className="flex items-start gap-2.5">
            <span className="w-8 h-8 rounded-full grid place-items-center shrink-0 bg-white text-orchid">
              <Icon name="moon" className="w-4 h-4" />
            </span>
            <p className="text-[13px] leading-snug pt-1 text-body">
              You&apos;re <b>{formatTaka(promo.remainingPaisa)}</b> away from{" "}
              <b>{promo.label}</b>
              {promo.savePaisa > 0 && <> — saves {formatTaka(promo.savePaisa)}</>}
            </p>
          </div>

          <div className="mt-3 h-[6px] rounded-full bg-white overflow-hidden">
            <div
              className="h-full rounded-full bg-orchid transition-[width] duration-500"
              style={{ width: `${promo.pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="divide-y divide-lavender">
        <Row
          label={`Subtotal · ${totals.activeQty} ${totals.activeQty === 1 ? "item" : "items"}`}
          value={formatTaka(totals.activePaisa)}
        />

        {/*  One row per offer the ENGINE applied, named as the shop names it.
             An automatic discount used to be invisible here — only a typed
             coupon showed — so a cart could quietly cost less than its own
             summary explained.  */}
        {quote?.applied.map((a) => (
          <Row
            key={a.name + (a.code ?? "")}
            label={a.code ? `${a.name} · ${a.code}` : a.name}
            value={
              a.freeDelivery && a.discountPaisa === 0
                ? "Free delivery"
                : `− ${formatTaka(a.discountPaisa)}`
            }
            tone="save"
          />
        ))}

        {held.length > 0 && (
          <Row
            label={`Dhaka-only items (on hold) · ${totals.heldQty}`}
            value={formatTaka(totals.heldPaisa)}
            tone="hold"
          />
        )}

        <Row
          label="Delivery fee"
          value="Chosen at checkout"
          tone="soft"
        />
      </div>

      <p className="text-[12px] text-body-soft mt-2.5 mb-4">
        You&apos;ll pick the exact delivery date, time slot and gift message at checkout.
      </p>

      <div className="flex items-center justify-between gap-3 border-t-[1.5px] border-lavender-deep pt-4">
        <span className="text-[15px] font-semibold text-purple">Total</span>
        {/*
          ⚠️ NO NUMBER UNTIL THE SHOP HAS GIVEN ONE. `formatTaka(0)` while the
          quote is in flight would show ৳0 for a full cart, and a made-up
          subtotal on failure would be a price nobody agreed to sell at.
        */}
        <span className="font-display text-[26px] text-purple font-semibold">
          {totalPaisa !== null ? (
            formatTaka(totalPaisa)
          ) : (
            <span className="text-[15px] font-ui font-normal text-body-soft">
              {quoting ? "Working it out…" : "Couldn’t load the price"}
            </span>
          )}
        </span>
      </div>

      {totalPaisa === null && !quoting && (
        <p className="text-[12px] text-[#C4172B] mt-1.5">
          We couldn&apos;t reach the shop just now. Refresh and it should come back.
        </p>
      )}

      {/* ─── promo code — validated by the offer engine, not by this page ─── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 mt-4 text-[13px] font-semibold text-orchid"
      >
        <Icon name="tag" className="w-4 h-4" />
        {couponCode ? "Change promo code" : "Have a promo code?"}
      </button>

      {/*  The shop's own reason, in the shop's own words (OFR-R08) — "needs min
          spend ৳2,000", "welcome offer already used". Guessing at these on the
          page is how a cart says a code is fine and checkout says it is not.  */}
      {couponError && (
        <p className="text-[12px] text-[#8A5A00] mt-1.5">{couponError}</p>
      )}

      {open && (
        <div className="mt-2.5">
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onApply()}
              placeholder="Enter code"
              className="flex-1 min-w-0 border-[1.5px] border-lavender-deep rounded-[12px] px-3.5 py-2.5 text-[13.5px] uppercase outline-none focus:border-orchid"
            />
            <button
              onClick={onApply}
              disabled={quoting}
              className="px-4 rounded-[12px] bg-purple text-white text-[13px] font-semibold hover:bg-purple-deep transition-colors disabled:bg-lavender-deep disabled:text-body-soft"
            >
              {quoting ? "…" : "Apply"}
            </button>
          </div>
          {appliedCoupon && (
            <p className="text-[12px] text-[#0E7A3D] mt-1.5">
              {appliedCoupon.name} — applied.
            </p>
          )}
        </div>
      )}

      {canCheckout ? (
        <Link
          href="/checkout"
          className="relative overflow-hidden w-full mt-5 h-[54px] inline-flex items-center justify-center gap-2 bg-purple text-white rounded-[16px] font-semibold text-[15px] transition-transform active:scale-[0.98]"
        >
          <span className="animate-shine pointer-events-none absolute top-0 bottom-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent skew-x-[-18deg]" />
          Proceed to Checkout
          <Icon name="chev" className="w-4 h-4 -rotate-90" />
        </Link>
      ) : (
        <button
          disabled
          className="w-full mt-5 h-[54px] inline-flex items-center justify-center gap-2 rounded-[16px] font-semibold text-[15px] bg-lavender-deep text-body-soft"
        >
          Proceed to Checkout
        </button>
      )}

      {held.length > 0 && canCheckout && (
        <p className="text-[12px] text-[#8A5A00] text-center mt-2.5">
          Dhaka-only items stay in your cart — they just won&apos;t be in this order.
        </p>
      )}
      {!canCheckout && (
        <p className="text-[12px] text-body-soft text-center mt-2.5">
          Nothing here can be delivered to All Bangladesh yet.
        </p>
      )}

      {/* trust */}
      <div className="grid grid-cols-3 gap-2 mt-5 pt-5 border-t border-lavender text-center">
        {([
          { icon: "shield", label: "Freshness\nguarantee" },
          { icon: "check", label: "Secure\npayment" },
          { icon: "star", label: "4.9 on\nGoogle" },
        ] satisfies { icon: IconName; label: string }[]).map((t) => (
          <div key={t.label} className="flex flex-col items-center gap-1.5">
            <span className="w-8 h-8 rounded-full bg-lavender grid place-items-center text-orchid">
              <Icon name={t.icon} className="w-4 h-4" />
            </span>
            <span className="text-[11px] text-body-soft leading-tight whitespace-pre-line">
              {t.label}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-1.5 mt-4">
        {["bKash", "Nagad", "VISA", "Mastercard", "COD"].map((p) => (
          <span
            key={p}
            className="border border-lavender-deep rounded-md px-2 py-1 text-[10.5px] font-semibold text-body-soft"
          >
            {p}
          </span>
        ))}
      </div>
    </aside>
  );
}
