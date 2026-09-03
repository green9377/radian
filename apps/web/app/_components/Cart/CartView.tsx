"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { useZoneStore } from "../../_store/useZoneStore";
import {
  useCartHydrated,
  useCartStore,
  type CartItem,
} from "../../_store/useCartStore";
import {
  crossSellItems,
  resolveCart,
  type CrossSellItem,
  type ResolvedCart,
} from "../../_data/cart";
import {
  fetchQuote,
  toQuoteItems,
  zoneCodeFor,
  type Quote,
} from "../../_data/checkoutApi";
import CartLine from "./CartLine";
import CartSummary from "./CartSummary";
import {
  CartSticky,
  ConflictBar,
  CrossSell,
  EmptyCart,
  MissingLines,
  UndoBar,
} from "./CartExtras";
import Icon from "../Pdp/PdpIcons";

/*
  ═══════════════════════════════════════════════════════════════════
  CART — একটাই client component।

  ── Zone conflict (Open Question #5 → এখন locked) ────────────────
  All Bangladesh-এ switch করলে Dhaka-only item:
    • মুছে যায় না
    • subtotal থেকে বাদ যায় ("on hold")
    • নিচে আলাদা block-এ নামে
    • Checkout BLOCK করে না — deliverable item নিয়ে order চলবে

  কেন block করি না: cart page-এর একমাত্র কাজ checkout-এ পাঠানো।
  ৩টার মধ্যে ১টা Dhaka-only হলে বাকি ২টার বিক্রিও হারানো বোকামি।

  ── দাম ──────────────────────────────────────────────────────────
  Store-এ দাম নেই। resolveCart() প্রতি render-এ catalog থেকে হিসাব করে।
  ═══════════════════════════════════════════════════════════════════
*/

const UNDO_MS = 6000;

export default function CartView() {
  const { zone, setZone } = useZoneStore();
  const hydrated = useCartHydrated();

  const items = useCartStore((s) => s.items);
  const lastRemoved = useCartStore((s) => s.lastRemoved);
  const add = useCartStore((s) => s.add);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);
  const removeAddon = useCartStore((s) => s.removeAddon);
  const setSize = useCartStore((s) => s.setSize);
  const restore = useCartStore((s) => s.restore);
  const clearRemoved = useCartStore((s) => s.clearRemoved);

  /*
    ⚠️ `useMemo` → fetch-in-effect, 31 Jul 2026. `resolveCart` reads the real
    catalogue now, so it is async and cannot be computed during render.

    `stale` guards the race: change the zone twice quickly and two requests are
    in flight; without it the slower one can land last and paint the wrong
    totals over the right ones. The old cart stays on screen while the new one
    loads — a cart that blanks between keystrokes reads as "it lost my items".
  */
  const [cart, setCart] = useState<ResolvedCart | null>(null);
  useEffect(() => {
    let stale = false;
    resolveCart(items, zone).then((c) => {
      if (!stale) setCart(c);
    });
    return () => {
      stale = true;
    };
  }, [items, zone]);

  /*
    ═══ THE MONEY, 3 Aug 2026 ═══

    `resolveCart` above still draws the LINES — pictures, size labels, the
    upgrade nudge. It reads the same catalogue the server does, through the
    same `/shop/products/:slug`, so line prices agree by construction.

    What it cannot do is offers. Whether a coupon is valid, which automatic
    discount wins, how much delivery costs and how far this cart is from the
    next reward are all decisions only the offer engine and the delivery
    masters can make — and both live on the server. Before this, the cart
    answered them from `_data/promo.ts`: three coupon codes and a ৳3,000
    threshold typed into a file, none of which the owner could change and none
    of which any order would honour.

    ⚠️ `null` while it loads AND on failure, and the summary says so rather
    than showing a total. Every other getter in `_data` falls back to its
    hard-coded list; money does not get that treatment.

    ⚠️ No phone here — the cart has none. So a first-order discount is not in
    this total, and the checkout page (which asks for a number) will quote
    lower. Downwards is the safe direction; the reverse would be a broken
    promise.
  */
  const couponCode = useCartStore((s) => s.couponCode);
  const rejectCoupon = useCartStore((s) => s.rejectCoupon);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(true);
  useEffect(() => {
    if (items.length === 0) {
      setQuote(null);
      setQuoting(false);
      return;
    }
    let stale = false;
    setQuoting(true);
    fetchQuote({
      items: toQuoteItems(items),
      zone: zoneCodeFor(zone),
      couponCode: couponCode ?? undefined,
    }).then((q) => {
      if (stale) return;
      setQuote(q);
      setQuoting(false);
      /*  R3 — a code the shop refused must not stay in the store, or it
          rides into the order and the whole checkout fails on it.  */
      if (q?.couponError && couponCode) rejectCoupon(couponCode, q.couponError);
    });
    return () => {
      stale = true;
    };
  }, [items, zone, couponCode, rejectCoupon]);

  /*
    Names of everything this cart has held, kept as they go past.

    The undo bar has to name a product that is no longer in the cart, so it
    cannot read the resolved lines — they no longer contain it. It used to call
    the mock catalogue, which was the last thing on this page that did, and for
    any product created in the admin it answered "Item".
  */
  const seenNames = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!cart) return;
    for (const l of [...cart.lines, ...cart.held]) {
      seenNames.current[l.item.slug] = l.product.name;
    }
  }, [cart]);

  /*  Also async now, and also raced-guarded. It fails to an empty rail rather
      than to mock products: "a little something extra" that the shop does not
      stock is worse than no rail.  */
  const [xsell, setXsell] = useState<CrossSellItem[]>([]);
  useEffect(() => {
    let stale = false;
    crossSellItems(items, zone).then((x) => {
      if (!stale) setXsell(x);
    });
    return () => {
      stale = true;
    };
  }, [items, zone]);

  /* undo bar ৬ সেকেন্ড পর নিজে থেকে চলে যায় */
  useEffect(() => {
    if (!lastRemoved) return;
    const id = setTimeout(clearRemoved, UNDO_MS);
    return () => clearTimeout(id);
  }, [lastRemoved, clearRemoved]);

  function onCrossSellAdd(x: CrossSellItem) {
    add({
      slug: x.slug,
      sizeId: x.sizeId,
      bundleIds: x.bundleIds,
      addonKeys: [],
      qty: 1,
    });
  }

  /* Hydration guard — নইলে server "empty cart" render করবে আর
     client সাথে সাথে ৩টা line — mismatch + খালি cart-এর ঝলক */
  /*  `!cart` joins the same guard: prices are not known until the catalogue
      answers, and a cart drawn without them would flash zeroes.  */
  if (!hydrated || !cart) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <span className="text-[13.5px] text-body-soft">Loading your cart…</span>
      </div>
    );
  }

  if (cart.isEmpty) return <EmptyCart />;

  const missingItems: CartItem[] = cart.missing.map((m) => m.item);
  const totalLines = cart.lines.length + cart.held.length + missingItems.length;

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
        <h1 className="font-display text-[26px] sm:text-[30px] text-purple font-semibold">
          Your Cart{" "}
          <span className="font-ui text-[15px] font-normal text-body-soft">
            · {totalLines} {totalLines === 1 ? "item" : "items"}
          </span>
        </h1>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-orchid hover:text-purple transition-colors"
        >
          <Icon name="chev" className="w-4 h-4 rotate-90" />
          Continue shopping
        </Link>
      </div>

      {cart.held.length > 0 && (
        <ConflictBar
          count={cart.totals.heldQty}
          onSwitchBack={() => setZone("dhaka")}
        />
      )}

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 lg:gap-8 items-start">
        <div>
          {lastRemoved && (
            <UndoBar
              name={seenNames.current[lastRemoved.item.slug] ?? "Item"}
              onUndo={restore}
            />
          )}

          <MissingLines items={missingItems} onRemove={remove} />

          {/* ─── deliverable ─── */}
          <div className="space-y-4">
            {cart.lines.map((line) => (
              <CartLine
                key={line.item.lineId}
                line={line}
                onQty={(q) => setQty(line.item.lineId, q)}
                onRemove={() => remove(line.item.lineId)}
                onRemoveAddon={(k) => removeAddon(line.item.lineId, k)}
                onUpgrade={(sizeId) => setSize(line.item.lineId, sizeId)}
                onSwitchToDhaka={() => setZone("dhaka")}
              />
            ))}
          </div>

          {/* ─── held — cart-এ আছে, order-এ নেই ─── */}
          {cart.held.length > 0 && (
            <section className="mt-7">
              <div className="flex items-center gap-2.5 mb-3">
                <Icon name="clock" className="w-[18px] h-[18px] text-[#8A5A00]" />
                <h2 className="font-display text-[17px] text-purple font-semibold">
                  Saved for later{" "}
                  <span className="font-ui text-[13px] font-normal text-body-soft">
                    · delivers inside Dhaka only
                  </span>
                </h2>
              </div>
              <div className="space-y-4">
                {cart.held.map((line) => (
                  <CartLine
                    key={line.item.lineId}
                    line={line}
                    onQty={(q) => setQty(line.item.lineId, q)}
                    onRemove={() => remove(line.item.lineId)}
                    onRemoveAddon={(k) => removeAddon(line.item.lineId, k)}
                    onUpgrade={(sizeId) => setSize(line.item.lineId, sizeId)}
                    onSwitchToDhaka={() => setZone("dhaka")}
                  />
                ))}
              </div>
            </section>
          )}

          <CrossSell items={xsell} onAdd={onCrossSellAdd} />
        </div>

        <CartSummary cart={cart} quote={quote} quoting={quoting} />
      </div>

      <CartSticky cart={cart} quote={quote} />
    </>
  );
}
