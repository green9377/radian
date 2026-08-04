"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, TONE, PageHead, Stat, Panel, NoteBox, type Tone } from "./OrderViews";
import { formatTaka } from "../_data/api";
import {
  DEMO_BOARD,
  DEMO_FLEET,
  DEMO_FAILED,
  DEMO_CONSIGNMENTS,
  DEMO_PROOFS,
  DELIVERY_TYPE_META,
  PROVIDER_LABEL,
  type DeliveryType,
  type FailedDelivery,
} from "../_data/deliveryDemo";

/* Delivery — operational screens (Overview · Dispatch · Failed/RTO · Tracking · Proof).
   Delivery-owned data only. Colourful, decision-first (§4 DESIGN RULE). Demo data. */

const DemoBar = ({ text }: { text: string }) => (
  <div className="flex items-center gap-3 bg-[#f5eafb] border border-[#e3c8f2] text-purple rounded-[12px] px-4 py-2.5 mb-4 text-[12.5px] flex-wrap">
    <span className="text-[10px] font-bold tracking-[0.06em] uppercase bg-purple text-white px-2 py-1 rounded-full shrink-0">Demo data</span>
    <span className="flex-1 min-w-[220px]">{text}</span>
  </div>
);

function TypeTag({ type }: { type: DeliveryType }) {
  const m = DELIVERY_TYPE_META[type];
  const t = TONE[m.tone as Tone];
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap" style={{ background: t.bg, borderColor: t.border, color: t.text }}>
      <Icon name={m.icon} size={11} /> {m.short}
    </span>
  );
}

/* ═══════════════ OVERVIEW (landing) ═══════════════ */
export function DeliveryOverview() {
  const k = useMemo(() => {
    const by = (s: string) => DEMO_BOARD.filter((o) => o.deliveryStatus === s).length;
    const urgent = DEMO_BOARD.filter((o) => DELIVERY_TYPE_META[o.type].urgent && o.deliveryStatus !== "delivered" && o.deliveryStatus !== "failed").length;
    const midnight = DEMO_BOARD.filter((o) => o.type === "MIDNIGHT" && o.deliveryStatus !== "delivered").length;
    return { toAssign: by("unassigned"), preparing: by("preparing"), out: by("out_for_delivery"), delivered: by("delivered"), failed: by("failed"), urgent, midnight };
  }, []);

  const tiles: [string, string, string, Tone, string][] = [
    ["/delivery/board", "Fulfilment board", "Assign → out → delivered", "purple", "truck"],
    ["/delivery/riders", "Dispatch & riders", "Who is free, who is loaded", "blue", "user"],
    ["/delivery/failed", "Failed & RTO", "Reasons, re-attempt, returns", "rose", "shield"],
    ["/delivery/tracking", "Tracking", "3PL consignments", "amber", "pin"],
    ["/delivery/proof", "Proof of delivery", "Prep + delivery photos", "gold", "photo"],
    ["/delivery/analytics", "Analytics", "On-time, failed, zones", "green", "chart"],
  ];

  return (
    <div className={WRAP}>
      <PageHead eyebrow="Operations · Delivery" title="Delivery overview">
        Delivery is Radian&apos;s biggest promise — 2-hour, same-day, midnight and nationwide. This is what needs a rider now and how today is going.
      </PageHead>
      <DemoBar text="Sample operations across the whole pipeline — every screen is fully explorable." />

      <div className="rounded-[18px] p-5 mb-5 text-white shadow-lift flex items-center gap-5 flex-wrap" style={{ background: "linear-gradient(135deg,#470066 0%,#7d2ea8 55%,#cf43ea 100%)" }}>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] uppercase tracking-[0.08em] opacity-80">Needs a rider now</div>
          <div className="font-display text-[34px] leading-none mt-1">{k.toAssign} to assign</div>
          <div className="text-[12.5px] opacity-85 mt-1.5">{k.urgent} time-critical · {k.midnight} midnight tonight.</div>
        </div>
        <Link href="/delivery/board" className="bg-white text-purple text-[14px] font-medium px-5 py-3 rounded-[12px] inline-flex items-center gap-2 shrink-0 hover:bg-lavender">
          <Icon name="truck" size={17} /> Open board
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Stat label="To assign" value={String(k.toAssign)} tone="rose" icon="bolt" href="/delivery/board" />
        <Stat label="Preparing" value={String(k.preparing)} tone="amber" icon="box" />
        <Stat label="Out for delivery" value={String(k.out)} tone="blue" icon="truck" />
        <Stat label="Delivered today" value={String(k.delivered)} tone="green" icon="check" />
        <Stat label="Failed" value={String(k.failed)} tone="rose" icon="shield" href="/delivery/failed" />
        <Stat label="On-time (30d)" value="93%" tone="gold" icon="clock" href="/delivery/analytics" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {tiles.map(([href, label, desc, tone, icon]) => {
          const t = TONE[tone];
          return (
            <Link key={href} href={href} className="rounded-[14px] px-4 py-3.5 border flex items-center gap-3 hover:-translate-y-0.5 transition-transform" style={{ background: t.bg, borderColor: t.border }}>
              <span className="w-9 h-9 rounded-[11px] grid place-items-center text-white shrink-0" style={{ background: t.solid }}><Icon name={icon} size={17} /></span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium" style={{ color: t.text }}>{label}</div>
                <div className="text-[11.5px] opacity-75" style={{ color: t.text }}>{desc}</div>
              </div>
            </Link>
          );
        })}
      </div>

      <NoteBox tone="purple">
        Delivery executes the promise — it never owns the price or the policy. Delivery charge = Delivery rate card; free-delivery waiver = Offers; the order stores the final snapshot. Stock is committed at &quot;preparing&quot; (DEC-MOD-003), owned by Product.
      </NoteBox>
    </div>
  );
}

/* ═══════════════ DISPATCH & RIDERS ═══════════════ */
export function DispatchRiders() {
  const riders = DEMO_FLEET.filter((f) => f.kind === "RIDER" && f.active);
  const [board, setBoard] = useState(() => structuredClone(DEMO_BOARD));
  const waiting = board.filter((o) => o.deliveryStatus === "unassigned" && o.zone === "DHAKA");

  const loadOf = (rid: string) => board.filter((o) => o.assigneeId === rid && (o.deliveryStatus === "preparing" || o.deliveryStatus === "out_for_delivery")).length;

  function assignTo(orderId: string, rid: string) {
    setBoard((b) => b.map((o) => (o.id === orderId ? { ...o, assigneeId: rid, deliveryStatus: "preparing" } : o)));
  }

  return (
    <div className={WRAP}>
      <PageHead eyebrow="Operations · Delivery" title="Dispatch & riders">
        In-house riders for Dhaka&apos;s time-critical promises. See who is free, who is stacked up, and hand the waiting orders to the right rider.
      </PageHead>
      <DemoBar text="3 in-house riders + a live waiting pool. Assign an order and it moves to Preparing (stock committed)." />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="grid sm:grid-cols-3 gap-3">
            {riders.map((r) => {
              const load = loadOf(r.id);
              const cap = 6;
              const pct = Math.min(100, Math.round((load / cap) * 100));
              const tone: Tone = load >= cap ? "rose" : load >= cap - 2 ? "amber" : "green";
              const t = TONE[tone];
              return (
                <div key={r.id} className="bg-white rounded-[14px] border shadow-soft p-3.5" style={{ borderColor: t.border }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-8 h-8 rounded-full grid place-items-center text-white text-[12px] font-medium shrink-0" style={{ background: t.solid }}>{r.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-purple truncate">{r.name}</div>
                      <div className="text-[13px] text-body-soft">{r.onTimePct}% on-time</div>
                    </div>
                  </div>
                  <div className="flex justify-between text-[11.5px] mb-1"><span style={{ color: t.text }}>{load} in hand</span><span className="text-body-soft">/ {cap}</span></div>
                  <div className="h-[8px] rounded-full bg-lavender overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: t.solid }} /></div>
                  <a href={`tel:${r.phone}`} className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium" style={{ color: TONE.green.text }}><Icon name="phone" size={12} /> Call</a>
                </div>
              );
            })}
          </div>
        </div>

        <Panel title="Waiting to assign — Dhaka" icon="bolt" tone="rose" count={waiting.length} hint="tap a rider to hand it over">
          {waiting.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px]" style={{ color: TONE.green.text }}><Icon name="check" size={20} /><div className="mt-1">All handed out.</div></div>
          ) : waiting.map((o) => (
            <div key={o.id} className="border-t border-lavender-deep first:border-t-0 px-4 py-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[13px] font-semibold text-purple">{o.orderNo}</span>
                <TypeTag type={o.type} />
                <span className="ml-auto text-[12px] font-semibold text-purple">{formatTaka(o.totalPaisa)}</span>
              </div>
              <div className="text-[13px] text-body-soft mb-2">{o.area} · {o.slotLabel} · {o.etaLabel}</div>
              <div className="flex flex-wrap gap-1.5">
                {riders.map((r) => (
                  <button key={r.id} onClick={() => assignTo(o.id, r.id)} className="text-[11.5px] px-2.5 py-1 rounded-[8px] border bg-white hover:border-orchid text-purple font-medium">
                    {r.name.split(" ")[0]} <span className="text-body-soft">({loadOf(r.id)})</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

/* ═══════════════ FAILED & RTO ═══════════════ */
export function FailedRto() {
  const [rows, setRows] = useState<FailedDelivery[]>(() => structuredClone(DEMO_FAILED));
  const failed = rows.filter((r) => r.state === "failed");
  const rto = rows.filter((r) => r.state === "rto");
  const atRisk = rows.reduce((n, r) => n + r.valuePaisa, 0);

  const setState = (orderNo: string, state: FailedDelivery["state"]) => setRows((b) => b.map((r) => (r.orderNo === orderNo ? { ...r, state } : r)));

  const Row = ({ r }: { r: FailedDelivery }) => (
    <div className="border-t border-lavender-deep first:border-t-0 px-4 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-semibold text-purple">{r.orderNo}</span>
        <span className="text-[12px] text-body">{r.customerName}</span>
        <span className="text-[13px] text-body-soft">· {r.zone}</span>
        <span className="ml-auto text-[12px] font-semibold text-purple">{formatTaka(r.valuePaisa)}</span>
      </div>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11.5px]">
        <span className="px-2 py-0.5 rounded-full border" style={{ background: TONE.rose.bg, borderColor: TONE.rose.border, color: TONE.rose.text }}>{r.reason}</span>
        <span className="text-body-soft">Attempt {r.attempts} · {r.assignee}</span>
        <div className="ml-auto flex gap-1.5">
          <a href={`tel:${r.phone}`} className="px-2.5 py-1 rounded-[8px] border bg-white font-medium inline-flex items-center gap-1" style={{ color: TONE.green.text, borderColor: TONE.green.border }}><Icon name="phone" size={12} /> Call</a>
          {r.state === "failed" ? (
            <>
              <button onClick={() => setState(r.orderNo, "failed")} className="px-2.5 py-1 rounded-[8px] text-white font-medium" style={{ background: TONE.blue.solid }}>Re-attempt</button>
              <button onClick={() => setState(r.orderNo, "rto")} className="px-2.5 py-1 rounded-[8px] border bg-white font-medium" style={{ color: TONE.gold.text, borderColor: TONE.gold.border }}>Start RTO</button>
            </>
          ) : (
            <span className="px-2.5 py-1 rounded-[8px] font-medium" style={{ background: TONE.gold.bg, color: TONE.gold.text }}>Return in progress</span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={WRAP}>
      <PageHead eyebrow="Operations · Delivery" title="Failed & returns (RTO)">
        A failed delivery is the fastest way to lose trust. Call, re-attempt, or send it back — every reason is recorded.
      </PageHead>
      <DemoBar text="Failed deliveries and returns-to-origin, with the reason and how many attempts were made." />

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Failed" value={String(failed.length)} tone="rose" icon="shield" />
        <Stat label="Return to origin" value={String(rto.length)} tone="gold" icon="box" />
        <Stat label="Value at risk" value={formatTaka(atRisk)} tone="amber" icon="cash" />
      </div>

      <Panel title="Failed — needs a decision" icon="shield" tone="rose" count={failed.length}>
        {failed.length === 0 ? <div className="px-4 py-8 text-center text-[13px]" style={{ color: TONE.green.text }}>No failed deliveries.</div> : failed.map((r) => <Row key={r.orderNo} r={r} />)}
      </Panel>
      <Panel title="Return to origin" icon="box" tone="gold" count={rto.length}>
        {rto.length === 0 ? <div className="px-4 py-8 text-center text-[13px] text-body-soft">Nothing returning.</div> : rto.map((r) => <Row key={r.orderNo} r={r} />)}
      </Panel>

      <NoteBox tone="purple">
        A failed delivery / RTO is a <b>Delivery</b> movement. It is not the same as a Sales &quot;Return Order&quot; (a commercial decision) or a &quot;Stock Reverted&quot; on cancel — those stay separate records (One Data One Owner).
      </NoteBox>
    </div>
  );
}

/* ═══════════════ TRACKING & CONSIGNMENT ═══════════════ */
export function TrackingConsole() {
  const C_TONE: Record<string, Tone> = { booked: "amber", picked: "blue", in_transit: "blue", delivered: "green", returned: "rose" };
  const counts = DEMO_CONSIGNMENTS.reduce((m, c) => ((m[c.status] = (m[c.status] ?? 0) + 1), m), {} as Record<string, number>);

  return (
    <div className={WRAP}>
      <PageHead eyebrow="Operations · Delivery" title="Tracking & consignments">
        Nationwide parcels handed to 3PL couriers. Today these are entered by hand — one-click consignment + auto status over the courier API is the next step (P1).
      </PageHead>
      <DemoBar text="Sample 3PL consignments. In production the tracking id + status sync one-click from Steadfast / Pathao / RedX." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="In transit" value={String((counts.in_transit ?? 0) + (counts.picked ?? 0))} tone="blue" icon="truck" />
        <Stat label="Booked" value={String(counts.booked ?? 0)} tone="amber" icon="box" />
        <Stat label="Delivered" value={String(counts.delivered ?? 0)} tone="green" icon="check" />
        <Stat label="Returned" value={String(counts.returned ?? 0)} tone="rose" icon="shield" />
      </div>

      <Panel title="Consignments" icon="pin" tone="blue" count={DEMO_CONSIGNMENTS.length}>
        {DEMO_CONSIGNMENTS.map((c) => {
          const t = TONE[C_TONE[c.status]];
          return (
            <div key={c.orderNo} className="grid grid-cols-[auto_1fr_auto] gap-3 items-center border-t border-lavender-deep first:border-t-0 px-4 py-3">
              <span className="w-4 self-stretch rounded-full" style={{ background: t.solid }} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-purple">{c.orderNo}</span>
                  <span className="text-[11.5px] px-2 py-0.5 rounded-full border" style={{ background: TONE.purple.bg, borderColor: TONE.purple.border, color: TONE.purple.text }}>{PROVIDER_LABEL[c.provider]}</span>
                </div>
                <div className="text-[13px] text-body-soft mt-0.5">{c.zone} · updated {c.updatedLabel}</div>
              </div>
              <div className="text-right">
                <div className="text-[12px] font-mono text-purple">{c.trackingId}</div>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border capitalize" style={{ background: t.bg, borderColor: t.border, color: t.text }}>{c.status.replace("_", " ")}</span>
              </div>
            </div>
          );
        })}
      </Panel>

      <NoteBox tone="amber">
        <b>P1 — courier API:</b> connect Steadfast · Pathao · RedX so a consignment is created with one click and the status updates itself. Until then, paste the tracking id here from the courier panel.
      </NoteBox>
    </div>
  );
}

/* ═══════════════ PROOF OF DELIVERY ═══════════════ */
export function ProofOfDelivery() {
  return (
    <div className={WRAP}>
      <PageHead eyebrow="Operations · Delivery" title="Proof of delivery">
        Every order gets a &quot;made-with-care&quot; prep photo and a hand-over delivery photo. This is the gift experience — and the proof if anything is questioned.
      </PageHead>
      <DemoBar text="Sample prep + delivery photos. In production riders capture these in the delivery app and they upload to Cloudinary." />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {DEMO_PROOFS.map((p) => (
          <div key={p.orderNo} className="bg-white rounded-[16px] border shadow-soft overflow-hidden" style={{ borderColor: TONE.purple.border }}>
            <div className="grid grid-cols-2 gap-0.5">
              {[["Prep", p.prepBg], ["Delivery", p.deliveryBg]].map(([label, bg]) => (
                <div key={label as string} className="aspect-[4/3] relative grid place-items-center" style={{ background: (bg as string) || "#f4eefb" }}>
                  <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-[0.05em] bg-white/80 text-purple px-1.5 py-0.5 rounded-full">{label}</span>
                  {!bg && <span className="text-[13px] text-body-soft flex flex-col items-center gap-1"><Icon name="photo" size={20} /> not yet</span>}
                </div>
              ))}
            </div>
            <div className="px-3.5 py-3">
              <div className="text-[13px] font-semibold text-purple">{p.orderNo}</div>
              <div className="text-[13px] text-body-soft">{p.customerName} · by {p.capturedBy} · {p.capturedLabel}</div>
            </div>
          </div>
        ))}
      </div>

      <NoteBox tone="purple">
        Proof photos are <b>Delivery-owned</b> — Sales only displays them on the order. Upload path: delivery-app capture → Cloudinary. Sales/customer tracker reads, never writes.
      </NoteBox>
    </div>
  );
}
