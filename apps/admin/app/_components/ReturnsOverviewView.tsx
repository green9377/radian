"use client";

/*  RETURNS OVERVIEW — what came back, why, and what it cost the shop to settle.

    Built on OverviewKit (12 Sep 2026), the same pattern as the other overview
    screens.

    TWO DOORS, ONE BOOK (DEC-RTN-016). A return is a return whether the order
    came from the website or across the counter. `channel` narrows the SAME
    book, so this screen asks three times - everything, online, counter - and
    prints the two halves under the total. Nothing is duplicated and nothing is
    added up twice.

    WHAT A RETURN IS NOT. It is not a change to the order: `Order.salesStatus`
    is never touched, a return is its own document, and a refund payout can
    never exceed what was actually collected. So "value returned" and "money
    refunded" are two different figures and are never presented as one.

    A RETURN HAS A DATE OF ITS OWN. `from`/`to` filter `createdAt` on the
    return, not on the order, so a return booked today against a month-old
    order counts today - which is what the reader means by "returns this week".  */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import {
  ApiReturn, ApiReturnReason, RESOLUTION_LABEL, RETURN_STATUS_META, ReturnStats,
  formatTaka, getReturnReasons, listReturns, returnStats,
} from "../_data/api";
import {
  Card, Chip, Delta, Empty, Kpi, KpiRow, NowBand, RangeBar, Rule, Scope, SourceNote,
  SplitLine, Stat, Table, Td, TrackRow, count, dayLabel, presetRange,
  previousRange, useLoadState, type NowJob, type Range,
} from "./OverviewKit";

/** the statuses that mean somebody still has to do something */
const OPEN_STATUSES = ["draft", "pending_approval", "approved"] as const;

export function ReturnsOverviewView() {
  const [range, setRange] = useState<Range>(presetRange("d30"));
  const [all, setAll] = useState<ReturnStats | null>(null);
  const [online, setOnline] = useState<ReturnStats | null>(null);
  const [counter, setCounter] = useState<ReturnStats | null>(null);
  const [before, setBefore] = useState<ReturnStats | null>(null);
  const [live, setLive] = useState<ReturnStats | null>(null);
  const [rows, setRows] = useState<ApiReturn[] | null>(null);
  /*  the list is capped at 200 rows a page, so the number of rows in hand is
      NOT the number of returns in the period. The stats call answers that.  */
  const [rowTotal, setRowTotal] = useState<number | null>(null);
  const [reasons, setReasons] = useState<ApiReturnReason[] | null>(null);
  const { settle, begin, at } = useLoadState();

  /*  the waiting figures are true NOW, so they are read with no date filter at
      all - a windowed call made "waiting to be settled" collapse to whatever
      happened to be booked inside the window, under a badge that said now  */
  useEffect(() => {
    let alive = true;
    begin("live", "reasons");
    void (async () => {
      const r = await Promise.allSettled([returnStats(), getReturnReasons()]);
      if (!alive) return;
      setLive(r[0].status === "fulfilled" ? r[0].value : null);
      setReasons(r[1].status === "fulfilled" ? r[1].value : null);
      settle({ live: r[0], reasons: r[1] });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    begin("all", "online", "counter", "before", "rows");
    setAll(null); setOnline(null); setCounter(null); setBefore(null); setRows(null); setRowTotal(null);
    const prev = previousRange(range);
    const w = { from: range.from, to: range.to };
    void (async () => {
      const r = await Promise.allSettled([
        returnStats(w),
        returnStats({ ...w, channel: "online" }),
        returnStats({ ...w, channel: "counter" }),
        returnStats({ from: prev.from, to: prev.to }),
        listReturns({ ...w, pageSize: 200 }),
      ]);
      if (!alive) return;
      setAll(r[0].status === "fulfilled" ? r[0].value : null);
      setOnline(r[1].status === "fulfilled" ? r[1].value : null);
      setCounter(r[2].status === "fulfilled" ? r[2].value : null);
      setBefore(r[3].status === "fulfilled" ? r[3].value : null);
      setRows(r[4].status === "fulfilled" ? r[4].value.rows : null);
      setRowTotal(r[4].status === "fulfilled" ? r[4].value.total : null);
      settle({ all: r[0], online: r[1], counter: r[2], before: r[3], rows: r[4] });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  const allSt = at("all"), beforeSt = at("before"), rowsSt = at("rows"), liveSt = at("live");
  const splitSt = at("online") === "ok" && at("counter") === "ok" ? "ok" : "not";
  const cmp = (v: number | null) => (beforeSt === "error" ? undefined : v);

  const n = (s: ReturnStats | null) => (s ? s.counts.all ?? 0 : null);
  const nAll = n(all);

  /*  what the shop actually paid out. A store credit is a PROMISE OF GOODS,
      not money leaving the till, so it is its own figure and never added to
      the refund.  */
  const paidOut = all ? all.refundPaisa + all.compensationPaisa : null;

  /** how each settled return was settled, and why it came back */
  const grouped = useMemo(() => {
    const byRes = new Map<string, { label: string; n: number; paisa: number }>();
    const byReason = new Map<string, { label: string; n: number; paisa: number }>();
    const reasonName = new Map((reasons ?? []).map((r) => [r.id, r.label]));
    let unknownReason = 0;
    /*  "how it was settled" must only count returns that WERE settled. On a
        draft or an approved one, `resolution` is the intent, and counting it
        as a settlement contradicted "settled and closed" two rows below.  */
    const settled = (rows ?? []).filter((r) => r.status === "completed");
    for (const r of settled) {
      const rl = RESOLUTION_LABEL[r.resolution] ?? r.resolution;
      const g = byRes.get(rl) ?? { label: rl, n: 0, paisa: 0 };
      g.n++; g.paisa += r.returnValuePaisa; byRes.set(rl, g);

      /*  the list does not always carry the reason relation, so the name comes
          from the reason list by id; a return with no reason at all is counted
          as that rather than filed under a made-up label  */
      const name = r.reason?.label ?? (r.reasonId ? reasonName.get(r.reasonId) : undefined);
      if (!name) { unknownReason++; continue; }
      const b = byReason.get(name) ?? { label: name, n: 0, paisa: 0 };
      b.n++; b.paisa += r.returnValuePaisa; byReason.set(name, b);
    }
    const bySize = (x: { n: number }, y: { n: number }) => y.n - x.n;
    return {
      resolutions: [...byRes.values()].sort(bySize),
      reasons: [...byReason.values()].sort(bySize),
      unknownReason,
      settled: settled.length,
    };
  }, [rows, reasons]);
  /*  the bars are drawn off the rows in hand; when the period holds more than
      one page of them, the cards say so instead of implying they cover it all  */
  const rowsShort = rowTotal !== null && rows !== null && rowTotal > rows.length;

  const resMax = Math.max(1, ...grouped.resolutions.map((r) => r.n));
  const reaMax = Math.max(1, ...grouped.reasons.map((r) => r.n));

  const openNow = live
    ? OPEN_STATUSES.reduce((t, s) => t + (live.counts[s] ?? 0), 0)
    : null;

  const jobs: NowJob[] = live ? [
    { key: "approve", label: "Waiting for approval", count: live.needsApproval, href: "/returns?status=pending_approval", tone: "danger" },
    { key: "settle", label: "Approved, not settled", count: live.counts.approved ?? 0, href: "/returns?status=approved", tone: "warn" },
    { key: "draft", label: "Started, not sent", count: live.counts.draft ?? 0, href: "/returns?status=draft", tone: "warn" },
  ] : [];

  /*  newest first among the rows in hand. When the period holds more than one
      page, the server's own order decides which page was read, so these are
      the newest OF WHAT WAS READ - which is what the line under the table
      says.  */
  const latest = [...(rows ?? [])]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8);

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Sales"
        title="Returns & Refunds"
        desc="What came back, why it came back, and what the shop paid to settle it."
      />

      <NowBand
        title="Waiting to be settled right now"
        figures={[
          { label: "Open returns", value: openNow === null ? "—" : count(openNow), quiet: !live || openNow === 0,
            sub: live ? "started, waiting or approved" : undefined },
          { label: "Waiting for approval", value: live ? count(live.needsApproval) : "—",
            quiet: !live || live.needsApproval === 0 },
          { label: "Asked for, not paid", value: live ? formatTaka(live.waitingPaisa) : "—",
            quiet: !live || live.waitingPaisa === 0,
            sub: live ? "capped at what is still in hand" : undefined },
        ]}
        jobs={jobs}
        loading={liveSt === "loading"}
        failed={liveSt === "error"}
        note={liveSt === "error"
          ? "The returns book did not answer, so nothing on this line can be trusted."
          : live ? "These are true at this moment and do not follow the period switch." : undefined}
      />

      <div className="mt-[18px]">
        <RangeBar range={range} onPick={setRange}
          right={<Link href="/returns/new" className="underline font-semibold" style={{ color: "var(--t-accent)" }}>new return →</Link>} />
      </div>

      <KpiRow>
        <Kpi
          icon={<Icon name="upload" size={18} />} iconBg="var(--s-warn)" iconColor="var(--t-warn)"
          label="Returns" value={nAll === null ? "—" : count(nAll)}
          scope={<Scope text="both doors" />}
          delta={<Delta now={nAll} before={cmp(n(before))} invert />}
        >
          {splitSt === "ok" && online && counter ? (
            <SplitLine
              a={{ label: "website", value: online.counts.all ?? 0, color: "var(--f-chart)" }}
              b={{ label: "counter", value: counter.counts.all ?? 0, color: "var(--t-gold)" }}
              fmt={(v) => count(v)} />
          ) : (
            <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
              {allSt === "error" ? "the returns book did not answer"
                : allSt === "loading" ? "reading the returns book…"
                  : "the website/counter split could not be read"}
            </div>
          )}
        </Kpi>
        <Kpi
          icon={<Icon name="box" size={18} />} iconBg="var(--s-accent)" iconColor="var(--t-accent)"
          label="Value returned" value={all ? formatTaka(all.returnValuePaisa) : "—"}
          scope={<Scope text="goods, at the billed price" />}
          delta={<Delta now={all ? all.returnValuePaisa : null} before={cmp(before ? before.returnValuePaisa : null)} invert />}
        >
          {splitSt === "ok" && online && counter ? (
            <SplitLine
              a={{ label: "website", value: online.returnValuePaisa, color: "var(--f-chart)" }}
              b={{ label: "counter", value: counter.returnValuePaisa, color: "var(--t-gold)" }}
              fmt={formatTaka} />
          ) : (
            <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
              {allSt === "error" ? "the returns book did not answer"
                : allSt === "loading" ? "reading the returns book…"
                  : "the website/counter split could not be read"}
            </div>
          )}
        </Kpi>
        <Kpi
          icon={<Icon name="cash" size={18} />} iconBg="var(--s-bad)" iconColor="var(--t-bad)"
          label="Money paid back" value={paidOut === null ? "—" : formatTaka(paidOut)}
          scope={<Scope text="left the till" />}
          delta={<Delta now={paidOut} before={cmp(before ? before.refundPaisa + before.compensationPaisa : null)} invert />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {all
              ? all.compensationPaisa > 0
                ? `${formatTaka(all.refundPaisa)} refunded, ${formatTaka(all.compensationPaisa)} as compensation`
                : "refunds only — a refund can never be more than what was collected"
              : allSt === "error" ? "the returns book did not answer" : "reading the returns book…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="tag" size={18} />} iconBg="var(--s-info)" iconColor="var(--t-info)"
          label="Given as credit" value={all ? formatTaka(all.storeCreditPaisa) : "—"}
          scope={<Scope text="owed in goods" />}
          delta={<Delta now={all ? all.storeCreditPaisa : null} before={cmp(before ? before.storeCreditPaisa : null)} invert />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {all
              ? all.storeCreditPaisa === 0 ? "no store credit was given in this period"
                : "a promise of goods, not money out of the till"
              : allSt === "error" ? "the returns book did not answer" : "reading the returns book…"}
          </div>
        </Kpi>
      </KpiRow>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-[18px] mb-[18px]">
        <Card title="How each one was settled"
          right={<Scope text={rowsShort ? "newest 200 of this period" : "settled, this period"} />}>
          <div className="mt-[18px]">
            {grouped.resolutions.length > 0 ? grouped.resolutions.map((r) => (
              <TrackRow key={r.label} label={r.label} value={`${count(r.n)} return${r.n === 1 ? "" : "s"}`}
                width={(r.n / resMax) * 100} color="var(--f-chart)"
                right={<span className="text-[10.5px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                  {formatTaka(r.paisa)}
                </span>} />
            )) : (
              <Empty state={rowsSt} empty="Nothing came back in this period."
                error="The returns list did not answer, so how they were settled cannot be shown." />
            )}
          </div>
          <Rule />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Paid back per ৳100 booked as returned"
              value={all && all.returnValuePaisa > 0 && paidOut !== null
                ? `৳${Math.round((paidOut / all.returnValuePaisa) * 100)}` : "—"}
              sub={!all ? undefined
                : all.returnValuePaisa === 0 ? "nothing came back to measure"
                  : "taken over every return booked, including any refused"} />
            <Stat label="Settled and closed"
              value={all ? count(all.counts.completed ?? 0) : "—"}
              sub={all ? `${count(all.counts.rejected ?? 0)} rejected, ${count(all.counts.cancelled ?? 0)} cancelled` : undefined} />
          </div>
        </Card>

        <Card title="Why they came back"
          right={<Scope text={rowsShort ? "newest 200 of this period" : "this period"} />}>
          <div className="mt-[18px]">
            {grouped.reasons.length > 0 ? grouped.reasons.map((r) => (
              <TrackRow key={r.label} label={r.label} value={`${count(r.n)} return${r.n === 1 ? "" : "s"}`}
                width={(r.n / reaMax) * 100} color="var(--t-warn)"
                right={<span className="text-[10.5px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                  {formatTaka(r.paisa)}
                </span>} />
            )) : (
              <Empty state={at("reasons") === "error" ? "error" : rowsSt}
                empty={(rows ?? []).length > 0
                  ? "Not one return in this period has a reason recorded."
                  : "Nothing came back in this period."}
                error="The reason list did not answer, so why they came back cannot be shown." />
            )}
          </div>
          {grouped.unknownReason > 0 ? (
            <div className="mt-4">
              <Chip tone="warn">
                {`${count(grouped.unknownReason)} return${grouped.unknownReason === 1 ? "" : "s"} carry no reason, so they are in none of the bars above`}
              </Chip>
            </div>
          ) : null}
          {at("reasons") === "error" ? (
            <p className="text-[12px] m-0 mt-4" style={{ color: "var(--t-faint)" }}>
              The reason list did not answer, so only returns that carry their own reason name are grouped here.
            </p>
          ) : null}
        </Card>
      </div>

      <Card title="The latest returns" right={<Scope text="this period" />}>
        {latest.length > 0 ? (
          <Table head={[{ label: "Return" }, { label: "Order" }, { label: "Customer" }, { label: "Settled as" }, { label: "Where it stands" }, { label: "Value", right: true }, { label: "Paid back", right: true }]} min={780}>
            {latest.map((r) => {
              const meta = RETURN_STATUS_META[r.status];
              return (
                <tr key={r.id}>
                  <Td bold><Link href={`/returns/${r.id}`} className="hover:underline">{r.returnNo}</Link></Td>
                  <Td color="var(--t-faint)">{r.order?.orderNo ?? "—"}</Td>
                  <Td>{r.customer?.name ?? "—"}</Td>
                  <Td color="var(--t-faint)">{RESOLUTION_LABEL[r.resolution] ?? r.resolution}</Td>
                  <Td color={meta?.tone}>{meta?.label ?? r.status}</Td>
                  <Td right>{formatTaka(r.returnValuePaisa)}</Td>
                  <Td right bold>{formatTaka(r.refundPaisa + r.compensationPaisa)}</Td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <div className="mt-4">
            <Empty state={rowsSt} empty="Nothing came back in this period."
              error="The returns list did not answer." />
          </div>
        )}
        {(rowTotal ?? 0) > latest.length ? (
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {rowsShort
              ? `8 of the ${count((rows ?? []).length)} read, out of ${count(rowTotal ?? 0)} in this period. `
              : `The 8 newest of ${count(rowTotal ?? 0)} in this period. `}
            <Link href="/returns/list" className="underline font-semibold" style={{ color: "var(--t-accent)" }}>see them all</Link>
          </div>
        ) : null}
      </Card>

      <SourceNote>
        The band is true at this moment and does not follow the period switch. Everything else covers returns
        <b> booked</b> between {dayLabel(range.from)} and {dayLabel(range.to)} — a return raised today against an older
        order counts today. A return is its own document: the order it came from is never rewritten, and the money paid
        back can never be more than what was collected on that order, which is why <b>value returned</b> and
        <b> money paid back</b> are two figures and not one. Store credit is a promise of goods rather than money out
        of the till, so it is counted on its own. How each one was settled counts only the returns that were
        actually completed, so it will not match the total when some are still open, refused or cancelled.
        {rowsShort ? " More than one page of returns falls in this period, so the two breakdown cards cover the newest 200 of them; the headline figures cover all of them." : ""}
        {beforeSt === "error" ? " The period before this one did not answer, so no comparison is shown." : ""}
      </SourceNote>
    </div>
  );
}
