"use client";

import { defaultPayment, paymentOptions, type PaymentId } from "../../_data/payment";
import type { ResolvedLine } from "../../_data/cart";
import { useCheckoutStore } from "../../_store/useCheckoutStore";
import Icon from "../Pdp/PdpIcons";
import { Continue, QCard } from "./CheckoutFields";

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

export function Q5Payment({ lines }: { lines: Pick<ResolvedLine, "detail">[] }) {
  const s = useCheckoutStore();

  const options = paymentOptions({ isGift: s.isGift, lines });
  const active: PaymentId =
    options.find((o) => o.method.id === s.payment && o.available)?.method.id ??
    defaultPayment(options);

  function onContinue() {
    s.patch({ payment: active });
    s.completeStep(5);
    /* The "One Last Look" card is mounting right now — scroll after the
       render, or the element is not in the DOM yet and nothing happens. */
    setTimeout(
      () => document.getElementById("review")?.scrollIntoView({ behavior: "smooth" }),
      80,
    );
  }

  const note = options.find((o) => o.method.id === active)?.method.note;

  return (
    <QCard
      n={5}
      title="Payment"
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

      <Continue label="Review order" onClick={onContinue} />
    </QCard>
  );
}
