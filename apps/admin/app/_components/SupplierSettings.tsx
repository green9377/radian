"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, ACCENT, ItemPageHead, ErrBar, QuickSelect, msg } from "./ItemUI";
import {
  listSupplierTypes, createSupplierType, updateSupplierType, removeSupplierType,
  supplierUnlinkedNames, supplierLinkNames, listSuppliers, formatTaka,
  type ApiSupplierType, type ApiSupplier,
} from "../_data/api";

/*
  Supplier settings — the type master (DEC-SUP-001: admin-configurable, never an
  enum) + the link tool (DEC-SUP-007: free-text purchase names → real supplier).
  DB reset on 23 Jul means the unlinked list stays tiny — this tool is small on purpose.
*/

export default function SupplierSettings() {
  const [types, setTypes] = useState<ApiSupplierType[]>([]);
  const [unlinked, setUnlinked] = useState<{ name: string; purchaseCount: number; totalPaisa: number }[]>([]);
  const [suppliers, setSuppliers] = useState<ApiSupplier[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [newType, setNewType] = useState("");
  const [newTypeVendor, setNewTypeVendor] = useState(false); // DEC-SUP-009 behaviour pick
  const [busy, setBusy] = useState(false);
  // link tool: which names are ticked, and who they belong to
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [targetId, setTargetId] = useState("");

  async function load() {
    try {
      const [t, u, s] = await Promise.all([
        listSupplierTypes(),
        supplierUnlinkedNames().catch(() => []),
        listSuppliers({ status: "ALL" }).catch(() => [] as ApiSupplier[]),
      ]);
      setTypes(t); setUnlinked(u); setSuppliers(s);
    } catch (e) { setErr(msg(e, "Could not load settings.")); }
  }
  useEffect(() => { load(); }, []);

  async function addType() {
    if (!newType.trim()) return;
    setBusy(true); setErr(null);
    try {
      await createSupplierType({ name: newType.trim(), isFulfillment: newTypeVendor });
      setNewType(""); setNewTypeVendor(false);
      await load();
    }
    catch (e) { setErr(msg(e, "Could not create the type.")); }
    finally { setBusy(false); }
  }

  async function renameType(t: ApiSupplierType) {
    const name = prompt("New name for this type:", t.name);
    if (!name || name.trim() === t.name) return;
    try { await updateSupplierType(t.id, { name: name.trim() }); await load(); }
    catch (e) { setErr(msg(e, "Could not rename.")); }
  }

  async function deleteType(t: ApiSupplierType) {
    if (!confirm(`Delete type "${t.name}"?`)) return;
    try { await removeSupplierType(t.id); await load(); }
    catch (e) { setErr(msg(e, "Could not delete.")); }
  }

  async function link() {
    if (!targetId || ticked.size === 0) return;
    setBusy(true); setErr(null); setOk(null);
    try {
      const r = await supplierLinkNames(targetId, [...ticked]);
      setOk(`Linked ${r.purchasesLinked} purchase(s)${r.creditsLinked ? ` + ${r.creditsLinked} credit(s)` : ""}.`);
      setTicked(new Set()); setTargetId("");
      await load();
    } catch (e) { setErr(msg(e, "Could not link those names.")); }
    finally { setBusy(false); }
  }

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Master Data · Suppliers"
        title="Supplier settings"
        blurb="Types are yours to shape (DEC-SUP-001) — the two seeded ones are the backbone and stay. Below: attach old free-text purchase names to real suppliers (DEC-SUP-007)."
      />
      {err && <ErrBar text={err} onClose={() => setErr(null)} />}
      {ok && (
        <div className="rounded-[12px] px-4 py-3 mb-4 text-[13px] font-medium" style={{ background: "#e8f7ef", color: "#0e7a3d" }}>{ok}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* ---------------- type master ---------------- */}
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4">
          <b className="text-[14px] text-purple block mb-3">Supplier types</b>
          {types.map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-2 border-b border-lavender-deep/60 last:border-0">
              <span className="text-[13px] text-body flex-1">
                {t.name}
                {t.isSystem && <span className="ml-2 text-[10.5px] px-1.5 py-0.5 rounded-full" style={{ background: "#f1eef4", color: "#8a7b96" }}>system</span>}
                {t.isFulfillment && <span className="ml-2 text-[10.5px] px-1.5 py-0.5 rounded-full" style={{ background: "#f9efe6", color: "#b5642f" }}>vendor</span>}
              </span>
              <span className="text-[11.5px] text-body-soft">{t._count?.suppliers ?? 0} supplier(s)</span>
              <button onClick={() => renameType(t)} className="text-body-soft hover:text-purple" title="Rename"><Icon name="edit" size={13} /></button>
              {!t.isSystem && (
                <button onClick={() => deleteType(t)} className="text-body-soft hover:text-purple" title="Delete"><Icon name="trash" size={13} /></button>
              )}
            </div>
          ))}
          <div className="flex gap-2 mt-3">
            <input className="ipt flex-1" placeholder="New type — e.g. Courier"
              value={newType} onChange={(e) => setNewType(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addType(); }} />
            <button onClick={addType} disabled={busy || !newType.trim()}
              className="text-white text-[13px] font-medium px-4 py-2 rounded-[10px] disabled:opacity-60" style={{ background: ACCENT }}>
              Add
            </button>
          </div>
          {/* DEC-SUP-009 — the behaviour pick; system rows' behaviour is locked */}
          <label className="flex items-center gap-2 text-[12.5px] text-body cursor-pointer select-none mt-2">
            <input type="checkbox" checked={newTypeVendor} onChange={(e) => setNewTypeVendor(e.target.checked)} />
            Fulfillment behaviour — lives in the Vendors workspace (cake-type: sourced per order)
          </label>
        </div>

        {/* ---------------- link tool ---------------- */}
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4">
          <b className="text-[14px] text-purple block mb-1">Unlinked purchase names</b>
          <p className="text-[12.5px] text-body-soft mt-0 mb-3">
            Purchases written before this module carried only a typed name. Tick the spellings that
            belong to one supplier, pick him, link — his ledger absorbs those bills.
          </p>
          {unlinked.length === 0 && <p className="text-[13px] text-body-soft m-0">All purchases are linked. ✅</p>}
          {unlinked.map((u) => (
            <label key={u.name} className="flex items-center gap-2.5 py-2 border-b border-lavender-deep/60 last:border-0 cursor-pointer select-none">
              <input type="checkbox" checked={ticked.has(u.name)}
                onChange={(e) => setTicked((p) => {
                  const n = new Set(p);
                  if (e.target.checked) n.add(u.name); else n.delete(u.name);
                  return n;
                })} />
              <span className="text-[13px] text-body flex-1 min-w-0 truncate">{u.name}</span>
              <span className="text-[11.5px] text-body-soft shrink-0">×{u.purchaseCount} · {formatTaka(u.totalPaisa)}</span>
            </label>
          ))}
          {unlinked.length > 0 && (
            <div className="mt-3 flex gap-2 items-center flex-wrap">
              <div className="flex-1 min-w-[190px]">
                <QuickSelect
                  value={targetId}
                  placeholder="Link to which supplier?"
                  onChange={setTargetId}
                  options={suppliers.map((s) => ({ id: s.id, label: s.nickname ? `${s.name} (${s.nickname})` : s.name }))}
                />
              </div>
              <button onClick={link} disabled={busy || !targetId || ticked.size === 0}
                className="text-white text-[13px] font-medium px-4 py-2.5 rounded-[10px] disabled:opacity-60" style={{ background: ACCENT }}>
                Link {ticked.size > 0 ? `${ticked.size} name(s)` : ""}
              </button>
            </div>
          )}
          <p className="text-[12px] text-body-soft mt-3 mb-0">
            No supplier yet for a name? <Link className="underline font-medium" style={{ color: ACCENT }} href="/suppliers/new">Create him first →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
