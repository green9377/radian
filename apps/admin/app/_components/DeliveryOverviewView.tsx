"use client";

/*  DELIVERY OVERVIEW — what is on the road now, what got there on time, and
    what delivery costs the shop.

    Built on OverviewKit (12 Sep 2026), the same pattern as the other overview
    screens. `/delivery` used to open the fulfilment board; the board is a
    working screen, not an overview, so it keeps its own page at
    `/delivery/board` and the module root answers the owner's question instead.

    THREE POPULATIONS, EACH MARKED.
      NOW     - today's board and the cash carriers are holding. These do NOT
                follow the period switch.
      PERIOD  - `/delivery/performance?from&to`: delivered, on time, failed,
                what was charged and what it cost.
      LAST 30 - `/delivery/money?days=30` only takes a number of days, so its
                figures carry their own mark and are never folded into the
                period figures.

    A RATE ALWAYS SHOWS ITS DENOMINATOR. Only a delivery that carried a
    promised time can be judged late, so "on time" is a share of `measurable`,
    not of everything delivered - and a rider judged on three parcels is not
    making the same claim as one judged on fifty.  */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import {
  ApiBoardPage, ApiDeliveryAnalytics, ApiMoney, deliveryBoard, deliveryMoney,
  deliveryPerformance, formatTaka,
} from "../_data/api";
import {
  BarChart, Card, ChartCard, Chip, DAY_MS, Delta, Empty, Kpi, KpiRow, NowBand, RangeBar,
  Rule, Scope, SourceNote, Stat, SubHead, Table, Td, TrackRow, bp, count, dayLabel,
  hoursMins, presetRange, previousRange, useLoadState, type NowJob, type Point, type Range,
} from "./OverviewKit";

function everyDay(from: string, to: string): string[] {
  const out: string[] = [];
  let t = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  while (t <= end && out.length < 400) { out.push(new Date(t).toISOString().slice(0, 10)); t += DAY_MS; }
  return out;
}

type Tab = "delivered" | "ontime" | "judged";

export function DeliveryOverviewView() {
  const [range, setRange] = useState<Range>(presetRange("d30"));
  const [tab, setTab] = useState<Tab>("delivered");
  const [perf, setPerf] = useState<ApiDeliveryAnalytics | null>(null);
  const [prevPerf, setPrevPerf] = useState<ApiDeliveryAnalytics | null>(null);
  const [board, setBoard] = useState<ApiBoardPage | null>(null);
  const [money, setMoney] = useState<ApiMoney | null>(null);
  const { settle, begin, at } = useLoadState();

  /*  the board and the carrier cash are "now" figures, so they are read once
      and never re-read when the dates change  */
  useEffect(() => {
    let alive = true;
    begin("board", "money");
    void (async () => {
      const r = await Promise.allSettled([deliveryBoard({}), deliveryMoney(30)]);
      if (!alive) return;
      setBoard(r[0].status === "fulfilled" ? r[0].value : null);
      setMoney(r[1].status === "fulfilled" ? r[1].value : null);
      settle({ board: r[0], money: r[1] });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    begin("perf", "before");
    /*  clear first: last month's figures under this week's dates is the lie
        rule 3 exists to stop  */
    setPerf(null); setPrevPerf(null);
    const prev = previousRange(range);
    void (async () => {
      const r = await Promise.allSettled([
        deliveryPerformance({ from: range.from, to: range.to }),
        deliveryPerformance({ from: prev.from, to: prev.to }),
      ]);
      if (!alive) return;
      setPerf(r[0].status === "fulfilled" ? r[0].value : null);
      setPrevPerf(r[1].status === "fulfilled" ? r[1].value : null);
      settle({ perf: r[0], before: r[1] });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  const perfSt = at("perf"), beforeSt = at("before"), boardSt = at("board"), moneySt = at("money");
  const cmp = (v: number | null) => (beforeSt === "error" ? undefined : v);

  /*  the endpoint answers only the days something happened, so the empty days
      are filled in here - a chart that skips them makes four deliveries in a
      month look like four busy days in a row  */
  const daily = useMemo(() => {
    const byDay = new Map((perf?.daily ?? []).map((d) => [d.onDate.slice(0, 10), d]));
    const days = everyDay(range.from, range.to);
    const delivered: Point[] = [], onTime: Point[] = [], judged: Point[] = [];
    for (const d of days) {
      const row = byDay.get(d);
      delivered.push({ date: d, value: row?.delivered ?? 0 });
      onTime.push({ date: d, value: row?.onTimeCount ?? 0 });
      judged.push({ date: d, value: row?.measurable ?? 0 });
    }
    return { delivered, onTime, judged };
  }, [perf, range.from, range.to]);

  const zoneMax = Math.max(1, ...(perf?.byZone ?? []).map((z) => z.delivered));
  const carriers = [...(perf?.byCarrier ?? [])].sort((a, b) => b.delivered - a.delivered);

  /*  the charged amount is ONE WHOLE: what the carriers took out of it, and
      what stayed with the shop. Drawing the cost under the word "charged" had
      it backwards.  */
  const charged = perf?.chargedPaisa ?? 0;
  const cost = perf?.costPaisa ?? 0;
  const anyDeliveryMoney = charged > 0 || cost > 0;
  /*  when the carriers took MORE than was charged there is no two-part split
      to draw: clamping it printed a clean full bar with a negative amount
      labelled "stayed with the shop"  */
  const overrun = cost > charged;
  const keptPc = charged > 0 && !overrun ? Math.min(100, ((charged - cost) / charged) * 100) : 0;

  const seg = board?.segCounts ?? {};
  const jobs: NowJob[] = board ? [
    { key: "notAssigned", label: "No carrier yet", count: seg.notAssigned ?? 0, href: "/delivery/board?seg=notAssigned", tone: "danger" },
    { key: "late", label: "Past the promised time", count: seg.late ?? 0, href: "/delivery/board?seg=late", tone: "danger" },
    { key: "photoPending", label: "Waiting for a photo", count: seg.photoPending ?? 0, href: "/delivery/board?seg=photoPending", tone: "warn" },
    { key: "ready", label: "Ready to go out", count: seg.ready ?? 0, href: "/delivery/board?seg=ready", tone: "warn" },
    { key: "failed", label: "Failed today", count: seg.failed ?? 0, href: "/delivery/board?seg=failed", tone: "danger" },
    /*  "cost not recorded" is a 30-day figure from the money report, so it
        belongs on the card that carries that mark - not on a band whose own
        note says every number on it is today's board.  */
  ] : [];

  const chart: Record<Tab, { big: string; scope: string; unit: string; pts: Point[] }> = {
    delivered: { big: perf ? count(perf.delivered) : "—", scope: "handed over", unit: "delivered", pts: daily.delivered },
    ontime: {
      big: perf ? `${count(perf.onTimeCount)} of ${count(perf.measurable)}` : "—",
      scope: "on time, of those judged", unit: "on time", pts: daily.onTime,
    },
    judged: { big: perf ? count(perf.measurable) : "—", scope: "carried a promised time", unit: "judged", pts: daily.judged },
  };

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Operations"
        title="Delivery"
        desc="What is on the road now, how much of it arrived on time, and what delivery costs the shop."
      />

      <NowBand
        title="On the road right now"
        figures={[
          { label: "Parcels today", value: board ? count(seg.all ?? 0) : "—", quiet: !board,
            sub: board ? dayLabel(board.date) : undefined },
          { label: "Out for delivery", value: board ? count(seg.onRoad ?? 0) : "—", quiet: !board || (seg.onRoad ?? 0) === 0 },
          { label: "Delivered today", value: board ? count(seg.delivered ?? 0) : "—", quiet: !board || (seg.delivered ?? 0) === 0 },
          { label: "Cash with carriers · last 30 days", value: money ? formatTaka(money.totals.withCarrier) : "—",
            quiet: !money || money.totals.withCarrier === 0, sub: money ? "collected, not handed in" : undefined },
        ]}
        jobs={jobs}
        loading={boardSt === "loading"}
        failed={boardSt === "error"}
        note={[
          boardSt === "error" ? "The board did not answer, so the parcel figures on this line cannot be trusted." : "",
          moneySt === "error" ? "The delivery money report did not answer, so the carrier cash is not shown." : "",
          boardSt === "ok" ? "The parcel figures are today's board and the carrier cash is the last 30 days; neither follows the period below." : "",
        ].filter(Boolean).join(" ") || undefined}
      />

      <div className="mt-[18px]">
        <RangeBar range={range} onPick={setRange}
          right={<Link href="/delivery/board" className="underline font-semibold" style={{ color: "var(--t-accent)" }}>the board →</Link>} />
      </div>

      <KpiRow>
        <Kpi
          icon={<Icon name="truck" size={18} />} iconBg="var(--s-ok)" iconColor="var(--t-ok)"
          label="Delivered" value={perf ? count(perf.delivered) : "—"}
          scope={<Scope text="this period" />}
          delta={<Delta now={perf ? perf.delivered : null} before={cmp(prevPerf ? prevPerf.delivered : null)} />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {perf ? `${count(perf.inFlight)} placed in this period are still on the road`
              : perfSt === "error" ? "the delivery report did not answer" : "reading the delivery report…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="clock" size={18} />}
          iconBg={perf && perf.onTimeBp !== null && perf.onTimeBp < 8000 ? "var(--s-warn)" : "var(--s-info)"}
          iconColor={perf && perf.onTimeBp !== null && perf.onTimeBp < 8000 ? "var(--t-warn)" : "var(--t-info)"}
          label="On time" value={perf ? bp(perf.onTimeBp) : "—"}
          scope={<Scope text="of those judged" />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {perf
              ? perf.measurable > 0
                ? `${count(perf.onTimeCount)} of ${count(perf.measurable)} that carried a promised time${perf.unmeasurable > 0 ? ` · ${count(perf.unmeasurable)} had none` : ""}`
                : "no delivery in this period carried a promised time, so none can be judged"
              : perfSt === "error" ? "the delivery report did not answer" : "reading the delivery report…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="bolt" size={18} />}
          iconBg={perf && perf.failed > 0 ? "var(--s-bad)" : "var(--s-ok)"}
          iconColor={perf && perf.failed > 0 ? "var(--t-bad)" : "var(--t-ok)"}
          label="Failed" value={perf ? count(perf.failed) : "—"}
          negative={!!perf && perf.failed > 0}
          scope={<Scope text="this period" />}
          delta={<Delta now={perf ? perf.failed : null} before={cmp(prevPerf ? prevPerf.failed : null)} invert />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {perf
              ? perf.failedBp !== null
                ? `${count(perf.failed)} of ${count(perf.delivered + perf.failed)} finished attempts · ${bp(perf.failedBp)}`
                : "nothing was attempted in this period"
              : perfSt === "error" ? "the delivery report did not answer" : "reading the delivery report…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="cash" size={18} />}
          iconBg={perf && perf.marginPaisa < 0 ? "var(--s-bad)" : "var(--s-accent)"}
          iconColor={perf && perf.marginPaisa < 0 ? "var(--t-bad)" : "var(--t-accent)"}
          label="Kept on delivery" value={perf ? formatTaka(perf.marginPaisa) : "—"}
          negative={!!perf && perf.marginPaisa < 0}
          scope={<Scope text="charged less cost" />}
          delta={<Delta now={perf ? perf.marginPaisa : null} before={cmp(prevPerf ? prevPerf.marginPaisa : null)} />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {perf
              ? charged > 0
                ? `charged ${formatTaka(charged)}, carriers took ${formatTaka(cost)}`
                : cost > 0
                  ? `nothing was charged, and carriers took ${formatTaka(cost)}`
                  : "no delivery was charged for and none cost anything in this period"
              : perfSt === "error" ? "the delivery report did not answer" : "reading the delivery report…"}
          </div>
        </Kpi>
      </KpiRow>

      <div className="mb-[18px]">
        <ChartCard<Tab>
          title="Delivery, day by day"
          tab={tab} onTab={setTab}
          tabs={[
            { v: "delivered", label: "Delivered" },
            { v: "ontime", label: "On time" },
            { v: "judged", label: "Judged" },
          ]}
          big={perf ? chart[tab].big : "—"}
          scope={<Scope text={chart[tab].scope} />}
          empty={perfSt === "loading" ? "Reading the delivery report…"
            : perfSt === "error" ? "The delivery report did not answer, so nothing can be drawn."
              : perf && perf.delivered === 0 && perf.failed === 0 ? "Nothing was delivered in this period." : undefined}
        >
          <BarChart pts={chart[tab].pts} id={`dlv-${tab}`} noun="Delivery, day by day" unit={chart[tab].unit} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.25fr] gap-[18px] mb-[18px]">
        <Card title="Which area gets the parcels" right={<Scope text="this period" />}>
          <div className="mt-[18px]">
            {(perf?.byZone ?? []).length > 0 ? perf!.byZone.map((z) => (
              <TrackRow key={z.name} label={z.name} value={`${count(z.delivered)} delivered`}
                width={(z.delivered / zoneMax) * 100} color="var(--f-chart)"
                right={<span className="text-[10.5px]" style={{ color: "var(--t-faint)" }}>
                  {z.measurable > 0 ? `${bp(z.onTimeBp)} on time of ${count(z.measurable)}` : "none judged"}
                </span>} />
            )) : (
              <Empty state={perfSt} empty="Nothing was delivered in this period."
                error="The delivery report did not answer." />
            )}
          </div>
          <Rule />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Door to door" value={perf ? hoursMins(perf.avgMinutesToDeliver) : "—"}
              sub={perf && perf.avgMinutesToDeliver === null ? "no delivery was timed" : "from order to hand-over"} />
            <Stat label="Still on the road" value={perf ? count(perf.inFlight) : "—"}
              sub="placed in this period, not finished — today's board shows only today's" />
          </div>
        </Card>

        <Card title="Who carried them" right={<Scope text="this period" />}>
          {carriers.length > 0 ? (
            <Table head={[{ label: "Carrier" }, { label: "Kind" }, { label: "Delivered", right: true }, { label: "Judged", right: true }, { label: "On time", right: true }, { label: "Cost", right: true }]} min={620}>
              {carriers.map((c) => (
                <tr key={`${c.kind}-${c.name}`}>
                  <Td bold>{c.name}</Td>
                  <Td color="var(--t-faint)">{c.kind === "RIDER" ? "Own rider" : "Courier"}</Td>
                  <Td right>{count(c.delivered)}</Td>
                  <Td right color="var(--t-faint)">{count(c.measurable)}</Td>
                  <Td right bold color={c.measurable === 0 ? "var(--t-faint)"
                    : c.onTimeBp !== null && c.onTimeBp < 5000 ? "var(--t-bad)"
                      : c.onTimeBp !== null && c.onTimeBp < 8000 ? "var(--t-warn)" : "var(--t-ok)"}>
                    {c.measurable === 0 ? "not judged" : bp(c.onTimeBp)}
                  </Td>
                  <Td right>{formatTaka(c.costPaisa)}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <div className="mt-4">
              <Empty state={perfSt} empty="No carrier delivered anything in this period."
                error="The delivery report did not answer." />
            </div>
          )}
          <Rule />
          <SubHead>What was charged, and where it went</SubHead>
          {perf && anyDeliveryMoney ? (
            <div className="mt-3.5">
              <div className="h-[8px] rounded flex overflow-hidden gap-[2px]" style={{ background: "var(--s-sunken)" }}>
                {overrun ? (
                  <span style={{ flex: "1 1 100%", background: "var(--t-bad)" }} />
                ) : (
                  <>
                    <span style={{ flex: `0 1 ${keptPc}%`, background: "var(--t-ok)" }} />
                    <span style={{ flex: `0 1 ${100 - keptPc}%`, background: "var(--t-warn)" }} />
                  </>
                )}
              </div>
              <div className="flex justify-between text-[11.5px] mt-[7px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                {overrun ? (
                  <>
                    <span style={{ color: "var(--t-bad)" }}>
                      <b>the carriers cost more than was charged</b> by {formatTaka(cost - charged)}
                    </span>
                    <span>charged {formatTaka(charged)}</span>
                  </>
                ) : (
                  <>
                    <span><b style={{ color: "var(--t-ok)" }}>stayed with the shop</b> {formatTaka(charged - cost)}</span>
                    <span><b style={{ color: "var(--t-warn)" }}>carriers took</b> {formatTaka(cost)}</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3.5">
              <Empty state={perfSt}
                empty="No delivery was charged for in this period, and none cost anything."
                error="The delivery report did not answer." />
            </div>
          )}
        </Card>
      </div>

      <Card title="Delivery money still out there" right={<Scope text="last 30 days" />}>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 mt-[18px]">
          <Stat label="Still to collect" value={money ? formatTaka(money.totals.toCollect) : "—"}
            tone={money && money.totals.toCollect > 0 ? "warn" : undefined}
            sub="cash on delivery, not yet taken" href="/delivery/settle" />
          <Stat label="Held by carriers" value={money ? formatTaka(money.totals.withCarrier) : "—"}
            tone={money && money.totals.withCarrier > 0 ? "warn" : undefined}
            sub="collected, not handed in" href="/finance/carrier" />
          <Stat label="Already received" value={money ? formatTaka(money.totals.received) : "—"}
            sub="handed in and booked" />
          <Stat label="Paid to carriers" value={money ? formatTaka(money.totals.paidCarrier) : "—"}
            sub="their fee, already settled" />
          <Stat label="Cost not recorded" value={money ? count(money.totals.costMissing) : "—"}
            tone={money && money.totals.costMissing > 0 ? "bad" : undefined}
            sub="parcels whose carrier fee is missing" href="/delivery/settle" />
        </div>
        {moneySt === "error" ? (
          <p className="text-[12px] m-0 mt-4" style={{ color: "var(--t-faint)" }}>
            The delivery money report did not answer, so this card cannot be shown.
          </p>
        ) : null}
        {money && money.totals.costMissing > 0 ? (
          <div className="mt-4">
            <Chip tone="bad">
              {`${count(money.totals.costMissing)} ${money.totals.costMissing === 1 ? "parcel has" : "parcels have"} no carrier fee recorded — every cost figure above is short by that much`}
            </Chip>
          </div>
        ) : null}
      </Card>

      <SourceNote>
        The band is today&apos;s board and does not follow the period switch. Delivered, on time, failed and the
        delivery charge are the delivery report for{" "}
        {range.from === range.to ? dayLabel(range.from) : `${dayLabel(range.from)} to ${dayLabel(range.to)}`}.
        <b> On time is a share of the deliveries that carried a promised time</b>, never of everything delivered, and
        the Judged column says how many that was — a rate off three parcels is not the claim a rate off fifty is. The
        money card can only be asked for a number of days, so it is marked <b>last 30 days</b> and is never added to
        the period figures.
        {beforeSt === "error" ? " The period before this one did not answer, so no comparison is shown." : ""}
      </SourceNote>
    </div>
  );
}
