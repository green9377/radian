"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { Said, useSay } from "./Said";
import { WRAP, Header, Switch, TimeSelect } from "./DeliveryUI";
import { Modal, Field, DataTable } from "./ItemUI";
import { formatTaka } from "../_data/api";
import {
  listDeliveryAreas, createDeliveryArea, updateDeliveryArea, deleteDeliveryArea,
  listDeliveryTypes, createDeliveryType, updateDeliveryType, deleteDeliveryType,
  listDeliveryMethods, createDeliveryMethod, updateDeliveryMethod, deleteDeliveryMethod,
  addDeliverySlot, updateDeliverySlot, deleteDeliverySlot,
  listSlotTemplates, createSlotTemplate, updateSlotTemplate, deleteSlotTemplate,
  listDeliveryBlackouts, createDeliveryBlackout, deleteDeliveryBlackout,
  getDeliverySettings, updateDeliverySettings,
  type ApiDeliveryBlackout, type ApiDeliverySettings,
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

const ACCENT = "#a55fd9";

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
  <div className="mb-4 rounded-[12px] border border-[#4e2c2c] bg-[#3b171b] px-4 py-3 text-[13px] font-medium text-[#ed8078] flex items-center justify-between gap-3">
    <span className="min-w-0 break-words">{text}</span>
    <button className="underline shrink-0" onClick={onClose}>Dismiss</button>
  </div>
);

const IconBtn = ({ name, onClick, danger, title }: { name: string; onClick: () => void; danger?: boolean; title?: string }) => (
  <button title={title} onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={"w-7 h-7 grid place-items-center rounded-[8px] shrink-0 " + (danger ? "text-body-soft hover:text-[#e1837a] hover:bg-[#3b171b]" : "text-body-soft hover:text-purple hover:bg-lavender")}>
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
              style={on ? { background: ACCENT, color: "#fff", borderColor: ACCENT } : { background: "#fff", color: "#b0a1ba", borderColor: "#e3d7ec" }}>
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
  id: string | null; name: string;
  timing: DeliveryTiming; minutes: string; fromMin: number | null; toMin: number | null;
};

/*  The owner never made "Inside Dhaka / Nationwide" — that pair is the system's
    own reach switch (products and checkout split on it), NOT his zone list. It
    confused the dialog, so it left: the shape decides it. Courier lead-time =
    nationwide; everything a rider runs = inside Dhaka. (owner's question, 19 Aug) */
const reachOf = (timing: DeliveryTiming): "DHAKA" | "BANGLADESH" =>
  timing === "LEAD_DAYS" ? "BANGLADESH" : "DHAKA";

function MethodsTab({ types, run, busy }: { types: ApiDeliveryType[]; run: (fn: () => Promise<unknown>) => Promise<boolean>; busy: boolean }) {
  const [dlg, setDlg] = useState<TypeDraft | null>(null);

  const dup = !!dlg && !!dlg.name.trim() &&
    types.some((t) => t.id !== dlg.id && t.name.trim().toLowerCase() === dlg.name.trim().toLowerCase());

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
      zone: reachOf(dlg.timing),
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
        <button onClick={() => setDlg({ id: null, name: "", timing: "TODAY_SLOT", minutes: "120", fromMin: 600, toMin: 1260 })}
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
                id: t.id, name: t.name,
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
            {dup && <span className="block text-[12.5px] font-semibold text-[#e1837a] mt-1">That method already exists.</span>}
          </Field>
          <Field label="How it works" required>
            <select className="ipt w-full" value={dlg.timing} onChange={(e) => setDlg({ ...dlg, timing: e.target.value as DeliveryTiming })}>
              {(Object.keys(TIMING_META) as DeliveryTiming[]).map((k) => (
                <option key={k} value={k}>{TIMING_META[k].label}</option>
              ))}
            </select>
          </Field>
          {TIMING_META[dlg.timing].needsMinutes && (
            <Field label="Promise">
              <div className="flex items-center gap-2.5">
                <div className="inline-flex items-center border-[1.5px] border-[#3c2d4e] rounded-[12px] bg-white overflow-hidden">
                  <input className="outline-none text-[13.5px] font-semibold text-purple text-center py-2 pl-3" style={{ width: 70 }}
                    inputMode="numeric" value={dlg.minutes}
                    onChange={(e) => setDlg({ ...dlg, minutes: e.target.value.replace(/[^0-9]/g, "") })} />
                  <span className="text-[12.5px] font-medium text-body-soft pr-3">min</span>
                </div>
                {Number(dlg.minutes) > 0 && (
                  <span className="text-[13px] font-semibold" style={{ color: ACCENT }}>= {(Number(dlg.minutes) / 60).toFixed(Number(dlg.minutes) % 60 ? 1 : 0)} hours</span>
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

/* no capacity here — capacity belongs to the CONNECTION, set in Setup per
   zone (owner, 19 Aug): Dhanmondi's evening and Uttara's evening may differ */
const S_ROW = "grid grid-cols-[minmax(0,1fr)_180px_120px_100px_70px_80px] items-center gap-2 px-4";

type SlotDraft = {
  id: string | null; label: string;
  fromMin: number | null; toMin: number | null; cutMin: number | null;
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
        <button onClick={() => setDlg({ id: null, label: "", fromMin: 600, toMin: 780, cutMin: null })}
          className="text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2" style={{ background: ACCENT }}>
          <Icon name="plus" size={15} /> Add time slot
        </button>
      </div>

      <DataTable head={<div className={S_ROW + " py-2.5"}><span>Slot</span><span>Window</span><span>Last order</span><span>Used in</span><span className="text-center">Live</span><span className="text-right">Action</span></div>}>
        {templates.map((t) => (
          <div key={t.id} className={S_ROW + " py-2.5 hover:bg-lavender/15"}>
            <span className="text-[13.5px] font-semibold text-purple truncate">{t.label}</span>
            <span className="text-[12.5px] font-medium text-body">{windowText(t.startMin, t.endMin)}</span>
            <span className="text-[12.5px] font-medium text-body">{cutToMin(t.cutoffTime) != null ? fmtMin(cutToMin(t.cutoffTime)!) : "—"}</span>
            <span className="text-[12.5px] font-medium text-body">{t.usedCount ?? 0} place{(t.usedCount ?? 0) === 1 ? "" : "s"}</span>
            <span className="flex justify-center">
              <Switch small on={t.isActive} onClick={() => void run(() => updateSlotTemplate(t.id, { isActive: !t.isActive }))} />
            </span>
            <span className="flex items-center justify-end gap-1">
              <IconBtn name="edit" title="Edit" onClick={() => setDlg({
                id: t.id, label: t.label,
                fromMin: t.startMin ?? null, toMin: t.endMin ?? null,
                cutMin: cutToMin(t.cutoffTime),
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
            {dup && <span className="block text-[12.5px] font-semibold text-[#e1837a] mt-1">That slot already exists.</span>}
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="From">
              <TimeSelect value={dlg.fromMin} onChange={(m) => setDlg({ ...dlg, fromMin: m })} />
            </Field>
            <Field label="To">
              <TimeSelect value={dlg.toMin} onChange={(m) => setDlg({ ...dlg, toMin: m })} />
            </Field>
          </div>
          <Field label="Last order at">
            <TimeSelect allowEmpty value={dlg.cutMin} onChange={(m) => setDlg({ ...dlg, cutMin: m })} />
          </Field>
        </Modal>
      )}
    </>
  );
}

/* ---------------- Zones (DeliveryArea master) ---------------- */

function ZonesTab({ zones, run, busy }: { zones: ApiDeliveryArea[]; run: (fn: () => Promise<unknown>) => Promise<boolean>; busy: boolean }) {
  const say = useSay();
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
        if (subsOf(z.id).length) { say.bad("Remove the areas inside it first."); return; }
        if (!confirm(`Delete "${z.name}"?`)) return;
        void run(() => deleteDeliveryArea(z.id));
      }} />
    </div>
  );

  return (
    <>
      <Said say={say} />
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
  /* attaching or editing a slot connection — capacity lives HERE, per zone */
  const [slotDlg, setSlotDlg] = useState<{
    mode: "attach" | "edit"; methodId: string; label: string; capacity: string;
    templateId?: string; slotId?: string;
  } | null>(null);

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

  async function saveSlotDlg() {
    if (!slotDlg) return;
    const cap = slotDlg.capacity === "" ? null : Number(slotDlg.capacity) || null;
    const ok = await run(async () => {
      if (slotDlg.mode === "attach") {
        const t = templates.find((x) => x.id === slotDlg.templateId);
        if (!t) return;
        await addDeliverySlot(slotDlg.methodId, {
          label: t.label, startMin: t.startMin ?? null, endMin: t.endMin ?? null,
          cutoffTime: t.cutoffTime ?? null, capacityPerDay: cap, templateId: t.id,
        });
      } else if (slotDlg.slotId) {
        await updateDeliverySlot(slotDlg.slotId, { capacityPerDay: cap });
      }
    });
    if (ok) setSlotDlg(null);
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
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <span className="w-9 h-9 rounded-[11px] grid place-items-center text-white shrink-0" style={{ background: ACCENT }}><Icon name="pin" size={17} /></span>
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-[20px] text-purple m-0 leading-tight truncate">{zone.name}</h2>
                <span className="text-[11.5px] font-semibold text-body-soft">{connections.length} method{connections.length === 1 ? "" : "s"} connected</span>
              </div>
              <button onClick={() => setAddDlg({ typeId: connectable[0]?.id ?? "", price: "80" })}
                disabled={connectable.length === 0}
                className="text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2 disabled:opacity-40"
                style={{ background: ACCENT }}>
                <Icon name="plus" size={15} /> Connect a method
              </button>
            </div>

            <div className="space-y-3">
              {connections.map((m) => {
                const t = typeOf(m);
                const meta = t?.timing ? TIMING_META[t.timing] : null;
                const lead = t?.timing === "LEAD_DAYS" || (!t && m.kind === "COURIER");
                const freeTemplates = templates.filter((s) =>
                  s.isActive && !m.slots.some((x) => x.templateId === s.id));
                return (
                  <div key={m.id} className={"bg-white border rounded-[16px] shadow-soft px-4 py-3.5 transition-colors " + (m.isActive ? "border-lavender-deep" : "border-lavender-deep opacity-60")}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="w-9 h-9 rounded-[11px] grid place-items-center text-white shrink-0"
                        style={{ background: lead ? "#2563a8" : "#cf43ea" }}>
                        <Icon name={lead ? "truck" : "bolt"} size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-[14px] font-semibold text-purple block truncate">{t?.name ?? m.label}</span>
                        <span className="text-[11.5px] font-medium text-body-soft">{meta?.label ?? (lead ? "Courier" : "Rider")}</span>
                      </span>
                      <button onClick={() => setPriceDlg({ id: m.id, price: String(Math.round(m.feePaisa / 100)), eta: m.etaLabel ?? "", lead })}
                        className="text-[13.5px] font-bold px-3.5 py-1.5 rounded-full"
                        style={{ background: "#2e1a38", color: ACCENT }} title="Change the charge">
                        {formatTaka(m.feePaisa)}{lead && m.etaLabel ? ` · ${m.etaLabel}` : ""}
                      </button>
                      <Switch small on={m.isActive} onClick={() => void run(() => updateDeliveryMethod(m.id, { isActive: !m.isActive }))} />
                      <IconBtn name="trash" danger title="Disconnect" onClick={() => {
                        if (!confirm(`Disconnect "${t?.name ?? m.label}" from ${zone.name}?`)) return;
                        void run(() => deleteDeliveryMethod(m.id));
                      }} />
                    </div>

                    {/*  Slots appear ONLY where the shape asks for them — a
                        from-confirm ("3 hours") method runs on the clock, so no
                        slot row (owner's catch, 19 Aug). A legacy row that
                        already carries slots still shows them so they can be
                        removed.  */}
                    {((meta ? meta.needsSlots : false) || m.slots.length > 0) && (
                      <div className="mt-3 md:ml-12 border border-lavender-deep rounded-[12px] overflow-hidden">
                        {m.slots.map((s) => (
                          <div key={s.id} className="flex items-center gap-2.5 px-3 py-2 border-b border-lavender-deep last:border-b-0">
                            <span className="w-6 h-6 rounded-[7px] grid place-items-center shrink-0 bg-lavender text-purple"><Icon name="clock" size={12} /></span>
                            <span className="text-[12.5px] font-semibold text-purple shrink-0">{s.label}</span>
                            <span className="text-[12px] font-medium text-body min-w-0 truncate">{windowText(s.startMin, s.endMin)}</span>
                            <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                              style={s.capacityPerDay != null ? { background: "#20332e", color: "#74f1d7" } : { background: "#29242e", color: "#aea4b7" }}>
                              {s.capacityPerDay != null ? `${s.capacityPerDay}/day` : "unlimited"}
                            </span>
                            <IconBtn name="edit" title="Capacity for this zone"
                              onClick={() => setSlotDlg({ mode: "edit", methodId: m.id, slotId: s.id, label: s.label, capacity: s.capacityPerDay != null ? String(s.capacityPerDay) : "" })} />
                            <IconBtn name="trash" danger title="Disconnect slot"
                              onClick={() => void run(() => deleteDeliverySlot(s.id))} />
                          </div>
                        ))}
                        {freeTemplates.length > 0 ? (
                          <button
                            onClick={() => setSlotDlg({ mode: "attach", methodId: m.id, templateId: freeTemplates[0].id, label: "", capacity: "" })}
                            className="w-full text-left px-3 py-2 text-[12.5px] font-semibold inline-flex items-center gap-1.5 hover:bg-lavender/40"
                            style={{ color: ACCENT, background: m.slots.length ? "#fff" : "#291e31" }}>
                            <Icon name="plus" size={13} /> Add slot
                          </button>
                        ) : m.slots.length === 0 ? (
                          <Link href="/delivery/zones" className="block px-3 py-2 text-[12.5px] font-semibold underline" style={{ color: "#f7a96e" }}>
                            No slots made yet — make them on Methods &amp; slots →
                          </Link>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
              {connections.length === 0 && (
                <div className="bg-white border border-dashed border-lavender-deep rounded-[16px] shadow-soft text-center py-12 text-[13.5px] text-purple font-semibold">
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

      {slotDlg && (() => {
        const dm = methods.find((m) => m.id === slotDlg.methodId);
        const free = dm ? templates.filter((s) => s.isActive && !dm.slots.some((x) => x.templateId === s.id)) : [];
        return (
          <Modal title={slotDlg.mode === "attach" ? "Add a slot" : `"${slotDlg.label}" in this zone`}
            onClose={() => setSlotDlg(null)} onSave={saveSlotDlg}
            canSave={slotDlg.mode === "edit" || !!slotDlg.templateId} busy={busy}>
            {slotDlg.mode === "attach" && (
              <Field label="Slot" required>
                <select className="ipt w-full" value={slotDlg.templateId ?? ""}
                  onChange={(e) => setSlotDlg({ ...slotDlg, templateId: e.target.value })}>
                  {free.map((s) => <option key={s.id} value={s.id}>{s.label} · {windowText(s.startMin, s.endMin)}</option>)}
                </select>
              </Field>
            )}
            <Field label="Capacity / day — for this zone only">
              <input autoFocus={slotDlg.mode === "edit"} className="ipt" style={{ width: 140 }} inputMode="numeric" placeholder="unlimited"
                value={slotDlg.capacity}
                onChange={(e) => setSlotDlg({ ...slotDlg, capacity: e.target.value.replace(/[^0-9]/g, "") })}
                onKeyDown={(e) => { if (e.key === "Enter") saveSlotDlg(); }} />
            </Field>
          </Modal>
        );
      })()}

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

/* ═══════════════════ BLACKOUT & RULES — /delivery/setup tab ═══════════════════
   Real since 19 Aug (DEC-DLV-019/020) — this tab was a mock with fake dates
   and switches that saved nothing. Paused days refuse at checkout's door and
   close the no-date shapes for the day; the two photo gates are enforced in
   the board's out/delivered actions. */

const fmtDay = (d: string) => {
  const dt = new Date(d + "T00:00:00");
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

export function BlackoutRules() {
  const [blackouts, setBlackouts] = useState<ApiDeliveryBlackout[]>([]);
  const [types, setTypes] = useState<ApiDeliveryType[]>([]);
  const [settings, setSettings] = useState<ApiDeliverySettings | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState<{ date: string; reason: string; typeId: string } | null>(null);

  async function reload() {
    try {
      const [b, t, s] = await Promise.all([
        listDeliveryBlackouts(), listDeliveryTypes(), getDeliverySettings(),
      ]);
      setBlackouts(b); setTypes(t); setSettings(s);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not load."); }
  }
  useEffect(() => { void reload(); }, []);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr("");
    try { await fn(); await reload(); return true; }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not save."); return false; }
    finally { setBusy(false); }
  }

  async function addBlackout() {
    if (!dlg?.date) return;
    const ok = await run(() => createDeliveryBlackout({
      date: dlg.date, reason: dlg.reason.trim() || null, typeId: dlg.typeId || null,
    }));
    if (ok) setDlg(null);
  }

  const flip = (key: keyof ApiDeliverySettings) => {
    if (!settings) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next); // optimistic — the switch answers the finger
    updateDeliverySettings({ [key]: next[key] }).catch(() => { void reload(); });
  };

  const today = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <div className={WRAP}>
      {err && <ErrLine text={err} onClose={() => setErr("")} />}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        {/* ── paused days ── */}
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-lavender-deep">
            <span className="w-8 h-8 rounded-[10px] grid place-items-center text-white shrink-0" style={{ background: "#c0392b" }}><Icon name="shield" size={15} /></span>
            <span className="text-[14.5px] font-semibold text-purple flex-1">Paused days</span>
            <button onClick={() => setDlg({ date: today, reason: "", typeId: "" })}
              className="text-white text-[13px] font-medium px-4 py-2 rounded-[10px] inline-flex items-center gap-1.5"
              style={{ background: ACCENT }}>
              <Icon name="plus" size={14} /> Pause a day
            </button>
          </div>
          <div className="divide-y divide-lavender-deep">
            {blackouts.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-lavender/15">
                <span className="text-[13.5px] font-semibold text-purple w-[120px] shrink-0">{fmtDay(b.date)}</span>
                <span className="text-[12.5px] font-medium text-body min-w-0 flex-1 truncate">{b.reason ?? ""}</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                  style={b.typeId ? { background: "#161f3a", color: "#7770eb" } : { background: "#3b1a16", color: "#ed8078" }}>
                  {b.type?.name ?? "Every delivery"}
                </span>
                <IconBtn name="trash" danger title="Remove"
                  onClick={() => { if (confirm(`Resume delivery on ${fmtDay(b.date)}?`)) void run(() => deleteDeliveryBlackout(b.id)); }} />
              </div>
            ))}
            {blackouts.length === 0 && (
              <div className="text-center py-10 text-[13.5px] text-purple font-semibold">No paused days — press Pause a day</div>
            )}
          </div>
        </div>

        {/* ── the enforced rules ── */}
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-lavender-deep">
            <span className="w-8 h-8 rounded-[10px] grid place-items-center text-white shrink-0" style={{ background: ACCENT }}><Icon name="check" size={15} /></span>
            <span className="text-[14.5px] font-semibold text-purple">Rules</span>
          </div>
          <div className="divide-y divide-lavender-deep">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-[13px] font-medium text-body flex-1">Prep photo before out-for-delivery</span>
              <Switch small on={!!settings?.requirePrepPhoto} onClick={() => flip("requirePrepPhoto")} />
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-[13px] font-medium text-body flex-1">Hand-over photo before delivered</span>
              <Switch small on={!!settings?.requireDeliveryPhoto} onClick={() => flip("requireDeliveryPhoto")} />
            </div>
          </div>
        </div>
      </div>

      {dlg && (
        <Modal title="Pause a day" onClose={() => setDlg(null)} onSave={addBlackout} canSave={!!dlg.date} busy={busy}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" required>
              <input type="date" className="ipt w-full" min={today} value={dlg.date}
                onChange={(e) => setDlg({ ...dlg, date: e.target.value })} />
            </Field>
            <Field label="Which delivery" required>
              <select className="ipt w-full" value={dlg.typeId} onChange={(e) => setDlg({ ...dlg, typeId: e.target.value })}>
                <option value="">Every delivery</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Reason">
            <input className="ipt w-full" placeholder="e.g. Eid rush"
              value={dlg.reason} onChange={(e) => setDlg({ ...dlg, reason: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && dlg.date) addBlackout(); }} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
