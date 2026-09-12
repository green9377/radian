"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { backdropClose } from "./backdropClose";
import Icon from "./Icon";
import {
  loadUnitsSafe, createUnit, updateUnit, deleteUnit,
  unitCode, resolveUnitRoot, getUnitUsage, moveItemToUnit, moveProductToUnit, moveUnitBase,
  type ApiUnit, type UnitUsage,
} from "../_data/api";

/*
  Master Data · Units — LIVE flat manager (DEC-PRD-009). Lives under Items in the nav.

  A unit knows what SMALLER unit it breaks down into:

      Papri        base                          (nothing smaller)
      Lily Stick   base Papri · how many 4       → 4 papri
      Gypsy Stick  base Papri · how many 2       → 2 papri
      Lily Bunch   base Lily Stick · how many 10 → 40 papri  (chain resolved for you)

  ⚠ TRADE-OFF the owner accepted (21 Jul): this is only correct because the NAME is
  specific — a gypsy stick is 2 papri, not 4. So the list grows with the catalogue and
  someone has to remember to add "Gypsy Stick" when gypsy arrives. Two mitigations here,
  neither of which fully solves it (nothing ties a unit to a flower):
    · Duplicate — copy an existing conversion into a new name in one click
    · a warning when a name looks generic ("Stick" with no flower in front)

  Screen shape:
    · the page is a LIST and reads like one — plain text rows, no input boxes
    · add / edit / duplicate are the SAME dialog, with a live preview of the conversion
    · "breaks into" is a type-ahead — a name that doesn't exist yet is created on save
    · "Used by" counts are CLICKABLE — the drawer lists the real rows and moves them in
      bulk through each OWNING module's endpoint; this screen never writes their tables

  Demo fallback ONLY when the API is unreachable; an empty-but-reachable DB is REAL.
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";
const rnd = () => Math.random().toString(36).slice(2, 9);

const ACCENT = "#0e8f74";
const ACCENT_BG = "#e7f5f1";
const BASE_BG = "#eef2ff";
const BASE_FG = "#4f46e5";

/* read-only list columns — CSS grid, never flex (truncate+flex overflow trap) */
const ROW =
  "grid grid-cols-1 md:grid-cols-[34px_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1fr)_104px_46px_92px] items-center gap-3";

/** a name is "generic" if it is a bare measure word with no product in front of it */
const GENERIC = ["stick", "bunch", "box", "set", "pair", "bundle", "packet", "pack"];
function looksGeneric(name: string): boolean {
  return GENERIC.includes(name.trim().toLowerCase());
}

/** would `baseId` sitting under `id` create a loop? (mirrors the API guard) */
function makesCycle(units: ApiUnit[], id: string, baseId: string): boolean {
  if (!baseId || !id) return false;
  if (id === baseId) return true;
  const byId = new Map(units.map((u) => [u.id, u]));
  let cur = byId.get(baseId);
  let depth = 0;
  while (cur && depth < 10) {
    if (cur.id === id) return true;
    if (!cur.baseUnitId) return false;
    cur = byId.get(cur.baseUnitId);
    depth++;
  }
  return false;
}

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; unit: ApiUnit }
  | { mode: "duplicate"; unit: ApiUnit };

export default function UnitsView() {
  const [units, setUnits] = useState<ApiUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [usageFor, setUsageFor] = useState<ApiUnit | null>(null);

  const sorted = useMemo(
    () => units.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [units],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? sorted.filter((u) => u.name.toLowerCase().includes(q) || u.shortCode.toLowerCase().includes(q))
      : sorted;
  }, [sorted, query]);

  const stats = useMemo(() => {
    const bases = units.filter((u) => !u.baseUnitId).length;
    return {
      total: units.length,
      bases,
      derived: units.length - bases,
      hidden: units.filter((u) => !u.isActive).length,
    };
  }, [units]);

  async function load() {
    setLoading(true);
    try {
      const { items, isDemo } = await loadUnitsSafe();
      setUnits(items);
      setIsDemo(isDemo);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function patchLocal(id: string, patch: Partial<ApiUnit>) {
    setUnits((p) => p.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  async function handleSave(v: DialogValue) {
    const editing = dialog?.mode === "edit" ? dialog.unit : null;
    const name = v.name.trim();
    const code = unitCode(v.shortCode || name);

    // Field-level validation (empty/duplicate name, bad code, loop, bad quantity)
    // happens INSIDE the dialog, next to the field it belongs to (owner, 19 Aug) —
    // by the time we get here the values are clean. Only the API can still refuse.

    // "breaks into" is typed free-hand — match an existing unit, or create it as a base
    const typed = v.baseName.trim();
    let baseUnitId = "";
    let createdBaseName = "";
    if (typed) {
      const hit = units.find(
        (u) => u.name.toLowerCase() === typed.toLowerCase() || u.shortCode === unitCode(typed),
      );
      if (hit) baseUnitId = hit.id;
      else createdBaseName = typed;
    }
    const qty = typed ? v.baseQty : 1;

    // changing a live conversion re-reads existing stock — warn before it happens
    if (editing) {
      const used = (editing._count?.items ?? 0) + (editing._count?.products ?? 0);
      const changed = baseUnitId !== (editing.baseUnitId ?? "") || qty !== editing.baseQty || !!createdBaseName;
      if (changed && used > 0) {
        const ok = confirm(
          `“${editing.name}” is used by ${used} record${used === 1 ? "" : "s"}. ` +
          `Changing the conversion re-reads every stock figure counted in it.\n\nContinue?`,
        );
        if (!ok) return;
      }
    }

    setErr(null);
    setDialog(null);

    if (isDemo) {
      let base = units.find((u) => u.id === baseUnitId) ?? null;
      if (createdBaseName) {
        base = {
          id: "unit-" + rnd(), name: createdBaseName, shortCode: unitCode(createdBaseName),
          baseUnitId: null, baseUnit: null, baseQty: 1, sortOrder: units.length,
          isActive: true, _count: { products: 0, items: 0, itemLines: 0, derivedUnits: 0 },
        };
        setUnits((p) => [...p, base as ApiUnit]);
      }
      const shape = {
        baseUnitId: base?.id ?? null,
        baseUnit: base ? { id: base.id, name: base.name, shortCode: base.shortCode } : null,
        baseQty: qty,
      };
      if (editing) { patchLocal(editing.id, { name, shortCode: code, ...shape }); setNote(`“${name}” updated.`); }
      else {
        setUnits((p) => [...p, {
          id: "unit-" + rnd(), name, shortCode: code, ...shape,
          sortOrder: units.length, isActive: true,
          _count: { products: 0, items: 0, itemLines: 0, derivedUnits: 0 },
        }]);
        setNote(`“${name}” added.`);
      }
      return;
    }

    try {
      if (createdBaseName) {
        const b = await createUnit({
          name: createdBaseName, shortCode: unitCode(createdBaseName),
          baseUnitId: null, baseQty: 1, sortOrder: units.length, isActive: true,
        });
        baseUnitId = b.id;
      }
      const extra = createdBaseName ? ` “${createdBaseName}” was created as a base unit.` : "";
      if (editing) {
        await updateUnit(editing.id, { name, shortCode: code, baseUnitId: baseUnitId || null, baseQty: qty });
        setNote(`“${name}” updated.` + extra);
      } else {
        await createUnit({
          name, shortCode: code, baseUnitId: baseUnitId || null, baseQty: qty,
          sortOrder: units.length, isActive: true,
        });
        setNote(`“${name}” added.` + extra);
      }
      await load();
    } catch (e) { setErr(msg(e, "Could not save the unit.")); await load(); }
  }

  async function toggleActive(u: ApiUnit) {
    patchLocal(u.id, { isActive: !u.isActive });
    if (isDemo) return;
    try { const r = await updateUnit(u.id, { isActive: !u.isActive }); patchLocal(u.id, r); }
    catch (e) { setErr(msg(e, "Could not save — try again.")); await load(); }
  }

  async function move(u: ApiUnit, dir: "up" | "down") {
    const i = sorted.findIndex((x) => x.id === u.id);
    const k = dir === "up" ? i - 1 : i + 1;
    if (k < 0 || k >= sorted.length) return;
    const other = sorted[k];
    const a = u.sortOrder;
    const b = other.sortOrder === a ? a + (dir === "up" ? -1 : 1) : other.sortOrder;
    setUnits((p) => p.map((x) => (x.id === u.id ? { ...x, sortOrder: b } : x.id === other.id ? { ...x, sortOrder: a } : x)));
    if (isDemo) return;
    try { await Promise.all([updateUnit(u.id, { sortOrder: b }), updateUnit(other.id, { sortOrder: a })]); }
    catch { await load(); }
  }

  async function remove(u: ApiUnit) {
    const c = u._count;
    const blocking = (c?.derivedUnits ?? 0) + (c?.items ?? 0) + (c?.products ?? 0) + (c?.itemLines ?? 0);
    if (blocking > 0) { setUsageFor(u); return; } // show WHAT blocks it, don't just refuse
    if (!confirm(`Delete the “${u.name}” unit?`)) return;
    setUnits((p) => p.filter((x) => x.id !== u.id));
    if (isDemo) return;
    try { await deleteUnit(u.id); }
    catch (e) { setErr(msg(e, "Could not delete.")); await load(); }
  }


  return (
    <div className={WRAP}>
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: ACCENT }}>
            <span className="w-[9px] h-[9px] -rotate-45" style={{ borderRadius: "50% 50% 50% 0", background: `linear-gradient(150deg,${ACCENT},var(--o-solid))` }} />
            Items · units
          </div>
          {/* prose trimmed on the owner's call (19 Aug) — the screen explains itself */}
          <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">Units</h1>
        </div>
        <button onClick={() => setDialog({ mode: "create" })} className="text-white text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-1.5 shrink-0" style={{ background: ACCENT }}>
          <Icon name="plus" size={16} /> Add unit
        </button>
      </div>

      {err && (
        <div className="bg-[var(--s-bad)] border border-[var(--l-bad)] text-[var(--t-bad)] rounded-[12px] px-4 py-3 mb-4 text-[13px] flex items-center justify-between gap-3">
          <span className="min-w-0 break-words">{err}</span><button className="underline shrink-0" onClick={() => setErr(null)}>Dismiss</button>
        </div>
      )}
      {note && (
        <div className="rounded-[12px] px-4 py-2.5 mb-4 text-[13px] flex items-center justify-between gap-3" style={{ background: ACCENT_BG, color: "var(--t-ok)", border: "1px solid var(--l-ok)" }}>
          <span>{note}</span><button className="underline shrink-0" onClick={() => setNote(null)}>Dismiss</button>
        </div>
      )}
      {isDemo && (
        <div className="flex items-center gap-3 bg-[var(--s-warn)] border border-[var(--l-warn)] text-[var(--t-warn)] rounded-[12px] px-4 py-2.5 mb-4 text-[12.5px] flex-wrap">
          <span className="text-[10px] font-bold tracking-[0.06em] uppercase bg-[var(--s-warn)] text-white px-2 py-1 rounded-full shrink-0">Offline</span>
          <span className="flex-1 min-w-[220px]">
            The API is not reachable.
            <button className="underline font-medium mx-1" onClick={load}>Retry</button>
          </span>
        </div>
      )}
      {loading && <div className="text-[13px] text-body-soft mb-4">Loading units…</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { l: "Total units", v: String(stats.total), c: "var(--t-accent)", bg: "var(--s-accent)", icon: "tag" },
          { l: "Base units (smallest)", v: String(stats.bases), c: BASE_FG, bg: BASE_BG, icon: "box" },
          { l: "With a conversion", v: String(stats.derived), c: ACCENT, bg: ACCENT_BG, icon: "check" },
          { l: "Hidden", v: String(stats.hidden), c: stats.hidden ? "var(--t-warn)" : "var(--t-ok)", bg: "var(--s-warn)", icon: "eye" },
        ].map((k, i) => (
          <div key={i} className="rounded-[14px] px-3.5 py-3 shadow-soft border border-white/60" style={{ background: k.bg }}>
            <span className="w-[24px] h-[24px] rounded-[7px] flex items-center justify-center text-white" style={{ background: k.c }}><Icon name={k.icon} size={13} /></span>
            <div className="font-display text-[23px] leading-none mt-2.5" style={{ color: k.c }}>{k.v}</div>
            <div className="text-[11.5px] font-semibold text-body mt-1.5">{k.l}</div>
          </div>
        ))}
      </div>

      {/* the naming guidance ("Lily Stick", not "Stick") now lives ONLY where it acts:
          the row badge and the dialog's inline warning. No page-level prose (19 Aug). */}
      <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft overflow-hidden">
        <div className="px-4 py-3 border-b border-lavender-deep flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-soft pointer-events-none"><Icon name="search" size={15} /></span>
            <input className="ipt ipt-icon w-full" placeholder="Search units…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <span className="text-[13px] text-body-soft shrink-0">{filtered.length} of {units.length}</span>
        </div>

        <div className={ROW + " px-4 py-2 bg-lavender/40 border-b border-lavender-deep text-[11.5px] font-bold tracking-[0.06em] uppercase text-body hidden md:grid"}>
          <span>Sort</span>
          <span>Unit</span>
          <span>Breaks into</span>
          <span>Works out to</span>
          <span>Used by</span>
          <span className="text-center">Live</span>
          <span className="text-right">Actions</span>
        </div>

        <div className="divide-y divide-lavender-deep">
          {filtered.map((u, i) => (
            <UnitRow
              key={u.id}
              unit={u}
              all={units}
              first={i === 0}
              last={i === filtered.length - 1}
              locked={!!query}
              onMove={(d) => move(u, d)}
              onEdit={() => setDialog({ mode: "edit", unit: u })}
              onDuplicate={() => setDialog({ mode: "duplicate", unit: u })}
              onToggle={() => toggleActive(u)}
              onDelete={() => remove(u)}
              onUsage={() => setUsageFor(u)}
            />
          ))}
          {!loading && filtered.length === 0 && (
            <div className="text-[13px] text-body-soft text-center py-10">
              {query ? "No units match your search." : (
                <>No units yet. <button className="underline font-medium" style={{ color: ACCENT }} onClick={() => setDialog({ mode: "create" })}>Add your first unit</button>.</>
              )}
            </div>
          )}
        </div>
      </div>

      {dialog && (
        <UnitDialog
          units={units}
          mode={dialog.mode}
          source={dialog.mode === "create" ? null : dialog.unit}
          onCancel={() => setDialog(null)}
          onSave={handleSave}
        />
      )}

      {usageFor && (
        <UsageDrawer
          unit={usageFor}
          units={units}
          isDemo={isDemo}
          onClose={() => setUsageFor(null)}
          onDone={async (moved) => { setUsageFor(null); setNote(moved); await load(); }}
          onError={(m) => setErr(m)}
        />
      )}
    </div>
  );
}

/* ================= one row — READ ONLY ================= */
function UnitRow({
  unit, all, first, last, locked, onMove, onEdit, onDuplicate, onToggle, onDelete, onUsage,
}: {
  unit: ApiUnit;
  all: ApiUnit[];
  first: boolean;
  last: boolean;
  locked: boolean;
  onMove: (dir: "up" | "down") => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onUsage: () => void;
}) {
  const resolved = unit.rootFactor !== undefined
    ? { rootFactor: unit.rootFactor, rootUnitCode: unit.rootUnitCode, chainDepth: unit.chainDepth ?? 0, chainBroken: !!unit.chainBroken }
    : resolveUnitRoot(unit, all);

  const isBase = !unit.baseUnitId;
  const c = unit._count;
  const usedTotal = (c?.items ?? 0) + (c?.products ?? 0) + (c?.itemLines ?? 0) + (c?.derivedUnits ?? 0);
  const generic = looksGeneric(unit.name);

  return (
    <div className={ROW + " px-4 py-3 " + (unit.isActive ? "hover:bg-lavender/25" : "bg-[var(--s-warn)] hover:bg-[var(--s-warn)]")}>
      <div className="flex md:flex-col items-center gap-0.5">
        <button onClick={() => onMove("up")} disabled={first || locked} className="text-body-soft hover:text-purple disabled:opacity-25 leading-none" title={locked ? "Clear the search to reorder" : "Move up"}>
          <span className="rotate-180 inline-block"><Icon name="chevronDown" size={13} /></span>
        </button>
        <button onClick={() => onMove("down")} disabled={last || locked} className="text-body-soft hover:text-purple disabled:opacity-25 leading-none" title={locked ? "Clear the search to reorder" : "Move down"}>
          <Icon name="chevronDown" size={13} />
        </button>
      </div>

      <button onClick={onEdit} className="min-w-0 text-left group">
        <span className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[14.5px] font-semibold text-purple truncate group-hover:text-orchid">{unit.name}</span>
          {generic && !isBase && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--s-warn)] text-[var(--t-warn)]" title="A bare measure word — “Lily Stick” is safer.">
              generic name
            </span>
          )}
          {!unit.isActive && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--s-warn)] text-[var(--t-warn)]">Hidden</span>}
        </span>
        <span className="block font-mono text-[13px] text-body-soft truncate">{unit.shortCode}</span>
      </button>

      <span className="text-[13px] min-w-0 truncate">
        {isBase ? <span className="text-body-soft">—</span> : (
          <span className="text-body font-medium">
            <b className="font-semibold text-purple">{(unit.baseQty ?? 1).toLocaleString()}</b> {unit.baseUnit?.name ?? "—"}
          </span>
        )}
      </span>

      <div className="text-[12.5px] min-w-0">
        {isBase ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: BASE_BG, color: BASE_FG }}>
            <Icon name="box" size={10} /> Base unit
          </span>
        ) : resolved.chainBroken || resolved.rootFactor == null ? (
          // never show a number we cannot stand behind — a wrong factor here quietly
          // corrupts every stock figure counted in this unit
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--s-bad)] text-[var(--t-bad)]" title="Its chain loops or is too deep.">
            <Icon name="bolt" size={10} /> Chain broken
          </span>
        ) : (
          <>
            <span className="text-[13px] font-semibold" style={{ color: ACCENT }}>
              1 = {resolved.rootFactor.toLocaleString()} {resolved.rootUnitCode}
            </span>
            {(resolved.chainDepth ?? 0) > 1 && (
              <span className="block text-[13px] text-body-soft">via {unit.baseUnit?.name}</span>
            )}
          </>
        )}
      </div>

      <div className="text-[12.5px] font-medium min-w-0">
        {usedTotal > 0 ? (
          <button onClick={onUsage} className="text-left hover:underline" style={{ color: ACCENT }} title="See and move what uses this unit">
            {(c?.items ?? 0) > 0 && <span className="block">{c?.items} item{c?.items === 1 ? "" : "s"}</span>}
            {(c?.products ?? 0) > 0 && <span className="block">{c?.products} product{c?.products === 1 ? "" : "s"}</span>}
            {(c?.itemLines ?? 0) > 0 && <span className="block">{c?.itemLines} recipe line{c?.itemLines === 1 ? "" : "s"}</span>}
            {(c?.derivedUnits ?? 0) > 0 && <span className="block">{c?.derivedUnits} unit{c?.derivedUnits === 1 ? "" : "s"}</span>}
          </button>
        ) : (
          <span className="text-body-soft">Unused</span>
        )}
      </div>

      <div className="flex justify-center">
        <Switch on={unit.isActive} tint={ACCENT} onClick={onToggle} />
      </div>

      <div className="flex items-center gap-1 justify-end">
        <button onClick={onDuplicate} className="w-[30px] h-[30px] rounded-[8px] grid place-items-center text-purple hover:bg-lavender" title="Duplicate"><Icon name="copy" size={14} /></button>
        <button onClick={onEdit} className="w-[30px] h-[30px] rounded-[8px] grid place-items-center text-purple hover:bg-lavender" title="Edit unit"><Icon name="edit" size={14} /></button>
        <button
          onClick={onDelete}
          className={"w-[30px] h-[30px] rounded-[8px] grid place-items-center " + (usedTotal > 0 ? "text-[var(--t-bad)] hover:bg-[var(--s-bad)]" : "text-[var(--t-bad)] hover:bg-[var(--s-bad)]")}
          title={usedTotal > 0 ? "In use — click to see and move what depends on it" : "Delete unit"}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  );
}

/* ================= unit picker =================
   A native <datalist>/<select> renders in the browser's own style — small type, blue
   highlight, no room for the conversion hint — and looked pasted-in next to the rest of
   the admin. This is the same behaviour in our own styling: type to filter, arrow keys
   to move, Enter to pick, and "Create «name»" when nothing matches.                */
function UnitPicker({
  units, value, onChange, placeholder, allowCreate = true, excludeId, autoFocus,
}: {
  units: ApiUnit[];
  /** the typed text — a name, not an id, so a brand-new unit can be created from it */
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  allowCreate?: boolean;
  excludeId?: string;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const pool = useMemo(() => units.filter((u) => u.id !== excludeId), [units, excludeId]);
  const typed = value.trim();
  const matches = useMemo(() => {
    const q = typed.toLowerCase();
    if (!q) return pool;
    return pool.filter((u) => u.name.toLowerCase().includes(q) || u.shortCode.includes(unitCode(q)));
  }, [pool, typed]);
  const exact = pool.some(
    (u) => u.name.toLowerCase() === typed.toLowerCase() || u.shortCode === unitCode(typed),
  );
  const showCreate = allowCreate && !!typed && !exact;
  const rowCount = matches.length + (showCreate ? 1 : 0);

  useEffect(() => { setActive(0); }, [typed, open]);

  // click outside closes — without this the panel hangs around over the next field
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // keep the highlighted row in view when arrowing through a long list
  useEffect(() => {
    if (!open) return; // the list isn't mounted when closed — don't touch layout
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(i: number) {
    if (i < matches.length) onChange(matches[i].name);
    else if (showCreate) onChange(typed);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, rowCount - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && rowCount > 0) { e.preventDefault(); choose(active); }
    else if (e.key === "Escape") setOpen(false);
  }

  const selected = pool.find(
    (u) => u.name.toLowerCase() === typed.toLowerCase() || u.shortCode === unitCode(typed),
  );

  return (
    <div className="relative" ref={boxRef}>
      <input
        autoFocus={autoFocus}
        className="ipt w-full mt-1"
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {value && (
        <button
          type="button"
          onClick={() => { onChange(""); setOpen(false); }}
          className="absolute right-2.5 top-1/2 mt-0.5 -translate-y-1/2 w-[20px] h-[20px] rounded-full grid place-items-center text-body-soft hover:text-purple hover:bg-lavender"
          aria-label="Clear"
        >
          ✕
        </button>
      )}

      {open && (
        <div
          ref={listRef}
          className="absolute z-20 left-0 right-0 mt-1 bg-white border border-lavender-deep rounded-[12px] shadow-soft overflow-y-auto"
          style={{ maxHeight: 260 }}
          role="listbox"
        >
          {matches.map((u, i) => {
            const on = i === active;
            const chosen = selected?.id === u.id;
            return (
              <button
                key={u.id}
                data-i={i}
                type="button"
                role="option"
                aria-selected={chosen}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={"w-full text-left px-3.5 py-2.5 grid grid-cols-[1fr_auto] items-center gap-2 " + (on ? "bg-lavender/60" : "hover:bg-lavender/30")}
              >
                <span className="min-w-0">
                  <span className="block text-[13.5px] text-purple truncate">{u.name}</span>
                  <span className="block text-[13px] text-body-soft truncate">
                    <span className="font-mono">{u.shortCode}</span>
                    {u.baseUnit ? ` · 1 = ${(u.baseQty ?? 1).toLocaleString()} ${u.baseUnit.shortCode}` : " · base unit"}
                  </span>
                </span>
                {chosen && <Icon name="check" size={14} className="shrink-0" />}
              </button>
            );
          })}

          {matches.length === 0 && !showCreate && (
            <div className="px-3.5 py-3 text-[13px] text-body-soft">No unit matches “{typed}”.</div>
          )}

          {showCreate && (
            <button
              data-i={matches.length}
              type="button"
              onMouseEnter={() => setActive(matches.length)}
              onClick={() => choose(matches.length)}
              className={"w-full text-left px-3.5 py-2.5 border-t border-lavender-deep flex items-center gap-2 " + (active === matches.length ? "bg-[var(--s-ok)]" : "hover:bg-[var(--s-ok)]")}
            >
              <span className="w-[22px] h-[22px] rounded-[7px] grid place-items-center text-white shrink-0" style={{ background: ACCENT }}>
                <Icon name="plus" size={12} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium" style={{ color: "var(--t-ok)" }}>Create “{typed}”</span>
                <span className="block text-[13px] text-body-soft">Added as a new base unit</span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ================= add / edit / duplicate dialog ================= */
type DialogValue = { name: string; shortCode: string; baseName: string; baseQty: number };

function UnitDialog({
  units, mode, source, onCancel, onSave,
}: {
  units: ApiUnit[];
  mode: "create" | "edit" | "duplicate";
  source: ApiUnit | null;
  onCancel: () => void;
  onSave: (v: DialogValue) => void;
}) {
  const editing = mode === "edit" ? source : null;
  // duplicate copies the conversion but deliberately leaves the name empty — the whole
  // point is that the new one is a DIFFERENT flower
  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.shortCode ?? "");
  const [codeTouched, setCodeTouched] = useState(!!editing);
  const [baseName, setBaseName] = useState(source?.baseUnit?.name ?? "");
  const [qty, setQty] = useState(String(source?.baseQty ?? 1));
  // shown only after a Save attempt — typing never scolds an unfinished field
  const [tried, setTried] = useState(false);

  const effCode = codeTouched ? code : unitCode(name);
  const typed = baseName.trim();
  const match = typed
    ? units.find((u) => u.name.toLowerCase() === typed.toLowerCase() || u.shortCode === unitCode(typed))
    : undefined;
  const willCreateBase = !!typed && !match;
  const n = parseInt(qty || "0", 10);
  const preview = typed && n > 0
    ? `1 ${name || "unit"} = ${n.toLocaleString()} ${match?.shortCode ?? unitCode(typed)}`
    : null;
  const generic = looksGeneric(name);

  /* Every problem is reported ON the field it belongs to, inside this dialog —
     never in the page banner behind the overlay (owner, 19 Aug). Duplicates are
     live (you see it as you type); "required" only appears after a Save attempt. */
  const nm = name.trim();
  const dupName = !!nm && units.some((u) => u.id !== editing?.id && u.name.toLowerCase() === nm.toLowerCase());
  const dupCode = !!effCode && units.some((u) => u.id !== editing?.id && u.shortCode === unitCode(effCode));
  const nameErr = dupName ? `“${nm}” already exists — pick a different name.`
    : tried && !nm ? "Give the unit a name." : null;
  const codeErr = dupCode ? `“${unitCode(effCode)}” is taken by another unit.`
    : tried && !unitCode(effCode || nm) ? "Needs at least one letter or number." : null;
  const baseErr = editing && match && makesCycle(units, editing.id, match.id)
    ? `That would make a loop — “${editing.name}” is already below “${typed}”.` : null;
  const qtyErr = typed && tried && (!Number.isInteger(n) || n < 1)
    ? "Whole number, 1 or more." : null;
  const blocked = !!(nameErr || codeErr || baseErr || qtyErr);

  function trySave() {
    setTried(true);
    if (!nm || !unitCode(effCode || nm) || dupName || dupCode || baseErr) return;
    if (typed && (!Number.isInteger(n) || n < 1)) return;
    onSave({ name: nm, shortCode: effCode, baseName, baseQty: n || 1 });
  }

  const iptCls = (bad: boolean) => "ipt w-full mt-1" + (bad ? " !border-[var(--l-bad)]" : "");
  const FieldErr = ({ text }: { text: string | null }) =>
    text ? <span className="block text-[12.5px] font-semibold text-[var(--t-bad)] mt-1">{text}</span> : null;

  const title =
    mode === "edit" ? `Edit “${editing?.name}”`
      : mode === "duplicate" ? `Duplicate “${source?.name}”`
        : "Add a unit";

  return (
    <div className="fixed inset-0 z-50 bg-black/35 flex items-start justify-center p-4 overflow-y-auto" {...backdropClose(onCancel)}>
      {/* NO overflow-hidden here — it clipped the "breaks into" picker to the dialog's
          bottom edge, leaving a 2-row sliver. Header and footer are rounded individually
          instead, so the panel can hang past the card. */}
      <div className="bg-white rounded-[18px] shadow-soft w-full max-w-[540px] mt-[7vh]" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-lavender-deep flex items-center justify-between gap-3 rounded-t-[18px]" style={{ background: ACCENT_BG }}>
          <div>
            <div className="font-display text-[18px] text-purple">{title}</div>
            {mode === "duplicate" && (
              <div className="text-[13px] text-body-soft mt-0.5">
                Conversion copied.
              </div>
            )}
          </div>
          <button onClick={onCancel} className="w-[30px] h-[30px] rounded-[9px] grid place-items-center text-purple hover:bg-white/70" aria-label="Close">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-[11.5px] font-bold tracking-[0.06em] uppercase text-body">Unit name</span>
            <input
              autoFocus className={iptCls(!!nameErr)} placeholder="e.g. Lily Stick"
              value={name}
              onChange={(e) => { setName(e.target.value); if (!codeTouched) setCode(unitCode(e.target.value)); }}
            />
            <FieldErr text={nameErr} />
          </label>

          <label className="block">
            <span className="text-[11.5px] font-bold tracking-[0.06em] uppercase text-body">Short code</span>
            <input
              className={iptCls(!!codeErr) + " font-mono text-[13px]"} placeholder="lilystick"
              value={effCode}
              onChange={(e) => { setCodeTouched(true); setCode(e.target.value); }}
            />
            <FieldErr text={codeErr} />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px] gap-3">
            <div className="block">
              <span className="text-[11.5px] font-bold tracking-[0.06em] uppercase text-body">Breaks into</span>
              <UnitPicker
                units={units}
                excludeId={editing?.id}
                value={baseName}
                onChange={setBaseName}
                placeholder="Type or pick — e.g. Papri"
              />
              <FieldErr text={baseErr} />
            </div>
            <label className="block">
              <span className="text-[11.5px] font-bold tracking-[0.06em] uppercase text-body">How many</span>
              <input
                className={iptCls(!!qtyErr) + " text-center"} type="number" min={1} step={1}
                value={qty} disabled={!typed} onChange={(e) => setQty(e.target.value)}
              />
              <FieldErr text={qtyErr} />
            </label>
          </div>

          <div className="rounded-[12px] px-3.5 py-2.5 text-[12.5px]" style={{ background: preview ? ACCENT_BG : "var(--s-accent)", color: preview ? "var(--t-ok)" : "var(--t-accent)" }}>
            {preview ?? "Leave “breaks into” empty for the smallest unit."}
          </div>

          {generic && typed && (
            <div className="rounded-[12px] px-3.5 py-2 text-[12.5px] font-medium" style={{ background: "var(--s-warn)", color: "var(--t-warn)", border: "1px solid var(--l-warn)" }}>
              “{name}” alone is risky — put the flower in front: <b>“Lily {name}”</b>.
            </div>
          )}

          {willCreateBase && (
            <div className="rounded-[12px] px-3.5 py-2 text-[12.5px] font-medium" style={{ background: "var(--s-warn)", color: "var(--t-warn)", border: "1px solid var(--l-warn)" }}>
              <b>“{typed}”</b> is new — it will be created as a base unit.
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-lavender-deep flex items-center justify-end gap-2.5 rounded-b-[18px] bg-white">
          <button onClick={onCancel} className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px]">Cancel</button>
          <button
            onClick={trySave}
            disabled={!name.trim() || blocked}
            className="text-white text-[13.5px] font-semibold px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2 disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            <Icon name="check" size={16} /> {mode === "edit" ? "Save changes" : "Add unit"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= what still uses this unit ================= */
type Row = {
  key: string;
  kind: "item" | "product" | "recipe line" | "unit";
  id: string;
  label: string;
  sub: string;
  /** recipe lines are edited in the Item module, not moved from here */
  movable: boolean;
};

function UsageDrawer({
  unit, units, isDemo, onClose, onDone, onError,
}: {
  unit: ApiUnit;
  units: ApiUnit[];
  isDemo: boolean;
  onClose: () => void;
  onDone: (note: string) => void;
  onError: (m: string) => void;
}) {
  const [data, setData] = useState<UnitUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiFailed, setApiFailed] = useState(false);
  const [target, setTarget] = useState(""); // resolved unit id, "" until a real match
  const [targetText, setTargetText] = useState(""); // what is typed in the picker
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setApiFailed(false);
      if (isDemo) { if (alive) { setData(null); setLoading(false); } return; }
      try {
        const d = await getUnitUsage(unit.id);
        if (alive) setData(d);
      } catch {
        if (alive) setApiFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [unit.id, isDemo]);

  // derived units never need the API — the full unit list is already in memory, so this
  // half always renders, even in demo mode or with the endpoint down
  const localDerived = useMemo(() => units.filter((u) => u.baseUnitId === unit.id), [units, unit.id]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    if (data) {
      for (const i of data.items) out.push({ key: "item:" + i.id, kind: "item", id: i.id, label: i.name, sub: i.sku, movable: true });
      for (const p of data.products) out.push({ key: "product:" + p.id, kind: "product", id: p.id, label: p.name, sub: p.sku ?? p.slug, movable: true });
      for (const l of data.itemLines ?? []) {
        out.push({
          key: "line:" + l.id, kind: "recipe line", id: l.id,
          label: `${l.parentItem.name} → ${l.componentItem.name}`,
          sub: `${(l.qtyMilli / 1000).toLocaleString()} ${unit.shortCode} · edit in the item’s recipe`,
          movable: false,
        });
      }
    }
    for (const u of localDerived) {
      out.push({
        key: "unit:" + u.id, kind: "unit", id: u.id, label: u.name,
        sub: `1 ${u.name} = ${(u.baseQty ?? 1).toLocaleString()} ${unit.shortCode}`,
        movable: true,
      });
    }
    return out;
  }, [data, localDerived, unit.shortCode]);

  const movable = rows.filter((r) => r.movable);
  const allPicked = movable.length > 0 && picked.size === movable.length;
  const toggle = (k: string) =>
    setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const pickedKinds = useMemo(
    () => new Set(rows.filter((r) => picked.has(r.key)).map((r) => r.kind)),
    [rows, picked],
  );

  const hidden = apiFailed || isDemo
    ? (unit._count?.items ?? 0) + (unit._count?.products ?? 0) + (unit._count?.itemLines ?? 0)
    : 0;

  async function moveSelected() {
    if (!target || picked.size === 0) return;
    setWorking(true);
    let ok = 0;
    const fails: string[] = [];
    for (const key of picked) {
      const row = rows.find((r) => r.key === key);
      if (!row) continue;
      try {
        if (row.kind === "item") await moveItemToUnit(row.id, target);
        else if (row.kind === "product") await moveProductToUnit(row.id, target);
        else if (row.kind === "unit") await moveUnitBase(row.id, target);
        ok++;
      } catch (e) { fails.push(`${row.label}: ${msg(e, "failed")}`); }
    }
    setWorking(false);
    if (fails.length) onError(`Moved ${ok}, but ${fails.length} failed — ${fails[0]}`);
    onDone(`Moved ${ok} record${ok === 1 ? "" : "s"} off “${unit.name}”.`);
  }

  const targetName = units.find((u) => u.id === target)?.name;

  return (
    <div className="fixed inset-0 z-50 bg-black/35 flex justify-end" {...backdropClose(onClose)}>
      <div className="bg-white w-full max-w-[560px] h-full flex flex-col shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-lavender-deep flex items-start justify-between gap-3" style={{ background: ACCENT_BG }}>
          <div>
            <div className="font-display text-[18px] text-purple">What uses “{unit.name}”</div>
          </div>
          <button onClick={onClose} className="w-[30px] h-[30px] rounded-[9px] grid place-items-center text-purple hover:bg-white/70 shrink-0" aria-label="Close">✕</button>
        </div>

        <div className="px-5 py-3 border-b border-lavender-deep flex items-center gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 text-[13px] text-body">
            <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(movable.map((r) => r.key)))} />
            Select all ({movable.length})
          </label>
          <span className="text-[13px] text-body-soft ml-auto">{picked.size} selected</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-5 text-[13px] text-body-soft">Loading…</div>}
          {!loading && hidden > 0 && (
            <div className="m-4 rounded-[12px] px-3.5 py-2.5 text-[12.5px]" style={{ background: "var(--s-warn)", color: "var(--t-warn)", border: "1px solid var(--l-warn)" }}>
              {isDemo
                ? <>Demo mode — the {hidden} item/product record{hidden === 1 ? "" : "s"} are not real, so they can’t be listed. Units below are real.</>
                : <>Couldn’t reach <span className="font-mono">/units/{unit.id}/usage</span>, so the {hidden} item/product record{hidden === 1 ? "" : "s"} aren’t listed. Rebuild the API to see them. Units below are accurate.</>}
            </div>
          )}
          {!loading && rows.length === 0 && hidden === 0 && (
            <div className="p-5 text-[13px] text-body-soft">Nothing uses this unit.</div>
          )}
          {rows.map((r) => (
            <label key={r.key} className={"grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-2.5 border-b border-lavender-deep " + (r.movable ? "hover:bg-lavender/25 cursor-pointer" : "bg-[var(--s-accent)]")}>
              <input type="checkbox" checked={picked.has(r.key)} disabled={!r.movable} onChange={() => toggle(r.key)} />
              <span className="min-w-0">
                <span className="block text-[13.5px] text-purple truncate">{r.label}</span>
                <span className="block text-[13px] text-body-soft truncate">{r.sub}</span>
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap" style={
                r.kind === "item" ? { background: BASE_BG, color: BASE_FG }
                  : r.kind === "product" ? { background: "var(--s-accent)", color: "var(--t-accent)" }
                    : r.kind === "recipe line" ? { background: "var(--s-accent)", color: "var(--t-accent)" }
                      : { background: ACCENT_BG, color: "var(--t-ok)" }
              }>{r.kind}</span>
            </label>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-lavender-deep space-y-3">
          <div className="block">
            <span className="text-[11px] font-bold tracking-[0.06em] uppercase text-body-soft">Move the selected to</span>
            {/* same picker as the dialog — no "create" here, you can only move to a unit
                that already exists */}
            <UnitPicker
              units={units}
              excludeId={unit.id}
              allowCreate={false}
              value={targetText}
              onChange={(v) => {
                setTargetText(v);
                const hit = units.find(
                  (u) => u.id !== unit.id && (u.name.toLowerCase() === v.trim().toLowerCase() || u.shortCode === unitCode(v)),
                );
                setTarget(hit?.id ?? "");
              }}
              placeholder="Type or pick a unit…"
            />
          </div>
          {!target && targetText.trim() && (
            <p className="text-[11.5px] text-[var(--t-warn)] m-0">Pick a unit from the list — “{targetText.trim()}” is not one of them.</p>
          )}
          {target && picked.size > 0 && (
            <div className="rounded-[12px] px-3.5 py-2.5 text-[11.5px] leading-relaxed" style={{ background: "var(--s-warn)", color: "var(--t-warn)", border: "1px solid var(--l-warn)" }}>
              <b>{picked.size} record{picked.size === 1 ? "" : "s"}</b> will point at <b>{targetName}</b> instead. Nothing is recalculated:
              <ul className="list-disc pl-4 mt-1 mb-0 space-y-0.5">
                <li>Stock and quantity numbers are kept as-is — 200 {unit.shortCode} becomes 200 {targetName}.</li>
                {pickedKinds.has("unit") && (
                  <li>A moved unit keeps its “how many” — “12 {unit.shortCode}” becomes “12 {targetName}”. Check it after.</li>
                )}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-end gap-2.5">
            <button onClick={onClose} className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px]">Close</button>
            <button
              onClick={moveSelected}
              disabled={!target || picked.size === 0 || working}
              className="text-white text-[13.5px] font-semibold px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2 disabled:opacity-50"
              style={{ background: ACCENT }}
            >
              <Icon name="check" size={16} /> {working ? "Moving…" : `Move ${picked.size || ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Switch({ on, tint, onClick }: { on: boolean; tint?: string; onClick: () => void }) {
  const w = 36, h = 21, k = 15;
  return (
    <button onClick={onClick} className="relative rounded-full transition-colors shrink-0" style={{ width: w, height: h, background: on ? (tint ?? "var(--s-orchid)") : "var(--s-accent)" }} title={on ? "In use" : "Hidden"}>
      <span className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all" style={{ width: k, height: k, left: on ? w - k - 3 : 3 }} />
    </button>
  );
}

function msg(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}
