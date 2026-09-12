"use client";

/*  ACCOUNTS DASHBOARD — money at a glance.

    Rebuilt on OverviewKit (12 Sep 2026) so it is the same screen as the
    Business dashboard: a live band, four headline figures with their scope
    marked, and cards that name what they count instead of explaining it.

    ONE DIFFERENCE FROM THE OTHER OVERVIEWS, ON PURPOSE. `/finance/overview`
    measures a CALENDAR MONTH and answers with that month's own previous-month
    comparison. So the period switch here is months, not days. The kit's rule
    is that the period belongs to the reader - not that every screen must be
    cut into days - and a day range on a screen whose endpoint books by month
    would be a heading that does not match its own figures.

    Nothing is added up in this file. The server computes the payload; this
    screen only decides what is worth showing and says where each number
    came from.  */

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import { ApiFinanceOverview, financeOverview, formatTaka } from "../_data/api";
import {
  Card, Chip, Delta, Empty, Kpi, KpiRow, Rule, Scope, Seg, SourceNote, Stat, SubHead,
  TrackRow, NowBand, useLoadState, type NowJob,
} from "./OverviewKit";

type MonthKey = "0" | "1" | "2" | "3";

const MONTH_LABEL: Record<MonthKey, string> = {
  "0": "This month", "1": "Last month", "2": "2 months ago", "3": "3 months ago",
};

export function FinanceOverviewLive() {
  const [o, setO] = useState<ApiFinanceOverview | null>(null);
  const [monthsBack, setMonthsBack] = useState<MonthKey>("0");
  const { settle, begin, at } = useLoadState();

  useEffect(() => {
    let alive = true;
    begin("overview");
    void (async () => {
      const [r] = await Promise.allSettled([financeOverview(Number(monthsBack))]);
      if (!alive) return;
      if (r.status === "fulfilled") setO(r.value); else setO(null);
      settle({ overview: r });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsBack]);

  const state = at("overview");
  const monthName = o ? new Date(o.period.from).toLocaleString("en", { month: "long", year: "numeric" }) : "";

  /*  every one of these is a job somebody has to do, not a statistic - so they
      belong in the live band as links, with the zeros dropped  */
  const jobs: NowJob[] = o ? [
    { key: "recurring", label: "Recurring bills due", count: o.dueRecurringCount, href: "/finance/recurring", tone: "warn" },
    { key: "approvals", label: "Expenses waiting for approval", count: o.pendingApprovalCount, href: "/finance/expenses", tone: "warn" },
    { key: "failures", label: "Entries the books refused", count: o.postingFailureCount, href: "/finance/drift", tone: "danger" },
    { key: "drift", label: o.drift ? `Books vs shop: ${o.drift.wrongCount} wrong` : "Books vs shop", count: o.drift && o.drift.worst !== "ok" ? o.drift.wrongCount || 1 : 0, href: "/finance/drift", tone: "danger" },
  ] : [];

  const accounts = [...(o?.moneyAccounts ?? [])].sort((a, b) => b.balancePaisa - a.balancePaisa);
  const accMax = Math.max(1, ...accounts.map((a) => Math.abs(a.balancePaisa)));

  /*  what the shop will get, and what it must pay - two directions, never
      mixed into one "balance" that hides which way the money moves  */
  const owedToUs = o ? [
    { label: "Customers owe the shop", paisa: o.receivablePaisa, href: "/orders/list?seg=due" },
    { label: "Carriers holding our cash", paisa: o.carrierCashPaisa, href: "/finance/carrier" },
    { label: "Staff advances not recovered", paisa: o.staffAdvanceOutstandingPaisa, href: "/employees/payroll" },
  ].filter((x) => x.paisa !== 0) : [];
  const weOwe = o ? [
    { label: "Suppliers", paisa: o.payablePaisa, href: "/purchases" },
    { label: "Customers, paid in advance", paisa: o.customerAdvancePaisa, href: "/orders/list" },
    { label: "VAT", paisa: o.vatPayablePaisa, href: "/finance" },
    { label: "Partner capital", paisa: o.partnerCapitalOutstandingPaisa, href: "/finance" },
  ].filter((x) => x.paisa !== 0) : [];
  const owedMax = Math.max(1, ...owedToUs.map((x) => x.paisa), ...weOwe.map((x) => x.paisa));

  const costs = o ? [
    { label: "Cost of what was sold", paisa: o.cogsPaisa, color: "var(--f-chart)" },
    { label: "Fixed costs", paisa: o.fixedCostPaisa, color: "var(--t-warn)" },
    { label: "Other running costs", paisa: Math.max(0, o.variableCostPaisa), color: "var(--t-gold)" },
  ].filter((x) => x.paisa !== 0) : [];
  const costMax = Math.max(1, ...costs.map((x) => x.paisa));
  const expMax = Math.max(1, ...(o?.topExpenses ?? []).map((x) => x.paisa));

  const bePct = o ? Math.max(0, Math.min(100, o.breakEvenProgressBp / 100)) : 0;

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Radian"
        title="Accounts dashboard"
        desc="Where the money is, what came in and went out, and what the shop owes in both directions."
      />

      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <Seg<MonthKey>
          label="Month"
          value={monthsBack}
          options={(["0", "1", "2", "3"] as MonthKey[]).map((v) => ({ v, label: MONTH_LABEL[v] }))}
          onPick={setMonthsBack}
        />
        <div className="text-[12px]" style={{ color: "var(--t-faint)" }}>
          {monthName || (state === "loading" ? "Loading…" : "")}
        </div>
      </div>

      {state === "error" ? (
        <Card>
          <Empty state="error" empty="" error="The books did not answer. Nothing on this screen can be trusted until they do." />
        </Card>
      ) : (
        <>
          <NowBand
            figures={[
              { label: "Cash in hand", value: o ? formatTaka(o.cashPaisa) : "—", quiet: !o },
              { label: "Free to spend", value: o ? formatTaka(o.spendablePaisa) : "—", quiet: !o,
                sub: o && o.cashPaisa > 0 ? `${Math.round((o.spendablePaisa / o.cashPaisa) * 100)}% of it` : undefined },
              { label: "Held by carriers", value: o ? formatTaka(o.carrierCashPaisa) : "—", quiet: !o || o.carrierCashPaisa === 0 },
            ]}
            jobs={jobs}
            loading={state === "loading"}
            note={o?.drift
              ? `Books checked against the shop ${new Date(o.drift.ranAt).toLocaleString("en-GB", { hour12: false })}.`
              : "The books have never been checked against the shop."}
          />

          <KpiRow>
            <Kpi
              icon={<Icon name="cash" size={18} />} iconBg="var(--s-accent)" iconColor="var(--t-accent)"
              label="Money in" value={o ? formatTaka(o.incomePaisa) : "—"}
              scope={<Scope text="this month" />}
              delta={<Delta now={o ? o.incomePaisa : null} before={o ? o.prevIncomePaisa : null} />}
            />
            <Kpi
              icon={<Icon name="chart" size={18} />}
              iconBg={o && o.profitPaisa < 0 ? "var(--s-bad)" : "var(--s-ok)"}
              iconColor={o && o.profitPaisa < 0 ? "var(--t-bad)" : "var(--t-ok)"}
              label="Profit" value={o ? formatTaka(o.profitPaisa) : "—"} negative={!!o && o.profitPaisa < 0}
              scope={<Scope text="after every cost" />}
              delta={<Delta now={o ? o.profitPaisa : null} before={o ? o.prevProfitPaisa : null} />}
            />
            <Kpi
              icon={<Icon name="bolt" size={18} />} iconBg="var(--s-warn)" iconColor="var(--t-warn)"
              label="Break even" value={o ? `${bePct.toFixed(0)} %` : "—"}
              scope={<Scope text="of the month's costs" />}
            >
              {o ? (
                <div className="mt-3.5">
                  <div className="h-[6px] rounded overflow-hidden" style={{ background: "var(--s-sunken)" }}>
                    <span className="block h-full rounded" style={{ width: `${bePct}%`, background: bePct >= 100 ? "var(--t-ok)" : "var(--t-warn)" }} />
                  </div>
                  <div className="text-[11px] mt-[7px]" style={{ color: "var(--t-faint)" }}>
                    {o.breakEvenPaisa > 0
                      ? `needs ${formatTaka(o.breakEvenPaisa)} of sales to cover the month`
                      : "no fixed costs recorded, so there is nothing to cover"}
                  </div>
                </div>
              ) : null}
            </Kpi>
            <Kpi
              icon={<Icon name="clock" size={18} />} iconBg="var(--s-info)" iconColor="var(--t-info)"
              label="Runway" value={o?.runwayDays != null ? `${o.runwayDays} days` : "—"}
              scope={<Scope text="now" tone="now" />}
            >
              <div className="text-[11.5px] mt-3.5 leading-[1.5]" style={{ color: "var(--t-faint)" }}>
                {o?.runwayDays != null
                  ? "how long the spendable cash lasts at this month's fixed costs"
                  : "no fixed costs recorded this month, so there is nothing to run out of"}
              </div>
            </Kpi>
          </KpiRow>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.1fr] gap-[18px] mb-[18px]">
            <Card title="Where the money is" right={<Scope text="now" tone="now" />}>
              <div className="mt-[18px]">
                {accounts.length > 0 ? accounts.map((a) => (
                  <TrackRow key={a.id} label={a.name} value={formatTaka(a.balancePaisa)}
                    width={(Math.abs(a.balancePaisa) / accMax) * 100}
                    color={a.balancePaisa < 0 ? "var(--t-bad)" : a.balancePaisa ? "var(--f-chart)" : "var(--f-chart-dim)"} />
                )) : <Empty state={state} empty="No money account is set up yet." error="Could not read the accounts." />}
              </div>
              <Rule />
              <div className="grid grid-cols-2 gap-4">
                <Stat label="All accounts" value={o ? formatTaka(o.cashPaisa) : "—"} />
                <Stat label="Free to spend" value={o ? formatTaka(o.spendablePaisa) : "—"}
                  sub="the rest is held against unfinished orders" />
              </div>
            </Card>

            <Card title="What the shop will get, and must pay" right={<Scope text="now" tone="now" />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-7 gap-y-2 mt-[18px]">
                <div>
                  <SubHead>Coming to the shop</SubHead>
                  <div className="mt-3">
                    {owedToUs.length > 0 ? owedToUs.map((x) => (
                      <Link key={x.label} href={x.href} className="block">
                        <TrackRow label={x.label} value={formatTaka(x.paisa)} width={(x.paisa / owedMax) * 100} color="var(--t-ok)" />
                      </Link>
                    )) : (
                      <p className="text-[12.5px] m-0" style={{ color: "var(--t-faint)" }}>
                        {state === "loading" ? "Loading…" : "Nobody owes the shop anything."}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <SubHead>Going out of the shop</SubHead>
                  <div className="mt-3">
                    {weOwe.length > 0 ? weOwe.map((x) => (
                      <Link key={x.label} href={x.href} className="block">
                        <TrackRow label={x.label} value={formatTaka(x.paisa)} width={(x.paisa / owedMax) * 100} color="var(--t-warn)" />
                      </Link>
                    )) : (
                      <p className="text-[12.5px] m-0" style={{ color: "var(--t-faint)" }}>
                        {state === "loading" ? "Loading…" : "The shop owes nothing."}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <Rule />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Stat label="Stock on the shelves" value={o ? formatTaka(o.inventoryPaisa) : "—"}
                  tone={o && o.inventoryPaisa < 0 ? "bad" : undefined}
                  sub={o && o.inventoryPaisa < 0 ? "below zero - a cost price is wrong" : "at cost price"} />
                <Stat label="Goods already out" value={o ? formatTaka(o.goodsOutPaisa) : "—"}
                  sub="sent but not finished" />
                <Stat label="Money kept for orders" value={o ? formatTaka(o.customerAdvancePaisa) : "—"}
                  sub="paid in advance, not earned yet" />
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-[18px]">
            <Card title="What the month cost" right={<Scope text="this month" />}>
              <div className="mt-[18px]">
                {costs.length > 0 ? costs.map((c) => (
                  <TrackRow key={c.label} label={c.label} value={formatTaka(c.paisa)} width={(c.paisa / costMax) * 100} color={c.color} />
                )) : <Empty state={state} empty="Nothing was spent this month." error="Could not read the costs." />}
              </div>
              <Rule />
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Every cost together" value={o ? formatTaka(o.expensePaisa + o.cogsPaisa) : "—"} />
                <Stat label="Kept on every ৳100 of sales"
                  value={o ? `${(o.contributionMarginBp / 100).toFixed(1).replace(/\.0$/, "")} %` : "—"}
                  tone={o && o.contributionMarginBp < 0 ? "bad" : undefined}
                  sub="after the goods and the costs that move with them" />
              </div>
            </Card>

            <Card title="Biggest bills" right={<Scope text="this month" />}>
              <div className="mt-[18px]">
                {(o?.topExpenses ?? []).length > 0 ? o!.topExpenses.map((e) => (
                  <TrackRow key={e.code} label={e.name} value={formatTaka(e.paisa)} width={(e.paisa / expMax) * 100} color="var(--t-gold)"
                    right={<span className="text-[10.5px]" style={{ color: "var(--t-faint)" }}>{e.code}</span>} />
                )) : <Empty state={state} empty="No bill was recorded this month." error="Could not read the bills." />}
              </div>
              {o && o.drift && o.drift.worst !== "ok" ? (
                <>
                  <Rule />
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <Chip tone={o.drift.worst === "wrong" ? "bad" : "warn"}>
                      {o.drift.worst === "wrong" ? "the books and the shop disagree" : "worth a look"}
                    </Chip>
                    <Link href="/finance/drift" className="text-[12.5px] underline font-semibold" style={{ color: "var(--t-accent)" }}>
                      {o.drift.wrongCount} wrong, {o.drift.watchCount} to watch
                    </Link>
                  </div>
                </>
              ) : null}
            </Card>
          </div>

          <SourceNote>
            Every figure on this screen is computed by the books, not added up here. Money in, profit and the costs
            cover {monthName || "the chosen month"}; figures marked <b>now</b> are balances true at this moment and do
            not follow the month switch.
          </SourceNote>
        </>
      )}
    </div>
  );
}
