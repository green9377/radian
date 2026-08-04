"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { WRAP, ACCENT, msg, ErrBar, OkBar, Modal, Field, StatusPill, OfflineBox, DataTable } from "./ItemUI";
import {
  listItemAttributes, createItemAttribute, updateItemAttribute, deleteItemAttribute,
  addItemAttrValue, updateItemAttrValue, deleteItemAttrValue,
  type ApiItemAttribute,
} from "../_data/api";

/*
  Master Data · Items — COLOUR & SIZE.

  Same shape as the ERP the owner already uses (their "Item Sizes" / "Item Attributes"
  screens), sobuj 21 Jul: "akdom simple oder moto kre banaw".

      Colour & size                                     [ Add New ]
      LABEL TYPE      VALUES                     STATUS   ACTION
      Colour          ●Red, ●White, ●Yellow      Active   ✎ 🗑
      Ribbon size     1 Feet, 2 Feet, 1 inch     Active   ✎ 🗑

  "Add New" opens their dialog: one type name, then a stack of value rows with an
  "Add value" button under them. One screen covers colour, size and anything else —
  their system needs three screens for the same idea.
*/

const ROW = "grid grid-cols-[190px_minmax(0,1fr)_90px_80px] items-center gap-3 px-4";
const SWATCHES = ["#c62828", "#fafafa", "#f9c623", "#e87ba4", "#ef7028", "#7a2ea8", "#2563a8", "#0e8f74", "#3b3b3b", "#8d6e3a"];

type Line = { id?: string; label: string; swatch: string | null };
type Dlg = { id: string | null; name: string; lines: Line[] };

export default function ItemAttributesView() {
  const [attrs, setAttrs] = useState<ApiItemAttribute[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState<Dlg | null>(null);

  async function load() {
    setLoading(true);
    try { setAttrs(await listItemAttributes()); setOffline(false); }
    catch { setAttrs([]); setOffline(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setDlg({ id: null, name: "", lines: [{ label: "", swatch: null }] });
  }
  function openEdit(a: ApiItemAttribute) {
    setDlg({
      id: a.id,
      name: a.name,
      lines: a.values.map((v) => ({ id: v.id, label: v.label, swatch: v.swatch ?? null })),
    });
  }

  /* Save writes the type first, then every value line. Existing lines are updated,
     new ones added, removed ones deleted — so the dialog behaves like a form, not
     like a series of separate saves. */
  async function save() {
    if (!dlg) return;
    const name = dlg.name.trim();
    if (!name) return;
    const lines = dlg.lines.filter((l) => l.label.trim());

    setBusy(true); setErr(null);
    try {
      let attrId = dlg.id;
      if (attrId) {
        await updateItemAttribute(attrId, { name });
        const before = attrs.find((a) => a.id === attrId)?.values ?? [];
        const keptIds = new Set(lines.map((l) => l.id).filter(Boolean));
        for (const old of before) {
          if (!keptIds.has(old.id)) {
            try { await deleteItemAttrValue(old.id); } catch { /* in use — leave it */ }
          }
        }
      } else {
        const created = await createItemAttribute(name);
        attrId = created.id;
      }

      for (const l of lines) {
        const label = l.label.trim();
        if (l.id) {
          const old = attrs.flatMap((a) => a.values).find((v) => v.id === l.id);
          if (old && (old.label !== label || (old.swatch ?? null) !== l.swatch)) {
            await updateItemAttrValue(l.id, { label, swatch: l.swatch });
          }
        } else {
          try { await addItemAttrValue(attrId!, { label, swatch: l.swatch }); } catch { /* dupe */ }
        }
      }

      setOk(dlg.id ? "Saved." : `“${name}” added.`);
      setDlg(null);
      await load();
    } catch (e) { setErr(msg(e, "Could not save.")); }
    finally { setBusy(false); }
  }

  async function toggle(a: ApiItemAttribute) {
    setAttrs((p) => p.map((x) => (x.id === a.id ? { ...x, isActive: !x.isActive } : x)));
    try { await updateItemAttribute(a.id, { isActive: !a.isActive }); }
    catch (e) { setErr(msg(e, "Could not save.")); await load(); }
  }

  async function remove(a: ApiItemAttribute) {
    const used = a.values.reduce((n, v) => n + (v._count?.items ?? 0), 0);
    if (used > 0) { setErr(`“${a.name}” is on ${used} item(s). Take it off those first.`); return; }
    if (!confirm(`Delete “${a.name}” and its values?`)) return;
    setAttrs((p) => p.filter((x) => x.id !== a.id));
    try { await deleteItemAttribute(a.id); }
    catch (e) { setErr(msg(e, "Could not delete.")); await load(); }
  }

  /** Colour (8 shades) + Size (4) in one click */
  async function quickStart() {
    setBusy(true); setErr(null);
    const seed: [string, { label: string; swatch?: string }[]][] = [
      ["Colour", [
        { label: "Red", swatch: "#c62828" }, { label: "White", swatch: "#fafafa" },
        { label: "Yellow", swatch: "#f9c623" }, { label: "Pink", swatch: "#e87ba4" },
        { label: "Orange", swatch: "#ef7028" }, { label: "Purple", swatch: "#7a2ea8" },
        { label: "Blue", swatch: "#2563a8" }, { label: "Mixed" },
      ]],
      ["Size", [{ label: "Small" }, { label: "Medium" }, { label: "Large" }, { label: "Extra Large" }]],
    ];
    try {
      for (const [name, values] of seed) {
        const a = await createItemAttribute(name);
        for (const v of values) {
          try { await addItemAttrValue(a.id, { label: v.label, swatch: v.swatch ?? null }); } catch { /* dupe */ }
        }
      }
      setOk("Colour and Size are ready.");
      await load();
    } catch (e) { setErr(msg(e, "Could not create them.")); }
    finally { setBusy(false); }
  }

  const isColourDlg = !!dlg && /colou?r/i.test(dlg.name);

  return (
    <div className={WRAP}>
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div>
          <div className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: ACCENT }}>master data · items</div>
          <h1 className="font-display text-[26px] text-purple mt-1 mb-0 leading-tight">Colour &amp; size</h1>
        </div>
        <button onClick={openNew} disabled={offline}
          className="text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2 disabled:opacity-40"
          style={{ background: ACCENT }}>
          <Icon name="plus" size={15} /> Add New
        </button>
      </div>

      {offline && <OfflineBox onRetry={load} />}
      {err && <ErrBar text={err} onClose={() => setErr(null)} />}
      {ok && <OkBar text={ok} onClose={() => setOk(null)} />}

      <div className="text-[13px] text-body-soft mb-3">
        {loading ? "Loading…" : `${attrs.length} label type${attrs.length === 1 ? "" : "s"}`}
      </div>

      <DataTable
        head={<div className={ROW + " py-2.5"}><span>Label type</span><span>Values</span><span>Status</span><span className="text-right">Action</span></div>}
      >
        {attrs.map((a) => (
          <div key={a.id} className={ROW + " py-3 hover:bg-lavender/15"}>
            <span className="text-[13.5px] text-purple font-semibold truncate">{a.name}</span>

            <span className="flex flex-wrap gap-1.5">
              {a.values.map((v) => (
                <span key={v.id} className="inline-flex items-center gap-1.5 text-[12px] text-body bg-lavender/45 rounded-full pl-1.5 pr-2 py-0.5">
                  {v.swatch && <span className="w-[12px] h-[12px] rounded-full border border-lavender-deep" style={{ background: v.swatch }} />}
                  {v.label}
                </span>
              ))}
              {a.values.length === 0 && <span className="text-[13px] text-body-soft">no values yet</span>}
            </span>

            <StatusPill active={a.isActive} onClick={() => toggle(a)} />

            <span className="flex items-center justify-end gap-1">
              <button onClick={() => openEdit(a)} className="text-body-soft hover:text-purple px-1.5 py-1" title="Edit"><Icon name="edit" size={15} /></button>
              <button onClick={() => remove(a)} className="text-body-soft hover:text-[#c0392b] px-1.5 py-1" title="Delete"><Icon name="trash" size={15} /></button>
            </span>
          </div>
        ))}

        {!loading && attrs.length === 0 && (
          <div className="text-center py-12 px-4">
            <div className="text-[14px] text-purple font-medium">Nothing here yet</div>
            {!offline && (
              <>
                <p className="text-[13px] text-body-soft m-0 mt-1 mb-3">Most shops only need Colour and Size.</p>
                <button onClick={quickStart} disabled={busy}
                  className="text-white text-[13px] font-medium px-4 py-2 rounded-[10px] inline-flex items-center gap-2 disabled:opacity-60"
                  style={{ background: ACCENT }}>
                  <Icon name="download" size={14} /> {busy ? "Creating…" : "Add Colour & Size"}
                </button>
              </>
            )}
          </div>
        )}
      </DataTable>

      {/* ---- their dialog: one name, then a stack of value rows ---- */}
      {dlg && (
        <Modal
          title={dlg.id ? "Edit label type" : "Add label type"}
          onClose={() => setDlg(null)}
          onSave={save}
          canSave={!!dlg.name.trim()}
          busy={busy}
          wide
        >
          <Field label="Label type name" required hint="Colour · Size · Grade · Ribbon size — whatever you sort by.">
            <input autoFocus className="ipt w-full" placeholder="e.g. Colour"
              value={dlg.name} onChange={(e) => setDlg({ ...dlg, name: e.target.value })} />
          </Field>

          <div className="border border-lavender-deep rounded-[12px] overflow-hidden">
            <div className="px-3 py-2 bg-lavender/40 th">
              Values
            </div>

            <div className="p-2 flex flex-col gap-2">
              {dlg.lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="ipt flex-1 min-w-0" style={{ minHeight: 36 }}
                    placeholder={isColourDlg ? "e.g. Red" : "e.g. Large"}
                    value={l.label}
                    onChange={(e) => setDlg({ ...dlg, lines: dlg.lines.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setDlg({ ...dlg, lines: [...dlg.lines, { label: "", swatch: null }] });
                      }
                    }}
                  />

                  {isColourDlg && (
                    <span className="flex items-center gap-1 shrink-0">
                      {SWATCHES.map((c) => (
                        <button key={c} type="button"
                          onClick={() => setDlg({ ...dlg, lines: dlg.lines.map((x, k) => (k === i ? { ...x, swatch: x.swatch === c ? null : c } : x)) })}
                          className="w-[17px] h-[17px] rounded-full border-2"
                          style={{ background: c, borderColor: l.swatch === c ? ACCENT : "#e3d7ec" }} title={c} />
                      ))}
                    </span>
                  )}

                  <button type="button"
                    onClick={() => setDlg({ ...dlg, lines: dlg.lines.filter((_, k) => k !== i) })}
                    className="text-body-soft hover:text-[#c0392b] px-1 shrink-0">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}

              <button type="button"
                onClick={() => setDlg({ ...dlg, lines: [...dlg.lines, { label: "", swatch: null }] })}
                className="self-start text-[12.5px] font-medium px-3 py-1.5 rounded-[9px] border inline-flex items-center gap-1.5"
                style={{ borderColor: "#efe4f7", color: ACCENT }}>
                <Icon name="plus" size={13} /> Add value
              </button>
            </div>
          </div>

          <p className="text-[13px] text-body-soft m-0 mt-2.5">
            Press Enter in a box to open the next one. Empty boxes are ignored.
          </p>
        </Modal>
      )}

      <p className="text-[13px] text-body-soft mt-3">
        Used on <b>New item → Several variants</b>: type &ldquo;Rose&rdquo;, tick Red / Yellow / White, get three items at once.
      </p>
    </div>
  );
}
