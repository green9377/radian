"use client";

import { useState, useEffect } from "react";
import Icon from "./Icon";
import { WRAP, Header, Switch } from "./DeliveryUI";
import { TONE, type Tone } from "./OrderViews";
import { formatTaka } from "../_data/api";
import { DELIVERY_TYPE_META, type DeliveryType } from "../_data/deliveryDemo";
import {
  listDeliveryAreas, createDeliveryArea, updateDeliveryArea, deleteDeliveryArea,
  listDeliveryTypes, createDeliveryType, updateDeliveryType,
  listDeliveryMethods, createDeliveryMethod, updateDeliveryMethod, deleteDeliveryMethod,
  addDeliverySlot, updateDeliverySlot, deleteDeliverySlot,
  TIMING_META,
  type ApiDeliveryArea, type ApiDeliveryType, type ApiDeliveryMethod,
  type DeliveryTiming,
} from "../_data/api";

/*
  ═══════════════════════════════════════════════════════════════════════════
  ⚠️ এই পর্দাটা DEMO ছিল — ১ আগস্ট ২০২৬ পর্যন্ত।

  `DEMO_ZONE_TREE`, `DEMO_ZONE_TYPES`, `DEMO_ZONE_SLOTS` — তিনটাই
  `structuredClone` করে browser-এর ভেতরে বসে থাকত। মালিক Dhanmondi-র Same
  day-র charge ৳৮০ থেকে ৳৯০ করতেন, "Save" চাপতেন, সংখ্যাটা বদলাত — আর
  refresh দিলেই ৳৮০ ফিরে আসত। database কোনোদিন জানতই না।

  মালিকের নির্দেশ: *"delivery module-এ যা edit বা change করা হয়, তা যেন auto
  পুরা system-এ কাজ করে — frontend, product upload page, আর যেখানে দরকার সব
  জায়গায়।"* যে পর্দা নিজেই save করে না, তার কাছ থেকে "সব জায়গায়" আশা করা যায় না।

  দেখতে এক রকমই আছে — চার কলাম, একই বোতাম। শুধু নিচের তারগুলো বদলেছে।

  ── পর্দার শব্দ ↔ টেবিলের শব্দ ──────────────────────────────────────────
    Zone / sub-zone   →  DeliveryArea      (parentId null = মূল zone)
    Delivery type     →  DeliveryMethod    (এক এলাকার এক দাম)
    ↳ নামটা           →  DeliveryType      (দোকানজুড়ে একবার)
    Time slot         →  DeliverySlot

  ⚠️ একটা "type" যোগ করলে **দুটো** জিনিস হয়: নামটা আগে থেকে না থাকলে
  `DeliveryType` বানানো হয়, তারপর ওই এলাকার জন্য একটা দাম। কারণ Dhanmondi-র
  "Same day" আর Gulshan-এর "Same day" **একই নাম, দুই দাম** — product একটাই
  নামের সাথে যুক্ত হয়, দামের সাথে নয়।
  ═══════════════════════════════════════════════════════════════════════════
*/

/*  পর্দার নিজের আকার — API-র সারি থেকে বানানো হয়। UI-এর বাকি অংশ আগে
    এগুলোই পড়ত, তাই একটাও component বদলাতে হয়নি।  */
interface ZoneNode { id: string; name: string; parentId: string | null; active: boolean }
interface ZoneType {
  id: string; zoneId: string; name: string; kind: DeliveryType;
  chargePaisa: number; active: boolean; etaText?: string; typeId: string | null;
}
interface ZoneSlot {
  id: string; typeId: string; label: string; window: string;
  capacity: number; booked: number; cutoff: string; active: boolean;
}

/**
 * পর্দার icon আর রঙ — **আর কিছুই নয়**।
 *
 * ⚠️ আগে এই আন্দাজটা নিয়মও ঠিক করত (কে তারিখ বাছবে, কে slot)। এখন সেটা
 * `timing` column বলে। এটা শুধু ছবির জন্য রয়ে গেছে, তাই ভুল হলে সর্বোচ্চ
 * একটা icon বেমানান লাগবে — কোনো order ভুল হবে না।
 */
function uiKind(timing: DeliveryTiming | undefined, kind: "RIDER" | "COURIER"): DeliveryType {
  if (timing === "LEAD_DAYS" || kind === "COURIER") return "NATIONWIDE";
  if (timing === "PICK_DATE_FIXED") return "MIDNIGHT";
  if (timing === "FROM_CONFIRM") return "TWO_HOUR";
  return "SAME_DAY";
}

/** 540 → "9:00 AM" ; দুটো মিলে "9:00 AM - 12:00 PM" */
function windowText(a?: number | null, b?: number | null): string {
  if (a == null || b == null) return "—";
  return fmtMin(a) + " - " + fmtMin(b);
}

/*  ⚠️ `TYPES` — চারটা fixed ধরনের তালিকা — এখানে ছিল, আর সেটাই ছিল মালিকের
    অভিযোগের কারণ: *"Schedule delivery add করার জায়গা নেই।"* তালিকাটা কোডে
    লেখা ছিল আর তাতে Schedule It ছিলই না। এখন `TIMING_META` (পাঁচটা ছাঁচ)।  */
const rnd = () => "n" + Math.random().toString(36).slice(2, 8);
const toPaisa = (v: string) => Math.round(Number(v || 0) * 100);
const tk = (p: number) => (p / 100).toString();
const isLead = (t?: ZoneType | null) => !!t && t.kind === "NATIONWIDE"; // lead-time: no cut-off / no slots

/**
 * আজকের ঘড়ি এই delivery-র জন্য অর্থপূর্ণ কি না।
 *
 * ⚠️ মালিক ধরেছেন: *"Schedule It-এ আমার morning slot closed হয়ে গেছে, সেটা
 * কেন closed হবে? এটা তো just আজকের দিনের জন্য না।"* — একদম ঠিক। cut-off
 * মানে "**আজকের** জন্য শেষ কখন order নেওয়া যাবে"। customer কালকের তারিখ
 * বাছলে কালকের ১০টা তো এখনো আসেইনি, তাই slot খোলা।
 *
 * তাই যেসব ছাঁচে customer তারিখ বাছে, সেখানে ব্যাজ "Closed" নয় —
 * "Closed today"। আর যেগুলো শুধু আজকের (Same Day), সেখানে "Closed"-ই সত্যি।
 */
const picksDate = (timing?: DeliveryTiming) =>
  timing === "PICK_DATE_SLOT" || timing === "PICK_DATE_FIXED";
function parseTime(str: string): number | null {
  if (!str) return null;
  const m = str.trim().toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let h = Number(m[1]); const mm = m[2] ? Number(m[2]) : 0; const ap = m[3];
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return h * 60 + mm;
}
function nowDhakaMin(): number {
  const parts = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour12: false }).split(":");
  return Number(parts[0]) * 60 + Number(parts[1]);
}
function fmtMin(t: number): string {
  const h = Math.floor(t / 60), m = t % 60; const ap = h >= 12 ? "PM" : "AM"; const h12 = ((h + 11) % 12) + 1;
  return h12 + ":" + String(m).padStart(2, "0") + " " + ap;
}

function Col({ title, sub, tone, icon, count, children }: { title: string; sub?: string; tone: Tone; icon: string; count?: number; children: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <div className="rounded-[16px] border shadow-soft bg-white overflow-hidden flex flex-col" style={{ borderColor: t.border }}>
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: t.bg, borderBottom: `1px solid ${t.border}` }}>
        <span className="w-7 h-7 rounded-[9px] grid place-items-center text-white shrink-0" style={{ background: t.solid }}><Icon name={icon} size={15} /></span>
        <div className="min-w-0"><div className="font-display text-[14.5px] leading-tight" style={{ color: t.text }}>{title}</div>{sub && <div className="text-[11px] opacity-75 truncate" style={{ color: t.text }}>{sub}</div>}</div>
        {count !== undefined && <span className="ml-auto text-[11.5px] font-medium px-2 py-0.5 rounded-full text-white" style={{ background: t.solid }}>{count}</span>}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">{children}</div>
    </div>
  );
}
const IconBtn = ({ name, onClick, danger }: { name: string; onClick: () => void; danger?: boolean }) => (
  <button onClick={(e) => { e.stopPropagation(); onClick(); }} className={"w-6 h-6 grid place-items-center rounded-[7px] shrink-0 " + (danger ? "text-body-soft hover:text-[#c0392b] hover:bg-[#fdecee]" : "text-body-soft hover:text-purple hover:bg-lavender")}><Icon name={name} size={13} /></button>
);

export function ZonesAvailability() {
  const [zones, setZones] = useState<ZoneNode[]>([]);
  const [types, setTypes] = useState<ZoneType[]>([]);
  const [slots, setSlots] = useState<ZoneSlot[]>([]);
  /** নামের তালিকা — দোকানজুড়ে, এলাকা-নিরপেক্ষ (DEC-DLV-008) */
  const [names, setNames] = useState<ApiDeliveryType[]>([]);
  const [selZone, setSelZone] = useState<string | null>(null);
  const [selType, setSelType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 30000); return () => clearInterval(id); }, []);

  /*
    ⚠️ প্রতিটা বদলের পর পুরো তালিকা আবার পড়া হয়, শুধু state ঠিক করা হয় না।

    এটা একটু বেশি খরচ, আর ইচ্ছাকৃত। এই পর্দায় একটা কাজ চারটা টেবিল ছোঁয় —
    একটা এলাকা মুছলে তার দাম যায়, দাম গেলে তার slot যায়। browser-এ সেই
    হিসাব আবার লিখলে সেটা server-এর হিসাবের দ্বিতীয় সংস্করণ হতো, আর একদিন
    দুটো আলাদা উত্তর দিত। server যা বলে, পর্দা তাই দেখায়।
  */
  async function reload() {
    setErr("");
    try {
      const [a, t, m] = await Promise.all([
        listDeliveryAreas(),
        listDeliveryTypes(),
        listDeliveryMethods(),
      ]);
      setZones(a.map((z: ApiDeliveryArea) => ({
        id: z.id, name: z.name, parentId: z.parentId, active: z.isActive,
      })));
      setNames(t);
      setTypes(
        m.map((x: ApiDeliveryMethod) => ({
          id: x.id,
          /*  দাম কোন এলাকার। `areaId` না থাকলে সেটা পুরো zone-এর নিয়ম, আর
              পর্দায় সেটা মূল zone-এর নিচে বসে।  */
          zoneId: x.areaId ?? (a.find((z) => !z.parentId && z.zone === x.zone)?.id ?? ""),
          name: x.type?.name ?? x.label,
          kind: uiKind(t.find((n) => n.id === x.typeId)?.timing, x.kind),
          chargePaisa: x.feePaisa,
          active: x.isActive,
          etaText: x.etaLabel ?? undefined,
          typeId: x.typeId ?? null,
        })),
      );
      setSlots(
        m.flatMap((x: ApiDeliveryMethod) =>
          (x.slots ?? []).map((sl) => ({
            id: sl.id,
            typeId: x.id,
            label: sl.label,
            window: windowText(sl.startMin, sl.endMin),
            capacity: sl.capacityPerDay ?? 0,
            /*  ⚠️ সবসময় ০ — এখনো। আজকের কতটা বুক হয়েছে সেটা `/delivery/slot-load`
                জানে, আর সেটা তারিখ ধরে আসে। এই পর্দা setup-এর, আজকের নয়।  */
            booked: 0,
            cutoff: sl.cutoffTime ?? "—",
            active: sl.isActive,
          })),
        ),
      );
      setSelZone((cur) => cur ?? a.find((z) => !z.parentId)?.id ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load the delivery setup.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void reload(); }, []);

  /** যেকোনো লেখার কাজ — চলুক, তারপর সবটা আবার পড়ো, ভুল হলে বলো */
  async function run(fn: () => Promise<unknown>) {
    setErr("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save that.");
    }
  }

  const [zoneForm, setZoneForm] = useState<{ mode: string | null; name: string }>({ mode: null, name: "" });
  const [editZone, setEditZone] = useState<{ id: string; name: string } | null>(null);
  const [typeForm, setTypeForm] = useState<{
    open: boolean; editId: string | null; name: string;
    timing: DeliveryTiming; charge: string; eta: string;
    minutes: string; openFrom: string; openTo: string;
  }>({ open: false, editId: null, name: "", timing: "TODAY_SLOT", charge: "80", eta: "1 - 3 days", minutes: "120", openFrom: "10:00 AM", openTo: "9:00 PM" });
  const [slotForm, setSlotForm] = useState<{ open: boolean; editId: string | null; label: string; window: string; capacity: string; cutoff: string }>({ open: false, editId: null, label: "", window: "", capacity: "40", cutoff: "" });

  const mains = zones.filter((z) => !z.parentId);
  const subsOf = (id: string) => zones.filter((z) => z.parentId === id);
  const typesOf = (zid: string) => types.filter((t) => t.zoneId === zid);
  const slotsOf = (tid: string) => slots.filter((s) => s.typeId === tid);
  const zoneName = (id: string | null) => zones.find((z) => z.id === id)?.name ?? "";
  const selT = types.find((t) => t.id === selType) ?? null;
  const nowMin = nowDhakaMin();
  const nowLabel = fmtMin(nowMin);

  function pickZone(id: string) { setSelZone(id); setSelType(null); }

  /** দামের সারি থেকে তার নামের সারি — ছাঁচ, সময়, জানালা সব ওখানে */
  const nameOf = (t?: ZoneType | null) => (t ? names.find((n) => n.id === t.typeId) : undefined);

  /* ---- zone CRUD ---- */
  function addZone() {
    if (!zoneForm.name.trim()) return;
    const parentId = zoneForm.mode === "main" ? null : zoneForm.mode;
    /*  মূল zone-এর ধরন জিজ্ঞেস করা হয় না — নামটাই বলে দেয়। "Nationwide",
        "All Bangladesh", "Courier" লেখা থাকলে দেশজুড়ে, নাহলে ঢাকা। ভুল হলে
        মালিক নাম বদলে দিলেই হয়, আর একটা dropdown কম।  */
    const looksNationwide = /nation|bangladesh|courier|দেশ/i.test(zoneForm.name);
    void run(async () => {
      const made = await createDeliveryArea({
        name: zoneForm.name.trim(),
        parentId,
        zone: parentId ? undefined : looksNationwide ? "BANGLADESH" : "DHAKA",
      });
      setZoneForm({ mode: null, name: "" });
      setSelZone(made.id);
      setSelType(null);
    });
  }
  function saveEditZone() {
    if (!editZone || !editZone.name.trim()) return;
    const { id, name } = editZone;
    void run(async () => {
      await updateDeliveryArea(id, { name: name.trim() });
      setEditZone(null);
    });
  }
  function deleteZone(id: string) {
    const kids = zones.filter((z) => z.parentId === id);
    /*  ⚠️ ভেতরে এলাকা থাকলে server নিজেই আটকায় ("remove the areas inside it
        first")। এখানে আগে থেকে বলে দেওয়া হয় শুধু ভদ্রতার জন্য — নিয়মটা
        server-এর, আর সেটাই একমাত্র জায়গা যেখানে সেটা থাকা নিরাপদ।  */
    if (kids.length) {
      alert("Remove the areas inside it first.");
      return;
    }
    if (typesOf(id).length && !confirm("Delete this place and its delivery types?")) return;
    void run(async () => {
      await deleteDeliveryArea(id);
      if (selZone === id) { setSelZone(null); setSelType(null); }
    });
  }

  /* ---- type CRUD ---- */
  const blankType = { open: true, editId: null as string | null, name: "", timing: "TODAY_SLOT" as DeliveryTiming, charge: "80", eta: "1 - 3 days", minutes: "120", openFrom: "10:00 AM", openTo: "9:00 PM" };
  function openAddType() { setTypeForm(blankType); }
  function openEditType(t: ZoneType) {
    /*  ছাঁচ আর সময় থাকে **নামের** সারিতে, দামের সারিতে নয় — একই নাম দুই
        এলাকায় থাকলে দুই জায়গায় দুই ছাঁচ হতে পারত, আর সেটা অর্থহীন।  */
    const nm = names.find((n) => n.id === t.typeId);
    setTypeForm({
      open: true, editId: t.id, name: t.name,
      timing: nm?.timing ?? "TODAY_SLOT",
      charge: tk(t.chargePaisa),
      eta: t.etaText ?? "1 - 3 days",
      minutes: nm?.promiseMinutes != null ? String(nm.promiseMinutes) : "120",
      openFrom: nm?.openFromMin != null ? fmtMin(nm.openFromMin) : "10:00 AM",
      openTo: nm?.openToMin != null ? fmtMin(nm.openToMin) : "9:00 PM",
    });
  }

  function saveType() {
    if (!typeForm.name.trim() || !selZone) return;
    const area = zones.find((z) => z.id === selZone);
    if (!area) return;
    const isMainZone = !area.parentId;
    /*  মূল zone-এ বসালে দামটা পুরো zone-এর (areaId = null); এলাকায় বসালে
        শুধু ওই এলাকার। "বেশি নির্দিষ্টতা জেতে" — DEC-DLV-009।  */
    const areaId = isMainZone ? null : selZone;
    const root = isMainZone ? area : zones.find((z) => z.id === area.parentId);
    const zoneCode = /nation|bangladesh/i.test(root?.name ?? "") ? "BANGLADESH" : "DHAKA";
    const meta = TIMING_META[typeForm.timing];
    const lead = typeForm.timing === "LEAD_DAYS";
    const nm = typeForm.name.trim();

    /*  ছাঁচ, প্রতিশ্রুত সময় আর জানালা — সবই **নামের** সারিতে। একই নাম দুই
        এলাকায় বসলে দাম আলাদা হতে পারে, কিন্তু "এটা ২ ঘণ্টার delivery" —
        সেটা দুই জায়গায় দুই রকম হতে পারে না।  */
    const nameFields = {
      timing: typeForm.timing,
      promiseMinutes: meta.needsMinutes ? Number(typeForm.minutes) || null : null,
      openFromMin: meta.needsWindow ? parseTime(typeForm.openFrom) : null,
      openToMin: meta.needsWindow ? parseTime(typeForm.openTo) : null,
    };

    void run(async () => {
      /*  ⚠️ একটা type যোগ করা মানে দুটো কাজ। নামটা দোকানজুড়ে একবারই থাকে,
          তাই আগে দেখা হয় এই নাম আগে থেকে আছে কি না — থাকলে সেটাই ব্যবহার
          হয়। নাহলে Dhanmondi-র "Same day" আর Gulshan-এর "Same day" দুটো
          আলাদা নাম হয়ে যেত, আর product-এ দুবার একই জিনিস দেখা যেত।  */
      let nameRow = names.find(
        (n) => n.zone === zoneCode && n.name.trim().toLowerCase() === nm.toLowerCase(),
      );
      if (!nameRow) {
        nameRow = await createDeliveryType({
          name: nm, zone: zoneCode, kind: lead ? "COURIER" : "RIDER", ...nameFields,
        });
      } else {
        await updateDeliveryType(nameRow.id, {
          name: nm, kind: lead ? "COURIER" : "RIDER", ...nameFields,
        });
      }

      const body = {
        label: nm,
        zone: zoneCode,
        kind: lead ? "COURIER" : "RIDER",
        feePaisa: toPaisa(typeForm.charge),
        etaLabel: lead ? typeForm.eta : null,
        areaId,
        typeId: nameRow.id,
      };
      if (typeForm.editId) await updateDeliveryMethod(typeForm.editId, body);
      else {
        const made = await createDeliveryMethod(body);
        setSelType(made.id);
      }
      /*  ⚠️ এই সারিটা পুরনো আকারে ছিল — `kind: "SAME_DAY"`, যেটা এই form-এ আর
          নেই (এখন `timing`), আর বাকি তিনটে ঘর একেবারে বাদ পড়ত। TypeScript
          এখানেই আটকে যেত, অর্থাৎ admin build হচ্ছিল না। একই খালি form দুই
          জায়গায় লেখার বদলে `blankType`-ই ব্যবহার হচ্ছে, শুধু বন্ধ অবস্থায়।  */
      setTypeForm({ ...blankType, open: false });
    });
  }

  const toggleType = (id: string) => {
    const t = types.find((x) => x.id === id);
    if (!t) return;
    void run(() => updateDeliveryMethod(id, { isActive: !t.active }));
  };
  function delType(id: string) {
    void run(async () => {
      await deleteDeliveryMethod(id);
      if (selType === id) setSelType(null);
    });
  }

  /* ---- slot CRUD ---- */
  function openAddSlot() { setSlotForm({ open: true, editId: null, label: "", window: "", capacity: "40", cutoff: "" }); }
  function openEditSlot(s: ZoneSlot) { setSlotForm({ open: true, editId: s.id, label: s.label, window: s.window === "—" ? "" : s.window, capacity: String(s.capacity), cutoff: s.cutoff === "—" ? "" : s.cutoff }); }

  function saveSlot() {
    if (!slotForm.label.trim() || !selType) return;
    /*  "9am - 12pm" → দুটো সংখ্যা। মালিক যেভাবে খুশি লিখুন, টেবিলে যায়
        মিনিট — কারণ checkout-কে হিসাব করতে হয় সময় পেরিয়েছে কি না, আর
        লেখা দিয়ে হিসাব হয় না।  */
    const parts = slotForm.window.split(/[-–—]/);
    const startMin = parts[0] ? parseTime(parts[0]) : null;
    const endMin = parts[1] ? parseTime(parts[1]) : null;
    const cutMin = parseTime(slotForm.cutoff);
    const cutoffTime =
      cutMin === null
        ? null
        : String(Math.floor(cutMin / 60)).padStart(2, "0") + ":" + String(cutMin % 60).padStart(2, "0");

    const body = {
      label: slotForm.label.trim(),
      capacityPerDay: Number(slotForm.capacity) || null,
      startMin, endMin, cutoffTime,
    };
    void run(async () => {
      if (slotForm.editId) await updateDeliverySlot(slotForm.editId, body);
      else await addDeliverySlot(selType, body);
      setSlotForm({ open: false, editId: null, label: "", window: "", capacity: "40", cutoff: "" });
    });
  }
  const toggleSlot = (id: string) => {
    const sl = slots.find((x) => x.id === id);
    if (!sl) return;
    void run(() => updateDeliverySlot(id, { isActive: !sl.active }));
  };
  const delSlot = (id: string) => void run(() => deleteDeliverySlot(id));

  const addBtn = "inline-flex items-center gap-1.5 text-[12.5px] font-medium text-orchid hover:text-purple px-1 py-1.5";

  const ZoneRow = ({ z, sub }: { z: ZoneNode; sub?: boolean }) => {
    const on = selZone === z.id; const editing = editZone?.id === z.id;
    if (editing) return (
      <div className="flex gap-1.5 py-1"><input autoFocus className="ipt !h-[32px] !py-1 text-[12.5px]" value={editZone!.name} onChange={(e) => setEditZone({ id: z.id, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveEditZone()} /><button onClick={saveEditZone} className="bg-purple text-white text-[12px] px-2.5 rounded-[8px]">Save</button><button onClick={() => setEditZone(null)} className="text-[11px] px-1 text-body-soft">✕</button></div>
    );
    return (
      <div onClick={() => pickZone(z.id)} className={"flex items-center gap-2 rounded-[10px] px-2.5 py-2 cursor-pointer border " + (on ? "border-orchid bg-orchid-soft" : "border-transparent hover:bg-lavender/50")}>
        {sub ? <span className="w-1.5 h-1.5 rounded-full bg-orchid shrink-0" /> : <span className="w-6 h-6 rounded-[7px] grid place-items-center text-white shrink-0" style={{ background: TONE.purple.solid }}><Icon name="pin" size={12} /></span>}
        <span className={"flex-1 truncate " + (sub ? "text-[12.5px] font-medium text-body" : "text-[13.5px] font-semibold text-purple")}>{z.name}</span>
        <span className="text-[10px] text-body-soft mr-1">{sub ? `${typesOf(z.id).length} type` : `${subsOf(z.id).length} area`}</span>
        <IconBtn name="edit" onClick={() => setEditZone({ id: z.id, name: z.name })} />
        <IconBtn name="trash" danger onClick={() => deleteZone(z.id)} />
      </div>
    );
  };

  return (
    <div className={WRAP}>
      <Header eyebrow="Operations · Delivery · Setup" title="Zones · types · slots"
        desc="Top-down: a zone holds delivery types (with charge), each time-bound type holds its slots. Nationwide is lead-time — no cut-off, order anytime." />
      {/*
        ⚠️ এখানে "DEMO DATA" ব্যাজ ছিল, আর সেটা সত্যি ছিল — ১ আগস্ট ২০২৬
        পর্যন্ত পর্দাটা কিছুই save করত না। এখন করে, তাই ব্যাজটা মিথ্যা হয়ে
        যেত। যে চিহ্ন আর সত্য নয়, সেটা রেখে দেওয়া সবচেয়ে খারাপ — মালিক
        ভাবতেন কাজটা এখনো নকল।
      */}
      {err && (
        <div className="mb-4 rounded-[12px] border border-[#f0c9c9] bg-[#fdecee] px-4 py-3 text-[13px] text-[#b42318]">
          {err}
        </div>
      )}
      {loading && (
        <div className="mb-4 text-[13px] text-body-soft">Loading the delivery setup…</div>
      )}

      {/*
        ⚠️ নাম আছে, দাম নেই — এই অবস্থাটা নীরব ছিল, আর সেটাই ফাঁদ। একটা নাম
        বানানোর পর কোনো এলাকায় দাম না বসালে সেটা কোথাও দেখা যায় না (এই
        পর্দা দাম দেখায়, নাম নয়), অথচ টেবিলে থেকে যায়। product page-ও এখন
        ওটা আর দেখায় না, তাই মালিক জানতেনই না নামটা আছে।
      */}
      {/*  ⚠️ `?? 1` — জানা না থাকলে "ঠিক আছে" ধরা হয়। পুরনো API এখনো
           `rateCount` পাঠায় না, আর `?? 0` লিখলে সে তখন **সবগুলো** নামের
           বিরুদ্ধে মিথ্যা সতর্কবাণী দিত। অজানা মানে দোষী নয়।  */}
      {!loading && names.some((n) => (n.rateCount ?? 1) === 0) && (
        <div className="mb-4 rounded-[12px] border border-[#f0d9a8] bg-[#fff6e5] px-4 py-3 text-[13px] text-[#8a5a00]">
          <b>{names.filter((n) => (n.rateCount ?? 1) === 0).map((n) => n.name).join(", ")}</b>{" "}
          {names.filter((n) => (n.rateCount ?? 1) === 0).length === 1 ? "has" : "have"} no
          charge in any zone yet, so {names.filter((n) => (n.rateCount ?? 1) === 0).length === 1 ? "it is" : "they are"}{" "}
          not offered anywhere. Pick a zone and add {names.filter((n) => (n.rateCount ?? 1) === 0).length === 1 ? "it" : "them"} there,
          or delete the name.
        </div>
      )}

      <div className="flex items-center gap-2 text-[12.5px] mb-4 flex-wrap">
        <span className="px-2.5 py-1 rounded-full font-medium" style={{ background: TONE.purple.bg, color: TONE.purple.text }}>Zones</span>
        <Icon name="chevronDown" size={13} className="-rotate-90 text-body-soft" />
        <span className="px-2.5 py-1 rounded-full font-medium" style={{ background: selZone ? TONE.blue.bg : "#f3eefa", color: selZone ? TONE.blue.text : "#a897c2" }}>{selZone ? zoneName(selZone) : "pick a zone"}</span>
        <Icon name="chevronDown" size={13} className="-rotate-90 text-body-soft" />
        <span className="px-2.5 py-1 rounded-full font-medium" style={{ background: selT ? TONE.green.bg : "#f3eefa", color: selT ? TONE.green.text : "#a897c2" }}>{selT ? selT.name : "pick a type"}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 items-start">
        {/* ── ZONES ── */}
        <Col title="Zones" sub="main zones & their areas" tone="purple" icon="pin" count={zones.length}>
          {mains.map((m) => (
            <div key={m.id}>
              <ZoneRow z={m} />
              <div className="ml-4 border-l border-lavender-deep pl-2 mt-1 space-y-1">
                {subsOf(m.id).map((s) => <ZoneRow key={s.id} z={s} sub />)}
                {zoneForm.mode === m.id ? (
                  <div className="flex gap-1.5 py-1"><input autoFocus className="ipt !h-[32px] !py-1 text-[12.5px]" placeholder={`Area in ${m.name}`} value={zoneForm.name} onChange={(e) => setZoneForm({ mode: m.id, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addZone()} /><button onClick={addZone} className="bg-purple text-white text-[12px] px-2.5 rounded-[8px]">Add</button></div>
                ) : (
                  <button onClick={() => setZoneForm({ mode: m.id, name: "" })} className={addBtn + " text-[11.5px]"}><Icon name="plus" size={12} /> Add sub-zone</button>
                )}
              </div>
            </div>
          ))}
          {zoneForm.mode === "main" ? (
            <div className="flex gap-1.5 mt-1 pt-2 border-t border-lavender-deep"><input autoFocus className="ipt !h-[34px] text-[13px]" placeholder="Main zone name" value={zoneForm.name} onChange={(e) => setZoneForm({ mode: "main", name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addZone()} /><button onClick={addZone} className="bg-purple text-white text-[12.5px] px-3 rounded-[9px]">Add</button></div>
          ) : (
            <button onClick={() => setZoneForm({ mode: "main", name: "" })} className={addBtn + " mt-1 pt-2 border-t border-lavender-deep"}><Icon name="plus" size={14} /> Add main zone</button>
          )}
        </Col>

        {/* ── TYPES ── */}
        <Col title="Delivery types" sub={selZone ? `in ${zoneName(selZone)}` : "select a zone first"} tone="blue" icon="bolt" count={selZone ? typesOf(selZone).length : undefined}>
          {!selZone ? (
            <div className="text-center py-8 text-[13px] text-body-soft"><Icon name="chevronLeft" size={20} className="mx-auto mb-1 opacity-50" />Pick a zone on the left.</div>
          ) : (
            <>
              {typesOf(selZone).length === 0 && !typeForm.open && <div className="text-[13px] text-body-soft px-1 py-2">No types here yet — add the first.</div>}
              {typesOf(selZone).map((t) => {
                const m = DELIVERY_TYPE_META[t.kind]; const badge = TONE[m.tone as Tone]; const on = selType === t.id;
                return (
                  <div key={t.id} className={"rounded-[11px] border px-3 py-2 " + (on ? "border-orchid bg-orchid-soft" : "border-lavender-deep hover:border-orchid bg-white")}>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setSelType(t.id)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                        <span className="w-6 h-6 rounded-[7px] grid place-items-center text-white shrink-0" style={{ background: badge.solid }}><Icon name={m.icon} size={12} /></span>
                        <span className="min-w-0"><span className="text-[13px] font-semibold text-purple block truncate">{t.name}</span><span className="text-[13px] text-body-soft">{formatTaka(t.chargePaisa)} · {isLead(t) ? (t.etaText || "lead-time") : `${slotsOf(t.id).length} slot${slotsOf(t.id).length === 1 ? "" : "s"}`}</span></span>
                      </button>
                      <Switch on={t.active} onClick={() => toggleType(t.id)} small />
                      <IconBtn name="edit" onClick={() => openEditType(t)} />
                      <IconBtn name="trash" danger onClick={() => delType(t.id)} />
                    </div>
                  </div>
                );
              })}
              {typeForm.open ? (
                <div className="rounded-[11px] border-2 border-dashed border-[#cfe0f2] p-2.5 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: TONE.blue.text }}>{typeForm.editId ? "Edit type" : "New delivery type"}</div>
                  <input autoFocus className="ipt !h-[34px] text-[13px]" placeholder="Name — e.g. 2-Hour Express, Schedule It" value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} />

                  {/*
                    ── ছাঁচ · DEC-DLV-010 ────────────────────────────────────
                    ⚠️ এখানে চারটা fixed ধরনের একটা dropdown ছিল (`TYPES`),
                    demo থেকে রয়ে যাওয়া। মালিক ধরেছেন: *"Schedule delivery
                    add করার জায়গা নেই, নতুন type add করারও নেই।"* — সত্যি,
                    কারণ তালিকাটা কোডে লেখা ছিল আর তাতে Schedule It ছিলই না।

                    এখন পাঁচটা **ছাঁচ**: কোন delivery তারিখ চায়, কোনটা slot
                    চায়, কোনটা শুধু ঘড়ি চালায়। নাম যা খুশি হোক।
                  */}
                  <select
                    className="ipt !h-[34px] text-[12.5px]"
                    value={typeForm.timing}
                    onChange={(e) => setTypeForm({ ...typeForm, timing: e.target.value as DeliveryTiming })}
                  >
                    {(Object.keys(TIMING_META) as DeliveryTiming[]).map((k) => (
                      <option key={k} value={k}>{TIMING_META[k].label}</option>
                    ))}
                  </select>
                  <div className="text-[11.5px] text-body-soft leading-snug">{TIMING_META[typeForm.timing].hint}</div>

                  <div className="flex items-center gap-1 border border-[#d8c6ee] rounded-[12px] px-2 h-[34px]">
                    <span className="text-[13px] text-body-soft">৳</span>
                    <input className="w-full outline-none text-[13px] text-purple" placeholder="charge" value={typeForm.charge} onChange={(e) => setTypeForm({ ...typeForm, charge: e.target.value.replace(/[^0-9]/g, "") })} />
                  </div>

                  {/*
                    ⚠️ সময়টা নামের বাইরে, নিজের ঘরে — মালিকের প্রশ্নের উত্তর:
                    *"2 hours লিখলে system কীভাবে time calculate করবে? নাম
                    বদলে 3 hours করলে?"* — নাম পড়ে সংখ্যা বের করলে "দ্রুত
                    ডেলিভারি" লিখলেই চুপচাপ ভেঙে পড়ত।
                  */}
                  {TIMING_META[typeForm.timing].needsMinutes && (
                    <div>
                      <label className="text-[12.5px] text-body-soft">How long — counted from order confirm</label>
                      <div className="flex items-center gap-1 border border-[#d8c6ee] rounded-[12px] px-2 h-[34px] mt-1">
                        <input className="w-full outline-none text-[13px] text-purple" placeholder="120" value={typeForm.minutes} onChange={(e) => setTypeForm({ ...typeForm, minutes: e.target.value.replace(/[^0-9]/g, "") })} />
                        <span className="text-[12px] text-body-soft shrink-0">min</span>
                      </div>
                      {Number(typeForm.minutes) > 0 && (
                        <div className="text-[11.5px] text-body-soft mt-1">
                          = {(Number(typeForm.minutes) / 60).toFixed(Number(typeForm.minutes) % 60 ? 1 : 0)} hours
                        </div>
                      )}
                    </div>
                  )}

                  {/*
                    ⚠️ দোকানের খোলা-বন্ধ নয়, এই delivery-র নিজের জানালা।
                    মালিক: *"দোকান অনেক সময় ১২টা পর্যন্ত খোলা থাকবে, আবার
                    সকাল ৬টায়ও খুলতে পারি"* — রাত ১১টায় "২ ঘণ্টায়" মানে রাত
                    ১টা, যে প্রতিশ্রুতি কেউ রাখতে পারবে না।
                  */}
                  {TIMING_META[typeForm.timing].needsWindow && (
                    <div>
                      <label className="text-[12.5px] text-body-soft">When this delivery can be ordered</label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <input className="ipt !h-[34px] text-[12.5px]" placeholder="10:00 AM" value={typeForm.openFrom} onChange={(e) => setTypeForm({ ...typeForm, openFrom: e.target.value })} />
                        <input className="ipt !h-[34px] text-[12.5px]" placeholder="9:00 PM" value={typeForm.openTo} onChange={(e) => setTypeForm({ ...typeForm, openTo: e.target.value })} />
                      </div>
                    </div>
                  )}

                  {typeForm.timing === "LEAD_DAYS" && (
                    <div><label className="text-[12.5px] text-body-soft">Delivery time — words only, no cut-off</label><input className="ipt !h-[34px] text-[12.5px] mt-1" placeholder="1 - 3 days" value={typeForm.eta} onChange={(e) => setTypeForm({ ...typeForm, eta: e.target.value })} /></div>
                  )}

                  <div className="flex gap-2"><button onClick={saveType} className="flex-1 text-white text-[12.5px] py-2 rounded-[9px] font-medium" style={{ background: TONE.blue.solid }}>{typeForm.editId ? "Save" : "Add type"}</button><button onClick={() => setTypeForm({ ...typeForm, open: false })} className="px-3 text-[12.5px] border rounded-[9px]">Cancel</button></div>
                </div>
              ) : (
                <button onClick={openAddType} className={addBtn}><Icon name="plus" size={14} /> Add delivery type</button>
              )}
            </>
          )}
        </Col>

        {/* ── SLOTS / LEAD-TIME ── */}
        <Col title={isLead(selT) ? "Delivery time" : "Time slots"} sub={selT ? `in ${selT.name}` : "select a type first"} tone="green" icon="clock" count={selT && !isLead(selT) ? slotsOf(selT.id).length : undefined}>
          {!selType ? (
            <div className="text-center py-8 text-[13px] text-body-soft"><Icon name="chevronLeft" size={20} className="mx-auto mb-1 opacity-50" />Pick a delivery type.</div>
          ) : isLead(selT) ? (
            <div className="rounded-[11px] border px-3 py-3" style={{ borderColor: TONE.blue.border, background: TONE.blue.bg }}>
              <div className="flex items-center gap-1.5 mb-1.5" style={{ color: TONE.blue.text }}><Icon name="truck" size={15} /><span className="text-[13px] font-semibold">Lead-time delivery</span></div>
              <label className="text-[13px] text-body-soft">Delivery time shown to customer</label>
              <input className="ipt !h-[34px] text-[13px] mt-1" value={selT?.etaText ?? ""} onChange={(e) => setTypes((b) => b.map((t) => (t.id === selType ? { ...t, etaText: e.target.value } : t)))} placeholder="1 - 3 days" />
              <div className="text-[11.5px] mt-2 leading-relaxed" style={{ color: TONE.blue.text }}>No cut-off and no time slots — customers can order any time and it shows this delivery time.</div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-[11px] px-1 mb-0.5" style={{ color: TONE.green.text }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: TONE.green.solid }} /> Now in Dhaka <b>{nowLabel}</b> · statuses below are live</div>

              {/*
                ⚠️ প্রতিটা ছাঁচে slot মানে আলাদা জিনিস, আর সেটা না লেখা থাকলে
                মালিক ঠিক যে প্রশ্নটা করেছেন সেটাই করবেন: *"midnight কয়টা
                থেকে কয়টা পর্যন্ত সেটা কীভাবে ঠিক করব?"*
              */}
              {nameOf(selT)?.timing === "PICK_DATE_FIXED" && (
                <div className="rounded-[10px] px-3 py-2 text-[12px] leading-snug mb-1" style={{ background: TONE.purple.bg, color: TONE.purple.text }}>
                  Add <b>one</b> slot — it is your delivery window, e.g. 12:00 AM – 12:30 AM,
                  with a cut-off like 6:00 PM for tonight. The customer only picks the date.
                </div>
              )}
              {nameOf(selT)?.timing === "PICK_DATE_SLOT" && (
                <div className="rounded-[10px] px-3 py-2 text-[12px] leading-snug mb-1" style={{ background: TONE.purple.bg, color: TONE.purple.text }}>
                  A cut-off here closes the slot <b>for today only</b>. Pick tomorrow and it opens again.
                </div>
              )}

              {slotsOf(selType).length === 0 && !slotForm.open && (
                <div className="rounded-[10px] px-3 py-2 text-[12.5px] mb-1" style={{ background: TONE.gold.bg, color: TONE.gold.text }}>
                  No slots yet — until you add one, customers cannot choose a time for this delivery.
                </div>
              )}
              {slotsOf(selType).map((s) => {
                const pct = Math.min(100, Math.round((s.booked / Math.max(1, s.capacity)) * 100));
                const full = s.booked >= s.capacity;
                const co = parseTime(s.cutoff);
                const pastCutoff = co != null && nowMin > co;
                /*  তারিখ-বাছা delivery-তে আজকের ঘড়ি পুরো slot বন্ধ করে না —
                    শুধু আজকের জন্য। তাই আলাদা কথা।  */
                const laterDaysOk = picksDate(nameOf(selT)?.timing);
                const st = !s.active
                  ? { l: "Off", bg: "#efeaf6", c: "#8a7aa0" }
                  : pastCutoff
                    ? laterDaysOk
                      ? { l: "Closed today", bg: TONE.gold.bg, c: TONE.gold.text }
                      : { l: "Closed", bg: TONE.gold.bg, c: TONE.gold.text }
                    : full
                      ? { l: "Full", bg: TONE.rose.bg, c: TONE.rose.text }
                      : { l: "Open now", bg: TONE.green.bg, c: TONE.green.text };
                return (
                  <div key={s.id} className="rounded-[11px] border border-lavender-deep px-3 py-2 bg-white">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[13px] font-semibold text-purple flex-1 truncate">{s.label} <span className="text-body-soft font-normal">· {s.window}</span></span>
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0" style={{ background: st.bg, color: st.c }}>{st.l}</span>
                      <Switch on={s.active} onClick={() => toggleSlot(s.id)} small />
                      <IconBtn name="edit" onClick={() => openEditSlot(s)} />
                      <IconBtn name="trash" danger onClick={() => delSlot(s.id)} />
                    </div>
                    <div className="flex items-center gap-2 text-[13px] text-body-soft mb-1"><Icon name="clock" size={12} /> last order {s.cutoff}{picksDate(nameOf(selT)?.timing) ? " (for that day)" : ""}</div>
                    <div className="flex justify-between text-[11px] mb-0.5"><span className="text-body-soft">capacity</span><span style={{ color: full ? TONE.rose.text : TONE.green.text }}>{s.booked}/{s.capacity}{full ? " · full" : ""}</span></div>
                    <div className="h-[6px] rounded-full bg-lavender overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: full ? TONE.rose.solid : TONE.green.solid }} /></div>
                  </div>
                );
              })}
              {slotForm.open ? (
                <div className="rounded-[11px] border-2 border-dashed border-[#c2ecd3] p-2.5 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: TONE.green.text }}>{slotForm.editId ? "Edit slot" : "New time slot"}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input autoFocus className="ipt !h-[34px] text-[12.5px]" placeholder="Label (Evening)" value={slotForm.label} onChange={(e) => setSlotForm({ ...slotForm, label: e.target.value })} />
                    <input className="ipt !h-[34px] text-[12.5px]" placeholder="4pm - 9pm" value={slotForm.window} onChange={(e) => setSlotForm({ ...slotForm, window: e.target.value })} />
                    <input className="ipt !h-[34px] text-[12.5px]" placeholder="last order (3:00 PM)" value={slotForm.cutoff} onChange={(e) => setSlotForm({ ...slotForm, cutoff: e.target.value })} />
                    <input className="ipt !h-[34px] text-[12.5px]" placeholder="capacity" value={slotForm.capacity} onChange={(e) => setSlotForm({ ...slotForm, capacity: e.target.value.replace(/[^0-9]/g, "") })} />
                  </div>
                  <div className="flex gap-2"><button onClick={saveSlot} className="flex-1 text-white text-[12.5px] py-2 rounded-[9px] font-medium" style={{ background: TONE.green.solid }}>{slotForm.editId ? "Save" : "Add slot"}</button><button onClick={() => setSlotForm({ ...slotForm, open: false })} className="px-3 text-[12.5px] border rounded-[9px]">Cancel</button></div>
                </div>
              ) : (
                <button onClick={openAddSlot} className={addBtn}><Icon name="plus" size={14} /> Add time slot</button>
              )}
            </>
          )}
        </Col>
      </div>

      <div className="rounded-[12px] px-4 py-3 text-[12.5px] border mt-5" style={{ background: TONE.purple.bg, borderColor: TONE.purple.border, color: TONE.purple.text }}>
        <b>How it nests:</b> a type &amp; its charge belong to <b>one zone</b> — or to one area inside it, and the area price wins.
        <b> A slot&rsquo;s last-order time</b> is per day: pass it and that slot shuts <i>for that day</i>, not for good.
        Types that promise <b>&ldquo;within X hours&rdquo;</b> need no slots at all — just the minutes and the daily window they run in.
      </div>
    </div>
  );
}
