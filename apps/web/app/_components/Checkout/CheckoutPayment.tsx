"use client";

import { defaultPayment, paymentOptions, type PaymentId } from "../../_data/payment";
import type { ResolvedLine } from "../../_data/cart";
import { normalizePhone, useCheckoutStore } from "../../_store/useCheckoutStore";
import Icon from "../Pdp/PdpIcons";
import { QCard } from "./CheckoutFields";
import { useState, type ReactNode } from "react";
import { sendCreditCode } from "../../_data/checkoutApi";

/*
  Q5 — Payment

  ★ Gateway = SSLCommerz (locked), so there are two options: Online Payment
  and COD. The wallet names (bKash / Nagad / Rocket) live in the sub-line, not
  as cards of their own: that choice is made on SSLCommerz's own page, and
  asking it here would be the same decision twice.

  ★ COD (D26): never on a gift order, never when a prepaidOnly product is in
  the cart. The card is not hidden — it is greyed out and it says WHY.

  ★ No promo code here — it lives in the Order Summary, directly above the
  total (locked). The code belongs where the discount can be seen as a number.
*/

export function Q5Payment({
  lines,
  summary,
}: {
  lines: Pick<ResolvedLine, "detail">[];
  /** the order lines, the bill and the Place Order button — drawn under the payment choice (7 Sep 2026) */
  summary: ReactNode;
}) {
  const s = useCheckoutStore();

  const options = paymentOptions({ isGift: s.isGift, lines });
  const active: PaymentId =
    options.find((o) => o.method.id === s.payment && o.available)?.method.id ??
    defaultPayment(options);

  const note = options.find((o) => o.method.id === active)?.method.note;

  return (
    <QCard
      n={5}
      title="Payment & Summary"
      lead="Payment & order summary"
      open={s.step === 5}
      done={s.done.includes(5)}
      summary={
        s.payment ? options.find((o) => o.method.id === s.payment)?.method.label : undefined
      }
      onOpen={() => s.openStep(5)}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        {options.map(({ method, available, reason }) => {
          const on = available && method.id === active;

          return (
            <button
              key={method.id}
              type="button"
              disabled={!available}
              onClick={() => s.set("payment", method.id)}
              /*  House rule 16 — which one is chosen has to read across the
                  room. The live card takes the brand colour, a heavier border
                  and a soft shadow; the others stay quiet. A 1.5px tint change
                  was not enough to tell at a glance, on the one screen where
                  picking the wrong thing costs money.  */
              className={`text-left rounded-[16px] border-2 p-4 transition-all ${
                on
                  ? "border-purple bg-orchid-soft shadow-[0_4px_14px_rgba(122,46,168,0.18)]"
                  : available
                    ? "border-lavender-deep bg-white hover:border-orchid-mid"
                    : "border-lavender-deep bg-lavender cursor-not-allowed"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className={`w-10 h-9 rounded-[10px] grid place-items-center text-[11px] font-semibold shrink-0 ${
                    on
                      ? "bg-purple text-white shadow-soft"
                      : available
                        ? "bg-white text-purple shadow-soft"
                        : "bg-white/60 text-body-soft"
                  }`}
                >
                  {method.logo}
                </span>
                <span
                  className={`text-[14.5px] ${
                    on
                      ? "font-bold text-purple"
                      : available
                        ? "font-semibold text-purple"
                        : "font-semibold text-body-soft"
                  }`}
                >
                  {method.label}
                </span>
                {on && <Icon name="check" className="w-[18px] h-[18px] ml-auto text-purple" />}
              </span>

              <span
                className={`block text-[12px] mt-1.5 leading-snug ${
                  available ? "text-body-soft" : "text-[#8A5A00]"
                }`}
              >
                {available ? method.sub : reason}
              </span>
            </button>
          );
        })}
      </div>

      {note && (
        <p className="flex items-center gap-2 text-[12px] text-body-soft mt-3">
          <Icon name="lock" className="w-4 h-4 text-[#0E7A3D] shrink-0" />
          {note}
        </p>
      )}

      <StoreCredit />

      {/*  7 Sep 2026 — the bill and the button live in this step, the way
          FlowerAura closes: what is going, what it costs, one Place Order.
          The finished steps above are the review; the separate "One Last
          Look" card went with them.  */}
      <div className="mt-6 pt-6 border-t border-lavender-deep">{summary}</div>
    </QCard>
  );
}


/**
 * DEC-RTN-015 part 2 — spending store credit on the website.
 *
 * ⚠️ There is no login here. Identity at checkout is a phone number somebody
 * typed, so if this simply showed a balance, anyone who knows a number could
 * read what that person has saved — and spend it. Hence: nothing is shown and
 * nothing is promised. The customer asks for a code, it goes to their own
 * phone, and it travels with the order. The exact amount taken off appears on
 * the confirmation, from the server's own answer.
 *
 * The order is never at risk: a wrong code, an expired one or an empty balance
 * all place the order anyway, with no credit used (the same rule as the phone
 * check, DEC-WA-010).
 */
function StoreCredit() {
  const s = useCheckoutStore();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const phone = normalizePhone(s.senderDial, s.senderPhone);

  async function ask() {
    if (!phone) return;
    setBusy(true);
    try {
      await sendCreditCode(phone);
      setSent(true);
      s.set("useStoreCredit", true);
    } catch {
      /* the order does not depend on this; silence beats a scary red box */
    } finally {
      setBusy(false);
    }
  }

  if (!phone) return null;

  return (
    <div className="mt-4 rounded-[14px] border border-lavender-deep bg-lavender/40 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-purple m-0">Have store credit with us?</p>
          <p className="text-[12px] text-body-soft m-0 mt-0.5">
            We will send a code to {phone} — credit can only be spent from the phone it belongs to.
          </p>
        </div>
        {!sent && (
          <button
            type="button"
            onClick={ask}
            disabled={busy}
            className="rounded-[11px] border-2 border-purple text-purple font-bold text-[13px] px-4 py-2 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send code"}
          </button>
        )}
      </div>

      {sent && (
        <div className="mt-3">
          <label className="block text-[12px] text-body-soft font-medium mb-1">Code from your phone</label>
          <input
            inputMode="numeric"
            value={s.creditCode}
            onChange={(e) => s.set("creditCode", e.target.value.replace(/\D/g, "").slice(0, 8))}
            className="w-full max-w-[200px] rounded-[11px] border-2 border-lavender-deep px-3 py-2 text-[16px] tracking-[0.3em] font-semibold text-purple"
            placeholder="••••"
          />
          <p className="text-[11.5px] text-body-soft mt-1.5 mb-0">
            Whatever credit you have — up to the shop's share of one bill — comes off automatically.
            Your order goes through either way.
          </p>
        </div>
      )}
    </div>
  );
}
