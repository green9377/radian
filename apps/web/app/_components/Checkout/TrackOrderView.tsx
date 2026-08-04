"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useOrderHydrated, useOrderStore } from "../../_store/useOrderStore";
import { useCheckoutStore } from "../../_store/useCheckoutStore";
import { trackOrder, type TrackedOrder } from "../../_data/checkoutApi";
import Icon from "../Pdp/PdpIcons";
import DeliveryTimeline from "./DeliveryTimeline";

/*
  /track — Order tracking, LIVE against the shop since 4 Aug 2026.

  ⚠️ কী দেখায় আর কী দেখায় না (locked — সোবুজ):
  শুধু **delivery timeline**। দাম, receipt, ঠিকানা, gift message — কিছুই নয়।
  Track number receiver-এর হাতেও থাকতে পারে; সারপ্রাইজ ফাঁস করা যাবে না।

  ── যা বদলাল ────────────────────────────────────────────────────────────
  আগে এই page localStorage-এর **শেষ order**-এর সাথে মেলাত — অন্য device
  থেকে, বা কালকে এসে, নম্বর লিখলে "খুঁজে পাইনি"। এখন `GET /shop/track`
  ডাকে, আর admin panel-এ order যত ধাপ এগোয়, এখানে ঠিক ততটাই দেখায় —
  একই দুই status-track থেকে (DEC-SAL-003), তাই দুটো পর্দা কখনো দুই কথা
  বলতে পারে না।

  ── কেন ফোন নম্বরও লাগে ────────────────────────────────────────────────
  Order নম্বরটা উপহারের card-এ ছাপা — কার হাতে যাবে জানা নেই। শুধু নম্বর
  দিয়ে খোলা মানে যে কেউ RAD-১ থেকে RAD-৯৯৯৯৯ ঘুরিয়ে দোকানের সব order
  দেখে ফেলত। নম্বর + ফোন জোড়া লাগে, আর ভুল জোড়ার উত্তর "নেই"-এর
  উত্তরের সাথে হুবহু এক — অনুমান করে কিছুই শেখা যায় না।
*/

export default function TrackOrderView() {
  const params = useSearchParams();
  const hydrated = useOrderHydrated();
  const lastOrder = useOrderStore((s) => s.last);
  /*  নিজের device-এ ফোনটা আগে থেকেই জানা (checkout store persist করে) —
      নিজের order দেখতে আবার টাইপ করতে হয় না।  */
  const knownPhone = useCheckoutStore((s) => s.senderPhone);
  const knownDial = useCheckoutStore((s) => s.senderDial);

  const [query, setQuery] = useState("");
  const [phone, setPhone] = useState("");
  const [looking, setLooking] = useState(false);
  const [result, setResult] = useState<TrackedOrder | null>(null);
  const [notFound, setNotFound] = useState(false);

  /*  ?id=RAD-XXXXX — order-success থেকে আসা link। ফোন device-এ জানা থাকলে
      auto-lookup; না জানলে ঘরটা ভরে অপেক্ষা — চাওয়ার আগে খোলে না।  */
  useEffect(() => {
    const id = params.get("id");
    if (!id) return;
    setQuery(id);
    if (knownPhone) {
      setPhone(knownPhone);
      void lookup(id, knownPhone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, knownPhone]);

  async function lookup(orderNo: string, ph: string) {
    setLooking(true);
    setNotFound(false);
    setResult(null);
    /*  দেশি নম্বর 01X… আকারেই থাকে — server শেষ ১০ সংখ্যা মেলায়, তাই
        +880 থাকা-না-থাকায় কিছু আসে যায় না। প্রবাসী sender পুরো নম্বরই
        দেবেন (+44…), সেটাও একই নিয়মে মেলে।  */
    const r = await trackOrder(orderNo, ph.startsWith("0") || ph.startsWith("+") ? ph : `${knownDial}${ph}`);
    setLooking(false);
    if (r) setResult(r);
    else setNotFound(true);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim() && phone.trim()) void lookup(query, phone);
  }

  if (!hydrated) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <span className="text-[13.5px] text-body-soft">Loading…</span>
      </div>
    );
  }

  return (
    <div className="py-8 max-w-[640px] mx-auto">
      {/* ─── header ─── */}
      <div className="text-center">
        <span className="w-14 h-14 rounded-full bg-lavender text-orchid grid place-items-center mx-auto border-[1.5px] border-lavender-deep">
          <Icon name="truck" className="w-6 h-6" />
        </span>
        <h1 className="font-display text-[28px] sm:text-[32px] text-purple font-semibold mt-4">
          Track Your Order
        </h1>
        <p className="text-[13.5px] text-body mt-2">
          Enter your order number (starts with{" "}
          <span className="font-semibold text-purple">RAD-</span>) and the phone
          number on the order.
        </p>
      </div>

      {/* ─── lookup form ─── */}
      <form onSubmit={onSubmit} className="mt-6 space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-body-soft">
              <Icon name="search" className="w-[18px] h-[18px]" />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="RAD-12345"
              aria-label="Order number"
              className="w-full h-[50px] pl-11 pr-4 rounded-[16px] bg-white border-[1.5px] border-lavender-deep text-[14.5px] text-purple placeholder:text-body-soft focus:border-orchid focus:outline-none transition-colors"
            />
          </div>
          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-body-soft">
              <Icon name="wa" className="w-[18px] h-[18px]" />
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone on the order"
              aria-label="Phone number on the order"
              inputMode="tel"
              className="w-full h-[50px] pl-11 pr-4 rounded-[16px] bg-white border-[1.5px] border-lavender-deep text-[14.5px] text-purple placeholder:text-body-soft focus:border-orchid focus:outline-none transition-colors"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={looking}
          className="w-full sm:w-auto h-[50px] px-8 inline-flex items-center justify-center gap-2 bg-purple text-white rounded-[16px] font-semibold text-[14.5px] hover:bg-purple-deep transition-colors disabled:opacity-70"
        >
          {looking ? "Looking…" : "Track"}
          {!looking && <Icon name="chev" className="w-4 h-4 -rotate-90" />}
        </button>
      </form>

      {/* শেষ order-এর quick chip — এই device-এই দেওয়া, তাই ফোনও জানা */}
      {!result && !notFound && !looking && lastOrder && knownPhone && (
        <button
          type="button"
          onClick={() => {
            setQuery(lastOrder.id);
            setPhone(knownPhone);
            void lookup(lastOrder.id, knownPhone);
          }}
          className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-body-soft hover:text-purple transition-colors"
        >
          <Icon name="clock" className="w-[14px] h-[14px]" />
          Track your last order — {lastOrder.id}
        </button>
      )}

      {/* ─── result: cancelled ─── */}
      {result?.cancelled && (
        <div className="mt-8 bg-white rounded-[24px] border-[1.5px] border-lavender-deep p-6 text-center">
          <p className="font-display text-[20px] text-purple font-semibold">
            Order {result.orderNo}
          </p>
          <p className="text-[13.5px] text-[#8A5A00] mt-2">
            This order was cancelled. If that&apos;s a surprise, message us on
            WhatsApp — we&apos;ll sort it out.
          </p>
        </div>
      )}

      {/* ─── result: live ─── */}
      {result && !result.cancelled && (
        <div className="mt-8 space-y-4">
          <div className="bg-white rounded-[24px] border-[1.5px] border-lavender-deep p-5 sm:p-6 text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#E8F9EE] text-[#0E7A3D] px-4 py-1.5 text-[12.5px] font-semibold">
              <Icon name="check" className="w-4 h-4" />
              {["Order placed", "Order placed", "Confirmed", "Being arranged", "Out for delivery", "Delivered"][result.stage] ?? "Order placed"}
            </span>
            <p className="font-display text-[20px] text-purple font-semibold mt-3">
              Order {result.orderNo}
            </p>
            {(result.date || result.slotLabel) && (
              <p className="text-[13.5px] text-body mt-1">
                {result.methodLabel ? `${result.methodLabel} · ` : ""}
                {[result.date, result.slotLabel].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          {/* the tracker — reused, no receipt/prices */}
          <DeliveryTimeline
            stage={result.stage}
            photos={result.photoUpdates}
            outAt={result.etaLabel ?? "On its way"}
            doneAt={[result.date, result.slotLabel].filter(Boolean).join(" · ") || "As scheduled"}
            title="Delivery Timeline"
          />

          {/* WhatsApp note — live update এখানেই আসে (D36) */}
          <div className="bg-lavender rounded-[24px] border-[1.5px] border-lavender-deep p-5 flex items-start gap-3">
            <span className="w-9 h-9 rounded-full bg-white text-orchid grid place-items-center shrink-0 border border-lavender-deep">
              <Icon name="wa" className="w-[18px] h-[18px]" />
            </span>
            <p className="text-[13px] text-body leading-relaxed">
              <span className="font-semibold text-purple">
                Live updates come on WhatsApp.
              </span>{" "}
              Every step — confirmation, preparation photo, and delivery — is
              sent to the number on your order. This page shows the same
              timeline.
            </p>
          </div>
        </div>
      )}

      {/* ─── result: not found ─── */}
      {notFound && (
        <div className="mt-8 bg-white rounded-[24px] border-[1.5px] border-lavender-deep p-6 sm:p-8 text-center">
          <span className="w-12 h-12 rounded-full bg-lavender text-body-soft grid place-items-center mx-auto">
            <Icon name="search" className="w-5 h-5" />
          </span>
          <p className="font-display text-[18px] text-purple font-semibold mt-4">
            We couldn&apos;t find that order
          </p>
          <p className="text-[13px] text-body-soft mt-2 max-w-[380px] mx-auto leading-relaxed">
            Check the order number from your WhatsApp confirmation, and make
            sure the phone number is the one used on the order — the
            sender&apos;s or the receiver&apos;s both work.
          </p>
        </div>
      )}

      {/* back to shop */}
      <div className="mt-8 text-center">
        <Link
          href="/"
          className="text-[13px] text-body-soft hover:text-purple transition-colors"
        >
          ← Continue shopping
        </Link>
      </div>
    </div>
  );
}
