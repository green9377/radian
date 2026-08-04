"use client";

import Link from "next/link";

import { formatTaka } from "../../_data/products";
import type { CrossSellItem, ResolvedCart } from "../../_data/cart";
import type { Quote } from "../../_data/checkoutApi";
import type { CartItem } from "../../_store/useCartStore";
import Icon from "../Pdp/PdpIcons";

/* ═══════════ CONFLICT BAR — zone বদলে গেছে, কিছু item আটকে গেছে ═══════════ */

export function ConflictBar({
  count,
  onSwitchBack,
}: {
  count: number;
  onSwitchBack: () => void;
}) {
  return (
    <div className="flex items-center gap-3.5 flex-wrap bg-[#FFF7E8] border-[1.5px] border-[#F2D9A8] rounded-[18px] px-4 sm:px-5 py-4 mb-5">
      <span className="w-10 h-10 rounded-full bg-white grid place-items-center text-[#8A5A00] shrink-0">
        <Icon name="truck" className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-[220px]">
        <b className="block text-[14px] text-[#8A5A00] font-semibold">
          {count} {count === 1 ? "item can't" : "items can't"} be delivered to All Bangladesh
        </b>
        <span className="text-[12.5px] text-[#9A7434]">
          Fresh items deliver inside Dhaka only. Nothing has been deleted — keep them
          for later, remove them, or switch back.
        </span>
      </div>
      <button
        onClick={onSwitchBack}
        className="bg-purple text-white rounded-full px-5 py-2.5 text-[13px] font-semibold hover:bg-purple-deep transition-colors"
      >
        Switch back to Dhaka
      </button>
    </div>
  );
}

/* ═══════════ UNDO BAR ═══════════ */

export function UndoBar({
  name,
  onUndo,
}: {
  name: string;
  onUndo: () => void;
}) {
  return (
    <div className="flex items-center gap-3 bg-ink text-white rounded-[14px] px-4 py-3 mb-4">
      <Icon name="check" className="w-4 h-4 shrink-0 opacity-70" />
      <span className="text-[13.5px] flex-1 min-w-0 truncate">{name} removed.</span>
      <button
        onClick={onUndo}
        className="text-[13px] font-semibold text-orchid-mid hover:text-white transition-colors shrink-0"
      >
        Undo
      </button>
    </div>
  );
}

/* ═══════════ MISSING — catalog থেকে product উধাও ═══════════
   চুপচাপ মুছি না। মুছে দিলে user ভাববে cart নিজে থেকে জিনিস খেয়ে ফেলছে। */

export function MissingLines({
  items,
  onRemove,
}: {
  items: CartItem[];
  onRemove: (lineId: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2.5 mb-4">
      {items.map((it) => (
        <div
          key={it.lineId}
          className="flex items-center gap-3 flex-wrap bg-lavender border-[1.5px] border-lavender-deep rounded-[16px] px-4 py-3"
        >
          <span className="w-9 h-9 rounded-full bg-white grid place-items-center text-body-soft shrink-0">
            <Icon name="search" className="w-4 h-4" />
          </span>
          <span className="text-[13px] text-body flex-1 min-w-[180px]">
            <b className="text-purple">This item is no longer available.</b> It was
            removed from our catalogue after you added it.
          </span>
          <button
            onClick={() => onRemove(it.lineId)}
            className="text-[12.5px] font-semibold text-body-soft underline underline-offset-2 hover:text-purple"
          >
            Remove from cart
          </button>
        </div>
      ))}
    </div>
  );
}

/* ═══════════ CROSS-SELL — এক tap, কোনো configuration নেই ═══════════ */

export function CrossSell({
  items,
  onAdd,
}: {
  items: CrossSellItem[];
  onAdd: (x: CrossSellItem) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section className="bg-white border-[1.5px] border-lavender-deep rounded-[22px] p-5 mt-5">
      <h3 className="font-display text-[17px] text-purple font-semibold">
        A little something extra?{" "}
        <span className="font-ui font-normal text-[13.5px] text-body-soft">
          One tap, no configuration needed
        </span>
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {items.map((x) => (
          <div
            key={x.slug}
            className="rounded-[16px] border border-lavender-deep overflow-hidden text-center"
          >
            <Link
              href={`/products/${x.slug}`}
              className="block aspect-[1/0.8]"
              style={{ background: x.bg }}
              aria-label={x.name}
            />
            <div className="px-2.5 pt-2 pb-3">
              <b className="block text-[11.5px] text-purple font-semibold truncate">
                {x.name}
              </b>
              <span className="block text-[12px] text-body-soft mb-2">
                {formatTaka(x.pricePaisa)}
              </span>
              <button
                onClick={() => onAdd(x)}
                className="w-full py-1.5 rounded-full border-[1.5px] border-purple text-purple text-[12px] font-semibold hover:bg-purple hover:text-white transition-colors"
              >
                Add +
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════ EMPTY CART — board-এ ছিল না ═══════════
   খালি page = হারানো বিক্রি (D6-এর একই যুক্তি)। তাই দুটো পথ দিই। */

export function EmptyCart() {
  return (
    <div className="bg-white border-[1.5px] border-lavender-deep rounded-[24px] px-6 py-14 text-center shadow-soft">
      <span className="w-20 h-20 mx-auto rounded-full bg-lavender grid place-items-center text-orchid">
        <Icon name="cart" className="w-9 h-9" />
      </span>

      <h2 className="font-display text-[24px] text-purple font-semibold mt-5">
        Your cart is empty
      </h2>
      <p className="text-[14px] text-body-soft mt-2 max-w-[380px] mx-auto">
        Not sure what to send? Tell us who it&apos;s for and we&apos;ll find something
        they&apos;ll love.
      </p>

      <div className="flex flex-wrap justify-center gap-3 mt-6">
        <Link
          href="/categories/fresh-flowers"
          className="h-[48px] px-7 inline-flex items-center rounded-[14px] bg-purple text-white font-semibold text-[14px] hover:bg-purple-deep transition-colors"
        >
          Shop fresh flowers
        </Link>
        <Link
          href="/"
          className="h-[48px] px-7 inline-flex items-center gap-2 rounded-[14px] border-[1.5px] border-purple text-purple font-semibold text-[14px] hover:bg-lavender transition-colors"
        >
          <Icon name="gift" className="w-4 h-4" />
          Open Gift Finder
        </Link>
      </div>
    </div>
  );
}

/* ═══════════ MOBILE STICKY BAR ═══════════ */

export function CartSticky({
  cart,
  quote,
}: {
  cart: ResolvedCart;
  quote: Quote | null;
}) {
  if (cart.totals.activeQty === 0) return null;

  /*  ⚠️ The SAME number as the summary panel, from the same quote. These were
      already two different sums — the panel took the coupon off, this bar did
      not — so on a discounted cart the phone showed one price at the bottom of
      the screen and another halfway up it.  */
  const totalPaisa = quote?.totalPaisa ?? null;

  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-[10px] border-t border-lavender-deep px-4 py-3 flex items-center gap-3">
      <div className="min-w-0">
        <div className="font-display text-[19px] text-purple font-semibold leading-none">
          {totalPaisa !== null ? formatTaka(totalPaisa) : "…"}
        </div>
        <span className="text-[11px] text-body-soft">
          Total · date &amp; time at checkout
        </span>
      </div>
      <Link
        href="/checkout"
        className="flex-1 h-[48px] inline-flex items-center justify-center gap-2 bg-purple text-white rounded-[14px] font-semibold text-[14.5px] active:scale-[0.97] transition-transform"
      >
        Checkout
        <Icon name="chev" className="w-4 h-4 -rotate-90" />
      </Link>
    </div>
  );
}
