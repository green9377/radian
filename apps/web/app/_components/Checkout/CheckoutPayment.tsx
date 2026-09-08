"use client";

import { defaultPayment, paymentOptions, type PaymentId } from "../../_data/payment";
import type { ResolvedLine } from "../../_data/cart";
import { useCheckoutStore } from "../../_store/useCheckoutStore";
import Icon from "../Pdp/PdpIcons";
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
const WALLETS = [
  { label: "bKash", bg: "#E2136E" },
  { label: "Nagad", bg: "#EE7623" },
  { label: "Rocket", bg: "#8C3494" },
] as const;

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

  const note = all.find((o) => o.method.id === active)?.method.note;

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
      <div className={`grid gap-3 ${options.length > 1 ? "sm:grid-cols-2" : ""}`}>
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

              {/*  the wallets and cards, in their own colours — the row a
                   Bangladeshi shopper looks for before trusting a checkout.
                   Marks, not logos: no image files, nothing to load, and
                   nobody's trademark reproduced.  */}
              {method.id === "online" && available && (
                <span className="flex flex-wrap items-center gap-1.5 mt-3">
                  {WALLETS.map((w) => (
                    <span
                      key={w.label}
                      className="rounded-[7px] px-2 py-1 text-[10.5px] font-bold text-white leading-none"
                      style={{ background: w.bg }}
                    >
                      {w.label}
                    </span>
                  ))}
                  <span className="rounded-[7px] border border-lavender-deep bg-white px-2 py-1 text-[10.5px] font-bold text-[#1A1F71] leading-none">
                    VISA
                  </span>
                  <span className="rounded-[7px] border border-lavender-deep bg-white px-2 py-1 text-[10.5px] font-bold text-[#B34700] leading-none">
                    Mastercard
                  </span>
                </span>
              )}
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
