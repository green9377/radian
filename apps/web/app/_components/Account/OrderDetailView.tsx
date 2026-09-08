"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getOrder, type AccountOrderDetail } from "../../_data/accountApi";
import { formatTaka } from "../../_data/products";
import { useToken } from "../../_store/useAuthStore";
import Icon from "../Pdp/PdpIcons";
import TileImage from "../ui/TileImage";
import { Loading, Panel } from "./AccountShell";

/*
  /account/orders/[id] — one real order, read from the shop.

  ⚠️ It used to be found in a hand-written list in the browser. The server
  answers now, and it will only answer for an order that belongs to this
  session — mine, or one placed from my verified number.

  The photographs are shown only when the order asked for photo updates: the
  switch on the order is the customer's own instruction, and the account must
  not quietly work around it.
*/

const STEPS: { key: string; label: string }[] = [
  { key: "placed", label: "Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "preparing", label: "Preparing" },
  { key: "out_for_delivery", label: "On the way" },
  { key: "delivered", label: "Delivered" },
];

function stepIndex(o: AccountOrderDetail): number {
  if (o.deliveryStatus === "delivered") return 4;
  if (o.deliveryStatus === "out_for_delivery") return 3;
  if (o.deliveryStatus === "preparing") return 2;
  if (o.status === "confirmed" || o.status === "completed") return 1;
  return 0;
}

export default function OrderDetailView({ id }: { id: string }) {
  const token = useToken();
  const [o, setO] = useState<AccountOrderDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getOrder(token, id)
      .then(setO)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load that order."));
  }, [token, id]);

  if (err) {
    return (
      <Panel icon="gift" title="Order" sub="">
        <p className="rounded-[13px] bg-[#FDECEE] border border-[#F5C2C7] px-4 py-3 text-[13px] text-[#8A1220]">
          {err}
        </p>
        <Link
          href="/account/orders"
          className="inline-block mt-4 rounded-[13px] border-2 border-purple text-purple px-5 py-2.5 font-bold text-[13px]"
        >
          Back to my orders
        </Link>
      </Panel>
    );
  }

  if (!o) {
    return (
      <Panel icon="gift" title="Order" sub="">
        <Loading />
      </Panel>
    );
  }

  const at = stepIndex(o);
  const cancelled = o.status === "cancelled";

  return (
    <Panel
      icon="gift"
      title={o.orderNo}
      sub={`Placed ${new Date(o.placedAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`}
      action={
        <Link
          href="/account/orders"
          className="bg-white text-purple border-2 border-white rounded-[13px] px-4 py-2.5 font-bold text-[13px]"
        >
          All orders
        </Link>
      }
    >
      {/* ── where it is ── */}
      {cancelled ? (
        <div className="rounded-[16px] bg-[#FDEFF0] border border-[#F5C2C7] px-4 py-3.5 text-[13.5px] font-bold text-[#B42318] mb-5">
          This order was cancelled.
        </div>
      ) : (
        <div className="flex items-start mb-6">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex-1 flex flex-col items-center relative min-w-0">
              {i > 0 && (
                <span
                  className={`absolute top-[14px] right-1/2 w-full h-[3px] rounded-full ${
                    i <= at ? "bg-purple" : "bg-lavender-deep"
                  }`}
                />
              )}
              <span
                className={`relative z-10 w-[30px] h-[30px] rounded-full grid place-items-center text-[12px] font-bold ${
                  i < at
                    ? "bg-[#0E7A3D] text-white"
                    : i === at
                      ? "bg-purple text-white shadow-[0_0_0_5px_#F9E9FD]"
                      : "bg-white text-body-soft border-2 border-lavender-deep"
                }`}
              >
                {i < at ? <Icon name="check" className="w-4 h-4" /> : i + 1}
              </span>
              <span
                className={`mt-2 text-[11.5px] text-center px-1 ${
                  i === at ? "font-bold text-purple" : i < at ? "text-body" : "text-body-soft"
                }`}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── what is in it ── */}
      {o.lines.map((l) => (
        <div
          key={l.id}
          className="border-[1.5px] border-lavender-deep rounded-[16px] p-4 mb-3 flex gap-3.5 items-center flex-wrap"
        >
          <TileImage
            src={l.imageUrl}
            alt={l.name}
            variant="thumb"
            className="w-16 h-16 rounded-[14px] shrink-0"
          />
          <span className="flex-1 min-w-[160px]">
            <b className="block text-[14px] text-purple">{l.name}</b>
            <span className="block text-[12px] text-body-soft mt-0.5">
              {[l.variantLabel, l.sizeLabel, `× ${l.qty}`].filter(Boolean).join(" · ")}
            </span>
          </span>
          <span className="font-display text-[17px] text-purple">{formatTaka(l.linePaisa)}</span>
        </div>
      ))}

      {/* ── the bill ── */}
      <div className="bg-lavender border-[1.5px] border-lavender-deep rounded-[18px] p-5 mt-4">
        <div className="flex justify-between text-[13px] text-body-soft mb-2">
          <span>Subtotal</span>
          <b className="text-body">{formatTaka(o.subtotalPaisa)}</b>
        </div>
        {o.discountPaisa > 0 && (
          <div className="flex justify-between text-[13px] text-body-soft mb-2">
            <span>Discount</span>
            <b className="text-[#0E7A3D]">− {formatTaka(o.discountPaisa)}</b>
          </div>
        )}
        <div className="flex justify-between text-[13px] text-body-soft mb-2">
          <span>Delivery · {o.methodLabel}</span>
          <b className="text-body">{formatTaka(o.deliveryPaisa)}</b>
        </div>
        <div className="flex justify-between items-baseline border-t border-lavender-deep pt-3 mt-3">
          <span className="text-[13px] font-bold text-purple">Total</span>
          <b className="font-display text-[24px] text-purple">{formatTaka(o.totalPaisa)}</b>
        </div>
      </div>

      {/* ── where it went ── */}
      <div className="grid sm:grid-cols-2 gap-4 mt-5">
        <div className="border-[1.5px] border-lavender-deep rounded-[16px] p-4">
          <b className="block text-[13px] text-purple mb-1.5">Delivered to</b>
          <p className="text-[13px] text-body leading-relaxed m-0">
            {o.isGift && o.recipientName ? (
              <>
                {o.recipientName}
                <br />
                {o.recipientPhone}
                <br />
              </>
            ) : null}
            {o.address}
          </p>
        </div>
        <div className="border-[1.5px] border-lavender-deep rounded-[16px] p-4">
          <b className="block text-[13px] text-purple mb-1.5">When</b>
          <p className="text-[13px] text-body leading-relaxed m-0">
            {[o.methodLabel, o.date, o.slotLabel].filter(Boolean).join(" · ") || o.etaLabel || "—"}
          </p>
          {o.giftMessage && (
            <p className="text-[13px] text-body-soft italic mt-3 mb-0 whitespace-pre-wrap">
              “{o.giftMessage}”
            </p>
          )}
        </div>
      </div>

      {/* ── the photographs ── */}
      {o.photos.length > 0 && (
        <div className="mt-5">
          <b className="block text-[13px] text-purple mb-2">Photos</b>
          <div className="grid sm:grid-cols-2 gap-3">
            {o.photos.map((p, i) => (
              <div key={i} className="border-[1.5px] border-lavender-deep rounded-[16px] overflow-hidden">
                <TileImage
                  src={p.url}
                  alt={p.kind === "PREP" ? "Before it left the studio" : "At the door"}
                  variant="card"
                  className="h-[170px]"
                />
                <div className="px-4 py-2.5 text-[12px] text-body-soft">
                  {p.kind === "PREP" ? "Before it left the studio" : "At the door"} ·{" "}
                  {new Date(p.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
