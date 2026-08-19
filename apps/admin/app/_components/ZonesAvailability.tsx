"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, Header, Switch, TimeSelect } from "./DeliveryUI";
import { Modal, Field, DataTable } from "./ItemUI";
import { formatTaka } from "../_data/api";
import {
  listDeliveryAreas, createDeliveryArea, updateDeliveryArea, deleteDeliveryArea,
  listDeliveryTypes, createDeliveryType, updateDeliveryType, deleteDeliveryType,
  listDeliveryMethods, createDeliveryMethod, updateDeliveryMethod, deleteDeliveryMethod,
  addDeliverySlot, deleteDeliverySlot,
  listSlotTemplates, createSlotTemplate, updateSlotTemplate, deleteSlotTemplate,
  TIMING_META,
  type ApiDeliveryArea, type ApiDeliveryType, type ApiDeliveryMethod, type ApiSlotTemplate,
  type DeliveryTiming,
} from "../_data/api";

/*
  DEC-DLV-018 (owner, 19 Aug 2026) — the delivery setup in two rooms:

    /delivery/zones  →  DeliveryMasters — where things are MADE, once each:
                        Methods (DeliveryType: name + shape + clock)
                        Time slots (DeliverySlotTemplate)
                        Zones (DeliveryArea tree)
    /delivery/setup  →  DeliveryConnections — where things are CONNECTED:
                        pick a zone, attach methods with a price, attach slots.
                        Nothing is created here; every dropdown reads a master.

  Under the hood nothing checkout reads has moved: a connection is still a
  DeliveryMethod row, its slots still DeliverySlot rows. A connected slot
  remembers its master (templateId); editing the master fans out server-side.

  Every time on these screens is picked from dropdowns (TimeSelect) — nobody
  types "9am" anywhere (owner, 19 Aug).
*/

const ACCENT = "#7d2ea8";

const fmtMin = (t: number): string => {
  const h = Math.floor(t / 60), m = t % 60;
  return (((h + 11) % 12) + 1) + ":" + String(m).padStart(2, "0") + " " + (h >= 12 ? "PM" : "AM");
};
const windowText = (a?: number | null, b?: number | null) =>
  a != null && b != null ? `${fmtMin(a)} – ${fmtMin(b)}` : "—";
const cutToMin = (s?: string | null): number | null => {
  if (!s) return null;
  const [h, m] = s.split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};
const minToCut = (min: number | null): string | null =>
  min == null ? null : String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");

const ErrLine = ({ text, onClose }: { text: string; onClose: () => void }) => (
  <div className="mb-4 rounded-[12px] border border-[#f0c9c9] bg-[#fdecee] px-4 py-3 text-[13px] font-medium text-[#b42318] flex items-center justify-between gap-3">
    <span className="min-w-0 break-words">{text}</span>
    <button className="underline shrink-0" onClick={onClose}>Dismiss</button>
  </div>
);

const IconBtn = ({ name, onClick, danger, title }: { name: string; onClick: () => void; danger?: boolean; title?: string }) => (
  <button title={title} onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={"w-7 h-7 grid place-items-center rounded-[8px] shrink-0 " + (danger ? "text-body-soft hover:text-[#c0392b] hover:bg-[#fdecee]" : "text-body-soft hover:text-purple hover:bg-lavender")}>
    <Icon name={name} size={14} />
  </button>
);

/* ═══════════════════ MASTERS — /delivery/zones ═══════════════════ */

type MTab = "methods" | "slots" | "zones";

export function DeliveryMasters() {
  const [tab, setTab] = useState<MTab>("methods");
  const [types, setTypes] = useState<ApiDeliveryType[]>([]);
  const [templates, setTemplates] = useState<ApiSlotTemplate[]>([]);
  const [zones, setZones] = useState<ApiDeliveryArea[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const [t, s, z] = await Promise.all([listDeliveryTypes(), listSlotTemplates(), listDeliveryAreas()]);
      setTypes(t); setTemplates(s); setZones(z);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not load."); }
  }
  useEffect(() => { void reload(); }, []);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr("");
    try { await fn(); await reload(); return true; }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not save."); return false; }
    finally { setBusy(false); }
  }

  const TABS: { key: MTab; label: string; icon: string }[] = [
    { key: "methods", label: "Methods", icon: "bolt" },
    { key: "slots", label: "Time slots", icon: "clock" },
    { key: "zones", label: "Zones", icon: "pin" },
  ];

  return (
    <div className={WRAP}>
      <Header eyebrow="Delivery · masters" title="Methods & slots" />
      {err && <ErrLine text={err} onClose={() => setErr("")} />}

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="px-4 py-2 rounded-full text-[13px] font-semibold border inline-flex items-center gap-2 transition-all"
              style={on ? { background: ACCENT, color: "#fff", borderColor: ACCENT } : { background: "#fff", color: "#6b5878", borderColor: "#e3d7ec" }}>
              <Icon name={t.icon} size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "methods" && <MethodsTab types={types} run={run} busy={busy} />}
      {tab === "slots" && <SlotsTab templates={templates} run={run} busy={busy} />}
      {tab === "zones" && <ZonesTab zones={zones} run={run} busy={busy} />}
    </div>
  );
}

/* ---------------- Methods (DeliveryType master) ---------------- */

const M_ROW = "grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_90px_70px_80px] items-center gap-2 px-4";

type TypeDraft = {
  id: string | null; name: string; zone: "DHAKA" | "BANGLADESH";
  timing: DeliveryTiming; minutes: string; fromMin: number | null; toMin: number | null;
};

function MethodsTab({ types, run, busy }: { types: ApiDeliveryType[]; run: (fn: () => Promise<unknown>) => Promise<boolean>; busy: boolean }) {
  const [dlg, setDlg] = useState<TypeDraft | null>(null);

  const dup = !!dlg && !!dlg.name.trim() &&
    types.some((t) => t.id !== dlg.id && t.name.trim().toLowerCase() === dlg.name.trim().toLowerCase() && t.zone === dlg.zone);

  const detail = (t: ApiDeliveryType) => {
    const meta = t.timing ? TIMING_META[t.timing] : null;
    const bits: string[] = [];
    if (meta?.needsMinutes && t.promiseMinutes) bits.push(`${t.promiseMinutes / 60} h promise`);
    if (meta?.needsWindow && t.openFromMin != null && t.openToMin != null) bits.push(windowText(t.openFromMin, t.openToMin));
    return bits.join(" · ");
  };

  async function save() {
    if (!dlg || !dlg.name.trim() || dup) return;
    const meta = TIMING_META[dlg.timing];
    const body = {
      name: dlg.name.trim(),
      zone: dlg.zone,
      kind: dlg.timing === "LEAD_DAYS" ? "COURIER" : "RIDER",
      timing: dlg.timing,
      promiseMinutes: meta.needsMinutes ? Number(dlg.minutes) || null : null,
      openFromMin: meta.needsWindow ? dlg.fromMin : null,
      openToMin: meta.needsWindow ? dlg.toMin : null,
    };
    const ok = await run(async () => {
      if (dlg.id) await updateDeliveryType(dlg.id, body);
      else await createDeliveryType(body);
    });
    if (ok) setDlg(null);
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => setDlg({ id: null, name: "", zone: "DHAKA", timing: "TODAY_SLOT", minutes: "120", fromMin: 600, toMin: 1260 })}
          className="text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2" style={{ background: ACCENT }}>
          <Icon name="plus" size={15} /> Add method
        </button>
      </div>

      <DataTable head={<div className={M_ROW + " py-2.5"}><span>Method</span><span>How it works</span><span>Zones</span><span className="text-center">Live</span><span className="text-right">Action</span></div>}>
        {types.map((t) => (
          <div key={t.id} className={M_ROW + " py-2.5 hover:bg-lavender/15"}>
            <span className="min-w-0">
              <span className="text-[13.5px] font-semibold text-purple block truncate">{t.name}</span>
              <span className="text-[11.5px] text-body-soft">{t.zone === "DHAKA" ? "Inside Dhaka" : "Nationwide"}</span>
            </span>
            <span className="min-w-0">
              <span className="text-[12.5px] font-medium text-body block truncate">{t.timing ? TIMING_META[t.timing].label : "—"}</span>
              {detail(t) && <span className="text-[11.5px] text-body-soft block truncate">{detail(t)}</span>}
            </span>
            <span className="text-[12.5px] font-medium text-body">{t.rateCount ?? 0} priced</span>
            <span className="flex justify-center">
              <Switch small on={t.isActive} onClick={() => void run(() => updateDeliveryType(t.id, { isActive: !t.isActive }))} />
            </span>
            <span className="flex items-center justify-end gap-1">
              <IconBtn name="edit" title="Edit" onClick={() => setDlg({
                id: t.id, name: t.name, zone: t.zone,
                timing: t.timing ?? "TODAY_SLOT",
                minutes: t.promiseMinutes != null ? String(t.promiseMinutes) : "120",
                fromMin: t.openFromMin ?? 600, toMin: t.openToMin ?? 1260,
              })} />
              <IconBtn name="trash" danger title="Delete" onClick={() => {
                // the server cascades: its zone prices go too, and products lose the tick
                if (!confirm(`Delete "${t.name}"? It disconnects from every zone and every product.`)) return;
                void run(() => deleteDeliveryType(t.id));
              }} />
            </span>
          </div>
        ))}
        {types.length === 0 && <div className="text-center py-10 text-[13.5px] text-purple font-semibold">No methods yet — press Add method</div>}
      </DataTable>

      {dlg && (
        <Modal title={dlg.id ? "Edit method" : "Add method"} onClose={() => setDlg(null)} onSave={save} canSave={!!dlg.name.trim() && !dup} busy={busy}>
          <Field label="Name" required>
            <input autoFocus className="ipt w-full" placeholder="e.g. 2-Hour Express"
              value={dlg.name} onChange={(e) => setDlg({ ...dlg, name: e.target.value })} />
            {dup && <span className="block text-[12.5px] font-semibold text-[#c0392b] mt-1">That method already exists in this zone.</span>}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Serves" required>
              <select className="ipt w-full" value={dlg.zone} onChange={(e) => setDlg({ ...dlg, zone: e.target.value as "DHAKA" | "BANGLADESH" })}>
                <option value="DHAKA">Inside Dhaka</option>
                <option value="BANGLADESH">Nationwide</option>
              </select>
            </Field>
            <Field label="How it works" required>
              <select className="ipt w-full" value={dlg.timing} onChange={(e) => setDlg({ ...dlg, timing: e.target.value as DeliveryTiming })}>
                {(Object.keys(TIMING_META) as DeliveryTiming[]).map((k) => (
                  <option key={k} value={k}>{TIMING_META[k].label}</option>
                ))}
              </select>
            </Field>
          </div>
          {TIMING_META[dlg.timing].needsMinutes && (
            <Field label="Promise (minutes)">
              <div className="flex items-center gap-2">
                <input className="ipt w-[110px]" inputMode="numeric" value={dlg.minutes}
                  onChange={(e) => setDlg({ ...dlg, minutes: e.target.value.replace(/[^0-9]/g, "") })} />
                {Number(dlg.minutes) > 0 && (
                  <span className="text-[12.5px] font-medium text-body">= {(Number(dlg.minutes) / 60).toFixed(Number(dlg.minutes) % 60 ? 1 : 0)} hours</span>
                )}
              </div>
            </Field>
          )}
          {TIMING_META[dlg.timing].needsWindow && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Orders from">
                <TimeSelect value={dlg.fromMin} onChange={(m) => setDlg({ ...dlg, fromMin: m })} />
              </Field>
              <Field label="Until">
                <TimeSelect value={dlg.toMin} onChange={(m) => setDlg({ ...dlg, toMin: m })} />
              </Field>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

/* ---------------- Time slots (DeliverySlotTemplate master) ---------------- */

const S_ROW = "grid grid-cols-[minmax(0,1fr)_170px_110px_90px_90px_70px_80px] items-center gap-2 px-4";

type SlotDraft = {
  id: string | null; label: string;
  fromMin: number | null; toMin: number | null; cutMin: number | null; capacity: string;
};

function SlotsTab({ templates, run, busy }: { templates: ApiSlotTemplate[]; run: (fn: () => Promise<unknown>) => Promise<boolean>; busy: boolean }) {
  const [dlg, setDlg] = useState<SlotDraft | null>(null);

  const dup = !!dlg && !!dlg.label.trim() &&
    templates.some((t) => t.id !== dlg.id && t.label.trim().toLowerCase() === dlg.label.trim().toLowerCase());

  async function save() {
    if (!dlg || !dlg.label.trim() || dup) return;
    const body = {
      label: dlg.label.trim(),
      startMin: dlg.fromMin, endMin: dlg.toMin,
      cutoffTime: minToCut(dlg.cutMin),
      capacityPerDay: dlg.capacity === "" ? null : Number(dlg.capacity) || null,
    };
    const ok = await run(async () => {
      if (dlg.id) await updateSlotTemplate(dlg.id, body);
      else await createSlotTemplate(body);
    });
    if (ok) setDlg(null);
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => setDlg({ id: null, label: "", fromMin: 600, toMin: 780, cutMin: null, capacity: "40" })}
          className="text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2" style={{ background: ACCENT }}>
          <Icon name="plus" size={15} /> Add time slot
        </button>
      </div>

      <DataTable head={<div className={S_ROW + " py-2.5"}><span>Slot</span><span>Window</span><span>Last order</span><span>Capacity</span><span>Used in</span><span className="text-center">Live</span><span className="text-right">Action</span></div>}>
        {templates.map((t) => (
          <div key={t.id} className={S_ROW + " py-2.5 hover:bg-lavender/15"}>
            <span className="text-[13.5px] font-semibold text-purple truncate">{t.label}</span>
            <span className="text-[12.5px] font-medium text-body">{windowText(t.startMin, t.endMin)}</span>
            <span className="text-[12.5px] font-medium text-body">{cutToMin(t.cutoffTime) != null ? fmtMin(cutToMin(t.cutoffTime)!) : "—"}</span>
            <span className="text-[12.5px] font-medium text-body">{t.capacityPerDay ?? "∞"}/day</span>
            <span className="text-[12.5px] font-medium text-body">{t.usedCount ?? 0} place{(t.usedCount ?? 0) === 1 ? "" : "s"}</span>
            <span className="flex justify-center">
              <Switch small on={t.isActive} onClick={() => void run(() => updateSlotTemplate(t.id, { isActive: !t.isActive }))} />
            </span>
            <span className="flex items-center justify-end gap-1">
              <IconBtn name="edit" title="Edit" onClick={() => setDlg({
                id: t.id, label: t.label,
                fromMin: t.startMin ?? null, toMin: t.endMin ?? null,
                cutMin: cutToMin(t.cutoffTime), capacity: t.capacityPerDay != null ? String(t.capacityPerDay) : "",
              })} />
              <IconBtn name="trash" danger title="Delete" onClick={() => {
                if (!confirm(`Delete the "${t.label}" slot?`)) return;
                void run(() => deleteSlotTemplate(t.id));
              }} />
            </span>
          </div>
        ))}
        {templates.length === 0 && <div className="text-center py-10 text-[13.5px] text-purple font-semibold">No time slots yet — press Add time slot</div>}
      </DataTable>

      {dlg && (
        <Modal title={dlg.id ? "Edit time slot" : "Add time slot"} onClose={() => setDlg(null)} onSave={save} canSave={!!dlg.label.trim() && !dup} busy={busy}>
          <Field label="Name" required>
            <input autoFocus className="ipt w-full" placeholder="e.g. Evening"
              value={dlg.label} onChange={(e) => setDlg({ ...dlg, label: e.target.value })} />
            {dup && <span className="block text-[12.5px] font-semibold text-[#c0392b] mt-1">That slot already exists.</span>}
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="From">
              <TimeSelect value={dlg.fromMin} onChange={(m) => setDlg({ ...dlg, fromMin: m })} />
            </Field>
            <Field label="To">
              <TimeSelect value={dlg.toMin} onChange={(m) => setDlg({ ...dlg, toMin: m })} />
            </Field>
          </div>
          <div className="grid grid-cols-[1fr_120px] gap-3 items-end">
            <Field label="Last order at">
              <TimeSelect allowEmpty value={dlg.cutMin} onChange={(m) => setDlg({ ...dlg, cutMin: m })} />
            </Field>
            <Field label="Capacity / day">
              <input className="ipt w-full" inputMode="numeric" placeholder="∞"
                value={dlg.capacity} onChange={(e) => setDlg({ ...dlg, capacity: e.target.value.replace(/[^0-9]/g, "") })} />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------------- Zones (DeliveryArea master) ---------------- */

function ZonesTab({ zones, run, busy }: { zones: ApiDeliveryArea[]; run: (fn: () => Promise<unknown>) => Promise<boolean>; busy: boolean }) {
  const [dlg, setDlg] = useState<{ id: string | null; name: string; parentId: string | null } | null>(null);
  const mains = zones.filter((z) => !z.parentId);
  const subsOf = (id: string) => zones.filter((z) => z.parentId === id);

  async function save() {
    if (!dlg || !dlg.name.trim()) return;
    /*  A main zone's reach is read off its NAME — "Nationwide", "Courier",
        or the owner typing the zone in Bangla means countrywide; anything
        else is Dhaka. One dropdown fewer; rename to correct a mistake.  */
    const looksNationwide = /nation|bangladesh|courier|দেশ/i.test(dlg.name);
    const ok = await run(async () => {
      if (dlg.id) await updateDeliveryArea(dlg.id, { name: dlg.name.trim() });
      else await createDeliveryArea({
        name: dlg.name.trim(),
        parentId: dlg.parentId,
        zone: dlg.parentId ? undefined : looksNationwide ? "BANGLADESH" : "DHAKA",
      });
    });
    if (ok) setDlg(null);
  }

  const Row = ({ z, sub }: { z: ApiDeliveryArea; sub?: boolean }) => (
    <div className={"flex items-center gap-2.5 px-4 py-2.5 hover:bg-lavender/15 " + (sub ? "pl-10" : "")}>
      {sub
        ? <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ACCENT }} />
        : <span className="w-7 h-7 rounded-[8px] grid place-items-center text-white shrink-0" style={{ background: ACCENT }}><Icon name="pin" size={13} /></span>}
      <span className={"flex-1 truncate " + (sub ? "text-[13px] font-medium text-body" : "text-[13.5px] font-semibold text-purple")}>{z.name}</span>
      {!sub && <span className="text-[11.5px] text-body-soft">{subsOf(z.id).length} area{subsOf(z.id).length === 1 ? "" : "s"}</span>}
      <IconBtn name="edit" title="Rename" onClick={() => setDlg({ id: z.id, name: z.name, parentId: z.parentId })} />
      <IconBtn name="trash" danger title="Delete" onClick={() => {
        if (subsOf(z.id).length) { alert("Remove the areas inside it first."); return; }
        if (!confirm(`Delete "${z.name}"?`)) return;
        void run(() => deleteDeliveryArea(z.id));
      }} />
    </div>
  );

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => setDlg({ id: null, name: "", parentId: null })}
          className="text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2" style={{ background: ACCENT }}>
          <Icon name="plus" size={15} /> Add zone
        </button>
      </div>

      <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft overflow-hidden divide-y divide-lavender-deep">
        {mains.map((m) => (
          <div key={m.id}>
            <Row z={m} />
            {subsOf(m.id).map((s) => <Row key={s.id} z={s} sub />)}
            <div className="pl-10 pb-2">
              <button onClick={() => setDlg({ id: null, name: "", parentId: m.id })}
                className="text-[12.5px] font-medium inline-flex items-center gap-1.5" style={{ color: ACCENT }}>
                <Icon name="plus" size={13} /> Add area in {m.name}
              </button>
            </div>
          </div>
        ))}
        {mains.length === 0 && <div className="text-center py-10 text-[13.5px] text-purple font-semibold">No zones yet — press Add zone</div>}
      </div>

      {dlg && (
        <Modal title={dlg.id ? "Rename" : dlg.parentId ? "Add area" : "Add zone"} onClose={() => setDlg(null)} onSave={save} canSave={!!dlg.name.trim()} busy={busy}>
          <Field label={dlg.parentId ? "Area name" : "Zone name"} required>
            <input autoFocus className="ipt w-full" placeholder={dlg.parentId ? "e.g. Dhanmondi" : "e.g. Dhaka Metro / Nationwide"}
              value={dlg.name} onChange={(e) => setDlg({ ...dlg, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && dlg.name.trim()) save(); }} />
          </Field>
        </Modal>
      )}
    </>
  );
}

/* ═══════════════════ CONNECTIONS — /delivery/setup ═══════════════════ */

export function DeliveryConnections() {
  const [zones, setZones] = useState<ApiDeliveryArea[]>([]);
  const [types, setTypes] = useState<ApiDeliveryType[]>([]);
  const [methods, setMethods] = useState<ApiDeliveryMethod[]>([]);
  const [templates, setTemplates] = useState<ApiSlotTemplate[]>([]);
  const [selZone, setSelZone] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [addDlg, setAddDlg] = useState<{ typeId: string; price: string } | null>(null);
  const [priceDlg, setPriceDlg] = useState<{ id: string; price: string; eta: string; lead: boolean } | null>(null);

  async function reload() {
    try {
      const [z, t, m, s] = await Promise.all([
        listDeliveryAreas(), listDeliveryTypes(), listDeliveryMethods(), listSlotTemplates(),
      ]);
      setZones(z); setTypes(t); setMethods(m); setTemplates(s);
      setSelZone((cur) => cur ?? z.find((x) => !x.parentId)?.id ?? null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not load."); }
  }
  useEffect(() => { void reload(); }, []);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr("");
    try { await fn(); await reload(); return true; }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not save."); return false; }
    finally { setBusy(false); }
  }

  const mains = zones.filter((z) => !z.parentId);
  const subsOf = (id: string) => zones.filter((z) => z.parentId === id);
  const zone = zones.find((z) => z.id === selZone) ?? null;
  const root = zone ? (zone.parentId ? zones.find((z) => z.id === zone.parentId) ?? zone : zone) : null;
  const zoneCode: "DHAKA" | "BANGLADESH" = /nation|bangladesh/i.test(root?.name ?? "") ? "BANGLADESH" : "DHAKA";

  /* a MAIN zone's connections are the zone-wide rows (areaId null); an area's
     are its own rows — the more specific price wins at checkout (DEC-DLV-009) */
  const connections = useMemo(() => {
    if (!zone) return [];
    return methods.filter((m) =>
      zone.parentId ? m.areaId === zone.id : (m.areaId == null && m.zone === zoneCode));
  }, [methods, zone, zoneCode]);

  const typeOf = (m: ApiDeliveryMethod) => types.find((t) => t.id === m.typeId);
  const connectable = types.filter((t) =>
    t.isActive && t.zone === zoneCode && !connections.some((c) => c.typeId === t.id));

  async function connect() {
    if (!addDlg || !zone) return;
    const t = types.find((x) => x.id === addDlg.typeId);
    if (!t) return;
    const ok = await run(() => createDeliveryMethod({
      label: t.name,
      zone: zoneCode,
      kind: t.kind,
      feePaisa: Math.round((Number(addDlg.price) || 0) * 100),
      areaId: zone.parentId ? zone.id : null,
      typeId: t.id,
    }));
    if (ok) setAddDlg(null);
  }

  async function savePrice() {
    if (!priceDlg) return;
    const ok = await run(() => updateDeliveryMethod(priceDlg.id, {
      feePaisa: Math.round((Number(priceDlg.price) || 0) * 100),
      etaLabel: priceDlg.lead ? priceDlg.eta.trim() || null : null,
    }));
    if (ok) setPriceDlg(null);
  }

  return (
    <div className={WRAP}>
      {err && <ErrLine text={err} onClose={() => setErr("")} />}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
        {/* zones — read-only picker; they are MADE on Methods & slots */}
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-2.5">
          {mains.map((m) => (
            <div key={m.id}>
              {[m, ...subsOf(m.id)].map((z) => {
                const on = selZone === z.id;
                const sub = !!z.parentId;
                return (
                  <button key={z.id} onClick={() => setSelZone(z.id)}
                    className={`w-full flex items-center gap-2.5 rounded-[11px] px-3 py-2.5 mb-1 text-left transition-colors ${on ? "bg-purple text-white" : "hover:bg-lavender/70"} ${sub ? "pl-7" : ""}`}>
                    {!sub && (
                      <span className={`w-7 h-7 rounded-[9px] grid place-items-center shrink-0 ${on ? "bg-white/20 text-white" : "bg-lavender text-purple"}`}>
                        <Icon name="pin" size={14} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13.5px] font-semibold truncate ${on ? "text-white" : sub ? "text-body" : "text-purple"}`}>{z.name}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          <div className="border-t border-lavender-deep mt-2 pt-2.5 px-1">
            <Link href="/delivery/zones" className="text-[12.5px] font-medium inline-flex items-center gap-1.5" style={{ color: ACCENT }}>
              <Icon name="edit" size={13} /> Manage zones, methods & slots
            </Link>
          </div>
        </div>

        {/* the selected zone's connections */}
        {!zone ? (
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-16 text-center">
            <div className="font-display text-[19px] text-purple">Pick a zone on the left</div>
          </div>
        ) : (
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-5">
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <h2 className="font-display text-[19px] text-purple m-0 flex-1">{zone.name}</h2>
              <button onClick={() => setAddDlg({ typeId: connectable[0]?.id ?? "", price: "80" })}
                disabled={connectable.length === 0}
                className="text-white text-[13px] font-medium px-4 py-2 rounded-[10px] inline-flex items-center gap-1.5 disabled:opacity-40"
                style={{ background: ACCENT }}>
                <Icon name="plus" size={14} /> Connect a method
              </button>
            </div>

            <div className="divide-y divide-lavender-deep border border-lavender-deep rounded-[12px] overflow-hidden">
              {connections.map((m) => {
                const t = typeOf(m);
                const meta = t?.timing ? TIMING_META[t.timing] : null;
                const lead = t?.timing === "LEAD_DAYS";
                const freeTemplates = templates.filter((s) =>
                  s.isActive && !m.slots.some((x) => x.templateId === s.id));
                return (
                  <div key={m.id} className="px-4 py-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="min-w-0 flex-1">
                        <span className="text-[13.5px] font-semibold text-purple block truncate">{t?.name ?? m.label}</span>
                        <span className="text-[11.5px] text-body-soft">{meta?.label ?? ""}</span>
                      </span>
                      <button onClick={() => setPriceDlg({ id: m.id, price: String(Math.round(m.feePaisa / 100)), eta: m.etaLabel ?? "", lead })}
                        className="text-[13px] font-semibold px-3 py-1.5 rounded-[9px] border border-lavender-deep text-purple hover:border-orchid">
                        {formatTaka(m.feePaisa)}{lead && m.etaLabel ? ` · ${m.etaLabel}` : ""}
                      </button>
                      <Switch small on={m.isActive} onClick={() => void run(() => updateDeliveryMethod(m.id, { isActive: !m.isActive }))} />
                      <IconBtn name="trash" danger title="Disconnect" onClick={() => {
                        if (!confirm(`Disconnect "${t?.name ?? m.label}" from ${zone.name}?`)) return;
                        void run(() => deleteDeliveryMethod(m.id));
                      }} />
                    </div>

                    {/* legacy rows without a linked type may still carry slots — show them */}
                    {(meta?.needsSlots || m.slots.length > 0) && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        {m.slots.map((s) => (
                          <span key={s.id} className="inline-flex items-center gap-1.5 bg-lavender text-purple text-[12px] font-medium px-2.5 py-1 rounded-[9px]">
                            {s.label} · {windowText(s.startMin, s.endMin)}
                            <button onClick={() => void run(() => deleteDeliverySlot(s.id))}
                              className="text-body-soft hover:text-[#c0392b] font-bold" title="Disconnect slot">×</button>
                          </span>
                        ))}
                        {freeTemplates.length > 0 && (
                          <select className="ipt !px-2 text-[12px]" style={{ minHeight: 30, width: "auto" }} value=""
                            onChange={(e) => {
                              const s = templates.find((x) => x.id === e.target.value);
                              if (!s) return;
                              void run(() => addDeliverySlot(m.id, {
                                label: s.label, startMin: s.startMin ?? null, endMin: s.endMin ?? null,
                                cutoffTime: s.cutoffTime ?? null, capacityPerDay: s.capacityPerDay ?? null,
                                templateId: s.id,
                              }));
                            }}>
                            <option value="">+ slot…</option>
                            {freeTemplates.map((s) => <option key={s.id} value={s.id}>{s.label} · {windowText(s.startMin, s.endMin)}</option>)}
                          </select>
                        )}
                        {m.slots.length === 0 && freeTemplates.length === 0 && (
                          <span className="text-[12px] font-medium text-[#b45309]">No slots made yet — add them on Methods &amp; slots</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {connections.length === 0 && (
                <div className="text-center py-10 text-[13.5px] text-purple font-semibold">
                  Nothing connected here yet — press Connect a method
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {addDlg && zone && (
        <Modal title={`Connect a method to ${zone.name}`} onClose={() => setAddDlg(null)} onSave={connect} canSave={!!addDlg.typeId} busy={busy}>
          <Field label="Method" required>
            <select className="ipt w-full" value={addDlg.typeId} onChange={(e) => setAddDlg({ ...addDlg, typeId: e.target.value })}>
              {connectable.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.timing ? TIMING_META[t.timing].label : ""}</option>)}
            </select>
          </Field>
          <Field label="Charge (৳)" required>
            <input className="ipt w-[140px]" inputMode="numeric" value={addDlg.price}
              onChange={(e) => setAddDlg({ ...addDlg, price: e.target.value.replace(/[^0-9]/g, "") })} />
          </Field>
        </Modal>
      )}

      {priceDlg && (
        <Modal title="Charge" onClose={() => setPriceDlg(null)} onSave={savePrice} canSave busy={busy}>
          <Field label="Charge (৳)" required>
            <input autoFocus className="ipt w-[140px]" inputMode="numeric" value={priceDlg.price}
              onChange={(e) => setPriceDlg({ ...priceDlg, price: e.target.value.replace(/[^0-9]/g, "") })} />
          </Field>
          {priceDlg.lead && (
            <Field label="Delivery time shown to customer">
              <input className="ipt w-full" placeholder="1 - 3 days" value={priceDlg.eta}
                onChange={(e) => setPriceDlg({ ...priceDlg, eta: e.target.value })} />
            </Field>
          )}
        </Modal>
      )}
    </div>
  );
}
