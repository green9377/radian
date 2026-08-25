"use client";

import Link from "next/link";

import { useZoneStore } from "../../_store/useZoneStore";
import { formatTaka } from "../../_data/products";
import Icon from "./PdpIcons";
import QtyStepper from "../Common/QtyStepper";

/*
  The small pieces of the PDP — CTA row, mobile sticky bar, section title,
  out-of-zone panel. Kept in their own file so PdpView.tsx stays light.

  The CTA rule: Buy Now = primary (the default), Add to Cart = secondary.
  Buy Now brings in more of the revenue, so that is the one that must look
  like the default.
*/

export function BlkTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex justify-between items-baseline gap-3 mb-4">
      <h2 className="relative text-[17px] font-bold text-ink pb-2.5 after:content-[''] after:absolute after:left-0 after:bottom-0 after:w-14 after:h-[3px] after:bg-purple after:rounded-full">
        {title}
      </h2>
      {hint && <small className="text-[12.5px] text-body-soft">{hint}</small>}
    </div>
  );
}

/*
  ── PRE-ORDER WORDING (DEC-PDP-09) ─────────────────────────────────────────
  The owner, 1 August 2026: "with stock at 0 no order can be placed. Either
  it says sold out, or it becomes a pre-order."

  Pre-order still sells, so the buttons stay — but they must not lie by
  omission. "Buy Now" over something that is not on the shelf is the kind of
  small dishonesty that turns into a phone call and a refund. One word changes
  and one line of explanation is the whole fix.

  ⚠️ `date` is formatted in Bangladesh time, not the visitor's. Somebody
  reading the page from Dubai must see the date the shop meant.
*/
const BD_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "Asia/Dhaka",
});
export function backOnLabel(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : BD_DATE.format(d);
}

export function CtaRow({
  qty,
  setQty,
  total,
  added,
  preorder,
  needsPick,
  blockedReason,
  onAddToCart,
  onBuyNow,
}: {
  qty: number;
  setQty: (n: number) => void;
  total: number;
  added: boolean;
  /** DEC-PDP-09 — set when the shop has none of it but will still take the
   *  order. `backOn` is already an ISO string, or null when no date was given. */
  preorder?: { backOn: string | null } | null;
  /**
   * DEC-PRD-045 — true while a product with two lists has no pair chosen.
   * The buttons wait, and say what they are waiting for: nine pairs each have
   * their own price and their own item, so an order naming none of them
   * cannot be picked off a shelf.
   */
  needsPick?: boolean;
  /** what the buttons say while they wait — the reason, not a generic no */
  blockedReason?: string;
  onAddToCart: () => void;
  onBuyNow: () => void;
}) {
  const backOn = preorder ? backOnLabel(preorder.backOn) : null;
  return (
    <>
      {preorder && (
        <div className="mt-5 flex items-start gap-3 rounded-[16px] border-[1.5px] border-[#F2D9A8] bg-[#FFF7E8] px-4 py-3.5">
          <span className="w-9 h-9 rounded-full bg-white grid place-items-center text-[#8A5A00] shrink-0">
            <Icon name="clock" className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0">
            <b className="block text-[14px] text-[#8A5A00] font-bold">
              Pre-order — not in stock right now
            </b>
            <span className="text-[13px] text-[#9A7434]">
              {backOn
                ? `We start sending these from ${backOn}. Order now and yours is reserved.`
                : "We're making more. Order now and yours is reserved — we'll call you with the date."}
            </span>
          </div>
        </div>
      )}

      <div className="flex gap-2.5 items-stretch mt-5 flex-wrap">
        {/* qty */}
        <QtyStepper value={qty} onChange={setQty} min={1} size="lg" />

        {/* secondary */}
        <button
          onClick={onAddToCart}
          disabled={needsPick}
          className={`flex-1 basis-0 min-w-[150px] h-[52px] inline-flex items-center justify-center gap-2 rounded-[14px] border-[1.5px] font-semibold text-[14.5px] transition-all duration-200 active:scale-[0.97] ${
            needsPick
              ? "bg-white border-lavender-deep text-body-soft cursor-not-allowed active:scale-100"
              : added
                ? "bg-[#E8F9EE] border-[#C4EED4] text-[#0E7A3D]"
                : "bg-white border-purple text-purple hover:bg-lavender hover:-translate-y-[2px]"
          }`}
        >
          <Icon name={added ? "check" : "cart"} className="w-[17px] h-[17px]" />
          {added ? "Added" : "Add to Cart"}
        </button>

        {/* primary — the default. The shine sweep and glow loop on their own; no hover needed. */}
        <button
          onClick={onBuyNow}
          disabled={needsPick}
          className={`flex-[1.25] basis-0 min-w-[170px] h-[52px] relative overflow-hidden inline-flex items-center justify-center gap-2 rounded-[14px] font-semibold text-[14.5px] transition-transform duration-200 ${
            needsPick
              ? "bg-[#d6cddd] text-white cursor-not-allowed"
              : "animate-cta-glow bg-purple text-white hover:bg-purple-deep hover:-translate-y-[2px] active:scale-[0.97] active:translate-y-0"
          }`}
        >
          {!needsPick && (
            <span className="animate-shine pointer-events-none absolute top-0 bottom-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent skew-x-[-18deg]" />
          )}
          <Icon name={needsPick ? "check" : preorder ? "clock" : "bolt"} className="w-4 h-4" />
          {needsPick
            ? blockedReason || "Choose an option first"
            : `${preorder ? "Pre-order" : "Buy Now"} · ${formatTaka(total)}`}
        </button>
      </div>

      {/*  ⚠️ "No payment until you confirm" is dropped on a pre-order. Whether
          money is taken up front is the product's own advance rule (owner's
          ruling: whatever the product's own advance rule says), so this page cannot
          promise either way — and promising the friendlier one would be the
          wrong guess to make.  */}
      <p className="text-center text-[12.5px] text-body-soft mt-3">
        {preorder ? (
          <>
            Delivery date &amp; time slot and gift message come on the next step.
            We&apos;ll confirm the sending date with you before anything ships.
          </>
        ) : (
          <>
            Delivery date &amp; time slot, gift card message and anonymous-gift option — all on
            the next step.{" "}
            <b className="text-[#0E7A3D] font-semibold">No payment until you confirm.</b>
          </>
        )}
      </p>
    </>
  );
}

export function StickyBar({
  total,
  label,
  added,
  soldOut,
  preorder,
  needsPick,
  blockedReason,
  onAddToCart,
  onBuyNow,
}: {
  total: number;
  label: string;
  added: boolean;
  /** DEC-PDP-09 — nothing to sell. The bar stays (it is the mobile price tag)
   *  but stops being a way to buy. */
  soldOut?: boolean;
  preorder?: boolean;
  /**  DEC-PRD-045 — a two-list product with no pair chosen yet. The bar is
   *   fixed to the bottom of the phone and does not scroll away, so it has to
   *   wait for the same answer the CTA row waits for. */
  needsPick?: boolean;
  blockedReason?: string;
  onAddToCart: () => void;
  onBuyNow: () => void;
}) {
  /*  ⚠️ THE BAR HAD TO BE HANDLED SEPARATELY. On mobile it is fixed to the
      bottom of the screen and does NOT scroll with the page, so hiding the
      desktop CTA row alone would leave a working "Buy Now" floating over an
      out-of-stock product — the exact contradiction DEC-PDP-09 exists to
      prevent. Whoever adds a third CTA surface must come back here.  */
  if (soldOut) {
    return (
      <div className="lg:hidden fixed left-0 right-0 bottom-0 z-[70] bg-white/95 backdrop-blur border-t border-lavender-deep px-4 py-3 flex items-center gap-3 shadow-[0_-8px_30px_rgba(71,0,102,0.1)]">
        <div className="min-w-0 flex-1">
          <div className="font-display text-[19px] font-semibold text-body-soft line-through">
            {formatTaka(total)}
          </div>
          <div className="text-[12px] text-body-soft truncate">{label}</div>
        </div>
        <span className="shrink-0 h-[48px] px-5 inline-flex items-center justify-center rounded-[14px] bg-lavender text-body-soft font-semibold text-[14px]">
          Out of stock
        </span>
      </div>
    );
  }
  return (
    <div className="lg:hidden fixed left-0 right-0 bottom-0 z-[70] bg-white/95 backdrop-blur border-t border-lavender-deep px-4 py-3 flex items-center gap-3 shadow-[0_-8px_30px_rgba(71,0,102,0.1)]">
      <div className="min-w-0">
        <div className="font-display text-[19px] font-semibold text-purple">
          {formatTaka(total)}
        </div>
        <div className="text-[12px] text-body-soft truncate max-w-[110px]">{label}</div>
      </div>
      <button
        onClick={onAddToCart}
        disabled={needsPick}
        aria-label="Add to cart"
        className={`w-[52px] h-[48px] shrink-0 grid place-items-center rounded-[14px] border-[1.5px] transition-all active:scale-[0.94] ${
          needsPick
            ? "bg-white border-lavender-deep text-body-soft active:scale-100"
            : added
              ? "bg-[#E8F9EE] border-[#C4EED4] text-[#0E7A3D]"
              : "bg-white border-purple text-purple"
        }`}
      >
        <Icon name={added ? "check" : "cart"} className="w-5 h-5" />
      </button>
      <button
        onClick={onBuyNow}
        disabled={needsPick}
        className={`relative overflow-hidden flex-1 h-[48px] inline-flex items-center justify-center gap-2 rounded-[14px] font-semibold text-[14.5px] transition-transform ${
          needsPick
            ? "bg-[#d6cddd] text-white"
            : "animate-cta-glow bg-purple text-white active:scale-[0.97]"
        }`}
      >
        {!needsPick && (
          <span className="animate-shine pointer-events-none absolute top-0 bottom-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent skew-x-[-18deg]" />
        )}
        <Icon name={needsPick ? "check" : preorder ? "clock" : "bolt"} className="w-4 h-4" />
        {needsPick ? blockedReason || "Choose an option" : preorder ? "Pre-order" : "Buy Now"}
      </button>
    </div>
  );
}

/*
  ── OUT OF STOCK (DEC-PDP-09) ──────────────────────────────────────────────
  The owner, 1 August 2026: "with stock at 0 no order can be placed."

  Replaces the CTA row entirely rather than greying the buttons out. A disabled
  button is a door that looks open — people press it, nothing happens, and they
  decide the site is broken rather than that the flower is gone. A panel says
  the thing plainly and, more importantly, gives them somewhere else to go: a
  shopper who came for a gift still needs a gift.

  ⚠️ NO "NOTIFY ME" BUTTON. There is no e-mail or SMS trigger built for it yet,
  and a button that collects an address nobody will ever send to is worse than
  no button. It goes in the day Marketing has the sending side.
*/
export function SoldOut({
  backHref,
  hasRelated,
}: {
  backHref: string;
  /**
   * ⚠️ `RelatedRail` returns null when it has nothing to show, so the #related
   * anchor does not exist on those pages. The owner pressed "Similar gifts" and
   * the page sat there (10 Aug 2026). A button that scrolls to a section that
   * was never rendered is the same broken promise as a disabled button — the
   * thing this whole panel was written to avoid. So it only appears when there
   * is genuinely something below to scroll to.
   */
  hasRelated: boolean;
}) {
  return (
    <div className="border-[1.5px] border-lavender-deep bg-lavender/40 rounded-[18px] p-6 mt-5">
      <div className="flex gap-3.5 items-start">
        <span className="w-11 h-11 rounded-full bg-white grid place-items-center text-body-soft shrink-0">
          <Icon name="cart" className="w-5 h-5" />
        </span>
        <div>
          <b className="block text-[15px] text-ink font-bold">Out of stock</b>
          <span className="text-[13.5px] text-body-soft">
            This one has gone for now. We&apos;d rather say so than take an order
            we can&apos;t deliver.
          </span>
        </div>
      </div>
      <div className="flex gap-2.5 mt-4 flex-wrap">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 bg-purple text-white rounded-full px-5 py-3 text-[13.5px] font-semibold active:scale-[0.97] transition-transform"
        >
          <Icon name="gift" className="w-4 h-4" />
          See what else we have
        </Link>
        {hasRelated && (
          /*  A PLAIN <a>, on purpose. Not next/link — its router handles the
              hash itself and does not reliably scroll a page that is already
              rendered. And no onClick either: I wrote one with
              scrollIntoView({behavior:"smooth"}) and could not prove it
              worked, because a browser will not animate a smooth scroll in a
              tab that is not in front. Native hash navigation always scrolls,
              with no JavaScript involved at all. The glide comes from CSS
              (scroll-behavior on <html>), which degrades to an instant jump
              rather than to nothing.  */
          <a
            href="#related"
            className="inline-flex items-center gap-2 bg-white text-purple border-[1.5px] border-lavender-deep hover:border-orchid rounded-full px-5 py-3 text-[13.5px] font-semibold"
          >
            Similar gifts
          </a>
        )}
      </div>
    </div>
  );
}

/** Zone mismatch — a search result or a shared link WILL land someone here */
export function OutOfZone({ reason }: { reason: string }) {
  const { setZone } = useZoneStore();
  return (
    <div className="border-[1.5px] border-[#F2D9A8] bg-[#FFF7E8] rounded-[18px] p-6">
      <div className="flex gap-3.5 items-start">
        <span className="w-11 h-11 rounded-full bg-white grid place-items-center text-[#8A5A00] shrink-0">
          <Icon name="truck" className="w-5 h-5" />
        </span>
        <div>
          <b className="block text-[15px] text-[#8A5A00] font-bold">
            This gift can&apos;t travel outside Dhaka
          </b>
          <span className="text-[13.5px] text-[#9A7434]">{reason}</span>
        </div>
      </div>
      <div className="flex gap-2.5 mt-4 flex-wrap">
        <button
          onClick={() => setZone("dhaka")}
          className="inline-flex items-center gap-2 bg-purple text-white rounded-full px-5 py-3 text-[13.5px] font-semibold active:scale-[0.97] transition-transform"
        >
          <Icon name="bolt" className="w-4 h-4" />
          I&apos;m inside Dhaka — switch
        </button>
        <Link
          href="#related"
          className="inline-flex items-center gap-2 bg-white text-purple border-[1.5px] border-lavender-deep hover:border-orchid rounded-full px-5 py-3 text-[13.5px] font-semibold"
        >
          <Icon name="gift" className="w-4 h-4" />
          Show gifts we can send there
        </Link>
      </div>
    </div>
  );
}
