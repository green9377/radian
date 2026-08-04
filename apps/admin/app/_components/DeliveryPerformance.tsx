"use client";

import { useMemo } from "react";
import Icon from "./Icon";
import { WRAP, Header, DemoBadge } from "./DeliveryUI";
import { TONE, Panel, Stat, NoteBox, type Tone } from "./OrderViews";
import { formatTaka } from "../_data/api";
import { DEMO_ANALYTICS, DELIVERY_TYPE_META } from "../_data/deliveryDemo";

/* charge vs what we actually paid — the two are independent (margin can be negative) */
const COST_LINES = [
  { orderNo: "RAD-24110", zone: "Dhaka · Gulshan", chargePaisa: 8000, costPaisa: 6000, courier: "Nayeem" },
  { orderNo: "RAD-24107", zone: "Dhaka · Bashundhara", chargePaisa: 8000, costPaisa: 12000, courier: "Rakib" },
  { orderNo: "RAD-24088", zone: "Khulna", chargePaisa: 12000, costPaisa: 9000, courier: "Steadfast" },
  { orderNo: "RAD-24101", zone: "Dhaka · Gulshan", chargePaisa: 25000, costPaisa: 15000, courier: "Shuvo" },
  { orderNo: "RAD-24109", zone: "Chattogram", chargePaisa: 12000, costPaisa: 14000, courier: "Steadfast" },
];

export function DeliveryPerformance() {
  const a = DEMO_ANALYTICS;
  const c = useMemo(() => {
    const charge = COST_LINES.reduce((n, x) => n + x.chargePaisa, 0);
    const cost = COST_LINES.reduce((n, x) => n + x.costPaisa, 0);
    return { charge, cost, margin: charge - cost };
  }, []);

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
      <Header eyebrow="Operations · Delivery" title="Cost & performance" desc="What delivery costs us versus what we charge, and how well the promise is kept." />
      <DemoBadge text="Sample 30-day figures from Radian's own delivery records — never GA4." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Delivery charge (collected)" value={formatTaka(c.charge)} tone="green" icon="cash" sub="from customers" />
        <Stat label="Delivery cost (paid out)" value={formatTaka(c.cost)} tone="amber" icon="truck" sub="to riders / couriers" />
        <Stat label="Delivery margin" value={formatTaka(c.margin)} tone={c.margin >= 0 ? "purple" : "rose"} icon="chart" sub={c.margin >= 0 ? "profit" : "loss"} />
        <Stat label="On-time" value={`${a.onTimePct}%`} tone="blue" icon="check" sub={`${a.failedPct}% failed`} />
      </div>

      <Panel title="Charge vs cost — recent deliveries" icon="cash" tone="purple" hint="the two are independent — margin can be negative">
        <div className="hidden md:grid grid-cols-[1fr_1.2fr_1fr_1fr_1fr_1fr] gap-3 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-body-soft/70 border-b border-[#f2e9fa]">
          <span>Order</span><span>Zone</span><span>By</span><span className="text-right">Charge</span><span className="text-right">Cost</span><span className="text-right">Margin</span>
        </div>
        {COST_LINES.map((x) => {
          const margin = x.chargePaisa - x.costPaisa; const neg = margin < 0;
          return (
            <div key={x.orderNo} className="grid grid-cols-2 md:grid-cols-[1fr_1.2fr_1fr_1fr_1fr_1fr] gap-2 md:gap-3 items-center px-5 py-3 border-b border-[#f5eefb] last:border-b-0 text-[12.5px]">
              <span className="font-semibold text-purple">{x.orderNo}</span>
              <span className="text-body-soft hidden md:block">{x.zone}</span>
              <span className="text-body-soft hidden md:block">{x.courier}</span>
              <span className="text-right text-body">{formatTaka(x.chargePaisa)}</span>
              <span className="text-right text-body">{formatTaka(x.costPaisa)}</span>
              <span className="text-right font-semibold" style={{ color: neg ? TONE.rose.text : TONE.green.text }}>{neg ? "−" : "+"}{formatTaka(Math.abs(margin))}</span>
            </div>
          );
        })}
      </Panel>

      <div className="grid md:grid-cols-2 gap-5">
        <Bars title="By courier / rider" icon="user" tone="blue" rows={a.byCourier.map((x) => ({ name: x.name, value: x.delivered, sub: `${x.delivered} · ${x.onTimePct}% on-time` }))} />
        <Bars title="By zone" icon="pin" tone="purple" rows={a.byZone.map((z) => ({ name: z.name, value: z.delivered, sub: `${z.delivered} · ${z.onTimePct}%` }))} />
        <Bars title="By delivery type" icon="bolt" tone="amber" rows={a.byType.map((ty) => ({ name: DELIVERY_TYPE_META[ty.type].label, value: ty.delivered, sub: `${ty.delivered} · ${ty.onTimePct}%` }))} />
        <Panel title="Where the numbers come from" icon="shield" tone="green"><div className="p-4 text-[13px] text-body-soft">Charge, cost, on-time and failures all come from Radian&apos;s own delivery records — never GA4. Customer charge and delivery cost are recorded separately, so margin is real.</div></Panel>
      </div>
    </div>
  );
}
