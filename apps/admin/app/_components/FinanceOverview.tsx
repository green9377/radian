"use client";

/*  ACCOUNTS DASHBOARD — how money comes in, how it goes out, and what is
    actually in hand.

    Rewritten 12 Sep 2026 to the owner's brief: one look at this screen must
    answer three questions and nothing else has priority over them.

      1. WHICH WAYS IS MONEY COMING IN?    -> "How the money came in"
      2. WHICH WAYS IS IT GOING OUT?       -> "How the money went out"
      3. HOW MUCH CASH IS ACTUALLY THERE?  -> the live band + the cash line

    WHERE THE NUMBERS COME FROM. There is no profit-and-loss endpoint. What
    there IS, is the shop's own double-entry journal (`/finance/ledger`), where
    every line already carries the account it hit and that account's type. So
    this screen reads the journal ONCE for the last year (411 entries today -
    the whole book is smaller than one product list) and groups it:

      an INCOME account line   -> credit minus debit   = money earned
      an EXPENSE account line  -> debit minus credit   = money spent
      a MONEY account line     -> debit minus credit   = cash moved in or out

    Grouping by ACCOUNT is what turns "income ৳1,17,393" into "Sales ৳1,36,098,
    delivery fees ৳3,900, returns took back ৳22,605" - which is the question.
    Nothing here is invented: a figure is either a group of journal lines or a
    balance the books computed.

    TWO DEFINITIONS ARE DELIBERATELY KEPT APART.
      * The period figures (money in, money out, left over) are journal lines
        inside the dates the reader chose.
      * The figures marked NOW (cash, free to spend, who owes whom) are
        balances true at this moment and do NOT follow the date switch.
    `/finance/overview`'s own `profitPaisa` is NOT shown, because it books by
    calendar month - two numbers both called profit on one screen is worse than
    one.  */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import {
  ApiFinanceAccount, ApiFinanceOverview, ApiFinanceSummary, ApiJournalEntry,
  financeAccounts, financeLedger, financeOverview, financeSummary, formatTaka,
} from "../_data/api";
import {
  AreaChart, BD_OFFSET_MS, Card, ChartCard, Chip, DAY_MS, Delta, DivergeChart, Empty,
  Kpi, KpiRow, Rule, Scope, SourceNote, Stat, SubHead, TrackRow, RangeBar,
  NowBand, bdDay, dayLabel, presetRange, previousRange, useLoadState,
  type NowJob, type Point, type Range,
} from "./OverviewKit";

/* ── the journal is timestamped in UTC; the shop's day is Dhaka's ────────── */
function bdDayOf(iso: string): string {
  return new Date(new Date(iso).getTime() + BD_OFFSET_MS).toISOString().slice(0, 10);
}
function everyDay(from: string, to: string): string[] {
  const out: string[] = [];
  let t = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  while (t <= end && out.length < 400) { out.push(new Date(t).toISOString().slice(0, 10)); t += DAY_MS; }
  return out;
}

type ChartTab = "cash" | "in" | "out" | "net";

interface SourceRow { code: string; name: string; paisa: number }

interface Cut {
  inPaisa: number;
  outPaisa: number;
  income: SourceRow[];
  expense: SourceRow[];
  perDayIn: Point[];
  perDayOut: Point[];
  perDayNet: Point[];
  cashMovedPaisa: number;
  entries: number;
  unresolved: number;
}

const EMPTY_CUT: Cut = {
  inPaisa: 0, outPaisa: 0, income: [], expense: [],
  perDayIn: [], perDayOut: [], perDayNet: [], cashMovedPaisa: 0, entries: 0, unresolved: 0,
};

/** the money chart picks its own shape: an area while it stays above zero,
    a two-sided chart the moment a day goes below it */
function MoneyChart({ pts, id, noun }: { pts: Point[]; id: string; noun: string }) {
  if (pts.some((p) => p.value < 0)) {
    return <DivergeChart pts={pts} id={id} fmt={formatTaka} noun={noun}
      labels={{ up: "above zero", down: "below zero", flat: "nothing recorded" }} />;
  }
  return <AreaChart pts={pts} id={id} fmt={formatTaka} noun={noun} />;
}

export function FinanceOverviewLive() {
  const [range, setRange] = useState<Range>(presetRange("d30"));
  const [tab, setTab] = useState<ChartTab>("cash");
  const [led, setLed] = useState<ApiJournalEntry[] | null>(null);
  const [accounts, setAccounts] = useState<ApiFinanceAccount[] | null>(null);
  const [sum, setSum] = useState<ApiFinanceSummary | null>(null);
  const [ov, setOv] = useState<ApiFinanceOverview | null>(null);
  const { settle, begin, at } = useLoadState();

  /*  ONE read of the book, for a year. Every period the reader can pick is a
      slice of it, so switching dates costs nothing and the comparison with the
      period before is always available.  */
  useEffect(() => {
    let alive = true;
    begin("ledger", "accounts", "summary", "overview");
    void (async () => {
      const r = await Promise.allSettled([
        financeLedger({ from: bdDay(364), take: 8000 }),
        financeAccounts(),
        financeSummary(),
        financeOverview(0),
      ]);
      if (!alive) return;
      setLed(r[0].status === "fulfilled" ? r[0].value : null);
      setAccounts(r[1].status === "fulfilled" ? r[1].value : null);
      setSum(r[2].status === "fulfilled" ? r[2].value : null);
      setOv(r[3].status === "fulfilled" ? r[3].value : null);
      settle({ ledger: r[0], accounts: r[1], summary: r[2], overview: r[3] });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*  an account's TYPE is what decides how its line reads. Take it from the
      account list, and fall back to the copy the journal line carries.  */
  const meta = useMemo(() => {
    const m = new Map<string, { code: string; name: string; type: string; money: boolean }>();
    for (const a of accounts ?? []) m.set(a.id, { code: a.code, name: a.name, type: a.type, money: a.isMoneyAccount });
    return m;
  }, [accounts]);

  const today = bdDay(0);

  /** every day the book actually reaches back to, so the picker cannot name a
      month the shop has no book for */
  const firstBookDay = useMemo(() => {
    if (!led || led.length === 0) return null;
    let min = "9999-99-99";
    for (const e of led) { const d = bdDayOf(e.entryDate); if (d < min) min = d; }
    return min === "9999-99-99" ? null : min;
  }, [led]);

  /**
   * Money moved on a money account, per Dhaka day, for the whole book.
   *
   * Future-dated days are KEPT. `summary.cashPaisa` already contains them, so
   * the walk below has to unwind them before it can read today's balance.
   *
   * `unresolved` counts lines whose account is no longer in the account list
   * (an account can be deleted while its journal lines live on). Such a line
   * cannot be known to be a money account, so the cash line would be short by
   * exactly that much - and a cash line that is quietly wrong is worse than
   * none, so the screen says so instead of drawing it.
   */
  const cash = useMemo(() => {
    const m = new Map<string, number>();
    let unresolved = 0;
    for (const e of led ?? []) {
      const d = bdDayOf(e.entryDate);
      for (const l of e.lines) {
        const a = meta.get(l.accountId);
        if (!a) { unresolved++; continue; }
        if (!a.money) continue;
        m.set(d, (m.get(d) ?? 0) + l.debitPaisa - l.creditPaisa);
      }
    }
    return { perDay: m, unresolved };
  }, [led, meta]);
  const cashPerDay = cash.perDay;
  const cashTrusted = accounts !== null && cash.unresolved === 0;

  /** one slice of the book, grouped the three ways this screen needs */
  function slice(from: string, to: string): Cut {
    if (!led || accounts === null) return EMPTY_CUT;
    const inc = new Map<string, SourceRow>(), exp = new Map<string, SourceRow>();
    const dIn = new Map<string, number>(), dOut = new Map<string, number>();
    let inP = 0, outP = 0, moved = 0, entries = 0, unresolved = 0;
    for (const e of led) {
      const d = bdDayOf(e.entryDate);
      if (d < from || d > to) continue;
      entries++;
      for (const l of e.lines) {
        /*  the account list is the only place `isMoneyAccount` lives, so a
            line the list cannot resolve is counted and left out of the cash
            figure rather than guessed at.  */
        const a = meta.get(l.accountId);
        if (!a) { unresolved++; continue; }
        if (a.type === "INCOME") {
          const v = l.creditPaisa - l.debitPaisa;
          if (v === 0) continue;
          const row = inc.get(a.code) ?? { code: a.code, name: a.name, paisa: 0 };
          row.paisa += v; inc.set(a.code, row);
          inP += v; dIn.set(d, (dIn.get(d) ?? 0) + v);
        } else if (a.type === "EXPENSE") {
          const v = l.debitPaisa - l.creditPaisa;
          if (v === 0) continue;
          const row = exp.get(a.code) ?? { code: a.code, name: a.name, paisa: 0 };
          row.paisa += v; exp.set(a.code, row);
          outP += v; dOut.set(d, (dOut.get(d) ?? 0) + v);
        }
        if (a.money) moved += l.debitPaisa - l.creditPaisa;
      }
    }
    const days = everyDay(from, to);
    const byAmount = (x: SourceRow, y: SourceRow) => Math.abs(y.paisa) - Math.abs(x.paisa);
    return {
      inPaisa: inP, outPaisa: outP,
      income: [...inc.values()].filter((r) => r.paisa !== 0).sort(byAmount),
      expense: [...exp.values()].filter((r) => r.paisa !== 0).sort(byAmount),
      perDayIn: days.map((d) => ({ date: d, value: dIn.get(d) ?? 0 })),
      perDayOut: days.map((d) => ({ date: d, value: dOut.get(d) ?? 0 })),
      perDayNet: days.map((d) => ({ date: d, value: (dIn.get(d) ?? 0) - (dOut.get(d) ?? 0) })),
      cashMovedPaisa: moved, entries, unresolved,
    };
  }

  const prev = previousRange(range);
  const cut = useMemo(() => slice(range.from, range.to), [led, meta, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const before = useMemo(() => slice(prev.from, prev.to), [led, meta, prev.from, prev.to]); // eslint-disable-line react-hooks/exhaustive-deps

  /*  CASH, DAY BY DAY, WORKED BACKWARDS FROM WHAT IS THERE NOW. The books give
      one cash figure - today's. Every earlier day is that figure minus every
      movement since, which is exact as long as the whole book is in hand.  */
  const cashPts = useMemo(() => {
    if (!sum || !led) return [];
    const days = everyDay(range.from, range.to);
    if (days.length === 0) return [];
    /*  start from the balance the accounts hold, take off anything booked
        AFTER today (a post-dated entry is already inside that balance), then
        walk back day by day to the end of the chosen period.  */
    let bal = sum.cashPaisa;
    for (const [d, v] of cashPerDay) if (d > today) bal -= v;
    const all = everyDay(range.to, today);           // the chosen end, then on to today
    for (let i = all.length - 1; i >= 1; i--) bal -= cashPerDay.get(all[i]) ?? 0;
    const out: Point[] = [];
    for (let i = days.length - 1; i >= 0; i--) {
      out.unshift({ date: days[i], value: bal });
      bal -= cashPerDay.get(days[i]) ?? 0;
    }
    return out;
  }, [sum, led, cashPerDay, range.from, range.to, today]);

  const ledSt = at("ledger"), accSt = at("accounts"), sumSt = at("summary"), ovSt = at("overview");
  const bookSt = ledSt === "ok" && accSt === "ok" ? "ok" : ledSt === "error" || accSt === "error" ? "error" : "loading";
  /*  the journal comes back newest first, so a capped read loses the OLDEST
      part - which is exactly the part `firstBookDay` would be read from. When
      it is capped, the oldest day in hand says nothing about the book.  */
  const capped = (led?.length ?? 0) >= 8000;
  const bookStart = capped ? null : firstBookDay;
  const shortBook = bookStart !== null && bookStart > range.from;
  /*  COVERAGE IS ABOUT THE FETCH, NOT ABOUT THE OLDEST ENTRY. The journal is
      read from `bdDay(364)` forward, so any window inside that year is fully
      covered and an earlier period with no entries means the shop booked
      nothing then - "nothing before". Judging coverage by the first entry seen
      made every KPI claim "no earlier period" over a year the read covers.
      Only a period reaching past the fetch floor is genuinely unmeasured, and
      then nothing is drawn rather than a made-up percentage.  */
  const prevCovered = prev.from >= bdDay(364);
  const cmp = (v: number) => (bookSt === "ok" && prevCovered ? v : undefined);

  const leftPaisa = cut.inPaisa - cut.outPaisa;
  const beforeLeft = before.inPaisa - before.outPaisa;
  const inMax = Math.max(1, ...cut.income.map((r) => Math.abs(r.paisa)));
  const outMax = Math.max(1, ...cut.expense.map((r) => Math.abs(r.paisa)));
  /*  a row's share must be taken off the same population the row belongs to.
      `cut.inPaisa` is NET of returns, so dividing a gross sales row by it
      printed 116% - a part larger than its whole.  */
  const grossIn = cut.income.reduce((t, r) => t + Math.max(0, r.paisa), 0);
  const grossOut = cut.expense.reduce((t, r) => t + Math.max(0, r.paisa), 0);

  /* ── the live band: what is there right now ───────────────────────────── */
  const money = [...(accounts ?? [])].filter((a) => a.isMoneyAccount && (a.isActive || a.balancePaisa !== 0))
    .sort((a, b) => b.balancePaisa - a.balancePaisa);
  const moneyMax = Math.max(1, ...money.map((a) => Math.abs(a.balancePaisa)));

  const jobs: NowJob[] = ov ? [
    { key: "recurring", label: "Recurring bills due", count: ov.dueRecurringCount, href: "/finance/recurring", tone: "warn" },
    { key: "approvals", label: "Expenses waiting for approval", count: ov.pendingApprovalCount, href: "/finance/expenses", tone: "warn" },
    { key: "failures", label: "Entries the books refused", count: ov.postingFailureCount, href: "/finance/drift", tone: "danger" },
    { key: "drift", label: ov.drift ? `Books vs shop: ${ov.drift.wrongCount} wrong` : "Books vs shop",
      count: ov.drift && ov.drift.worst !== "ok" ? ov.drift.wrongCount || 1 : 0, href: "/finance/drift", tone: "danger" },
  ] : [];

  /*  A row is built only from a call that answered. `?? 0` would turn a failed
      read into "nothing is owed", and the `!== 0` filter would then delete the
      row that says so.  */
  const owedToUs = [
    ...(sum ? [
      { label: "Customers owe the shop", paisa: sum.receivablePaisa, href: "/orders/list?seg=due" },
      { label: "Carriers holding our cash", paisa: sum.carrierCashPaisa, href: "/finance/carrier" },
    ] : []),
    ...(ov ? [
      { label: "Staff advances not recovered", paisa: ov.staffAdvanceOutstandingPaisa, href: "/employees/payroll" },
    ] : []),
  ].filter((x) => x.paisa !== 0);
  const weOwe = [
    ...(sum ? [
      { label: "Suppliers", paisa: sum.payablePaisa, href: "/purchases" },
      { label: "Customers, paid in advance", paisa: sum.customerAdvancePaisa, href: "/orders/list" },
    ] : []),
    ...(ov ? [
      { label: "VAT", paisa: ov.vatPayablePaisa, href: "/finance" },
      { label: "Partner capital", paisa: ov.partnerCapitalOutstandingPaisa, href: "/finance" },
    ] : []),
  ].filter((x) => x.paisa !== 0);
  const owedMax = Math.max(1, ...owedToUs.map((x) => Math.abs(x.paisa)), ...weOwe.map((x) => Math.abs(x.paisa)));
  /*  neither side can be called complete while a source is still out  */
  const owedPartial = sumSt !== "ok" || ovSt !== "ok";
  const owedNote = (what: string) =>
    sumSt === "loading" || ovSt === "loading" ? "Loading…"
      : owedPartial ? "One of the books did not answer, so this side cannot be listed."
        : what;

  /*  `period.from` is a plain date. Parsed bare it becomes UTC midnight and
      then prints in the reader's own zone, which turned September into August
      for anyone west of Greenwich.  */
  const monthName = ov
    ? new Date(`${ov.period.from.slice(0, 10)}T00:00:00Z`)
      .toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" })
    : "";
  /*  printed as a figure, so NOT clamped - 250% and 100% are not the same shop  */
  const bePct = ov ? Math.max(0, ov.breakEvenProgressBp / 100) : 0;

  const chart: Record<ChartTab, { big: string; scope: string; node: React.ReactNode }> = {
    cash: {
      big: cashPts.length && cashTrusted ? formatTaka(cashPts[cashPts.length - 1].value) : "—",
      scope: "cash at the end of each day",
      node: <MoneyChart pts={cashPts} id="fin-cash" noun="Cash in hand, day by day" />,
    },
    in: {
      big: formatTaka(cut.inPaisa), scope: "money in, day by day",
      node: <MoneyChart pts={cut.perDayIn} id="fin-in" noun="Money in, day by day" />,
    },
    out: {
      big: formatTaka(cut.outPaisa), scope: "money out, day by day",
      node: <MoneyChart pts={cut.perDayOut} id="fin-out" noun="Money out, day by day" />,
    },
    net: {
      big: formatTaka(leftPaisa), scope: "in minus out, day by day",
      node: <DivergeChart pts={cut.perDayNet} id="fin-net" fmt={formatTaka} noun="In minus out, day by day"
        labels={{ up: "came out ahead", down: "spent more than came in", flat: "nothing recorded" }} />,
    },
  };

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Radian"
        title="Accounts dashboard"
        desc="Which ways money comes in, which ways it goes out, and how much is actually in hand."
      />

      <NowBand
        title="Money in hand right now"
        figures={[
          { label: "Cash in hand", value: sum ? formatTaka(sum.cashPaisa) : "—", quiet: !sum,
            sub: sum ? "every money account together" : undefined },
          { label: "Free to spend", value: sum ? formatTaka(sum.spendablePaisa) : "—", quiet: !sum,
            sub: !sum ? undefined
              : sum.cashPaisa > 0 ? `${Math.round((sum.spendablePaisa / sum.cashPaisa) * 100)}% of it`
                : "of what the accounts hold" },
          { label: "Held by riders and couriers", value: sum ? formatTaka(sum.carrierCashPaisa) : "—",
            quiet: !sum || sum.carrierCashPaisa === 0, sub: "collected, not handed in yet" },
          { label: "Kept for orders not finished", value: sum ? formatTaka(sum.customerAdvancePaisa) : "—",
            quiet: !sum || sum.customerAdvancePaisa === 0, sub: "paid in advance, not earned yet" },
        ]}
        jobs={jobs}
        loading={sumSt === "loading" || ovSt === "loading"}
        failed={ovSt === "error"}
        note={[
          sumSt === "error" ? "The balances did not answer, so no figure on this line can be trusted." : "",
          ovSt === "error"
            ? "The month summary did not answer, so what is waiting on someone, and the last books-vs-shop check, are unknown."
            : ov?.drift
              ? `Books checked against the shop ${new Date(ov.drift.ranAt).toLocaleString("en-GB", { hour12: false })}.`
              : ovSt === "ok" ? "The books have never been checked against the shop." : "",
        ].filter(Boolean).join(" ")}
      />

      <div className="mt-[18px]">
        <RangeBar range={range} onPick={setRange}
          maxBack={364} />
      </div>

      {bookSt === "error" ? (
        <Card>
          <Empty state="error" empty=""
            error="The journal did not answer. Money in, money out and the cash line cannot be shown until it does." />
        </Card>
      ) : (
        <>
          <KpiRow>
            <Kpi
              icon={<Icon name="cash" size={18} />} iconBg="var(--s-ok)" iconColor="var(--t-ok)"
              label="Money in" value={bookSt === "ok" ? formatTaka(cut.inPaisa) : "—"}
              scope={<Scope text="this period" />}
              delta={<Delta now={bookSt === "ok" ? cut.inPaisa : null} before={cmp(before.inPaisa)} />}
            >
              <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
                {bookSt === "ok"
                  ? cut.income.length === 0 ? "no income was booked in this period"
                    : `${cut.income.length} source${cut.income.length === 1 ? "" : "s"}, returns already taken off`
                  : "reading the journal…"}
              </div>
            </Kpi>
            <Kpi
              icon={<Icon name="wallet" size={18} />} iconBg="var(--s-warn)" iconColor="var(--t-warn)"
              label="Money out" value={bookSt === "ok" ? formatTaka(cut.outPaisa) : "—"}
              scope={<Scope text="this period" />}
              delta={<Delta now={bookSt === "ok" ? cut.outPaisa : null} before={cmp(before.outPaisa)} invert />}
            >
              <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
                {bookSt === "ok"
                  ? cut.expense.length === 0 ? "no cost was booked in this period"
                    : `${cut.expense.length} kind${cut.expense.length === 1 ? "" : "s"} of cost, goods included`
                  : "reading the journal…"}
              </div>
            </Kpi>
            <Kpi
              icon={<Icon name="chart" size={18} />}
              iconBg={leftPaisa < 0 ? "var(--s-bad)" : "var(--s-accent)"}
              iconColor={leftPaisa < 0 ? "var(--t-bad)" : "var(--t-accent)"}
              label="Left over" value={bookSt === "ok" ? formatTaka(leftPaisa) : "—"}
              negative={bookSt === "ok" && leftPaisa < 0}
              scope={<Scope text="in minus out" />}
              delta={<Delta now={bookSt === "ok" ? leftPaisa : null} before={cmp(beforeLeft)} />}
            >
              <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
                {bookSt !== "ok" ? "reading the journal…"
                  : cut.inPaisa > 0
                    ? `${Math.round((leftPaisa / cut.inPaisa) * 100)}% of what came in`
                    : "nothing came in, so there is no share to take"}
              </div>
            </Kpi>
            <Kpi
              icon={<Icon name="register" size={18} />} iconBg="var(--s-info)" iconColor="var(--t-info)"
              label="Cash moved" value={bookSt === "ok" && cut.unresolved === 0 ? formatTaka(cut.cashMovedPaisa) : "—"}
              negative={bookSt === "ok" && cut.unresolved === 0 && cut.cashMovedPaisa < 0}
              scope={<Scope text="this period" />}
            >
              <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
                {bookSt !== "ok" ? "reading the journal…"
                  : cut.unresolved > 0 ? `${cut.unresolved} journal lines point at an account that is no longer listed, so this cannot be totalled`
                    : cut.cashMovedPaisa === 0 ? "no money entered or left an account"
                      : cut.cashMovedPaisa > 0 ? "more came into the accounts than left them"
                        : "more left the accounts than came in"}
              </div>
            </Kpi>
          </KpiRow>

          <div className="mb-[18px]">
            <ChartCard<ChartTab>
              title="Money, day by day"
              tab={tab} onTab={setTab}
              tabs={[
                { v: "cash", label: "Cash in hand" },
                { v: "in", label: "Money in" },
                { v: "out", label: "Money out" },
                { v: "net", label: "In minus out" },
              ]}
              big={chart[tab].big}
              scope={<Scope text={chart[tab].scope} />}
              empty={
                bookSt === "loading" ? "Reading the journal…"
                : tab === "cash"
                  ? sumSt === "loading" ? "Reading the balances…"
                    : sumSt === "error" ? "The balance this line is worked back from did not answer, so the cash line cannot be drawn."
                      : !cashTrusted ? `${cash.unresolved} journal lines point at an account that is no longer listed, so the cash line would be short by an unknown amount and is not drawn.`
                        : cashPts.length === 0 ? "No day falls inside this period." : undefined
                  : cut.entries === 0 ? "Nothing was booked in this period." : undefined}
            >
              {chart[tab].node}
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-[18px] mb-[18px]">
            <Card title="How the money came in" right={<Scope text="this period" />}>
              <div className="mt-[18px]">
                {cut.income.length > 0 ? cut.income.map((r) => (
                  <TrackRow key={r.code} label={r.paisa < 0 ? `${r.name} — taken back` : r.name}
                    value={formatTaka(r.paisa)}
                    width={(Math.abs(r.paisa) / inMax) * 100}
                    color={r.paisa < 0 ? "var(--t-bad)" : "var(--t-ok)"}
                    right={<span className="text-[10.5px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                      {r.paisa > 0 && grossIn > 0 ? `${Math.round((r.paisa / grossIn) * 100)}%` : r.code}
                    </span>} />
                )) : <Empty state={bookSt} empty="No income was booked in this period." error="Could not read the journal." />}
              </div>
              <Rule />
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Every way together" value={bookSt === "ok" ? formatTaka(cut.inPaisa) : "—"}
                  sub={bookSt === "ok" && grossIn !== cut.inPaisa
                    ? `${formatTaka(grossIn)} earned, ${formatTaka(grossIn - cut.inPaisa)} taken back` : undefined} />
                <Stat label="Biggest single way"
                  value={cut.income.length > 0 && cut.income[0].paisa > 0 ? cut.income[0].name : "—"}
                  sub={cut.income.length > 0 && cut.income[0].paisa > 0 && grossIn > 0
                    ? `${Math.round((cut.income[0].paisa / grossIn) * 100)}% of everything earned`
                    : undefined} />
              </div>
            </Card>

            <Card title="How the money went out" right={<Scope text="this period" />}>
              <div className="mt-[18px]">
                {cut.expense.length > 0 ? cut.expense.map((r) => (
                  <TrackRow key={r.code} label={r.paisa < 0 ? `${r.name} — refunded back` : r.name}
                    value={formatTaka(r.paisa)}
                    width={(Math.abs(r.paisa) / outMax) * 100}
                    color={r.paisa < 0 ? "var(--t-ok)" : "var(--t-warn)"}
                    right={<span className="text-[10.5px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                      {r.paisa > 0 && grossOut > 0 ? `${Math.round((r.paisa / grossOut) * 100)}%` : r.code}
                    </span>} />
                )) : <Empty state={bookSt} empty="No cost was booked in this period." error="Could not read the journal." />}
              </div>
              <Rule />
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Every cost together" value={bookSt === "ok" ? formatTaka(cut.outPaisa) : "—"} />
                <Stat label="Spent on every ৳100 that came in"
                  value={bookSt === "ok" && cut.inPaisa > 0 ? `৳${Math.round((cut.outPaisa / cut.inPaisa) * 100)}` : "—"}
                  tone={bookSt === "ok" && cut.inPaisa > 0 && cut.outPaisa > cut.inPaisa ? "bad" : undefined}
                  sub={bookSt === "ok" && cut.inPaisa === 0 ? "nothing came in to measure against" : undefined} />
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.1fr] gap-[18px] mb-[18px]">
            <Card title="Where the cash sits" right={<Scope text="now" tone="now" />}>
              <div className="mt-[18px]">
                {money.length > 0 ? money.map((a) => (
                  <TrackRow key={a.id} label={a.name} value={formatTaka(a.balancePaisa)}
                    width={(Math.abs(a.balancePaisa) / moneyMax) * 100}
                    color={a.balancePaisa < 0 ? "var(--t-bad)" : a.balancePaisa ? "var(--f-chart)" : "var(--f-chart-dim)"}
                    right={a.balancePaisa < 0
                      ? <span className="text-[10.5px] font-bold" style={{ color: "var(--t-bad)" }}>below zero</span>
                      : undefined} />
                )) : <Empty state={accSt} empty="No money account is set up yet." error="Could not read the accounts." />}
              </div>
              <Rule />
              <div className="grid grid-cols-2 gap-4">
                <Stat label="All accounts together" value={sum ? formatTaka(sum.cashPaisa) : "—"} />
                <Stat label="Free to spend" value={sum ? formatTaka(sum.spendablePaisa) : "—"}
                  sub={sum ? "the rest is held against unfinished orders" : undefined} />
              </div>
              {money.some((a) => a.balancePaisa < 0) || !cashTrusted ? (
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {money.some((a) => a.balancePaisa < 0)
                    ? <Chip tone="bad">an account is below zero — more was paid out of it than went in</Chip> : null}
                  {accounts !== null && cash.unresolved > 0
                    ? <Chip tone="warn">{`${cash.unresolved} journal lines name an account that is no longer listed`}</Chip> : null}
                </div>
              ) : null}
            </Card>

            <Card title="What the shop will get, and must pay" right={<Scope text="now" tone="now" />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-7 gap-y-2 mt-[18px]">
                <div>
                  <SubHead>Coming to the shop</SubHead>
                  <div className="mt-3">
                    {owedToUs.length > 0 ? owedToUs.map((x) => (
                      <Link key={x.label} href={x.href} className="block">
                        <TrackRow label={x.paisa < 0 ? `${x.label} — the other way` : x.label}
                          value={formatTaka(x.paisa)} width={(Math.abs(x.paisa) / owedMax) * 100}
                          color={x.paisa < 0 ? "var(--t-warn)" : "var(--t-ok)"} />
                      </Link>
                    )) : (
                      <p className="text-[12.5px] m-0" style={{ color: "var(--t-faint)" }}>
                        {owedNote("Nobody owes the shop anything.")}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <SubHead>Going out of the shop</SubHead>
                  <div className="mt-3">
                    {weOwe.length > 0 ? weOwe.map((x) => (
                      <Link key={x.label} href={x.href} className="block">
                        <TrackRow label={x.paisa < 0 ? `${x.label} — the other way` : x.label}
                          value={formatTaka(x.paisa)} width={(Math.abs(x.paisa) / owedMax) * 100}
                          color={x.paisa < 0 ? "var(--t-ok)" : "var(--t-warn)"} />
                      </Link>
                    )) : (
                      <p className="text-[12.5px] m-0" style={{ color: "var(--t-faint)" }}>
                        {owedNote("The shop owes nothing.")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <Rule />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Stat label="Stock on the shelves" value={ov ? formatTaka(ov.inventoryPaisa) : "—"}
                  tone={ov && ov.inventoryPaisa < 0 ? "bad" : undefined}
                  sub={ov && ov.inventoryPaisa < 0 ? "below zero — a cost price is wrong" : "at cost price"} />
                <Stat label="Goods already out" value={ov ? formatTaka(ov.goodsOutPaisa) : "—"} sub="sent but not finished" />
                <Stat label="Break even, this month" value={ov ? `${bePct.toFixed(0)} %` : "—"}
                  sub={ov && ov.breakEvenPaisa > 0
                    ? `needs ${formatTaka(ov.breakEvenPaisa)} of sales to cover ${monthName}`
                    : "no fixed costs recorded this month"} />
              </div>
              {ov && ov.drift && ov.drift.worst !== "ok" ? (
                <div className="flex items-center gap-2.5 flex-wrap mt-4">
                  <Chip tone={ov.drift.worst === "wrong" ? "bad" : "warn"}>
                    {ov.drift.worst === "wrong" ? "the books and the shop disagree" : "worth a look"}
                  </Chip>
                  <Link href="/finance/drift" className="text-[12.5px] underline font-semibold" style={{ color: "var(--t-accent)" }}>
                    {ov.drift.wrongCount} wrong, {ov.drift.watchCount} to watch
                  </Link>
                </div>
              ) : null}
              {ovSt === "error" ? (
                <p className="text-[12px] m-0 mt-4" style={{ color: "var(--t-faint)" }}>
                  The month summary did not answer, so stock, goods out and break even are not shown.
                </p>
              ) : null}
            </Card>
          </div>

          <SourceNote>
            Money in, money out and the day-by-day charts are the shop&apos;s own journal entries for{" "}
            {range.from === range.to ? dayLabel(range.from) : `${dayLabel(range.from)} to ${dayLabel(range.to)}`},
            grouped by the account each one hit — income accounts for what came in, expense accounts for what went out,
            with returns and refunds already netted off. Figures marked <b>now</b> are balances true at this moment and
            do not follow the period switch. The cash line is worked back from the balance the accounts hold today.
            {shortBook ? ` The book itself starts on ${dayLabel(bookStart!)}, so days before that are empty rather than zero.` : ""}
            {!prevCovered ? " The period before this one reaches further back than the year of journal read here, so no comparison with it is shown." : ""}
            {capped ? " The journal returned the maximum number of entries it will send at once, so an older part of this period may be missing from these figures." : ""}
          </SourceNote>
        </>
      )}
    </div>
  );
}
