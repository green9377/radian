"use client";

import { defaultPayment, paymentOptions, type PaymentId } from "../../_data/payment";
import type { ResolvedLine } from "../../_data/cart";
import { useCheckoutStore } from "../../_store/useCheckoutStore";
import Icon from "../Pdp/PdpIcons";
import PayMarks from "../Common/PayMarks";
import { QCard } from "./CheckoutFields";
import type { ReactNode } from "react";

/*
  Q5 — Payment

  ★ Gateway = SSLCommerz (locked), so there are two options: Online Payment
  and COD. The wallet names (bKash / Nagad / Rocket) live in the sub-line, not
  as cards of their own: that choice is made on SSLCommerz's own page, and
  asking it here would be the same decision twice.

  ★ COD (D26): never on a gift order, never when a prepaidOnly product is in
  the cart.

  ⚠️ WHEN IT CANNOT BE TAKEN IT IS NOT DRAWN AT ALL (owner, 8 Sep 2026):
  *"if cash on is not available then don't show it — hiding is better than
  showing it dead."* It used to be a greyed card with the reason on it, which
  on the last screen before paying reads as a door the customer must think
  about and then be refused by. What is left is what they can actually do:
  one live option, or two.

  ★ No promo code here — it lives in the Order Summary, directly above the
  total (locked). The code belongs where the discount can be seen as a number.
*/

/** the wallets, in their own brand colours */
export function Q5Payment({
  lines,
  summary,
}: {
  lines: Pick<ResolvedLine, "detail">[];
  /** the order lines, the bill and the Place Order button — drawn under the payment choice (7 Sep 2026) */
  summary: ReactNode;
}) {
  const s = useCheckoutStore();

  const all = paymentOptions({ isGift: s.isGift, lines });
  /*  ⚠️ `defaultPayment` still reads the FULL list — it picks the first
      available one, and that answer must not change with what is drawn.  */
  const active: PaymentId =
    all.find((o) => o.method.id === s.payment && o.available)?.method.id ??
    defaultPayment(all);
  const options = all.filter((o) => o.available);

  return (
    <QCard
      n={6}
      title="Payment"
      lead="How would you like to pay?"
      open={s.step === 6}
      done={s.done.includes(6)}
      summary={
        s.payment ? all.find((o) => o.method.id === s.payment)?.method.label : undefined
      }
      onOpen={() => s.openStep(6)}
    >
      <div className={`grid gap-3.5 items-stretch ${options.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {options.map(({ method }) => {
          const on = method.id === active;

          return (
            <button
              key={method.id}
              type="button"
              onClick={() => s.set("payment", method.id)}
              /*  House rule 16 — which one is chosen has to read across the
                  room. The live card takes the brand colour, a heavier border,
                  a soft shadow and a filled radio; the other stays quiet.  */
              className={`text-left rounded-[20px] border-2 p-5 flex flex-col transition-all ${
                on
                  ? "border-purple bg-[linear-gradient(160deg,#FCF3FE_0%,#FFFFFF_78%)] shadow-[0_10px_26px_rgba(71,0,102,0.14)]"
                  : "border-lavender-deep bg-white hover:border-orchid-mid"
              }`}
            >
              <span className="flex items-center gap-3">
                <span
                  className={`w-11 h-11 rounded-[13px] grid place-items-center shrink-0 transition-colors ${
                    on ? "bg-purple text-white shadow-soft" : "bg-lavender text-purple"
                  }`}
                >
                  <Icon
                    name={method.id === "online" ? "lock" : "truck"}
                    className="w-[19px] h-[19px]"
                  />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[17px] font-semibold text-purple leading-tight">
                    {method.label}
                  </span>
                  <span className="block text-[12px] text-body-soft mt-1 leading-snug">
                    {method.sub}
                  </span>
                </span>

                {/*  a radio, not a tick: a tick says "done", and this is a
                     choice between two things.  */}
                <span
                  className={`w-[22px] h-[22px] rounded-full border-2 grid place-items-center shrink-0 self-start transition-colors ${
                    on ? "border-purple" : "border-lavender-deep"
                  }`}
                >
                  {on && <span className="w-[11px] h-[11px] rounded-full bg-purple" />}
                </span>
              </span>

              {/*  the wallets and cards — the same row as /pay and the footer,
                   from the admin's badge list (cash left out: not a way to
                   pay online).  */}
              {method.id === "online" ? (
                <PayMarks align="start" hideCod className="mt-4" />
              ) : (
                <span className="flex flex-wrap items-center gap-1.5 mt-4">
                  <span className="h-[26px] px-2.5 rounded-[8px] inline-flex items-center bg-[#E8F9EE] text-[11px] font-bold text-[#0E7A3D]">
                    Pay at the door
                  </span>
                  <span className="h-[26px] px-2.5 rounded-[8px] inline-flex items-center border border-lavender-deep bg-white text-[11px] font-bold text-body-soft">
                    Cash only
                  </span>
                </span>
              )}

              <span className="mt-4 pt-3 border-t border-lavender-deep flex items-center gap-2 text-[11.5px] text-body-soft">
                <Icon name="shield" className="w-[14px] h-[14px] text-[#0E7A3D] shrink-0" />
                {method.id === "online"
                  ? "Secured by SSLCommerz — we never see your card"
                  : "Please keep the exact amount ready for our rider"}
              </span>
            </button>
          );
        })}
      </div>

      {/*  ⚠️ THE STORE-CREDIT BOX IS GONE FROM THIS SCREEN (owner, 8 Sep 2026:
           *"ata kon dorkar nai thakar"*). "Have store credit with us? — we
           will send a code" asked almost every customer to think about
           something almost none of them has, one press before paying. The
           server side (DEC-RTN-015 part 2) is untouched and the endpoint still
           stands; when credit is worth offering it belongs where the customer
           can SEE a balance — behind a login, not as a question on the last
           screen.  */}

      {/*  7 Sep 2026 — the bill and the button live in this step, the way
          FlowerAura closes: what is going, what it costs, one Place Order.
          The finished steps above are the review; the separate "One Last
          Look" card went with them.  */}
      <div className="mt-6 pt-6 border-t border-lavender-deep">{summary}</div>
    </QCard>
  );
}
