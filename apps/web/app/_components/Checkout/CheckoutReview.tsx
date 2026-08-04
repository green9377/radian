"use client";

import { useRouter } from "next/navigation";

import { formatTaka } from "../../_data/products";
import type { ResolvedCart } from "../../_data/cart";
import type { CheckoutTotals } from "../../_data/order";
import { PAYMENT_METHODS } from "../../_data/payment";
import { findSlot, type DeliveryMethod } from "../../_data/delivery";
import { useCheckoutStore } from "../../_store/useCheckoutStore";
import { useZoneStore } from "../../_store/useZoneStore";
import Icon from "../Pdp/PdpIcons";
import type { IconName } from "../../_data/productDetails";

/*
  ═══════════════════════════════════════════════════════════════════
  ONE LAST LOOK — "Review order" click করার পর

  পাঁচটা accordion বন্ধ হয়ে গেছে, এখন সব তথ্য **এক পাতায়**: কে পাঠাচ্ছে,
  কে পাচ্ছে, কী লেখা কার্ডে, কোথায়, কখন, কীভাবে দাম দেবে, আর কী কী যাচ্ছে।

  ⚠️ প্রতিটা block-এ Edit — সেই step-এ ফেরত নিয়ে যায়। শেষ মুহূর্তে ভুল
  ঠিকানা বা ভুল নাম ধরা পড়লে যেন পুরো form আবার হাঁটতে না হয়।

  এটাই সেই জায়গা যেখানে গোপন সারপ্রাইজের বার্তাটা মানুষ শেষবার পড়ে —
  তাই কার্ডের বার্তাটা আসল কার্ডের মতো করেই দেখাই।
  ═══════════════════════════════════════════════════════════════════
*/

function Block({
  icon,
  title,
  onEdit,
  children,
}: {
  icon: IconName;
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon name={icon} className="w-[15px] h-[15px] text-orchid shrink-0" />
        <span className="text-[12px] font-semibold text-body-soft uppercase tracking-wide">
          {title}
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="ml-auto text-[12.5px] font-semibold text-orchid hover:text-purple transition-colors"
        >
          Edit
        </button>
      </div>
      <div className="text-[13.5px] text-body leading-relaxed">{children}</div>
    </div>
  );
}

export default function CheckoutReview({
  cart,
  totals,
  eta,
  method,
  placing,
  onPlace,
}: {
  cart: ResolvedCart;
  totals: CheckoutTotals;
  eta: { out: string; done: string };
  /**
   * DEC-DLV-009 — CheckoutView যে সারিটা resolve করেছে।
   *
   * ⚠️ আগে এখানে নিজে `getMethod(s.method)` করত। live id হাতে-লেখা তালিকায়
   * মিলত না, তাই "One Last Look"-এ সবসময় *Same Day · ৳60* লেখা থাকত — যে
   * পাতাটার পুরো কাজই হলো "যা হবে ঠিক তাই দেখানো"।
   */
  method: DeliveryMethod;
  placing: boolean;
  onPlace: () => void;
}) {
  const router = useRouter();
  const s = useCheckoutStore();
  const { zone } = useZoneStore();

  const slot = findSlot(method, s.slotId);
  const payment = PAYMENT_METHODS.find((p) => p.id === s.payment);

  /* Edit → সেই card খোলে আর চোখের সামনে চলে আসে */
  function goStep(n: number) {
    s.openStep(n);
    requestAnimationFrame(() =>
      document.getElementById(`step-${n}`)?.scrollIntoView({ behavior: "smooth" }),
    );
  }

  return (
    <section
      id="review"
      className="scroll-mt-[190px] lg:scroll-mt-[200px] bg-white rounded-[24px] border-[1.5px] border-orchid-mid shadow-soft p-5 sm:p-6"
    >
      <h2 className="font-display text-[19px] sm:text-[21px] text-purple font-semibold">
        One Last Look
      </h2>
      <p className="text-[12.5px] text-body-soft mt-1">
        Everything below is exactly what we&apos;ll do. Change anything you need.
      </p>

      <div className="mt-4 divide-y divide-lavender">
        <Block icon="user" title="From" onEdit={() => goStep(1)}>
          <b className="text-purple">{s.senderName}</b> · {s.senderDial} {s.senderPhone}
          {s.senderEmail && <span className="text-body-soft"> · {s.senderEmail}</span>}
          <span className="block text-[12px] text-body-soft">
            All updates go to this WhatsApp number.
          </span>
        </Block>

        <Block icon="gift" title={s.isGift ? "To" : "For"} onEdit={() => goStep(2)}>
          {s.isGift ? (
            <>
              <b className="text-purple">{s.recipientName}</b> · {s.recipientPhone}
              <span className="block text-[12px] text-body-soft">
                Our rider calls them on arrival — never before.
              </span>

              {s.giftMessage && (
                <span className="block mt-2.5 rounded-[14px] bg-lavender border border-lavender-deep px-4 py-3 text-[13.5px] italic">
                  “{s.giftMessage}”
                  <span className="block not-italic text-[12px] text-body-soft mt-1.5">
                    {s.anonymousGift ? "Sent anonymously" : `— ${s.senderName}`}
                  </span>
                </span>
              )}

              <span className="flex flex-wrap gap-1.5 mt-2.5">
                {s.anonymousGift && <Chip icon="eye-off" label="Anonymous gift" />}
                {s.photoUpdates && <Chip icon="camera" label="Photo updates on" />}
              </span>
            </>
          ) : (
            <>
              <b className="text-purple">Yourself</b>
              {s.photoUpdates && (
                <span className="flex gap-1.5 mt-2">
                  <Chip icon="camera" label="Photo updates on" />
                </span>
              )}
            </>
          )}
        </Block>

        <Block icon="pin" title="Where" onEdit={() => goStep(3)}>
          {s.address}
          <span className="block text-[12px] text-body-soft">
            {zone === "bangladesh" ? "All Bangladesh" : "Inside Dhaka"}
            {s.deliveryNotes && ` · ${s.deliveryNotes}`}
          </span>
        </Block>

        <Block icon="clock" title="When" onEdit={() => goStep(4)}>
          <b className="text-purple">{method.label}</b>
          {slot && ` · ${slot.label}`}
          <span className="block text-[12px] text-body-soft">{eta.done}</span>
        </Block>

        <Block icon="lock" title="Payment" onEdit={() => goStep(5)}>
          <b className="text-purple">{payment?.label}</b>
          <span className="block text-[12px] text-body-soft">{payment?.note}</span>
        </Block>

        {/* item edit = cart (D22 — checkout-এ configurator বসাই না) */}
        <Block
          icon="cart"
          title={`${cart.totals.activeQty} ${cart.totals.activeQty === 1 ? "item" : "items"}`}
          onEdit={() => router.push("/cart")}
        >
          <span className="block space-y-1.5">
            {cart.lines.map((l) => (
              <span key={l.item.lineId} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {l.product.name}
                  <span className="text-body-soft">
                    {" "}
                    · {l.size.label}
                    {l.item.qty > 1 ? ` × ${l.item.qty}` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-semibold text-purple">
                  {formatTaka(l.linePaisa)}
                </span>
              </span>
            ))}
          </span>
        </Block>
      </div>

      <div className="mt-5 pt-4 border-t-[1.5px] border-lavender-deep flex items-center justify-between gap-4">
        <span>
          <span className="block text-[12px] text-body-soft">Total payable</span>
          <span className="font-display text-[26px] text-purple font-semibold leading-tight">
            {formatTaka(totals.totalPaisa)}
          </span>
        </span>

        <button
          type="button"
          onClick={onPlace}
          disabled={placing}
          className="relative overflow-hidden h-[52px] px-7 inline-flex items-center justify-center gap-2 bg-purple text-white rounded-[16px] font-semibold text-[15px] transition-transform active:scale-[0.98] disabled:opacity-70"
        >
          {!placing && (
            <span className="animate-shine pointer-events-none absolute top-0 bottom-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent skew-x-[-18deg]" />
          )}
          {placing ? "Placing your order…" : "Place Order"}
          <Icon name="chev" className="w-4 h-4 -rotate-90" />
        </button>
      </div>
    </section>
  );
}

function Chip({ icon, label }: { icon: IconName; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-orchid-soft text-purple px-3 py-1.5 text-[11.5px] font-semibold">
      <Icon name={icon} className="w-3.5 h-3.5 text-orchid" />
      {label}
    </span>
  );
}
