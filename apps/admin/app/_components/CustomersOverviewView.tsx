"use client";

/*  CUSTOMERS OVERVIEW — who buys, who spends, and who has stopped coming.

    Built on OverviewKit (12 Sep 2026), the same pattern as the other overview
    screens.

    WHERE THE PERIOD COMES FROM. There is no windowed customer report. What
    there is, is a date on every customer: `firstOrderAt` and `lastOrderAt`. So
    the book is read once - every page of it - and the period figures are
    counted off those two dates:

      first order inside the window  -> a NEW customer, that period
      last order inside the window   -> a customer who BOUGHT, that period

    That is exact, not an estimate, and it is the same question the owner asks:
    how many new faces, and how many came back.

    ONE DATA ONE OWNER. `ordersCount` and `ltvPaisa` are Sales' figures, shown
    here and never edited here. They count every order a customer has ever
    placed, so they carry a `now · all time` mark and do NOT follow the period
    switch - a lifetime total inside a seven-day window is not a lifetime
    total.  */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import {
  ApiCustomer, ApiSegment, formatTaka, listCustomersAll, listSegments,
} from "../_data/api";
import {
  Card, Chip, Delta, Empty, Kpi, KpiRow, NowBand, RangeBar, Rule, Scope, SourceNote,
  Stat, SubHead, Table, Td, TrackRow, bdDay, count, dayLabel, presetRange,
  previousRange, useLoadState, type NowJob, type Range,
} from "./OverviewKit";

/** the Dhaka day a timestamp falls on */
const BD = 6 * 3600_000;
function bdDayOf(iso: string): string {
  return new Date(new Date(iso).getTime() + BD).toISOString().slice(0, 10);
}
function inWindow(iso: string | null | undefined, from: string, to: string): boolean {
  if (!iso) return false;
  const d = bdDayOf(iso);
  return d >= from && d <= to;
}

export function CustomersOverviewView() {
  const [range, setRange] = useState<Range>(presetRange("d30"));
  const [book, setBook] = useState<ApiCustomer[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [complete, setComplete] = useState(true);
  const [segments, setSegments] = useState<(ApiSegment & { _count?: { customers: number } })[] | null>(null);
  const { settle, begin, at } = useLoadState();

  /*  the book has no period, so it is read once  */
  useEffect(() => {
    let alive = true;
    begin("book", "segments");
    void (async () => {
      const r = await Promise.allSettled([listCustomersAll(), listSegments()]);
      if (!alive) return;
      setBook(r[0].status === "fulfilled" ? r[0].value.items : null);
      setTotal(r[0].status === "fulfilled" ? r[0].value.total : null);
      setComplete(r[0].status === "fulfilled" ? r[0].value.complete : true);
      setSegments(r[1].status === "fulfilled" ? r[1].value : null);
      settle({ book: r[0], segments: r[1] });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bookSt = at("book"), segSt = at("segments");

  /* ── the book as it stands ─────────────────────────────────────────────── */
  const b = useMemo(() => {
    const all = book ?? [];
    const withOrders = all.filter((c) => c.ordersCount > 0);
    const repeat = all.filter((c) => c.ordersCount > 1);
    return {
      all, withOrders, repeat,
      never: all.filter((c) => c.ordersCount === 0),
      blocked: all.filter((c) => c.status === "BLOCKED"),
      abroad: all.filter((c) => c.isAbroad),
      ltvPaisa: all.reduce((t, c) => t + c.ltvPaisa, 0),
      orders: all.reduce((t, c) => t + c.ordersCount, 0),
      top: all.slice().filter((c) => c.ltvPaisa > 0).sort((x, y) => y.ltvPaisa - x.ltvPaisa).slice(0, 8),
    };
  }, [book]);

  /* ── the chosen period, counted off the dates on each customer ─────────── */
  const prev = previousRange(range);
  /*  WHAT THESE TWO FIGURES CAN AND CANNOT SAY.
      `firstOrderAt` never moves, so "first order inside the window" is exact
      for any window, past or present, and comparable across windows.
      `lastOrderAt` DOES move: a customer who bought inside the window and
      again afterwards no longer has their last order in it. So it cannot
      answer "how many bought in July" - it answers "how many were LAST seen
      in July", which for the current period means who is active and for an
      earlier one means who has not been back since. That is what the card is
      called, and it carries no comparison, because the same window measured a
      month later would answer a different question.  */
  const p = useMemo(() => {
    const all = book ?? [];
    const cut = (from: string, to: string) => {
      const lastSeen = all.filter((c) => inWindow(c.lastOrderAt, from, to));
      return {
        fresh: all.filter((c) => inWindow(c.firstOrderAt, from, to)).length,
        lastSeen: lastSeen.length,
        /*  the intersection, taken inside one population - never one filter's
            count subtracted from another's  */
        lastSeenNew: lastSeen.filter((c) => inWindow(c.firstOrderAt, from, to)).length,
      };
    };
    return { now: cut(range.from, range.to), before: cut(prev.from, prev.to) };
  }, [book, range.from, range.to, prev.from, prev.to]);

  /*  WHO HAS NOT BEEN BACK. Only a customer who HAS ordered can go quiet.
      The line is a FIXED thirty days, not the length of the chosen period:
      tied to the picker, a figure wearing the `now` mark changed every time
      the reader moved the dates, which is exactly what that mark promises it
      will not do. And the edge is a DHAKA day like every other date here - a
      UTC day dropped a whole day of customers between 18:00 and midnight UTC. */
  const quietDays = 30;
  const quiet = useMemo(() => {
    const edge = bdDay(quietDays - 1);
    return b.withOrders
      .filter((c) => c.lastOrderAt && bdDayOf(c.lastOrderAt) < edge)
      .sort((x, y) => Date.parse(x.lastOrderAt!) - Date.parse(y.lastOrderAt!));
  }, [b.withOrders]);

  /*  the SERVER's own count wherever it sent one - it counts the whole book,
      not the pages in hand. Falling back to counting the tags on the rows is
      only for a payload that carries neither, and an empty result there means
      "not returned", never "nobody is in it".  */
  const segRows = useMemo(() => {
    const tagged = new Map<string, number>();
    for (const c of book ?? []) for (const s of c.segments ?? []) tagged.set(s.id, (tagged.get(s.id) ?? 0) + 1);
    /*  ONE SOURCE FOR THE WHOLE TABLE. The server's count covers the whole
        book; a tally of the tags on the rows covers only the pages in hand.
        Mixing them put a whole-book bar beside a pages-in-hand bar on one
        scale, compared as if they had been measured the same way.  */
    const serverCounts = (segments ?? []).some((s) => s._count !== undefined);
    return {
      rows: (segments ?? [])
        .map((s) => ({
          id: s.id, name: s.name,
          n: serverCounts ? (s._count?.customers ?? null) : (tagged.get(s.id) ?? 0),
        }))
        .sort((x, y) => (y.n ?? -1) - (x.n ?? -1)),
      serverCounts,
      known: serverCounts || tagged.size > 0,
    };
  }, [book, segments]);
  const segMax = Math.max(1, ...segRows.rows.map((s) => s.n ?? 0));
  const segSizesKnown = segRows.known;

  const topMax = Math.max(1, ...b.top.map((c) => c.ltvPaisa));

  const jobs: NowJob[] = book ? [
    { key: "quiet", label: "No order in 30 days", count: quiet.length, href: "/customers/list", tone: "warn" },
    { key: "blocked", label: "Blocked", count: b.blocked.length, href: "/customers/risk", tone: "danger" },
    { key: "never", label: "On the book, never ordered", count: b.never.length, href: "/customers/list", tone: "info" },
  ] : [];

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Customers"
        title="Customers"
        desc="Who buys, who spends the most, and who has stopped coming back."
      />

      <NowBand
        title="The customer book right now"
        figures={[
          { label: "Customers", value: book ? count(complete ? (total ?? b.all.length) : b.all.length) : "—", quiet: !book,
            sub: book ? `${count(b.withOrders.length)} have ordered` : undefined },
          { label: "Came back at least once", value: book ? count(b.repeat.length) : "—", quiet: !book,
            sub: book && b.withOrders.length > 0
              ? `${Math.round((b.repeat.length / b.withOrders.length) * 100)}% of those who ordered` : undefined },
          { label: "Taken from them, all time", value: book ? formatTaka(b.ltvPaisa) : "—", quiet: !book,
            sub: book ? `${count(b.orders)} orders altogether` : undefined },
          { label: "Ordering from abroad", value: book ? count(b.abroad.length) : "—",
            quiet: !book || b.abroad.length === 0 },
        ]}
        jobs={jobs}
        loading={bookSt === "loading"}
        failed={bookSt === "error"}
        note={[
          bookSt === "error" ? "The customer book did not answer, so nothing on this line can be trusted." : "",
          !complete ? "Only part of the book could be read, so these counts are short." : "",
          book && b.all.length === 0 ? "There is no customer on the book yet." : "",
        ].filter(Boolean).join(" ") || undefined}
      />

      <div className="mt-[18px]">
        <RangeBar range={range} onPick={setRange}
          right={<Link href="/customers/occasions" className="underline font-semibold" style={{ color: "var(--t-accent)" }}>occasions coming up →</Link>} />
      </div>

      <KpiRow>
        <Kpi
          icon={<Icon name="users" size={18} />} iconBg="var(--s-ok)" iconColor="var(--t-ok)"
          label="New customers" value={book ? count(p.now.fresh) : "—"}
          scope={<Scope text="first order in this period" />}
          delta={<Delta now={book ? p.now.fresh : null} before={book ? p.before.fresh : undefined} />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {book ? "counted off the date of their very first order"
              : bookSt === "error" ? "the customer book did not answer" : "reading the customer book…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="cart" size={18} />} iconBg="var(--s-accent)" iconColor="var(--t-accent)"
          label="Last seen in this period" value={book ? count(p.now.lastSeen) : "—"}
          scope={<Scope text="their most recent order" />}
        >
          {/*  no comparison badge: the same window asked a month later answers
               a different question, because a last order moves.  */}
          <div className="text-[11.5px] mt-3.5 leading-[1.5]" style={{ color: "var(--t-faint)" }}>
            {book
              ? p.now.lastSeen === 0
                ? "nobody's most recent order falls in this period"
                : range.to === bdDay(0)
                  ? `${count(p.now.lastSeenNew)} of them were ordering for the first time`
                  : `${count(p.now.lastSeenNew)} were new then — and none of these has been back since`
              : bookSt === "error" ? "the customer book did not answer" : "reading the customer book…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="cash" size={18} />} iconBg="var(--s-orchid)" iconColor="var(--t-orchid)"
          label="Spent per customer" value={book && b.withOrders.length > 0
            ? formatTaka(Math.round(b.ltvPaisa / b.withOrders.length)) : "—"}
          scope={<Scope text="now · all time" tone="now" />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {book
              ? b.withOrders.length > 0
                ? `across everyone who has ever ordered, not just this period`
                : "nobody has ordered yet"
              : bookSt === "error" ? "the customer book did not answer" : "reading the customer book…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="clock" size={18} />}
          iconBg={quiet.length > 0 ? "var(--s-warn)" : "var(--s-ok)"}
          iconColor={quiet.length > 0 ? "var(--t-warn)" : "var(--t-ok)"}
          label="Gone quiet" value={book ? count(quiet.length) : "—"}
          scope={<Scope text="no order in 30 days" tone="now" />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {book
              ? quiet.length > 0
                ? "have ordered before, but nothing in the last 30 days"
                : "everyone who has ordered has done so in the last 30 days"
              : bookSt === "error" ? "the customer book did not answer" : "reading the customer book…"}
          </div>
        </Kpi>
      </KpiRow>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_1fr] gap-[18px] mb-[18px]">
        <Card title="Who spends the most" right={<Scope text="now · all time" tone="now" />}>
          <div className="mt-[18px]">
            {b.top.length > 0 ? b.top.map((c) => (
              <Link key={c.id} href={`/customers/${c.id}`} className="block">
                <TrackRow label={c.name || c.phone} value={formatTaka(c.ltvPaisa)}
                  width={(c.ltvPaisa / topMax) * 100} color="var(--f-chart)"
                  right={<span className="text-[10.5px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                    {`${count(c.ordersCount)} order${c.ordersCount === 1 ? "" : "s"}`}
                  </span>} />
              </Link>
            )) : (
              <Empty state={bookSt} empty="Nobody has spent anything yet."
                error="The customer book did not answer." />
            )}
          </div>
          <Rule />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="The top eight together"
              value={b.top.length > 0 ? formatTaka(b.top.reduce((t, c) => t + c.ltvPaisa, 0)) : "—"}
              sub={b.ltvPaisa > 0 && b.top.length > 0
                ? `${Math.round((b.top.reduce((t, c) => t + c.ltvPaisa, 0) / b.ltvPaisa) * 100)}% of everything taken`
                : undefined} />
            <Stat label="Ordered once and stopped"
              value={book ? count(b.withOrders.length - b.repeat.length) : "—"}
              sub={book && b.withOrders.length > 0
                ? `${Math.round(((b.withOrders.length - b.repeat.length) / b.withOrders.length) * 100)}% of those who ordered`
                : undefined} />
          </div>
        </Card>

        <Card title="Which group they are in" right={<Scope text="now" tone="now" />}>
          <div className="mt-[18px]">
            {segSizesKnown && segRows.rows.some((s) => (s.n ?? 0) > 0)
              ? segRows.rows.filter((s) => s.n === null || s.n > 0).slice(0, 8).map((s) => (
                <Link key={s.id} href={`/customers/list?segmentId=${s.id}`} className="block">
                  <TrackRow label={s.name}
                    value={s.n === null ? "not counted" : `${count(s.n)} customer${s.n === 1 ? "" : "s"}`}
                    width={s.n === null ? 0 : (s.n / segMax) * 100}
                    color={s.n === null ? "var(--f-chart-dim)" : "var(--t-orchid)"} />
                </Link>
              ))
              : (
                <Empty state={segSt === "error" ? "error" : bookSt}
                  empty={segRows.rows.length === 0
                    ? "No group has been set up yet."
                    : segRows.serverCounts
                      ? "No customer is in any group yet."
                      : "The customer book came back without its group tags, so they cannot be counted here."}
                  error="The group list did not answer." />
              )}
          </div>
          <Rule />
          <SubHead>How they came</SubHead>
          <div className="mt-3.5 grid grid-cols-3 gap-4">
            <Stat label="New" value={book ? count(b.all.filter((c) => c.tier === "new").length) : "—"} />
            <Stat label="Once only" value={book ? count(b.all.filter((c) => c.tier === "onetime").length) : "—"} />
            <Stat label="Regulars" value={book ? count(b.all.filter((c) => c.tier === "repeat").length) : "—"} />
          </div>
          {book && b.blocked.length > 0 ? (
            <div className="mt-4">
              <Chip tone="bad">{`${count(b.blocked.length)} customer${b.blocked.length === 1 ? "" : "s"} blocked`}</Chip>
            </div>
          ) : null}
        </Card>
      </div>

      <Card title="Have not been back in 30 days" right={<Scope text="now" tone="now" />}>
        {quiet.length > 0 ? (
          <Table head={[{ label: "Customer" }, { label: "Phone" }, { label: "Last order" }, { label: "Orders", right: true }, { label: "Spent", right: true }]} min={620}>
            {quiet.slice(0, 10).map((c) => (
              <tr key={c.id}>
                <Td bold><Link href={`/customers/${c.id}`} className="hover:underline">{c.name || "—"}</Link></Td>
                <Td color="var(--t-faint)">{c.phone}</Td>
                <Td>{c.lastOrderAt ? dayLabel(bdDayOf(c.lastOrderAt)) : "—"}</Td>
                <Td right>{count(c.ordersCount)}</Td>
                <Td right bold>{formatTaka(c.ltvPaisa)}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <div className="mt-4">
            <Empty state={bookSt}
              empty="Everyone who has ordered has done so in the last 30 days."
              error="The customer book did not answer." />
          </div>
        )}
        {quiet.length > 10 ? (
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            The 10 quietest of {count(quiet.length)}, longest away first.{" "}
            <Link href="/customers/list" className="underline font-semibold" style={{ color: "var(--t-accent)" }}>see them all</Link>
          </div>
        ) : null}
      </Card>

      <SourceNote>
        The customer book is read whole and has no period of its own, so the figures marked <b>now</b> — how many
        customers, what they have spent altogether, who has not been back in thirty days — are true at this moment and
        do not follow the period switch. <b>New customers</b> counts the customers whose very first order falls inside
        the chosen dates, which never changes however long ago the period was. <b>Last seen in this period</b> counts
        the customers whose most recent order falls inside it — for the current period that is who is active, and for
        an earlier one it is who has not been back since, which is why it carries no comparison. Both are read as
        Dhaka days. Orders and money spent are Sales&apos; own figures, shown here and never changed here, and they
        count every order ever placed, not the chosen period.
        {!complete ? " Only part of the book could be read, so every count here is short of the real one." : ""}
      </SourceNote>
    </div>
  );
}
