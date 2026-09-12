"use client";

/*  ASSEMBLY OVERVIEW — what is being built, what it used, and what is waiting
    to reach the shelves.

    Built on OverviewKit (12 Sep 2026), the same pattern as the other overview
    screens.

    WHERE THE PERIOD COMES FROM. `/assembly/overview` answers three fixed
    windows - now, today and this month - and its `byActor` and `topTemplates`
    lists carry no stated window at all, so neither can be put under a heading
    naming the reader's dates. `/assembly/productions` returns every run with
    its `startedAt`, so the runs are read once and sliced, and who built what
    is counted off those rows. The overview endpoint is used ONLY for the live
    band, where its three windows are each marked.

    PIECES ARE NOT A HEADLINE. A run's `finishedQtyMilli` is counted in the
    target item's own unit, so adding bouquets to metres of ribbon gives a
    number that moves when the mix changes and means nothing on its own. The
    headline figures are runs (countable) and money (comparable); pieces appear
    only on a row, beside the thing they are pieces of.

    A RUN IS NOT DONE WHEN IT IS FINISHED. Finished means built; the goods only
    reach the stock board when the run is TRANSFERRED (DEC-ASM). So "waiting to
    be moved" is the job this screen exists to surface.  */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import {
  AsmOverview, AsmProduction, AsmWastageReport, formatTaka, fmtQty, getAsmOverview,
  getAsmWastage, listAsmProductions,
} from "../_data/api";
import {
  AreaChart, BD_OFFSET_MS, BarChart, Card, ChartCard, Chip, DAY_MS, Delta, Empty, Kpi,
  KpiRow, NowBand, RangeBar, Rule, Scope, SourceNote, Stat, SubHead, Table, Td, TrackRow,
  count, dayLabel, hoursMins, presetRange, previousRange, useLoadState,
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

type Tab = "runs" | "used" | "wasted";

interface Cut {
  runs: number; cancelled: number; usedPaisa: number; wastedPaisa: number;
  minutes: number; timed: number;
  byActor: { who: string; runs: number; usedPaisa: number; wastedPaisa: number; minutes: number; timed: number }[];
  byTemplate: { key: string; name: string; runs: number; usedPaisa: number; pieces: number; unit: string | null; made: string | null }[];
  perDayRuns: Point[]; perDayUsed: Point[]; perDayWasted: Point[];
}
const EMPTY_CUT: Cut = {
  runs: 0, cancelled: 0, usedPaisa: 0, wastedPaisa: 0, minutes: 0, timed: 0,
  byActor: [], byTemplate: [], perDayRuns: [], perDayUsed: [], perDayWasted: [],
};

export function AssemblyOverviewView() {
  const [range, setRange] = useState<Range>(presetRange("d30"));
  const [tab, setTab] = useState<Tab>("runs");
  const [ov, setOv] = useState<AsmOverview | null>(null);
  const [prods, setProds] = useState<AsmProduction[] | null>(null);
  const [waste, setWaste] = useState<AsmWastageReport | null>(null);
  const { settle, begin, at } = useLoadState();

  useEffect(() => {
    let alive = true;
    begin("overview", "runs", "waste");
    void (async () => {
      const r = await Promise.allSettled([getAsmOverview(), listAsmProductions(), getAsmWastage(30)]);
      if (!alive) return;
      setOv(r[0].status === "fulfilled" ? r[0].value : null);
      setProds(r[1].status === "fulfilled" ? r[1].value : null);
      setWaste(r[2].status === "fulfilled" ? r[2].value : null);
      settle({ overview: r[0], runs: r[1], waste: r[2] });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ovSt = at("overview"), runSt = at("runs"), wasteSt = at("waste");

  function slice(from: string, to: string): Cut {
    if (!prods) return EMPTY_CUT;
    const actors = new Map<string, { who: string; runs: number; usedPaisa: number; wastedPaisa: number; minutes: number; timed: number }>();
    const templates = new Map<string, { key: string; name: string; runs: number; usedPaisa: number; pieces: number; unit: string | null; made: string | null }>();
    const dR = new Map<string, number>(), dU = new Map<string, number>(), dW = new Map<string, number>();
    let runs = 0, cancelled = 0, used = 0, wasted = 0, minutes = 0, timed = 0;
    for (const p of prods) {
      /*  a run belongs to the day it was STARTED - that is the day somebody
          stood at the bench  */
      const d = bdDayOf(p.startedAt);
      if (d < from || d > to) continue;
      if (p.status === "CANCELLED") { cancelled++; continue; }
      runs++;
      used += p.totalUsedValuePaisa;
      wasted += p.totalWastedValuePaisa;
      if (p.durationMin != null) { minutes += p.durationMin; timed++; }
      dR.set(d, (dR.get(d) ?? 0) + 1);
      dU.set(d, (dU.get(d) ?? 0) + p.totalUsedValuePaisa);
      dW.set(d, (dW.get(d) ?? 0) + p.totalWastedValuePaisa);

      const who = p.actor || p.assignedTo || "not recorded";
      const a = actors.get(who) ?? { who, runs: 0, usedPaisa: 0, wastedPaisa: 0, minutes: 0, timed: 0 };
      a.runs++; a.usedPaisa += p.totalUsedValuePaisa; a.wastedPaisa += p.totalWastedValuePaisa;
      if (p.durationMin != null) { a.minutes += p.durationMin; a.timed++; }
      actors.set(who, a);

      /*  KEYED BY RECIPE **AND** TARGET ITEM. One recipe can be built into two
          different items with two different units, and adding those quantities
          into one row then printing one unit beside them is the very thing the
          footnote below promises never to do.  */
      const tn = p.templateName || p.template?.name || "no template";
      const key = `${p.templateId || tn}|${p.targetItemId ?? ""}`;
      const t = templates.get(key) ?? {
        key, name: tn, runs: 0, usedPaisa: 0, pieces: 0,
        unit: p.targetItem?.unit?.shortCode ?? null,
        made: p.targetItem?.name ?? null,
      };
      t.runs++; t.usedPaisa += p.totalUsedValuePaisa; t.pieces += p.finishedQtyMilli;
      templates.set(key, t);
    }
    const days = everyDay(from, to);
    return {
      runs, cancelled, usedPaisa: used, wastedPaisa: wasted, minutes, timed,
      byActor: [...actors.values()].sort((a, b) => b.runs - a.runs),
      byTemplate: [...templates.values()].sort((a, b) => b.runs - a.runs),
      perDayRuns: days.map((d) => ({ date: d, value: dR.get(d) ?? 0 })),
      perDayUsed: days.map((d) => ({ date: d, value: dU.get(d) ?? 0 })),
      perDayWasted: days.map((d) => ({ date: d, value: dW.get(d) ?? 0 })),
    };
  }

  const prev = previousRange(range);
  const cut = useMemo(() => slice(range.from, range.to), [prods, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const before = useMemo(() => slice(prev.from, prev.to), [prods, prev.from, prev.to]); // eslint-disable-line react-hooks/exhaustive-deps
  /*  `/assembly/productions` answers with EVERY run and no window, so an
      earlier period holding no runs means nothing was built then - "nothing
      before" - not a gap in the read. Capping the comparison on the oldest run
      made every KPI on the default view claim "no earlier period" over a
      window the list covers completely.  */
  const cmp = (v: number) => (runSt === "ok" ? v : undefined);

  /*  a tint is a claim too: `0 > 0` is false while a call is still out, so the
      card wore the all-clear green over a read that had failed  */
  const anyWaste = runSt === "ok" && cut.wastedPaisa > 0;
  const actorMax = Math.max(1, ...cut.byActor.map((a) => a.runs));
  const actorWasteMax = Math.max(1, ...cut.byActor.map((a) => a.wastedPaisa));
  const wasteMax = Math.max(1, ...(waste?.byComponent ?? []).map((c) => c.valuePaisa));

  const awaiting = ov?.finishedAwaiting ?? [];
  const running = ov?.running ?? [];

  const jobs: NowJob[] = ov ? [
    { key: "awaiting", label: "Built, not moved to stock", count: ov.kpis.awaitingTransferCount, href: "/assembly/finished", tone: "danger" },
    { key: "running", label: "On the bench now", count: ov.kpis.runningCount, href: "/assembly/pipeline", tone: "warn" },
    { key: "noentry", label: "No bench entry today", count: ov.noEntryToday ? 1 : 0, flag: true, href: "/assembly/pipeline", tone: "warn" },
  ] : [];

  const chart: Record<Tab, { big: string; scope: string; node: React.ReactNode }> = {
    runs: {
      big: count(cut.runs), scope: "runs started, day by day",
      node: <BarChart pts={cut.perDayRuns} id="asm-runs" noun="Runs, day by day" unit="runs" />,
    },
    used: {
      big: formatTaka(cut.usedPaisa), scope: "materials used, by the day the run started",
      node: <AreaChart pts={cut.perDayUsed} id="asm-used" fmt={formatTaka} noun="Materials used, day by day" />,
    },
    wasted: {
      big: formatTaka(cut.wastedPaisa), scope: "wasted, by the day the run started",
      node: <AreaChart pts={cut.perDayWasted} id="asm-waste" fmt={formatTaka} noun="Wasted, day by day" best={false} />,
    },
  };

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Stock"
        title="Assembly"
        desc="What is being built, what it used up, and what is built but not yet on the shelves."
      />

      <NowBand
        title="On the bench right now"
        figures={[
          { label: "Being built", value: ov ? count(ov.kpis.runningCount) : "—",
            quiet: !ov || ov.kpis.runningCount === 0 },
          { label: "Built, not moved to stock", value: ov ? count(ov.kpis.awaitingTransferCount) : "—",
            quiet: !ov || ov.kpis.awaitingTransferCount === 0,
            sub: ov && ov.kpis.awaitingTransferCount > 0
              ? `${formatTaka(ov.kpis.awaitingTransferValuePaisa)} sitting off the board` : undefined },
          { label: "Runs today", value: ov ? count(ov.kpis.runsToday) : "—", quiet: !ov || ov.kpis.runsToday === 0 },
          { label: "Recipes set up", value: ov ? count(ov.kpis.templateCount) : "—", quiet: !ov,
            sub: ov ? "things the shop can build" : undefined },
        ]}
        jobs={jobs}
        loading={ovSt === "loading"}
        failed={ovSt === "error"}
        note={[
          ovSt === "error" ? "The assembly board did not answer, so nothing on this line can be trusted." : "",
          ov && ov.noEntryToday ? "Nothing has been recorded at the bench today." : "",
          ov ? `This month: ${formatTaka(ov.kpis.producedMonthPaisa)} built, ${formatTaka(ov.kpis.wastedMonthPaisa)} wasted, over ${count(ov.kpis.runsMonth)} run${ov.kpis.runsMonth === 1 ? "" : "s"}.` : "",
        ].filter(Boolean).join(" ") || undefined}
      />

      <div className="mt-[18px]">
        <RangeBar range={range} onPick={setRange}
          right={<Link href="/assembly/pipeline" className="underline font-semibold" style={{ color: "var(--t-accent)" }}>the bench →</Link>} />
      </div>

      <KpiRow>
        <Kpi
          icon={<Icon name="tools" size={18} />} iconBg="var(--s-accent)" iconColor="var(--t-accent)"
          label="Runs" value={runSt === "ok" ? count(cut.runs) : "—"}
          scope={<Scope text="started in this period" />}
          delta={<Delta now={runSt === "ok" ? cut.runs : null} before={cmp(before.runs)} />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {runSt === "ok"
              ? cut.runs === 0 ? "nothing was built in this period"
                : `${count(cut.byTemplate.length)} recipe${cut.byTemplate.length === 1 ? "" : "s"}${cut.cancelled > 0 ? ` · ${count(cut.cancelled)} cancelled and left out` : ""}`
              : runSt === "error" ? "the run list did not answer" : "reading the run list…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="box" size={18} />} iconBg="var(--s-ok)" iconColor="var(--t-ok)"
          label="Materials used" value={runSt === "ok" ? formatTaka(cut.usedPaisa) : "—"}
          scope={<Scope text="runs started in this period" />}
          delta={<Delta now={runSt === "ok" ? cut.usedPaisa : null} before={cmp(before.usedPaisa)} />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {runSt === "ok"
              ? cut.runs > 0 ? `${formatTaka(Math.round(cut.usedPaisa / cut.runs))} a run on average`
                : "nothing was built in this period"
              : runSt === "error" ? "the run list did not answer" : "reading the run list…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="bolt" size={18} />}
          iconBg={anyWaste ? "var(--s-bad)" : "var(--s-ok)"}
          iconColor={anyWaste ? "var(--t-bad)" : "var(--t-ok)"}
          label="Wasted at the bench" value={runSt === "ok" ? formatTaka(cut.wastedPaisa) : "—"}
          negative={anyWaste}
          scope={<Scope text="runs started in this period" />}
          delta={<Delta now={runSt === "ok" ? cut.wastedPaisa : null} before={cmp(before.wastedPaisa)} invert />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {runSt === "ok"
              ? cut.usedPaisa + cut.wastedPaisa > 0
                ? `${Math.round((cut.wastedPaisa / (cut.usedPaisa + cut.wastedPaisa)) * 100)}% of what was used up`
                : "nothing was used up at the bench in this period"
              : runSt === "error" ? "the run list did not answer" : "reading the run list…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="clock" size={18} />} iconBg="var(--s-info)" iconColor="var(--t-info)"
          label="Time on a run" value={runSt === "ok" && cut.timed > 0
            ? hoursMins(Math.round(cut.minutes / cut.timed)) : "—"}
          scope={<Scope text="of those timed" />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {runSt === "ok"
              ? cut.timed > 0
                ? `measured on ${count(cut.timed)} of ${count(cut.runs)} run${cut.runs === 1 ? "" : "s"}`
                : cut.runs > 0 ? "no run in this period recorded how long it took" : "nothing was built in this period"
              : runSt === "error" ? "the run list did not answer" : "reading the run list…"}
          </div>
        </Kpi>
      </KpiRow>

      <div className="mb-[18px]">
        <ChartCard<Tab>
          title="The bench, day by day"
          tab={tab} onTab={setTab}
          tabs={[
            { v: "runs", label: "Runs" },
            { v: "used", label: "Materials used" },
            { v: "wasted", label: "Wasted" },
          ]}
          big={runSt === "ok" ? chart[tab].big : "—"}
          scope={<Scope text={chart[tab].scope} />}
          empty={runSt === "loading" ? "Reading the run list…"
            : runSt === "error" ? "The run list did not answer, so nothing can be drawn."
              : cut.runs === 0 ? "Nothing was built in this period." : undefined}
        >
          {chart[tab].node}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-[18px] mb-[18px]">
        <Card title="What was built" right={<Scope text="this period" />}>
          {cut.byTemplate.length > 0 ? (
            <Table head={[{ label: "Recipe" }, { label: "Built into" }, { label: "Runs", right: true }, { label: "Made", right: true }, { label: "Materials", right: true }]} min={640}>
              {cut.byTemplate.slice(0, 8).map((t) => (
                <tr key={t.key}>
                  <Td bold>{t.name}</Td>
                  <Td color="var(--t-faint)">{t.made ?? "not moved to an item yet"}</Td>
                  <Td right>{count(t.runs)}</Td>
                  <Td right>{`${fmtQty(t.pieces)} ${t.unit ?? ""}`.trim()}</Td>
                  <Td right>{formatTaka(t.usedPaisa)}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <div className="mt-4">
              <Empty state={runSt} empty="Nothing was built in this period."
                error="The run list did not answer." />
            </div>
          )}
          <Rule />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Recipe and item pairs" value={runSt === "ok" ? count(cut.byTemplate.length) : "—"}
              sub={ov ? `of ${count(ov.kpis.templateCount)} set up` : undefined} href="/assembly/templates" />
            <Stat label="Busiest recipe"
              value={cut.byTemplate.length > 0 ? cut.byTemplate[0].name : "—"}
              sub={cut.byTemplate.length > 0
                ? `${count(cut.byTemplate[0].runs)} run${cut.byTemplate[0].runs === 1 ? "" : "s"}` : undefined} />
          </div>
          <div className="text-[11.5px] mt-4 leading-[1.5]" style={{ color: "var(--t-faint)" }}>
            What was made is counted in the unit of the item it was built into, so each row is its own recipe-and-item
            pair and the column is never added into one number.
          </div>
        </Card>

        <Card title="Who built them" right={<Scope text="this period" />}>
          <div className="mt-[18px]">
            {cut.byActor.length > 0 ? cut.byActor.slice(0, 8).map((a) => (
              <TrackRow key={a.who} label={a.who} value={`${count(a.runs)} run${a.runs === 1 ? "" : "s"}`}
                width={(a.runs / actorMax) * 100} color="var(--f-chart)"
                right={<span className="text-[10.5px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                  {a.timed > 0 ? `${hoursMins(Math.round(a.minutes / a.timed))} a run` : "not timed"}
                </span>} />
            )) : (
              <Empty state={runSt} empty="Nobody built anything in this period."
                error="The run list did not answer." />
            )}
          </div>
          <Rule />
          <SubHead>What each one wasted</SubHead>
          <div className="mt-3.5">
            {cut.byActor.some((a) => a.wastedPaisa > 0) ? cut.byActor
              .filter((a) => a.wastedPaisa > 0)
              .sort((x, y) => y.wastedPaisa - x.wastedPaisa)
              .slice(0, 5)
              .map((a) => (
                <TrackRow key={a.who} label={a.who} value={formatTaka(a.wastedPaisa)}
                  width={(a.wastedPaisa / actorWasteMax) * 100}
                  color="var(--t-bad)"
                  right={<span className="text-[10.5px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                    {a.usedPaisa + a.wastedPaisa > 0
                      ? `${Math.round((a.wastedPaisa / (a.usedPaisa + a.wastedPaisa)) * 100)}% of what they used up`
                      : ""}
                  </span>} />
              )) : (
              <Empty state={runSt}
                empty={cut.runs > 0 ? "Nobody wasted anything in this period." : "Nothing was built in this period."}
                error="The run list did not answer." />
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-[18px]">
        <Card title="Built, but not on the shelves yet" right={<Scope text="now" tone="now" />}>
          {awaiting.length > 0 ? (
            <Table head={[{ label: "Run" }, { label: "Recipe" }, { label: "Built" }, { label: "Made", right: true }, { label: "Worth", right: true }]} min={620}>
              {awaiting.slice(0, 8).map((p) => (
                <tr key={p.id}>
                  <Td bold><Link href="/assembly/finished" className="hover:underline">{p.productionNo}</Link></Td>
                  <Td>{p.templateName || p.template?.name || "—"}</Td>
                  <Td color="var(--t-faint)">{p.finishedAt ? dayLabel(bdDayOf(p.finishedAt)) : "—"}</Td>
                  <Td right>{`${fmtQty(p.finishedQtyMilli)} ${p.targetItem?.unit?.shortCode ?? ""}`.trim()}</Td>
                  <Td right bold>{formatTaka(p.totalUsedValuePaisa)}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <div className="mt-4">
              <Empty state={ovSt} empty="Everything built has reached the stock board."
                error="The assembly board did not answer." />
            </div>
          )}
          {awaiting.length > 8 || (ov && ov.kpis.awaitingTransferCount > awaiting.length) ? (
            <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
              {`Showing ${count(Math.min(8, awaiting.length))} of ${count(ov?.kpis.awaitingTransferCount ?? awaiting.length)}.`}{" "}
              <Link href="/assembly/finished" className="underline font-semibold" style={{ color: "var(--t-accent)" }}>see them all</Link>
            </div>
          ) : null}
          {ov && ov.kpis.awaitingTransferCount > 0 ? (
            <div className="mt-4">
              <Chip tone="bad">
                {`${formatTaka(ov.kpis.awaitingTransferValuePaisa)} is built and counted nowhere until it is moved to stock`}
              </Chip>
            </div>
          ) : null}
          {running.length > 0 ? (
            <>
              <Rule />
              <SubHead>On the bench now</SubHead>
              <div className="mt-3 flex flex-wrap gap-2.5">
                {running.slice(0, 6).map((p) => (
                  <Chip key={p.id} tone="warn">
                    {`${p.templateName || "run"} · ${p.actor || p.assignedTo || "nobody named"}`}
                  </Chip>
                ))}
              </div>
            </>
          ) : null}
        </Card>

        <Card title="What gets wasted"
          right={<Scope text={waste ? `last ${count(waste.days)} days` : "last 30 days"} />}>
          <div className="mt-[18px]">
            {(waste?.byComponent ?? []).length > 0 ? waste!.byComponent.slice(0, 8).map((c) => (
              <TrackRow key={c.componentItemId} label={c.name} value={formatTaka(c.valuePaisa)}
                width={(c.valuePaisa / wasteMax) * 100} color="var(--t-bad)"
                right={<span className="text-[10.5px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                  {`${fmtQty(c.qtyMilli)} ${c.unitShort}`}
                </span>} />
            )) : (
              <Empty state={wasteSt} empty="Nothing has been wasted at the bench in the last 30 days."
                error="The wastage report did not answer." />
            )}
          </div>
          <Rule />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Wasted, from the wastage report" value={waste ? formatTaka(waste.totalWastedPaisa) : "—"}
              tone={waste && waste.totalWastedPaisa > 0 ? "bad" : undefined}
              sub={waste ? `over its own ${count(waste.days)} days` : undefined} />
            <Stat label="Different things wasted"
              value={waste ? count(waste.byComponent.length) : "—"} href="/assembly/wastage"
              sub={waste && waste.byComponent.length > 8 ? "the 8 biggest are listed above" : undefined} />
          </div>
          <div className="text-[11.5px] mt-4 leading-[1.5]" style={{ color: "var(--t-faint)" }}>
            This card can only be asked for a number of days, so it keeps its own window and does not follow the
            period switch. It is the wastage report&apos;s own total, counted over every document it holds, so it will
            not match the bench figure above whenever a run was cancelled or straddles the edge of a period.
          </div>
        </Card>
      </div>

      <SourceNote>
        The band is the assembly board as it stands, with its own three windows marked — now, today and this month.
        The period figures are the runs <b>started</b> between {dayLabel(range.from)} and {dayLabel(range.to)}, read
        from the run list, with cancelled runs counted and left out of every money figure. <b>What was made</b> is
        counted in each recipe&apos;s own unit and is never added into one number, because bouquets and metres of
        ribbon are not the same thing. A run being <b>finished</b> means it was built; the goods only reach the stock
        board once the run is moved, which is why what is built and not moved sits on its own card. The run list comes
        back whole, so a comparison with the period before is against that same list — an earlier period with no runs
        in it means nothing was built then. The wastage card takes only a day count, so it keeps its own window.
      </SourceNote>
    </div>
  );
}
