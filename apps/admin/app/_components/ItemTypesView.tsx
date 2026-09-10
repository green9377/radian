"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { WRAP, ACCENT, msg, ItemPageHead, ErrBar, OkBar, Modal, Field, StatusPill, OfflineBox, DataTable } from "./ItemUI";
import {
  listItemTypes, createItemType, updateItemType, deleteItemType,
  ITEM_TYPE_META,
  type ApiItemTypeRow, type ItemType,
} from "../_data/api";
import { TypeKindFields, deriveBehaviour } from "./ItemEditor";

/*
  Item TYPES master — DEC-ITM-017. The five system rows are the anchors the stock and
  costing rules read (behaviour frozen, cannot be deleted or switched off). Custom rows
  are the owner's own vocabulary on top; each must say which of the five it behaves
  like, and changing that re-stamps every item carrying the label (server-side).
  Deleting is refused while items point at the type.
*/

const ROW = "grid grid-cols-[minmax(160px,1fr)_150px_90px_90px_110px] items-center gap-3 px-4 py-3";

type Dlg = {
  id: string | null; name: string; behaviour: ItemType; colour: string | null; isSystem: boolean;
  // create only — the owner's model (20 Aug): its own kind, or works like an existing one
  kind: "own" | "like"; counted: boolean; recipe: boolean;
};

const SWATCHES = ["#0e8f74", "#8b21c9", "#b5642f", "#8a6d1f", "#2563a8", "#c0392b", "#cf43ea", "#470066"];

export default function ItemTypesView() {
  const [rows, setRows] = useState<ApiItemTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [dlgErr, setDlgErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ApiItemTypeRow | null>(null);

  async function load() {
    setLoading(true);
    try { setRows(await listItemTypes()); setOffline(false); }
    catch { setRows([]); setOffline(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // live duplicate check while typing — same pattern as every Phase 2 master
  const dupOf = (name: string, id: string | null) =>
    rows.some((r) => r.id !== id && r.name.trim().toLowerCase() === name.trim().toLowerCase());

  async function save() {
    if (!dlg) return;
    const name = dlg.name.trim();
    if (!name) { setDlgErr("Give the type a name."); return; }
    if (dupOf(name, dlg.id)) { setDlgErr(`"${name}" already exists.`); return; }
    setBusy(true); setDlgErr(null);
    const behaviour = dlg.kind === "own" ? deriveBehaviour(dlg.counted, dlg.recipe) : dlg.behaviour;
    try {
      if (dlg.id) await updateItemType(dlg.id, { name, behaviour: dlg.isSystem ? undefined : dlg.behaviour, colour: dlg.colour });
      else await createItemType({ name, behaviour, colour: dlg.colour ?? ITEM_TYPE_META[behaviour].colour });
      setOk(dlg.id ? "Saved." : `"${name}" added.`);
      setDlg(null);
      await load();
    } catch (e) { setDlgErr(msg(e, "Could not save the type.")); }
    finally { setBusy(false); }
  }

  async function toggleActive(t: ApiItemTypeRow) {
    try { await updateItemType(t.id, { isActive: !(t.isActive ?? true) }); await load(); }
    catch (e) { setErr(msg(e, "Could not save.")); }
  }

  async function doDelete() {
    if (!confirming) return;
    setBusy(true); setErr(null);
    try {
      await deleteItemType(confirming.id);
      setOk(`"${confirming.name}" deleted.`);
      setConfirming(null);
      await load();
    } catch (e) { setErr(msg(e, "Could not delete the type.")); setConfirming(null); }
    finally { setBusy(false); }
  }

  const toneOf = (t: ApiItemTypeRow) => t.colour ?? ITEM_TYPE_META[t.behaviour].colour;

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="master data · items"
        title="Item types"
        right={
          <button onClick={() => { setDlgErr(null); setDlg({ id: null, name: "", behaviour: "RAW", colour: null, isSystem: false, kind: "own", counted: true, recipe: false }); }}
            className="text-white text-[13px] font-medium px-4 py-2.5 rounded-[10px] inline-flex items-center gap-2"
            style={{ background: ACCENT }}>
            <Icon name="plus" size={13} /> New type
          </button>
        }
      />
      {offline && <OfflineBox onRetry={load} />}
      {err && <ErrBar text={err} onClose={() => setErr(null)} />}
      {ok && <OkBar text={ok} onClose={() => setOk(null)} />}

      <DataTable head={
        <div className={ROW + " text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95"}>
          <span>Type</span><span>What it does</span><span>Items</span><span>Status</span><span className="text-right">Action</span>
        </div>
      }>
        {loading && <div className="px-4 py-6 text-[13px] text-body-soft">Loading…</div>}
        {rows.map((t) => {
          const m = ITEM_TYPE_META[t.behaviour];
          return (
            <div key={t.id} className={ROW}>
              <span className="flex items-center gap-2.5 min-w-0">
                <span className="w-[14px] h-[14px] rounded-full shrink-0" style={{ background: toneOf(t) }} />
                <span className="text-[13.5px] font-semibold text-body truncate">{t.name}</span>
                {t.isSystem && (
                  <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ background: "#29242e", color: "#aea4b7" }}>built-in</span>
                )}
              </span>
              {/* a custom type is its own kind — say what it DOES in plain words,
                  not which built-in it secretly maps to */}
              <span className="text-[12px] font-semibold px-2 py-1 rounded-full justify-self-start"
                style={{ background: m.bg, color: m.colour }}>
                {t.isSystem
                  ? m.label
                  : t.behaviour === "SERVICE"
                    ? "Not counted in stock"
                    : t.behaviour === "FINISHED"
                      ? "Counted · has recipes"
                      : "Counted in stock"}
              </span>
              <span className="text-[13px] text-body-soft">{t._count?.items ?? 0}</span>
              <span>
                {t.isSystem
                  ? <span className="text-[11px] font-semibold px-2 py-1 rounded-full" style={{ background: "#20332e", color: "#74f1d7" }}>Active</span>
                  : <StatusPill active={t.isActive ?? true} onClick={() => toggleActive(t)} />}
              </span>
              <span className="flex gap-2 justify-self-end">
                <button onClick={() => { setDlgErr(null); setDlg({ id: t.id, name: t.name, behaviour: t.behaviour, colour: t.colour ?? null, isSystem: t.isSystem, kind: "like", counted: true, recipe: false }); }}
                  className="text-[12px] font-medium px-2.5 py-1.5 rounded-[8px] border border-lavender-deep text-purple hover:border-orchid">
                  Edit
                </button>
                {!t.isSystem && (
                  <button onClick={() => setConfirming(t)} disabled={busy}
                    className="text-[12px] font-medium px-2.5 py-1.5 rounded-[8px] border text-[#e1837a] disabled:opacity-40"
                    style={{ borderColor: "#4d312d" }}>
                    Delete
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </DataTable>

      {/* ---------------- create / edit ---------------- */}
      {dlg && (
        <Modal title={dlg.id ? `Edit ${dlg.name || "type"}` : "New item type"} onClose={() => setDlg(null)}
          canSave={!!dlg.name.trim() && !dupOf(dlg.name, dlg.id)} busy={busy}
          saveLabel={dlg.id ? "Save" : "Add type"} onSave={save}>
          <Field label="Name" required>
            <input className="ipt w-full" autoFocus placeholder="Dry Flower, Imported Chocolate…"
              value={dlg.name}
              onChange={(e) => { setDlg({ ...dlg, name: e.target.value }); setDlgErr(null); }} />
            {dlg.name.trim() && dupOf(dlg.name, dlg.id) && (
              <p className="text-[12px] text-[#e1837a] m-0 mt-1">&ldquo;{dlg.name.trim()}&rdquo; already exists.</p>
            )}
          </Field>
          {dlg.id === null ? (
            <TypeKindFields
              kind={dlg.kind} setKind={(k) => setDlg({ ...dlg, kind: k })}
              counted={dlg.counted} setCounted={(v) => setDlg({ ...dlg, counted: v })}
              recipe={dlg.recipe} setRecipe={(v) => setDlg({ ...dlg, recipe: v })}
              behaviour={dlg.behaviour} setBehaviour={(b) => setDlg({ ...dlg, behaviour: b })}
            />
          ) : (
            <Field label="Behaves like" required>
              {dlg.isSystem ? (
                <p className="text-[12.5px] text-body-soft m-0">
                  {ITEM_TYPE_META[dlg.behaviour].label} — a built-in type&apos;s behaviour cannot change.
                </p>
              ) : (
                <div className="flex gap-1.5 flex-wrap">
                  {(Object.keys(ITEM_TYPE_META) as ItemType[]).map((b) => {
                    const m = ITEM_TYPE_META[b];
                    const on = dlg.behaviour === b;
                    return (
                      <button key={b} type="button" onClick={() => setDlg({ ...dlg, behaviour: b })} title={m.blurb}
                        className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] border-2"
                        style={on
                          ? { background: m.colour, borderColor: m.colour, color: "#fff" }
                          : { background: "#fff", borderColor: "#403149", color: m.colour }}>
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </Field>
          )}
          <Field label="Colour">
            <div className="flex gap-2 flex-wrap items-center">
              {SWATCHES.map((c) => (
                <button key={c} type="button" onClick={() => setDlg({ ...dlg, colour: dlg.colour === c ? null : c })}
                  className="w-[26px] h-[26px] rounded-full border-2"
                  style={{ background: c, borderColor: dlg.colour === c ? "#2c0f3d" : "#3f3248" }} />
              ))}
            </div>
          </Field>
          {dlgErr && <p className="text-[12.5px] text-[#e1837a] m-0">{dlgErr}</p>}
        </Modal>
      )}

      {/* ---------------- delete confirm ---------------- */}
      {confirming && (
        <Modal title={`Delete "${confirming.name}"?`} onClose={() => setConfirming(null)}
          canSave busy={busy} saveLabel="Delete the type" onSave={doDelete}>
          <p className="text-[13px] text-body m-0">
            {(confirming._count?.items ?? 0) > 0
              ? `${confirming._count!.items} item${confirming._count!.items === 1 ? "" : "s"} still carry this type — the delete will be refused until they are moved.`
              : "No items carry this type. It can be removed."}
          </p>
        </Modal>
      )}
    </div>
  );
}
