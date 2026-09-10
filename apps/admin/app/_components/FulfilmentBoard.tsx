"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Said, useSay } from "./Said";
import { WRAP, ErrorBox } from "./OrderViews";
import {
  deliveryBoard, assignmentAction, orderAction, createAssignment, addOrderPhoto, uploadItemImage, orderMessagesFor,
  listRiders, listCourierServices, listFailReasons, formatTaka,
  type ApiBoardOrder, type ApiRider, type ApiCourierService, type ApiFailReason, type ApiOrderMessage,
} from "../_data/api";
import Icon from "./Icon";
import {
  SOLID, CELL, LABEL, VALUE, SOFT, NO, NAME, TABLE_WRAP, TABLE,
  Pill, Tag, ActButton, Band, BandButton, Segs, Search, Count, Head, Empty,
  fmtDay, fmtStamp, type Tile,
} from "./OrdersUi";

/*
  Delivery -> Delivery board (owner, 10 Sep 2026; design/delivery-flow-v1.html tab 2).

  Today's parcels, sorted by the promise. The SAME rules and the SAME words as
  the order page, and — owner, later the same day — NOTHING LEAVES THIS PAGE:
  every action opens a panel on the right, the list stays behind it.
    Needs carrier  → Assign carrier (own rider / courier / one-time), in the panel
    Needs photo    → Upload photo, sent to the customer, status in the panel
    Ready          → Out for delivery (through the assignment, so Delivery hears it)
    On the road    → Delivered / Failed (reason + decision, in the panel)
    Failed         → Assign again (retry), in the panel
  "Open" is there only for reading the whole order.
*/

type Seg = "" | "carrier" | "photo" | "ready" | "out" | "late" | "failed" | "done";
/*  Names as the owner set them (10 Sep 2026).  */
const SEGS: [Seg, string][] = [
  ["", "All orders"],
  ["carrier", "Not assigned"],
  ["photo", "Photo pending"],
  ["ready", "Ready to go"],
  ["out", "On the road"],
  ["late", "Late"],
  ["failed", "Failed"],
  ["done", "Delivery successful"],
];

function hasCarrier(o: ApiBoardOrder) {
  return !!o.assignment && o.assignment.isActive && o.assignment.status === "ASSIGNED";
}
function needsPhoto(o: ApiBoardOrder) {
  return o.photoUpdates && !o.hasPrepPhoto;
}
function isLate(o: ApiBoardOrder) {
  return !!o.promisedBy && new Date(o.promisedBy).getTime() < Date.now() && o.deliveryStatus !== "failed" && o.deliveryStatus !== "delivered";
}
function inSeg(o: ApiBoardOrder, s: Seg): boolean {
  const prep = o.deliveryStatus === "preparing" || o.deliveryStatus === "unassigned";
  switch (s) {
    case "":
      return true;
    case "carrier":
      return prep && !hasCarrier(o);
    case "photo":
      return prep && hasCarrier(o) && needsPhoto(o);
    case "ready":
      return prep && hasCarrier(o) && !needsPhoto(o);
    case "out":
      return o.deliveryStatus === "out_for_delivery";
    case "late":
      return isLate(o);
    case "failed":
      return o.deliveryStatus === "failed";
    case "done":
      return o.deliveryStatus === "delivered";
  }
}

/** "2 h late" · "in 40 min" · "—" */
function due(promisedBy?: string | null): { text: string; late: boolean; soon: boolean } {
  if (!promisedBy) return { text: "—", late: false, soon: false };
  const mins = Math.round((new Date(promisedBy).getTime() - Date.now()) / 60000);
  if (mins < 0) {
    const m = Math.abs(mins);
    return { text: m < 60 ? `${m} min late` : `${Math.floor(m / 60)} h late`, late: true, soon: false };
  }
  if (mins < 60) return { text: `in ${mins} min`, late: false, soon: true };
  if (mins < 60 * 20) return { text: `in ${Math.round(mins / 60)} h`, late: false, soon: false };
  return { text: fmtDay(promisedBy)?.label ?? "—", late: false, soon: false };
}

function carrierText(o: ApiBoardOrder): { name: string; sub: string } | null {
  const a = o.assignment;
  if (!a || !a.isActive) return null;
  if (a.kind === "RIDER") return { name: a.rider?.name ?? "Rider", sub: "own rider" };
  if (a.kind === "ONE_TIME") return { name: `${a.platform ?? "One-time"} rider`, sub: a.costPaisa ? `paid ${formatTaka(a.costPaisa)}${a.paidCash ? " cash" : ""}` : "one-time" };
  return { name: a.courier?.name ?? "Courier", sub: a.consignmentNo ? `CN ${a.consignmentNo}` : "courier" };
}

type PanelMode = "assign" | "photo" | "fail";
function Row({ o, onChanged, onPanel }: { o: ApiBoardOrder; onChanged: () => void; onPanel: (mode: PanelMode) => void }) {
  const say = useSay();
  const [busy, setBusy] = useState(false);
  const d =
    o.deliveryStatus === "delivered"
      ? { text: "Delivered", late: false, soon: false }
      : due(o.promisedBy);
  const carrier = carrierText(o);
  const live = o.assignment && o.assignment.isActive ? o.assignment : null;
  const prep = o.deliveryStatus === "preparing" || o.deliveryStatus === "unassigned";
  const status =
    o.deliveryStatus === "delivered"
      ? { label: "Delivery successful", colour: SOLID.green }
      : o.deliveryStatus === "failed"
        ? { label: "Failed", colour: SOLID.red }
        : o.deliveryStatus === "out_for_delivery"
          ? { label: "On the road", colour: SOLID.orchid }
          : !hasCarrier(o)
            ? { label: "Not assigned", colour: SOLID.amber }
            : needsPhoto(o)
              ? { label: "Photo pending", colour: SOLID.amber }
              : { label: "Ready to go", colour: SOLID.blue };

  async function run(fn: () => Promise<unknown>, fail: string) {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      say.fromError(e, fail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="hover:bg-[#fcfaff]">
      <td className={`${CELL} w-[34px]`} style={d.late ? { boxShadow: `inset 4px 0 0 ${SOLID.red}` } : undefined}>
        <Said say={say} />
        <input type="checkbox" className="w-[15px] h-[15px] accent-purple mt-0.5" aria-label={`Select ${o.orderNo}`} />
      </td>
      <td className={`${CELL} w-[130px]`}>
        <span className={VALUE} style={{ color: d.late ? SOLID.red : d.soon ? SOLID.amber : undefined }}>{d.text}</span>
        <span className={`block ${SOFT}`}>{[o.slotLabel, o.methodLabel].filter(Boolean).join(" · ") || o.zone}</span>
      </td>
      <td className={`${CELL} w-[118px]`}>
        <Link href={`/orders/${o.id}`} className={NO}>{o.orderNo}</Link>
        {o.isGift && <div className="mt-1"><Tag colour={SOLID.orchid}>GIFT</Tag></div>}
      </td>
      <td className={CELL}>
        <Link href={`/orders/${o.id}`} className={NAME}>{o.isGift && o.recipientName ? o.recipientName : o.customer?.name}</Link>
        {o.isGift && o.recipientName && <span className={`block ${SOFT}`}>from {o.customer?.name}</span>}
        <span className={`block ${SOFT}`}>{o.address}</span>
      </td>
      <td className={`${CELL} w-[200px]`}>
        {o.items.map((l) => (
          <span key={l.name} className="block">
            {l.name}{l.qty > 1 ? ` ×${l.qty}` : ""}
          </span>
        ))}
        {o.lineCount > o.items.length && <span className={`block ${SOFT}`}>+{o.lineCount - o.items.length} more</span>}
      </td>
      <td className={`${CELL} w-[150px]`}>
        {carrier ? (
          <>
            <span className={VALUE}>{carrier.name}</span>
            <span className={`block ${SOFT}`}>{carrier.sub}</span>
          </>
        ) : (
          <span className={SOFT}>— none —</span>
        )}
      </td>
      <td className={`${CELL} w-[130px]`}>
        {!o.photoUpdates ? (
          <Pill colour={SOLID.grey}>not asked</Pill>
        ) : o.hasPrepPhoto ? (
          <Pill colour={SOLID.green}>photo sent</Pill>
        ) : (
          <Pill colour={SOLID.amber}>needed · before</Pill>
        )}
      </td>
      <td className={`${CELL} w-[100px] text-right whitespace-nowrap`}>
        {o.duePaisa > 0 ? <span className="font-medium" style={{ color: SOLID.amber }}>{formatTaka(o.duePaisa)}</span> : <span className={SOFT}>—</span>}
      </td>
      <td className={`${CELL} w-[130px]`}>
        <Pill colour={status.colour}>{status.label}</Pill>
        {o.deliveryStatus === "failed" && live?.failReason && <span className={`block ${SOFT} mt-1 leading-snug`}>{live.failReason}</span>}
        {o.deliveryStatus === "delivered" && o.deliveredAt && <span className={`block ${SOFT} mt-1`}>{fmtStamp(o.deliveredAt)}</span>}
      </td>
      <td className={`${CELL} w-[176px]`}>
        <div className="flex flex-col gap-1.5">
          {prep && !hasCarrier(o) && <ActButton kind="primary" onClick={() => onPanel("assign")}>Assign carrier</ActButton>}
          {prep && hasCarrier(o) && needsPhoto(o) && <ActButton kind="solid" colour={SOLID.blue} onClick={() => onPanel("photo")}>Upload photo</ActButton>}
          {prep && hasCarrier(o) && !needsPhoto(o) && (
            <ActButton kind="solid" colour={SOLID.orchid} disabled={busy} onClick={() => run(() => assignmentAction(live!.id, "out"), `Could not send ${o.orderNo} out.`)}>
              {busy ? "…" : "Out for delivery"}
            </ActButton>
          )}
          {o.deliveryStatus === "out_for_delivery" && live && (
            <>
              <ActButton kind="solid" colour={SOLID.green} disabled={busy} onClick={() => run(() => assignmentAction(live.id, "delivered"), `Could not mark ${o.orderNo} delivered.`)}>
                {busy ? "…" : "Delivered"}
              </ActButton>
              <ActButton onClick={() => onPanel("fail")} kind="quiet">
                <span style={{ color: SOLID.red }}>Failed</span>
              </ActButton>
            </>
          )}
          {o.deliveryStatus === "failed" && <ActButton kind="primary" onClick={() => onPanel("assign")}>Assign again · retry</ActButton>}
          {prep && hasCarrier(o) && <ActButton onClick={() => onPanel("assign")}>Change carrier</ActButton>}
          <ActButton href={`/orders/${o.id}`}>Open</ActButton>
        </div>
      </td>
    </tr>
  );
}

const HEADS = ["", "Deliver by", "Order No", "Going to", "Items", "Carrier", "Photo", "COD", "Status", "Action"];
const HELP =
  "Every confirmed parcel that has not been delivered, plus today's successful ones, sorted by the time we promised. The buttons are the order page's own: a parcel needs a carrier, then the customer's photo when they asked for one, then it can leave. " +
  "Delivered moves the COD cash to the carrier until Settle. Failed opens the decision on the order — retry, keep, or cancel.";

export default function FulfilmentBoard() {
  const [rows, setRows] = useState<ApiBoardOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seg, setSeg] = useState<Seg>("");
  const [q, setQ] = useState("");
  const [zone, setZone] = useState("");
  const [panel, setPanel] = useState<{ o: ApiBoardOrder; mode: PanelMode } | null>(null);
  const [riders, setRiders] = useState<ApiRider[]>([]);
  const [couriers, setCouriers] = useState<ApiCourierService[]>([]);
  const [reasons, setReasons] = useState<ApiFailReason[]>([]);
  useEffect(() => {
    listRiders().then((r) => setRiders(r.filter((x) => x.isActive))).catch(() => setRiders([]));
    listCourierServices().then((c) => setCouriers(c.filter((x) => x.isActive))).catch(() => setCouriers([]));
    listFailReasons().then(setReasons).catch(() => setReasons([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await deliveryBoard({ limit: 200 });
      setRows(page.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the board");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<Seg, number> = { "": rows.length, carrier: 0, photo: 0, ready: 0, out: 0, late: 0, failed: 0, done: 0 };
    for (const o of rows) for (const [k] of SEGS) if (k && inSeg(o, k)) c[k]++;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((o) => {
      const okZ = !zone || o.zone === zone;
      const okQ =
        !needle ||
        o.orderNo.toLowerCase().includes(needle) ||
        (o.customer?.name ?? "").toLowerCase().includes(needle) ||
        (o.customer?.phone ?? "").includes(needle) ||
        (o.recipientName ?? "").toLowerCase().includes(needle) ||
        o.address.toLowerCase().includes(needle);
      return okZ && okQ && inSeg(o, seg);
    });
  }, [rows, q, zone, seg]);

  const v = (n: number) => (loading ? "…" : String(n));
  const tiles: Tile[] = [
    { key: "carrier", label: "Not assigned", value: v(counts.carrier), hot: counts.carrier > 0, sub: "nobody carrying it yet" },
    { key: "photo", label: "Photo pending", value: v(counts.photo), sub: "customer asked for one" },
    { key: "ready", label: "Ready to go", value: v(counts.ready), sub: "carrier + photo done" },
    { key: "out", label: "On the road", value: v(counts.out), sub: "out for delivery" },
    { key: "late", label: "Late", value: v(counts.late), hot: counts.late > 0, sub: "past the promise" },
    { key: "failed", label: "Failed", value: v(counts.failed), hot: counts.failed > 0, sub: "waiting for a decision" },
    { key: "done", label: "Delivery successful", value: v(counts.done), sub: "today" },
  ];

  return (
    <div className={WRAP}>
      <Band
        title="Delivery board"
        help={HELP}
        tiles={tiles}
        columns={7}
        active={seg || undefined}
        onTile={(k) => setSeg(seg === k ? "" : (k as Seg))}
        right={<BandButton onClick={() => void load()} icon="clock">Refresh</BandButton>}
      />
      <div className="flex gap-2.5 flex-wrap items-center mb-3">
        <Segs items={SEGS} value={seg} counts={loading ? undefined : counts} onChange={setSeg} />
        <Search value={q} onChange={setQ} placeholder="Order no, name, phone, area" />
        <select className="ipt max-w-[160px] h-[40px] font-medium" value={zone} onChange={(e) => setZone(e.target.value)}>
          <option value="">All zones</option>
          <option value="DHAKA">Inside Dhaka</option>
          <option value="BANGLADESH">Nationwide</option>
        </select>
        <Count n={shown.length} noun="parcel" loading={loading} />
      </div>
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      <div className={TABLE_WRAP}>
        <table className={TABLE}>
          <Head heads={HEADS} />
          <tbody>
            {shown.map((o) => (
              <Row key={o.id} o={o} onChanged={() => void load()} onPanel={(mode) => setPanel({ o, mode })} />
            ))}
          </tbody>
        </table>
        {!loading && shown.length === 0 && <Empty text="Nothing on the board." />}
      </div>
      {panel && (
        <BoardPanel
          o={panel.o}
          mode={panel.mode}
          riders={riders}
          couriers={couriers}
          reasons={reasons}
          onClose={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

/* ---------- the panel: the order page's three cards, without leaving the board ---------- */
function BoardPanel({
  o, mode, riders, couriers, reasons, onClose, onDone,
}: {
  o: ApiBoardOrder; mode: PanelMode; riders: ApiRider[]; couriers: ApiCourierService[]; reasons: ApiFailReason[];
  onClose: () => void; onDone: () => void;
}) {
  const [kind, setKind] = useState<"RIDER" | "COURIER" | "ONE_TIME">("RIDER");
  const [carrierId, setCarrierId] = useState("");
  const [consignment, setConsignment] = useState("");
  const [platform, setPlatform] = useState("Pathao ride");
  const [riderPhone, setRiderPhone] = useState("");
  const [fare, setFare] = useState("");
  const [paidCash, setPaidCash] = useState(true);
  const [chargeCustomer, setChargeCustomer] = useState(false);
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState<"RETRY" | "KEEP" | "CANCEL">("RETRY");
  const [uploading, setUploading] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<ApiOrderMessage | null>(null);
  const [photoDone, setPhotoDone] = useState(o.hasPrepPhoto);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const live = o.assignment && o.assignment.isActive ? o.assignment : null;
  const name = o.isGift && o.recipientName ? o.recipientName : o.customer?.name;
  const failed = o.deliveryStatus === "failed";

  const loadMsg = useCallback(() => {
    orderMessagesFor(o.id)
      .then((rows) => setPhotoMsg(rows.filter((m) => m.kind === "PHOTO_UPDATE").sort((a, b) => b.attempt - a.attempt)[0] ?? null))
      .catch(() => setPhotoMsg(null));
  }, [o.id]);
  useEffect(() => {
    if (mode === "photo") loadMsg();
  }, [mode, loadMsg]);

  async function run(fn: () => Promise<unknown>, fail: string, close = true) {
    setBusy(true);
    setErr("");
    try {
      await fn();
      if (close) onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : fail);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setUploading(true);
    setErr("");
    try {
      const url = await uploadItemImage(file, "delivery", 1400);
      await addOrderPhoto(o.id, { kind: "PREP", url, capturedBy: "Admin" });
      setPhotoDone(true);
      window.setTimeout(loadMsg, 4000);
      loadMsg();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not upload that photo.");
    } finally {
      setUploading(false);
    }
  }

  const title = mode === "assign" ? (failed ? "Assign again · retry" : live ? "Change carrier" : "Assign carrier") : mode === "photo" ? "Photo for the customer" : "Delivery failed";
  const input = "ipt h-[38px]";
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-[#320049]/30" />
      <div className="absolute right-0 top-0 h-full w-[440px] max-w-full bg-white shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-4 border-b border-[#e4dbec]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[15px] font-medium text-purple">{title}</div>
              <div className={`${SOFT} truncate`}>{o.orderNo} · {name} · {o.address}</div>
            </div>
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-[9px] border border-[#e4dbec] grid place-items-center text-[#7b6b87] hover:text-purple shrink-0" title="Close">×</button>
          </div>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          {err && <div className="rounded-[10px] border-[1.5px] px-3 py-2 text-[12.5px] font-medium bg-white" style={{ borderColor: SOLID.amber, color: "#8a4b00" }}>{err}</div>}

          {mode === "assign" && (
            <>
              <div className="inline-flex rounded-[10px] border border-[#e4dbec] overflow-hidden">
                {(["RIDER", "COURIER", "ONE_TIME"] as const).map((k) => (
                  <button key={k} type="button" onClick={() => { setKind(k); setCarrierId(""); }} className="text-[12.5px] font-medium px-3 py-2" style={kind === k ? { background: SOLID.purple, color: "#fff" } : { background: "#fff", color: "#7b6b87" }}>
                    {k === "RIDER" ? "Own rider" : k === "COURIER" ? "Courier company" : "One-time rider"}
                  </button>
                ))}
              </div>
              {kind !== "ONE_TIME" ? (
                <>
                  <div><span className={LABEL}>{kind === "RIDER" ? "Rider" : "Courier"}</span>
                    <select className={input} value={carrierId} onChange={(e) => setCarrierId(e.target.value)}>
                      <option value="">Select…</option>
                      {(kind === "RIDER" ? riders : couriers).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select></div>
                  {kind === "COURIER" && <div><span className={LABEL}>Consignment id</span><input className={input} value={consignment} onChange={(e) => setConsignment(e.target.value)} placeholder="from the courier panel" /></div>}
                </>
              ) : (
                <>
                  <div><span className={LABEL}>Platform</span>
                    <select className={input} value={platform} onChange={(e) => setPlatform(e.target.value)}>{["Pathao ride", "Uber", "Other"].map((p) => <option key={p}>{p}</option>)}</select></div>
                  <div><span className={LABEL}>Rider phone (optional)</span><input className={input} value={riderPhone} onChange={(e) => setRiderPhone(e.target.value)} placeholder="for today only" /></div>
                  <div><span className={LABEL}>Fare ৳</span><input type="number" min={0} className={input} value={fare} onChange={(e) => setFare(e.target.value)} placeholder="leave blank for Delivery money" /></div>
                  <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="w-4 h-4 accent-purple" checked={paidCash} onChange={(e) => setPaidCash(e.target.checked)} /> Paid in cash now</label>
                </>
              )}
              {failed && (
                <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="w-4 h-4 accent-purple" checked={chargeCustomer} onChange={(e) => setChargeCustomer(e.target.checked)} /> This retry&apos;s fare is charged to the customer</label>
              )}
              <ActButton kind="primary" disabled={busy || (kind !== "ONE_TIME" && !carrierId)} onClick={() => run(() => createAssignment({
                orderId: o.id, kind, chargeCustomer: failed ? chargeCustomer : false,
                ...(kind === "RIDER" ? { riderId: carrierId } : kind === "COURIER" ? { courierId: carrierId, consignmentNo: consignment.trim() || undefined }
                  : { platform, riderPhone: riderPhone.trim() || undefined, costPaisa: fare ? Math.round(Number(fare) * 100) : undefined, paidCash }),
              }), "Could not assign.")}>
                {busy ? "…" : "Assign"}
              </ActButton>
            </>
          )}

          {mode === "photo" && (
            <>
              <div className="rounded-[12px] border px-3.5 py-3 flex items-start gap-3" style={{ borderColor: photoDone ? "#bfe3cd" : "#f5dcb0", background: photoDone ? "#f2faf5" : "#fff8ee" }}>
                <span className="w-5 h-5 rounded-full grid place-items-center text-white text-[11px] shrink-0" style={{ background: photoDone ? SOLID.green : SOLID.amber }}>{photoDone ? "✓" : "!"}</span>
                <div className="text-[12.5px]">
                  <div className="font-medium text-body">{photoDone ? "Photo saved" : "Customer asked for a photo before delivery"}</div>
                  <div className={SOFT}>
                    {!photoDone ? "Upload it below — it is sent by itself: WhatsApp first, email if the number has no WhatsApp, and it is on their account either way."
                      : !photoMsg ? "On their account. Sending…"
                        : photoMsg.status === "SENT" ? `Sent on ${photoMsg.channel === "WHATSAPP" ? "WhatsApp" : photoMsg.channel === "EMAIL" ? "email" : photoMsg.channel} · also on their account`
                          : photoMsg.status === "QUEUED" ? "Sending…" : `On their account only — ${photoMsg.error ?? "could not send"}`}
                  </div>
                </div>
              </div>
              <label className="inline-flex items-center justify-center gap-2 h-[38px] rounded-[9px] text-white text-[12.5px] font-medium cursor-pointer" style={{ background: SOLID.blue, opacity: uploading ? 0.6 : 1 }}>
                <Icon name="photo" size={14} /> {uploading ? "Uploading…" : photoDone ? "Replace photo" : "Upload photo"}
                <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
              </label>
              {photoDone && live && live.status === "ASSIGNED" && (
                <ActButton kind="solid" colour={SOLID.orchid} disabled={busy} onClick={() => run(() => assignmentAction(live.id, "out"), "Could not send it out.")}>
                  {busy ? "…" : "Out for delivery"}
                </ActButton>
              )}
              <ActButton onClick={onDone}>Done</ActButton>
            </>
          )}

          {mode === "fail" && (
            <>
              <div><span className={LABEL}>Why</span>
                <select className={input} value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
                  <option value="">Pick a reason…</option>
                  {reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select></div>
              <div><span className={LABEL}>Note</span><input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></div>
              <div className="grid gap-2">
                {([["RETRY", "Retry", "assign a carrier again"], ["KEEP", "Keep as failed", "no retry yet — stays on the board"], ["CANCEL", "Cancel order", "goes to Cancelled · refund rules apply"]] as const).map(([k, t, sub]) => (
                  <button key={k} type="button" onClick={() => setDecision(k)} className="text-left rounded-[12px] border-[1.5px] px-3.5 py-2.5" style={{ borderColor: decision === k ? SOLID.red : "#e4dbec", background: decision === k ? "#fff5f5" : "#fff" }}>
                    <span className="block text-[13px] font-medium" style={{ color: decision === k ? SOLID.red : "#221733" }}>{t}</span>
                    <span className={`block text-[12px] ${SOFT}`}>{sub}</span>
                  </button>
                ))}
              </div>
              <ActButton kind="solid" colour={SOLID.red} disabled={busy || (!reasonId && !note.trim())} onClick={() => run(async () => {
                const body = { failReasonId: reasonId || undefined, failReason: note.trim() || undefined, decision };
                if (live && (live.status === "OUT_FOR_DELIVERY" || live.status === "ASSIGNED")) await assignmentAction(live.id, "fail", body);
                else await orderAction(o.id, "fail");
              }, "Could not mark it failed.")}>
                {busy ? "…" : decision === "CANCEL" ? "Mark failed and cancel" : decision === "RETRY" ? "Mark failed — I will retry" : "Mark failed"}
              </ActButton>
            </>
          )}

          <Link href={`/orders/${o.id}`} className={`text-[12.5px] ${SOFT} underline`}>Open the whole order</Link>
        </div>
      </div>
    </div>
  );
}
