"use client";

/*
  Delivery Management — LIVE screens (:4000 /delivery).
  RADIAN_DELIVERY_MODULE_ARCHITECTURE.md (DEC-DLV-001..006, DLV-R01..R08).
  V1 = board · riders · couriers · method/slot master · proof upload.
  Demo-fallback + orange badge per project rule when the API is down.
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import { backdropClose } from "./backdropClose";
import Link from "next/link";
import Icon from "./Icon";
import {
  ApiAssignment,
  ApiBoardOrder,
  ApiCourierService,
  ApiFailReason,
  ApiRider,
  addOrderPhoto,
  assignmentAction,
  listFailReasons,
  bulkAssign,
  createAssignment,
  createRider,
  orderAction,
  deleteRider,
  deliveryBoard,
  listCourierServices,
  listOrders,
  listRiders,
  updateDeliverySlot,
  updateRider,
  getOrder,
  formatTaka,
  uploadItemImage,
} from "../_data/api";

/*  ⚠️ EVERY screen in this file uses this — 12 Aug 2026.
    Riders, couriers and proof each carried their own `max-w-[1150px]` and the
    method master `max-w-[1250px]`, so on a wide monitor they sat squeezed into
    the left of a window the board filled completely. Four screens in one module
    at three different widths is not a design, it is four people not looking at
    each other's work. One constant, one width. */
const WRAP = "px-6 md:px-8 pt-7 pb-16 max-w-[1600px]"; // 6 Aug — widened, see FinanceUI.WRAP note

function Guide({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] font-semibold tracking-[0.03em] uppercase text-body-soft mb-1.5">{children}</span>;
}
function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
        <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
        {eyebrow}
      </div>
      <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">{title}</h1>
      {children && <p className="text-body-soft text-[13.5px] m-0 max-w-[760px]">{children}</p>}
    </div>
  );
}
function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 bg-[#fff4e2] text-[#b45309] text-[12px] font-bold px-3 py-1.5 rounded-full">
      <Icon name="bolt" size={13} /> API offline — nothing live on this screen
    </span>
  );
}
const ago = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

/*  HOW LATE, OR HOW LONG LEFT.

    The number that decides what a delivery person does next. Shown as words
    rather than a timestamp because "40 min late" is acted on and
    "14:20" is worked out. `null` promise reads as a dash, never as "on time" —
    orders taken before promisedBy existed cannot be judged (INT-R09).  */
function due(promisedBy?: string | null) {
  if (!promisedBy) return { text: "—", tone: "" as const, late: false };
  const mins = Math.round((new Date(promisedBy).getTime() - Date.now()) / 60000);
  if (mins < 0) {
    const m = Math.abs(mins);
    return { text: m < 60 ? `${m} min late` : `${Math.floor(m / 60)} h late`, tone: "late" as const, late: true };
  }
  if (mins < 60) return { text: `in ${mins} min`, tone: "soon" as const, late: false };
  if (mins < 60 * 20) return { text: `in ${Math.round(mins / 60)} h`, tone: "" as const, late: false };
  return { text: `in ${Math.round(mins / 1440)} d`, tone: "" as const, late: false };
}

/*  THE LIST — the working view (owner, 12 Aug 2026).

    Four columns of cards answer "what is going on". They cannot answer "get
    these forty out", which is the question at 400 orders. One row per parcel,
    sorted by the promise, with a tick box — so a filter plus one tick plus one
    carrier is forty assignments.

    The tick box is missing on parcels already out for delivery, deliberately:
    re-routing a parcel that has left the shop needs someone to say what
    happened to it (mark it failed), and a bulk action is exactly the wrong
    place for that conversation.  */
function BoardList({
  rows, total, page, limit, picked, allPicked, busy,
  onTogglePick, onToggleAll, onPage, onAssign, onAct, onPrepare,
}: {
  rows: ApiBoardOrder[] | null;
  total: number; page: number; limit: number;
  picked: Set<string>; allPicked: boolean; busy: string | null;
  onTogglePick: (id: string) => void;
  onToggleAll: () => void;
  onPage: (p: number) => void;
  onAssign: (o: ApiBoardOrder) => void;
  onAct: (o: ApiBoardOrder, a: "out" | "delivered" | "fail") => void;
  onPrepare: (o: ApiBoardOrder) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const statusLabel: Record<string, string> = {
    unassigned: "Needs assignment", preparing: "Preparing",
    out_for_delivery: "On the road", failed: "Failed",
  };

  return (
    <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
              <th className="px-3 py-3 w-[36px]">
                <input type="checkbox" checked={allPicked} onChange={onToggleAll} aria-label="Select all on this page" />
              </th>
              <th className="text-left font-medium px-3 py-3 w-[110px]">Order</th>
              <th className="text-left font-medium px-3 py-3">Going to</th>
              <th className="text-left font-medium px-3 py-3 w-[120px]">Due</th>
              <th className="text-left font-medium px-3 py-3 w-[150px]">Carrier</th>
              <th className="text-right font-medium px-3 py-3 w-[90px]">COD</th>
              <th className="px-3 py-3 w-[190px]" />
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((o) => {
              const d = due(o.promisedBy);
              const out = o.deliveryStatus === "out_for_delivery";
              const rowBg = d.late ? "bg-[#fdf0f0]" : d.tone === "soon" ? "bg-[#fff8ec]" : "";
              return (
                <tr key={o.id} className={`border-t border-lavender-deep hover:bg-lavender/40 ${rowBg}`}>
                  <td className="px-3 py-2.5 text-center">
                    {!out && (
                      <input type="checkbox" checked={picked.has(o.id)} onChange={() => onTogglePick(o.id)} aria-label={`Select ${o.orderNo}`} />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/orders/${o.id}`} className="font-mono font-bold text-purple text-[12.5px] hover:text-orchid">{o.orderNo}</Link>
                    <div className="text-[11px] text-body-soft">{statusLabel[o.deliveryStatus] ?? o.deliveryStatus}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-purple text-[12.5px] truncate max-w-[280px]">
                      {o.isGift ? `🎁 ${o.recipientName ?? "recipient"}` : o.customer?.name}
                    </div>
                    <div className="text-[11.5px] text-body-soft truncate max-w-[280px]">{o.address}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[12.5px] font-semibold ${d.late ? "text-[#b91c1c]" : d.tone === "soon" ? "text-[#b45309]" : "text-body-soft"}`}>{d.text}</span>
                    <div className="text-[11px] text-body-soft truncate">{o.methodLabel ?? o.zone}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    {o.assignment ? (
                      <span className="text-[12px] font-semibold text-purple">
                        {o.assignment.kind === "RIDER" ? "🛵" : "📦"} {o.assignment.rider?.name ?? o.assignment.courier?.name}
                      </span>
                    ) : (
                      <span className="text-[12px] text-body-soft">— none —</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {o.duePaisa > 0 ? <span className="text-[12.5px] font-semibold text-[#b45309]">{formatTaka(o.duePaisa)}</span> : <span className="text-body-soft">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {o.deliveryStatus === "unassigned" && (
                      <>
                        <button disabled={busy === o.id} onClick={() => onAssign(o)} className="text-[12.5px] font-semibold text-orchid hover:text-purple mr-3">Assign</button>
                        <button disabled={busy === o.id} onClick={() => onPrepare(o)} className="text-[12.5px] font-semibold text-body-soft hover:text-purple">Prepare</button>
                      </>
                    )}
                    {o.deliveryStatus === "preparing" && (
                      o.assignment
                        ? <button disabled={busy === o.id} onClick={() => onAct(o, "out")} className="text-[12.5px] font-semibold text-orchid hover:text-purple">Send out →</button>
                        : <button disabled={busy === o.id} onClick={() => onAssign(o)} className="text-[12.5px] font-semibold text-orchid hover:text-purple">Assign first</button>
                    )}
                    {o.deliveryStatus === "failed" && (
                      <button disabled={busy === o.id} onClick={() => onAssign(o)} className="text-[12.5px] font-semibold text-orchid hover:text-purple">Re-assign</button>
                    )}
                    {out && (
                      <>
                        <button disabled={busy === o.id} onClick={() => onAct(o, "delivered")} className="text-[12.5px] font-semibold text-[#0f7d55] hover:underline mr-3">Delivered</button>
                        <button disabled={busy === o.id} onClick={() => onAct(o, "fail")} className="text-[12.5px] font-semibold text-body-soft hover:text-[#b91c1c]">Fail</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows !== null && rows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-body-soft py-14 border-t border-lavender-deep">Nothing matches that.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/*  The total is always printed. A screen that shows fifty of four
          hundred and twelve without saying four hundred and twelve is how
          parcels go missing on a busy day. */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-lavender-deep flex-wrap">
        <span className="text-[12.5px] text-body-soft">
          {total === 0 ? "Nothing here" : `Showing ${from}–${to} of ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1} onClick={() => onPage(page - 1)}
            className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] border border-lavender-deep text-purple disabled:opacity-40"
          >
            ← Previous
          </button>
          <button
            disabled={to >= total} onClick={() => onPage(page + 1)}
            className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] border border-lavender-deep text-purple disabled:opacity-40"
          >
            Next {Math.min(limit, Math.max(0, total - to))} →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= BOARD ================= */
const COLS: { key: string; label: string; tone: string; hint: string }[] = [
  { key: "unassigned", label: "Needs assignment", tone: "#b45309", hint: "confirmed — pick a rider/courier" },
  { key: "preparing", label: "Preparing", tone: "#2563eb", hint: "stock committed" },
  { key: "out_for_delivery", label: "Out for delivery", tone: "#a021b8", hint: "parcel on the road" },
  { key: "failed", label: "Failed — retry", tone: "#b91c1c", hint: "assign again to retry" },
];

export function DeliveryBoardLive() {
  const [rows, setRows] = useState<ApiBoardOrder[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [riders, setRiders] = useState<ApiRider[]>([]);
  const [couriers, setCouriers] = useState<ApiCourierService[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<ApiBoardOrder | null>(null);

  /*  ⚠️ NO `alert()` ON THIS BOARD ANY MORE — 31 Aug 2026.

      A browser alert BLOCKS the renderer: everything stops until somebody
      presses OK, and until then the board is frozen with no visible reason.
      The symptom (a dead screen) looks nothing like the cause (a rule saying
      no), and that mismatch cost most of an afternoon on 29 Aug in
      `OrderEditor` before the same thing was found here.

      Every refusal now lands in a line on the page, in the shop's colours,
      where the person can read it and carry on working.  */
  const [boardErr, setBoardErr] = useState("");
  const [boardNote, setBoardNote] = useState("");

  /*  DEC-DLV-022 — the fail box. One action for a failed delivery and a
      reschedule (the owner: the parcel did not arrive either way), with the
      reason picked from the list he keeps and an optional note beside it. */
  const [failing, setFailing] = useState<ApiBoardOrder | null>(null);
  const [failReasons, setFailReasons] = useState<ApiFailReason[]>([]);
  const [failReasonId, setFailReasonId] = useState("");
  const [failNote, setFailNote] = useState("");

  useEffect(() => {
    listFailReasons().then(setFailReasons).catch(() => setFailReasons([]));
  }, []);
  const [aKind, setAKind] = useState<"RIDER" | "COURIER">("RIDER");
  const [aRider, setARider] = useState("");
  const [aCourier, setACourier] = useState("");
  const [aCn, setACn] = useState("");

  /*  VIEW, FILTERS AND SELECTION — 12 Aug 2026.
      The owner asked what this screen does at 100–500 orders. Cards in four
      columns answer "what is going on"; they cannot answer "get these forty
      out". So the list is the working view and the board is the glance, and
      the list opens by default once the queue is bigger than a screenful. */
  const [view, setView] = useState<"list" | "board" | null>(null);
  const [status, setStatus] = useState("");
  const [zone, setZone] = useState("");
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const LIMIT = 50;

  /*  Typing must not fire a request per keystroke on a table this size. */
  useEffect(() => {
    const t = setTimeout(() => { setSearch(term.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [term]);

  const load = useCallback(async () => {
    try {
      const [b, r, c] = await Promise.all([
        deliveryBoard({ status: status || undefined, zone: zone || undefined, q: search || undefined, page, limit: LIMIT }),
        listRiders(),
        listCourierServices(),
      ]);
      setRows(b.rows);
      setTotal(b.total);
      setCounts(b.counts ?? {});
      /*  Decide the view once, from the real size of the queue, then leave it
          to the person — flipping it back under them on every refresh would
          be the screen arguing. */
      setView((v) => v ?? (Object.values(b.counts ?? {}).reduce((a, n) => a + n, 0) > 12 ? "list" : "board"));
      setRiders(r.filter((x) => x.isActive));
      setCouriers(c.filter((x) => x.isActive));
      setDemo(false);
    } catch {
      setRows([]);
      setDemo(true);
      setView((v) => v ?? "board");
    }
  }, [status, zone, search, page]);
  useEffect(() => { void load(); }, [load]);

  /*  A tick must not survive the row leaving the page — assigning something you
      can no longer see is how the wrong parcel goes to the wrong rider. */
  useEffect(() => {
    setPicked((prev) => {
      const visible = new Set((rows ?? []).map((r) => r.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const assignable = (rows ?? []).filter((o) => o.deliveryStatus !== "out_for_delivery");
  const allPicked = assignable.length > 0 && assignable.every((o) => picked.has(o.id));

  const togglePick = (id: string) =>
    setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const doBulk = async () => {
    if (picked.size === 0) return;
    setBusy("bulk");
    try {
      const res = await bulkAssign({
        orderIds: [...picked],
        kind: aKind,
        riderId: aKind === "RIDER" ? aRider : undefined,
        courierId: aKind === "COURIER" ? aCourier : undefined,
      });
      setBulkOpen(false);
      setPicked(new Set());
      await load();
      /*  Never a silent partial success. If three of forty did not go, the
          screen says three, and says why for the first of them. */
      if (res.failedCount > 0) {
        setBoardErr(`${res.assigned} assigned, ${res.failedCount} could not be — first reason: ${res.failed[0]?.reason ?? "unknown"}`);
      } else {
        setBoardNote(`${res.assigned} parcel(s) assigned.`);
      }
    } catch (e) { setBoardErr(e instanceof Error ? e.message : "Could not assign those parcels."); }
    setBusy(null);
  };

  const byCol = useMemo(() => {
    const m: Record<string, ApiBoardOrder[]> = {};
    for (const c of COLS) m[c.key] = [];
    for (const o of rows ?? []) if (m[o.deliveryStatus]) m[o.deliveryStatus].push(o);
    return m;
  }, [rows]);

  const doAssign = async () => {
    if (!assigning) return;
    setBusy(assigning.id);
    try {
      await createAssignment({
        orderId: assigning.id,
        kind: aKind,
        riderId: aKind === "RIDER" ? aRider : undefined,
        courierId: aKind === "COURIER" ? aCourier : undefined,
        consignmentNo: aKind === "COURIER" && aCn.trim() ? aCn.trim() : undefined,
      });
      setAssigning(null);
      setACn("");
      await load();
    } catch (e) { setBoardErr(e instanceof Error ? e.message : "Could not assign that parcel."); }
    setBusy(null);
  };

  const act = async (o: ApiBoardOrder, action: "out" | "delivered" | "fail") => {
    setBoardErr("");
    setBoardNote("");
    if (!o.assignment) {
      setBoardErr(`${o.orderNo} has no carrier yet — pick a rider or courier first.`);
      return;
    }
    /*  DEC-DLV-022 — a failure opens the box instead of a browser prompt. The
        reason is picked, not typed, so the reports can group it later; the
        note beside it is for what a list can never hold ("gate locked").  */
    if (action === "fail") {
      setFailing(o);
      setFailReasonId(failReasons[0]?.id ?? "");
      setFailNote("");
      return;
    }
    setBusy(o.id);
    try {
      await assignmentAction(o.assignment.id, action, {});
      await load();
    } catch (e) { setBoardErr(e instanceof Error ? e.message : "That did not work. Try again."); }
    setBusy(null);
  };

  const doFail = async () => {
    if (!failing?.assignment) return;
    setBusy(failing.id);
    setBoardErr("");
    try {
      await assignmentAction(failing.assignment.id, "fail", {
        failReasonId: failReasonId || undefined,
        failReason: failNote.trim() || undefined,
      });
      setFailing(null);
      await load();
    } catch (e) { setBoardErr(e instanceof Error ? e.message : "Could not record that."); }
    setBusy(null);
  };

  /* REV-DLV-1 — move confirmed→preparing from the board (stock commit,
     DEC-MOD-003). Same transition as the Orders screen — one rule, two doors. */
  const startPreparing = async (o: ApiBoardOrder) => {
    setBusy(o.id);
    try {
      await orderAction(o.id, "prepare");
      await load();
    } catch (e) { setBoardErr(e instanceof Error ? e.message : "Could not start preparing that order."); }
    setBusy(null);
  };

  const carrierChip = (a: ApiAssignment | null) =>
    !a ? null : (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-lavender text-purple px-2 py-0.5 rounded-[7px]">
        {a.kind === "RIDER" ? "🛵" : "📦"} {a.rider?.name ?? a.courier?.name}{a.consignmentNo ? ` · ${a.consignmentNo}` : ""}
      </span>
    );

  return (
    <div className={WRAP}>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <PageHead eyebrow="Delivery · fulfilment" title="Fulfilment board">
          Every confirmed order, column by column — assign a carrier and move it along.
        </PageHead>
        <div className="flex items-center gap-3">
          {demo && <DemoBadge />}
          <button onClick={() => void load()} className="border border-lavender-deep bg-white text-body-soft hover:text-purple text-[13px] font-medium px-4 py-2.5 rounded-[11px]">↻ Refresh</button>
        </div>
      </div>

      {/*  A refusal reads as a rule saying no, beside the work it refused —
           never as a frozen screen. See the note on `boardErr`.  */}
      {boardErr && (
        <div className="flex items-start gap-2.5 rounded-[12px] border px-4 py-3 mb-4 text-[13px]" style={{ background: "#fdeef0", borderColor: "#f3c9cf", color: "#8c2f39" }}>
          <Icon name="shield" size={16} />
          <span className="flex-1">{boardErr}</span>
          <button onClick={() => setBoardErr("")} className="font-bold opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
      {boardNote && (
        <div className="flex items-start gap-2.5 rounded-[12px] border px-4 py-3 mb-4 text-[13px]" style={{ background: "#e9f9ef", borderColor: "#c2ecd3", color: "#0e7a3d" }}>
          <Icon name="check" size={16} />
          <span className="flex-1">{boardNote}</span>
          <button onClick={() => setBoardNote("")} className="font-bold opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ---- toolbar: view, search, filters ---- */}
      <div className="flex items-center gap-2.5 flex-wrap mb-4">
        <div className="inline-flex bg-lavender rounded-[11px] p-1 gap-1">
          {(["list", "board"] as const).map((v) => (
            <button
              key={v} onClick={() => setView(v)}
              className={`text-[12.5px] font-semibold px-4 py-2 rounded-[9px] capitalize ${view === v ? "bg-white text-purple shadow-soft" : "text-body-soft hover:text-purple"}`}
            >
              {v}
            </button>
          ))}
        </div>
        <input
          className="ipt flex-1 min-w-[190px] max-w-[340px]" value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Order no, phone, name or address"
        />
        <select className="ipt w-auto min-w-[130px]" value={zone} onChange={(e) => { setZone(e.target.value); setPage(1); }}>
          <option value="">All zones</option>
          <option value="DHAKA">Dhaka</option>
          <option value="BANGLADESH">Nationwide</option>
        </select>
      </div>

      {/*  The chips count the WHOLE queue, so they stay honest while a filter
          narrows the table under them. */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <button
          onClick={() => { setStatus(""); setPage(1); }}
          className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border ${status === "" ? "bg-purple text-white border-purple" : "bg-white text-body-soft border-lavender-deep hover:text-purple"}`}
        >
          Everything {Object.values(counts).reduce((a, n) => a + n, 0)}
        </button>
        {COLS.map((c) => (
          <button
            key={c.key} onClick={() => { setStatus(c.key); setPage(1); }}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-full border"
            style={
              status === c.key
                ? { background: c.tone, color: "#fff", borderColor: c.tone }
                : { background: `${c.tone}12`, color: c.tone, borderColor: `${c.tone}33` }
            }
          >
            {c.label} {counts[c.key] ?? 0}
          </button>
        ))}
      </div>

      {/* ---- bulk bar ---- */}
      {picked.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap bg-purple text-white rounded-[13px] px-4 py-3 mb-4">
          <span className="text-[13.5px] font-semibold">{picked.size} selected</span>
          <button onClick={() => setPicked(new Set())} className="text-[12.5px] underline opacity-90 hover:opacity-100">clear</button>
          <span className="flex-1" />
          <button
            onClick={() => setBulkOpen(true)}
            className="bg-white text-purple text-[13px] font-semibold px-4 py-2 rounded-[10px]"
          >
            Assign all {picked.size} →
          </button>
        </div>
      )}

      {view === "list" ? (
        <BoardList
          rows={rows} total={total} page={page} limit={LIMIT}
          picked={picked} allPicked={allPicked} busy={busy}
          onTogglePick={togglePick}
          onToggleAll={() => setPicked(allPicked ? new Set() : new Set(assignable.map((o) => o.id)))}
          onPage={setPage}
          onAssign={(o) => { setAssigning(o); setAKind(o.zone === "BANGLADESH" ? "COURIER" : "RIDER"); }}
          onAct={act}
          onPrepare={startPreparing}
        />
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLS.map((col) => (
          <div key={col.key} className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-lavender-deep" style={{ background: `${col.tone}12` }}>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold" style={{ color: col.tone }}>{col.label}</span>
                <span className="text-[12px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${col.tone}22`, color: col.tone }}>{byCol[col.key]?.length ?? 0}</span>
              </div>
              <div className="text-[11px] text-body-soft mt-0.5">{col.hint}</div>
            </div>
            <div className="p-2.5 flex flex-col gap-2.5 min-h-[120px]">
              {(byCol[col.key] ?? []).map((o) => (
                <div key={o.id} className="border border-lavender-deep rounded-[13px] p-3 hover:border-orchid transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/orders/${o.id}`} className="font-mono font-bold text-purple text-[12.5px] hover:text-orchid">{o.orderNo}</Link>
                    <span className="text-[11px] text-body-soft">{ago(o.placedAt)}</span>
                  </div>
                  <div className="text-[13px] font-medium text-purple mt-1 leading-snug">
                    {o.isGift ? `🎁 ${o.recipientName ?? "recipient"}` : o.customer.name}
                  </div>
                  <div className="text-[11.5px] text-body-soft leading-snug">{o.address.slice(0, 48)}{o.address.length > 48 ? "…" : ""}</div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    <span className="text-[11px] font-semibold bg-lavender text-purple px-2 py-0.5 rounded-[7px]">{o.methodLabel ?? o.zone}</span>
                    {o.slotLabel && <span className="text-[11px] bg-lavender text-body px-2 py-0.5 rounded-[7px]">{o.slotLabel}</span>}
                    {o.duePaisa > 0 && <span className="text-[11px] font-semibold bg-[#fff4e2] text-[#b45309] px-2 py-0.5 rounded-[7px]">COD {formatTaka(o.duePaisa)}</span>}
                    {o.photoCount > 0 && <span className="text-[11px] bg-[#e8f6ef] text-[#0f7d55] px-2 py-0.5 rounded-[7px]">📷 {o.photoCount}</span>}
                    {carrierChip(o.assignment)}
                  </div>
                  <div className="flex gap-1.5 mt-2.5 flex-wrap">
                    {(col.key === "unassigned" || col.key === "failed") && (
                      <button disabled={busy === o.id} onClick={() => { setAssigning(o); setAKind(o.zone === "BANGLADESH" ? "COURIER" : "RIDER"); }} className="flex-1 min-w-[80px] bg-white border-[1.5px] border-purple text-purple hover:bg-lavender text-[12px] font-semibold py-2 rounded-[9px]">{col.key === "failed" || o.assignment ? "Re-assign" : "Assign"}</button>
                    )}
                    {col.key === "unassigned" && (
                      <button disabled={busy === o.id} onClick={() => startPreparing(o)} className="flex-1 min-w-[110px] bg-purple hover:bg-purple-deep text-white text-[12px] font-semibold py-2 rounded-[9px]" title="Commit stock and start preparing">Start preparing →</button>
                    )}
                    {col.key === "preparing" && o.assignment && (
                      <button disabled={busy === o.id} onClick={() => act(o, "out")} className="flex-1 bg-purple hover:bg-purple-deep text-white text-[12px] font-semibold py-2 rounded-[9px]">Send out →</button>
                    )}
                    {col.key === "preparing" && !o.assignment && (
                      <button disabled={busy === o.id} onClick={() => { setAssigning(o); setAKind(o.zone === "BANGLADESH" ? "COURIER" : "RIDER"); }} className="flex-1 border-[1.5px] border-lavender-deep hover:border-orchid text-purple text-[12px] font-semibold py-2 rounded-[9px]">Assign first</button>
                    )}
                    {col.key === "out_for_delivery" && (
                      <>
                        <button disabled={busy === o.id} onClick={() => act(o, "delivered")} className="flex-1 bg-[#0f7d55] hover:bg-[#0b6142] text-white text-[12px] font-semibold py-2 rounded-[9px]">✓ Delivered</button>
                        <button disabled={busy === o.id} onClick={() => act(o, "fail")} className="border-[1.5px] border-[#f0c0c0] text-[#b91c1c] text-[12px] font-semibold px-3 py-2 rounded-[9px]">Fail</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {(byCol[col.key] ?? []).length === 0 && (
                <div className="text-center text-body-soft text-[12.5px] py-8">Nothing here 🎉</div>
              )}
            </div>
          </div>
        ))}
      </div>
      )}

      {/*  ⚠️ The board shows one page, like the list does. Before 12 Aug it
          silently showed the first 300 of however many there were; saying so
          out loud is the whole point. */}
      {view === "board" && total > (rows?.length ?? 0) && (
        <p className="text-[12.5px] text-body-soft mt-4 mb-0">
          Showing {rows?.length ?? 0} of {total}. Switch to the list to page
          through the rest, or filter above.
        </p>
      )}

      {/*  BULK ASSIGN. No consignment box here on purpose — one number pasted
          across forty parcels would be forty wrong tracking links. */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] grid place-items-center p-4" {...backdropClose(() => setBulkOpen(false))}>
          <div className="bg-white rounded-[18px] shadow-lift border border-lavender-deep p-5 w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-[18px] text-purple m-0 mb-1">Assign {picked.size} parcels</h3>
            <p className="text-[12.5px] text-body-soft mt-0 mb-4">
              They all go to one carrier. Consignment numbers are typed per parcel afterwards.
            </p>
            <Guide>Carrier type</Guide>
            <div className="inline-flex bg-lavender rounded-[11px] p-1 gap-1 mb-4">
              {(["RIDER", "COURIER"] as const).map((k) => (
                <button key={k} onClick={() => setAKind(k)} className={`text-[12.5px] font-semibold px-4 py-2 rounded-[9px] ${aKind === k ? "bg-white text-purple shadow-soft" : "text-body-soft"}`}>{k === "RIDER" ? "🛵 Own rider" : "📦 Courier"}</button>
              ))}
            </div>
            {aKind === "RIDER" ? (
              <>
                <Guide>Rider</Guide>
                <select className="ipt" value={aRider} onChange={(e) => setARider(e.target.value)}>
                  <option value="">— pick a rider —</option>
                  {riders.map((r) => (<option key={r.id} value={r.id}>{r.name}{r.vehicle ? ` · ${r.vehicle}` : ""}</option>))}
                </select>
              </>
            ) : (
              <>
                <Guide>Courier</Guide>
                <select className="ipt" value={aCourier} onChange={(e) => setACourier(e.target.value)}>
                  <option value="">— pick a courier —</option>
                  {couriers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </>
            )}
            <div className="flex gap-2.5 mt-5">
              <button
                onClick={doBulk}
                disabled={(aKind === "RIDER" && !aRider) || (aKind === "COURIER" && !aCourier) || busy === "bulk"}
                className="flex-1 bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium py-2.5 rounded-[11px] disabled:opacity-50"
              >
                {busy === "bulk" ? "Assigning…" : `Assign all ${picked.size}`}
              </button>
              <button onClick={() => setBulkOpen(false)} className="border-[1.5px] border-lavender-deep text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* assign modal */}
      {assigning && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] grid place-items-center p-4" {...backdropClose(() => setAssigning(null))}>
          <div className="bg-white rounded-[18px] shadow-lift border border-lavender-deep p-5 w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-[18px] text-purple m-0 mb-1">Assign {assigning.orderNo}</h3>
            <p className="text-[12.5px] text-body-soft mt-0 mb-4">Re-assigning replaces the current carrier.</p>
            <Guide>Carrier type</Guide>
            <div className="inline-flex bg-lavender rounded-[11px] p-1 gap-1 mb-4">
              {(["RIDER", "COURIER"] as const).map((k) => (
                <button key={k} onClick={() => setAKind(k)} className={`text-[12.5px] font-semibold px-4 py-2 rounded-[9px] ${aKind === k ? "bg-white text-purple shadow-soft" : "text-body-soft"}`}>{k === "RIDER" ? "🛵 Own rider" : "📦 Courier"}</button>
              ))}
            </div>
            {aKind === "RIDER" ? (
              <div><Guide>Rider</Guide>
                <select className="ipt" value={aRider} onChange={(e) => setARider(e.target.value)}>
                  <option value="">— pick a rider —</option>
                  {riders.map((r) => (<option key={r.id} value={r.id}>{r.name}{r.vehicle ? ` · ${r.vehicle}` : ""}</option>))}
                </select>
                {riders.length === 0 && <p className="text-[12px] text-[#b45309] mt-1.5 mb-0">No riders yet — add one in Delivery → Riders.</p>}
              </div>
            ) : (
              <>
                <div><Guide>Courier</Guide>
                  <select className="ipt" value={aCourier} onChange={(e) => setACourier(e.target.value)}>
                    <option value="">— pick a courier —</option>
                    {couriers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                </div>
                <div className="mt-3"><Guide>Consignment no</Guide>
                  <input className="ipt font-mono" value={aCn} onChange={(e) => setACn(e.target.value)} placeholder="e.g. SF123456" />
                </div>
              </>
            )}
            <div className="flex gap-2.5 mt-5">
              <button
                onClick={doAssign}
                disabled={(aKind === "RIDER" && !aRider) || (aKind === "COURIER" && !aCourier) || busy === assigning.id}
                className="flex-1 bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium py-2.5 rounded-[11px] disabled:opacity-50"
              >
                <Icon name="check" size={15} /> Assign
              </button>
              <button onClick={() => setAssigning(null)} className="border-[1.5px] border-lavender-deep text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/*  DEC-DLV-022 — WHY IT DID NOT ARRIVE.

          One action for a failed delivery and a reschedule: the owner's
          ruling, 30 Aug. The parcel did not arrive either way, and asking a
          rider at the door to decide which of the two it was is asking for a
          guess. The reason is PICKED so the reports can group it; the note is
          for what no list can hold ("gate locked, guard sent us away").

          It replaces a `prompt()`, which blocked the whole board while it
          waited and threw the answer away if anyone pressed Escape.  */}
      {failing && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] grid place-items-center p-4" {...backdropClose(() => setFailing(null))}>
          <div className="bg-white rounded-[18px] shadow-lift border border-lavender-deep p-5 w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-[18px] text-purple m-0 mb-1">{failing.orderNo} did not arrive</h3>
            <p className="text-[12.5px] text-body-soft mt-0 mb-4">
              The parcel and its stock stay committed. Assign a carrier again to try once more.
            </p>
            <Guide>What happened</Guide>
            <select className="ipt" value={failReasonId} onChange={(e) => setFailReasonId(e.target.value)}>
              {failReasons.length === 0 && <option value="">— no reasons set up yet —</option>}
              {failReasons.map((r) => (<option key={r.id} value={r.id}>{r.label}</option>))}
            </select>
            {failReasons.length === 0 && (
              <p className="text-[12px] text-[#b45309] mt-1.5 mb-0">
                Add them in Delivery → Settings; the note below is recorded either way.
              </p>
            )}
            <div className="mt-3"><Guide>Anything else worth knowing (optional)</Guide>
              <input className="ipt" value={failNote} onChange={(e) => setFailNote(e.target.value)} placeholder="e.g. gate locked, guard sent us away" />
            </div>
            <div className="flex gap-2.5 mt-5">
              <button
                onClick={() => void doFail()}
                disabled={busy === failing.id}
                className="flex-1 text-white text-[13.5px] font-bold py-2.5 rounded-[11px] disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                style={{ background: "#c0392b" }}
              >
                <Icon name="shield" size={15} /> Record the failure
              </button>
              <button onClick={() => setFailing(null)} className="border-[1.5px] border-lavender-deep text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px]">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= RIDERS ================= */
export function RidersLive() {
  const [rows, setRows] = useState<ApiRider[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [editing, setEditing] = useState<Partial<ApiRider> | null>(null);
  /** why the last thing was refused — on the page, never in a browser alert */
  const [riderErr, setRiderErr] = useState("");

  const load = useCallback(async () => {
    try { setRows(await listRiders()); setDemo(false); } catch { setRows([]); setDemo(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setRiderErr("");
    if (!editing?.name?.trim()) { setRiderErr("A rider needs a name."); return; }
    try {
      if (editing.id) await updateRider(editing.id, editing as Record<string, unknown>);
      else await createRider(editing as Record<string, unknown>);
      setEditing(null);
      await load();
    } catch (e) { setRiderErr(e instanceof Error ? e.message : "Could not save that rider."); }
  };

  const remove = async (r: ApiRider) => {
    /*  `confirm()` stays — it asks a question, and blocking is the point
        (CLAUDE.md: the Cancel-order confirm is kept for the same reason).  */
    if (!confirm(`Remove ${r.name}?`)) return;
    setRiderErr("");
    try {
      await deleteRider(r.id);
      await load();
    } catch (e) { setRiderErr(e instanceof Error ? e.message : "Could not remove that rider."); }
  };

  return (
    <div className={WRAP}>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <PageHead eyebrow="Delivery · riders" title="Riders">
          Your own delivery people.
        </PageHead>
        <div className="flex items-center gap-3">
          {demo && <DemoBadge />}
          <button onClick={() => setEditing({ isActive: true })} className="bg-purple hover:bg-purple-deep text-white text-[14px] font-medium px-5 py-3 rounded-[12px] inline-flex items-center gap-2 shadow-soft"><Icon name="plus" size={16} /> Add rider</button>
        </div>
      </div>

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
              <th className="text-left font-medium px-4 py-3">Rider</th>
              <th className="text-left font-medium px-4 py-3">Phone</th>
              <th className="text-left font-medium px-4 py-3">Vehicle</th>
              <th className="text-left font-medium px-4 py-3">Today (assigned · out · done · failed)</th>
              <th className="text-left font-medium px-4 py-3">Active</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="border-t border-lavender-deep hover:bg-lavender/60">
                <td className="px-4 py-3 font-medium text-purple">{r.name}</td>
                <td className="px-4 py-3">{r.phone ? <a href={`tel:${r.phone}`} className="text-orchid hover:text-purple">{r.phone}</a> : "—"}</td>
                <td className="px-4 py-3">{r.vehicle ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-purple">{r.today?.assigned ?? 0}</span> · <span className="text-[#a021b8] font-semibold">{r.today?.out ?? 0}</span> · <span className="text-[#0f7d55] font-semibold">{r.today?.delivered ?? 0}</span> · <span className="text-[#b91c1c] font-semibold">{r.today?.failed ?? 0}</span>
                </td>
                <td className="px-4 py-3">{r.isActive ? <span className="text-[11px] font-semibold bg-[#e8f6ef] text-[#0f7d55] px-2.5 py-1 rounded-full">Active</span> : <span className="text-[11px] font-semibold bg-[#f0edf4] text-body-soft px-2.5 py-1 rounded-full">Off</span>}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setEditing(r)} className="text-[13px] font-medium text-orchid hover:text-purple mr-3">Edit</button>
                  <button onClick={() => void remove(r)} className="text-[13px] font-medium text-body-soft hover:text-[#b91c1c]">Remove</button>
                </td>
              </tr>
            ))}
            {rows !== null && rows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-body-soft py-12 border-t border-lavender-deep">No riders yet — add your first delivery man.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] grid place-items-center p-4" {...backdropClose(() => setEditing(null))}>
          <div className="bg-white rounded-[18px] shadow-lift border border-lavender-deep p-5 w-full max-w-[400px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-[18px] text-purple m-0 mb-4">{editing.id ? "Edit rider" : "Add rider"}</h3>
            <Guide>Name *</Guide>
            <input className="ipt mb-3" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <Guide>Phone</Guide>
            <input className="ipt mb-3" value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            <Guide>Vehicle</Guide>
            <input className="ipt mb-3" value={editing.vehicle ?? ""} onChange={(e) => setEditing({ ...editing, vehicle: e.target.value })} placeholder="bike / cycle / on foot" />
            <label className="flex items-center gap-2 text-[13px] text-body mb-4">
              <input type="checkbox" checked={editing.isActive ?? true} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /> Active
            </label>
            <div className="flex gap-2.5">
              <button onClick={save} className="flex-1 bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium py-2.5 rounded-[11px]">Save</button>
              <button onClick={() => setEditing(null)} className="border-[1.5px] border-lavender-deep text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px]">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/*  COURIERS LEFT THIS FILE — 12 Aug 2026.

    The courier master is edited in Administration -> Courier & delivery now,
    where its API keys already lived. The owner's words: a courier screen in
    Delivery as well 'is confusing and flow break kore'. Riders stayed, because
    a rider is our own staff and has no keys, no account and no API.

    The board still assigns to couriers exactly as before — it reads the same
    table through /delivery/couriers, which never moved.  */

/*  METHODS & SLOTS LEFT THIS FILE — 19 Aug 2026 (DEC-DLV-018).
    The masters (methods, time slots, zones) live in ZonesAvailability's
    DeliveryMasters at /delivery/zones; connecting them to zones happens in
    DeliveryConnections at /delivery/setup. This screen was the second,
    diverging method-creation form — one form, one home now.  */

/* ================= PROOF PHOTOS (P4) ================= */
export function ProofLive() {
  const [q, setQ] = useState("");
  const [order, setOrder] = useState<Awaited<ReturnType<typeof getOrder>> | null>(null);
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<"PREP" | "DELIVERY">("PREP");

  const search = async () => {
    setErr("");
    setOrder(null);
    try {
      const r = await listOrders({ search: q });
      const hit = r.items[0];
      if (!hit) { setErr("No order matches — search by RAD-no / name / phone."); return; }
      setOrder(await getOrder(hit.id));
    } catch { setErr("API offline?"); }
  };

  /*
    DLV-R08 — proof photographs.

    These were stored as base64 data-URLs on the OrderPhoto row. Two prep shots
    and a handover shot per order, several hundred orders a month, and the photo
    travelled inside every order read that touched them. Worse, a phone camera
    photograph regularly exceeded the request limit, so the shot the rider
    believed he had filed was never saved.

    Now uploaded; the row carries the address only. `addOrderPhoto` is unchanged
    — it always took a `url`, and this is finally a real one.
  */
  const upload = async (file: File) => {
    if (!order) return;
    setUploading(true);
    setErr("");
    try {
      const url = await uploadItemImage(file, "delivery", 1400);
      await addOrderPhoto(order.id, { kind, url, capturedBy: "Admin" });
      setOrder(await getOrder(order.id));
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not upload that photo."); }
    setUploading(false);
  };

  return (
    <div className={WRAP}>
      <PageHead eyebrow="Delivery · proof" title="Proof photos">
        Add kitchen-prep and handover photos to any order.
      </PageHead>

      <div className="flex gap-2.5 items-center mb-5">
        <div className="relative max-w-[340px] w-full">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft"><Icon name="search" size={18} /></span>
          <input className="ipt ipt-icon h-[44px]" placeholder="RAD-no / customer / phone…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()} />
        </div>
        <button onClick={() => void search()} className="bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px]">Find order</button>
        {err && <span className="text-[13px] text-[#b45309] font-medium">{err}</span>}
      </div>

      {order && (
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <Link href={`/orders/${order.id}`} className="font-mono font-bold text-purple text-[15px] hover:text-orchid">{order.orderNo}</Link>
              <span className="text-[13px] text-body-soft ml-2">{order.customer?.name} · {order.deliveryStatus}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex bg-lavender rounded-[11px] p-1 gap-1">
                {(["PREP", "DELIVERY"] as const).map((k) => (
                  <button key={k} onClick={() => setKind(k)} className={`text-[12.5px] font-semibold px-3.5 py-2 rounded-[9px] ${kind === k ? "bg-white text-purple shadow-soft" : "text-body-soft"}`}>{k === "PREP" ? "🧑‍🍳 Prep" : "📦 Handover"}</button>
                ))}
              </div>
              <label className={`bg-purple hover:bg-purple-deep text-white text-[13px] font-medium px-4 py-2.5 rounded-[11px] cursor-pointer ${uploading ? "opacity-50" : ""}`}>
                {uploading ? "Uploading…" : "＋ Upload photo"}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(order.photos ?? []).map((p) => (
              <div key={p.id} className="rounded-[13px] overflow-hidden border border-lavender-deep">
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={p.kind} className="w-full h-[140px] object-cover" />
                ) : (
                  <div className="w-full h-[140px]" style={{ background: p.bg ?? "linear-gradient(135deg,#efd9f7,#cbb3e3)" }} />
                )}
                <div className="px-2.5 py-1.5 text-[11.5px] text-body-soft bg-white flex justify-between">
                  <span className="font-semibold text-purple">{p.kind}</span>
                  <span>{p.capturedBy ?? ""}</span>
                </div>
              </div>
            ))}
            {(order.photos ?? []).length === 0 && (
              <div className="col-span-full text-center text-body-soft text-[13px] py-8">No photos on this order yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
