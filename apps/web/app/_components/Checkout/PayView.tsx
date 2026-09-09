"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  createPaymentSessionByNo,
  fetchAmountDue,
  type AmountDue,
} from "../../_data/checkoutApi";
import { formatTaka } from "../../_data/products";
import Icon from "../Pdp/PdpIcons";

/*
  ═══════════════════════════════════════════════════════════════════════════
  `/pay/{orderNo}` — where a customer lands when the money did not arrive.

  Two doors open onto this page and they are not the same:

    · the gateway sent them here — Cancel, a declined card, a closed window.
      `from` is set, and the first thing they read is that the payment did
      not go through and the order is NOT confirmed. That is the owner's
      instruction, 9 Sep 2026: *"amn akta page reload kre take nite hobe
      jekhane niye take dekhabe je payment kra lagbe. order hoy nai."*
    · the recovery SMS sent them here, later. No `from`, so no alarm — they
      already know; they came back to finish.

  ⚠️ THIS PAGE HAS ONE JOB: ONE BUTTON. They have already tried to pay once.
  Put a form, an address or a question in front of them a second time and
  they do not come back. No fields, no validation, just "Pay".

  ⚠️ NOTHING PERSONAL IS SHOWN — not the name, not the address, not what they
  bought. Only the order number and what is owed. This link travels over SMS
  and WhatsApp, and those end up in the wrong hands.

  ⚠️ Three endings are spelled out separately, because all three happen:
     · the money arrived in the meantime → "already paid", no button
     · the order was cancelled → no button
     · COD → nothing to pay online, pay the rider
  Without saying so, the customer presses the button again and again and
  decides the shop is broken.
  ═══════════════════════════════════════════════════════════════════════════
*/

export default function PayView({
  orderNo,
  from,
}: {
  orderNo: string;
  /** "cancel" or "fail" when the gateway itself sent them back */
  from?: string;
}) {
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
      <div className="w-full max-w-[470px] rounded-[28px] bg-white border-[1.5px] border-lavender-deep p-7 sm:p-9 shadow-[0_18px_50px_rgba(71,0,102,0.10)]">
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
          Order <b className="text-purple">{orderNo}</b> isn&rsquo;t one we can see.
          Please check the number from your message — or call us and we will sort
          it out.
        </p>
        {backHome}
      </>,
    );
  }

  const settled = due.paid || due.cancelled || due.isCod;

  return shell(
    <>
      {/*  Said first, and said plainly. A customer who was bounced out of the
           gateway is, at this second, wondering whether money left their
           account and whether the flowers are coming. Both answers are here.  */}
      {!settled && from && (
        <div className="mb-5 rounded-[16px] bg-[#FDECEE] border border-[#F5C2C7] px-4 py-3.5 flex gap-2.5">
          <Icon name="clock" className="w-[18px] h-[18px] text-[#C4172B] shrink-0 mt-[1px]" />
          <p className="text-[13px] leading-snug text-[#8A1220]">
            <b>The payment didn&rsquo;t go through, so your order is not confirmed.</b>
            <span className="block mt-1 text-[12.5px]">
              {from === "cancel"
                ? "You came back before paying. Nothing has been charged."
                : "Nothing has been charged."}{" "}
              We&rsquo;ve kept everything you filled in — finish the payment below
              and we&rsquo;ll start preparing it.
            </span>
          </p>
        </div>
      )}

      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-orchid">
        Order {due.orderNo}
      </p>

      {due.paid ? (
        <>
          <h1 className="mt-2 font-display text-[24px] text-purple">This is already paid</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-body">
            Nothing more to do — thank you. We&rsquo;ll message you when your order
            is on its way.
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
      ) : due.isCod ? (
        <>
          <h1 className="mt-2 font-display text-[24px] text-purple">Pay on delivery</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-body">
            This order is cash on delivery — {formatTaka(due.duePaisa ?? 0)} to our
            rider when it arrives. There&rsquo;s nothing to pay here.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-2 font-display text-[26px] leading-tight text-purple">
            Your order isn&rsquo;t confirmed yet
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-body">
            It&rsquo;s saved and waiting for you — nobody else can take it. The moment
            the payment is through, we start preparing it.
          </p>

          <div className="mt-6 rounded-[20px] bg-lavender border-[1.5px] border-lavender-deep px-5 py-4">
            <p className="text-[12px] font-bold text-body-soft">Amount due</p>
            <p className="font-display text-[32px] leading-tight text-purple">
              {formatTaka(due.duePaisa ?? 0)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void pay()}
            disabled={busy}
            className="mt-6 w-full rounded-[18px] bg-purple py-4 text-[15.5px] font-bold text-white shadow-[0_10px_28px_rgba(71,0,102,0.28)] transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? "Opening secure payment…" : "Pay now"}
          </button>

          {error && (
            <p className="mt-3 text-[12.5px] leading-relaxed text-[#8A1220]">{error}</p>
          )}

          <p className="mt-4 text-center text-[11.5px] text-body-soft">
            bKash · Nagad · Rocket · card — on SSLCommerz, one tap and it is done.
          </p>
        </>
      )}

      {settled && backHome}
    </>,
  );
}
