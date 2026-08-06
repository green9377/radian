"use client";

/*
  Delivery Management — LIVE screens (:4000 /delivery).
  RADIAN_DELIVERY_MODULE_ARCHITECTURE.md (DEC-DLV-001..006, DLV-R01..R08).
  V1 = board · riders · couriers · method/slot master · proof upload.
  Demo-fallback + orange badge per project rule when the API is down.
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import {
  ApiAssignment,
  ApiBoardOrder,
  ApiCourierService,
  ApiDeliveryMethod,
  ApiRider,
  addDeliverySlot,
  addOrderPhoto,
  assignmentAction,
  createAssignment,
  createCourierService,
  createRider,
  orderAction,
  deleteCourierService,
  deleteDeliveryMethod,
  deleteDeliverySlot,
  deleteRider,
  deliveryBoard,
  createDeliveryMethod,
  listCourierServices,
  listDeliveryMethods,
  listOrders,
  listRiders,
  updateCourierService,
  updateDeliveryMethod,
  updateDeliverySlot,
  updateRider,
  getOrder,
  formatTaka,
  uploadItemImage,
} from "../_data/api";

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
  const [aKind, setAKind] = useState<"RIDER" | "COURIER">("RIDER");
  const [aRider, setARider] = useState("");
  const [aCourier, setACourier] = useState("");
  const [aCn, setACn] = useState("");

  const load = useCallback(async () => {
    try {
      const [b, r, c] = await Promise.all([deliveryBoard(), listRiders(), listCourierServices()]);
      setRows(b);
      setRiders(r.filter((x) => x.isActive));
      setCouriers(c.filter((x) => x.isActive));
      setDemo(false);
    } catch {
      setRows([]);
      setDemo(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

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
    } catch (e) { alert(e instanceof Error ? e.message : "failed"); }
    setBusy(null);
  };

  const act = async (o: ApiBoardOrder, action: "out" | "delivered" | "fail") => {
    if (!o.assignment) { alert("assign a rider/courier first"); return; }
    const failReason = action === "fail" ? prompt("Why did it fail? (recorded)") ?? "not specified" : undefined;
    setBusy(o.id);
    try {
      await assignmentAction(o.assignment.id, action, failReason ? { failReason } : {});
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : "failed"); }
    setBusy(null);
  };

  /* REV-DLV-1 — move confirmed→preparing from the board (stock commit,
     DEC-MOD-003). Same transition as the Orders screen — one rule, two doors. */
  const startPreparing = async (o: ApiBoardOrder) => {
    setBusy(o.id);
    try {
      await orderAction(o.id, "prepare");
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : "failed"); }
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

      {/* assign modal */}
      {assigning && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] grid place-items-center p-4" onClick={() => setAssigning(null)}>
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
    </div>
  );
}

/* ================= RIDERS ================= */
export function RidersLive() {
  const [rows, setRows] = useState<ApiRider[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [editing, setEditing] = useState<Partial<ApiRider> | null>(null);

  const load = useCallback(async () => {
    try { setRows(await listRiders()); setDemo(false); } catch { setRows([]); setDemo(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!editing?.name?.trim()) { alert("name is required"); return; }
    try {
      if (editing.id) await updateRider(editing.id, editing as Record<string, unknown>);
      else await createRider(editing as Record<string, unknown>);
      setEditing(null);
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : "failed"); }
  };

  return (
    <div className="px-6 md:px-8 pt-7 pb-16 max-w-[1150px]">
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
                  <button onClick={async () => { if (confirm(`Remove ${r.name}?`)) { try { await deleteRider(r.id); await load(); } catch (e) { alert(e instanceof Error ? e.message : "failed"); } } }} className="text-[13px] font-medium text-body-soft hover:text-[#b91c1c]">Remove</button>
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
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] grid place-items-center p-4" onClick={() => setEditing(null)}>
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

/* ================= COURIERS (P2 master) ================= */
export function CouriersLive() {
  const [rows, setRows] = useState<ApiCourierService[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [editing, setEditing] = useState<Partial<ApiCourierService> | null>(null);

  const load = useCallback(async () => {
    try { setRows(await listCourierServices()); setDemo(false); } catch { setRows([]); setDemo(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!editing?.name?.trim()) { alert("name is required"); return; }
    try {
      if (editing.id) await updateCourierService(editing.id, editing as Record<string, unknown>);
      else await createCourierService(editing as Record<string, unknown>);
      setEditing(null);
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : "failed"); }
  };

  return (
    <div className="px-6 md:px-8 pt-7 pb-16 max-w-[1150px]">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <PageHead eyebrow="Delivery · couriers" title="Courier services">
          The nationwide parcel services you hand orders to. Use {"{cn}"} in a tracking link where the consignment number goes.
        </PageHead>
        <div className="flex items-center gap-3">
          {demo && <DemoBadge />}
          <button onClick={() => setEditing({ isActive: true })} className="bg-purple hover:bg-purple-deep text-white text-[14px] font-medium px-5 py-3 rounded-[12px] inline-flex items-center gap-2 shadow-soft"><Icon name="plus" size={16} /> Add courier</button>
        </div>
      </div>

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
              <th className="text-left font-medium px-4 py-3">Courier</th>
              <th className="text-left font-medium px-4 py-3">Phone</th>
              <th className="text-left font-medium px-4 py-3">Tracking URL template</th>
              <th className="text-left font-medium px-4 py-3">Active</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((c) => (
              <tr key={c.id} className="border-t border-lavender-deep hover:bg-lavender/60">
                <td className="px-4 py-3 font-medium text-purple">{c.name}</td>
                <td className="px-4 py-3">{c.phone ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-[12px] text-body-soft">{c.trackingUrlTemplate ?? "—"}</td>
                <td className="px-4 py-3">{c.isActive ? <span className="text-[11px] font-semibold bg-[#e8f6ef] text-[#0f7d55] px-2.5 py-1 rounded-full">Active</span> : <span className="text-[11px] font-semibold bg-[#f0edf4] text-body-soft px-2.5 py-1 rounded-full">Off</span>}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setEditing(c)} className="text-[13px] font-medium text-orchid hover:text-purple mr-3">Edit</button>
                  <button onClick={async () => { if (confirm(`Remove ${c.name}?`)) { await deleteCourierService(c.id); await load(); } }} className="text-[13px] font-medium text-body-soft hover:text-[#b91c1c]">Remove</button>
                </td>
              </tr>
            ))}
            {rows !== null && rows.length === 0 && (
              <tr><td colSpan={5} className="text-center text-body-soft py-12 border-t border-lavender-deep">No couriers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] grid place-items-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-[18px] shadow-lift border border-lavender-deep p-5 w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-[18px] text-purple m-0 mb-4">{editing.id ? "Edit courier" : "Add courier"}</h3>
            <Guide>Name *</Guide>
            <input className="ipt mb-3" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <Guide>Phone</Guide>
            <input className="ipt mb-3" value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            <Guide>Tracking URL template ({"{cn}"} = consignment)</Guide>
            <input className="ipt mb-4 font-mono text-[12.5px]" value={editing.trackingUrlTemplate ?? ""} onChange={(e) => setEditing({ ...editing, trackingUrlTemplate: e.target.value })} placeholder="https://steadfast.com.bd/t/{cn}" />
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

/* ================= METHODS & SLOTS (P3 master) ================= */
export function MethodsLive() {
  const [rows, setRows] = useState<ApiDeliveryMethod[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [editing, setEditing] = useState<Partial<ApiDeliveryMethod> | null>(null);
  const [newSlot, setNewSlot] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try { setRows(await listDeliveryMethods()); setDemo(false); } catch { setRows([]); setDemo(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!editing?.label?.trim()) { alert("label is required"); return; }
    const body = {
      label: editing.label, zone: editing.zone ?? "DHAKA", kind: editing.kind ?? "RIDER",
      feePaisa: editing.feePaisa ?? 0, cutoffTime: editing.cutoffTime ?? null, etaLabel: editing.etaLabel ?? null,
      isActive: editing.isActive ?? true,
    };
    try {
      if (editing.id) await updateDeliveryMethod(editing.id, body);
      else await createDeliveryMethod(body);
      setEditing(null);
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : "failed"); }
  };

  return (
    <div className="px-6 md:px-8 pt-7 pb-16 max-w-[1250px]">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <PageHead eyebrow="Delivery · zones & methods" title="Methods & slots">
          Your delivery options — zone, fee and time slots. The order form uses these.
        </PageHead>
        <div className="flex items-center gap-3">
          {demo && <DemoBadge />}
          <button onClick={() => setEditing({ zone: "DHAKA", kind: "RIDER", isActive: true })} className="bg-purple hover:bg-purple-deep text-white text-[14px] font-medium px-5 py-3 rounded-[12px] inline-flex items-center gap-2 shadow-soft"><Icon name="plus" size={16} /> Add method</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(rows ?? []).map((m) => (
          <div key={m.id} className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-display text-[16px] text-purple">{m.label} {!m.isActive && <span className="text-[11px] font-semibold bg-[#f0edf4] text-body-soft px-2 py-0.5 rounded-full ml-1">Off</span>}</div>
                <div className="text-[12.5px] text-body-soft mt-0.5">
                  {m.zone === "DHAKA" ? "Inside Dhaka" : "Nationwide"} · {m.kind === "RIDER" ? "own rider" : "courier"} · {formatTaka(m.feePaisa)}
                  {m.cutoffTime ? ` · order by ${m.cutoffTime}` : ""}{m.etaLabel ? ` · ${m.etaLabel}` : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(m)} className="text-[13px] font-medium text-orchid hover:text-purple">Edit</button>
                <button onClick={async () => { if (confirm(`Remove "${m.label}"? Existing orders keep their snapshot.`)) { await deleteDeliveryMethod(m.id); await load(); } }} className="text-[13px] font-medium text-body-soft hover:text-[#b91c1c]">Remove</button>
              </div>
            </div>
            <div className="mt-3 border-t border-lavender-deep pt-3">
              <Guide>Time slots {m.slots.length === 0 && "(none — method has no slot choice)"}</Guide>
              <div className="flex gap-2 flex-wrap">
                {m.slots.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-2 bg-lavender text-purple text-[12.5px] font-medium px-3 py-1.5 rounded-[10px]">
                    {s.label}{s.capacityPerDay ? <span className="text-body-soft font-normal">· cap {s.capacityPerDay}/day</span> : null}
                    <button onClick={async () => { await deleteDeliverySlot(s.id); await load(); }} className="text-body-soft hover:text-[#b91c1c] font-bold">×</button>
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                  <input
                    className="ipt h-[34px] max-w-[140px] text-[12.5px]"
                    placeholder="10:00–13:00"
                    value={newSlot[m.id] ?? ""}
                    onChange={(e) => setNewSlot({ ...newSlot, [m.id]: e.target.value })}
                  />
                  <button
                    onClick={async () => {
                      const label = (newSlot[m.id] ?? "").trim();
                      if (!label) return;
                      await addDeliverySlot(m.id, { label });
                      setNewSlot({ ...newSlot, [m.id]: "" });
                      await load();
                    }}
                    className="border-[1.5px] border-dashed border-lavender-deep hover:border-orchid text-body-soft hover:text-purple text-[12.5px] font-semibold px-3 py-1.5 rounded-[10px]"
                  >＋ Add</button>
                </span>
              </div>
            </div>
          </div>
        ))}
        {rows !== null && rows.length === 0 && (
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-10 text-center text-body-soft lg:col-span-2">No methods yet — first API call seeds the storefront defaults.</div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] grid place-items-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-[18px] shadow-lift border border-lavender-deep p-5 w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-[18px] text-purple m-0 mb-4">{editing.id ? "Edit method" : "Add method"}</h3>
            <Guide>Label *</Guide>
            <input className="ipt mb-3" value={editing.label ?? ""} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="2-Hour Express" />
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><Guide>Zone</Guide>
                <select className="ipt" value={editing.zone ?? "DHAKA"} onChange={(e) => setEditing({ ...editing, zone: e.target.value as "DHAKA" | "BANGLADESH" })}>
                  <option value="DHAKA">Inside Dhaka</option><option value="BANGLADESH">Nationwide</option>
                </select>
              </div>
              <div><Guide>Carried by</Guide>
                <select className="ipt" value={editing.kind ?? "RIDER"} onChange={(e) => setEditing({ ...editing, kind: e.target.value as "RIDER" | "COURIER" })}>
                  <option value="RIDER">Own rider</option><option value="COURIER">Courier</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><Guide>Fee (৳)</Guide>
                <input className="ipt" value={editing.feePaisa != null ? String(Math.round(editing.feePaisa / 100)) : ""} onChange={(e) => setEditing({ ...editing, feePaisa: Math.round((Number(e.target.value) || 0) * 100) })} />
              </div>
              <div><Guide>Order-by cut-off</Guide>
                <input className="ipt" value={editing.cutoffTime ?? ""} onChange={(e) => setEditing({ ...editing, cutoffTime: e.target.value })} placeholder="20:00" />
              </div>
            </div>
            <Guide>ETA label</Guide>
            <input className="ipt mb-4" value={editing.etaLabel ?? ""} onChange={(e) => setEditing({ ...editing, etaLabel: e.target.value })} placeholder="within 2 hours" />
            <label className="flex items-center gap-2 text-[13px] text-body mb-4">
              <input type="checkbox" checked={editing.isActive ?? true} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /> Active (shows in the order form)
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
    <div className="px-6 md:px-8 pt-7 pb-16 max-w-[1150px]">
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
