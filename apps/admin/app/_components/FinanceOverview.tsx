"use client";

/*
  Finance overview — the screen the owner opens first.
  Reads one server-computed payload (/finance/overview): nothing is added up here.
  Colour carries the meaning: green = ours and healthy, amber = watch it,
  red = wrong. Numbers alone were not telling him anything at a glance.
*/

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiFinanceOverview, financeOverview } from "../_data/api";
import {
  Bar, Banner, Card, Chip, Empty, FinHeader, Kpi, Panel, TONE, WRAP, input, taka,
} from "./FinanceUI";

export function FinanceOverviewLive() {
  const [o, setO] = useState<ApiFinanceOverview | null>(null);
  const [offline, setOffline] = useState(false);
  const [monthsBack, setMonthsBack] = useState(0);

  useEffect(() => {
    void (async () => {
      try { setO(await financeOverview(monthsBack)); setOffline(false); }
      catch { setOffline(true); setO(null); }
    })();
  }, [monthsBack]);

  const monthName = o ? new Date(o.period.from).toLocaleString("en", { month: "long", year: "numeric" }) : "";
  const pct = o ? o.breakEvenProgressBp / 100 : 0;
  const hasPrev = !!o && (o.prevProfitPaisa !== 0 || o.prevIncomePaisa !== 0);
  const profitUp = !!o && o.profitPaisa >= o.prevProfitPaisa;
  const alerts = o
    ? o.dueRecurringCount +
      o.pendingApprovalCount +
      o.postingFailureCount +
      (o.drift && o.drift.worst !== "ok" ? 1 : 0)
    : 0;

  return (
    <div className={WRAP}>
      <FinHeader
        title="Money at a glance"
        emoji="৳"
        sub="Where the money is, what this month earned and cost, and how far you are from covering the fixed costs."
        right={
          <>
            {offline && <Chip tone="amber">API offline</Chip>}
            <select className={`${input} w-[165px]`} value={monthsBack} onChange={(e) => setMonthsBack(Number(e.target.value))}>
              <option value={0}>This month</option>
              <option value={1}>Last month</option>
              <option value={2}>2 months ago</option>
              <option value={3}>3 months ago</option>
            </select>
          </>
        }
      />

      {!o && !offline && <Card className="px-6 py-10 text-center text-body-soft">Loading…</Card>}
      {offline && <Empty emoji="⚡" title="The API is not answering" sub="Start Docker and the API container, then refresh this page." />}

      {o && (
        <>
          {/* things that want attention */}
          {alerts > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {o.dueRecurringCount > 0 && (
                <Link href="/finance/recurring" className="no-underline">
                  <span className="inline-flex items-center gap-2 text-[12.5px] font-bold px-3.5 py-2 rounded-xl transition-transform hover:-translate-y-[1px]"
                    style={{ background: TONE.amber.soft, color: TONE.amber.text }}>
                    📅 {o.dueRecurringCount} monthly bill{o.dueRecurringCount > 1 ? "s" : ""} due →
                  </span>
                </Link>
              )}
              {o.pendingApprovalCount > 0 && (
                <Link href="/finance/expenses" className="no-underline">
                  <span className="inline-flex items-center gap-2 text-[12.5px] font-bold px-3.5 py-2 rounded-xl transition-transform hover:-translate-y-[1px]"
                    style={{ background: TONE.amber.soft, color: TONE.amber.text }}>
                    ✋ {o.pendingApprovalCount} expense{o.pendingApprovalCount > 1 ? "s" : ""} waiting for approval →
                  </span>
                </Link>
              )}
              {o.postingFailureCount > 0 && (
                <Link href="/finance/ledger" className="no-underline">
                  <span className="inline-flex items-center gap-2 text-[12.5px] font-bold px-3.5 py-2 rounded-xl"
                    style={{ background: TONE.rose.soft, color: TONE.rose.text }}>
                    ⚠ {o.postingFailureCount} entr{o.postingFailureCount > 1 ? "ies" : "y"} failed to post →
                  </span>
                </Link>
              )}
              {/*  The nightly books-vs-shop verdict. It sits here rather than only
                   on its own screen — a difference nobody goes looking for is a
                   difference nobody finds. */}
              {o.drift && o.drift.worst !== "ok" && (
                <Link href="/finance/drift" className="no-underline">
                  <span className="inline-flex items-center gap-2 text-[12.5px] font-bold px-3.5 py-2 rounded-xl transition-transform hover:-translate-y-[1px]"
                    style={{
                      background: o.drift.worst === "wrong" ? TONE.rose.soft : TONE.amber.soft,
                      color: o.drift.worst === "wrong" ? TONE.rose.text : TONE.amber.text,
                    }}>
                    🔍 {o.drift.wrongCount > 0
                      ? `${o.drift.wrongCount} thing${o.drift.wrongCount > 1 ? "s do" : " does"} not match the shop`
                      : `${o.drift.watchCount} small gap${o.drift.watchCount > 1 ? "s" : ""} between books and shop`} →
                  </span>
                </Link>
              )}
            </div>
          )}

          {/* money row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Kpi label="Money on hand" value={taka(o.cashPaisa)} emoji="💰" tone="sky" hint={`${o.moneyAccounts.length} accounts`} />
            <Kpi
              label="Actually spendable"
              value={taka(o.spendablePaisa)}
              emoji="✅"
              tone={o.spendablePaisa < 0 ? "rose" : "emerald"}
              hint={o.customerAdvancePaisa > 0 ? `${taka(o.customerAdvancePaisa)} belongs to customers` : "no customer advance held"}
            />
            <Kpi
              label="With rider / courier"
              value={taka(o.carrierCashPaisa)}
              emoji="🛵"
              tone={o.carrierCashPaisa > 0 ? "amber" : "slate"}
              hint="collected, not handed over"
            />
            <Kpi
              label="Runway"
              value={o.runwayDays === null ? "—" : `${o.runwayDays} days`}
              emoji="⏳"
              tone={o.runwayDays !== null && o.runwayDays < 30 ? "rose" : "brand"}
              hint="at this month's fixed costs"
            />
          </div>

          {/* the month */}
          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            <Card className="lg:col-span-2 overflow-hidden">
              <div className="px-5 py-4 border-b border-[#3e3248] flex items-baseline justify-between gap-3 flex-wrap">
                <div className="font-display text-[19px] text-purple">{monthName}</div>
                <span className="text-[12px] text-body-soft">
                  {hasPrev ? (
                    <>last month {taka(o.prevProfitPaisa)}{" "}
                      <span style={{ color: profitUp ? TONE.emerald.text : TONE.rose.text }}>{profitUp ? "▲" : "▼"}</span>
                    </>
                  ) : "nothing recorded last month"}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-[#2a2131]">
                {[
                  { label: "Earned", value: o.incomePaisa, tone: TONE.emerald.text },
                  { label: "Cost of goods", value: o.cogsPaisa, tone: "#adadad" },
                  { label: "All costs", value: o.expensePaisa, tone: "#adadad" },
                  { label: "Left over", value: o.profitPaisa, tone: o.profitPaisa < 0 ? TONE.rose.text : TONE.emerald.text },
                ].map((x) => (
                  <div key={x.label} className="px-5 py-4">
                    <div className="text-[10.5px] uppercase tracking-[0.06em] text-body-soft font-bold">{x.label}</div>
                    <div className="text-[19px] font-bold mt-1" style={{ color: x.tone }}>{taka(x.value)}</div>
                  </div>
                ))}
              </div>

              {/* break-even */}
              <div className="px-5 py-4 border-t border-[#3e3248]" style={{ background: "#2b1a34" }}>
                <div className="flex items-baseline justify-between text-[12.5px] mb-2 gap-3 flex-wrap">
                  <span className="font-bold text-purple">Break-even</span>
                  <span className="text-body-soft">
                    {o.breakEvenPaisa > 0 ? `${taka(o.incomePaisa)} of ${taka(o.breakEvenPaisa)} needed` : "not enough sales this month to work it out"}
                  </span>
                </div>
                <Bar pct={pct} tone={pct >= 100 ? "emerald" : "brand"} height={10} />
                <div className="text-[12px] text-body-soft mt-2">
                  {o.breakEvenPaisa > 0
                    ? pct >= 100
                      ? `Fixed costs covered — everything above this is profit. Margin ${(o.contributionMarginBp / 100).toFixed(0)}%.`
                      : `${pct.toFixed(0)}% there. Another ${taka(Math.max(0, o.breakEvenPaisa - o.incomePaisa))} of sales covers the fixed costs. Margin ${(o.contributionMarginBp / 100).toFixed(0)}%.`
                    : `Fixed costs this month are ${taka(o.fixedCostPaisa)}. Once a normal month of sales is in, this fills itself.`}
                </div>
              </div>
            </Card>

            <Panel title="Biggest costs" emoji="🔥" tone="amber" sub="this month">
              <div className="px-5 py-4">
                {o.topExpenses.length === 0 && <div className="text-[13px] text-body-soft">Nothing spent this month yet.</div>}
                {o.topExpenses.map((e) => {
                  const share = o.expensePaisa > 0 ? (e.paisa / o.expensePaisa) * 100 : 0;
                  return (
                    <div key={e.code} className="mb-3 last:mb-0">
                      <div className="flex justify-between text-[12.5px] mb-1">
                        <span className="text-purple font-medium">{e.name}</span>
                        <span className="font-bold">{taka(e.paisa)}</span>
                      </div>
                      <Bar pct={share} tone="amber" height={6} />
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>

          {/* owed both ways */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Kpi label="Customers owe us" value={taka(o.receivablePaisa)} emoji="📥" tone="sky" />
            <Kpi label="We owe suppliers" value={taka(o.payablePaisa)} emoji="📤" tone={o.payablePaisa > 0 ? "amber" : "slate"} />
            <Kpi label="Staff advances out" value={taka(o.staffAdvanceOutstandingPaisa)} emoji="👤" tone="slate" />
            <Kpi label="Capital to repay" value={taka(o.partnerCapitalOutstandingPaisa)} emoji="🤝" tone="brand" hint="profit goes here first" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Panel title="Where the money sits" emoji="🏦" tone="sky">
              <div className="px-5 py-2">
                {o.moneyAccounts.map((m) => (
                  <div key={m.id} className="flex justify-between items-center py-2.5 border-b border-[#3f3248] last:border-0 text-[13.5px]">
                    <span className="text-body-soft">{m.name}</span>
                    <span className="font-bold" style={{ color: m.balancePaisa < 0 ? TONE.rose.text : "#b694d1" }}>
                      {m.balancePaisa < 0 && <span className="mr-2"><Chip tone="rose">below zero</Chip></span>}
                      {taka(m.balancePaisa)}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Stock & tax" emoji="🌸" tone="emerald">
              <div className="px-5 py-2">
                {[
                  { l: "Stock in the shop", v: o.inventoryPaisa },
                  { l: "Out for delivery right now", v: o.goodsOutPaisa },
                  { l: "VAT held for the government", v: o.vatPayablePaisa },
                ].map((x) => (
                  <div key={x.l} className="flex justify-between items-center py-2.5 border-b border-[#3f3248] last:border-0 text-[13.5px]">
                    <span className="text-body-soft">{x.l}</span>
                    <span className="font-bold text-purple">{taka(x.v)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {o.spendablePaisa < 0 && (
            <div className="mt-4">
              <Banner tone="rose" emoji="⚠" title="You are holding less than you owe customers">
                Advances taken for undelivered orders are bigger than the cash in hand. Money meant
                for flowers that have not gone out yet has already been spent.
              </Banner>
            </div>
          )}
        </>
      )}
    </div>
  );
}
