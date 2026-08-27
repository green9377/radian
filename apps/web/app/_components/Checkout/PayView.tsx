"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  createPaymentSessionByNo,
  fetchAmountDue,
  type AmountDue,
} from "../../_data/checkoutApi";
import { formatTaka } from "../../_data/products";

/*
  ═══════════════════════════════════════════════════════════════════════════
  The finish-paying page — `/pay/{orderNo}`. DEC-WA-002, DEC-WA-003.

  ⚠️ THIS PAGE HAS ONE JOB: ONE BUTTON. The customer has already tried to pay
  once and failed. Put a form, an address or a question in front of them a
  second time and they do not come back. So there are no fields, no
  validation, just "Pay".

  ⚠️ NOTHING PERSONAL IS SHOWN — not the name, not the address, not what they
  bought. Only the order number and what is still owed. This link travels over
  WhatsApp, and a WhatsApp message can end up in the wrong hands.

  ⚠️ Three states are spelled out separately, because all three happen:
     · the money has arrived in the meantime → "already paid", no button
     · the order was cancelled → no button
     · COD → there is nothing to pay online, pay the rider
  Without saying so, the customer presses the button over and over and decides
  the site is broken.
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
    <main className="min-h-[70vh] flex items-center justify-center px-5 py-16">
      <div className="w-full max-w-[440px] rounded-[28px] bg-white p-7 sm:p-9 shadow-[0_18px_50px_rgba(90,40,110,0.10)]">
        {children}
      </div>
    </main>
  );

  if (due === undefined) {
    return shell(
      <p className="text-center text-[14px] text-neutral-500">Checking your order…</p>,
    );
  }

  if (!due || !due.found) {
    return shell(
      <>
        <h1 className="font-display text-[22px] font-bold text-neutral-900">
          We couldn&rsquo;t find that order
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-neutral-600">
          Order <strong>{orderNo}</strong> isn&rsquo;t one we can see. If you have
          the number from your confirmation message, please check it again — or
          call us and we will sort it out.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-[13.5px] font-semibold text-purple-700"
        >
          Back to the shop →
        </Link>
      </>,
    );
  }

  const done = due.paid || due.cancelled || due.isCod;

  return shell(
    <>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-purple-600">
        Order {due.orderNo}
      </p>

      {due.paid ? (
        <>
          <h1 className="mt-2 font-display text-[24px] font-bold text-neutral-900">
            This is already paid
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-neutral-600">
            Nothing more to do — thank you. We&rsquo;ll message you when your
            order is on its way.
          </p>
        </>
      ) : due.cancelled ? (
        <>
          <h1 className="mt-2 font-display text-[24px] font-bold text-neutral-900">
            This order was cancelled
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-neutral-600">
            No payment is needed. If that&rsquo;s a surprise, please call us —
            we&rsquo;ll happily place it again.
          </p>
        </>
      ) : due.isCod ? (
        <>
          <h1 className="mt-2 font-display text-[24px] font-bold text-neutral-900">
            Pay on delivery
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-neutral-600">
            This order is cash on delivery — {formatTaka(due.duePaisa ?? 0)} to
            our rider when it arrives. There&rsquo;s nothing to pay here.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-2 font-display text-[24px] font-bold text-neutral-900">
            Finish your payment
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-neutral-600">
            Your order is saved and waiting. Once the payment is through
            we&rsquo;ll start preparing it right away.
          </p>

          <div className="mt-6 rounded-2xl bg-[#faf7fd] px-5 py-4">
            <p className="text-[12px] font-semibold text-neutral-500">Amount due</p>
            <p className="font-display text-[30px] font-bold leading-tight text-neutral-900">
              {formatTaka(due.duePaisa ?? 0)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void pay()}
            disabled={busy}
            className="mt-6 w-full rounded-2xl bg-gradient-to-r from-[#a021b8] to-[#d98cb3] py-4 text-[15px] font-extrabold text-white shadow-lg transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? "Opening secure payment…" : "Pay now"}
          </button>

          {error && (
            <p className="mt-3 text-[12.5px] leading-relaxed text-rose-700">{error}</p>
          )}

          <p className="mt-4 text-center text-[11.5px] text-neutral-500">
            You&rsquo;ll pay on SSLCommerz — card, bKash, Nagad or Rocket.
          </p>
        </>
      )}

      {done && (
        <Link
          href="/"
          className="mt-6 inline-block text-[13.5px] font-semibold text-purple-700"
        >
          Back to the shop →
        </Link>
      )}
    </>,
  );
}
