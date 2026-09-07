"use client";

import Link from "next/link";

import { formatTaka } from "../../_data/products";
import {
  ORDER_STATUS_META,
  isTerminal,
  statusStage,
  type OrderEvent,
} from "../../_data/order";
import { findOrder } from "../../_data/orders";
import { useLiveOrder } from "../../_data/useLiveOrder";
import { useOrderHydrated, useOrderStore } from "../../_store/useOrderStore";
import DeliveryTimeline from "../Checkout/DeliveryTimeline";
import Icon from "../Pdp/PdpIcons";
import OrderStatusChip from "./OrderStatusChip";
import ReorderButton from "./ReorderButton";
import TileImage from "../ui/TileImage";
import OrderReviewLinks from "./OrderReviewLinks";

/*
  /account/orders/[id] — এক order-এর পুরো ছবি: progress + history +
  delivery + receipt। order = seed ∪ live (findOrder)।

  ⇄ SWAP HERE — Ecommerce lock হলে server component হয়ে GET /orders/:id।
*/

function stamp(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function OrderDetailView({ id }: { id: string }) {
  const liveHydrated = useOrderHydrated();
  const live = useOrderStore((s) => s.last);
  /*  DEC-SAL-016 — the browser holds the receipt; the shop holds the status.
      Without this the tracker below sat on "placed" for ever, whatever the
      admin did. See `useLiveOrder` for why it goes through /shop/track.  */
  const order = useLiveOrder(findOrder(id, liveHydrated ? live : null));

  if (!liveHydrated) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <span className="text-[13.5px] text-body-soft">Loading order…</span>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="py-16 text-center">
        <span className="w-14 h-14 rounded-full bg-lavender text-orchid grid place-items-center mx-auto">
          <Icon name="search" className="w-6 h-6" />
        </span>
        <h1 className="font-display text-[24px] text-purple font-semibold mt-4">
          Order not found
        </h1>
        <p className="text-[13.5px] text-body-soft mt-1.5">
          We couldn&apos;t find order {id}.
        </p>
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-2 mt-6 h-[46px] px-6 bg-purple text-white rounded-[14px] font-semibold text-[14px] hover:bg-purple-deep transition-colors"
        >
          Back to my orders
        </Link>
      </div>
    );
  }

  const live_ = !isTerminal(order.status);
  const cancelled = order.status === "cancelled";

  return (
    <div className="py-8 sm:py-10">
      {/* back */}
      <Link
        href="/account/orders"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-body-soft hover:text-purple transition-colors"
      >
        <Icon name="chev" className="w-3.5 h-3.5 rotate-90" />
        My Orders
      </Link>

      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-[26px] sm:text-[32px] text-purple font-semibold">
            {order.id}
          </h1>
          <OrderStatusChip status={order.status} />
        </div>
        {live_ ? (
          <Link
            href={`/track?id=${order.id}`}
            className="inline-flex items-center gap-2 h-[46px] px-5 bg-purple text-white rounded-[14px] font-semibold text-[13.5px] hover:bg-purple-deep transition-colors self-start"
          >
            <Icon name="truck" className="w-[17px] h-[17px]" />
            Track order
          </Link>
        ) : (
          <div className="self-start">
            <ReorderButton order={order} variant="solid" />
          </div>
        )}
      </div>
      <p className="text-[13px] text-body-soft mt-1.5">
        Placed {stamp(order.placedAt)} · {order.paymentLabel}
      </p>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 lg:gap-8 items-start mt-7">
        <div className="space-y-4">
          {/* progress tracker — cancelled নয় */}
          {!cancelled && (
            <DeliveryTimeline
              stage={statusStage(order.status, order.photoUpdates)}
              photos={order.photoUpdates}
              outAt={order.etaOut}
              doneAt={order.etaDone}
              title="Delivery progress"
            />
          )}

          {/* event history */}
          <EventHistory events={order.timeline} />

          {/* delivering to */}
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
                        ? "Sent anonymously"
                        : `— ${order.sender.name}`}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        {/* receipt */}
        <aside className="bg-white border-[1.5px] border-lavender-deep rounded-[24px] p-5 sm:p-6">
          <h2 className="font-display text-[19px] text-purple font-semibold mb-4">
            Receipt
          </h2>

          <div className="space-y-3 pb-3 border-b border-lavender">
            {order.lines.map((l) => (
              <div key={l.slug + l.sizeLabel} className="flex items-center gap-3">
                <TileImage src={l.bg} alt="" variant="thumb" className="w-11 h-11 rounded-[12px] shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-purple truncate">
                    {l.name}
                  </span>
                  <span className="block text-[11.5px] text-body-soft truncate">
                    {[
                      l.variantLabel,
                      l.sizeLabel,
                      l.qty > 1 ? `× ${l.qty}` : null,
                      ...l.bundleLabels,
                      ...l.addonLabels,
                    ]
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
                {order.deliveryPaisa === 0
                  ? "FREE"
                  : formatTaka(order.deliveryPaisa)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t-[1.5px] border-lavender-deep pt-4 mt-2">
            <span className="text-[15px] font-semibold text-purple">
              {cancelled ? "Order total" : "Paid"}
            </span>
            <span className="font-display text-[24px] text-purple font-semibold">
              {formatTaka(order.totalPaisa)}
            </span>
          </div>

          <p className="text-[12px] text-body-soft mt-1.5">
            {cancelled
              ? "This order was cancelled. Any payment is being refunded."
              : order.payment === "cod"
                ? "Cash on delivery."
                : `Paid with ${order.paymentLabel}.`}
          </p>
        </aside>

        {/* DEC-WEB-012 — review links, only once delivered, only for what was bought */}
        <div className="lg:col-span-2">
          <OrderReviewLinks order={order} />
        </div>
      </div>
    </div>
  );
}

function EventHistory({ events }: { events: OrderEvent[] }) {
  const ordered = [...events].sort((a, b) => b.at - a.at);
  return (
    <section className="bg-white rounded-[24px] border-[1.5px] border-lavender-deep p-5 sm:p-6">
      <h3 className="flex items-center gap-2 font-display text-[17px] text-purple font-semibold mb-4">
        <Icon name="clock" className="w-[18px] h-[18px] text-orchid" />
        Order history
      </h3>
      <ol className="space-y-3.5">
        {ordered.map((e, i) => {
          const m = ORDER_STATUS_META[e.status];
          return (
            <li key={e.status + e.at + i} className="flex gap-3">
              <span
                className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${m.dot}`}
              />
              <div className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-purple">
                  {m.label}
                </span>
                <span className="block text-[12px] text-body-soft">
                  {stamp(e.at)}
                  {e.note ? ` · ${e.note}` : ""}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
