"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { WRAP, ErrorBox } from "./OrderViews";
import { DeliveryMasters, DeliveryConnections, BlackoutRules } from "./ZonesAvailability";
import {
  listRiders, createRider, updateRider, deleteRider,
  listCourierServices, createCourierService, updateCourierService, deleteCourierService,
  type ApiRider, type ApiCourierService,
} from "../_data/api";
import { SOLID, CELL, LABEL, VALUE, SOFT, NAME, TABLE_WRAP, TABLE, Pill, ActButton, Band, Head, Empty } from "./OrdersUi";

/*
  Settings -> Delivery setup — ONE module, four tabs (owner, 10 Sep 2026;
  design/delivery-flow-v1.html tab 4). Methods & slots, Zone setup and
  Riders used to be three menu entries and couriers a fourth under
  Administration; nobody could hold the map in their head.

    1 · Methods & slots    what Radian offers (DeliveryMasters — unchanged)
    2 · Zones & pricing    where, for how much, which slots (DeliveryConnections — unchanged)
    3 · Riders & couriers  who carries it — own riders and courier companies
                           on one screen; API keys stay in Administration
    4 · Rules              photo switches and blackout days (BlackoutRules — unchanged)
  One-time riders are set up nowhere: they are typed on the order at assign
  time and never saved as a person.
*/

type Tab = "methods" | "zones" | "carriers" | "rules";
const TABS: [Tab, string][] = [
  ["methods", "1 · Methods & slots"],
  ["zones", "2 · Zones & pricing"],
  ["carriers", "3 · Riders & couriers"],
  ["rules", "4 · Rules"],
];

function Carriers() {
  const [riders, setRiders] = useState<ApiRider[] | null>(null);
  const [couriers, setCouriers] = useState<ApiCourierService[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [rider, setRider] = useState<Partial<ApiRider> | null>(null);
  const [courier, setCourier] = useState<Partial<ApiCourierService> | null>(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const [r, c] = await Promise.all([listRiders(), listCourierServices()]);
      setRiders(r);
      setCouriers(c);
    } catch (e) {
      setRiders([]);
      setCouriers([]);
      setErr(e instanceof Error ? e.message : "Could not load.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr("");
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const input = "ipt h-[38px]";
  return (
    <div className="grid md:grid-cols-2 gap-4 items-start">
      {err && <div className="md:col-span-2"><ErrorBox error={err} onRetry={() => void load()} /></div>}

      {/* own riders */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-medium text-body">Own riders</span>
          <button type="button" onClick={() => setRider({ name: "", phone: "", vehicle: "", isActive: true })} className="h-[32px] px-3 rounded-[9px] bg-purple text-white text-[12.5px] font-medium">+ Rider</button>
        </div>
        {rider && (
          <div className="rounded-[12px] border border-[#3e3447] bg-white p-3 mb-2 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2 items-end">
            <div><span className={LABEL}>Name</span><input className={input} value={rider.name ?? ""} onChange={(e) => setRider({ ...rider, name: e.target.value })} /></div>
            <div><span className={LABEL}>Phone</span><input className={input} value={rider.phone ?? ""} onChange={(e) => setRider({ ...rider, phone: e.target.value })} /></div>
            <div><span className={LABEL}>Vehicle</span><input className={input} value={rider.vehicle ?? ""} onChange={(e) => setRider({ ...rider, vehicle: e.target.value })} placeholder="bike, cycle, van" /></div>
            <label className="flex items-center gap-2 text-[12.5px] h-[38px]"><input type="checkbox" className="w-4 h-4 accent-purple" checked={!!rider.isActive} onChange={(e) => setRider({ ...rider, isActive: e.target.checked })} /> Active</label>
            <div className="flex gap-2 col-span-full">
              <ActButton kind="primary" disabled={busy || !rider.name?.trim()} onClick={() => run(() => (rider.id ? updateRider(rider.id, rider as Record<string, unknown>) : createRider(rider as Record<string, unknown>))).then((ok) => ok && setRider(null))}>Save</ActButton>
              <ActButton onClick={() => setRider(null)}>Cancel</ActButton>
            </div>
          </div>
        )}
        <div className={TABLE_WRAP}>
          <table className="w-full border-collapse">
            <Head heads={["Rider", "Phone", "Vehicle", "Today", "Status", ""]} />
            <tbody>
              {(riders ?? []).map((r) => (
                <tr key={r.id} className="hover:bg-[#231538]">
                  <td className={CELL}><span className={NAME}>{r.name}</span></td>
                  <td className={CELL}><span className={SOFT}>{r.phone || "—"}</span></td>
                  <td className={CELL}><span className={SOFT}>{r.vehicle || "—"}</span></td>
                  <td className={CELL}><span className={SOFT}>{r.today ? `${r.today.out} out · ${r.today.delivered} delivered` : "—"}</span></td>
                  <td className={CELL}><Pill colour={r.isActive ? SOLID.green : SOLID.grey}>{r.isActive ? "active" : "off"}</Pill></td>
                  <td className={`${CELL} w-[150px]`}>
                    <div className="flex gap-1.5">
                      <ActButton onClick={() => setRider(r)}>Edit</ActButton>
                      <ActButton onClick={() => { if (confirm(`Remove ${r.name}?`)) void run(() => deleteRider(r.id)); }}><span style={{ color: SOLID.red }}>Remove</span></ActButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {riders !== null && riders.length === 0 && <Empty text="No riders yet." />}
        </div>
      </div>

      {/* courier companies */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-medium text-body">Courier companies</span>
          <button type="button" onClick={() => setCourier({ name: "", phone: "", trackingUrlTemplate: "", isActive: true })} className="h-[32px] px-3 rounded-[9px] bg-purple text-white text-[12.5px] font-medium">+ Courier</button>
        </div>
        {courier && (
          <div className="rounded-[12px] border border-[#3e3447] bg-white p-3 mb-2 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2 items-end">
            <div><span className={LABEL}>Name</span><input className={input} value={courier.name ?? ""} onChange={(e) => setCourier({ ...courier, name: e.target.value })} placeholder="Pathao Courier, RedX…" /></div>
            <div><span className={LABEL}>Phone</span><input className={input} value={courier.phone ?? ""} onChange={(e) => setCourier({ ...courier, phone: e.target.value })} /></div>
            <div className="col-span-full"><span className={LABEL}>Tracking link · {"{cn}"} = consignment no</span><input className={input} value={courier.trackingUrlTemplate ?? ""} onChange={(e) => setCourier({ ...courier, trackingUrlTemplate: e.target.value })} placeholder="https://…/track/{cn}" /></div>
            <label className="flex items-center gap-2 text-[12.5px] h-[38px]"><input type="checkbox" className="w-4 h-4 accent-purple" checked={!!courier.isActive} onChange={(e) => setCourier({ ...courier, isActive: e.target.checked })} /> Active</label>
            <div className="flex gap-2 col-span-full">
              <ActButton kind="primary" disabled={busy || !courier.name?.trim()} onClick={() => run(() => (courier.id ? updateCourierService(courier.id, courier as Record<string, unknown>) : createCourierService(courier as Record<string, unknown>))).then((ok) => ok && setCourier(null))}>Save</ActButton>
              <ActButton onClick={() => setCourier(null)}>Cancel</ActButton>
            </div>
          </div>
        )}
        <div className={TABLE_WRAP}>
          <table className="w-full border-collapse">
            <Head heads={["Courier", "Phone", "Tracking", "Status", ""]} />
            <tbody>
              {(couriers ?? []).map((c) => (
                <tr key={c.id} className="hover:bg-[#231538]">
                  <td className={CELL}><span className={NAME}>{c.name}</span></td>
                  <td className={CELL}><span className={SOFT}>{c.phone || "—"}</span></td>
                  <td className={CELL}><span className={SOFT}>{c.trackingUrlTemplate ? "link set" : "manual"}</span></td>
                  <td className={CELL}><Pill colour={c.isActive ? SOLID.green : SOLID.grey}>{c.isActive ? "active" : "off"}</Pill></td>
                  <td className={`${CELL} w-[150px]`}>
                    <div className="flex gap-1.5">
                      <ActButton onClick={() => setCourier(c)}>Edit</ActButton>
                      {/* (audit 11 Sep 2026, P1 #34) the rider guard, mirrored: the API refuses while parcels are on the road and says how many */}
                      <ActButton onClick={() => { if (confirm(`Remove ${c.name}? Parcels already with them have to be handed over first.`)) void run(() => deleteCourierService(c.id)); }}><span style={{ color: SOLID.red }}>Remove</span></ActButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {couriers !== null && couriers.length === 0 && <Empty text="No courier companies yet." />}
        </div>
        <div className="mt-2 text-[12px] text-[#afa4b7]">
          API keys for a courier live in <Link href="/administration/integrations/courier" className="text-purple underline">Administration → Courier &amp; delivery</Link>. One-time riders (Pathao ride, Uber) are typed on the order at assign time — nothing to set up here.
        </div>
      </div>
    </div>
  );
}

const HELP =
  "What Radian offers, where, for how much, and who carries it — set once, changed rarely. Methods & slots are made once; Zones & pricing connects them per zone with a price and capacity; " +
  "Riders & couriers is everyone who carries a parcel; Rules holds the photo switches and blackout days.";

export default function DeliverySetupView() {
  const [tab, setTab] = useState<Tab>("methods");
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
      if (t && TABS.some(([k]) => k === t)) setTab(t);
    } catch {
      /* nothing */
    }
  }, []);
  return (
    <div>
      <div className={WRAP.replace("pb-16", "pb-0")}>
        <Band title="Delivery setup" help={HELP} tiles={[]} />
        <div className="flex gap-0.5 border-b-[1.5px] border-[#3e3447] mb-2 flex-wrap">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`px-3.5 py-2.5 text-[13px] font-medium -mb-[1.5px] border-b-2 ${tab === k ? "text-purple border-purple" : "text-body-soft border-transparent hover:text-purple"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === "methods" && <DeliveryMasters />}
      {tab === "zones" && <DeliveryConnections />}
      {tab === "carriers" && (
        <div className={WRAP}>
          <Carriers />
        </div>
      )}
      {tab === "rules" && <BlackoutRules />}
    </div>
  );
}
