"use client";

import { useEffect, useState } from "react";

import { formatTaka } from "../../_data/products";
import type { ResolvedCart } from "../../_data/cart";
import type { CheckoutTotals } from "../../_data/order";
import type { Quote } from "../../_data/checkoutApi";
import { getGoogleRating } from "../../_data/shop";
import { useCartStore } from "../../_store/useCartStore";
import Icon from "../Pdp/PdpIcons";
import TileImage from "../ui/TileImage";

/*
  Order Summary — every number in checkout comes from one place
  (`checkoutTotals()`), so the sticky bar and the Place Order button can never
  show a different amount from this panel.

  ★ Held item (D21): with the zone set to All Bangladesh a Dhaka-only item does
  not go into the order — but it does not vanish silently either. The amber
  line says so: it stayed in the cart.

  ❌ No "Need Help" section here — D19.
*/

function Row({
  label,
  value,
  tone = "normal",
  strike,
}: {
  label: string;
  value: string;
  tone?: "normal" | "soft" | "save" | "hold";
  strike?: string;
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
    <div className="flex items-start justify-between gap-3 py-2.5 text-[13.5px]">
      <span className="text-body-soft">{label}</span>
      <span className={`text-right shrink-0 ${valueTone}`}>
        {strike && (
          <span className="line-through text-body-soft font-normal mr-1.5">{strike}</span>
        )}
        {value}
      </span>
    </div>
  );
}

export function CheckoutSummary({
  cart,
  totals,
  deliveryLabel,
  placing,
  onPlace,
  quote,
}: {
  cart: ResolvedCart;
  totals: CheckoutTotals;
  deliveryLabel: string;
  placing: boolean;
  onPlace: () => void;
  /** the offer engine's answer — null until it arrives, or if it cannot be reached */
  quote: Quote | null;
}) {
  const { lines, held } = cart;
  /*  R3 — the shop's refusal of a typed code outlives the code itself  */
  const couponRejected = useCartStore((s) => s.couponRejected);

  return (
    /* top = header + sticky StepBar, or the summary slides under the bar */
    <aside className="lg:sticky lg:top-[200px] bg-white border-[1.5px] border-lavender-deep rounded-[24px] p-5 sm:p-6 shadow-soft">
      <h2 className="font-display text-[20px] text-purple font-semibold mb-4">
        Order Summary
      </h2>

      {/* mini lines — editing means going back to the cart (D22) */}
      <div className="space-y-3 pb-3 border-b border-lavender">
        {lines.map((l) => (
          <div key={l.item.lineId} className="flex items-center gap-3">
            <TileImage src={l.product.bg} alt="" variant="thumb" className="w-11 h-11 rounded-[12px] shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold text-purple truncate">
                {l.product.name}
              </span>
              <span className="block text-[11.5px] text-body-soft truncate">
                {[
                  l.size.label,
                  l.item.qty > 1 ? `× ${l.item.qty}` : null,
                  ...l.bundles.map((b) => b.label),
                  ...l.addons.map((a) => a.name),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span className="text-[12.5px] font-semibold text-purple shrink-0">
              {formatTaka(l.linePaisa)}
            </span>
          </div>
        ))}
      </div>

      <div className="divide-y divide-lavender">
        <Row
          label={`Subtotal · ${cart.totals.activeQty} ${
            cart.totals.activeQty === 1 ? "item" : "items"
          }`}
          value={formatTaka(totals.subtotalPaisa)}
        />

        {totals.discountPaisa > 0 && (
          <Row
            label={`Coupon ${totals.couponCode}`}
            value={`− ${formatTaka(totals.discountPaisa)}`}
            tone="save"
          />
        )}

        <Row
          label={deliveryLabel}
          value={totals.freeDelivery ? "FREE" : formatTaka(totals.deliveryPaisa)}
          tone={totals.freeDelivery ? "save" : "normal"}
          strike={totals.freeDelivery ? formatTaka(totals.deliveryGrossPaisa) : undefined}
        />
      </div>

      {held.length > 0 && (
        <div className="mt-3 rounded-[14px] bg-[#FFF7E8] border border-[#F2D9A8] px-3.5 py-3 flex gap-2.5">
          <Icon name="clock" className="w-4 h-4 text-[#8A5A00] shrink-0 mt-[2px]" />
          <p className="text-[12px] text-[#8A5A00] leading-snug">
            <b>
              {cart.totals.heldQty}{" "}
              {cart.totals.heldQty === 1 ? "item" : "items"} can&apos;t ship outside Dhaka
            </b>{" "}
            — they stay in your cart, not in this order.
          </p>
        </div>
      )}

      {/* ─── promo code — directly above the total (locked) ─── */}
      <CouponRow
        applied={quote?.applied.find((a) => a.code)?.code ?? null}
        couponError={quote?.couponError ?? couponRejected?.reason ?? null}
      />

      <div className="flex items-center justify-between gap-3 border-t-[1.5px] border-lavender-deep pt-4 mt-4">
        <span className="text-[15px] font-semibold text-purple">Total</span>
        <span className="font-display text-[26px] text-purple font-semibold">
          {formatTaka(totals.totalPaisa)}
        </span>
      </div>

      <button
        type="button"
        onClick={onPlace}
        disabled={placing}
        className="relative overflow-hidden w-full mt-5 h-[54px] inline-flex items-center justify-center gap-2 bg-purple text-white rounded-[16px] font-semibold text-[15px] transition-transform active:scale-[0.98] disabled:opacity-70"
      >
        {!placing && (
          <span className="animate-shine pointer-events-none absolute top-0 bottom-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent skew-x-[-18deg]" />
        )}
        {placing ? "Placing your order…" : `Place Order · ${formatTaka(totals.totalPaisa)}`}
      </button>

      <TrustBand />
    </aside>
  );
}

/* ─────────────────── TRUST BAND ─────────────────── */

/**
 * ⚠️ THE RATING IS THE REAL ONE, OR THERE IS NO RATING LINE — 27 Aug 2026.
 *
 * This band shipped `"4.9 on Google · 12,000+ moments delivered"` as typed
 * text. The shop's actual Google rating is 4.2 from 59 reviews, and nothing
 * anywhere counts "moments delivered" — that number had no source at all.
 *
 * It is the same offence the hero was fixed for on 9 Aug (DEC-PRD-034), and
 * this panel was simply missed. Worse here than there: it sits beside the
 * Place Order button, so the last thing a customer reads before handing over
 * money was a figure the shop invented.
 *
 * The rule the project already holds — a claim about what other customers did
 * may only be built from what other customers actually did (DEC-PRD-050) — so:
 * the real average, or the line does not draw. The invented delivery count is
 * gone and does not come back until something counts it.
 *
 * The other two lines stay because they are promises the shop makes, not
 * counts it is claiming: the gateway really is encrypted, and the freshness
 * guarantee is the owner's own policy.
 */
function TrustBand() {
  const [rating, setRating] = useState<{ rating: number | null } | null>(null);

  useEffect(() => {
    let alive = true;
    getGoogleRating()
      .then((r) => { if (alive) setRating(r); })
      /*  Fail-soft: no rating line beats a wrong one, and a checkout must not
          break because a review count could not be fetched.  */
      .catch(() => { if (alive) setRating({ rating: null }); });
    return () => { alive = false; };
  }, []);

  const lines: { icon: "lock" | "heart" | "star"; text: string }[] = [
    { icon: "lock", text: "256-bit encrypted payment via secure gateway" },
    { icon: "heart", text: "Freshness guarantee — replaced free if imperfect" },
  ];
  if (rating?.rating) {
    lines.push({ icon: "star", text: `${rating.rating.toFixed(1)} on Google — from real reviews` });
  }

  return (
    <div className="mt-4 rounded-[16px] bg-[#F0FBF4] border border-[#C4EED4] px-4 py-3.5 space-y-2">
      {lines.map((t) => (
        <p
          key={t.text}
          className="flex items-center gap-2.5 text-[12px] text-[#25674A] leading-snug"
        >
          <Icon name={t.icon} className="w-4 h-4 text-[#0E7A3D] shrink-0" />
          {t.text}
        </p>
      ))}
    </div>
  );
}

/* ─────────────────── COUPON ───────────────────
   Whatever was set in the cart is what stands here — the code persists, the
   discount does not (D28).
*/

/**
 * ⚠️ THIS BOX NO LONGER DECIDES ANYTHING — 3 Aug 2026.
 *
 * It used to call `applyCoupon()` and announce "NEW15 applied — 15% off" on
 * the strength of a constant in `_data/promo.ts`. The shop had never heard of
 * NEW15; the order would have cost ৳540 more than this panel said. Now the
 * button only records the code, `CheckoutView` re-quotes, and the answer —
 * including the refusal and its reason — comes back from the offer engine.
 */
function CouponRow({
  applied,
  couponError,
}: {
  /** the code the engine actually honoured, or null */
  applied: string | null;
  /** the engine's own words for why a typed code did not work (OFR-R08) */
  couponError: string | null;
}) {
  const couponCode = useCartStore((s) => s.couponCode);
  const couponRejected = useCartStore((s) => s.couponRejected);
  const setCoupon = useCartStore((s) => s.setCoupon);

  const [open, setOpen] = useState(false);
  /*  R3 — a refused code is no longer in the store, but the box still
      shows what was typed, so the customer can correct it or clear it.  */
  const [code, setCode] = useState(couponCode ?? couponRejected?.code ?? "");

  function onApply() {
    setCoupon(code.trim().toUpperCase() || null);
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 text-[13px] font-semibold text-orchid"
      >
        <Icon name="tag" className="w-4 h-4" />
        {couponCode ? "Change promo code" : "Have a promo code?"}
      </button>

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
              type="button"
              onClick={onApply}
              className="px-4 rounded-[12px] bg-purple text-white text-[13px] font-semibold hover:bg-purple-deep transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {applied && !open && (
        <p className="text-[12px] text-[#0E7A3D] mt-1.5">{applied} applied.</p>
      )}
      {couponError && (
        <p className="text-[12px] text-[#8A5A00] mt-1.5">{couponError}</p>
      )}
    </div>
  );
}

/* ─────────────────── MOBILE STICKY ─────────────────── */

export function CheckoutSticky({
  totals,
  when,
  placing,
  onPlace,
}: {
  totals: CheckoutTotals;
  when: string;
  placing: boolean;
  onPlace: () => void;
}) {
  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-[10px] border-t border-lavender-deep px-4 py-3 flex items-center gap-3">
      <div className="min-w-0">
        <div className="font-display text-[19px] text-purple font-semibold leading-none">
          {formatTaka(totals.totalPaisa)}
        </div>
        <span className="text-[11px] text-body-soft truncate block">{when}</span>
      </div>
      <button
        type="button"
        onClick={onPlace}
        disabled={placing}
        className="flex-1 h-[48px] inline-flex items-center justify-center gap-2 bg-purple text-white rounded-[14px] font-semibold text-[14.5px] active:scale-[0.97] transition-transform disabled:opacity-70"
      >
        {placing ? "Placing…" : "Place Order"}
      </button>
    </div>
  );
}
