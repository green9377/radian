"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { formatTaka } from "../../_data/products";
import { track } from "../../_data/tracking";
import { useOrderHydrated, useOrderStore } from "../../_store/useOrderStore";
import Icon from "../Pdp/PdpIcons";
import DeliveryTimeline from "./DeliveryTimeline";

/*
  /order-success — checkout যা বানাল, সেটাই দেখায়।

  ❌ "Create my account / set a password" CTA নেই (§11 retro-fix) —
     Auth মডিউল আসার আগে password চাওয়া মানে এমন account বানানো যাতে
     কেউ কখনো ঢুকতে পারবে না।
  ❌ "Need Help" section নেই — D19।

  ⇄ SWAP HERE — Ecommerce lock হলে /order-success/[id], order server থেকে।

  Track this order → /track?id=RAD-XXXXX (delivery timeline)।
*/

export default function OrderSuccessView() {
  const router = useRouter();
  const hydrated = useOrderHydrated();
  const order = useOrderStore((s) => s.last);

  const missing = hydrated && !order;

  useEffect(() => {
    if (missing) router.replace("/");
  }, [missing, router]);

  /*
    Purchase — the one event ad platforms actually learn from. Guarded per
    order number: refreshing this page must not count the sale twice.
  */
  useEffect(() => {
    if (!order) return;
    const key = `trk-purchase-${order.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    track("Purchase", {
      transaction_id: order.id,
      value: order.totalPaisa / 100,
      currency: "BDT",
    });
  }, [order]);

  if (!hydrated || !order) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <span className="text-[13.5px] text-body-soft">Loading your order…</span>
      </div>
    );
  }

  const placedAt = new Date(order.placedAt).toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="py-8">
      {/* ─── hero ─── */}
      <div className="text-center max-w-[620px] mx-auto">
        <span className="w-16 h-16 rounded-full bg-[#E8F9EE] text-[#0E7A3D] grid place-items-center mx-auto">
          <Icon name="check" className="w-7 h-7" />
        </span>

        <h1 className="font-display text-[30px] sm:text-[36px] text-purple font-semibold mt-5">
          {order.isGift ? "Their Gift Is On Its Way" : "Your Order Is On Its Way"}
        </h1>

        <p className="text-[14.5px] text-body mt-3">
          {order.isGift && order.recipient?.name
            ? `${order.recipient.name} will receive it — ${order.etaDone.toLowerCase()}.`
            : `Arriving ${order.etaDone.toLowerCase()}.`}{" "}
          We&apos;ve sent the details to {order.sender.phone}.
        </p>

        <div className="inline-flex flex-wrap items-center justify-center gap-2 mt-5">
          <span className="rounded-full bg-white border-[1.5px] border-lavender-deep px-4 py-2 text-[13px] font-semibold text-purple">
            Order {order.id}
          </span>
          <span className="rounded-full bg-white border-[1.5px] border-lavender-deep px-4 py-2 text-[13px] text-body-soft">
            {placedAt} · {order.paymentLabel}
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 lg:gap-8 items-start mt-9">
        <div className="space-y-4">
          <DeliveryTimeline
            stage={1}
            photos={order.photoUpdates}
            outAt={order.etaOut}
            doneAt={order.etaDone}
            title="What Happens Next"
          />

          {/* ─── delivery card ─── */}
          <section className="bg-white rounded-[24px] border-[1.5px] border-lavender-deep p-5 sm:p-6">
            <h3 className="flex items-center gap-2 font-display text-[17px] text-purple font-semibold mb-4">
              <Icon name="pin" className="w-[18px] h-[18px] text-orchid" />
              Delivering To
            </h3>

            <dl className="grid sm:grid-cols-2 gap-4 text-[13.5px]">
              <div>
                <dt className="text-body-soft text-[12px]">
                  {order.isGift ? "Receiver" : "You"}
                </dt>
                <dd className="text-purple font-semibold mt-0.5">
                  {order.isGift ? order.recipient?.name : order.sender.name}
                  <span className="block font-normal text-body-soft">
                    {order.isGift ? order.recipient?.phone : order.sender.phone}
                  </span>
                </dd>
              </div>

              <div>
                <dt className="text-body-soft text-[12px]">When</dt>
                <dd className="text-purple font-semibold mt-0.5">
                  {order.etaDone}
                  <span className="block font-normal text-body-soft">
                    {order.methodLabel}
                  </span>
                </dd>
              </div>

              <div className="sm:col-span-2">
                <dt className="text-body-soft text-[12px]">Address</dt>
                <dd className="text-body mt-0.5">{order.address}</dd>
              </div>

              {order.giftMessage && (
                <div className="sm:col-span-2">
                  <dt className="text-body-soft text-[12px]">Card message</dt>
                  <dd className="mt-1 rounded-[14px] bg-lavender border border-lavender-deep px-4 py-3 text-[13.5px] text-body italic">
                    “{order.giftMessage}”
                    <span className="block not-italic text-[12px] text-body-soft mt-1.5">
                      {order.anonymousGift
                        ? "Sent anonymously — your name won't appear"
                        : `— ${order.sender.name}`}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        {/* ─── receipt ─── */}
        <aside className="bg-white border-[1.5px] border-lavender-deep rounded-[24px] p-5 sm:p-6">
          <h2 className="font-display text-[19px] text-purple font-semibold mb-4">
            Your Receipt
          </h2>

          <div className="space-y-3 pb-3 border-b border-lavender">
            {order.lines.map((l) => (
              <div key={l.slug + l.sizeLabel} className="flex items-center gap-3">
                <span
                  className="w-11 h-11 rounded-[12px] shrink-0"
                  style={{ background: l.bg }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-purple truncate">
                    {l.name}
                  </span>
                  <span className="block text-[11.5px] text-body-soft truncate">
                    {[l.variantLabel, l.sizeLabel, l.qty > 1 ? `× ${l.qty}` : null, ...l.bundleLabels, ...l.addonLabels]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="text-[12.5px] font-semibold text-purple shrink-0">
                  {formatTaka(l.linePaisa)}
                </span>
              </div>
            ))}
          </div>

          <div className="divide-y divide-lavender">
            <div className="flex justify-between py-2.5 text-[13.5px]">
              <span className="text-body-soft">Subtotal</span>
              <span className="text-purple font-semibold">
                {formatTaka(order.subtotalPaisa)}
              </span>
            </div>

            {order.discountPaisa > 0 && (
              <div className="flex justify-between py-2.5 text-[13.5px]">
                <span className="text-body-soft">Coupon {order.couponCode}</span>
                <span className="text-[#0E7A3D] font-semibold">
                  − {formatTaka(order.discountPaisa)}
                </span>
              </div>
            )}

            <div className="flex justify-between py-2.5 text-[13.5px]">
              <span className="text-body-soft">Delivery</span>
              <span
                className={
                  order.deliveryWaivedPaisa > 0
                    ? "text-[#0E7A3D] font-semibold"
                    : "text-purple font-semibold"
                }
              >
                {order.deliveryPaisa === 0 ? "FREE" : formatTaka(order.deliveryPaisa)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t-[1.5px] border-lavender-deep pt-4 mt-2">
            <span className="text-[15px] font-semibold text-purple">Paid</span>
            <span className="font-display text-[24px] text-purple font-semibold">
              {formatTaka(order.totalPaisa)}
            </span>
          </div>

          <p className="text-[12px] text-body-soft mt-1.5">
            {order.payment === "cod"
              ? "Cash on delivery — please keep the exact amount ready."
              : `Paid with ${order.paymentLabel}.`}
          </p>

          <Link
            href={`/track?id=${order.id}`}
            className="w-full mt-5 h-[50px] inline-flex items-center justify-center gap-2 bg-purple text-white rounded-[16px] font-semibold text-[14.5px] hover:bg-purple-deep transition-colors"
          >
            <Icon name="truck" className="w-[18px] h-[18px]" />
            Track this order
          </Link>

          <Link
            href="/"
            className="w-full mt-2.5 h-[50px] inline-flex items-center justify-center gap-2 bg-white border-[1.5px] border-lavender-deep text-purple rounded-[16px] font-semibold text-[14.5px] hover:border-orchid transition-colors"
          >
            Continue shopping
            <Icon name="chev" className="w-4 h-4 -rotate-90" />
          </Link>
        </aside>
      </div>
    </div>
  );
}
