"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getOrders, type AccountOrder } from "../../_data/accountApi";
import { formatTaka } from "../../_data/products";
import { useToken } from "../../_store/useAuthStore";
import Icon from "../Pdp/PdpIcons";
import TileImage from "../ui/TileImage";
import { Empty, Loading, Panel } from "./AccountShell";

/*
  /account/orders — the real ones.

  ⚠️ THIS LIST USED TO BE SIX HAND-WRITTEN ORDERS (`_data/orders.ts`,
  "Nusrat Jahan"). It is now the shop's own table, and it includes orders
  placed BEFORE this person ever had an account: the server matches the phone
  the login code was sent to (the owner's ruling, 8 Sep 2026).
*/

const LIVE = new Set(["placed", "confirmed", "preparing", "out_for_delivery"]);

function statusChip(o: AccountOrder): { label: string; cls: string } {
  if (o.status === "cancelled") return { label: "Cancelled", cls: "bg-[#FDEFF0] text-[#B42318]" };
  if (o.deliveryStatus === "delivered") return { label: "Delivered", cls: "bg-[#E8F9EE] text-[#0E7A3D]" };
  if (o.deliveryStatus === "out_for_delivery")
    return { label: "Out for delivery", cls: "bg-[#EEF2FF] text-[#1D4ED8]" };
  if (o.deliveryStatus === "preparing") return { label: "Preparing", cls: "bg-[#FFF7E8] text-[#8A5A00]" };
  return { label: "Placed", cls: "bg-lavender text-purple" };
}

type Filter = "all" | "active" | "delivered" | "cancelled";

export default function OrdersView() {
  const token = useToken();
  const [orders, setOrders] = useState<AccountOrder[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!token) return;
    getOrders(token)
      .then(setOrders)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load your orders."));
  }, [token]);

  const counts = useMemo(() => {
    const all = orders ?? [];
    return {
      all: all.length,
      active: all.filter((o) => o.status !== "cancelled" && LIVE.has(o.deliveryStatus === "delivered" ? "done" : o.status)).length,
      delivered: all.filter((o) => o.deliveryStatus === "delivered").length,
      cancelled: all.filter((o) => o.status === "cancelled").length,
    };
  }, [orders]);

  const shown = useMemo(() => {
    const all = orders ?? [];
    if (filter === "delivered") return all.filter((o) => o.deliveryStatus === "delivered");
    if (filter === "cancelled") return all.filter((o) => o.status === "cancelled");
    if (filter === "active")
      return all.filter((o) => o.status !== "cancelled" && o.deliveryStatus !== "delivered");
    return all;
  }, [orders, filter]);

  const live = (orders ?? []).find(
    (o) => o.status !== "cancelled" && o.deliveryStatus !== "delivered",
  );

  return (
    <Panel icon="gift" title="My orders" sub="Everything ordered from your number — kept for good.">
      {err && (
        <p className="mb-4 rounded-[13px] bg-[#FDECEE] border border-[#F5C2C7] px-4 py-3 text-[13px] text-[#8A1220]">
          {err}
        </p>
      )}

      {!orders && !err && <Loading />}

      {orders && orders.length === 0 && (
        <Empty
          title="No orders yet"
          sub="When you send your first bouquet it will live here — with its photos."
          href="/fresh-flower"
          cta="Shop fresh flowers"
        />
      )}

      {orders && orders.length > 0 && (
        <>
          {live && (
            <div className="rounded-[18px] border-[1.5px] border-[#C4EED4] bg-[#E8F9EE] px-4 py-3.5 flex items-center gap-3 flex-wrap mb-5">
              <Icon name="truck" className="w-5 h-5 text-[#0E7A3D] shrink-0" />
              <span className="min-w-0">
                <b className="block text-[14px] text-[#0E5C31]">
                  {live.orderNo} is {statusChip(live).label.toLowerCase()}
                </b>
                <span className="block text-[12.5px] text-[#25674A]">
                  {live.etaLabel || live.methodLabel}
                </span>
              </span>
              <Link
                href={`/account/orders/${live.id}`}
                className="ml-auto rounded-[12px] border-2 border-purple text-purple font-bold text-[13px] px-4 py-2 bg-white"
              >
                Track it
              </Link>
            </div>
          )}

          <div className="flex gap-2 flex-wrap mb-5">
            {([
              ["all", `All · ${counts.all}`],
              ["active", `Active · ${counts.all - counts.delivered - counts.cancelled}`],
              ["delivered", `Delivered · ${counts.delivered}`],
              ["cancelled", `Cancelled · ${counts.cancelled}`],
            ] as [Filter, string][]).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded-full px-4 py-2 text-[12.5px] font-bold border-[1.5px] transition-colors ${
                  filter === id
                    ? "bg-purple border-purple text-white"
                    : "bg-white border-lavender-deep text-body hover:border-orchid-mid"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {shown.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}

          {shown.length === 0 && (
            <p className="text-[13px] text-body-soft text-center py-6">Nothing in this list.</p>
          )}
        </>
      )}
    </Panel>
  );
}

export function OrderCard({ order }: { order: AccountOrder }) {
  const chip = statusChip(order);
  const first = order.lines[0];
  const more = order.lines.length - 1;

  return (
    <article className="border-[1.5px] border-orchid-mid rounded-[18px] overflow-hidden mb-3.5">
      <header className="flex items-center gap-3 flex-wrap px-4 py-3 bg-[linear-gradient(150deg,#4D0170,#3A0057)]">
        <b className="font-mono text-[13.5px] text-white">{order.orderNo}</b>
        <span className="text-[12px] text-[#DCC4EA]">
          {new Date(order.placedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
        <span className={`ml-auto rounded-full px-3 py-1 text-[11px] font-bold ${chip.cls}`}>
          {chip.label}
        </span>
      </header>

      <div className="p-4 flex gap-3.5 items-center flex-wrap">
        {/*  the one picture-in-a-card, site-wide: real <img>, lazy, media
             variants, one quiet placeholder when there is no photo  */}
        <TileImage
          src={first?.imageUrl}
          alt={first?.name ?? "Order"}
          variant="thumb"
          className="w-16 h-16 rounded-[14px] shrink-0"
        />
        <span className="flex-1 min-w-[180px]">
          <b className="block text-[14px] text-purple">
            {first?.name ?? "Order"}
            {more > 0 ? ` + ${more} more` : ""}
          </b>
          <span className="block text-[12px] text-body-soft mt-0.5">
            {[
              first?.variantLabel,
              first?.sizeLabel,
              order.isGift && order.recipientName ? `for ${order.recipientName}` : null,
              order.methodLabel,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="font-display text-[19px] text-purple">{formatTaka(order.totalPaisa)}</span>
      </div>

      <div className="flex gap-2 flex-wrap px-4 pb-4">
        <Link
          href={`/account/orders/${order.id}`}
          className="rounded-[11px] border-[1.5px] border-lavender-deep bg-white px-3.5 py-2 text-[12.5px] font-bold text-body"
        >
          View details
        </Link>
        {order.deliveryStatus === "delivered" && (
          <Link
            href="/account/reviews"
            className="rounded-[11px] border-[1.5px] border-lavender-deep bg-white px-3.5 py-2 text-[12.5px] font-bold text-body"
          >
            ⭐ Write a review
          </Link>
        )}
        {first?.slug && (
          <Link
            href={`/p/${first.slug}`}
            className="rounded-[11px] border-[1.5px] border-lavender-deep bg-white px-3.5 py-2 text-[12.5px] font-bold text-body"
          >
            Order again
          </Link>
        )}
      </div>
    </article>
  );
}
