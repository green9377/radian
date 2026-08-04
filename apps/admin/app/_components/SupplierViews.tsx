"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import { WRAP, ACCENT, ItemPageHead, DemoBar, Kpi, DataTable, QuickSelect } from "./ItemUI";
import { fmtDate } from "./PurchaseViews";
import {
  listSuppliers, getSupplierStats, listSupplierTypes, formatTaka,
  type ApiSupplier, type SupplierStats, type ApiSupplierType,
} from "../_data/api";

/*
  Suppliers — Overview + All suppliers.
  Architecture: RADIAN_SUPPLIER_MODULE_ARCHITECTURE.md (locked 23 Jul 2026).

  The Overview IS the due board (owner's Q3 ruling): every active supplier shows,
  zero-due rows included — "With due only" is a filter, not the default truth.
*/

export function SupplierAvatar({ s, size = 34 }: { s: { name: string; photoUrl?: string | null }; size?: number }) {
  const initials = s.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  // stable tint from the name — same trick as the item tiles (DEC-ITM-012)
  let h = 0;
  for (const c of s.name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="rounded-full overflow-hidden shrink-0 grid place-items-center text-white font-semibold"
      style={{ width: size, height: size, fontSize: Math.round(size / 2.6), background: s.photoUrl ? undefined : `hsl(${h} 45% 55%)` }}>
      {s.photoUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={s.photoUrl} alt="" className="w-full h-full object-cover" />
        : initials}
    </span>
  );
}

export function StatusPill({ status }: { status: "ACTIVE" | "INACTIVE" }) {
  return status === "ACTIVE"
    ? <span className="text-[11px] font-semibold px-2 py-1 rounded-full justify-self-start" style={{ background: "#e8f7ef", color: "#0e7a3d" }}>Active</span>
    : <span className="text-[11px] font-semibold px-2 py-1 rounded-full justify-self-start" style={{ background: "#f1eef4", color: "#8a7b96" }}>Inactive</span>;
}

const NewBtn = () => (
  <Link href="/suppliers/new"
    className="text-white text-[13px] font-medium px-4 py-2.5 rounded-[10px] inline-flex items-center gap-2"
    style={{ background: ACCENT }}>
    <Icon name="plus" size={13} /> New supplier
  </Link>
);

/* ================================================================== OVERVIEW */

export function SuppliersOverview() {
  const [stats, setStats] = useState<SupplierStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [dueOnly, setDueOnly] = useState(false); // owner: zeros VISIBLE by default

  async function load() {
    setLoading(true);
    try { setStats(await getSupplierStats()); setFailed(false); }
    catch { setFailed(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // DEC-SUP-009 — this page is the PRODUCT-supplier book; vendors have their own
  // workspace at /suppliers/vendors. One table underneath, two faces on top.
  const supplierRows = useMemo(() => (stats ? stats.board.filter((b) => !b.isFulfillment) : []), [stats]);
  const vendorRows = useMemo(() => (stats ? stats.board.filter((b) => b.isFulfillment) : []), [stats]);
  const board = useMemo(
    () => (dueOnly ? supplierRows.filter((b) => b.duePaisa > 0) : supplierRows),
    [supplierRows, dueOnly],
  );

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Master Data · Suppliers"
        title="Suppliers"
        blurb="The buying book — wholesale flower & goods suppliers you stock from. Fulfillment vendors (cake — sourced per order) live in their own workspace (DEC-SUP-009)."
        right={<NewBtn />}
      />
      {failed && <DemoBar what="the supplier book (API offline?)" onRetry={load} />}

      {stats && (
        <Kpi items={[
          { l: "Suppliers", v: supplierRows.length, c: "#470066", bg: "#f5eafb", icon: "user" },
          { l: "Total due", v: formatTaka(supplierRows.reduce((s, r) => s + r.duePaisa, 0)), c: supplierRows.some((r) => r.duePaisa > 0) ? "#c0392b" : "#0e7a3d", bg: "#fdecea", icon: "cash" },
          { l: "With due", v: supplierRows.filter((r) => r.duePaisa > 0).length, c: "#b45309", bg: "#fff4e6", icon: "bolt" },
          { l: "Credit we hold", v: formatTaka(supplierRows.reduce((s, r) => s + r.creditPaisa, 0)), c: "#0e8f74", bg: "#e7f5f1", icon: "check" },
        ]} />
      )}

      {/* the vendors' own front door (DEC-SUP-009) */}
      <Link href="/suppliers/vendors"
        className="rounded-[14px] border border-lavender-deep bg-white px-5 py-3.5 mb-5 flex items-center justify-between gap-3 hover:bg-lavender/15 shadow-soft">
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center text-white shrink-0" style={{ background: "#b5642f" }}>
            <Icon name="truck" size={15} />
          </span>
          <span className="min-w-0">
            <b className="block text-[13.5px] text-purple">Fulfillment vendors — {vendorRows.length}</b>
            <span className="block text-[12px] text-body-soft truncate">
              Cake-type partners: their products, your orders, no stock held.
              {vendorRows.some((v) => v.duePaisa > 0) && <> Due {formatTaka(vendorRows.reduce((s, v) => s + v.duePaisa, 0))}.</>}
            </span>
          </span>
        </span>
        <span className="text-[12.5px] font-medium shrink-0" style={{ color: ACCENT }}>Open workspace →</span>
      </Link>

      {/* DEC-SUP-007 — free-text purchases still unlinked → the settings tool */}
      {stats && stats.unlinkedNameCount > 0 && (
        <div className="rounded-[14px] border px-5 py-3.5 mb-5 flex items-center justify-between gap-3 flex-wrap" style={{ background: "#fff4e6", borderColor: "#fce4c4" }}>
          <span className="text-[13px]" style={{ color: "#8a5209" }}>
            <b>{stats.unlinkedNameCount}</b> purchase name(s) are not linked to any supplier yet — their dues sit outside this board.
          </span>
          <Link href="/suppliers/settings" className="text-[12.5px] font-medium underline" style={{ color: "#8a5209" }}>Link them →</Link>
        </div>
      )}

      {/* the due board */}
      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <b className="text-[14px] text-purple">Due board — who gets money</b>
          <label className="flex items-center gap-2 text-[12.5px] text-body cursor-pointer select-none">
            <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
            With due only
          </label>
        </div>
        {loading && <p className="text-[13px] text-body-soft m-0">Loading…</p>}
        {!loading && board.length === 0 && (
          <p className="text-[13px] text-body-soft m-0">
            {dueOnly ? "Nothing owed to anyone. 🎉" : <>No suppliers yet. <Link className="underline font-medium" style={{ color: ACCENT }} href="/suppliers/new">Add the first one →</Link></>}
          </p>
        )}
        {board.map((b) => (
          <Link key={b.id} href={`/suppliers/${b.id}`}
            className="flex items-center justify-between gap-3 py-2 border-b border-lavender-deep/60 last:border-0 hover:bg-lavender/20 rounded-[8px] px-2 -mx-2">
            <span className="flex items-center gap-2.5 min-w-0">
              <SupplierAvatar s={b} size={30} />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-body truncate">
                  {b.name}{b.nickname ? <span className="text-body-soft"> ({b.nickname})</span> : null}
                  {/* review fix — inactive with unfinished money stays visible, flagged */}
                  {b.status === "INACTIVE" && (
                    <span className="ml-2 text-[10.5px] px-1.5 py-0.5 rounded-full align-middle" style={{ background: "#f1eef4", color: "#8a7b96" }}>inactive</span>
                  )}
                </span>
                <span className="block text-[11.5px] text-body-soft">{b.typeName}</span>
              </span>
            </span>
            <span className="text-right shrink-0">
              <span className="block text-[13.5px] font-semibold" style={{ color: b.duePaisa > 0 ? "#c0392b" : "#0e7a3d" }}>
                {formatTaka(b.duePaisa)}
              </span>
              {b.creditPaisa > 0 && (
                <span className="block text-[11.5px]" style={{ color: "#0e8f74" }}>credit {formatTaka(b.creditPaisa)}</span>
              )}
            </span>
          </Link>
        ))}
      </div>

      <p className="text-[12.5px] text-body-soft mt-3">
        Corrections never edit history — use an Adjustment entry on the supplier page (SUP-R04). Money never comes back as cash: returns cut due or park as credit (DEC-PUR-006).
      </p>
    </div>
  );
}

/* ================================================================== ALL SUPPLIERS */

// supplier · type · phone · bought · due · credit · last buy · status
const ROW = "grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_130px_120px_110px_110px_100px_100px_84px] items-center gap-2 px-4 py-3";

export function SupplierListView() {
  const router = useRouter();
  const [rows, setRows] = useState<ApiSupplier[]>([]);
  const [types, setTypes] = useState<ApiSupplierType[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [typeId, setTypeId] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "ALL">("ACTIVE");
  const [dueOnly, setDueOnly] = useState(false);
  const [sortDue, setSortDue] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [r, t] = await Promise.all([
        listSuppliers({ status: "ALL" }),
        listSupplierTypes().catch(() => [] as ApiSupplierType[]),
      ]);
      setRows(r); setTypes(t); setFailed(false);
    } catch { setFailed(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    // DEC-SUP-009 — vendors live in /suppliers/vendors, not in this book
    let r = rows.filter((s) => !s.type?.isFulfillment);
    if (status !== "ALL") r = r.filter((s) => s.status === status);
    if (typeId) r = r.filter((s) => s.typeId === typeId);
    if (dueOnly) r = r.filter((s) => s.duePaisa > 0);
    const needle = query.trim().toLowerCase();
    if (needle) {
      r = r.filter((s) =>
        s.name.toLowerCase().includes(needle) ||
        (s.nickname ?? "").toLowerCase().includes(needle) ||
        (s.phone ?? "").includes(needle) ||
        s.supplierNo.toLowerCase().includes(needle));
    }
    return sortDue ? [...r].sort((a, b) => b.duePaisa - a.duePaisa) : [...r].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, status, typeId, dueOnly, query, sortDue]);

  const totals = useMemo(() => ({
    due: filtered.reduce((s, r) => s + r.duePaisa, 0),
    credit: filtered.reduce((s, r) => s + r.creditPaisa, 0),
    bought: filtered.reduce((s, r) => s + r.totalBoughtPaisa, 0),
  }), [filtered]);

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Master Data · Suppliers"
        title="All suppliers"
        blurb="Product suppliers you stock from. Fulfillment vendors have their own workspace — Suppliers → Vendors (DEC-SUP-009)."
        right={<NewBtn />}
      />
      {failed && <DemoBar what="the supplier book (API offline?)" onRetry={load} />}

      <Kpi items={[
        { l: "Suppliers (filtered)", v: filtered.length, c: "#470066", bg: "#f5eafb", icon: "user" },
        { l: "Bought (all time)", v: formatTaka(totals.bought), c: "#2563a8", bg: "#e8f0fa", icon: "box" },
        { l: "Due", v: formatTaka(totals.due), c: totals.due > 0 ? "#c0392b" : "#0e7a3d", bg: "#fdecea", icon: "cash" },
        { l: "Credit we hold", v: formatTaka(totals.credit), c: "#0e8f74", bg: "#e7f5f1", icon: "check" },
      ]} />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {(["ACTIVE", "INACTIVE", "ALL"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className="text-[12.5px] font-medium px-3.5 py-2 rounded-[10px] border"
            style={status === s
              ? { background: ACCENT, borderColor: ACCENT, color: "#fff" }
              : { background: "#fff", borderColor: "#e3d7ec", color: "#6b5878" }}>
            {s === "ACTIVE" ? "Active" : s === "INACTIVE" ? "Inactive" : "All"}
          </button>
        ))}
        <div className="min-w-[180px]">
          <QuickSelect
            value={typeId}
            placeholder="All types"
            options={types.filter((t) => !t.isFulfillment).map((t) => ({ id: t.id, label: t.name }))}
            onChange={setTypeId}
          />
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-body cursor-pointer select-none">
          <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
          With due only
        </label>
        <label className="flex items-center gap-2 text-[12.5px] text-body cursor-pointer select-none">
          <input type="checkbox" checked={sortDue} onChange={(e) => setSortDue(e.target.checked)} />
          Biggest due first
        </label>
        <div className="relative ml-auto min-w-[240px]">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft pointer-events-none"><Icon name="search" size={15} /></span>
          <input className="ipt ipt-icon w-full" placeholder="Search name, nickname, phone…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <DataTable head={
        <div className={ROW + " text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95"}>
          <span>Supplier</span><span>Type</span><span>Phone</span>
          <span className="text-right">Bought</span><span className="text-right">Due</span>
          <span className="text-right">Credit</span><span>Last buy</span><span>Status</span>
        </div>
      }>
        {loading && <div className="px-4 py-6 text-[13px] text-body-soft">Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-body-soft">
            Nothing here yet. <Link className="underline font-medium" style={{ color: ACCENT }} href="/suppliers/new">Add the first supplier →</Link>
          </div>
        )}
        {filtered.map((s) => (
          <button key={s.id} onClick={() => router.push(`/suppliers/${s.id}`)}
            className={ROW + " w-full text-left hover:bg-lavender/25 transition-colors"}>
            <span className="flex items-center gap-2.5 min-w-0">
              <SupplierAvatar s={s} size={34} />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-purple truncate">
                  {s.name}{s.nickname ? <span className="font-normal text-body-soft"> ({s.nickname})</span> : null}
                </span>
                <span className="block text-[11.5px] text-body-soft">{s.supplierNo}{s.market ? ` · ${s.market}` : ""}</span>
              </span>
            </span>
            <span className="text-[12.5px] text-body-soft truncate">{s.type?.name ?? "—"}</span>
            <span className="text-[12.5px] text-body">{s.phone ?? "—"}</span>
            <span className="text-[13px] text-right">{s.totalBoughtPaisa > 0 ? formatTaka(s.totalBoughtPaisa) : "—"}</span>
            <span className="text-[13px] font-semibold text-right" style={{ color: s.duePaisa > 0 ? "#c0392b" : "#9b8aa6" }}>
              {s.duePaisa > 0 ? formatTaka(s.duePaisa) : "—"}
            </span>
            <span className="text-[13px] text-right" style={{ color: s.creditPaisa > 0 ? "#0e8f74" : "#9b8aa6" }}>
              {s.creditPaisa > 0 ? formatTaka(s.creditPaisa) : "—"}
            </span>
            <span className="text-[12.5px] text-body-soft">{fmtDate(s.lastPurchaseAt)}</span>
            <StatusPill status={s.status} />
          </button>
        ))}
      </DataTable>

      <p className="text-[12.5px] text-body-soft mt-3">
        Showing {filtered.length} of {rows.filter((s) => !s.type?.isFulfillment).length} · Inactive suppliers keep their history — nothing is ever hard-deleted (SUP-R02).
      </p>
    </div>
  );
}
