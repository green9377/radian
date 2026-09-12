"use client";

/*  PURCHASES OVERVIEW — what the shop bought, from whom, and what it still owes.

    Built on OverviewKit (12 Sep 2026), the same pattern as the other overview
    screens.

    WHERE THE PERIOD COMES FROM. `/purchases/stats` answers three fixed windows
    only - all time, this month, and now - so it cannot answer the dates a
    reader picks. `/purchases` returns the whole book (15 today) and every row
    carries its `purchaseDate`, so the book is read once and sliced, the same
    trick the Accounts and Inventory screens use.

    WHAT A PERIOD FIGURE HERE COUNTS, EXACTLY. It is taken over the purchases
    BOOKED in the chosen dates - not over money that moved in them. A purchase
    row's `paidPaisa` and `duePaisa` are cumulative totals for that purchase
    whenever the money moved, so "still owed" under a period heading means
    "still owed on the purchases booked in that period", and it says so. Money
    that moved on a given day is the Accounts dashboard's question, and the
    journal answers it there.

    THE TWO JOBS THIS MODULE REALLY HAS. A purchase can be paid in advance with
    the goods not yet in hand, and a purchase can be received without one stock
    movement being posted (DEC-PUR-010). Neither is a statistic - somebody has
    to do something about each - so both sit in the live band as work.  */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import {
  ApiPurchase, PurchaseStats, formatTaka, getPurchaseStats, listPurchases,
} from "../_data/api";
import {
  AreaChart, BD_OFFSET_MS, BarChart, Card, ChartCard, Chip, DAY_MS, Delta, Empty, Kpi,
  KpiRow, NowBand, RangeBar, Rule, Scope, SourceNote, Stat, SubHead, Table, Td, TrackRow,
  count, dayLabel, presetRange, previousRange, useLoadState,
  type NowJob, type Point, type Range,
} from "./OverviewKit";

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

type Tab = "money" | "count";

interface Cut {
  boughtPaisa: number; owedPaisa: number; paidPaisa: number; returnedPaisa: number;
  n: number; cancelled: number;
  bySupplier: { name: string; paisa: number; n: number }[];
  perDayMoney: Point[]; perDayCount: Point[];
}
const EMPTY_CUT: Cut = {
  boughtPaisa: 0, owedPaisa: 0, paidPaisa: 0, returnedPaisa: 0, n: 0, cancelled: 0,
  bySupplier: [], perDayMoney: [], perDayCount: [],
};

export function PurchasesOverviewView() {
  const [range, setRange] = useState<Range>(presetRange("d30"));
  const [tab, setTab] = useState<Tab>("money");
  const [book, setBook] = useState<ApiPurchase[] | null>(null);
  const [stats, setStats] = useState<PurchaseStats | null>(null);
  const { settle, begin, at } = useLoadState();

  useEffect(() => {
    let alive = true;
    begin("book", "stats");
    void (async () => {
      const r = await Promise.allSettled([listPurchases(), getPurchaseStats()]);
      if (!alive) return;
      setBook(r[0].status === "fulfilled" ? r[0].value : null);
      setStats(r[1].status === "fulfilled" ? r[1].value : null);
      settle({ book: r[0], stats: r[1] });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bookSt = at("book"), statsSt = at("stats");

  const firstDay = useMemo(() => {
    if (!book || book.length === 0) return null;
    let min = "9999-99-99";
    for (const p of book) { const d = bdDayOf(p.purchaseDate); if (d < min) min = d; }
    return min === "9999-99-99" ? null : min;
  }, [book]);

  function slice(from: string, to: string): Cut {
    if (!book) return EMPTY_CUT;
    const bySup = new Map<string, { name: string; paisa: number; n: number }>();
    const dM = new Map<string, number>(), dN = new Map<string, number>();
    let bought = 0, owed = 0, paid = 0, returned = 0, n = 0, cancelled = 0;
    for (const p of book) {
      const d = bdDayOf(p.purchaseDate);
      if (d < from || d > to) continue;
      /*  a cancelled purchase is counted, and kept out of every money figure:
          the shop never bought it  */
      if (p.status === "CANCELLED") { cancelled++; continue; }
      n++;
      bought += p.grandTotalPaisa;
      owed += p.duePaisa;
      paid += p.paidPaisa;
      returned += p.returnedPaisa;
      dM.set(d, (dM.get(d) ?? 0) + p.grandTotalPaisa);
      dN.set(d, (dN.get(d) ?? 0) + 1);
      const name = p.supplierName || "no supplier named";
      const g = bySup.get(name) ?? { name, paisa: 0, n: 0 };
      g.paisa += p.grandTotalPaisa; g.n++; bySup.set(name, g);
    }
    const days = everyDay(from, to);
    return {
      boughtPaisa: bought, owedPaisa: owed, paidPaisa: paid, returnedPaisa: returned, n, cancelled,
      bySupplier: [...bySup.values()].sort((a, b) => b.paisa - a.paisa),
      perDayMoney: days.map((d) => ({ date: d, value: dM.get(d) ?? 0 })),
      perDayCount: days.map((d) => ({ date: d, value: dN.get(d) ?? 0 })),
    };
  }

  const prev = previousRange(range);
  const cut = useMemo(() => slice(range.from, range.to), [book, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const before = useMemo(() => slice(prev.from, prev.to), [book, prev.from, prev.to]); // eslint-disable-line react-hooks/exhaustive-deps
  /*  `/purchases` answers with the WHOLE book and no window, so an earlier
      period holding no purchases is a fact about the shop - "nothing before" -
      not a gap in the read. The only reason to draw no badge is a failed call.
      The first version capped this on the oldest row it could see, which made
      every KPI on the default view claim "no earlier period" over a window the
      book covers perfectly well.  */
  const cmp = (v: number) => (bookSt === "ok" ? v : undefined);

  const supMax = Math.max(1, ...cut.bySupplier.map((s) => s.paisa));

  /* ── what is true now, off the whole book ─────────────────────────────── */
  const owing = useMemo(() => (book ?? [])
    .filter((p) => p.duePaisa > 0 && p.status !== "CANCELLED")
    .sort((a, b) => b.duePaisa - a.duePaisa), [book]);
  const stockMissing = useMemo(() => (book ?? []).filter((p) => p.stockMissing), [book]);
  const partly = useMemo(() => (book ?? [])
    .filter((p) => p.status !== "CANCELLED" && p.partiallyReceived), [book]);
  const waiting = stats?.advanceWaiting ?? [];
  const stockMissingMax = Math.max(1, ...stockMissing.map((p) => p.grandTotalPaisa));

  /*  EVERY CHIP NAMES ONE MEASURED THING, FROM ONE CALL THAT ANSWERED.
      `stats.dueCount` is the server's own count over the whole book; the local
      `owing.length` is this file's predicate. Falling back from one to the
      other put two different numbers under one label, switched by a failure.  */
  const jobs: NowJob[] = [
    ...(statsSt === "ok" && stats ? [
      { key: "due", label: "Bills not fully paid", count: stats.dueCount, href: "/purchases/list", tone: "warn" as const },
      { key: "advance", label: "Paid, goods not received", count: waiting.length, href: "/purchases/list", tone: "warn" as const },
    ] : []),
    ...(bookSt === "ok" ? [
      { key: "stock", label: "Received, never reached stock", count: stockMissing.length, href: "/purchases/list", tone: "danger" as const },
      { key: "partly", label: "Only part of it arrived", count: partly.length, href: "/purchases/list", tone: "warn" as const },
    ] : []),
  ];

  const chart: Record<Tab, { big: string; scope: string; node: React.ReactNode }> = {
    money: {
      big: formatTaka(cut.boughtPaisa), scope: "bought, day by day",
      node: <AreaChart pts={cut.perDayMoney} id="pur-money" fmt={formatTaka} noun="Bought, day by day" />,
    },
    count: {
      big: count(cut.n), scope: "purchases, day by day",
      node: <BarChart pts={cut.perDayCount} id="pur-n" noun="Purchases, day by day" unit="purchases" />,
    },
  };

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Stock"
        title="Purchases"
        desc="What the shop bought, who it bought from, and which bills are still open."
      />

      <NowBand
        title="What the shop owes right now"
        figures={[
          { label: "Owed to suppliers", value: stats ? formatTaka(stats.totalDuePaisa) : "—",
            quiet: !stats || stats.totalDuePaisa === 0,
            sub: stats ? `on ${count(stats.dueCount)} bill${stats.dueCount === 1 ? "" : "s"}` : undefined },
          { label: "Credit the shop holds", value: stats ? formatTaka(stats.openCreditPaisa) : "—",
            quiet: !stats || stats.openCreditPaisa === 0, sub: stats ? "paid ahead, owed back in goods" : undefined },
          { label: "Purchases on the book", value: stats ? count(stats.count) : "—", quiet: !stats,
            sub: stats ? "all time" : undefined },
          { label: "Bought this month", value: stats ? formatTaka(stats.monthBoughtPaisa) : "—", quiet: !stats,
            sub: stats ? `${count(stats.monthCount)} purchase${stats.monthCount === 1 ? "" : "s"}` : undefined },
        ]}
        jobs={jobs}
        loading={statsSt === "loading" || bookSt === "loading"}
        failed={statsSt === "error" && bookSt === "error"}
        note={[
          statsSt === "error" ? "The purchase summary did not answer, so what is owed and what is paid ahead are not shown." : "",
          bookSt === "error" ? "The purchase list did not answer, so nothing about stock or part deliveries could be checked." : "",
          statsSt === "ok" && bookSt === "ok" ? "These are true at this moment and do not follow the period switch." : "",
        ].filter(Boolean).join(" ") || undefined}
      />

      <div className="mt-[18px]">
        <RangeBar range={range} onPick={setRange}
          right={<Link href="/purchases/new" className="underline font-semibold" style={{ color: "var(--t-accent)" }}>new purchase →</Link>} />
      </div>

      <KpiRow>
        <Kpi
          icon={<Icon name="cart" size={18} />} iconBg="var(--s-accent)" iconColor="var(--t-accent)"
          label="Bought" value={bookSt === "ok" ? formatTaka(cut.boughtPaisa) : "—"}
          scope={<Scope text="booked in this period" />}
          delta={<Delta now={bookSt === "ok" ? cut.boughtPaisa : null} before={cmp(before.boughtPaisa)} />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {bookSt === "ok"
              ? cut.n === 0 ? "nothing was bought in this period"
                : `${count(cut.n)} purchase${cut.n === 1 ? "" : "s"}${cut.cancelled > 0 ? ` · ${count(cut.cancelled)} cancelled and left out` : ""}`
              : bookSt === "error" ? "the purchase book did not answer" : "reading the purchase book…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="cash" size={18} />} iconBg="var(--s-ok)" iconColor="var(--t-ok)"
          label="Paid on them" value={bookSt === "ok" ? formatTaka(cut.paidPaisa) : "—"}
          scope={<Scope text="whenever it was paid" />}
          delta={<Delta now={bookSt === "ok" ? cut.paidPaisa : null} before={cmp(before.paidPaisa)} />}
        >
          <div className="text-[11.5px] mt-3.5 leading-[1.5]" style={{ color: "var(--t-faint)" }}>
            {bookSt === "ok"
              ? cut.boughtPaisa > 0
                ? `${Math.round((cut.paidPaisa / cut.boughtPaisa) * 100)}% of what was bought — money may have moved on another day`
                : "nothing was bought in this period"
              : bookSt === "error" ? "the purchase book did not answer" : "reading the purchase book…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="alert" size={18} />}
          iconBg={cut.owedPaisa > 0 ? "var(--s-warn)" : "var(--s-ok)"}
          iconColor={cut.owedPaisa > 0 ? "var(--t-warn)" : "var(--t-ok)"}
          label="Still owed on them" value={bookSt === "ok" ? formatTaka(cut.owedPaisa) : "—"}
          scope={<Scope text="on this period's bills" />}
          delta={<Delta now={bookSt === "ok" ? cut.owedPaisa : null} before={cmp(before.owedPaisa)} invert />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {bookSt === "ok"
              ? cut.owedPaisa === 0 ? "every bill from this period is settled"
                : "still open on what was booked in these dates"
              : bookSt === "error" ? "the purchase book did not answer" : "reading the purchase book…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="upload" size={18} />} iconBg="var(--s-info)" iconColor="var(--t-info)"
          label="Sent back" value={bookSt === "ok" ? formatTaka(cut.returnedPaisa) : "—"}
          scope={<Scope text="to the supplier" />}
          delta={<Delta now={bookSt === "ok" ? cut.returnedPaisa : null} before={cmp(before.returnedPaisa)} invert />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {bookSt === "ok"
              ? cut.returnedPaisa === 0 ? "nothing was sent back from this period's purchases"
                : "goods returned off these purchases"
              : bookSt === "error" ? "the purchase book did not answer" : "reading the purchase book…"}
          </div>
        </Kpi>
      </KpiRow>

      <div className="mb-[18px]">
        <ChartCard<Tab>
          title="Buying, day by day"
          tab={tab} onTab={setTab}
          tabs={[{ v: "money", label: "What it cost" }, { v: "count", label: "How many" }]}
          big={bookSt === "ok" ? chart[tab].big : "—"}
          scope={<Scope text={chart[tab].scope} />}
          empty={bookSt === "loading" ? "Reading the purchase book…"
            : bookSt === "error" ? "The purchase book did not answer, so nothing can be drawn."
              : cut.n === 0 ? "Nothing was bought in this period." : undefined}
        >
          {chart[tab].node}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr] gap-[18px] mb-[18px]">
        <Card title="Who the shop bought from" right={<Scope text="this period" />}>
          <div className="mt-[18px]">
            {cut.bySupplier.length > 0 ? cut.bySupplier.slice(0, 8).map((s) => (
              <TrackRow key={s.name} label={s.name} value={formatTaka(s.paisa)}
                width={(s.paisa / supMax) * 100} color="var(--f-chart)"
                right={<span className="text-[10.5px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                  {`${count(s.n)} purchase${s.n === 1 ? "" : "s"}`}
                </span>} />
            )) : (
              <Empty state={bookSt} empty="Nothing was bought in this period."
                error="The purchase book did not answer." />
            )}
          </div>
          <Rule />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Suppliers used" value={bookSt === "ok" ? count(cut.bySupplier.length) : "—"}
              sub="in this period" href="/suppliers" />
            <Stat label="Biggest one"
              value={cut.bySupplier.length > 0 && cut.boughtPaisa > 0
                ? `${Math.round((cut.bySupplier[0].paisa / cut.boughtPaisa) * 100)}%` : "—"}
              sub={cut.bySupplier.length > 0 ? cut.bySupplier[0].name : undefined} />
          </div>
        </Card>

        <Card title="Bills still open" right={<Scope text="now" tone="now" />}>
          {owing.length > 0 ? (
            <Table head={[{ label: "Purchase" }, { label: "Supplier" }, { label: "Date" }, { label: "Bill", right: true }, { label: "Still owed", right: true }]} min={640}>
              {owing.slice(0, 8).map((p) => (
                <tr key={p.id}>
                  <Td bold><Link href={`/purchases/${p.id}`} className="hover:underline">{p.purchaseNo}</Link></Td>
                  <Td>{p.supplierName}</Td>
                  <Td color="var(--t-faint)">{dayLabel(bdDayOf(p.purchaseDate))}</Td>
                  <Td right>{formatTaka(p.grandTotalPaisa)}</Td>
                  <Td right bold color="var(--t-warn)">{formatTaka(p.duePaisa)}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <div className="mt-4">
              <Empty state={bookSt} empty="Every purchase bill is settled."
                error="The purchase book did not answer." />
            </div>
          )}
          <Rule />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Stat label="Owed altogether" value={stats ? formatTaka(stats.totalDuePaisa) : "—"}
              tone={stats && stats.totalDuePaisa > 0 ? "warn" : undefined} />
            <Stat label="Bought, all time" value={stats ? formatTaka(stats.totalBoughtPaisa) : "—"} />
            <Stat label="Paid, all time" value={stats ? formatTaka(stats.totalPaidPaisa) : "—"} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-[18px]">
        <Card title="Paid for, still waiting on the goods" right={<Scope text="now" tone="now" />}>
          {waiting.length > 0 ? (
            <Table head={[{ label: "Purchase" }, { label: "Supplier" }, { label: "Paid", right: true }, { label: "Bill", right: true }]} min={520}>
              {waiting.slice(0, 8).map((w) => (
                <tr key={w.id}>
                  <Td bold><Link href={`/purchases/${w.id}`} className="hover:underline">{w.purchaseNo}</Link></Td>
                  <Td>{w.supplierName}</Td>
                  <Td right bold>{formatTaka(w.paidPaisa)}</Td>
                  <Td right color="var(--t-faint)">{formatTaka(w.grandTotalPaisa)}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <div className="mt-4">
              <Empty state={statsSt} empty="Nothing is paid for and still waiting."
                error="The purchase book did not answer." />
            </div>
          )}
          {partly.length > 0 ? (
            <div className="mt-4">
              <Chip tone="warn">
                {`${count(partly.length)} ${partly.length === 1 ? "purchase has" : "purchases have"} arrived only in part`}
              </Chip>
            </div>
          ) : null}
        </Card>

        <Card title="Received, but never reached stock" right={<Scope text="now" tone="now" />}>
          <div className="mt-[18px]">
            <SubHead>These goods are in the shop and not on the stock board</SubHead>
            <div className="mt-3.5">
              {stockMissing.length > 0 ? stockMissing.slice(0, 8).map((p) => (
                <Link key={p.id} href={`/purchases/${p.id}`} className="block">
                  <TrackRow label={`${p.purchaseNo} · ${p.supplierName}`} value={formatTaka(p.grandTotalPaisa)}
                    width={(p.grandTotalPaisa / stockMissingMax) * 100} color="var(--t-bad)"
                    right={<span className="text-[10.5px]" style={{ color: "var(--t-faint)" }}>
                      {dayLabel(bdDayOf(p.purchaseDate))}
                    </span>} />
                </Link>
              )) : (
                <Empty state={bookSt}
                  empty="Every received purchase has reached the stock board."
                  error="The purchase book did not answer." />
              )}
            </div>
          </div>
          {stockMissing.length > 0 ? (
            <>
              <Rule />
              <div className="flex flex-wrap gap-2.5">
                <Chip tone="bad">
                  {`stock is short by these ${count(stockMissing.length)} purchase${stockMissing.length === 1 ? "" : "s"} until they are posted`}
                </Chip>
              </div>
            </>
          ) : null}
        </Card>
      </div>

      <SourceNote>
        The band and the two cards marked <b>now</b> are the whole purchase book as it stands and do not follow the
        period switch. The period figures are the purchases <b>booked</b> between {dayLabel(range.from)} and{" "}
        {dayLabel(range.to)}. <b>Paid on them</b> and <b>still owed on them</b> are that purchase&apos;s running
        totals, so the money may have moved on a different day — what money moved on a given day is the Accounts
        dashboard&apos;s question, and the journal answers it there. A cancelled purchase is counted and left out of
        every money figure, because the shop never bought it. The whole book is read at once, so a comparison with
        the period before is always against the same book — an earlier period with nothing in it means the shop bought
        nothing then, not that the figure is missing.
      </SourceNote>
    </div>
  );
}
