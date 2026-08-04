"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP } from "./DeliveryUI";
import { TONE, type Tone } from "./OrderViews";
import {
  formatTaka, listOrders, orderAction, assignCourier,
  type ApiOrder, type DeliveryStatus,
} from "../_data/api";
import {
  isDeliveryDemo, setDeliveryDemo, DEMO_BOARD, DEMO_ASSIGNEES,
  DELIVERY_TYPE_META, deliveryTypeFromLabel, assigneeById, FAIL_REASONS,
  type BoardOrder,
} from "../_data/deliveryDemo";

/*
  Delivery > Fulfilment — colourful cards with a delivery progress tracker.
  Each order is a tinted card showing Assign → Prepare → On the way → Delivered as
  a stepper, plus one clear action. Records a manual delivery cost per order.
  BOUNDARY: moves deliveryStatus only (Delivery-owned). DEC-MOD-003 at "preparing".
*/

function fromApi(a: ApiOrder): BoardOrder {
  return {
    id: a.id, orderNo: a.orderNo, customerName: a.customer?.name ?? a.senderName,
    recipientName: a.recipientName ?? undefined, isGift: a.isGift,
    phone: (a.isGift ? a.recipientPhone : a.senderPhone) || a.senderPhone,
    zone: a.zone === "DHAKA" ? "DHAKA" : "NATIONWIDE", area: "", address: a.address,
    type: deliveryTypeFromLabel(a.methodLabel), slotLabel: a.slotLabel || "",
    dateLabel: a.date || "", etaLabel: a.etaLabel || "", totalPaisa: a.totalPaisa,
    itemCount: a._count?.lines ?? a.lines?.length ?? 1,
    hasCrafted: (a.lines ?? []).some((l) => l.productType === "CRAFTED"),
    deliveryStatus: a.deliveryStatus, assigneeId: null,
  };
}

const STEPS = ["Assign", "Prepare", "On the way", "Delivered"];
function levelOf(s: DeliveryStatus) {
  return s === "delivered" ? 4 : s === "out_for_delivery" ? 2 : s === "preparing" ? 1 : 0;
}

/* the pretty progress tracker */
function Stepper({ status, tone }: { status: DeliveryStatus; tone: Tone }) {
  const failed = status === "failed";
  const level = failed ? 2 : levelOf(status);
  const solid = TONE[tone].solid;
  return (
    <div className="flex items-start mt-3 mb-1">
      {STEPS.map((label, i) => {
        const done = i < level;
        const current = i === level && !failed;
        const isFailNode = failed && i === 3;
        return (
          <Fragment key={label}>
            <div className="flex flex-col items-center" style={{ width: 58 }}>
              <div className="w-[24px] h-[24px] rounded-full grid place-items-center shrink-0 transition-all"
                style={{
                  background: isFailNode ? "#fdeef0" : done ? solid : current ? "#fff" : "#f0e9f8",
                  border: current ? `2px solid ${solid}` : isFailNode ? "2px solid #d64550" : "none",
                  boxShadow: current ? `0 0 0 4px ${TONE[tone].soft}` : "none",
                }}>
                {isFailNode ? <span className="text-[12px] font-bold" style={{ color: "#d64550" }}>✕</span>
                  : done ? <Icon name="check" size={13} className="text-white" />
                    : current ? <span className="w-[8px] h-[8px] rounded-full" style={{ background: solid }} />
                      : <span className="w-[7px] h-[7px] rounded-full bg-[#d7c9ea]" />}
              </div>
              <span className="text-[9.5px] mt-1 text-center leading-tight" style={{ color: isFailNode ? "#d64550" : done || current ? TONE[tone].text : "#a897c2" }}>
                {isFailNode ? "Failed" : label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="h-[2.5px] rounded-full mt-[11px] flex-1" style={{ background: i < level ? solid : "#ece3f6" }} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

export function FulfilmentBoard() {
  const [board, setBoard] = useState<BoardOrder[]>([]);
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [isDemo, setIsDemo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failFor, setFailFor] = useState<string | null>(null);
  const [trackIds, setTrackIds] = useState<Record<string, string>>({});
  const [proofs, setProofs] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<"active" | "unassigned" | "preparing" | "out_for_delivery" | "done">("active");

  async function load() {
    setLoading(true); setError(null);
    if (isDeliveryDemo()) { setBoard(structuredClone(DEMO_BOARD)); setIsDemo(true); setLoading(false); return; }
    try {
      const res = await listOrders();
      const rows = res.items.filter((o) => o.salesStatus !== "cancelled" && o.salesStatus !== "placed").map(fromApi);
      if (rows.length === 0) { setBoard(structuredClone(DEMO_BOARD)); setIsDemo(true); }
      else { setBoard(rows); setIsDemo(false); }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); setBoard(structuredClone(DEMO_BOARD)); setIsDemo(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const patch = (id: string, next: Partial<BoardOrder>) => setBoard((b) => b.map((o) => (o.id === id ? { ...o, ...next } : o)));
  async function advance(o: BoardOrder, to: DeliveryStatus, extra?: Partial<BoardOrder>) {
    setFailFor(null);
    if (isDemo) { patch(o.id, { deliveryStatus: to, ...extra }); return; }
    setBusy(o.id);
    try {
      const action = to === "preparing" ? "prepare" : to === "out_for_delivery" ? "out-for-delivery" : to === "delivered" ? "delivered" : "fail";
      await orderAction(o.id, action as "prepare" | "out-for-delivery" | "delivered" | "fail"); await load();
    } catch (e) { alert(e instanceof Error ? e.message : "Could not update"); } finally { setBusy(null); }
  }
  async function assign(o: BoardOrder, aid: string) {
    const a = assigneeById(aid); if (!a) return;
    if (isDemo) { patch(o.id, { assigneeId: aid, deliveryStatus: "preparing" }); return; }
    setBusy(o.id);
    try { await assignCourier(o.id, { courier: a.name, provider: a.provider, kind: a.kind }); await orderAction(o.id, "prepare"); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Could not assign"); } finally { setBusy(null); }
  }

  const k = useMemo(() => {
    const by = (s: DeliveryStatus) => board.filter((o) => o.deliveryStatus === s).length;
    const costToday = board.filter((o) => o.deliveryStatus === "delivered").reduce((n, o) => n + (Number(costs[o.id]) || 0), 0);
    return { unassigned: by("unassigned"), preparing: by("preparing"), out: by("out_for_delivery"), delivered: by("delivered"), failed: by("failed"), costToday };
  }, [board, costs]);

  const assigneesFor = (o: BoardOrder) => {
    const r = DEMO_ASSIGNEES.filter((a) => a.kind === "RIDER"), c = DEMO_ASSIGNEES.filter((a) => a.kind === "COURIER");
    return o.zone === "DHAKA" ? [...r, ...c] : [...c, ...r];
  };
  const loadOf = (id: string) => board.filter((o) => o.assigneeId === id && (o.deliveryStatus === "preparing" || o.deliveryStatus === "out_for_delivery")).length;

  const tabs: { key: typeof tab; label: string; n: number; tone: Tone }[] = [
    { key: "active", label: "Active", n: k.unassigned + k.preparing + k.out, tone: "purple" },
    { key: "unassigned", label: "To assign", n: k.unassigned, tone: "rose" },
    { key: "preparing", label: "Preparing", n: k.preparing, tone: "amber" },
    { key: "out_for_delivery", label: "On the way", n: k.out, tone: "blue" },
    { key: "done", label: "Done", n: k.delivered + k.failed, tone: "green" },
  ];
  const rows = board.filter((o) =>
    tab === "active" ? ["unassigned", "preparing", "out_for_delivery"].includes(o.deliveryStatus)
      : tab === "done" ? ["delivered", "failed", "stock_reverted"].includes(o.deliveryStatus)
        : o.deliveryStatus === tab);

  const kpis: { label: string; value: string; tone: Tone; icon: string }[] = [
    { label: "To assign", value: String(k.unassigned), tone: "rose", icon: "bolt" },
    { label: "Preparing", value: String(k.preparing), tone: "amber", icon: "box" },
    { label: "On the way", value: String(k.out), tone: "blue", icon: "truck" },
    { label: "Delivered", value: String(k.delivered), tone: "green", icon: "check" },
    { label: "Cost today", value: formatTaka(k.costToday * 100), tone: "purple", icon: "cash" },
  ];

  function Card({ o }: { o: BoardOrder }) {
    const busyThis = busy === o.id;
    const m = DELIVERY_TYPE_META[o.type];
    const who = assigneeById(o.assigneeId);
    const name = o.isGift && o.recipientName ? o.recipientName : o.customerName;
    const tone: Tone = o.deliveryStatus === "failed" ? "rose" : o.deliveryStatus === "delivered" ? "green"
      : o.deliveryStatus === "out_for_delivery" ? "blue" : o.deliveryStatus === "preparing" ? "amber"
        : m.urgent ? "rose" : "purple";
    const t = TONE[tone];
    const badge = TONE[m.tone as Tone];

    return (
      <div className="rounded-[16px] border shadow-soft overflow-hidden flex flex-col" style={{ background: "#fff", borderColor: t.border }}>
        <div className="h-[5px] w-full" style={{ background: `linear-gradient(90deg, ${t.solid}, ${badge.solid})` }} />
        <div className="p-4 flex flex-col flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Link href={`/orders/${o.id}`} className="text-[14px] font-bold text-purple hover:underline">{o.orderNo}</Link>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: badge.bg, color: badge.text }}>
              <Icon name={m.icon} size={11} /> {m.short}
            </span>
            {o.isGift && <span className="text-[12px]">🎁</span>}
            {m.urgent && o.deliveryStatus !== "delivered" && <span className="ml-auto text-[9.5px] font-bold uppercase tracking-[0.05em] px-1.5 py-0.5 rounded-full" style={{ background: TONE.rose.bg, color: TONE.rose.text }}>urgent</span>}
          </div>
          <div className="text-[13.5px] font-semibold text-body">{name}</div>
          <div className="text-[13px] text-body-soft">{o.zone === "DHAKA" ? "Dhaka" : "Nationwide"}{o.area ? ` · ${o.area}` : ""} · {o.slotLabel || o.dateLabel}{who ? ` · ${who.name}` : ""}</div>

          <Stepper status={o.deliveryStatus} tone={tone} />
          {o.deliveryStatus === "failed" && o.failReason && (
            <div className="text-[11px] rounded-[8px] px-2 py-1 mb-1" style={{ background: TONE.rose.bg, color: TONE.rose.text }}>Reason: {o.failReason}</div>
          )}

          {who?.kind === "COURIER" && o.deliveryStatus !== "unassigned" && o.deliveryStatus !== "failed" && (
            <div className="mt-2 flex items-center gap-1.5 border rounded-[9px] h-[30px] px-2" style={{ borderColor: TONE.blue.border, background: TONE.blue.bg, color: TONE.blue.text }}>
              <Icon name="pin" size={12} className="shrink-0" />
              <input value={trackIds[o.id] ?? ""} onChange={(e) => setTrackIds((c) => ({ ...c, [o.id]: e.target.value }))} placeholder="3PL consignment / tracking id" className="w-full text-[11.5px] outline-none bg-transparent" style={{ color: TONE.blue.text }} />
            </div>
          )}
          {o.deliveryStatus === "delivered" && (
            <button onClick={() => setProofs((pr) => ({ ...pr, [o.id]: !pr[o.id] }))} className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-medium self-start" style={{ color: proofs[o.id] ? TONE.green.text : TONE.purple.text }}>
              <Icon name="photo" size={13} /> {proofs[o.id] ? "Proof photo attached ✓" : "Add proof photo"}
            </button>
          )}
          <div className="mt-auto pt-3 flex items-center gap-2">
            <span className="text-[13px] font-bold text-purple">{formatTaka(o.totalPaisa)}</span>
            <div className="ml-auto flex items-center gap-1.5">
              {o.deliveryStatus === "unassigned" && (
                <select disabled={busyThis} defaultValue="" onChange={(e) => e.target.value && assign(o, e.target.value)} className="text-[12.5px] text-white rounded-[9px] pl-2.5 pr-1 h-[34px] font-medium cursor-pointer max-w-[160px]" style={{ background: t.solid }}>
                  <option value="" disabled>Assign &amp; prep…</option>
                  {assigneesFor(o).map((a) => <option key={a.id} value={a.id} className="text-body">{a.kind === "RIDER" ? "Rider · " : "3PL · "}{a.name}{a.kind === "RIDER" ? ` · ${loadOf(a.id)} in hand` : ""}</option>)}
                </select>
              )}
              {o.deliveryStatus === "preparing" && (
                <button disabled={busyThis} onClick={() => advance(o, "out_for_delivery")} className="text-[12.5px] text-white h-[34px] px-4 rounded-[10px] font-medium inline-flex items-center gap-1.5" style={{ background: t.solid }}><Icon name="truck" size={14} /> Send out</button>
              )}
              {o.deliveryStatus === "out_for_delivery" && (failFor === o.id ? (
                <select autoFocus defaultValue="" onChange={(e) => e.target.value && advance(o, "failed", { failReason: e.target.value })} onBlur={() => setFailFor(null)} className="text-[12px] border rounded-[9px] px-2 h-[34px] bg-white max-w-[160px]" style={{ borderColor: "#f0c9cc", color: "#b42318" }}>
                  <option value="" disabled>Reason…</option>{FAIL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              ) : (
                <>
                  <button disabled={busyThis} onClick={() => advance(o, "delivered")} className="text-[12.5px] text-white h-[34px] px-3.5 rounded-[10px] font-medium inline-flex items-center gap-1.5" style={{ background: TONE.green.solid }}><Icon name="check" size={14} /> Delivered</button>
                  <button disabled={busyThis} onClick={() => setFailFor(o.id)} className="text-[12px] h-[34px] px-2.5 rounded-[10px] border bg-white font-medium" style={{ color: TONE.rose.text, borderColor: TONE.rose.border }}>Failed</button>
                </>
              ))}
              {o.deliveryStatus === "delivered" && (
                <div className="flex items-center gap-1 border rounded-[10px] h-[34px] px-2.5" style={{ borderColor: TONE.green.border, background: TONE.green.bg }} title="what we paid — separate from customer charge">
                  <span className="text-[11px]" style={{ color: TONE.green.text }}>paid ৳</span>
                  <input value={costs[o.id] ?? ""} onChange={(e) => setCosts((c) => ({ ...c, [o.id]: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="0" className="w-[54px] text-[12.5px] outline-none bg-transparent" style={{ color: TONE.green.text }} />
                </div>
              )}
              {o.deliveryStatus === "failed" && (
                <button onClick={() => advance(o, "out_for_delivery", { failReason: null })} className="text-[12.5px] h-[34px] px-3.5 rounded-[10px] font-medium text-white inline-flex items-center gap-1.5" style={{ background: TONE.blue.solid }}>Re-attempt</button>
              )}
              {o.deliveryStatus === "stock_reverted" && (
                <span className="text-[13px] text-body-soft">Cancelled · stock reverted</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={WRAP}>
      {/* header */}
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid"><span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} /> Operations · Delivery</div>
          <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">Fulfilment</h1>
          <p className="text-body-soft text-[13.5px] m-0">Track every delivery from assign to doorstep — one clear step at a time.</p>
        </div>
        <button onClick={load} className="text-body-soft hover:text-purple w-10 h-10 grid place-items-center rounded-[12px] border border-[#eadff5] bg-white"><Icon name="download" size={17} /></button>
      </div>

      {isDemo && (
        <div className="flex items-center gap-2 text-[13px] text-body-soft mb-4">
          <span className="text-[10px] font-bold tracking-[0.05em] uppercase bg-lavender text-purple px-2 py-0.5 rounded-full">Demo</span>
          Sample deliveries — try assign → send out → delivered.
          <button onClick={() => { setDeliveryDemo(false); load(); }} className="underline hover:text-purple">use live data</button>
        </div>
      )}
      {error && <div className="text-[12.5px] text-[#b42318] mb-3">{error} · <button onClick={load} className="underline">retry</button></div>}

      {/* colourful KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        {kpis.map((s) => {
          const t = TONE[s.tone];
          return (
            <div key={s.label} className="rounded-[15px] px-4 py-3 border" style={{ background: t.bg, borderColor: t.border }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-7 h-7 rounded-[9px] grid place-items-center text-white shrink-0" style={{ background: t.solid }}><Icon name={s.icon} size={15} /></span>
                <span className="text-[11.5px] font-medium" style={{ color: t.text }}>{s.label}</span>
              </div>
              <div className="font-display text-[24px] leading-none" style={{ color: t.text }}>{s.value}</div>
            </div>
          );
        })}
      </div>

      {/* tabs */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {tabs.map((t) => {
          const on = tab === t.key; const tn = TONE[t.tone];
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className="px-3.5 py-2 rounded-full text-[12.5px] font-medium border transition-all inline-flex items-center gap-1.5"
              style={on ? { background: tn.solid, color: "#fff", borderColor: tn.solid } : { background: "#fff", color: tn.text, borderColor: tn.border }}>
              {t.label} <span className="text-[11px] px-1.5 rounded-full" style={{ background: on ? "rgba(255,255,255,.25)" : tn.bg }}>{t.n}</span>
            </button>
          );
        })}
      </div>

      {/* cards */}
      {loading ? (
        <div className="py-16 text-center text-[13px] text-body-soft">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center"><div className="w-12 h-12 rounded-full bg-lavender grid place-items-center mx-auto mb-2 text-purple"><Icon name="check" size={22} /></div><div className="text-[13px] text-body-soft">Nothing here right now.</div></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((o) => <Card key={o.id} o={o} />)}
        </div>
      )}

      <p className="text-[13px] text-body-soft mt-5">Assigning starts preparation — stock is committed then (DEC-MOD-003). This board only moves the delivery step; it never confirms or cancels the order.</p>
    </div>
  );
}
