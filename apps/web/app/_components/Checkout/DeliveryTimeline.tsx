"use client";

import type { IconName } from "../../_data/productDetails";
import Icon from "../Pdp/PdpIcons";

/*
  ═══════════════════════════════════════════════════════════════════
  7-STAGE ORDER TRACKER (locked, 14 July — the owner)

  The board had 4 stages. The real Operations flow is 7 — and the two photos
  are stages of their own, because each photo is its own moment for the
  customer (each sends its own WhatsApp notification too).

  With photo updates switched off, stages 4 and 7 do not exist — the timeline
  never shows a promise the shop is not making.

  Checkout (stage=0) → a preview. Order Success (stage=1) → the first turns
  green.
  ═══════════════════════════════════════════════════════════════════
*/

export interface TimelineStage {
  key: string;
  icon: IconName;
  title: string;
  sub: string;
  /** dropped when photo updates are off */
  photo?: boolean;
}

export function stages(args: { outAt: string; doneAt: string }): TimelineStage[] {
  return [
    { key: "placed", icon: "check", title: "Order placed", sub: "Confirmation on WhatsApp" },
    { key: "confirmed", icon: "shield", title: "Confirmed", sub: "Payment verified, slot locked" },
    { key: "ready", icon: "heart", title: "Ready", sub: "Hand-arranged at our Dhaka studio" },
    {
      key: "prep-photo",
      icon: "camera",
      title: "Preparation photo shared",
      sub: "See it before it leaves us",
      photo: true,
    },
    { key: "out", icon: "truck", title: "Out for delivery", sub: args.outAt },
    { key: "delivered", icon: "gift", title: "Delivered", sub: args.doneAt },
    {
      key: "delivery-photo",
      icon: "camera",
      title: "Delivery photo shared",
      sub: "The moment they opened it",
      photo: true,
    },
  ];
}

export default function DeliveryTimeline({
  stage,
  photos,
  outAt,
  doneAt,
  title = "Your Delivery Timeline",
}: {
  /** how many stages are done */
  stage: number;
  photos: boolean;
  outAt: string;
  doneAt: string;
  title?: string;
}) {
  const list = stages({ outAt, doneAt }).filter((s) => photos || !s.photo);

  return (
    <section className="bg-white rounded-[24px] border-[1.5px] border-lavender-deep p-5 sm:p-6">
      <h3 className="flex items-center gap-2 font-display text-[17px] text-purple font-semibold mb-4">
        <Icon name="clock" className="w-[18px] h-[18px] text-orchid" />
        {title}
      </h3>

      <ol className="relative">
        {list.map((s, i) => {
          const done = i < stage;
          const last = i === list.length - 1;

          return (
            <li key={s.key} className="flex gap-3.5 pb-4 last:pb-0 relative">
              {!last && (
                <span
                  className={`absolute left-[15px] top-[32px] bottom-0 w-[2px] ${
                    done ? "bg-[#C4EED4]" : "bg-lavender-deep"
                  }`}
                />
              )}

              <span
                className={`relative z-[1] w-8 h-8 rounded-full grid place-items-center shrink-0 border-[1.5px] ${
                  done
                    ? "bg-[#E8F9EE] border-[#C4EED4] text-[#0E7A3D]"
                    : "bg-lavender border-lavender-deep text-body-soft"
                }`}
              >
                <Icon name={s.icon} className="w-[15px] h-[15px]" />
              </span>

              <span className="pt-1">
                <span
                  className={`block text-[13.5px] font-semibold ${
                    done ? "text-purple" : "text-body"
                  }`}
                >
                  {s.title}
                </span>
                <span className="block text-[12px] text-body-soft">{s.sub}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
