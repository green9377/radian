"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { formatTaka } from "../../_data/products";
import { API_BASE } from "../../_data/shop";
import { track } from "../../_data/tracking";
import { useOrderHydrated, useOrderStore } from "../../_store/useOrderStore";
import Icon from "../Pdp/PdpIcons";
import ShopIcon from "../ui/ShopIcon";
import DeliveryTimeline from "./DeliveryTimeline";
import TileImage from "../ui/TileImage";

/*
  /order-success — shows what checkout just built.

  ❌ No "Create my account / set a password" CTA (§11 retro-fix) — asking for
     a password before the Auth module exists means creating an account
     nobody can ever sign in to.
  ❌ No "Need Help" section — D19.

  Track this order → /track?id=RAD-XXXXX (delivery timeline).

  ═══════════════════════════════════════════════════════════════════════════
  ⚠️ THE `?id=` IN THE URL DECIDES WHAT IS SHOWN. It did not, until 27 Aug
  2026, and the money circle walk found what that cost.

  This page used to render `useOrderStore.last` — whatever order THIS BROWSER
  placed most recently — and ignore the URL completely. After paying at the
  gateway the customer comes back to `/order-success?id=RAD-74146`, and the
  page showed RAD-82739 with a different receipt: a real test, a real
  mismatch. Three ways that hurts, worst last:

    · the customer reads a number that is not their order, and a total that is
      not what they paid, and concludes the shop is broken
    · on a shared device it is the PREVIOUS person's order — their name, their
      address, their receipt
    · with nothing in local storage — a different device, cleared data, or
      simply a browser that dropped it — `missing` fired and the customer who
      had just paid was redirected to the homepage with no confirmation at all

  So: the local receipt is shown only when it IS the order in the URL.
  Otherwise the page asks the server about that order number and shows the
  little it can prove.

  ⚠️ AND IT SHOWS ONLY THE LITTLE IT CAN PROVE. A `?id=` is a guessable order
  number in an address bar; it is not identity. The confirmed-from-server view
  carries the order number and whether it is paid, and nothing else — no
  receipt, no address, no name. The same reasoning that keeps /track to a
  timeline: that number may be in the receiver's hand, and a surprise must not
  spoil itself.
  ═══════════════════════════════════════════════════════════════════════════
*/

/*
  ─── The code box is GONE — owner, 9 Sep 2026 ─────────────────────────────

  A "Confirm your number" panel stood here, asking the customer to type back a
  six-digit code the checkout had just sent them. Both ends went together:
  *"place order a click krle kon code asbe na."*

  Why it is not a loss. The panel existed so the shop would know the number was
  real — but it learns that anyway, the moment its own messages start arriving,
  and it was asking a favour of somebody who had just finished paying. The code
  also cost an SMS on every first order, including the ones nobody ever paid
  for.

  What proves a number now: signing in, and spending store credit. Both are the
  customer asking the shop for something, which is the right time to ask.
*/

interface PaidCheck {
  found: boolean;
  orderNo?: string;
  duePaisa?: number;
  paid?: boolean;
  cancelled?: boolean;
}

export default function OrderSuccessView() {
  const router = useRouter();
  const params = useSearchParams();
  const hydrated = useOrderHydrated();
  const order = useOrderStore((s) => s.last);

  /*  Upper-cased because order numbers are, and a customer re-typing the link
      by hand should not be told their order does not exist.  */
  const wantedNo = (params.get("id") ?? "").trim().toUpperCase();

  /*  The local receipt is only this order's receipt when the numbers agree.
      With no `?id=` at all the page is being reached straight from checkout,
      where the store IS the order — that path is unchanged.  */
  const localIsTheOne = !!order && (!wantedNo || order.id.toUpperCase() === wantedNo);

  const [remote, setRemote] = useState<PaidCheck | null>(null);
  const needRemote = !!wantedNo && hydrated && !localIsTheOne;

  useEffect(() => {
    if (!needRemote) return;
    let alive = true;
    fetch(`${API_BASE}/shop/payment/due/${encodeURIComponent(wantedNo)}`)
      .then((r) => r.json())
      .then((d: PaidCheck) => { if (alive) setRemote(d); })
      /*  Fail-soft: the money is already taken and the gateway has already
          sent them here. A network hiccup must not turn into a blank page —
          the fallback below still names their order.  */
      .catch(() => { if (alive) setRemote({ found: false }); });
    return () => { alive = false; };
  }, [needRemote, wantedNo]);

  /*  Only send them away when there is genuinely nothing to show: no order in
      this browser AND no order number in the URL.  */
  const missing = hydrated && !order && !wantedNo;

  useEffect(() => {
    if (missing) router.replace("/");
  }, [missing, router]);

  /*
    Purchase — the one event ad platforms actually learn from. Guarded per
    order number: refreshing this page must not count the sale twice.
  */
  useEffect(() => {
    if (!order) return;
    const key = `trk-purchase-${order.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    track("Purchase", {
      transaction_id: order.id,
      value: order.totalPaisa / 100,
      currency: "BDT",
    });
  }, [order]);

  if (!hydrated || (!order && !wantedNo)) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <span className="text-[13.5px] text-body-soft">Loading your order…</span>
      </div>
    );
  }

  /*  Came back from the gateway on a device that does not hold this order —
      or holds a different one. Confirm what the server will confirm, and say
      nothing else.  */
  if (!localIsTheOne) {
    if (!remote) {
      return (
        <div className="min-h-[50vh] grid place-items-center">
          <span className="text-[13.5px] text-body-soft">Checking your order…</span>
        </div>
      );
    }
    const paid = remote.found && remote.paid === true;
    const cancelled = remote.found && remote.cancelled === true;
    return (
      <div className="py-12">
        <div className="text-center max-w-[560px] mx-auto">
          <span
            className={`w-16 h-16 rounded-full grid place-items-center mx-auto ${
              paid ? "bg-[#E8F9EE] text-[#0E7A3D]" : "bg-lavender text-purple"
            }`}
          >
            <Icon name={paid ? "check" : "truck"} className="w-7 h-7" />
          </span>

          <h1 className="font-display text-[30px] sm:text-[36px] text-purple font-semibold mt-5">
            {cancelled
              ? "This Order Was Cancelled"
              : paid
                ? "Payment Received"
                : "Your Order Is Placed"}
          </h1>

          <p className="text-[14.5px] text-body mt-3">
            {cancelled
              ? "Nothing more is owed on it."
              : paid
                ? "Thank you — we have your payment and your order is with our studio."
                : remote.found
                  ? "We have your order. The payment has not reached us yet."
                  : "We could not find that order number. If money left your account, keep this page and contact us."}
          </p>

          <div className="inline-flex flex-wrap items-center justify-center gap-2 mt-5">
            <span className="rounded-full bg-white border-[1.5px] border-lavender-deep px-4 py-2 text-[13px] font-semibold text-purple">
              Order {remote.orderNo ?? wantedNo}
            </span>
            {paid && (
              <span className="rounded-full bg-[#E8F9EE] px-4 py-2 text-[13px] font-semibold text-[#0E7A3D]">
                Paid
              </span>
            )}
          </div>

          {/*  ⚠️ No receipt here, deliberately — see the note at the top. An
               order number in an address bar is not proof of who is holding
               it. The timeline behind Track asks for the phone as well.  */}
          <div className="flex flex-col sm:flex-row gap-2.5 justify-center mt-8">
            <Link
              href={`/track?id=${encodeURIComponent(remote.orderNo ?? wantedNo)}`}
              className="h-[50px] px-6 inline-flex items-center justify-center gap-2 bg-purple text-white rounded-[16px] font-semibold text-[14.5px] hover:bg-purple-deep transition-colors"
            >
              <Icon name="truck" className="w-[18px] h-[18px]" />
              Track this order
            </Link>
            <Link
              href="/"
              className="h-[50px] px-6 inline-flex items-center justify-center gap-2 bg-white border-[1.5px] border-lavender-deep text-purple rounded-[16px] font-semibold text-[14.5px] hover:border-orchid transition-colors"
            >
              Continue shopping
              <Icon name="chev" className="w-4 h-4 -rotate-90" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!order) return null;

  /*  The first name only. "Thank you, Sobuj" is a person speaking; "Thank you,
      Sobuj Gazi" is a form letter.  */
  const firstName = (order.sender.name || "").trim().split(/\s+/)[0] || "there";

  /*  Cash on delivery is the one case where the money has NOT arrived, so the
      green line is replaced by what is still owed. Read from the order's own
      payment method, never guessed from a label.  */
  const isCod = order.payment === "cod";

  return (
    <div className="py-8">
      {/*
        ═══ THE HERO — owner's design, approved 9 Sep 2026 ═══════════════════

        What it replaced: a green tick on a white page under "Your Order Is On
        Its Way". Green is the colour a bank uses to say a transfer cleared,
        and this is the happiest second a flower shop gets. It is the shop's
        own deep purple now, and the headline greets him by name.

        ⚠️ AND IT CONFIRMS THE MONEY, PLAINLY — his instruction: *"mone rakhbe
        tar payment peyechi ata take confirm krba."* That used to be a small
        grey pill in a corner reading "Online". It is a green line of its own,
        directly under the headline, in the shop's own words.
      */}
      <div className="max-w-[620px] mx-auto">
        <div className="relative overflow-hidden rounded-[28px] px-6 sm:px-8 pt-9 pb-8 text-center text-white shadow-[0_18px_50px_rgba(71,0,102,0.14)] bg-[linear-gradient(150deg,#320049_0%,#470066_55%,#5B1279_100%)]">
          {/*  the orchid glow — the same shape the delivery band uses  */}
          <span className="pointer-events-none absolute -top-[150px] -right-[110px] w-[400px] h-[400px] rounded-[50%_50%_50%_0] -rotate-45 bg-orchid/[0.18]" />

          <span className="relative z-[2] w-16 h-16 rounded-full grid place-items-center mx-auto bg-white/[0.14] border-[1.5px] border-orchid-mid/55">
            <Icon name="check" className="w-7 h-7" />
          </span>

          <h1 className="relative z-[2] font-display text-[27px] sm:text-[32px] leading-[1.18] font-semibold mt-4">
            Thank you, {firstName} —
            <br />
            <i className="not-italic text-orchid-mid">your order is confirmed</i>
          </h1>

          {/*  Only when the money is actually in. A COD order says what is owed
              instead, in the band below — never both.  */}
          {!isCod && (
            <span className="relative z-[2] inline-flex items-center gap-2 mt-3.5 rounded-full bg-[#E8F9EE] border border-[#C4EED4] text-[#0E7A3D] px-4 py-2 text-[13.5px] font-bold">
              <Icon name="check" className="w-[18px] h-[18px]" />
              We&rsquo;ve received your {formatTaka(order.totalPaisa)}
            </span>
          )}

          <p className="relative z-[2] text-[14.5px] leading-relaxed text-white/[0.88] mt-3 mx-auto max-w-[430px]">
            {order.isGift && order.recipient?.name
              ? `${order.recipient.name} gets it ${order.etaDone.toLowerCase()}.`
              : `Arriving ${order.etaDone.toLowerCase()}.`}{" "}
            We&rsquo;ll message {order.sender.phone} at every step.
          </p>

          <div className="relative z-[2] flex flex-wrap items-center justify-center gap-2 mt-4">
            <span className="rounded-full bg-white/[0.13] border border-white/[0.22] px-3.5 py-[7px] text-[12.5px] font-bold whitespace-nowrap">
              {order.id}
            </span>
            <span
              className={`rounded-full px-3.5 py-[7px] text-[12.5px] font-bold whitespace-nowrap ${
                isCod
                  ? "bg-[#FFF7E8] border border-[#F2D9A8] text-[#8A5A00]"
                  : "bg-white/[0.13] border border-white/[0.22]"
              }`}
            >
              {isCod ? "Cash on delivery" : order.methodLabel}
            </span>
          </div>
        </div>

        {/*
          ═══ WHAT IS STILL OWED — the owner's Shape A ═════════════════════════

          A cash-on-delivery order has one fact the paid one does not, and a
          customer who does not read it keeps a rider standing at the door. So
          it sits directly under the headline rather than down the page.

          The shape is the house's own (rule 17): a coloured spine on the left,
          the icon in a tinted square, the number large, the explanation quiet.
          The first attempt put a big number beside a paragraph and the two
          fought each other.
        */}
        {isCod && (
          <div className="mt-4 flex overflow-hidden rounded-[22px] border-[1.5px] border-[#F2D9A8] bg-white">
            <span className="w-[6px] shrink-0 bg-[#C08A00]" />
            <span className="flex flex-1 flex-wrap items-center gap-4 px-5 py-4">
              <span className="w-11 h-11 rounded-[14px] bg-[#FFF7E8] text-[#8A5A00] grid place-items-center shrink-0">
                {/*  ⚠️ `ShopIcon`, not this page's `Icon` — PdpIcons has no
                    wallet, and a name it does not know draws nothing at all.  */}
                <ShopIcon name="wallet" className="w-6 h-6" />
              </span>
              <span>
                <span className="block text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-[#8A5A00]/75">
                  Pay the rider
                </span>
                <b className="block font-display text-[30px] leading-none text-[#8A5A00] font-semibold">
                  {formatTaka(order.totalPaisa)}
                </b>
              </span>
              <span className="ml-auto max-w-[210px] text-right text-[12.5px] leading-snug text-body-soft">
                Please keep it ready — our riders carry no change.
              </span>
            </span>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 lg:gap-8 items-start mt-9">
        <div className="space-y-4">
          <DeliveryTimeline
            stage={1}
            photos={order.photoUpdates}
            outAt={order.etaOut}
            doneAt={order.etaDone}
            title="What Happens Next"
          />

          {/* ─── delivery card ─── */}
          <section className="bg-white rounded-[24px] border-[1.5px] border-lavender-deep p-5 sm:p-6">
            <h3 className="flex items-center gap-2 font-display text-[17px] text-purple font-semibold mb-4">
              <Icon name="pin" className="w-[18px] h-[18px] text-orchid" />
              Delivering To
            </h3>

            <dl className="grid sm:grid-cols-2 gap-4 text-[13.5px]">
              <div>
                <dt className="text-body-soft text-[12px]">
                  {order.isGift ? "Receiver" : "You"}
                </dt>
                <dd className="text-purple font-semibold mt-0.5">
                  {order.isGift ? order.recipient?.name : order.sender.name}
                  <span className="block font-normal text-body-soft">
                    {order.isGift ? order.recipient?.phone : order.sender.phone}
                  </span>
                </dd>
              </div>

              <div>
                <dt className="text-body-soft text-[12px]">When</dt>
                <dd className="text-purple font-semibold mt-0.5">
                  {order.etaDone}
                  <span className="block font-normal text-body-soft">
                    {order.methodLabel}
                  </span>
                </dd>
              </div>

              <div className="sm:col-span-2">
                <dt className="text-body-soft text-[12px]">Address</dt>
                <dd className="text-body mt-0.5">{order.address}</dd>
              </div>

              {order.giftMessage && (
                <div className="sm:col-span-2">
                  <dt className="text-body-soft text-[12px]">Card message</dt>
                  <dd className="mt-1 rounded-[14px] bg-lavender border border-lavender-deep px-4 py-3 text-[13.5px] text-body italic">
                    “{order.giftMessage}”
                    <span className="block not-italic text-[12px] text-body-soft mt-1.5">
                      {order.anonymousGift
                        ? "Sent anonymously — your name won't appear"
                        : `— ${order.sender.name}`}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        {/* ─── receipt ─── */}
        <aside className="bg-white border-[1.5px] border-lavender-deep rounded-[24px] p-5 sm:p-6">
          <h2 className="font-display text-[19px] text-purple font-semibold mb-4">
            Your Receipt
          </h2>

          <div className="space-y-3 pb-3 border-b border-lavender">
            {order.lines.map((l) => (
              <div key={l.slug + l.sizeLabel} className="flex items-center gap-3">
                <TileImage src={l.bg} alt="" variant="thumb" className="w-11 h-11 rounded-[12px] shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-purple truncate">
                    {l.name}
                  </span>
                  <span className="block text-[11.5px] text-body-soft truncate">
                    {[l.variantLabel, l.sizeLabel, l.qty > 1 ? `× ${l.qty}` : null, ...l.bundleLabels, ...l.addonLabels]
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
            <div className="flex justify-between py-2.5 text-[13.5px]">
              <span className="text-body-soft">Subtotal</span>
              <span className="text-purple font-semibold">
                {formatTaka(order.subtotalPaisa)}
              </span>
            </div>

            {order.discountPaisa > 0 && (
              <div className="flex justify-between py-2.5 text-[13.5px]">
                <span className="text-body-soft">Coupon {order.couponCode}</span>
                <span className="text-[#0E7A3D] font-semibold">
                  − {formatTaka(order.discountPaisa)}
                </span>
              </div>
            )}

            <div className="flex justify-between py-2.5 text-[13.5px]">
              <span className="text-body-soft">Delivery</span>
              <span
                className={
                  order.deliveryWaivedPaisa > 0
                    ? "text-[#0E7A3D] font-semibold"
                    : "text-purple font-semibold"
                }
              >
                {order.deliveryPaisa === 0 ? "FREE" : formatTaka(order.deliveryPaisa)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t-[1.5px] border-lavender-deep pt-4 mt-2">
            <span className="text-[15px] font-semibold text-purple">Paid</span>
            <span className="font-display text-[24px] text-purple font-semibold">
              {formatTaka(order.totalPaisa)}
            </span>
          </div>

          <p className="text-[12px] text-body-soft mt-1.5">
            {order.payment === "cod"
              ? "Cash on delivery — please keep the exact amount ready."
              : `Paid with ${order.paymentLabel}.`}
          </p>

          <Link
            href={`/track?id=${order.id}`}
            className="w-full mt-5 h-[50px] inline-flex items-center justify-center gap-2 bg-purple text-white rounded-[16px] font-semibold text-[14.5px] hover:bg-purple-deep transition-colors"
          >
            <Icon name="truck" className="w-[18px] h-[18px]" />
            Track this order
          </Link>

          <Link
            href="/"
            className="w-full mt-2.5 h-[50px] inline-flex items-center justify-center gap-2 bg-white border-[1.5px] border-lavender-deep text-purple rounded-[16px] font-semibold text-[14.5px] hover:border-orchid transition-colors"
          >
            Continue shopping
            <Icon name="chev" className="w-4 h-4 -rotate-90" />
          </Link>
        </aside>
      </div>
    </div>
  );
}
