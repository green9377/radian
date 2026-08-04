"use client";

import { defaultPayment, paymentOptions, type PaymentId } from "../../_data/payment";
import type { CartItem } from "../../_store/useCartStore";
import { useCheckoutStore } from "../../_store/useCheckoutStore";
import Icon from "../Pdp/PdpIcons";
import { Continue, QCard } from "./CheckoutFields";

/*
  Q5 — Payment

  ★ Gateway = SSLCommerz (locked) — তাই দুটোই option: Online Payment + COD।
  Wallet-এর নাম (bKash/Nagad/Rocket) sub-line-এ, আলাদা card নয়: বাছাইটা
  SSLCommerz-এর page-এই হবে, এখানে আবার করালে একই সিদ্ধান্ত দুবার।

  ★ COD (D26): gift order-এ নয় · prepaidOnly product থাকলে নয়।
  Card লুকাই না — ধূসর করে **কারণ** লিখি।

  ★ Promo code এখানে নেই — Order Summary-তে, total-এর ঠিক উপরে (locked)।
  ছাড় যেখানে সংখ্যায় দেখা যায়, কোডও সেখানেই বসা উচিত।
*/

export function Q5Payment({ items }: { items: CartItem[] }) {
  const s = useCheckoutStore();

  const options = paymentOptions({ isGift: s.isGift, items });
  const active: PaymentId =
    options.find((o) => o.method.id === s.payment && o.available)?.method.id ??
    defaultPayment(options);

  function onContinue() {
    s.patch({ payment: active });
    s.completeStep(5);
    /* "One Last Look" card এইমাত্র mount হচ্ছে — render শেষ হওয়ার পরে scroll,
       নইলে element এখনো DOM-এ নেই আর কিছুই হয় না */
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
              className={`text-left rounded-[16px] border-[1.5px] p-4 transition-colors ${
                on
                  ? "border-orchid-mid bg-orchid-soft/50"
                  : available
                    ? "border-lavender-deep bg-white hover:border-orchid-mid"
                    : "border-lavender-deep bg-lavender cursor-not-allowed"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className={`w-10 h-9 rounded-[10px] grid place-items-center text-[11px] font-semibold shrink-0 ${
                    available
                      ? "bg-white text-purple shadow-soft"
                      : "bg-white/60 text-body-soft"
                  }`}
                >
                  {method.logo}
                </span>
                <span
                  className={`text-[14px] font-semibold ${
                    available ? "text-purple" : "text-body-soft"
                  }`}
                >
                  {method.label}
                </span>
                {on && <Icon name="check" className="w-4 h-4 ml-auto text-orchid" />}
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
