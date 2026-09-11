"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Said, useSay } from "./Said";
import { WRAP, ErrorBox } from "./OrderViews";
import {
  deliveryBoard, assignmentAction, orderAction, failOrder, createAssignment, bulkAssign, addOrderPhoto, uploadItemImage, orderMessagesFor,
  listRiders, listCourierServices, listFailReasons, formatTaka,
  type ApiBoardOrder, type ApiBoardPage, type ApiRider, type ApiCourierService, type ApiFailReason, type ApiOrderMessage, type BoardSeg,
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
    Not started    → Start preparing (stock is committed there, then a carrier)
    Needs carrier  → Assign carrier (own rider / courier / one-time), in the panel
    Needs photo    → Upload photo, sent to the customer, status in the panel
    Ready          → Out for delivery (through the assignment, so Delivery hears it)
    On the road    → Delivered (hand-over photo first when the rule is on) / Failed
    Failed         → Assign again (retry), in the panel
  "Open" is there only for reading the whole order.

  (audit 11 Sep 2026) The tiles, the search, the zone and the paging are the
  SERVER's: the page used to pull 200 rows and count them in the browser, so
  order 201 was on nobody's screen and no tile admitted it. Now every count is
  over the whole day and the list says "1-50 of N".
*/

type Seg = BoardSeg;
/*  Names as the owner set them (10 Sep 2026).  */
const SEGS: [Seg, string][] = [
  ["all", "All orders"],
  ["notAssigned", "Not assigned"],
  ["photoPending", "Photo pending"],
  ["ready", "Ready to go"],
  ["onRoad", "On the road"],
  ["late", "Late"],
  ["failed", "Failed"],
  ["delivered", "Delivery successful"],
];
const PAGE_SIZE = 50;
const REFRESH_MS = 60_000;
/** "late soon" = within this many minutes of the promise */
const SOON_MIN = 30;

function hasCarrier(o: ApiBoardOrder) {
  return !!o.assignment && o.assignment.isActive && o.assignment.status === "ASSIGNED";
}
function needsPhoto(o: ApiBoardOrder) {
  return o.photoUpdates && !o.hasPrepPhoto;
}
/*  (audit 11 Sep 2026, P1 #16) a failed order that was assigned again is back
    in preparation — same buttons as a preparing one, or the retry is stuck.  */
function isPrepping(o: ApiBoardOrder) {
  return o.deliveryStatus === "preparing" || o.deliveryStatus === "unassigned" || (o.deliveryStatus === "failed" && hasCarrier(o));
}

/** "2 h late" · "in 40 min" · "—" */
function due(promisedBy?: string | null): { text: string; late: boolean; soon: boolean } {
  if (!promisedBy) return { text: "—", late: false, soon: false };
  const mins = Math.round((new Date(promisedBy).getTime() - Date.now()) / 60000);
  if (mins < 0) {
    const m = Math.abs(mins);
    return { text: m < 60 ? `${m} min late` : `${Math.floor(m / 60)} h late`, late: true, soon: false };
  }
  if (mins < 60) return { text: `in ${mins} min`, late: false, soon: mins <= SOON_MIN };
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

const DECISION: Record<string, string> = { RETRY: "decision: retry", KEEP: "decision: keep as failed", CANCEL: "decision: cancel" };

type PanelMode = "assign" | "photo" | "fail" | "deliver";
function Row({
  o, rules, selected, onSelect, onChanged, onPanel,
}: {
  o: ApiBoardOrder; rules: ApiBoardPage["rules"] | null; selected: boolean; onSelect: (on: boolean) => void;
  onChanged: () => void; onPanel: (mode: PanelMode) => void;
}) {
  const say = useSay();
  const [busy, setBusy] = useState(false);
  const d =
    o.deliveryStatus === "delivered"
      ? { text: "Delivered", late: false, soon: false }
      : due(o.promisedBy);
  const carrier = carrierText(o);
  const live = o.assignment && o.assignment.isActive ? o.assignment : null;
  const last = o.lastAssignment ?? null;
  const prep = isPrepping(o);
  const notStarted = o.deliveryStatus === "unassigned";
  const status =
    o.deliveryStatus === "delivered"
      ? { label: "Delivery successful", colour: SOLID.green }
      : o.deliveryStatus === "failed" && !hasCarrier(o)
        ? { label: "Failed", colour: SOLID.red }
        : o.deliveryStatus === "out_for_delivery"
          ? { label: "On the road", colour: SOLID.orchid }
          : !hasCarrier(o)
            ? { label: notStarted ? "Not started" : "Not assigned", colour: SOLID.amber }
            : needsPhoto(o)
              ? { label: "Photo pending", colour: SOLID.amber }
              : { label: "Ready to go", colour: SOLID.blue };
  /*  (audit 11 Sep 2026, P1 #21) Delivered needs the hand-over photo first
      when the rule is on — the panel takes it, then marks delivered.  */
  const needsProof = !!rules?.requireDeliveryPhoto && !o.hasDeliveryPhoto;
  const canSelect = prep && !hasCarrier(o) && !notStarted;

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
    <tr className="hover:bg-[#231538]">
      <td className={`${CELL} w-[34px]`} style={d.late ? { boxShadow: `inset 4px 0 0 ${SOLID.red}` } : undefined}>
        <Said say={say} />
        <input
          type="checkbox"
          className="w-[15px] h-[15px] accent-purple mt-0.5"
          aria-label={`Select ${o.orderNo}`}
          checked={selected}
          disabled={!canSelect}
          title={canSelect ? "Select for bulk assign" : "Only parcels waiting for a carrier can be selected"}
          onChange={(e) => onSelect(e.target.checked)}
        />
      </td>
      <td className={`${CELL} w-[130px]`}>
        <span className={VALUE} style={{ color: d.late ? SOLID.red : d.soon ? SOLID.amber : undefined }}>{d.text}</span>
        {d.soon && <div className="mt-1"><Pill colour={SOLID.amber}>late soon</Pill></div>}
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
        ) : o.deliveryStatus === "failed" && last ? (
          /* (audit 11 Sep 2026, P1 #23) the attempt that failed — who carried it and why it came back */
          <>
            <span className={VALUE}>{last.carrierName ?? "Carrier"}</span>
            <span className={`block ${SOFT}`}>failed{last.failedAt ? ` ${fmtStamp(last.failedAt)}` : ""} · {last.assignmentNo}</span>
          </>
        ) : (
          <span className={SOFT}>— none —</span>
        )}
      </td>
      <td className={`${CELL} w-[130px]`}>
        {!o.photoUpdates ? (
          <Pill colour={SOLID.grey}>not asked</Pill>
        ) : o.photoSent ? (
          <Pill colour={SOLID.green}>photo sent</Pill>
        ) : o.hasPrepPhoto ? (
          <Pill colour={SOLID.blue}>photo added</Pill>
        ) : (
          <Pill colour={SOLID.amber}>needed · before</Pill>
        )}
        {o.deliveryStatus === "out_for_delivery" && rules?.requireDeliveryPhoto && (
          <div className="mt-1">
            <Pill colour={o.hasDeliveryPhoto ? SOLID.green : SOLID.amber}>{o.hasDeliveryPhoto ? "hand-over photo" : "hand-over photo needed"}</Pill>
          </div>
        )}
      </td>
      <td className={`${CELL} w-[100px] text-right whitespace-nowrap`}>
        {o.duePaisa > 0 ? <span className="font-medium" style={{ color: SOLID.amber }}>{formatTaka(o.duePaisa)}</span> : <span className={SOFT}>—</span>}
      </td>
      <td className={`${CELL} w-[130px]`}>
        <Pill colour={status.colour}>{status.label}</Pill>
        {o.deliveryStatus === "failed" && last?.failReason && <span className={`block ${SOFT} mt-1 leading-snug`}>{last.failReason}</span>}
        {o.deliveryStatus === "failed" && !hasCarrier(o) && (
          <span className={`block ${SOFT} mt-1`}>{(last?.failDecision && DECISION[last.failDecision]) || "no decision yet"}</span>
        )}
        {o.deliveryStatus === "delivered" && o.deliveredAt && <span className={`block ${SOFT} mt-1`}>{fmtStamp(o.deliveredAt)}</span>}
      </td>
      <td className={`${CELL} w-[176px]`}>
        <div className="flex flex-col gap-1.5">
          {/* (audit 11 Sep 2026, P1 #17) an order nobody has started cannot be assigned and sent out — start it first, on purpose */}
          {notStarted && (
            <ActButton kind="primary" disabled={busy} onClick={() => run(() => orderAction(o.id, "prepare"), `Could not start preparing ${o.orderNo}.`)}>
              {busy ? "…" : "Start preparing"}
            </ActButton>
          )}
          {prep && !notStarted && !hasCarrier(o) && <ActButton kind="primary" onClick={() => onPanel("assign")}>Assign carrier</ActButton>}
          {prep && hasCarrier(o) && needsPhoto(o) && <ActButton kind="solid" colour={SOLID.blue} onClick={() => onPanel("photo")}>Upload photo</ActButton>}
          {prep && hasCarrier(o) && !needsPhoto(o) && (
            <ActButton kind="solid" colour={SOLID.orchid} disabled={busy} onClick={() => run(() => assignmentAction(live!.id, "out"), `Could not send ${o.orderNo} out.`)}>
              {busy ? "…" : "Out for delivery"}
            </ActButton>
          )}
          {o.deliveryStatus === "out_for_delivery" && live && (
            <>
              {needsProof ? (
                <ActButton kind="solid" colour={SOLID.green} onClick={() => onPanel("deliver")}>Delivered · add photo</ActButton>
              ) : (
                <ActButton kind="solid" colour={SOLID.green} disabled={busy} onClick={() => run(() => assignmentAction(live.id, "delivered"), `Could not mark ${o.orderNo} delivered.`)}>
                  {busy ? "…" : "Delivered"}
                </ActButton>
              )}
              <ActButton onClick={() => onPanel("fail")} kind="quiet">
                <span style={{ color: SOLID.red }}>Failed</span>
              </ActButton>
            </>
          )}
          {o.deliveryStatus === "failed" && !hasCarrier(o) && <ActButton kind="primary" onClick={() => onPanel("assign")}>Assign again · retry</ActButton>}
          {prep && hasCarrier(o) && <ActButton onClick={() => onPanel("assign")}>Change carrier</ActButton>}
          <ActButton href={`/orders/${o.id}`}>Open</ActButton>
        </div>
      </td>
    </tr>
  );
}

const HEADS = ["", "Deliver by", "Order No", "Going to", "Items", "Carrier", "Photo", "COD", "Status", "Action"];
const HELP =
  "The chosen day's parcels that are not delivered yet, plus anything overdue from earlier, sorted by the time we promised; the Delivery successful tile holds the day's finished ones. " +
  "The buttons are the order page's own: start preparing, then a carrier, then the customer's photo when they asked for one, then it can leave. " +
  "Delivered records the COD as cash with the carrier until it is received on Delivery money. Failed takes the reason and the decision here: retry (assign again), keep as failed, or cancel the order. " +
  "Counts, search and paging are done by the server over the whole day; the list refreshes itself every minute while no panel is open.";

export default function FulfilmentBoard() {
  const [data, setData] = useState<ApiBoardPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seg, setSeg] = useState<Seg>("all");
  const [q, setQ] = useState("");
  const [needle, setNeedle] = useState("");
  const [zone, setZone] = useState("");
  const [scope, setScope] = useState<"today" | "all">("today");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<{ o: ApiBoardOrder; mode: PanelMode } | { bulk: string[] } | null>(null);
  const [riders, setRiders] = useState<ApiRider[]>([]);
  const [couriers, setCouriers] = useState<ApiCourierService[]>([]);
  const [reasons, setReasons] = useState<ApiFailReason[]>([]);
  const panelOpen = useRef(false);
  panelOpen.current = panel !== null;

  useEffect(() => {
    listRiders().then((r) => setRiders(r.filter((x) => x.isActive))).catch(() => setRiders([]));
    listCourierServices().then((c) => setCouriers(c.filter((x) => x.isActive))).catch(() => setCouriers([]));
    listFailReasons().then(setReasons).catch(() => setReasons([]));
  }, []);

  /* the search box waits for the typing to stop before it asks the server */
  useEffect(() => {
    const t = window.setTimeout(() => setNeedle(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  useEffect(() => {
    setPage(1);
  }, [seg, needle, zone, scope]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const res = await deliveryBoard({ seg, q: needle, zone, scope, page, pageSize: PAGE_SIZE });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the board");
    } finally {
      setLoading(false);
    }
  }, [seg, needle, zone, scope, page]);
  useEffect(() => {
    void load();
  }, [load]);
  /* (audit 11 Sep 2026, P3) the board keeps itself current; a panel being open pauses it so a half-typed form is never pulled away */
  useEffect(() => {
    const t = window.setInterval(() => {
      if (!panelOpen.current && document.visibilityState === "visible") void load(true);
    }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const counts = data?.counts ?? {};
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const segCounts = useMemo(() => {
    const c: Partial<Record<Seg, number>> = {};
    for (const [k] of SEGS) c[k] = counts[k] ?? 0;
    return c;
  }, [counts]);

  const v = (k: string) => (data === null ? "…" : String(counts[k] ?? 0));
  const n = (k: string) => counts[k] ?? 0;
  const tiles: Tile[] = [
    { key: "notAssigned", label: "Not assigned", value: v("notAssigned"), hot: n("notAssigned") > 0, sub: "nobody carrying it yet" },
    { key: "photoPending", label: "Photo pending", value: v("photoPending"), sub: "customer asked for one" },
    { key: "ready", label: "Ready to go", value: v("ready"), sub: "carrier + photo done" },
    { key: "onRoad", label: "On the road", value: v("onRoad"), sub: "out for delivery" },
    { key: "late", label: "Late", value: v("late"), hot: n("late") > 0, sub: "past the promise" },
    { key: "failed", label: "Failed", value: v("failed"), hot: n("failed") > 0, sub: "decision shown on each row" },
    { key: "delivered", label: "Delivery successful", value: v("delivered"), sub: scope === "all" ? "today" : "on this day" },
  ];

  const selectedIds = [...selected].filter((id) => rows.some((r) => r.id === id));
  function toggle(id: string, on: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  return (
    <div className={WRAP}>
      <Band
        title="Delivery board"
        help={HELP}
        tiles={tiles}
        columns={7}
        active={seg === "all" ? undefined : seg}
        onTile={(k) => setSeg(seg === k ? "all" : (k as Seg))}
        right={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-[12.5px] text-body-soft">
              <input type="checkbox" className="w-4 h-4 accent-purple" checked={scope === "all"} onChange={(e) => setScope(e.target.checked ? "all" : "today")} />
              Show all dates
            </label>
            <BandButton onClick={() => void load()} icon="clock">Refresh</BandButton>
          </div>
        }
      />
      <div className="flex gap-2.5 flex-wrap items-center mb-3">
        <Segs items={SEGS} value={seg} counts={data ? segCounts : undefined} onChange={setSeg} />
        <Search value={q} onChange={setQ} placeholder="Order no, name, phone, area" />
        <select className="ipt max-w-[160px] h-[40px] font-medium" value={zone} onChange={(e) => setZone(e.target.value)}>
          <option value="">All zones</option>
          <option value="DHAKA">Inside Dhaka</option>
          <option value="BANGLADESH">Nationwide</option>
        </select>
        <Count n={total} noun="parcel" loading={loading} />
        {data && scope === "today" && <span className={`text-[12.5px] ${SOFT}`}>{data.date} + overdue</span>}
        {selectedIds.length > 0 && (
          <ActButton kind="primary" onClick={() => setPanel({ bulk: selectedIds })}>
            Assign selected ({selectedIds.length})
          </ActButton>
        )}
      </div>
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      <div className={TABLE_WRAP}>
        <table className={TABLE}>
          <Head heads={HEADS} />
          <tbody>
            {rows.map((o) => (
              <Row
                key={o.id}
                o={o}
                rules={data?.rules ?? null}
                selected={selected.has(o.id)}
                onSelect={(on) => toggle(o.id, on)}
                onChanged={() => void load()}
                onPanel={(mode) => setPanel({ o, mode })}
              />
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <Empty text={seg === "delivered" ? "Nothing delivered on this day yet." : "Nothing on the board."} />}
      </div>
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 mt-3 text-[12.5px] text-body-soft">
          <span>{from}–{to} of {total}</span>
          <ActButton disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</ActButton>
          <ActButton disabled={page >= lastPage || loading} onClick={() => setPage((p) => Math.min(lastPage, p + 1))}>Next</ActButton>
        </div>
      )}
      {panel && "bulk" in panel && (
        <BulkPanel
          key={panel.bulk.join(",")}
          orderIds={panel.bulk}
          riders={riders}
          couriers={couriers}
          onClose={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            setSelected(new Set());
            void load();
          }}
        />
      )}
      {panel && "o" in panel && (
        /* (audit 11 Sep 2026, P1 #33) a fresh panel per row + mode — typed state never leaks from one parcel to the next */
        <BoardPanel
          key={panel.o.id + panel.mode}
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

/* ---------- shared panel frame ---------- */
function PanelFrame({ title, sub, onClose, children }: { title: string; sub: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-[#320049]/30" />
      <div className="absolute right-0 top-0 h-full w-[440px] max-w-full bg-white shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-4 border-b border-[#3e3447]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[15px] font-medium text-purple">{title}</div>
              <div className={`${SOFT} truncate`}>{sub}</div>
            </div>
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-[9px] border border-[#3e3447] grid place-items-center text-[#afa4b7] hover:text-purple shrink-0" title="Close">×</button>
          </div>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">{children}</div>
      </div>
    </div>
  );
}

/* ---------- bulk assign: one carrier, many parcels (P3 #1) ---------- */
function BulkPanel({
  orderIds, riders, couriers, onClose, onDone,
}: { orderIds: string[]; riders: ApiRider[]; couriers: ApiCourierService[]; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<"RIDER" | "COURIER">("RIDER");
  const [carrierId, setCarrierId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ assigned: number; failed: { orderId: string; reason: string }[] } | null>(null);
  const input = "ipt h-[38px]";
  async function go() {
    setBusy(true);
    setErr("");
    try {
      const r = await bulkAssign({ orderIds, kind, ...(kind === "RIDER" ? { riderId: carrierId } : { courierId: carrierId }) });
      setResult({ assigned: r.assigned, failed: r.failed });
      if (r.failedCount === 0) onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not assign.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <PanelFrame title="Assign selected parcels" sub={`${orderIds.length} parcel${orderIds.length === 1 ? "" : "s"} to one carrier`} onClose={onClose}>
      {err && <div className="rounded-[10px] border-[1.5px] px-3 py-2 text-[12.5px] font-medium bg-white" style={{ borderColor: SOLID.amber, color: "#f7b86e" }}>{err}</div>}
      <div className="inline-flex rounded-[10px] border border-[#3e3447] overflow-hidden">
        {(["RIDER", "COURIER"] as const).map((k) => (
          <button key={k} type="button" onClick={() => { setKind(k); setCarrierId(""); }} className="text-[12.5px] font-medium px-3 py-2" style={kind === k ? { background: SOLID.purple, color: "#fff" } : { background: "#fff", color: "#afa4b7" }}>
            {k === "RIDER" ? "Own rider" : "Courier company"}
          </button>
        ))}
      </div>
      <div><span className={LABEL}>{kind === "RIDER" ? "Rider" : "Courier"}</span>
        <select className={input} value={carrierId} onChange={(e) => setCarrierId(e.target.value)}>
          <option value="">Select…</option>
          {(kind === "RIDER" ? riders : couriers).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></div>
      <span className={`text-[12px] ${SOFT}`}>Consignment numbers are typed per parcel afterwards — one number pasted on every parcel would be wrong tracking links.</span>
      {result && (
        <div className="rounded-[12px] border border-[#3e3447] bg-white p-3 text-[12.5px]">
          <div className="font-medium text-body">{result.assigned} assigned{result.failed.length > 0 ? `, ${result.failed.length} not` : ""}</div>
          {result.failed.map((f) => <div key={f.orderId} className={SOFT}>{f.orderId.slice(-6)}: {f.reason}</div>)}
          {result.failed.length > 0 && <div className="mt-2"><ActButton onClick={onDone}>Close and refresh</ActButton></div>}
        </div>
      )}
      <ActButton kind="primary" disabled={busy || !carrierId || !!result} onClick={() => void go()}>{busy ? "…" : `Assign ${orderIds.length}`}</ActButton>
    </PanelFrame>
  );
}

/* ---------- the panel: the order page's cards, without leaving the board ---------- */
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
  const [proofDone, setProofDone] = useState(!!o.hasDeliveryPhoto);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const live = o.assignment && o.assignment.isActive ? o.assignment : null;
  const name = o.isGift && o.recipientName ? o.recipientName : o.customer?.name;
  const failed = o.deliveryStatus === "failed" && !hasCarrier(o);

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

  /*  PREP = the customer's before-delivery shot, sent to them by itself.
      DELIVERY = the hand-over proof the owner's rule can require (P1 #21).  */
  async function upload(file: File, kind: "PREP" | "DELIVERY") {
    setUploading(true);
    setErr("");
    try {
      const url = await uploadItemImage(file, "delivery", 1400);
      await addOrderPhoto(o.id, { kind, url, capturedBy: "Admin" });
      if (kind === "PREP") {
        setPhotoDone(true);
        window.setTimeout(loadMsg, 4000);
        loadMsg();
      } else {
        setProofDone(true);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not upload that photo.");
    } finally {
      setUploading(false);
    }
  }

  const title =
    mode === "assign" ? (failed ? "Assign again · retry" : live ? "Change carrier" : "Assign carrier")
      : mode === "photo" ? "Photo for the customer"
        : mode === "deliver" ? "Delivered · hand-over photo"
          : "Delivery failed";
  const input = "ipt h-[38px]";
  return (
    <PanelFrame title={title} sub={`${o.orderNo} · ${name} · ${o.address}`} onClose={onClose}>
      {err && <div className="rounded-[10px] border-[1.5px] px-3 py-2 text-[12.5px] font-medium bg-white" style={{ borderColor: SOLID.amber, color: "#f7b86e" }}>{err}</div>}

      {mode === "assign" && (
        <>
          <div className="inline-flex rounded-[10px] border border-[#3e3447] overflow-hidden">
            {(["RIDER", "COURIER", "ONE_TIME"] as const).map((k) => (
              <button key={k} type="button" onClick={() => { setKind(k); setCarrierId(""); }} className="text-[12.5px] font-medium px-3 py-2" style={kind === k ? { background: SOLID.purple, color: "#fff" } : { background: "#fff", color: "#afa4b7" }}>
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
              <div><span className={LABEL}>Fare ৳</span><input type="number" min={0} className={input} value={fare} onChange={(e) => setFare(e.target.value)} placeholder="leave blank to record it on Delivery money" /></div>
              <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="w-4 h-4 accent-purple" checked={paidCash} onChange={(e) => setPaidCash(e.target.checked)} /> Paid in cash now</label>
            </>
          )}
          {failed && (
            <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="w-4 h-4 accent-purple" checked={chargeCustomer} onChange={(e) => setChargeCustomer(e.target.checked)} /> This retry&apos;s fare is charged to the customer</label>
          )}
          {failed && chargeCustomer && (
            <span className={`text-[12px] ${SOFT}`}>The fare goes on the order once, when it is known and while the parcel is still undelivered — type it here for a one-time rider, or record it on Delivery money before the parcel is marked delivered.</span>
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
          <div className="rounded-[12px] border px-3.5 py-3 flex items-start gap-3" style={{ borderColor: photoDone ? "#bfe3cd" : "#f5dcb0", background: photoDone ? "#1e3226" : "#3a2b16" }}>
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
            <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f, "PREP"); }} />
          </label>
          {photoDone && live && live.status === "ASSIGNED" && (
            <ActButton kind="solid" colour={SOLID.orchid} disabled={busy} onClick={() => run(() => assignmentAction(live.id, "out"), "Could not send it out.")}>
              {busy ? "…" : "Out for delivery"}
            </ActButton>
          )}
          <ActButton onClick={onDone}>Done</ActButton>
        </>
      )}

      {mode === "deliver" && (
        <>
          <div className="rounded-[12px] border px-3.5 py-3 flex items-start gap-3" style={{ borderColor: proofDone ? "#bfe3cd" : "#f5dcb0", background: proofDone ? "#1e3226" : "#3a2b16" }}>
            <span className="w-5 h-5 rounded-full grid place-items-center text-white text-[11px] shrink-0" style={{ background: proofDone ? SOLID.green : SOLID.amber }}>{proofDone ? "✓" : "!"}</span>
            <div className="text-[12.5px]">
              <div className="font-medium text-body">{proofDone ? "Hand-over photo saved" : "The rule asks for a hand-over photo before Delivered"}</div>
              <div className={SOFT}>{proofDone ? "Now mark it delivered — the COD moves to the carrier's hand until it is received." : "Upload the photo taken at the door, then mark it delivered."}</div>
            </div>
          </div>
          <label className="inline-flex items-center justify-center gap-2 h-[38px] rounded-[9px] text-white text-[12.5px] font-medium cursor-pointer" style={{ background: SOLID.blue, opacity: uploading ? 0.6 : 1 }}>
            <Icon name="photo" size={14} /> {uploading ? "Uploading…" : proofDone ? "Replace photo" : "Upload hand-over photo"}
            <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f, "DELIVERY"); }} />
          </label>
          {live && (
            <ActButton kind="solid" colour={SOLID.green} disabled={busy || !proofDone} onClick={() => run(() => assignmentAction(live.id, "delivered"), "Could not mark it delivered.")}>
              {busy ? "…" : "Delivered"}
            </ActButton>
          )}
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
              <button key={k} type="button" onClick={() => setDecision(k)} className="text-left rounded-[12px] border-[1.5px] px-3.5 py-2.5" style={{ borderColor: decision === k ? SOLID.red : "#e4dbec", background: decision === k ? "#391616" : "#fff" }}>
                <span className="block text-[13px] font-medium" style={{ color: decision === k ? SOLID.red : "#f1eaf6" }}>{t}</span>
                <span className={`block text-[12px] ${SOFT}`}>{sub}</span>
              </button>
            ))}
          </div>
          <ActButton kind="solid" colour={SOLID.red} disabled={busy || (!reasonId && !note.trim())} onClick={() => run(async () => {
            const body = { failReasonId: reasonId || undefined, failReason: note.trim() || undefined, decision };
            if (live && (live.status === "OUT_FOR_DELIVERY" || live.status === "ASSIGNED")) await assignmentAction(live.id, "fail", body);
            /*  (audit 11 Sep 2026, review the same day) NO ASSIGNMENT IS NOT
                NO DECISION. The bare orderAction("fail") took no body, so on a
                parcel with no live assignment the reason, the note and the
                decision were all dropped — "Cancel order" closed the box and
                left the order open and unrefunded. Same payload as the order
                page now, and CANCEL runs the real cancel path.  */
            else await failOrder(o.id, { failReasonId: reasonId || undefined, note: note.trim() || undefined, decision });
          }, "Could not mark it failed.")}>
            {busy ? "…" : decision === "CANCEL" ? "Mark failed and cancel" : decision === "RETRY" ? "Mark failed — I will retry" : "Mark failed"}
          </ActButton>
        </>
      )}

      <Link href={`/orders/${o.id}`} className={`text-[12.5px] ${SOFT} underline`}>Open the whole order</Link>
    </PanelFrame>
  );
}
