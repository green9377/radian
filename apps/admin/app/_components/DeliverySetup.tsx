"use client";

import { useState } from "react";
import Icon from "./Icon";
import { TONE, type Tone } from "./OrderViews";
import { OffersRules } from "./DeliveryConfig";
import { DeliveryConnections } from "./ZonesAvailability";

/* Delivery > Setup — two tabs. Zone setup CONNECTS the masters made on
   Methods & slots (DEC-DLV-018); nothing is created there.
   Couriers & riders left (owner, 19 Aug): couriers are managed in
   Administration -> Courier & delivery, riders on /delivery/riders —
   a third door here only repeated them. */
const TABS: { key: string; label: string; icon: string; tone: Tone }[] = [
  { key: "zones", label: "Zone setup", icon: "pin", tone: "purple" },
  { key: "rules", label: "Blackout & rules", icon: "shield", tone: "green" },
];

export function DeliverySetup() {
  const [tab, setTab] = useState("zones");
  return (
    <div>
      <div className="px-6 md:px-8 xl:px-10 2xl:px-12 pt-6 pb-1 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-orchid mr-1">Setup ·</span>
        {TABS.map((t) => {
          const on = tab === t.key; const tn = TONE[t.tone];
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className="px-4 py-2 rounded-full text-[13px] font-medium border inline-flex items-center gap-2 transition-all"
              style={on ? { background: tn.solid, color: "#fff", borderColor: tn.solid } : { background: "#fff", color: tn.text, borderColor: tn.border }}>
              <Icon name={t.icon} size={15} /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === "zones" && <DeliveryConnections />}
      {tab === "rules" && <OffersRules />}
    </div>
  );
}
