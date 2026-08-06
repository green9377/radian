"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { resolveCart, type ResolvedCart } from "../../_data/cart";
import {
  METHODS,
  cartLeadDays,
  cartSpeeds,
  findSlot,
  methodsForZone,
  toLiveMethods,
  type LiveMethod,
} from "../../_data/delivery";
import { getDeliveryOptions } from "../../_data/shop";
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
import CheckoutReview from "./CheckoutReview";
import { CheckoutSticky, CheckoutSummary } from "./CheckoutSummary";
import { Q3Where, Q4When } from "./CheckoutDelivery";
import { Q5Payment } from "./CheckoutPayment";
import { Q1Details, Q2Receiving } from "./CheckoutSteps";
import { StepBar } from "./CheckoutFields";

/*
  ═══════════════════════════════════════════════════════════════════
  CHECKOUT — orchestrator

  ★ পাঁচ step: Details → Receiver → Where → When → Payment

  ★ Delivery timeline এখানে **নেই** (locked, 14 July)
  অর্ডার confirm হওয়ার আগে timeline দেখানো মানে যে জিনিস এখনো ঘটেনি
  তার প্রতিশ্রুতি। Timeline শুধু /order-success-এ।

  ★ খালি cart → /cart। কিন্তু zone conflict-এ **redirect নয়** —
  আগে All Bangladesh বাছলে Dhaka-only cart খালি হয়ে checkout /cart-এ
  ছুঁড়ে ফেলত। এখন এই page-এই বলে দিই, আর ফেরার পথ দিই।

  ★ দাম: resolveCart() → checkoutTotals()। Checkout নিজে যোগ করে না।
  ═══════════════════════════════════════════════════════════════════
*/

export default function CheckoutView() {
  const router = useRouter();

  const cartHydrated = useCartHydrated();
  const checkoutHydrated = useCheckoutHydrated();

  const items = useCartStore((s) => s.items);
  const couponCode = useCartStore((s) => s.couponCode);
  const clearCart = useCartStore((s) => s.clear);

  const { zone } = useZoneStore();
  const c = useCheckoutStore();
  const place = useOrderStore((s) => s.place);

  const [placing, setPlacing] = useState(false);
  /**
   * দোকান কেন order নিল না — তার নিজের ভাষায়।
   *
   * ⚠️ এই ঘরটা না থাকলে refusal-গুলো কোথাও দেখাত না। server "out of stock —
   * cannot order: Custom Chocolate Cake" বা "COD not allowed with a crafted
   * line" বলে ফিরিয়ে দিত, আর গ্রাহক শুধু দেখতেন বোতাম টিপে কিছুই হচ্ছে না।
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

  /*
    ── delivery module-এর আসল মেনু · DEC-DLV-009 / DEC-DLV-010 ───────────────
    মালিক: *"delivery module-এ যা edit বা change করা হয়, তা যেন auto পুরা
    system-এ কাজ করে।"*

    ⚠️ এতদিন এই তালিকা `_data/delivery.ts`-এ হাতে লেখা ছিল। admin-এ Same Day
    ৳২০০ আর এখানে ৳৬০ — একই জিনিসের দুই দাম, আর গ্রাহক ভুলটাই দিত। মালিকের
    বানানো 3-Hour Express এখানে ছিলই না।

    ⚠️ zone বদলালে আবার পড়া হয়, কারণ দাম zone-ভিত্তিক। `stale` পাহারা দেয় —
    উত্তর দেরিতে এলে সে যেন নতুন zone-এর দামের উপর পুরনো দাম না বসায়।
  */
  const [liveMethods, setLiveMethods] = useState<LiveMethod[] | null>(null);
  /*  DEC-DLV-011 — cart-এর slug-ও পাঠানো হয়: menu-তে শুধু সেই delivery আসে
      যেটা cart-এর *প্রতিটা* product-এ টিক-দেওয়া। "multi product hole win
      hobe se method je method-এ sobgula product delivery possible" — মালিক।
      slug-এর join-করা string dependency, array নয় — array প্রতি render-এ
      নতুন reference হয়ে অনবরত re-fetch করাত।  */
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
   * `method` কি সত্যিকারের `DeliveryMethod` সারি, নাকি API-র উত্তর আসা পর্যন্ত
   * বসানো একটা অস্থায়ী নাম?
   *
   * ⚠️ এই পার্থক্যটা না রাখলে server-কে `"scheduled"` জাতীয় শব্দ পাঠানো হয়,
   * আর সে যথার্থভাবেই ৪০০ দেয় — cuid ছাড়া কোনো সারি নেই।
   */
  const liveMethodPicked = Boolean(liveMethods && liveMethods.length > 0);

  /* zone-এ যে method চলে না (courier ⇄ dhaka), সেটা বসে থাকতে পারে না */
  const method = useMemo(() => {
    /*  API এখনো উত্তর দেয়নি → পুরনো তালিকা দিয়ে জায়গা ধরে রাখা হয়, যাতে
        পর্দা খালি না দেখায়। উত্তর আসার সাথে সাথেই আসল দাম বসে যায়।  */
    const allowed = liveMethods && liveMethods.length > 0 ? liveMethods : methodsForZone(zone);
    /*  ⚠️ `Q4When`-এ ঠিক এই একই তিন ধাপ। দুই জায়গায় দুই রকম হলে পর্দায় এক
        method আর দাম/রসিদে আরেকটা।  */
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
      if (!stale) setQuote(q);
    });
    return () => {
      stale = true;
    };
  }, [items, zone, couponCode, c.payment, phoneForOffers, method.id, c.slotId, liveMethodPicked]);

  const totals = useMemo(
    () =>
      /*  ⚠️ `method` পুরোটা পাঠানো হয়, শুধু id নয় — দামটা এখন delivery
        module-এর, আর `quoteDelivery` id দেখে হাতে-লেখা তালিকায় খুঁজলে
        আবার সেই ৳৬০-ই পেত।  */
    cart
      ? checkoutTotals({
          cart,
          zone,
          method: method.id,
          methodOverride: method,
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
    [cart, zone, method, couponCode, quote],
  );

  /*
    ── অসমাপ্ত checkout ধরে রাখা · DEC-WA-004, DEC-WA-008 ────────────────────
    মালিকের নির্দেশ ৬ আগস্ট: "customer যা-ই type করুক সেটা আমরা নিয়ে নেব",
    আর ৯০ দিন ধরে তাঁদের গ্রাহকে পরিণত করার চেষ্টা চলবে।

    ⚠️ কার্ড/CVV/OTP-র কোনো ঘর এখানে নেই এবং কখনো থাকবেও না — টাকার পাতাটা
    SSLCommerz-এর নিজের। server-এও একই ছাঁকনি বসানো, কারণ ব্রাউজার ঠিক
    আচরণ করবে সেই ভরসায় নিরাপত্তা রাখা যায় না।

    ⚠️ পাঠানো হয় থামার ১.৫ সেকেন্ড পর, আর একই লেখা দুবার নয় (hook-এর ভেতরে)।
  */
  useCheckoutLead(
    cart && (c.senderPhone.trim() || c.senderName.trim())
      ? {
          name: c.senderName.trim() || undefined,
          phone: normalizeBdPhone(c.senderPhone) ?? (c.senderPhone.trim() || undefined),
          email: c.senderEmail.trim() || undefined,
          stage: c.step >= 5 ? "PAYMENT" : c.step >= 3 ? "DELIVERY" : "DETAILS",
          /*  যা টাইপ করা হয়েছে — staff ফোন করার সময় এগুলোই কাজে লাগে:
              কার জন্য, কোথায়, কবে।  */
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
          /*  cart-এর ছবি সেই মুহূর্তের — staff ফোন করার সময় "উনি কী রেখে
              গিয়েছিলেন" জানার জন্য এটুকুই যথেষ্ট।  */
          cart: cart.lines.map((l) => ({
            name: l.product.name,
            slug: l.item.slug,
            qty: l.item.qty,
            size: l.size?.label,
            variant: l.variant?.label,
          })),
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

  /* একদম খালি cart — checkout-এর কিছুই করার নেই */
  const cartEmpty = cartHydrated && items.length === 0 && !placing;

  /* সব item এই zone-এ আটকে গেছে — কিছুই deliver হবে না */
  const allHeld = Boolean(cart && cart.lines.length === 0 && cart.held.length > 0);

  useEffect(() => {
    if (cartEmpty) router.replace("/cart");
  }, [cartEmpty, router]);

  /*
    User step 4/5-এ থাকা অবস্থায় All Bangladesh বাছলে ওই card লুকিয়ে যায়,
    কিন্তু step রয়ে যায় 4/5 — তখন সব card বন্ধ, message-ও দেখা যায় না।
    তাই allHeld হলে focus জোর করে Q3-এ ফিরিয়ে আনি।
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
  const deliveryLabel = `Delivery · ${method.label}${slot ? `, ${slot.label}` : ""}`;

  async function onPlaceOrder() {
    /*  The page does not render without these, but this is a function
        declaration — it is hoisted, so the guard above does not narrow inside
        it. Better an explicit check than a non-null assertion on the two
        values that decide what somebody is charged.  */
    if (!cart || !totals) return;

    /* accordion লাফিয়ে পার হওয়া যায় — তাই সব step আবার যাচাই */
    const state = { ...useCheckoutStore.getState(), method: method.id };

    /*  ⚠️ `leadDays` / `speeds` / `method` — তিনটাই পাঠানো হয়।
        আগে কিছুই পাঠানো হতো না, তাই এই শেষ যাচাইটা leadDays ০ আর
        "সব speed চলবে" ধরে নিত — picker যে তারিখটা ধূসর করে রেখেছিল, "Place
        order" সেটাই পাশ করিয়ে দিত। আর `method` ছাড়া step 4 কখনো পাশই হতো না
        (দেখুন `ValidateOpts.method`-এর নোট)।  */
    const opts = { now: new Date(), leadDays, speeds, method };

    for (const n of [1, 2, 3, 4]) {
      if (Object.keys(validateStep(n, state, opts)).length > 0) {
        c.openStep(n);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
    }

    const options = paymentOptions({
      isGift: c.isGift,
      items: cart.lines.map((l) => l.item),
    });
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
      couponCode: couponCode ?? undefined,
      paymentMethod: payment === "cod" ? "cod" : "online",

      senderName: c.senderName.trim(),
      senderPhone,
      senderEmail: c.senderEmail.trim() || undefined,

      isGift: c.isGift,
      recipientName: c.isGift ? c.recipientName.trim() : undefined,
      recipientPhone: c.isGift
        ? (normalizeBdPhone(c.recipientPhone) ?? undefined)
        : undefined,
      giftMessage: c.isGift ? c.giftMessage.trim() || undefined : undefined,
      anonymousGift: c.anonymousGift,
      photoUpdates: c.photoUpdates,

      address: c.address.trim(),
      deliveryNotes: c.deliveryNotes.trim() || undefined,
      date: c.date ?? undefined,

      /*  MKT-D02 — এই order-টা কোন বিজ্ঞাপন/affiliate পাঠাল। first-touch,
          ৩০ দিনের স্মৃতি; না থাকলে ঘরগুলো খালি যায়, আর সেটাই সত্যি।  */
      ...(useAttribution.getState().read() ?? {}),

      /*  DEC-WA-004 — order হয়ে গেল, তাই এই ব্রাউজারের অসমাপ্ত সারিটা আর
          "ছেড়ে যাওয়া" নয়। এটা না পাঠালে ১৫ মিনিট পর সদ্য order করা
          গ্রাহকের কাছেই "আপনার cart রাখা আছে" চলে যেত।  */
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
        checkout: { ...state, method: method.id, payment },
        zone: zone ?? "dhaka",
        totals: {
          ...totals,
          discountPaisa: chargedDiscount,
          couponCode: totals.couponCode ?? (chargedDiscount > 0 ? "Offer applied" : null),
          totalPaisa: res.data.totalPaisa,
        },
        payment,
        /*  ⚠️ `checkoutTotals` যে সারিতে দাম কষেছে, রসিদও ঠিক সেটাই লিখবে।  */
        method,
        orderNo: res.data.orderNo,
      }),
    );
    /*  প্রাপক খাতায় উঠলেন — পরের বার এক tap-এ ফিরে আসবেন ("Send again to").
        ORDER সফল হওয়ার পরেই, আগে নয়: ব্যর্থ checkout-এর নাম খাতায় জমলে
        তালিকাটা আন্দাজে ভরে যেত।  */
    if (c.isGift && c.recipientName.trim() && c.recipientPhone.trim()) {
      useRecipientBook.getState().remember({
        name: c.recipientName,
        phone: c.recipientPhone,
      });
    }

    clearCart();
    c.resetAfterOrder(); // নাম/ফোন/ঠিকানা থাকে, gift message + slot যায়

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
      <StepBar step={c.step} done={c.done} />

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

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 lg:gap-8 items-start mt-4">
        <div className="space-y-4">
          <Q1Details />
          <Q2Receiving />
          <Q3Where
            heldCount={cart.totals.heldQty}
            deliverableCount={cart.totals.activeQty}
            allHeld={allHeld}
          />

          {/*
            সব item এই zone-এ আটকে গেলে (deliverable ০) — When/Payment/Review
            দেখানো অর্থহীন। Q3-এর ভেতরের message-ই যথেষ্ট। zone Dhaka করলে
            allHeld false, বাকি step আবার ফিরে আসে।
          */}
          {!allHeld && (
            <>
              <Q4When
                subtotalPaisa={totals.subtotalPaisa}
                leadDays={leadDays}
                speeds={speeds}
                liveMethods={liveMethods}
              />
              <Q5Payment items={cart.lines.map((l) => l.item)} />

              {/* "Review order" চাপার পর — সব তথ্য এক পাতায়, প্রতিটাতে Edit */}
              {c.done.includes(5) && (
                <CheckoutReview
                  cart={cart}
                  totals={totals}
                  eta={eta}
                  method={method}
                  placing={placing}
                  onPlace={onPlaceOrder}
                />
              )}
            </>
          )}
        </div>

        <CheckoutSummary
          cart={cart}
          totals={totals}
          deliveryLabel={deliveryLabel}
          placing={placing}
          onPlace={onPlaceOrder}
          quote={quote}
        />
      </div>

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
