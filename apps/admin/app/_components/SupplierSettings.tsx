"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, ACCENT, ItemPageHead, ErrBar, QuickSelect, Modal, Field, DataTable, msg } from "./ItemUI";
import {
  listSupplierTypes, createSupplierType, updateSupplierType, removeSupplierType,
  supplierUnlinkedNames, supplierLinkNames, listSuppliers, formatTaka,
  type ApiSupplierType, type ApiSupplier,
} from "../_data/api";

/*
  Supplier settings — the type master (DEC-SUP-001: admin-configurable, never an
  enum) + the link tool (DEC-SUP-007: free-text purchase names → real supplier).
  Redesigned 19 Aug (owner): no prose, no field hints; rename/behaviour edits in
  a dialog instead of browser prompt().
*/

const ROW = "grid grid-cols-[minmax(0,1fr)_110px_90px_70px] items-center gap-2 px-4";

export default function SupplierSettings() {
  const [types, setTypes] = useState<ApiSupplierType[]>([]);
  const [unlinked, setUnlinked] = useState<{ name: string; purchaseCount: number; totalPaisa: number }[]>([]);
  const [suppliers, setSuppliers] = useState<ApiSupplier[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // the dialog: id null = new type
  const [dlg, setDlg] = useState<{ id: string | null; name: string; vendor: boolean; system: boolean } | null>(null);
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

  const dupName = !!dlg && !!dlg.name.trim() &&
    types.some((t) => t.id !== dlg.id && t.name.toLowerCase() === dlg.name.trim().toLowerCase());

  async function saveType() {
    if (!dlg || !dlg.name.trim() || dupName) return;
    setBusy(true); setErr(null);
    try {
      if (dlg.id) await updateSupplierType(dlg.id, { name: dlg.name.trim(), isFulfillment: dlg.vendor });
      else await createSupplierType({ name: dlg.name.trim(), isFulfillment: dlg.vendor });
      setDlg(null);
      await load();
    } catch (e) { setErr(msg(e, "Could not save the type.")); }
    finally { setBusy(false); }
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
        right={
          <button onClick={() => setDlg({ id: null, name: "", vendor: false, system: false })}
            className="text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2"
            style={{ background: ACCENT }}>
            <Icon name="plus" size={15} /> Add type
          </button>
        }
      />
      {err && <ErrBar text={err} onClose={() => setErr(null)} />}
      {ok && (
        <div className="rounded-[12px] px-4 py-3 mb-4 text-[13px] font-medium" style={{ background: "#1f3529", color: "#76efab" }}>{ok}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* ---------------- type master ---------------- */}
        <DataTable
          head={<div className={ROW + " py-2.5"}><span>Type</span><span>Behaviour</span><span>Suppliers</span><span className="text-right">Action</span></div>}
        >
          {types.map((t) => (
            <div key={t.id} className={ROW + " py-2.5 hover:bg-lavender/15"}>
              <span className="text-[13.5px] font-semibold text-purple truncate">
                {t.name}
                {t.isSystem && <span className="ml-2 text-[10.5px] font-medium px-1.5 py-0.5 rounded-full align-middle" style={{ background: "#29242e", color: "#aea4b7" }}>system</span>}
              </span>
              <span>
                {t.isFulfillment
                  ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#38291c", color: "#dda37d" }}>vendor</span>
                  : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#161f3a", color: "#7770eb" }}>supplier</span>}
              </span>
              <span className="text-[12.5px] font-medium text-body">{t._count?.suppliers ?? 0}</span>
              <span className="flex items-center justify-end gap-1">
                <button onClick={() => setDlg({ id: t.id, name: t.name, vendor: t.isFulfillment, system: !!t.isSystem })}
                  className="text-body-soft hover:text-purple px-1.5 py-1" title="Edit"><Icon name="edit" size={15} /></button>
                {!t.isSystem && (
                  <button onClick={() => deleteType(t)}
                    className="text-body-soft hover:text-[#e1837a] px-1.5 py-1" title="Delete"><Icon name="trash" size={15} /></button>
                )}
              </span>
            </div>
          ))}
          {types.length === 0 && (
            <div className="text-center py-10 text-[13.5px] text-purple font-semibold">No types yet — press Add type</div>
          )}
        </DataTable>

        {/* ---------------- link tool (DEC-SUP-007) ---------------- */}
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4">
          <b className="text-[14px] text-purple block mb-3">Unlinked purchase names</b>
          {unlinked.length === 0 && <p className="text-[13px] font-medium text-body m-0">All purchases are linked. ✅</p>}
          {unlinked.map((u) => (
            <label key={u.name} className="flex items-center gap-2.5 py-2 border-b border-lavender-deep/60 last:border-0 cursor-pointer select-none">
              <input type="checkbox" checked={ticked.has(u.name)}
                onChange={(e) => setTicked((p) => {
                  const n = new Set(p);
                  if (e.target.checked) n.add(u.name); else n.delete(u.name);
                  return n;
                })} />
              <span className="text-[13px] font-medium text-body flex-1 min-w-0 truncate">{u.name}</span>
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
              <Link className="text-[12.5px] underline font-medium shrink-0" style={{ color: ACCENT }} href="/suppliers/new">New supplier →</Link>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- add / edit dialog ---------------- */}
      {dlg && (
        <Modal
          title={dlg.id ? "Edit type" : "Add type"}
          onClose={() => setDlg(null)}
          onSave={saveType}
          canSave={!!dlg.name.trim() && !dupName}
          busy={busy}
        >
          <Field label="Type name" required>
            <input autoFocus className="ipt w-full" placeholder="e.g. Courier"
              value={dlg.name} onChange={(e) => setDlg({ ...dlg, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && dlg.name.trim() && !dupName) saveType(); }} />
            {dupName && (
              <span className="block text-[12.5px] font-semibold text-[#e1837a] mt-1">
                “{dlg.name.trim()}” already exists.
              </span>
            )}
          </Field>
          {/* DEC-SUP-009 — behaviour; locked on system rows */}
          <label className={"flex items-center gap-2 text-[13px] font-medium text-body select-none " + (dlg.system ? "opacity-50" : "cursor-pointer")}>
            <input type="checkbox" checked={dlg.vendor} disabled={dlg.system}
              onChange={(e) => setDlg({ ...dlg, vendor: e.target.checked })} />
            Vendor type — fulfilled per order, lives in the Vendors workspace
          </label>
        </Modal>
      )}
    </div>
  );
}
