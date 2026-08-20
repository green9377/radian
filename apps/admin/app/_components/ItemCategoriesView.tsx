"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { WRAP, ACCENT, msg, ErrBar, OkBar, Modal, Field, StatusPill, OfflineBox, DataTable } from "./ItemUI";
import {
  listItemCategories, createItemCategory, updateItemCategory, deleteItemCategory,
  type ApiItemCategory,
} from "../_data/api";

/*
  Master Data · Items — ITEM CATEGORIES.

  Built to the exact shape of the ERP the owner already uses (sobuj, 21 Jul:
  "akdom simple oder moto kre banaw"):

      All Categories                                    [ Add New ]
      1  Fresh Flower (Raw)                        Active      ⋮
      2  Packaging                                 Active      ⋮

  Numbered rows, a search box, one "Add New" button, and a small dialog with
  Parent / Name. Nothing else — no KPI cards, no side panels, no explainer strips.
*/

const ROW = "grid grid-cols-[44px_minmax(0,1fr)_120px_90px_80px] items-center gap-2 px-4";

export default function ItemCategoriesView() {
  const [cats, setCats] = useState<ApiItemCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  // the dialog: null = closed, otherwise the row being edited (id null = new)
  const [dlg, setDlg] = useState<{ id: string | null; name: string; parentId: string } | null>(null);
  const [confirming, setConfirming] = useState<ApiItemCategory | null>(null);

  async function load() {
    setLoading(true);
    try { setCats(await listItemCategories()); setOffline(false); }
    catch { setCats([]); setOffline(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const tops = cats.filter((c) => !c.parentId);
  const nameOf = (id: string | null) => (id ? cats.find((c) => c.id === id)?.name ?? "—" : "Root");

  /* flat, in tree order — parent then its children, exactly like their list */
  const ordered: ApiItemCategory[] = [];
  for (const t of tops) {
    ordered.push(t);
    for (const k of cats.filter((c) => c.parentId === t.id)) ordered.push(k);
  }
  const rows = query.trim()
    ? ordered.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : ordered;

  async function save() {
    if (!dlg) return;
    const name = dlg.name.trim();
    if (!name) return;
    setBusy(true); setErr(null);
    try {
      if (dlg.id) {
        await updateItemCategory(dlg.id, { name, parentId: dlg.parentId || null });
        setOk("Saved.");
      } else {
        await createItemCategory({ name, parentId: dlg.parentId || null });
        setOk(`“${name}” added.`);
      }
      setDlg(null);
      await load();
    } catch (e) { setErr(msg(e, "Could not save.")); }
    finally { setBusy(false); }
  }

  async function toggle(c: ApiItemCategory) {
    setCats((p) => p.map((x) => (x.id === c.id ? { ...x, isActive: !x.isActive } : x)));
    try { await updateItemCategory(c.id, { isActive: !c.isActive }); }
    catch (e) { setErr(msg(e, "Could not save.")); await load(); }
  }

  function remove(c: ApiItemCategory) {
    const n = c._count?.items ?? 0;
    const kids = cats.filter((x) => x.parentId === c.id).length;
    if (n || kids) {
      setErr(
        `“${c.name}” cannot be deleted — ` +
        [n ? `${n} item${n === 1 ? "" : "s"} are in it` : "", kids ? `it has ${kids} sub-categor${kids === 1 ? "y" : "ies"}` : ""]
          .filter(Boolean).join(" and ") + ".",
      );
      return;
    }
    setConfirming(c); // house dialog, never window.confirm() (Phase 2 ruling)
  }

  async function doRemove() {
    const c = confirming;
    if (!c) return;
    setConfirming(null);
    setCats((p) => p.filter((x) => x.id !== c.id));
    try { await deleteItemCategory(c.id); }
    catch (e) { setErr(msg(e, "Could not delete.")); await load(); }
  }

  // The one-click "usual five" starter was removed on the owner's order (19 Aug):
  // no button anywhere may pour prepared data into a live database.

  return (
    <div className={WRAP}>
      {/* header — title left, Add New right. Their exact layout. */}
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div>
          <div className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: ACCENT }}>master data · items</div>
          <h1 className="font-display text-[26px] text-purple mt-1 mb-0 leading-tight">Item categories</h1>
        </div>
        <button onClick={() => setDlg({ id: null, name: "", parentId: "" })} disabled={offline}
          className="text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2 disabled:opacity-40"
          style={{ background: ACCENT }}>
          <Icon name="plus" size={15} /> Add New
        </button>
      </div>

      {offline && <OfflineBox onRetry={load} />}
      {err && <ErrBar text={err} onClose={() => setErr(null)} />}
      {ok && <OkBar text={ok} onClose={() => setOk(null)} />}

      {/* search */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <span className="text-[13px] text-body-soft">
          {loading ? "Loading…" : `${rows.length} categor${rows.length === 1 ? "y" : "ies"}`}
        </span>
        <div className="relative w-[260px] max-w-full">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-soft pointer-events-none"><Icon name="search" size={15} /></span>
          <input className="ipt ipt-icon w-full" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <DataTable
        head={<div className={ROW + " py-2.5"}><span>#</span><span>Name</span><span>Under</span><span>Status</span><span className="text-right">Action</span></div>}
      >
        {rows.map((c, i) => (
          <div key={c.id} className={ROW + " py-2.5 hover:bg-lavender/15"}>
            <span className="text-[13px] text-body-soft">{i + 1}</span>
            <span className={c.parentId ? "text-[13.5px] text-body pl-5" : "text-[14px] text-purple font-semibold"}>
              {c.parentId && <span className="text-body-soft mr-1.5">└</span>}
              {c.name}
              {(c._count?.items ?? 0) > 0 && (
                <span className="text-[12px] font-semibold ml-2 px-2 py-0.5 rounded-full align-middle"
                  style={{ background: "#f2e8f8", color: ACCENT }}>
                  {c._count!.items} item{c._count!.items === 1 ? "" : "s"}
                </span>
              )}
            </span>
            <span className="text-[13px] text-body-soft truncate">{c.parentId ? nameOf(c.parentId) : "Root"}</span>
            <StatusPill active={c.isActive} onClick={() => toggle(c)} />
            <span className="flex items-center justify-end gap-1">
              <button onClick={() => setDlg({ id: c.id, name: c.name, parentId: c.parentId ?? "" })}
                className="text-body-soft hover:text-purple px-1.5 py-1" title="Edit"><Icon name="edit" size={15} /></button>
              <button onClick={() => remove(c)}
                className="text-body-soft hover:text-[#c0392b] px-1.5 py-1" title="Delete"><Icon name="trash" size={15} /></button>
            </span>
          </div>
        ))}

        {!loading && rows.length === 0 && (
          <div className="text-center py-12 px-4">
            <div className="text-[14px] text-purple font-semibold">{query ? "Nothing matches" : "No categories yet — press Add New"}</div>
          </div>
        )}
      </DataTable>

      {/* ---- the dialog ---- */}
      {dlg && (
        <Modal
          title={dlg.id ? "Edit category" : "Add category"}
          onClose={() => setDlg(null)}
          onSave={save}
          canSave={!!dlg.name.trim()}
          busy={busy}
        >
          <Field label="Under">
            <select className="ipt w-full" value={dlg.parentId} onChange={(e) => setDlg({ ...dlg, parentId: e.target.value })}>
              <option value="">Root</option>
              {tops.filter((t) => t.id !== dlg.id).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Category name" required>
            <input autoFocus className="ipt w-full" placeholder="e.g. Fresh Flowers"
              value={dlg.name} onChange={(e) => setDlg({ ...dlg, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && dlg.name.trim()) save(); }} />
          </Field>
        </Modal>
      )}

      {confirming && (
        <Modal title={`Delete "${confirming.name}"?`} onClose={() => setConfirming(null)}
          canSave saveLabel="Delete the category" onSave={doRemove}>
          <p className="text-[13px] text-body m-0">
            Nothing is in it and it has no sub-categories, so nothing else changes.
          </p>
        </Modal>
      )}

    </div>
  );
}
