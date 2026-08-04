"use client";

import { useState } from "react";
import Icon from "./Icon";
import { BONUS_LIBRARY, GUARANTEE_LIBRARY, FESTIVALS, taka } from "../_data/offers";

/* Offers & Promotions · Settings & Libraries (MOCK, §9) — interactive. */

const WRAP = "px-6 md:px-8 pt-7 pb-16 max-w-[1100px]";

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
      <div className="font-display text-[16px] text-purple mb-1">{title}</div>
      {hint && <p className="text-[13px] text-body-soft m-0 mb-4">{hint}</p>}
      {children}
    </div>
  );
}
function Guide({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] font-semibold tracking-[0.03em] uppercase text-body-soft mb-1.5">{children}</span>;
}

export default function OffersSettings() {
  const [cfg, setCfg] = useState({ stacking: "Exclusive — best offer wins", maxDiscount: "30", codeFormat: "UPPER + digits (ROSES12)", perCustomer: "1", approval: "25", scarcity: "Subtle text" });
  const set = (patch: Partial<typeof cfg>) => { setCfg((c) => ({ ...c, ...patch })); setSaved(false); };
  const [bonuses, setBonuses] = useState(BONUS_LIBRARY);
  const [guarantees, setGuarantees] = useState(GUARANTEE_LIBRARY);
  const [fests, setFests] = useState(FESTIVALS);
  const [saved, setSaved] = useState(false);
  const [simCart, setSimCart] = useState("3000");
  const [simApplied, setSimApplied] = useState<string[]>(["Spend & Save", "Free delivery"]);

  const SIM = [
    { name: "Spend & Save", pct: 10, cap: 0 },
    { name: "ROSES12", pct: 12, cap: 400 },
    { name: "Free delivery", pct: 0, flat: 60, cap: 0 },
    { name: "bKash cashback", pct: 5, cap: 150 },
  ];
  const cartTk = Number(simCart) || 0;
  const discOf = (s: (typeof SIM)[number]) => {
    let d = s.pct ? Math.round((cartTk * s.pct) / 100) : (s.flat ?? 0);
    if (s.cap) d = Math.min(d, s.cap);
    return d;
  };
  const chosen = SIM.filter((s) => simApplied.includes(s.name));
  const exclusive = cfg.stacking.startsWith("Exclusive");
  const maxCap = Math.round((cartTk * (Number(cfg.maxDiscount) || 100)) / 100);
  let simDiscount = 0, winners: string[] = [];
  if (exclusive) {
    const best = chosen.reduce((b, s) => (discOf(s) > discOf(b) ? s : b), chosen[0]);
    if (best) { simDiscount = discOf(best); winners = [best.name]; }
  } else {
    simDiscount = Math.min(maxCap, chosen.reduce((sum, s) => sum + discOf(s), 0));
    winners = chosen.map((s) => s.name);
  }

  return (
    <div className={WRAP}>
      <div className="mb-5">
        <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid"><span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />Offers & Promotions · settings</div>
        <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">Settings &amp; Libraries</h1>
        <p className="text-body-soft text-[13.5px] m-0 max-w-[720px]">Global rules for how offers behave, plus reusable Hormozi building blocks — bonuses and guarantees — any Grand Slam Offer can pull from.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Stacking & priority" hint="How multiple applicable offers behave on one order.">
            <div className="grid grid-cols-1 gap-3.5">
              <div><Guide>Default policy</Guide><select className="ipt" value={cfg.stacking} onChange={(e) => set({ stacking: e.target.value })}><option>Exclusive — best offer wins</option><option>Allow stacking by priority</option></select></div>
              <div><Guide>Max total discount per order (%)</Guide><input className="ipt" value={cfg.maxDiscount} onChange={(e) => set({ maxDiscount: e.target.value })} /></div>
            </div>
          </Card>
          <Card title="Coupon codes" hint="Format for generated and manual codes.">
            <div className="grid grid-cols-1 gap-3.5">
              <div><Guide>Code format</Guide><select className="ipt" value={cfg.codeFormat} onChange={(e) => set({ codeFormat: e.target.value })}><option>UPPER + digits (ROSES12)</option><option>Prefix + random (VIP-8KX2)</option></select></div>
              <div><Guide>Default per-customer limit</Guide><input className="ipt" value={cfg.perCustomer} onChange={(e) => set({ perCustomer: e.target.value })} /></div>
            </div>
          </Card>
          <Card title="Approvals" hint="Deep discounts need a manager's sign-off.">
            <div className="grid grid-cols-1 gap-3.5">
              <div><Guide>Require approval above (%)</Guide><input className="ipt" value={cfg.approval} onChange={(e) => set({ approval: e.target.value })} /></div>
              <div className="text-[13px] text-body-soft">Below-cost is allowed (perishable) but must be approved &amp; audited.</div>
            </div>
          </Card>
          <Card title="Scarcity defaults" hint="Cosmetic display; never reads Inventory.">
            <div className="grid grid-cols-1 gap-3.5">
              <div><Guide>Default style</Guide><select className="ipt" value={cfg.scarcity} onChange={(e) => set({ scarcity: e.target.value })}><option>Subtle text</option><option>Pill badge</option><option>Off</option></select></div>
              <div className="text-[13px] text-body-soft">Countdowns render only for a real end date (no-theater rule).</div>
            </div>
          </Card>
        </div>

        <Card title="Festival calendar" hint="Pre-set windows offers can snap to.">
          <div className="flex gap-2 flex-wrap">
            {fests.map((f, i) => (<span key={f.key + i} className="bg-lavender text-purple text-[12.5px] font-semibold px-3 py-2 rounded-[10px] inline-flex items-center gap-2">{f.label} <span className="text-body-soft font-normal">· {f.window}</span> <button onClick={() => setFests(fests.filter((_, j) => j !== i))} className="text-body-soft hover:text-[#c0392b] font-bold">×</button></span>))}
            <button onClick={() => setFests([...fests, { key: "custom" + fests.length, label: "New festival", window: "set dates" }])} className="border-[1.5px] border-dashed border-lavender-deep hover:border-orchid text-body-soft hover:text-purple text-[12.5px] px-3 py-2 rounded-[10px] inline-flex items-center gap-1"><Icon name="plus" size={14} /> Add</button>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Bonus Library" hint="Reusable value-stack bonuses with an assigned ৳ value.">
            <div className="flex flex-col gap-2">
              {bonuses.map((b, i) => (<div key={i} className="flex items-center justify-between border border-lavender-deep rounded-[11px] px-3 py-2.5"><span className="text-[13.5px] text-purple font-medium">＋ {b.name}</span><span className="flex items-center gap-2"><span className="text-[12.5px] font-semibold text-[#0f7d55]">{taka(b.valuePaisa)}</span><button onClick={() => setBonuses(bonuses.filter((_, j) => j !== i))} className="text-body-soft hover:text-[#c0392b] font-bold">×</button></span></div>))}
              <button onClick={() => setBonuses([...bonuses, { name: "New bonus", valuePaisa: 10000 }])} className="border-[1.5px] border-dashed border-lavender-deep hover:border-orchid text-body-soft hover:text-purple text-[12.5px] px-3 py-2.5 rounded-[11px] inline-flex items-center gap-1 w-fit"><Icon name="plus" size={14} /> Add bonus</button>
            </div>
          </Card>
          <Card title="Guarantee Library" hint="Risk-reversal lines that raise perceived likelihood.">
            <div className="flex flex-col gap-2">
              {guarantees.map((g, i) => (<div key={i} className="border border-lavender-deep rounded-[11px] px-3 py-2.5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="text-[13.5px] text-purple font-medium">{g.name}</span><span className="text-[10px] font-bold uppercase bg-lavender text-body-soft px-2 py-0.5 rounded-full">{g.type}</span></div><button onClick={() => setGuarantees(guarantees.filter((_, j) => j !== i))} className="text-body-soft hover:text-[#c0392b] font-bold">×</button></div><div className="text-[13px] text-body-soft mt-0.5">“{g.text}”</div></div>))}
              <button onClick={() => setGuarantees([...guarantees, { name: "New guarantee", type: "Conditional", text: "Describe the promise…" }])} className="border-[1.5px] border-dashed border-lavender-deep hover:border-orchid text-body-soft hover:text-purple text-[12.5px] px-3 py-2.5 rounded-[11px] inline-flex items-center gap-1 w-fit"><Icon name="plus" size={14} /> Add guarantee</button>
            </div>
          </Card>
        </div>

        <Card title="Stacking simulator" hint="Test how offers combine on a cart under the current policy.">
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
            <div>
              <Guide>Cart value (৳)</Guide><input className="ipt mb-3" value={simCart} onChange={(e) => setSimCart(e.target.value)} />
              <Guide>Applicable offers</Guide>
              <div className="flex flex-col gap-1.5">
                {SIM.map((s) => { const on = simApplied.includes(s.name); return (
                  <button key={s.name} onClick={() => setSimApplied(on ? simApplied.filter((x) => x !== s.name) : [...simApplied, s.name])} className={`flex items-center justify-between text-[12.5px] px-3 py-2 rounded-[10px] border-[1.5px] transition-colors ${on ? "bg-orchid-soft border-orchid-mid text-purple font-medium" : "bg-white border-lavender-deep text-body-soft hover:border-orchid"}`}><span>{s.name}</span><span>৳{discOf(s)}</span></button>
                ); })}
              </div>
            </div>
            <div className="bg-gradient-to-br from-[#f5eafb] to-white border border-lavender-deep rounded-[14px] p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-body-soft">Result · {exclusive ? "Exclusive (best wins)" : "Stacking by priority"}</div>
              <div className="font-display text-[30px] text-purple mt-2 leading-none">− ৳{simDiscount.toLocaleString("en-IN")}</div>
              <div className="text-[13px] text-body-soft mt-1">total discount on ৳{cartTk.toLocaleString("en-IN")}</div>
              <div className="mt-3 pt-3 border-t border-lavender-deep">
                <div className="text-[13px] text-body-soft mb-1.5">Applied:</div>
                <div className="flex gap-1.5 flex-wrap">{winners.length ? winners.map((w) => (<span key={w} className="text-[11px] font-semibold bg-white border border-orchid-mid text-purple px-2.5 py-1 rounded-full">{w}</span>)) : <span className="text-[13px] text-body-soft">no offer selected</span>}</div>
                {!exclusive && chosen.reduce((s, x) => s + discOf(x), 0) > maxCap && <div className="text-[11px] text-[#b45309] font-semibold mt-2">Capped at {cfg.maxDiscount}% of cart.</div>}
              </div>
            </div>
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <button onClick={() => setSaved(true)} className="bg-purple hover:bg-purple-deep text-white text-[14px] font-medium px-6 py-3 rounded-[12px] inline-flex items-center gap-2 shadow-soft transition-colors"><Icon name="check" size={17} /> Save settings</button>
          {saved && <span className="text-[13px] font-semibold text-[#0f7d55] inline-flex items-center gap-1.5"><Icon name="check" size={16} /> Saved (mock) — not yet persisted</span>}
        </div>
      </div>
    </div>
  );
}
