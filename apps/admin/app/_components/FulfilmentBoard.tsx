"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Said, useSay } from "./Said";
import { WRAP, ErrorBox } from "./OrderViews";
import { deliveryBoard, assignmentAction, formatTaka, type ApiBoardOrder } from "../_data/api";
import {
  SOLID, CELL, LABEL, VALUE, SOFT, NO, NAME, TABLE_WRAP, TABLE,
  Pill, Tag, ActButton, Band, BandButton, Segs, Search, Count, Head, Empty,
  fmtDay, type Tile,
} from "./OrdersUi";

/*
  Delivery -> Fulfilment board (owner, 10 Sep 2026; design/delivery-flow-v1.html tab 2).

  Today's parcels, sorted by the promise. The SAME rules and the SAME words as
  the order page — nothing moves here that could not move there:
    Needs carrier  → "Assign carrier" opens the order's Delivery card
    Needs photo    → "Upload photo" opens the order's Photos card
    Ready          → Out for delivery (through the assignment, so Delivery hears it)
    On the road    → Delivered / Failed (Failed opens the order's decision box)
    Failed         → "Decide" opens the order
  No Proof photos page any more: the photo state is a column here and a step
  on the order.
*/

type Seg = "" | "carrier" | "photo" | "ready" | "out" | "late" | "failed";
const SEGS: [Seg, string][] = [
  ["", "All"],
  ["carrier", "Needs carrier"],
  ["photo", "Needs photo"],
  ["ready", "Ready"],
  ["out", "On the road"],
  ["late", "Late"],
  ["failed", "Failed"],
];

function hasCarrier(o: ApiBoardOrder) {
  return !!o.assignment && o.assignment.isActive && o.assignment.status === "ASSIGNED";
}
function needsPhoto(o: ApiBoardOrder) {
  return o.photoUpdates && !o.hasPrepPhoto;
}
function isLate(o: ApiBoardOrder) {
  return !!o.promisedBy && new Date(o.promisedBy).getTime() < Date.now() && o.deliveryStatus !== "failed";
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

function Row({ o, onChanged }: { o: ApiBoardOrder; onChanged: () => void }) {
  const say = useSay();
  const [busy, setBusy] = useState(false);
  const d = due(o.promisedBy);
  const carrier = carrierText(o);
  const live = o.assignment && o.assignment.isActive ? o.assignment : null;
  const prep = o.deliveryStatus === "preparing" || o.deliveryStatus === "unassigned";
  const status =
    o.deliveryStatus === "failed"
      ? { label: `Failed${live?.failReason ? "" : ""}`, colour: SOLID.red }
      : o.deliveryStatus === "out_for_delivery"
        ? { label: "On the road", colour: SOLID.orchid }
        : !hasCarrier(o)
          ? { label: "Needs carrier", colour: SOLID.amber }
          : needsPhoto(o)
            ? { label: "Needs photo", colour: SOLID.amber }
            : { label: "Ready", colour: SOLID.blue };

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
      </td>
      <td className={`${CELL} w-[176px]`}>
        <div className="flex flex-col gap-1.5">
          {prep && !hasCarrier(o) && <ActButton kind="primary" href={`/orders/${o.id}?sec=delivery`}>Assign carrier</ActButton>}
          {prep && hasCarrier(o) && needsPhoto(o) && <ActButton kind="solid" colour={SOLID.blue} href={`/orders/${o.id}?sec=photos`}>Upload photo</ActButton>}
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
              <ActButton href={`/orders/${o.id}?fail=1`} kind="quiet">
                <span style={{ color: SOLID.red }}>Failed</span>
              </ActButton>
            </>
          )}
          {o.deliveryStatus === "failed" && <ActButton kind="primary" href={`/orders/${o.id}?sec=delivery`}>Decide · retry / cancel</ActButton>}
          <ActButton href={`/orders/${o.id}`}>Open</ActButton>
        </div>
      </td>
    </tr>
  );
}

const HEADS = ["", "Deliver by", "Order No", "Going to", "Items", "Carrier", "Photo", "COD", "Status", "Action"];
const HELP =
  "Every confirmed parcel that has not been delivered, sorted by the time we promised. The buttons are the order page's own: a parcel needs a carrier, then the customer's photo when they asked for one, then it can leave. " +
  "Delivered moves the COD cash to the carrier until Settle. Failed opens the decision on the order — retry, keep, or cancel.";

export default function FulfilmentBoard() {
  const [rows, setRows] = useState<ApiBoardOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seg, setSeg] = useState<Seg>("");
  const [q, setQ] = useState("");
  const [zone, setZone] = useState("");

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
    const c: Record<Seg, number> = { "": rows.length, carrier: 0, photo: 0, ready: 0, out: 0, late: 0, failed: 0 };
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
    { key: "carrier", label: "Needs carrier", value: v(counts.carrier), hot: counts.carrier > 0, sub: "preparing, nobody assigned" },
    { key: "photo", label: "Needs photo", value: v(counts.photo), sub: "customer asked for one" },
    { key: "ready", label: "Ready to go", value: v(counts.ready), sub: "carrier + photo done" },
    { key: "out", label: "On the road", value: v(counts.out), sub: "out for delivery" },
    { key: "late", label: "Late", value: v(counts.late), hot: counts.late > 0, sub: "past the promise" },
    { key: "failed", label: "Failed · decide", value: v(counts.failed), hot: counts.failed > 0, sub: "waiting for staff" },
  ];

  return (
    <div className={WRAP}>
      <Band
        title="Fulfilment board"
        help={HELP}
        tiles={tiles}
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
              <Row key={o.id} o={o} onChanged={() => void load()} />
            ))}
          </tbody>
        </table>
        {!loading && shown.length === 0 && <Empty text="Nothing on the board." />}
      </div>
    </div>
  );
}
