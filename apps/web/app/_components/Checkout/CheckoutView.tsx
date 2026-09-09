"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { resolveCart, type ResolvedCart } from "../../_data/cart";
import { track } from "../../_data/tracking";
import {
  METHODS,
  cartLeadDays,
  cartSpeeds,
  findSlot,
  methodsForZone,
  toLiveMethods,
  type LiveMethod,
} from "../../_data/delivery";
import { getDeliveryOptions, getShopCard, type ShopCard } from "../../_data/shop";
import {
  createPaymentSession,
  fetchQuote,
  placeOrder,
  toQuoteItems,
  zoneCodeFor,
  type Quote,
} from "../../_data/checkoutApi";
import { buildOrder, checkoutTotals, etaText } from "../../_data/order";
import { defaultPayment, paymentOptions } from "../../_data/payment";
import { useCartHydrated, useCartStore } from "../../_store/useCartStore";
import {
  normalizeBdPhone,
  normalizePhone,
  useCheckoutHydrated,
  useCheckoutStore,
  validateStep,
} from "../../_store/useCheckoutStore";
import { useOrderStore } from "../../_store/useOrderStore";
import { useRecipientBook } from "../../_store/useRecipientBook";
import { useAttribution } from "../../_store/useAttribution";
import { clientKey, useCheckoutLead } from "../../_store/useCheckoutLead";
import { useZoneStore } from "../../_store/useZoneStore";
import Icon from "../Pdp/PdpIcons";
import { CheckoutSticky, CheckoutSummary } from "./CheckoutSummary";
import { Q3Where, Q5When } from "./CheckoutDelivery";
import { Q5Payment } from "./CheckoutPayment";
import { Q1Details, Q2Receiving } from "./CheckoutSteps";
import { Q4Message } from "./CheckoutMessage";
import { CheckoutGrid } from "./CheckoutFields";

/*
  ═══════════════════════════════════════════════════════════════════
  CHECKOUT — orchestrator

  ★ Six steps: Details → Receiver → Where → Card Message → When → Payment
  The card message is drawn only for a gift (`shown`, below).

  ★ The delivery timeline is **not** here (locked, 14 July)
  Showing a timeline before the order is confirmed is promising something that
  has not happened yet. The timeline lives only on /order-success.

  ★ An empty cart → /cart. But on a zone conflict, **no redirect** — choosing
  All Bangladesh used to empty a Dhaka-only cart and throw checkout out to
  /cart. Now it is said on this page, with a way back.

  ★ Prices: resolveCart() → checkoutTotals(). Checkout adds nothing up itself.
  ═══════════════════════════════════════════════════════════════════
*/

/**
 * The card, exactly as it will be hand-written: the message, and under it the
 * signature — unless they asked for it to go unsigned.
 *
 * Empty message + a name is not a card: nobody sends a bouquet whose card says
 * only "— Sobuj". So a signature alone is dropped.
 */
function cardMessage(c: {
  giftMessage: string;
  signedName: string;
  anonymousGift: boolean;
}): string | undefined {
  const body = c.giftMessage.trim();
  if (!body) return undefined;
  /*  ⚠️ "Send anonymously" (step 2) and "Don't show my name" (step 4) are the
      same flag, and it wins over whatever is typed in From — the field keeps
      its text so unticking restores the name, but nothing signed reaches the
      shop while the flag is on.  */
  if (c.anonymousGift) return body;
  const signed = c.signedName.trim();
  return signed ? `${body}\n— ${signed}` : body;
}

export default function CheckoutView() {
  const router = useRouter();

  const cartHydrated = useCartHydrated();
  const checkoutHydrated = useCheckoutHydrated();

  const items = useCartStore((s) => s.items);
  const couponCode = useCartStore((s) => s.couponCode);
  const rejectCoupon = useCartStore((s) => s.rejectCoupon);
  const clearCart = useCartStore((s) => s.clear);

  const { zone } = useZoneStore();
  const c = useCheckoutStore();
  const place = useOrderStore((s) => s.place);

  const [placing, setPlacing] = useState(false);
  /**
   * Why the shop would not take the order — in its own words.
   *
   * ⚠️ Without this field the refusals appeared nowhere. The server would turn
   * it away with "out of stock — cannot order: Custom Chocolate Cake" or "COD
   * not allowed with a crafted line", and the customer would just see the
   * button doing nothing.
   */
  const [placeError, setPlaceError] = useState<string | null>(null);

  /*
    ⚠️ `useMemo` → fetch-in-effect, 31 Jul 2026, for the same reason as the
    cart page: `resolveCart` reads the real catalogue now.

    `stale` guards the race — the zone can change while a request is in flight,
    and on THIS page a late answer would repaint the amount somebody is about
    to pay.
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

  useEffect(() => {
    track("InitiateCheckout", { num_items: items.length });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /*
    ── the delivery module's real menu · DEC-DLV-009 / DEC-DLV-010 ───────────
    Owner (translated): *"whatever is edited or changed in the delivery module
    should work automatically across the whole system."*

    ⚠️ This list was hand-written in `_data/delivery.ts` all this time. Same Day
    was ৳200 in the admin and ৳60 here — one thing with two prices, and the
    customer paid the wrong one. The 3-Hour Express the owner created was not
    here at all.

    ⚠️ Re-read when the zone changes, because prices are per zone. `stale`
    stands guard — so a late answer does not put an old price on top of the new
    zone's.
  */
  const [liveMethods, setLiveMethods] = useState<LiveMethod[] | null>(null);

  /*  The shop itself, for "collect from shop" — its address, hours and map
      link all come from Shop settings, so nothing about the shop is written
      on this screen (owner, 9 Sep 2026).  */
  const [shop, setShop] = useState<ShopCard | null>(null);
  useEffect(() => {
    let stale = false;
    getShopCard().then((c) => {
      if (!stale && c) setShop(c);
    });
    return () => {
      stale = true;
    };
  }, []);
  /*  DEC-DLV-011 — the cart's slugs are sent too: only deliveries ticked on
      *every* product in the cart reach the menu. "multi product hole win hobe
      se method je method-e sobgula product delivery possible" — the owner
      ("with multiple products, the winning method is the one under which every
      product can be delivered"). The dependency is the joined string, not the
      array — an array is a new reference on every render and caused endless
      re-fetching.  */
  const cartSlugKey = useMemo(
    () => [...new Set(items.map((i) => i.slug))].sort().join(","),
    [items],
  );
  useEffect(() => {
    let stale = false;
    const slugs = cartSlugKey ? cartSlugKey.split(",") : [];
    getDeliveryOptions(zone, null, slugs).then((opts) => {
      if (!stale) setLiveMethods(opts ? toLiveMethods(opts) : []);
    });
    return () => {
      stale = true;
    };
  }, [zone, cartSlugKey]);

  /**
   * Is `method` a real `DeliveryMethod` row, or a placeholder name standing in
   * until the API answers?
   *
   * ⚠️ Without this distinction a word like `"scheduled"` gets sent to the
   * server, and it rightly returns a 400 — there is no row without a cuid.
   */
  const liveMethodPicked = Boolean(liveMethods && liveMethods.length > 0);

  /* a method that does not run in this zone (courier ⇄ dhaka) cannot stay selected */
  const method = useMemo(() => {
    /*  The API has not answered yet → the old list holds the place so the
        screen is not empty. The real prices drop in the moment it answers.  */
    const allowed = liveMethods && liveMethods.length > 0 ? liveMethods : methodsForZone(zone);
    /*  ⚠️ `Q5When` does these exact same three steps. If the two differ, the
        screen shows one method while the price/receipt says another.  */
    return allowed.find((m) => m.id === c.method) ?? allowed[0] ?? METHODS[1];
  }, [zone, c.method, liveMethods]);

  /*
    ═══ THE DISCOUNT, FROM THE SHOP — 3 Aug 2026 ═══

    This screen used to decide its own. `checkoutTotals()` called
    `applyCoupon()`, which checked the code against three constants in
    `_data/promo.ts`, and the page then promised money off in the shop's name.

    It was caught in the browser, not in review: with two bouquets in the cart
    this page showed **"Coupon NEW15 − ৳540"** and a Place Order button reading
    **৳3,210**, while `/shop/checkout/quote` answered *"code NEW15 does not
    exist"* and would have charged **৳3,750**. Every coupon on this page was a
    promise the shop had never made and would never honour — the customer finds
    out at the door, or the shop eats ৳540 to keep the peace. Both are worse
    than the code simply not working.

    ⚠️ THE PHONE GOES WITH IT, and that is not optional. Offers judged against
    a person — first order, per-customer limits (OFR-R02/R06) — cannot be
    scored for a stranger, so a quote without the number comes back too high
    and the total drops after the order is placed. This screen has the number;
    it sends it as soon as it is a plausible one.

    ⚠️ Delivery is NOT taken from this quote. `quoteDelivery` inside
    `checkoutTotals` already reads the live `DeliveryMethod` row the customer
    picked (DEC-DLV-009), and it knows which row that is — the quote endpoint
    would only know if we sent the id, and the two must not both be authorities
    on the same number. The server re-reads that fee at order time anyway.
  */
  const phoneForOffers =
    c.senderPhone.replace(/\D/g, "").length >= 10
      ? `${c.senderDial}${c.senderPhone.replace(/\D/g, "").replace(/^0+/, "")}`
      : undefined;

  const [quote, setQuote] = useState<Quote | null>(null);
  useEffect(() => {
    if (items.length === 0) return;
    let stale = false;
    fetchQuote({
      items: toQuoteItems(items),
      zone: zoneCodeFor(zone),
      couponCode: couponCode ?? undefined,
      paymentMethod: c.payment === "cod" ? "cod" : "online",
      phone: phoneForOffers,
      /*  So the server prices the same cart the screen is showing: with no
          delivery charge, a FREE_DELIVERY offer has nothing to waive.  */
      collect: c.collect,
      /*
        ⚠️ THE DELIVERY GOES WITH THE QUOTE, and it must.

        A FREE_DELIVERY offer waives `min(offer, delivery fee)`. Quote without
        telling the server which delivery was picked and that fee is zero, so
        the waiver is zero, and a real free-delivery offer would silently never
        apply. `method.id` is `DeliveryMethod.id` — `rateId` from
        `/shop/delivery-options`, the same row the fee on screen came from.
      */
      /*
        ⚠️ ONLY WHEN IT IS A REAL ROW — caught in the browser, 3 Aug 2026.

        Until `/shop/delivery-options` answers, `method` is a placeholder from
        the hard-coded `METHODS` list, whose ids are words like `"scheduled"`.
        Sending one of those made the server answer *400 — that delivery option
        is no longer available*, so the very first quote of every checkout
        failed and the panel had no total until the second one landed.

        `liveMethodPicked` is false for exactly that window. Quoting without a
        delivery id is honest — it means "no delivery chosen yet" — and the
        real fee arrives one render later with the masters.
      */
      deliveryMethodId: liveMethodPicked ? method.id : undefined,
      deliverySlotId: liveMethodPicked ? (c.slotId ?? undefined) : undefined,
    }).then((q) => {
      if (stale) return;
      setQuote(q);
      /*  R3 — a code the shop refused is dropped here too; the checkout can
          be reached with one already sitting in the store.  */
      if (q?.couponError && couponCode) rejectCoupon(couponCode, q.couponError);
    });
    return () => {
      stale = true;
    };
  }, [items, zone, couponCode, c.payment, c.collect, phoneForOffers, method.id, c.slotId, liveMethodPicked, rejectCoupon]);

  const totals = useMemo(
    () =>
      /*  ⚠️ The whole `method` is passed, not just the id — the price belongs
        to the delivery module now, and if `quoteDelivery` looked the id up in
        the hand-written list it would find that ৳60 all over again.  */
    cart
      ? checkoutTotals({
          cart,
          zone,
          method: method.id,
          methodOverride: method,
          /*  the only thing collecting changes on this screen (9 Sep 2026)  */
          collect: c.collect,
          couponCode,
          serverDiscount: quote
            ? {
                discountPaisa: quote.discountPaisa,
                couponCode: quote.applied.find((a) => a.code)?.code ?? null,
                deliveryWaivedPaisa: quote.deliveryWaivedPaisa,
              }
            : null,
        })
      : null,
    /*  ⚠️ `c.collect` BELONGS HERE, and its absence was caught by walking the
        screen: the summary said "Collection · 3 Hours Delivery — ৳350". The
        label had switched and the charge had not, because this memo never
        re-ran. A value read inside a memo and missing from its dependencies is
        a value that is right once and stale for ever after.  */
    [cart, zone, method, couponCode, quote, c.collect],
  );

  /*
    ── HOLDING ON TO AN UNFINISHED CHECKOUT · DEC-WA-004, DEC-WA-008 ────────
    The owner's instruction, 6 Aug (translated): "whatever the customer types,
    we take it", and the effort to turn them into a customer runs for 90 days.

    ⚠️ There is no card/CVV/OTP field here and there never will be — the money
    page is SSLCommerz's own. The same sieve is on the server too, because
    security cannot rest on trusting the browser to behave.

    ⚠️ Sent 1.5 seconds after typing stops, and never the same text twice
    (handled inside the hook).
  */
  useCheckoutLead(
    cart && (c.senderPhone.trim() || c.senderName.trim())
      ? {
          name: c.senderName.trim() || undefined,
          phone: normalizeBdPhone(c.senderPhone) ?? (c.senderPhone.trim() || undefined),
          email: c.senderEmail.trim() || undefined,
          stage: c.step >= 6 ? "PAYMENT" : c.step >= 3 ? "DELIVERY" : "DETAILS",
          /*  Whatever was typed — this is what staff need when they call: who
              it is for, where, and when.  */
          draft: {
            isGift: c.isGift,
            recipientName: c.recipientName?.trim() || undefined,
            recipientPhone: c.recipientPhone?.trim() || undefined,
            address: c.address?.trim() || undefined,
            deliveryNotes: c.deliveryNotes?.trim() || undefined,
            date: c.date ?? undefined,
            zone: zoneCodeFor(zone),
            methodLabel: method?.label,
            step: c.step,
          },
          /*  ⚠️ Two pictures for two jobs — neither can do the other's.

              `summary` is for people to read: what staff see when they call to
              ask "what did they leave behind". Names, sizes, colours — not
              ids.

              `items` is for the machine: restoring the cart exactly on the
              `/cart/{id}` page needs sizeId, variantId, addons — all of it.
              Keeping only `summary` left the message's "Return to cart" button
              dropping the customer into an empty cart.  */
          cart: {
            items: cart.lines.map((l) => l.item),
            summary: cart.lines.map((l) => ({
              name: l.product.name,
              slug: l.item.slug,
              qty: l.item.qty,
              size: l.size?.label,
              variant: l.variant?.label,
            })),
          },
          itemCount: cart.lines.length,
          totalPaisa: totals?.totalPaisa ?? 0,
        }
      : null,
  );

  /*
    ── HOW LONG THIS BASKET NEEDS ────────────────────────────────────────────
    The largest "days to make" in the cart — NOT the sum. Three items that each
    take two days are made in parallel by different hands; adding them would
    push every mixed basket weeks out.

    ⚠️ HELD LINES ARE ALREADY EXCLUDED. `cart.lines` holds only what this zone
    can actually receive; a Dhaka-only item sitting in `cart.held` must not push
    out the date of a nationwide order it is not part of.

    Computed here, at the one place that owns the resolved cart, and handed to
    step 4. The alternative — each delivery component reaching into the cart for
    itself — is how two screens end up disagreeing about the same date.
  */
  const leadDays = useMemo(
    () => (cart ? cartLeadDays(cart.lines.map((l) => l.detail)) : 0),
    [cart],
  );

  /*  Which line is a pre-order, and from when — so step 4 can say WHY the
      early dates are shut. "Some dates are closed" makes a customer hunt;
      "Velvet Red is a pre-order, we start sending from 5 Sep" lets them
      decide in one read whether to wait or drop it.  */
  const preorder = useMemo(() => {
    if (!cart) return null;
    for (const l of cart.lines) {
      const a = l.detail?.availability;
      if (a?.state === "PRE_ORDER") return { name: l.detail.product.name, backOn: a.backOn };
    }
    return null;
  }, [cart]);

  /*
    Which fast options survive this basket. INTERSECTION — owner's ruling,
    1 Aug 2026: the rule every product agrees on is the one that wins. One
    address, one rider, one journey, so the slowest thing sets the pace.
  */
  const speeds = useMemo(
    () =>
      cart
        ? cartSpeeds(
            cart.lines.map((l) => ({
              name: l.product.name,
              speeds: l.detail.speeds,
            })),
          )
        : undefined,
    [cart],
  );

  /* a completely empty cart — checkout has nothing to do */
  const cartEmpty = cartHydrated && items.length === 0 && !placing;

  /* every item is held in this zone — nothing will be delivered */
  const allHeld = Boolean(cart && cart.lines.length === 0 && cart.held.length > 0);

  useEffect(() => {
    if (cartEmpty) router.replace("/cart");
  }, [cartEmpty, router]);

  /*
    If the user picks All Bangladesh while sitting on step 4/5, that card is
    hidden but the step stays at 4/5 — and then every card is closed and the
    message cannot be seen either. So when allHeld, focus is forced back to Q3.
  */
  useEffect(() => {
    if (allHeld && c.step > 3) c.openStep(3);
  }, [allHeld, c.step, c]);

  /*  `!cart || !totals` joins the guard. Rendering a checkout before the
      catalogue has answered would put a price in front of somebody that the
      next paint changes — the one screen where that must never happen.  */
  if (!cartHydrated || !checkoutHydrated || cartEmpty || !cart || !totals) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <span className="text-[13.5px] text-body-soft">Loading your order…</span>
      </div>
    );
  }

  const eta = etaText({ method, date: c.date, slotId: c.slotId });
  const slot = findSlot(method, c.slotId);
  /*  "Delivery · …" is a lie on an order nobody delivers (9 Sep 2026).  */
  const deliveryLabel = `${c.collect ? "Collection" : "Delivery"} · ${method.label}${
    slot ? `, ${slot.label}` : ""
  }`;

  async function onPlaceOrder() {
    /*  The page does not render without these, but this is a function
        declaration — it is hoisted, so the guard above does not narrow inside
        it. Better an explicit check than a non-null assertion on the two
        values that decide what somebody is charged.  */
    if (!cart || !totals) return;

    /* the accordion can be jumped past — so every step is checked again */
    const state = { ...useCheckoutStore.getState(), method: method.id };

    /*  ⚠️ `leadDays` / `speeds` / `method` — all three are passed. None of them
        used to be, so this final check assumed leadDays 0 and "every speed is
        allowed" — and "Place order" waved through the very date the picker had
        greyed out. Without `method`, step 4 could never pass at all (see the
        note on `ValidateOpts.method`).  */
    const opts = { now: new Date(), leadDays, speeds, method };

    for (const n of [1, 2, 3, 5]) {
      if (Object.keys(validateStep(n, state, opts)).length > 0) {
        c.openStep(n);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
    }

    const options = paymentOptions({ isGift: c.isGift, lines: cart.lines });
    const payment =
      options.find((o) => o.method.id === c.payment && o.available)?.method.id ??
      defaultPayment(options);

    setPlacing(true);
    setPlaceError(null);

    /*
      ═══════════════════════════════════════════════════════════════════════
      THE SWAP, TAKEN 3 Aug 2026 — exactly as the note that stood here foretold.

      What used to happen: `place(order)` wrote the order to `localStorage` and
      the browser went to `/order-success`. Nothing was sent anywhere. The
      `Order` table stayed empty on a live shop, the admin Orders screen never
      saw a single storefront sale, and the order number on the success page
      was invented by `makeOrderId()` in this app — so "Track Order" could
      never find it and neither could support.

      What happens now: `POST /shop/checkout`. The server re-prices the whole
      cart from the database, refuses anything out of stock, enforces the COD
      rules, runs the offer engine, creates the customer from the details typed
      here, and issues the real order number.
      ═══════════════════════════════════════════════════════════════════════
    */
    const senderPhone = normalizePhone(c.senderDial, c.senderPhone);
    if (!senderPhone) {
      setPlacing(false);
      c.openStep(1);
      return;
    }

    const res = await placeOrder({
      items: toQuoteItems(cart.lines.map((l) => l.item)),
      zone: zoneCodeFor(zone),
      deliveryMethodId: method.id,
      deliverySlotId: c.slotId ?? undefined,
      /*  R3 — only a code the last quote actually accepted goes on the order.
          The store already drops a refused one; this is the belt to that
          brace, so a stale code can never be the reason an order fails.  */
      couponCode: quote?.couponError ? undefined : (couponCode ?? undefined),
      paymentMethod: payment === "cod" ? "cod" : "online",

      /*  DEC-RTN-015 part 2 — the credit, with the code that proves the number.
          The server applies whatever it can and says how much; a bad code costs
          the customer nothing but the credit.  */
      useStoreCredit: c.useStoreCredit && c.creditCode.length > 0 ? true : undefined,
      creditCode: c.useStoreCredit && c.creditCode ? c.creditCode : undefined,

      senderName: c.senderName.trim(),
      senderPhone,
      senderEmail: c.senderEmail.trim() || undefined,

      isGift: c.isGift,
      recipientName: c.isGift ? c.recipientName.trim() : undefined,
      recipientPhone: c.isGift
        ? (normalizeBdPhone(c.recipientPhone) ?? undefined)
        : undefined,
      /*  ⚠️ THE SIGNATURE TRAVELS INSIDE THE MESSAGE, on purpose. The card is
          hand-written from this one text, and the studio must not have to
          join two fields (and guess where the dash goes) at the bench. The
          checkout keeps them apart only so the customer can edit the name
          without retyping the message.  */
      giftMessage: c.isGift ? cardMessage(c) : undefined,
      /*  the switch itself, or an empty From — either way no name is printed  */
      anonymousGift: c.isGift ? c.anonymousGift || !c.signedName.trim() : false,
      photoUpdates: c.photoUpdates,

      /*  A collection sends no address: the server puts the shop's own on the
          order, because it is the only one that can be right (9 Sep 2026).  */
      /*  The shop's own address goes on a collected order, and the server puts
          it there — it is the only one that can be right.  */
      address: c.collect ? "" : c.address.trim(),
      collect: c.collect,
      deliveryNotes: c.deliveryNotes.trim() || undefined,
      date: c.date ?? undefined,

      /*  MKT-D02 — which advert/affiliate sent this order. First-touch, a
          30-day memory; with none, the fields go empty, and that is the
          truth.  */
      ...(useAttribution.getState().read() ?? {}),

      /*  DEC-WA-004 — the order happened, so this browser's unfinished row is
          no longer "abandoned". Without sending this, "your cart is waiting"
          would go out 15 minutes later to the very customer who just
          ordered.  */
      clientKey: clientKey() || undefined,

      /*  ⚠️ The number on the button, sent back to be checked against. If the
          shop now works out MORE than this, the order is refused (409) rather
          than placed at a price nobody agreed to. Less is allowed — a welcome
          discount becomes applicable the moment the account is created, and
          paying less than expected harms nobody.  */
      expectedTotalPaisa: totals.totalPaisa,
    });

    if (!res.ok) {
      setPlacing(false);
      /*  The shop's own sentence — "out of stock — cannot order: Custom
          Chocolate Cake", "COD not allowed with a crafted line". Replacing
          these with "something went wrong" would leave the customer with no
          idea what to change.  */
      setPlaceError(res.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    /*
      The receipt the success page reads. Prices are the ones just charged, and
      the id is now the SHOP'S order number, so Track Order finds it.

      ⚠️ THE DISCOUNT IS RE-DERIVED, AND THE FIRST VERSION FORGOT TO — caught on
      the success page, 3 Aug 2026. The receipt read "Subtotal ৳3,600 · Delivery
      ৳150 · **Paid ৳3,210**", three numbers that do not add up, because only
      the total was corrected from the server's answer and the discount row was
      left at zero.

      It is off by exactly the welcome offer. The quote that priced this screen
      was made for a stranger, so OFR-R02 could not apply; placing the order
      created the account, and 15% became due. The shop charging LESS than the
      screen promised is the safe direction — but the receipt still has to show
      where the money went, or it reads like a mistake in the shop's favour.
    */
    const chargedDiscount = Math.max(
      0,
      totals.subtotalPaisa + totals.deliveryPaisa - res.data.totalPaisa,
    );
    place(
      buildOrder({
        cart,
        /*  the receipt shows the card as it was written — signature and all  */
        checkout: {
          ...state,
          method: method.id,
          payment,
          giftMessage: cardMessage(state) ?? "",
        },
        zone: zone ?? "dhaka",
        totals: {
          ...totals,
          discountPaisa: chargedDiscount,
          couponCode: totals.couponCode ?? (chargedDiscount > 0 ? "Offer applied" : null),
          totalPaisa: res.data.totalPaisa,
        },
        payment,
        /*  ⚠️ The receipt writes exactly the row `checkoutTotals` priced.  */
        method,
        orderNo: res.data.orderNo,
      }),
    );
    /*  The recipient goes into the address book — next time they come back in
        one tap ("Send again to"). Only after the ORDER succeeds, never before:
        filing names from failed checkouts would fill the list with guesses.  */
    if (c.isGift && c.recipientName.trim() && c.recipientPhone.trim()) {
      useRecipientBook.getState().remember({
        name: c.recipientName,
        phone: c.recipientPhone,
      });
    }

    clearCart();
    c.resetAfterOrder(); // name/phone/address stay; gift message + slot go

    /*
      ⚠️ THE ORDER EXISTS BEFORE THE MONEY DOES, AND THAT IS THE RIGHT WAY ROUND.

      An unpaid order is a lead the shop can chase; a payment with no order is
      money that has to be found and refunded. So online payment hands off to
      SSLCommerz only after the order is safely written down, and if the
      gateway cannot be reached the customer still lands on a real order that
      the shop can ring them about.
    */
    if (res.data.needsPayment) {
      const session = await createPaymentSession(res.data.orderId);
      if (session.ok) {
        window.location.href = session.data.gatewayUrl;
        return;
      }
      setPlaceError(
        `Your order ${res.data.orderNo} is placed, but we couldn't open the payment page. We'll call you to arrange payment.`,
      );
    }

    router.push("/order-success");
  }

  return (
    <>
      {/*
        ⚠️ Above everything, not tucked beside the button. This is the shop
        saying no — to a shopper who has filled in five steps and is expecting
        a confirmation screen. It has to be the first thing they see.
      */}
      {placeError && (
        <div
          role="alert"
          className="mt-4 rounded-[16px] bg-[#FDECEE] border border-[#F5C2C7] px-4 py-3.5 flex gap-2.5"
        >
          <Icon name="clock" className="w-[18px] h-[18px] text-[#C4172B] shrink-0 mt-[1px]" />
          <p className="text-[13px] text-[#8A1220] leading-snug">
            <b>We couldn&apos;t place this order.</b> {placeError}
          </p>
        </div>
      )}

      {/*
        WHICH STEPS THIS CHECKOUT HAS (owner, 8 Sep 2026)
        · the card (4) only for a gift — there is no card on an order to
          yourself, and an empty step is a step
        · When and Payment leave when every item is held in this zone
        The store is told the same list, because `completeStep` walks to the
        next step that is DRAWN — never blindly to n + 1.
      */}
      <CheckoutGrid
        shown={allHeld ? [1, 2, 3] : c.isGift ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 5, 6]}
      >
        <Q1Details />
        <Q2Receiving />
        <Q3Where
          heldCount={cart.totals.heldQty}
          deliverableCount={cart.totals.activeQty}
          allHeld={allHeld}
          shop={shop}
        />
        {!allHeld && c.isGift && <Q4Message />}

        {/*
          When every item is held in this zone (0 deliverable), showing
          When/Payment is meaningless. The message inside Q3 is enough.
          Switch the zone to Dhaka and allHeld goes false, bringing the
          remaining steps back.
        */}
        {!allHeld && (
          <>
            <Q5When
              subtotalPaisa={totals.subtotalPaisa}
              leadDays={leadDays}
              preorder={preorder}
              speeds={speeds}
              liveMethods={liveMethods}
            />
            <Q5Payment
              lines={cart.lines}
              summary={
                <CheckoutSummary
                  cart={cart}
                  totals={totals}
                  deliveryLabel={deliveryLabel}
                  placing={placing}
                  onPlace={onPlaceOrder}
                  quote={quote}
                />
              }
            />
          </>
        )}
      </CheckoutGrid>

      {!allHeld && (
        <CheckoutSticky
          totals={totals}
          when={eta.done}
          placing={placing}
          onPlace={onPlaceOrder}
        />
      )}
    </>
  );
}
