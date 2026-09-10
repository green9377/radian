"use client";

import { useMemo, useState } from "react";
import Icon from "./Icon";
import { TONE, Panel, Stat, NoteBox, type Tone } from "./OrderViews";
import { WRAP, Header, DemoBadge, StatCards, Section, Field, ToggleField, Switch, EditorEmpty, EditorShell } from "./DeliveryUI";
import { formatTaka } from "../_data/api";
import {
  DEMO_FLEET, DEMO_ZONES, DEMO_RATES, DEMO_SLOTS, DEMO_BLACKOUTS, DEMO_ANALYTICS, DEMO_SETTINGS,
  PROVIDER_LABEL, DELIVERY_TYPE_META,
  type FleetMember, type Zone, type Rate, type TimeSlot, type Provider, type DeliveryType, type DeliverySettings,
} from "../_data/deliveryDemo";

const TYPES: DeliveryType[] = ["TWO_HOUR", "SAME_DAY", "MIDNIGHT", "NATIONWIDE"];
const tk = (p: number) => (p / 100).toString();
const toPaisa = (v: string) => Math.round(Number(v || 0) * 100);
const rnd = () => "n" + Math.random().toString(36).slice(2, 8);

/* ══════════════════════ COURIERS & RIDERS (two-pane) ══════════════════════ */
export function CouriersMaster() {
  const [fleet, setFleet] = useState<FleetMember[]>(() => structuredClone(DEMO_FLEET));
  const [sel, setSel] = useState<string | "new-rider" | "new-courier" | null>(null);

  const riders = fleet.filter((f) => f.kind === "RIDER");
  const couriers = fleet.filter((f) => f.kind === "COURIER");
  const selMember = sel && !sel.startsWith("new") ? fleet.find((f) => f.id === sel) ?? null : null;
  const editing = sel === "new-rider" || sel === "new-courier" || !!selMember;
  const editKind: "RIDER" | "COURIER" = sel === "new-courier" ? "COURIER" : sel === "new-rider" ? "RIDER" : (selMember?.kind ?? "RIDER");

  const toggle = (id: string) => setFleet((b) => b.map((f) => (f.id === id ? { ...f, active: !f.active } : f)));
  function save(m: FleetMember) {
    setFleet((b) => (b.some((f) => f.id === m.id) ? b.map((f) => (f.id === m.id ? m : f)) : [...b, m]));
    setSel(m.id);
  }
  function remove(id: string) { setFleet((b) => b.filter((f) => f.id !== id)); setSel(null); }

  const stats = [
    { l: "Riders (in-house)", v: String(riders.length), c: "#7a2ea8", bg: "#2e1a38", icon: "user" },
    { l: "3PL couriers", v: String(couriers.length), c: "#3182c9", bg: "#18283a", icon: "truck" },
    { l: "Active", v: String(fleet.filter((f) => f.active).length), c: "#12a172", bg: "#1e362b", icon: "check" },
    { l: "API connected", v: String(couriers.filter((f) => f.apiConfigured).length), c: "#d98a0f", bg: "#3b2d18", icon: "bolt" },
    { l: "Deliveries 30d", v: String(fleet.reduce((n, f) => n + f.deliveries30d, 0)), c: "#8b3fb0", bg: "#2c1939", icon: "box" },
    { l: "Avg on-time", v: (Math.round(fleet.filter((f) => f.onTimePct).reduce((n, f) => n + f.onTimePct, 0) / Math.max(1, fleet.filter((f) => f.onTimePct).length))) + "%", c: "#12a172", bg: "#1e362b", icon: "clock" },
  ];

  const Rowlet = ({ f }: { f: FleetMember }) => {
    const on = sel === f.id;
    return (
      <div className={"grid grid-cols-[1fr_auto] items-center gap-2 rounded-[11px] px-3 py-2.5 cursor-pointer border " + (on ? "bg-orchid-soft border-orchid" : f.active ? "bg-white border-lavender-deep hover:border-orchid" : "bg-white border-[#4f3f2b]")} onClick={() => setSel(f.id)}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-[9px] grid place-items-center text-white shrink-0" style={{ background: f.kind === "RIDER" ? TONE.purple.solid : TONE.blue.solid }}><Icon name={f.kind === "RIDER" ? "user" : "truck"} size={15} /></span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium text-purple truncate">{f.name}{!f.active && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#402c18] text-[#f7a96e]">Off</span>}</div>
            <div className="text-[13px] text-body-soft">{PROVIDER_LABEL[f.provider]} · {f.onTimePct}% · {formatTaka(f.baseCostPaisa)}</div>
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()}><Switch on={f.active} onClick={() => toggle(f.id)} small /></div>
      </div>
    );
  };

  return (
    <div className={WRAP}>
      <Header eyebrow="Operations · Delivery" title="Couriers & riders"
        desc="Who Radian hands parcels to — in-house riders for Dhaka's time-critical promises, 3PL couriers for nationwide. Add, edit, and wire the courier API here."
        actions={<>
          <button onClick={() => setSel("new-rider")} className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] hover:border-orchid inline-flex items-center gap-1.5"><Icon name="plus" size={16} /> Add rider</button>
          <button onClick={() => setSel("new-courier")} className="bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-1.5"><Icon name="plus" size={16} /> Add courier</button>
        </>} />
      <DemoBadge text="Sample fleet — every add / edit / toggle works. In production these persist to the database." />
      <StatCards items={stats} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,1fr)_1.5fr] gap-6 items-start">
        <div className="space-y-4 xl:sticky xl:top-4">
          <div>
            <div className="flex items-center gap-2 mb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-purple"><Icon name="user" size={14} /> In-house riders — Dhaka</div>
            <div className="space-y-2">{riders.map((f) => <Rowlet key={f.id} f={f} />)}<button onClick={() => setSel("new-rider")} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-orchid hover:text-purple px-1 py-1"><Icon name="plus" size={14} /> Add rider</button></div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-purple"><Icon name="truck" size={14} /> 3PL couriers — nationwide</div>
            <div className="space-y-2">{couriers.map((f) => <Rowlet key={f.id} f={f} />)}<button onClick={() => setSel("new-courier")} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-orchid hover:text-purple px-1 py-1"><Icon name="plus" size={14} /> Add courier</button></div>
          </div>
        </div>

        <div>
          {editing ? (
            <FleetEditor key={sel} member={selMember} kind={editKind} onSave={save} onDelete={selMember ? () => remove(selMember.id) : undefined} onCancel={() => setSel(null)} />
          ) : (
            <EditorEmpty icon="truck" title="Select or add someone" desc="Pick a rider or courier on the left to edit them, or add a new one. Couriers can hold their consignment API keys here." onAdd={() => setSel("new-courier")} addLabel="Add courier" />
          )}
        </div>
      </div>

      <NoteBox tone="purple">A rider is Delivery-owned for now; once the Employee module lands it links to an Employee record (One Data One Owner). Base cost feeds delivery analytics — it never changes the customer&apos;s delivery charge (that&apos;s the Zones &amp; rates card).</NoteBox>
    </div>
  );
}

function FleetEditor({ member, kind, onSave, onDelete, onCancel }: {
  member: FleetMember | null; kind: "RIDER" | "COURIER";
  onSave: (m: FleetMember) => void; onDelete?: () => void; onCancel: () => void;
}) {
  const isNew = !member;
  const [name, setName] = useState(member?.name ?? "");
  const [provider, setProvider] = useState<Provider>(member?.provider ?? (kind === "RIDER" ? "IN_HOUSE" : "STEADFAST"));
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [vehicle, setVehicle] = useState(member?.vehicle ?? "Motorbike");
  const [areas, setAreas] = useState(member?.areas ?? "");
  const [cost, setCost] = useState(tk(member?.baseCostPaisa ?? (kind === "RIDER" ? 6000 : 8000)));
  const [zones, setZones] = useState<("DHAKA" | "NATIONWIDE")[]>(member?.zones ?? (kind === "RIDER" ? ["DHAKA"] : ["NATIONWIDE"]));
  const [apiBaseUrl, setApiBaseUrl] = useState(member?.apiBaseUrl ?? "");
  const [apiKey, setApiKey] = useState(member?.apiKey ?? "");
  const [merchantId, setMerchantId] = useState(member?.merchantId ?? "");
  const [apiConfigured, setApiConfigured] = useState(member?.apiConfigured ?? false);
  const [active, setActive] = useState(member?.active ?? true);
  const [note, setNote] = useState(member?.note ?? "");

  const toggleZone = (z: "DHAKA" | "NATIONWIDE") => setZones((p) => (p.includes(z) ? p.filter((x) => x !== z) : [...p, z]));

  function submit() {
    if (!name.trim()) return;
    onSave({
      id: member?.id ?? rnd(), name: name.trim(), kind, provider: kind === "RIDER" ? "IN_HOUSE" : provider,
      zones, baseCostPaisa: toPaisa(cost), phone: phone || undefined, apiConfigured: kind === "COURIER" ? apiConfigured : false,
      active, deliveries30d: member?.deliveries30d ?? 0, onTimePct: member?.onTimePct ?? 0,
      vehicle: kind === "RIDER" ? vehicle : undefined, areas: areas || undefined, note: note || undefined,
      apiBaseUrl: apiBaseUrl || undefined, apiKey: apiKey || undefined, merchantId: merchantId || undefined,
    });
  }

  return (
    <EditorShell
      title={isNew ? (kind === "RIDER" ? "New rider" : "New courier") : name || member?.name || ""}
      sub={kind === "RIDER" ? "In-house rider · Dhaka fleet" : "3PL courier · nationwide"}
      onCancel={onCancel} onSave={submit} saveLabel={isNew ? "Add" : "Save"} canSave={!!name.trim()}
      footer={!isNew && onDelete ? (
        <div className="flex justify-between items-center pt-2 border-t border-lavender-deep">
          <button onClick={onDelete} className="text-[13px] font-medium text-[#e1837a] hover:underline inline-flex items-center gap-1.5"><Icon name="trash" size={15} /> Remove</button>
          <button onClick={submit} disabled={!name.trim()} className="bg-purple hover:bg-purple-deep disabled:opacity-60 text-white text-[13.5px] font-medium px-6 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-1.5"><Icon name="check" size={15} /> Save</button>
        </div>
      ) : null}
    >
      <Section title="Basics" icon="user">
        <Field label="Name" required><input className="ipt" placeholder={kind === "RIDER" ? "Rider full name" : "Courier / partner name"} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid md:grid-cols-2 gap-4">
          {kind === "RIDER" ? (
            <>
              <Field label="Phone"><input className="ipt" placeholder="+8801…" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
              <Field label="Vehicle"><select className="ipt" value={vehicle} onChange={(e) => setVehicle(e.target.value)}><option>Motorbike</option><option>Bicycle</option><option>Van</option><option>On foot</option></select></Field>
            </>
          ) : (
            <>
              <Field label="Provider"><select className="ipt" value={provider} onChange={(e) => setProvider(e.target.value as Provider)}><option value="STEADFAST">Steadfast</option><option value="PATHAO">Pathao</option><option value="REDX">RedX</option></select></Field>
              <Field label="Cost per parcel (৳)"><input className="ipt" type="number" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
            </>
          )}
          {kind === "RIDER" && <Field label="Stipend / delivery (৳)"><input className="ipt" type="number" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>}
        </div>
        <Field label={kind === "RIDER" ? "Coverage areas" : "Coverage note"} hint={kind === "RIDER" ? "e.g. Gulshan, Banani, Bashundhara" : "districts or regions this courier covers"}>
          <input className="ipt" value={areas} onChange={(e) => setAreas(e.target.value)} placeholder={kind === "RIDER" ? "Gulshan, Banani…" : "All 64 districts"} />
        </Field>
      </Section>

      {kind === "COURIER" && (
        <>
          <Section title="Coverage zones" icon="pin">
            <div className="flex gap-2">
              {(["DHAKA", "NATIONWIDE"] as const).map((z) => (
                <button key={z} type="button" onClick={() => toggleZone(z)} className={"px-3.5 py-2 rounded-[10px] text-[13px] font-medium border " + (zones.includes(z) ? "bg-orchid-soft border-orchid text-purple" : "bg-white border-lavender-deep text-body-soft")}>
                  {zones.includes(z) && <Icon name="check" size={13} />} {z === "DHAKA" ? "Dhaka" : "Nationwide"}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Consignment API" icon="bolt">
            <div className="rounded-[11px] bg-[#3a2b16] border border-[#534228] px-3.5 py-2.5 text-[12px] text-[#f7a96e]">One-click consignment + auto tracking (P1). Fill these when the courier gives merchant API access. Keys are stored server-side, never shown to customers.</div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="API base URL"><input className="ipt" placeholder="https://portal.courier.com/api/v1" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} /></Field>
              <Field label="Merchant / store ID"><input className="ipt" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} /></Field>
            </div>
            <Field label="API key / secret"><input className="ipt" type="password" placeholder="••••••••••" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></Field>
            <ToggleField label="API connected" hint="one-click consignment enabled for this courier" on={apiConfigured} onToggle={() => setApiConfigured((v) => !v)} />
          </Section>
        </>
      )}

      <Section title="Status & notes" icon="eye">
        <ToggleField label="Active" hint="off = not offered when assigning" on={active} onToggle={() => setActive((v) => !v)} />
        <Field label="Internal note"><textarea className="ipt" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="anything the dispatch team should know" /></Field>
      </Section>
    </EditorShell>
  );
}

/* ══════════════════════ ZONES · SLOTS · RATES (two-pane) ══════════════════════ */
export function ZonesRates() {
  const [zones, setZones] = useState<Zone[]>(() => structuredClone(DEMO_ZONES));
  const [rates, setRates] = useState<Rate[]>(() => structuredClone(DEMO_RATES));
  const [slots, setSlots] = useState<TimeSlot[]>(() => structuredClone(DEMO_SLOTS));
  const [sel, setSel] = useState<string | "new" | null>(null);

  const selZone = sel && sel !== "new" ? zones.find((z) => z.id === sel) ?? null : null;
  const editing = sel === "new" || !!selZone;

  function saveZone(z: Zone, zr: Rate[], zs: TimeSlot[]) {
    setZones((b) => (b.some((x) => x.id === z.id) ? b.map((x) => (x.id === z.id ? z : x)) : [...b, z]));
    setRates((b) => [...b.filter((r) => r.zoneId !== z.id), ...zr]);
    setSlots((b) => [...b.filter((s) => s.zoneId !== z.id), ...zs]);
    setSel(z.id);
  }
  function removeZone(id: string) { setZones((b) => b.filter((z) => z.id !== id)); setRates((b) => b.filter((r) => r.zoneId !== id)); setSlots((b) => b.filter((s) => s.zoneId !== id)); setSel(null); }

  const stats = [
    { l: "Zones", v: String(zones.length), c: "#7a2ea8", bg: "#2e1a38", icon: "pin" },
    { l: "Active types", v: String(rates.filter((r) => r.active).length), c: "#3182c9", bg: "#18283a", icon: "bolt" },
    { l: "Time slots", v: String(slots.length), c: "#8b3fb0", bg: "#2c1939", icon: "clock" },
    { l: "Avg charge", v: formatTaka(Math.round(rates.reduce((n, r) => n + r.chargePaisa, 0) / Math.max(1, rates.length))), c: "#12a172", bg: "#1e362b", icon: "cash" },
    { l: "Slot capacity", v: String(slots.reduce((n, s) => n + s.capacity, 0)), c: "#d98a0f", bg: "#3b2d18", icon: "box" },
    { l: "Blackout dates", v: String(DEMO_BLACKOUTS.length), c: "#b5642f", bg: "#362a1e", icon: "shield" },
  ];

  return (
    <div className={WRAP}>
      <Header eyebrow="Operations · Delivery" title="Zones · slots · rates"
        desc="Where each delivery type is switched on, what it costs, its cut-off, and the time slots + capacity. A table — Dhaka can be split into areas later with no rebuild."
        actions={<button onClick={() => setSel("new")} className="bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-1.5"><Icon name="plus" size={16} /> Add zone</button>} />
      <DemoBadge text="Dhaka Metro + Nationwide seeded. Edit charges, cut-offs and slots; add a zone to see the full editor." />
      <StatCards items={stats} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(300px,1fr)_1.6fr] gap-6 items-start">
        <div className="space-y-2 xl:sticky xl:top-4">
          {zones.map((z) => {
            const on = sel === z.id;
            const zt = rates.filter((r) => r.zoneId === z.id && r.active).length;
            return (
              <div key={z.id} className={"rounded-[12px] px-3.5 py-3 cursor-pointer border " + (on ? "bg-orchid-soft border-orchid" : z.active ? "bg-white border-lavender-deep hover:border-orchid" : "bg-white border-[#4f3f2b]")} onClick={() => setSel(z.id)}>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-[9px] grid place-items-center text-white shrink-0" style={{ background: z.id === "z-dhaka" ? TONE.purple.solid : TONE.blue.solid }}><Icon name="pin" size={15} /></span>
                  <div className="min-w-0 flex-1"><div className="text-[14px] font-medium text-purple truncate">{z.name}</div><div className="text-[13px] text-body-soft capitalize">{z.kind.toLowerCase()} · {zt} type{zt === 1 ? "" : "s"} on</div></div>
                  {!z.active && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#402c18] text-[#f7a96e]">Off</span>}
                </div>
              </div>
            );
          })}
          <button onClick={() => setSel("new")} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-orchid hover:text-purple px-1 py-1"><Icon name="plus" size={14} /> Add zone</button>

          <Panel title="Blackout dates" icon="shield" tone="rose" count={DEMO_BLACKOUTS.length} hint="hard stop — nothing books">
            {DEMO_BLACKOUTS.map((b) => (
              <div key={b.date} className="flex items-center gap-2 border-t border-lavender-deep first:border-t-0 px-4 py-2 text-[12px]">
                <span className="font-medium text-purple">{b.date}</span><span className="text-body-soft">{b.reason}</span>
                <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full" style={{ background: TONE.rose.bg, color: TONE.rose.text }}>{b.scope}</span>
              </div>
            ))}
            <div className="px-4 py-2"><button className="text-[12.5px] font-medium inline-flex items-center gap-1.5 text-purple"><Icon name="plus" size={13} /> Add blackout date</button></div>
          </Panel>
        </div>

        <div>
          {editing ? (
            <ZoneEditor key={sel} zone={selZone} rates={rates.filter((r) => r.zoneId === selZone?.id)} slots={slots.filter((s) => s.zoneId === selZone?.id)} onSave={saveZone} onDelete={selZone ? () => removeZone(selZone.id) : undefined} onCancel={() => setSel(null)} />
          ) : (
            <EditorEmpty icon="pin" title="Select or add a zone" desc="Pick a zone to set which delivery types are on, their charge and cut-off, and the time slots with capacity." onAdd={() => setSel("new")} addLabel="Add zone" />
          )}
        </div>
      </div>

      <NoteBox tone="amber">Delivery owns this <b>rate card</b> (what a delivery costs). The <b>free-delivery threshold / waiver</b> lives in Offers, and checkout stores the final computed charge as a snapshot on the order — so the two never conflict. A &quot;full&quot; slot blocks booking at checkout (enforced in the backend pass).</NoteBox>
    </div>
  );
}

function ZoneEditor({ zone, rates, slots, onSave, onDelete, onCancel }: {
  zone: Zone | null; rates: Rate[]; slots: TimeSlot[];
  onSave: (z: Zone, zr: Rate[], zs: TimeSlot[]) => void; onDelete?: () => void; onCancel: () => void;
}) {
  const isNew = !zone;
  const zid = zone?.id ?? rnd();
  const [name, setName] = useState(zone?.name ?? "");
  const [kind, setKind] = useState<Zone["kind"]>(zone?.kind ?? "AREA");
  const [active, setActive] = useState(zone?.active ?? true);

  type RateDraft = { on: boolean; charge: string; cutoff: string; capacity: string };
  const [rd, setRd] = useState<Record<DeliveryType, RateDraft>>(() => {
    const map = {} as Record<DeliveryType, RateDraft>;
    for (const t of TYPES) {
      const r = rates.find((x) => x.type === t);
      map[t] = { on: !!r?.active, charge: tk(r?.chargePaisa ?? 8000), cutoff: r?.cutoff ?? "—", capacity: String(r?.slotCapacity ?? 50) };
    }
    return map;
  });
  const setR = (t: DeliveryType, patch: Partial<RateDraft>) => setRd((p) => ({ ...p, [t]: { ...p[t], ...patch } }));

  const [zs, setZs] = useState<TimeSlot[]>(() => structuredClone(slots));
  const addSlot = () => setZs((p) => [...p, { id: rnd(), zoneId: zid, label: "New slot", window: "10am-1pm", capacity: 30, booked: 0, active: true }]);
  const setSlot = (id: string, patch: Partial<TimeSlot>) => setZs((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const delSlot = (id: string) => setZs((p) => p.filter((s) => s.id !== id));

  function submit() {
    if (!name.trim()) return;
    const types = TYPES.filter((t) => rd[t].on);
    const outRates: Rate[] = TYPES.filter((t) => rd[t].on).map((t) => ({
      zoneId: zid, type: t, chargePaisa: toPaisa(rd[t].charge), cutoff: rd[t].cutoff || "—",
      slotCapacity: Number(rd[t].capacity) || 0, booked: rates.find((x) => x.type === t)?.booked ?? 0, active: true,
    }));
    onSave({ id: zid, name: name.trim(), kind, parentId: zone?.parentId ?? null, types, active }, outRates, zs.map((s) => ({ ...s, zoneId: zid })));
  }

  return (
    <EditorShell
      title={isNew ? "New zone" : name || zone?.name || ""} sub={isNew ? "Define availability, charges and slots" : `${kind.toLowerCase()} zone`}
      onCancel={onCancel} onSave={submit} saveLabel={isNew ? "Add zone" : "Save"} canSave={!!name.trim()}
      footer={!isNew && onDelete ? (
        <div className="flex justify-between items-center pt-2 border-t border-lavender-deep">
          <button onClick={onDelete} className="text-[13px] font-medium text-[#e1837a] hover:underline inline-flex items-center gap-1.5"><Icon name="trash" size={15} /> Remove zone</button>
          <button onClick={submit} disabled={!name.trim()} className="bg-purple hover:bg-purple-deep disabled:opacity-60 text-white text-[13.5px] font-medium px-6 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-1.5"><Icon name="check" size={15} /> Save</button>
        </div>
      ) : null}
    >
      <Section title="Basics" icon="pin">
        <Field label="Zone name" required hint="e.g. Dhaka Metro, Gulshan-Banani, Chattogram"><input className="ipt" value={name} onChange={(e) => setName(e.target.value)} placeholder="Zone name" /></Field>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Type"><select className="ipt" value={kind} onChange={(e) => setKind(e.target.value as Zone["kind"])}><option value="CITY">City</option><option value="AREA">Area / thana</option><option value="REGION">Region (nationwide)</option></select></Field>
          <div className="flex items-end"><ToggleField label="Zone active" hint="off = no delivery here" on={active} onToggle={() => setActive((v) => !v)} /></div>
        </div>
      </Section>

      <Section title="Delivery types & charges" icon="bolt">
        <div className="space-y-2">
          {TYPES.map((t) => {
            const m = DELIVERY_TYPE_META[t]; const d = rd[t]; const tn = TONE[m.tone as Tone];
            return (
              <div key={t} className="rounded-[12px] border px-3 py-2.5" style={{ borderColor: d.on ? tn.border : "#3d3149", background: d.on ? tn.bg : "#271f30" }}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon name={m.icon} size={14} /><span className="text-[13px] font-semibold" style={{ color: tn.text }}>{m.label}</span>
                  <div className="ml-auto"><Switch on={d.on} onClick={() => setR(t, { on: !d.on })} small /></div>
                </div>
                {d.on && (
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-[13px] text-body-soft">Charge (৳)<input className="ipt mt-1" type="number" value={d.charge} onChange={(e) => setR(t, { charge: e.target.value })} /></label>
                    <label className="text-[13px] text-body-soft">Cut-off<input className="ipt mt-1" value={d.cutoff} onChange={(e) => setR(t, { cutoff: e.target.value })} placeholder="2:00 PM" /></label>
                    <label className="text-[13px] text-body-soft">Slot cap.<input className="ipt mt-1" type="number" value={d.capacity} onChange={(e) => setR(t, { capacity: e.target.value })} /></label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Time slots" icon="clock">
        <div className="space-y-2">
          {zs.length === 0 && <div className="text-[13px] text-body-soft">No slots yet — add the windows customers can pick.</div>}
          {zs.map((s) => (
            <div key={s.id} className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-center">
              <input className="ipt" value={s.label} onChange={(e) => setSlot(s.id, { label: e.target.value })} placeholder="Label" />
              <input className="ipt" value={s.window} onChange={(e) => setSlot(s.id, { window: e.target.value })} placeholder="4pm-6pm" />
              <input className="ipt !w-[86px]" type="number" value={s.capacity} onChange={(e) => setSlot(s.id, { capacity: Number(e.target.value) })} title="capacity" />
              <div title="active"><Switch on={s.active} onClick={() => setSlot(s.id, { active: !s.active })} small /></div>
              <button onClick={() => delSlot(s.id)} className="text-body-soft hover:text-[#e1837a]" title="remove"><Icon name="trash" size={16} /></button>
            </div>
          ))}
          <button onClick={addSlot} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-orchid hover:text-purple px-1 py-1"><Icon name="plus" size={14} /> Add time slot</button>
        </div>
      </Section>
    </EditorShell>
  );
}

/* ══════════════════════ SETTINGS ══════════════════════ */
export function DeliverySettingsView() {
  const [s, setS] = useState<DeliverySettings>(() => ({ ...DEMO_SETTINGS }));
  const set = (k: keyof DeliverySettings, v: boolean | number | string) => setS((p) => ({ ...p, [k]: v }));

  return (
    <div className={WRAP}>
      <Header eyebrow="Operations · Delivery" title="Delivery settings" desc="The rules that govern how Delivery behaves — all admin-configurable, nothing hardcoded." />
      <DemoBadge text="Sample defaults. In production these persist and the backend enforces them." />

      <div className="grid md:grid-cols-2 gap-5">
        <Panel title="Assignment & proof" icon="shield" tone="purple">
          <div className="p-4 space-y-3">
            <ToggleField label="Auto-assign riders" hint="suggest the freest rider by zone and load" on={s.autoAssign} onToggle={() => set("autoAssign", !s.autoAssign)} />
            <ToggleField label="Require prep photo" hint="cannot mark out for delivery without a prep photo" on={s.requirePrepPhoto} onToggle={() => set("requirePrepPhoto", !s.requirePrepPhoto)} />
            <ToggleField label="Require delivery photo" hint="cannot mark delivered without a hand-over photo" on={s.requireDeliveryPhoto} onToggle={() => set("requireDeliveryPhoto", !s.requireDeliveryPhoto)} />
          </div>
        </Panel>
        <Panel title="Attempts & returns" icon="box" tone="amber">
          <div className="p-4 grid grid-cols-2 gap-3">
            <Field label="Max attempts"><input className="ipt" type="number" value={s.maxAttempts} onChange={(e) => set("maxAttempts", Number(e.target.value))} /></Field>
            <Field label="RTO after attempts"><input className="ipt" type="number" value={s.rtoAfterAttempts} onChange={(e) => set("rtoAfterAttempts", Number(e.target.value))} /></Field>
            <div className="col-span-2"><Field label="Midnight cut-off"><input className="ipt" value={s.midnightCutoff} onChange={(e) => set("midnightCutoff", e.target.value)} /></Field></div>
          </div>
        </Panel>
        <Panel title="Customer notifications" icon="phone" tone="blue" hint="Delivery triggers; Automation module sends">
          <div className="p-4 space-y-3">
            <ToggleField label="Notify on out-for-delivery" hint="SMS / WhatsApp when the rider leaves" on={s.notifyOnOutForDelivery} onToggle={() => set("notifyOnOutForDelivery", !s.notifyOnOutForDelivery)} />
            <ToggleField label="Notify on delivered" hint="confirmation + proof photo link" on={s.notifyOnDelivered} onToggle={() => set("notifyOnDelivered", !s.notifyOnDelivered)} />
          </div>
        </Panel>
        <Panel title="Ownership" icon="shield" tone="green">
          <div className="p-4 text-[13px] text-body-soft">Sending the message belongs to the Automation module — Delivery only emits the event. Who may assign / mark delivered / edit this comes from Roles &amp; Permissions (admin-configurable), never hardcoded.</div>
        </Panel>
      </div>
    </div>
  );
}

/* ══════════════════════ ANALYTICS ══════════════════════ */
export function DeliveryAnalyticsView() {
  const a = DEMO_ANALYTICS;
  const maxDay = useMemo(() => Math.max(1, ...a.daily.map((d) => d.delivered + d.failed)), [a]);

  const Bars = ({ title, icon, tone, rows }: { title: string; icon: string; tone: Tone; rows: { name: string; value: number; sub: string }[] }) => {
    const max = Math.max(1, ...rows.map((r) => r.value));
    return (
      <Panel title={title} icon={icon} tone={tone}>
        <div className="p-4 flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.name}>
              <div className="flex justify-between text-[12.5px] mb-1"><span className="text-body font-medium">{r.name}</span><span className="text-body-soft">{r.sub}</span></div>
              <div className="h-[9px] rounded-full bg-lavender overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.round((r.value / max) * 100)}%`, background: TONE[tone].solid }} /></div>
            </div>
          ))}
        </div>
      </Panel>
    );
  };

  return (
    <div className={WRAP}>
      <Header eyebrow="Operations · Delivery" title="Delivery performance" desc="How the promise is actually kept — on-time rate, failures, average time, by courier and by zone." />
      <DemoBadge text="Sample 30-day performance. Real figures come from Radian's own database — never GA4." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="On-time" value={`${a.onTimePct}%`} tone="green" icon="check" sub="last 30 days" />
        <Stat label="Failed" value={`${a.failedPct}%`} tone="rose" icon="shield" sub={`${a.failed30d} deliveries`} />
        <Stat label="Avg delivery time" value={`${Math.round(a.avgMins / 60)}h ${a.avgMins % 60}m`} tone="blue" icon="clock" />
        <Stat label="Delivered" value={String(a.delivered30d)} tone="purple" icon="truck" sub="30 days" />
      </div>

      <Panel title="Delivered vs failed — daily" icon="chart" tone="purple" hint="Source: Radian DB">
        <div className="p-4 flex items-end gap-3 h-[160px]">
          {a.daily.map((d, i) => {
            const h = Math.round(((d.delivered + d.failed) / maxDay) * 120);
            const fh = Math.round((d.failed / Math.max(1, d.delivered + d.failed)) * h);
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t-[6px] overflow-hidden flex flex-col justify-end" style={{ height: h }}><div style={{ height: fh, background: TONE.rose.solid }} /><div style={{ height: h - fh, background: TONE.green.solid }} /></div>
                <span className="text-[13px] text-body-soft">{d.label}</span>
              </div>
            );
          })}
        </div>
        <div className="px-4 pb-3 flex gap-4 text-[11.5px]">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: TONE.green.solid }} /> Delivered</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: TONE.rose.solid }} /> Failed</span>
        </div>
      </Panel>

      <div className="grid md:grid-cols-2 gap-5">
        <Bars title="By courier / rider" icon="user" tone="blue" rows={a.byCourier.map((c) => ({ name: c.name, value: c.delivered, sub: `${c.delivered} · ${c.onTimePct}% on-time` }))} />
        <Bars title="By zone" icon="pin" tone="purple" rows={a.byZone.map((z) => ({ name: z.name, value: z.delivered, sub: `${z.delivered} · ${z.onTimePct}% · ${z.avgMins < 120 ? z.avgMins + "m" : Math.round(z.avgMins / 60) + "h"} avg` }))} />
        <Bars title="By delivery type" icon="bolt" tone="amber" rows={a.byType.map((ty) => ({ name: DELIVERY_TYPE_META[ty.type].label, value: ty.delivered, sub: `${ty.delivered} · ${ty.onTimePct}% on-time` }))} />
        <Panel title="Where the numbers come from" icon="shield" tone="green">
          <div className="p-4 text-[13px] text-body-soft">On-time %, failures and delivery time come from Radian&apos;s own delivery records — never GA4 (ad-blockers, phone/POS orders and 24-48h delay make GA4 unreliable for operations). GA4 is only for the upper funnel.</div>
        </Panel>
      </div>
    </div>
  );
}

/*  OFFERS & RULES left this file on 19 Aug 2026 — it was a mock (fake
    blackout dates, switches that saved nothing). The real Blackout & rules
    tab lives in ZonesAvailability (BlackoutRules, DEC-DLV-019/020).  */
