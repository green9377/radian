"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, ACCENT, msg, ErrBar, OkBar, Modal, Field, StatusPill, OfflineBox, DataTable } from "./ItemUI";
import {
  listItemAttributes, createItemAttribute, updateItemAttribute, deleteItemAttribute,
  addItemAttrValue, updateItemAttrValue, deleteItemAttrValue,
  type ApiItemAttribute,
} from "../_data/api";

/*
  Master Data · Items — SIZES.  Its own screen (sobuj, 21 Jul: "color and size alada kro"),
  laid out like the Item Sizes list in the ERP he already uses:

      Sizes                                             [ Add New ]
      SIZE TYPE        ADDED SIZES                STATUS   ACTION
      Flower Vase      8", 6", 12"                 Active   ✎ 🗑
      Ribbon           1 Feet, 2 Feet, half inch   Active   ✎ 🗑

  A size TYPE groups the sizes that only make sense together — a vase is measured in
  inches, ribbon in feet, chocolate in grams. Add New opens a dialog with the type name
  and a stack of size rows.

  Colours live on their own screen; this one deliberately shows everything EXCEPT the
  colour list, so the two never mix.
*/

const ROW = "grid grid-cols-[210px_minmax(0,1fr)_90px_80px] items-center gap-3 px-4";

type Line = { id?: string; label: string };
type Dlg = { id: string | null; name: string; lines: Line[] };

export default function ItemSizesView() {
  const [attrs, setAttrs] = useState<ApiItemAttribute[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [dlgErr, setDlgErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ApiItemAttribute | null>(null);

  async function load() {
    setLoading(true);
    try {
      const all = await listItemAttributes();
      setAttrs(all.filter((a) => !/colou?r/i.test(a.name))); // colours have their own screen
      setOffline(false);
    } catch { setAttrs([]); setOffline(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const rows = query.trim()
    ? attrs.filter((a) =>
        a.name.toLowerCase().includes(query.trim().toLowerCase()) ||
        a.values.some((v) => v.label.toLowerCase().includes(query.trim().toLowerCase())))
    : attrs;

  /** live duplicate check, like every other master */
  const dupName =
    !!dlg?.name.trim() &&
    attrs.some((a) => a.id !== dlg.id && a.name.trim().toLowerCase() === dlg.name.trim().toLowerCase());

  async function save() {
    if (!dlg) return;
    const name = dlg.name.trim();
    if (!name) return;
    const lines = dlg.lines.filter((l) => l.label.trim());

    setBusy(true); setErr(null); setDlgErr(null);
    try {
      let id = dlg.id;
      if (id) {
        await updateItemAttribute(id, { name });
        const before = attrs.find((a) => a.id === id)?.values ?? [];
        const kept = new Set(lines.map((l) => l.id).filter(Boolean));
        for (const old of before) {
          if (!kept.has(old.id)) { try { await deleteItemAttrValue(old.id); } catch { /* in use */ } }
        }
      } else {
        id = (await createItemAttribute(name)).id;
      }

      for (const l of lines) {
        const label = l.label.trim();
        if (l.id) {
          const old = attrs.flatMap((a) => a.values).find((v) => v.id === l.id);
          if (old && old.label !== label) await updateItemAttrValue(l.id, { label });
        } else {
          try { await addItemAttrValue(id!, { label }); } catch { /* dupe */ }
        }
      }

      setOk(dlg.id ? "Saved." : `“${name}” added.`);
      setDlg(null);
      await load();
    } catch (e) {
      // inside the dialog — a banner behind the overlay cannot be read (20 Aug)
      setDlgErr(msg(e, "Could not save."));
    }
    finally { setBusy(false); }
  }

  async function toggle(a: ApiItemAttribute) {
    setAttrs((p) => p.map((x) => (x.id === a.id ? { ...x, isActive: !x.isActive } : x)));
    try { await updateItemAttribute(a.id, { isActive: !a.isActive }); }
    catch (e) { setErr(msg(e, "Could not save.")); await load(); }
  }

  function remove(a: ApiItemAttribute) {
    const used = a.values.reduce((n, v) => n + (v._count?.items ?? 0), 0);
    if (used > 0) { setErr(`“${a.name}” is on ${used} item(s). Take it off those first.`); return; }
    setConfirming(a); // house dialog, never window.confirm() (Phase 2 ruling)
  }

  async function doRemove() {
    const a = confirming;
    if (!a) return;
    setConfirming(null);
    setAttrs((p) => p.filter((x) => x.id !== a.id));
    try { await deleteItemAttribute(a.id); }
    catch (e) { setErr(msg(e, "Could not delete.")); await load(); }
  }

  // The one-click "usual four" starter was removed on the owner's order (19 Aug):
  // no button anywhere may pour prepared data into a live database.

  return (
    <div className={WRAP}>
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div>
          <div className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: ACCENT }}>master data · items</div>
          <h1 className="font-display text-[26px] text-purple mt-1 mb-0 leading-tight">Sizes</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/items/colors" className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] hover:border-orchid">Colours</Link>
          <button onClick={() => setDlg({ id: null, name: "", lines: [{ label: "" }] })} disabled={offline}
            className="text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2 disabled:opacity-40"
            style={{ background: ACCENT }}>
            <Icon name="plus" size={15} /> Add New
          </button>
        </div>
      </div>

      {offline && <OfflineBox onRetry={load} />}
      {err && <ErrBar text={err} onClose={() => setErr(null)} />}
      {ok && <OkBar text={ok} onClose={() => setOk(null)} />}

      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <span className="text-[13px] text-body-soft">
          {loading ? "Loading…" : `${rows.length} size type${rows.length === 1 ? "" : "s"}`}
        </span>
        <div className="relative w-[240px] max-w-full">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-soft pointer-events-none"><Icon name="search" size={15} /></span>
          <input className="ipt ipt-icon w-full" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <DataTable
        head={<div className={ROW + " py-2.5"}><span>Size type</span><span>Added sizes</span><span>Status</span><span className="text-right">Action</span></div>}
      >
        {rows.map((a) => (
          <div key={a.id} className={ROW + " py-3 hover:bg-lavender/15"}>
            <span className="text-[13.5px] text-purple font-semibold truncate">{a.name}</span>
            <span className="flex flex-wrap gap-1.5">
              {a.values.map((v) => (
                <span key={v.id} className="text-[12px] text-body bg-lavender/45 rounded-full px-2 py-0.5">{v.label}</span>
              ))}
              {a.values.length === 0 && <span className="text-[13px] text-body-soft">no sizes yet</span>}
            </span>
            <StatusPill active={a.isActive} onClick={() => toggle(a)} />
            <span className="flex items-center justify-end gap-1">
              <button onClick={() => setDlg({ id: a.id, name: a.name, lines: a.values.map((v) => ({ id: v.id, label: v.label })) })}
                className="text-body-soft hover:text-purple px-1.5 py-1" title="Edit"><Icon name="edit" size={15} /></button>
              <button onClick={() => remove(a)}
                className="text-body-soft hover:text-[#e1837a] px-1.5 py-1" title="Delete"><Icon name="trash" size={15} /></button>
            </span>
          </div>
        ))}

        {!loading && rows.length === 0 && (
          <div className="text-center py-12 px-4">
            <div className="text-[14px] text-purple font-semibold">{query ? "Nothing matches" : "No size types yet — press Add New"}</div>
          </div>
        )}
      </DataTable>

      {/* ---- dialog: type name + a stack of size rows ---- */}
      {dlg && (
        <Modal
          title={dlg.id ? "Edit size type" : "Add size type"}
          onClose={() => { setDlg(null); setDlgErr(null); }}
          onSave={save}
          canSave={!!dlg.name.trim() && !dupName}
          busy={busy}
        >
          {dlgErr && (
            <p className="text-[12.5px] text-[#e1837a] rounded-[10px] px-3 py-2 m-0"
              style={{ background: "#3b1a16" }}>{dlgErr}</p>
          )}
          <Field label="Size type name" required>
            <input autoFocus className="ipt w-full" placeholder="e.g. Flower Vase"
              value={dlg.name}
              onChange={(e) => { setDlg({ ...dlg, name: e.target.value }); setDlgErr(null); }} />
            {dupName && (
              <p className="text-[11.5px] text-[#e1837a] m-0 mt-1">
                &ldquo;{dlg.name.trim()}&rdquo; already exists.
              </p>
            )}
          </Field>

          <div className="border border-lavender-deep rounded-[12px] overflow-hidden">
            <div className="px-3 py-2 bg-lavender/40 th">
              Sizes
            </div>
            <div className="p-2 flex flex-col gap-2">
              {dlg.lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="ipt flex-1 min-w-0" style={{ minHeight: 36 }}
                    placeholder='e.g. 8"'
                    value={l.label}
                    onChange={(e) => setDlg({ ...dlg, lines: dlg.lines.map((x, k) => (k === i ? { label: e.target.value, id: x.id } : x)) })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); setDlg({ ...dlg, lines: [...dlg.lines, { label: "" }] }); }
                    }}
                  />
                  <button type="button" onClick={() => setDlg({ ...dlg, lines: dlg.lines.filter((_, k) => k !== i) })}
                    className="text-body-soft hover:text-[#e1837a] px-1 shrink-0"><Icon name="trash" size={14} /></button>
                </div>
              ))}
              <button type="button" onClick={() => setDlg({ ...dlg, lines: [...dlg.lines, { label: "" }] })}
                className="self-start text-[12.5px] font-medium px-3 py-1.5 rounded-[9px] border inline-flex items-center gap-1.5"
                style={{ borderColor: "#efe4f7", color: ACCENT }}>
                <Icon name="plus" size={13} /> Add size
              </button>
            </div>
          </div>

        </Modal>
      )}

      {confirming && (
        <Modal title={`Delete "${confirming.name}"?`} onClose={() => setConfirming(null)}
          canSave saveLabel="Delete the size type" onSave={doRemove}>
          <p className="text-[13px] text-body m-0">
            Its {confirming.values.length} size{confirming.values.length === 1 ? "" : "s"} go with it.
            No item carries them, so nothing else changes.
          </p>
        </Modal>
      )}
    </div>
  );
}
