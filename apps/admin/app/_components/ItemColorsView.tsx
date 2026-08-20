"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, ACCENT, msg, ErrBar, OkBar, Modal, Field, StatusPill, OfflineBox, DataTable } from "./ItemUI";
import {
  listItemAttributes, createItemAttribute,
  addItemAttrValue, updateItemAttrValue, deleteItemAttrValue,
  type ApiItemAttribute, type ApiItemAttrValue,
} from "../_data/api";

/*
  Master Data · Items — COLOURS.  Its own screen (sobuj, 21 Jul: "color and size alada
  kro"), laid out like the Colors list in the ERP he already uses:

      Colours                                          [ Add New ]
      COLOUR CODE      NAME            STATUS   ACTION
      ▬▬▬ (pill)       Red             Active   ✎ 🗑
      ▬▬▬              Baby Pink       Active   ✎ 🗑

  Add New opens a dialog with a name, a swatch grid to click, AND a hex box you can
  paste a code into — the picker and the code stay in sync both ways.

  ⚠️ Colours are RADIAN's own brand-neutral list. The screen chrome uses Radian brand
  colours (purple/orchid/lavender); the swatches below are the shop's stock colours and
  have nothing to do with either brand.

  Under the hood these are the values of a single ItemAttribute called "Colour"
  (DEC-ITM-015) — the screen creates it silently the first time, so nobody has to know.
*/

const ROW = "grid grid-cols-[120px_minmax(0,1fr)_100px_90px_80px] items-center gap-3 px-4";

/** the shop's usual stock colours — clicking one fills both the swatch and the code */
const PRESET: { label: string; hex: string }[] = [
  { label: "Red", hex: "#e0203c" }, { label: "Maroon", hex: "#7d0d1c" },
  { label: "Pink", hex: "#f472b6" }, { label: "Baby Pink", hex: "#f9c2d4" },
  { label: "Orange", hex: "#f59022" }, { label: "Yellow", hex: "#f5c518" },
  { label: "Gold", hex: "#c9a227" }, { label: "Green", hex: "#22c55e" },
  { label: "Olive", hex: "#7c8b1c" }, { label: "Sky Blue", hex: "#4aa8e0" },
  { label: "Blue", hex: "#2563a8" }, { label: "Navy Blue", hex: "#141c5c" },
  { label: "Purple", hex: "#8b21c9" }, { label: "White", hex: "#ffffff" },
  { label: "Silver", hex: "#c7c7c7" }, { label: "Grey", hex: "#8a8a8a" },
  { label: "Brown", hex: "#8b4a17" }, { label: "Black", hex: "#111111" },
];

const COLOUR_ATTR = "Colour";
const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v.trim());

export default function ItemColorsView() {
  const [attr, setAttr] = useState<ApiItemAttribute | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [dlg, setDlg] = useState<{ id: string | null; label: string; hex: string } | null>(null);
  const [dlgErr, setDlgErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ApiItemAttrValue | null>(null);

  async function load() {
    setLoading(true);
    try {
      const all = await listItemAttributes();
      setAttr(all.find((a) => /colou?r/i.test(a.name)) ?? null);
      setOffline(false);
    } catch { setAttr(null); setOffline(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  /** the "Colour" holder is an implementation detail — make it on demand, silently */
  async function ensureAttr(): Promise<string> {
    if (attr) return attr.id;
    const created = await createItemAttribute(COLOUR_ATTR);
    setAttr(created);
    return created.id;
  }

  const colours: ApiItemAttrValue[] = (attr?.values ?? []).filter(
    (v) => !query.trim() || v.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  /** live duplicate check — the same list the server checks against */
  const dupLabel =
    !!dlg?.label.trim() &&
    (attr?.values ?? []).some(
      (v) => v.id !== dlg.id && v.label.trim().toLowerCase() === dlg.label.trim().toLowerCase(),
    );

  async function save() {
    if (!dlg) return;
    const label = dlg.label.trim();
    if (!label) return;
    const hex = isHex(dlg.hex) ? dlg.hex.trim().toLowerCase() : null;

    setBusy(true); setErr(null); setDlgErr(null);
    try {
      if (dlg.id) {
        await updateItemAttrValue(dlg.id, { label, swatch: hex });
        setOk("Saved.");
      } else {
        await addItemAttrValue(await ensureAttr(), { label, swatch: hex });
        setOk(`“${label}” added.`);
      }
      setDlg(null);
      await load();
    } catch (e) {
      // the failure belongs INSIDE the dialog — a banner behind the overlay is
      // unreadable, and the owner cannot see what to change (20 Aug)
      setDlgErr(msg(e, "Could not save."));
    }
    finally { setBusy(false); }
  }

  async function toggle(v: ApiItemAttrValue) {
    const next = !(v.isActive ?? true);
    setAttr((a) => (a ? { ...a, values: a.values.map((x) => (x.id === v.id ? { ...x, isActive: next } : x)) } : a));
    try { await updateItemAttrValue(v.id, { isActive: next }); }
    catch (e) { setErr(msg(e, "Could not save.")); await load(); }
  }

  function remove(v: ApiItemAttrValue) {
    const used = v._count?.items ?? 0;
    if (used > 0) { setErr(`“${v.label}” is on ${used} item(s). Take it off those first.`); return; }
    setConfirming(v); // house dialog, never window.confirm() (Phase 2 ruling)
  }

  async function doRemove() {
    const v = confirming;
    if (!v) return;
    setConfirming(null);
    setAttr((a) => (a ? { ...a, values: a.values.filter((x) => x.id !== v.id) } : a));
    try { await deleteItemAttrValue(v.id); }
    catch (e) { setErr(msg(e, "Could not delete.")); await load(); }
  }

  // The one-click "usual colours" bulk-insert was removed on the owner's order
  // (19 Aug): no button anywhere may pour prepared data into a live database.
  // PRESET stays — in the dialog it only fills the form, it writes nothing.

  return (
    <div className={WRAP}>
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div>
          <div className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: ACCENT }}>master data · items</div>
          <h1 className="font-display text-[26px] text-purple mt-1 mb-0 leading-tight">Colours</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/items/sizes" className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] hover:border-orchid">Sizes</Link>
          <button onClick={() => setDlg({ id: null, label: "", hex: "#e0203c" })} disabled={offline}
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
          {loading ? "Loading…" : `${colours.length} colour${colours.length === 1 ? "" : "s"}`}
        </span>
        <div className="relative w-[240px] max-w-full">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-soft pointer-events-none"><Icon name="search" size={15} /></span>
          <input className="ipt ipt-icon w-full" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <DataTable
        head={<div className={ROW + " py-2.5"}><span>Colour</span><span>Name</span><span>Code</span><span>Status</span><span className="text-right">Action</span></div>}
      >
        {colours.map((v) => (
          <div key={v.id} className={ROW + " py-2.5 hover:bg-lavender/15"}>
            <span className="h-[22px] w-[86px] rounded-full border border-lavender-deep"
              style={{ background: v.swatch ?? "repeating-linear-gradient(45deg,#f3eef7,#f3eef7 5px,#e6dcee 5px,#e6dcee 10px)" }} />
            <span className="text-[13.5px] text-purple font-medium truncate">{v.label}</span>
            <span className="text-[13px] text-body-soft font-mono">{v.swatch ?? "—"}</span>
            <StatusPill active={v.isActive ?? true} onClick={() => toggle(v)} />
            <span className="flex items-center justify-end gap-1">
              <button onClick={() => setDlg({ id: v.id, label: v.label, hex: v.swatch ?? "#e0203c" })}
                className="text-body-soft hover:text-purple px-1.5 py-1" title="Edit"><Icon name="edit" size={15} /></button>
              <button onClick={() => remove(v)}
                className="text-body-soft hover:text-[#c0392b] px-1.5 py-1" title="Delete"><Icon name="trash" size={15} /></button>
            </span>
          </div>
        ))}

        {!loading && colours.length === 0 && (
          <div className="text-center py-12 px-4">
            <div className="text-[14px] text-purple font-semibold">{query ? "Nothing matches" : "No colours yet — press Add New"}</div>
          </div>
        )}
      </DataTable>

      {/* ---- dialog: name + swatch grid + hex code, kept in sync ---- */}
      {dlg && (
        <Modal
          title={dlg.id ? "Edit colour" : "Add colour"}
          onClose={() => { setDlg(null); setDlgErr(null); }}
          onSave={save}
          canSave={!!dlg.label.trim() && !dupLabel}
          busy={busy}
          wide
        >
          {dlgErr && (
            <p className="text-[12.5px] text-[#c0392b] rounded-[10px] px-3 py-2 m-0"
              style={{ background: "#fdecea" }}>{dlgErr}</p>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-4 items-start">
            <div>
              <Field label="Colour name" required>
                <input autoFocus className="ipt w-full" placeholder="e.g. Baby Pink"
                  value={dlg.label}
                  onChange={(e) => { setDlg({ ...dlg, label: e.target.value }); setDlgErr(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && dlg.label.trim() && !dupLabel) save(); }} />
                {/* caught while typing, like every other master (Phase 2) */}
                {dupLabel && (
                  <p className="text-[11.5px] text-[#c0392b] m-0 mt-1">
                    &ldquo;{dlg.label.trim()}&rdquo; is already in the list.
                  </p>
                )}
              </Field>

              <Field label="Colour code">
                <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 items-center">
                  <input type="color" className="w-[42px] h-[38px] rounded-[9px] border border-lavender-deep bg-white p-1 cursor-pointer"
                    value={isHex(dlg.hex) ? dlg.hex : "#ffffff"}
                    onChange={(e) => setDlg({ ...dlg, hex: e.target.value })} />
                  <input className="ipt w-full font-mono" placeholder="#e0203c"
                    value={dlg.hex} onChange={(e) => setDlg({ ...dlg, hex: e.target.value })} />
                </div>
                {dlg.hex.trim() !== "" && !isHex(dlg.hex) && (
                  <p className="text-[11.5px] text-[#c0392b] m-0 mt-1">
                    That is not a colour code. It should look like <b>#e0203c</b> — a # and six letters/numbers.
                  </p>
                )}
              </Field>
            </div>

            <div>
              <div className="text-[12px] font-semibold text-purple mb-1">Preview</div>
              <div className="h-[74px] rounded-[12px] border border-lavender-deep"
                style={{ background: isHex(dlg.hex) ? dlg.hex : "repeating-linear-gradient(45deg,#f3eef7,#f3eef7 5px,#e6dcee 5px,#e6dcee 10px)" }} />
            </div>
          </div>

          <div className="mt-1">
            <div className="text-[12px] font-semibold text-purple mb-1.5">Or pick a usual one</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET.map((c) => (
                <button key={c.hex} type="button"
                  /*  clicking a preset renames too, unless the owner typed a name of
                      his own (owner, 20 Aug: picked another swatch and the old preset
                      name stayed, so the row read "Pink" in sky blue)  */
                  onClick={() => {
                    const typedOwnName =
                      dlg.label.trim() !== "" &&
                      !PRESET.some((p) => p.label.toLowerCase() === dlg.label.trim().toLowerCase());
                    setDlg({ ...dlg, hex: c.hex, label: typedOwnName ? dlg.label : c.label });
                    setDlgErr(null);
                  }}
                  title={`${c.label} · ${c.hex}`}
                  className="w-[30px] h-[30px] rounded-full border-2"
                  style={{ background: c.hex, borderColor: dlg.hex.toLowerCase() === c.hex ? ACCENT : "#efe4f7" }} />
              ))}
            </div>
          </div>
        </Modal>
      )}

      {confirming && (
        <Modal title={`Delete "${confirming.label}"?`} onClose={() => setConfirming(null)}
          canSave saveLabel="Delete the colour" onSave={doRemove}>
          <p className="text-[13px] text-body m-0">
            No item carries this colour, so nothing else changes.
          </p>
        </Modal>
      )}

    </div>
  );
}
