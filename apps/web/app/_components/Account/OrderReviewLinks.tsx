"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { reviewLinks } from "../../_data/checkoutApi";
import type { Order } from "../../_data/order";
import Icon from "../Pdp/PdpIcons";

/*
  DEC-WEB-012 (owner, 6 Sep 2026) — a customer may review only what they
  bought, and only once it has been delivered. This is where that door is:
  on the delivered order, one "Write a review" per product, each opening its
  own single-use invite (/review/<token>). Nothing is drawn before delivery,
  and nothing is drawn for a product not on this order.
*/
export default function OrderReviewLinks({ order }: { order: Order }) {
  const [links, setLinks] = useState<
    { productSlug: string; productName: string; token: string | null; reviewed: boolean }[] | null
  >(null);

  const phone = order.sender.phone;
  const delivered = order.status === "delivered";

  useEffect(() => {
    if (!delivered || !phone || !order.id.startsWith("RAD-")) return;
    let dropped = false;
    reviewLinks(order.id, phone).then((r) => {
      if (!dropped) setLinks(r);
    });
    return () => {
      dropped = true;
    };
  }, [delivered, phone, order.id]);

  if (!delivered || !links || links.length === 0) return null;

  return (
    <section className="bg-white border-[1.5px] border-lavender-deep rounded-[24px] p-5 sm:p-6">
      <h2 className="font-display text-[19px] text-purple font-semibold mb-1">Review what you received</h2>
      <p className="text-[13px] text-body-soft mb-4">A few words help the next person choose — and help us do better.</p>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.productSlug} className="flex items-center justify-between gap-3">
            <span className="min-w-0 text-[13.5px] font-semibold text-purple truncate">{l.productName}</span>
            {l.reviewed ? (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#0E7A3D] shrink-0">
                <Icon name="check" className="w-3.5 h-3.5" /> Reviewed
              </span>
            ) : (
              <Link
                href={`/review/${l.token}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-purple text-white px-4 py-2 text-[12.5px] font-semibold hover:bg-purple-deep transition-colors shrink-0"
              >
                Write a review
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
