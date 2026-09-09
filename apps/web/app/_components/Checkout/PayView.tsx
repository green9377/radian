"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  createPaymentSessionByNo,
  fetchAmountDue,
  type AmountDue,
} from "../../_data/checkoutApi";
import { formatTaka } from "../../_data/products";
import PayMarks from "../Common/PayMarks";
import Icon from "../Pdp/PdpIcons";

/*
  ═══════════════════════════════════════════════════════════════════════════
  `/pay/{orderNo}` — the page for an order whose money never arrived.

  ⚠️ IT SAYS ONE THING AND STOPS (owner, 9 Sep 2026): *"ato text ta — just
  simple text je tmr payment hoy nai, akhon abr payment kro, shes kahini."*

  What went: a red alarm panel, four lines of reassurance, and a headline that
  told the customer off. What is left is what somebody in that moment needs —
  the order number, one sentence, the amount, one button.

  ⚠️ AND THE HEADLINE IS NOT AN ACCUSATION. "Payment did not go through" was
  the shop pointing at the customer; *"Let's finish your payment"* is the shop
  standing beside him. Same fact, and one of them loses the order.

  ⚠️ THE PAYMENT MARKS ARE `Common/PayMarks` — the one row the footer and the
  checkout draw too, fed by Admin → Storefront → Footer. Nothing here claims a
  method the shop no longer takes.

  ⚠️ NOTHING PERSONAL IS SHOWN — not the name, not the address, not what was
  bought. Only the order number and what is owed. This link travels over SMS
  and WhatsApp, and those end up in the wrong hands.

  ⚠️ Three endings are still spelled out separately, because all three happen:
  the money arrived in the meantime, the order was cancelled, or it is cash on
  delivery and there is nothing to pay here.
  ═══════════════════════════════════════════════════════════════════════════
*/

export default function PayView({ orderNo }: { orderNo: string }) {
  const [due, setDue] = useState<AmountDue | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    fetchAmountDue(orderNo).then((d) => {
      if (!stale) setDue(d);
    });
    return () => {
      stale = true;
    };
  }, [orderNo]);

  async function pay() {
    setBusy(true);
    setError(null);
    const s = await createPaymentSessionByNo(orderNo);
    if (s.ok) {
      window.location.href = s.data.gatewayUrl;
      return;
    }
    setBusy(false);
    setError(
      s.message ||
        "We couldn't open the payment page just now. Please call us and we will finish it for you.",
    );
  }

  const shell = (children: React.ReactNode) => (
    <main className="min-h-[72vh] bg-lavender/40 flex items-center justify-center px-5 py-14">
      <div className="w-full max-w-[440px] rounded-[26px] bg-white border-[1.5px] border-lavender-deep p-7 sm:p-8 shadow-[0_18px_50px_rgba(71,0,102,0.12)]">
        {children}
      </div>
    </main>
  );

  const backHome = (
    <Link
      href="/"
      className="mt-6 inline-block text-[13.5px] font-bold text-purple hover:text-orchid"
    >
      Back to the shop →
    </Link>
  );

  if (due === undefined) {
    return shell(
      <p className="text-center text-[14px] text-body-soft py-6">Checking your order…</p>,
    );
  }

  if (!due || !due.found) {
    return shell(
      <>
        <h1 className="font-display text-[23px] text-purple">
          We couldn&rsquo;t find that order
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-body">
          Order <b className="text-purple">{orderNo}</b> isn&rsquo;t one we can see. Please
          check the number from your message — or call us and we will sort it out.
        </p>
        {backHome}
      </>,
    );
  }

  const settled = due.paid || due.cancelled || due.isCod;

  if (settled) {
    return shell(
      <>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-orchid">
          Order {due.orderNo}
        </p>
        {due.paid ? (
          <>
            <h1 className="mt-2 font-display text-[24px] text-purple">This is already paid</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-body">
              Nothing more to do — thank you. We&rsquo;ll message you when your order is on
              its way.
            </p>
          </>
        ) : due.cancelled ? (
          <>
            <h1 className="mt-2 font-display text-[24px] text-purple">
              This order was cancelled
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-body">
              No payment is needed. If that&rsquo;s a surprise, please call us — we&rsquo;ll
              happily place it again.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-2 font-display text-[24px] text-purple">Pay on delivery</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-body">
              This order is cash on delivery — {formatTaka(due.duePaisa ?? 0)} to our rider
              when it arrives. There&rsquo;s nothing to pay here.
            </p>
          </>
        )}
        {backHome}
      </>,
    );
  }

  return shell(
    <>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-orchid">
        Order {due.orderNo}
      </p>

      <h1 className="mt-2 font-display text-[27px] leading-tight text-purple">
        Let&rsquo;s finish your payment
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-body-soft">
        Your payment didn&rsquo;t complete, so nothing has been charged yet.
      </p>

      <div className="mt-[18px] rounded-[20px] bg-lavender border-[1.5px] border-lavender-deep px-5 py-4">
        <span className="block text-[12px] font-bold text-body-soft">Amount due</span>
        <b className="block font-display text-[33px] leading-tight text-purple">
          {formatTaka(due.duePaisa ?? 0)}
        </b>
      </div>

      <button
        type="button"
        onClick={() => void pay()}
        disabled={busy}
        className="mt-[18px] w-full rounded-[18px] bg-purple py-4 text-[15.5px] font-bold text-white shadow-[0_10px_28px_rgba(71,0,102,0.28)] transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? "Opening secure payment…" : "Pay now"}
      </button>

      {error && <p className="mt-3 text-[12.5px] leading-relaxed text-[#8A1220]">{error}</p>}

      <PayMarks className="mt-4" />

      <p className="mt-3 flex items-center justify-center gap-[7px] text-[11.5px] text-body-soft">
        <Icon name="lock" className="w-[15px] h-[15px] text-[#0E7A3D]" />
        <span>
          Secured by <b className="text-purple font-bold">SSLCommerz</b> · 256-bit encrypted
        </span>
      </p>
    </>,
  );
}
