"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import { WRAP, ACCENT, ItemPageHead, DemoBar, Kpi } from "./ItemUI";
import { fmtDate } from "./PurchaseViews";
import { listSuppliers, formatTaka, type ApiSupplier } from "../_data/api";
import { SupplierAvatar, StatusPill } from "./SupplierViews";

/*
  Vendors workspace — DEC-SUP-009.
  Fulfillment vendors (cake-type): we list THEIR products on the website, an
  order arrives, we source and deliver. No stock held. Same Supplier table
  underneath (DEC-SUP-001 — one data, one owner); this is their own face:
  products · lead time · notify · due, not a purchase book.
*/

const NewVendorBtn = () => (
  <Link href="/suppliers/vendors/new"
    className="text-white text-[13px] font-medium px-4 py-2.5 rounded-[10px] inline-flex items-center gap-2"
    style={{ background: ACCENT }}>
    <Icon name="plus" size={13} /> New vendor
  </Link>
);

function NotifyBadge({ s }: { s: ApiSupplier }) {
  if (s.notifyChannel === "OFF")
    return <span className="text-[11px] font-semibold px-2 py-1 rounded-full" style={{ background: "#29242e", color: "#aea4b7" }}>Notify off</span>;
  const label = s.notifyChannel === "WHATSAPP" ? "WhatsApp" : "SMS";
  return (
    <span className="text-[11px] font-semibold px-2 py-1 rounded-full" style={{ background: "#20332e", color: "#74f1d7" }}>
      {label} · {s.notifyMode === "AUTO" ? "auto" : "manual"}
    </span>
  );
}

export function VendorBoard() {
  const router = useRouter();
  const [rows, setRows] = useState<ApiSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await listSuppliers({ status: "ALL" });
      // DEC-SUP-009 board; DEC-SUP-010 — dual-role suppliers stand here too
      setRows(r.filter((s) => s.type?.isFulfillment || s.dualRole));
      setFailed(false);
    } catch { setFailed(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let r = showInactive ? rows : rows.filter((s) => s.status === "ACTIVE");
    const needle = query.trim().toLowerCase();
    if (needle) {
      r = r.filter((s) =>
        s.name.toLowerCase().includes(needle) ||
        (s.nickname ?? "").toLowerCase().includes(needle) ||
        (s.phone ?? "").includes(needle));
    }
    return [...r].sort((a, b) => b.duePaisa - a.duePaisa || a.name.localeCompare(b.name));
  }, [rows, query, showInactive]);

  const totals = useMemo(() => ({
    due: filtered.reduce((s, r) => s + r.duePaisa, 0),
    items: filtered.reduce((s, r) => s + (r._count?.items ?? 0), 0),
    ready: filtered.filter((r) => r.notifyChannel !== "OFF").length,
  }), [filtered]);

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Master Data · Suppliers · Vendors"
        title="Fulfillment vendors"
        right={<NewVendorBtn />}
      />
      {failed && <DemoBar what="the vendor board (API offline?)" onRetry={load} />}

      <Kpi items={[
        { l: "Vendors", v: filtered.length, c: "#b5642f", bg: "#38291c", icon: "truck" },
        { l: "Their products listed", v: totals.items, c: "#470066", bg: "#2e1a38", icon: "box" },
        { l: "Notify ready", v: `${totals.ready} of ${filtered.length}`, c: "#0e8f74", bg: "#20332e", icon: "mail" },
        { l: "Due to vendors", v: formatTaka(totals.due), c: totals.due > 0 ? "#c0392b" : "#0e7a3d", bg: "#3b1a16", icon: "cash" },
      ]} />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <label className="flex items-center gap-2 text-[12.5px] text-body cursor-pointer select-none">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
        <Link href="/suppliers" className="text-[12.5px] font-medium underline" style={{ color: ACCENT }}>
          ← Product suppliers
        </Link>
        <div className="relative ml-auto min-w-[240px]">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft pointer-events-none"><Icon name="search" size={15} /></span>
          <input className="ipt ipt-icon w-full" placeholder="Search vendor, phone…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {loading && <p className="text-[13px] text-body-soft">Loading…</p>}
      {!loading && filtered.length === 0 && (
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-8 text-center">
          <p className="text-[13.5px] font-semibold text-purple m-0">
            No vendors yet — <Link className="underline" style={{ color: ACCENT }} href="/suppliers/vendors/new">add the first one →</Link>
          </p>
        </div>
      )}

      {/* vendor cards — a vendor is a PARTNER with products, not a row in a buying book */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((s) => (
          <button key={s.id} onClick={() => router.push(`/suppliers/${s.id}`)}
            className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4 text-left hover:border-orchid transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <SupplierAvatar s={s} size={42} />
              <span className="min-w-0 flex-1">
                <b className="block text-[14px] text-purple truncate">
                  {s.name}{s.nickname ? <span className="font-normal text-body-soft"> ({s.nickname})</span> : null}
                </b>
                <span className="block text-[11.5px] text-body-soft">{s.supplierNo}{s.phone ? ` · ${s.phone}` : ""}</span>
              </span>
              <StatusPill status={s.status} />
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <NotifyBadge s={s} />
              {s.leadTimeHours != null && (
                <span className="text-[11px] font-semibold px-2 py-1 rounded-full" style={{ background: "#1b2838", color: "#79abe2" }}>
                  lead {s.leadTimeHours}h
                </span>
              )}
              <span className="text-[11px] font-semibold px-2 py-1 rounded-full" style={{ background: "#2e1a38", color: "#ce6ef7" }}>
                {s._count?.items ?? 0} product(s)
              </span>
            </div>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-body-soft">{s.lastPurchaseAt ? `last sourcing ${fmtDate(s.lastPurchaseAt)}` : "no sourcing yet"}</span>
              <b style={{ color: s.duePaisa > 0 ? "#e1837a" : "#76efab" }}>
                {s.duePaisa > 0 ? `due ${formatTaka(s.duePaisa)}` : "clear"}
              </b>
            </div>
          </button>
        ))}
      </div>

    </div>
  );
}
