"use client";

/*  INVENTORY OVERVIEW — what the stockroom holds, what moved, and what needs
    counting.

    Built on OverviewKit (12 Sep 2026), the same pattern as the Business,
    Accounts and Products screens.

    WHY THE PERIOD FIGURES ARE BUILT HERE. `/inventory/overview` answers with
    three fixed windows only (today, this month, now), so it cannot answer the
    dates a reader picks. `/inventory/movements` CAN: every movement carries
    its date, a signed quantity and a signed value. The whole year is 162 rows,
    so the screen reads it once and slices it for whatever period is chosen -
    the same trick the Accounts dashboard uses on the journal.

    SIGNS. `qtyMilli` and `valuePaisa` are both signed: a purchase is positive,
    a sale, a wastage and a gift are negative. "Came in" is the positives,
    "went out" is the size of the negatives - never the two added together and
    called movement.

    THE SAFE READERS ARE NOT USED. `loadInvOverviewSafe` answers a failed call
    with sample stock and a flag; on an overview that reads as a real stockroom.
    A failure here says it failed.  */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import {
  INV_REASON_META, InvMovement, InvOverview, InvStockRow, fmtQty, formatTaka,
  getInvOverview, listInvMovements, listInvStock,
} from "../_data/api";
import {
  AreaChart, BD_OFFSET_MS, BarChart, Card, ChartCard, Chip, DAY_MS, Delta, DivergeChart,
  Empty, Kpi, KpiRow, NowBand, RangeBar, Rule, Scope, SourceNote, Stat, SubHead, Table, Td,
  TrackRow, bdDay, count, dayLabel, daysBetween, presetRange, previousRange, useLoadState,
  type NowJob, type Point, type Range, type RangeKey,
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
/*  the live data carries reasons the shared label table does not know about
    (ASSEMBLY), and `META[unknown].label` is a crash, not a blank  */
function reasonLabel(r: string): string {
  const m = (INV_REASON_META as Record<string, { label: string } | undefined>)[r];
  return m?.label ?? r.replace(/_/g, " ").toLowerCase().replace(/^./, (ch) => ch.toUpperCase());
}

/*  A TRANSFER is ONE movement written twice: out of one warehouse, into
    another. An ASSEMBLY is the same shape - components out, the built thing in.
    Neither adds anything to the shop or takes anything away, so counting their
    two halves as "came in" and "went out" inflated both figures by the whole
    transferred value and doubled "everything that moved". They are counted, and
    shown, as their own thing.  */
const INTERNAL = new Set(["TRANSFER", "ASSEMBLY"]);

type Tab = "net" | "in" | "out" | "count";

interface Cut {
  inPaisa: number; outPaisa: number; wastagePaisa: number; giftPaisa: number;
  moves: number; internalMoves: number; internalPaisa: number;
  reasons: { reason: string; inPaisa: number; outPaisa: number; n: number; internal: boolean }[];
  perDayIn: Point[]; perDayOut: Point[]; perDayNet: Point[]; perDayCount: Point[];
}
const EMPTY_CUT: Cut = {
  inPaisa: 0, outPaisa: 0, wastagePaisa: 0, giftPaisa: 0,
  moves: 0, internalMoves: 0, internalPaisa: 0, reasons: [],
  perDayIn: [], perDayOut: [], perDayNet: [], perDayCount: [],
};

export function InventoryOverviewView() {
  const [range, setRange] = useState<Range>(presetRange("d30"));
  const [tab, setTab] = useState<Tab>("net");
  const [ov, setOv] = useState<InvOverview | null>(null);
  const [stock, setStock] = useState<InvStockRow[] | null>(null);
  const [moves, setMoves] = useState<InvMovement[] | null>(null);
  const { settle, begin, at } = useLoadState();

  useEffect(() => {
    let alive = true;
    begin("overview", "stock", "moves");
    void (async () => {
      const r = await Promise.allSettled([
        getInvOverview(),
        listInvStock(),
        listInvMovements({ days: 365 }),
      ]);
      if (!alive) return;
      setOv(r[0].status === "fulfilled" ? r[0].value : null);
      setStock(r[1].status === "fulfilled" ? r[1].value : null);
      setMoves(r[2].status === "fulfilled" ? r[2].value : null);
      settle({ overview: r[0], stock: r[1], moves: r[2] });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ovSt = at("overview"), stSt = at("stock"), mvSt = at("moves");

  const firstMoveDay = useMemo(() => {
    if (!moves || moves.length === 0) return null;
    let min = "9999-99-99";
    for (const m of moves) { const d = bdDayOf(m.createdAt); if (d < min) min = d; }
    return min === "9999-99-99" ? null : min;
  }, [moves]);

  function slice(from: string, to: string): Cut {
    if (!moves) return EMPTY_CUT;
    const byReason = new Map<string, { reason: string; inPaisa: number; outPaisa: number; n: number; internal: boolean }>();
    const dIn = new Map<string, number>(), dOut = new Map<string, number>(), dN = new Map<string, number>();
    let inP = 0, outP = 0, waste = 0, gift = 0, n = 0, iN = 0, iP = 0;
    for (const m of moves) {
      const d = bdDayOf(m.createdAt);
      if (d < from || d > to) continue;
      n++;
      dN.set(d, (dN.get(d) ?? 0) + 1);
      const v = m.valuePaisa;
      const internal = INTERNAL.has(m.reason);
      const g = byReason.get(m.reason) ?? { reason: m.reason, inPaisa: 0, outPaisa: 0, n: 0, internal };
      g.n++;
      if (v >= 0) g.inPaisa += v; else g.outPaisa += -v;
      byReason.set(m.reason, g);
      if (internal) { iN++; iP += Math.abs(v); continue; }
      if (v >= 0) { inP += v; dIn.set(d, (dIn.get(d) ?? 0) + v); }
      else { outP += -v; dOut.set(d, (dOut.get(d) ?? 0) - v); }
      if (m.reason === "WASTAGE") waste += Math.abs(v);
      if (m.reason === "GIFT") gift += Math.abs(v);
    }
    const days = everyDay(from, to);
    return {
      inPaisa: inP, outPaisa: outP, wastagePaisa: waste, giftPaisa: gift,
      moves: n, internalMoves: iN, internalPaisa: iP,
      reasons: [...byReason.values()].sort((a, b) => (b.inPaisa + b.outPaisa) - (a.inPaisa + a.outPaisa)),
      perDayIn: days.map((d) => ({ date: d, value: dIn.get(d) ?? 0 })),
      perDayOut: days.map((d) => ({ date: d, value: dOut.get(d) ?? 0 })),
      perDayNet: days.map((d) => ({ date: d, value: (dIn.get(d) ?? 0) - (dOut.get(d) ?? 0) })),
      perDayCount: days.map((d) => ({ date: d, value: dN.get(d) ?? 0 })),
    };
  }

  const prev = previousRange(range);
  const cut = useMemo(() => slice(range.from, range.to), [moves, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const before = useMemo(() => slice(prev.from, prev.to), [moves, prev.from, prev.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevCovered = firstMoveDay === null || firstMoveDay <= prev.from;
  const cmp = (v: number) => (mvSt !== "ok" ? undefined : prevCovered ? v : null);
  /*  the picker must not reach past the first movement, and a preset that would
      is not offered either - a heading naming June over figures that start in
      August is the lie rule 3 exists to stop  */
  const reach = firstMoveDay ? daysBetween(firstMoveDay, bdDay(0)) : 365;
  const presets: RangeKey[] = ["today", "yesterday", "d7", "d30", "d90", "custom"]
    .filter((k) => (k === "d7" ? reach >= 7 : k === "d30" ? reach >= 30 : k === "d90" ? reach >= 90 : true)) as RangeKey[];

  const reasonMax = Math.max(1, ...cut.reasons.map((r) => r.inPaisa + r.outPaisa));

  /* ── what the stockroom holds, now ─────────────────────────────────────── */
  const rows = stock ?? [];
  const negative = rows.filter((r) => r.isNegative);
  const low = rows.filter((r) => r.isLow && !r.isNegative);
  /*  DEC-INV-010: a made-to-order item holds no stock of its own, so its
      quantity and its value are not shelf stock and must not be ranked as such  */
  const onShelf = rows.filter((r) => r.assemblyMode !== "MAKE_TO_ORDER");
  const dearest = onShelf.slice().sort((a, b) => b.valuePaisa - a.valuePaisa).slice(0, 6);
  const dearMax = Math.max(1, ...dearest.map((r) => Math.abs(r.valuePaisa)));
  /** a row's own quantity, or what it could be built into when it keeps none */
  const heldBy = (r: InvStockRow) => r.assemblyMode === "MAKE_TO_ORDER"
    ? `can build ${count(r.canBuild ?? 0)}`
    : `${fmtQty(r.totalQtyMilli)} ${r.unitShort}`;
  const expiring = ov?.needsAttention.expiring ?? [];

  const jobs: NowJob[] = ov ? [
    { key: "neg", label: "Below zero — count it", count: ov.needsAttention.negativeCount, href: "/inventory/stock?filter=negative", tone: "danger" },
    { key: "low", label: "Running low", count: ov.needsAttention.lowCount, href: "/inventory/stock?filter=low", tone: "warn" },
    { key: "exp", label: "Expiring soon", count: expiring.length, href: "/inventory/stock", tone: "warn" },
  ] : [];

  const chart: Record<Tab, { big: string; scope: string; node: React.ReactNode }> = {
    net: {
      big: formatTaka(cut.inPaisa - cut.outPaisa), scope: "in minus out, at cost",
      node: <DivergeChart pts={cut.perDayNet} id="inv-net" fmt={formatTaka} noun="Stock in minus out, day by day"
        labels={{ up: "stock grew", down: "stock shrank", flat: "nothing moved" }} />,
    },
    in: {
      big: formatTaka(cut.inPaisa), scope: "value that came in",
      node: <AreaChart pts={cut.perDayIn} id="inv-in" fmt={formatTaka} noun="Stock in, day by day" />,
    },
    out: {
      big: formatTaka(cut.outPaisa), scope: "value that went out",
      node: <AreaChart pts={cut.perDayOut} id="inv-out" fmt={formatTaka} noun="Stock out, day by day" />,
    },
    count: {
      big: count(cut.moves), scope: "movements recorded",
      node: <BarChart pts={cut.perDayCount} id="inv-n" noun="Movements, day by day" unit="movements" />,
    },
  };

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Operations"
        title="Inventory"
        desc="What the stockroom holds, what moved in the days you choose, and what needs counting."
      />

      <NowBand
        title="The stockroom right now"
        figures={[
          { label: "Stock worth", value: ov ? formatTaka(ov.kpis.totalValuePaisa) : "—", quiet: !ov,
            sub: ov ? "at cost, averaged" : undefined },
          { label: "Items tracked", value: ov ? count(ov.kpis.itemCount) : "—", quiet: !ov },
          { label: "Below zero", value: ov ? count(ov.needsAttention.negativeCount) : "—",
            quiet: !ov || ov.needsAttention.negativeCount === 0, sub: ov && ov.needsAttention.negativeCount > 0 ? "count these first" : undefined },
          { label: "Moved today", value: ov ? count(ov.kpis.movementsToday) : "—", quiet: !ov || ov.kpis.movementsToday === 0 },
        ]}
        jobs={jobs}
        loading={ovSt === "loading"}
        failed={ovSt === "error"}
        note={ovSt === "error"
          ? "The stockroom did not answer, so nothing on this line can be trusted."
          : ov && (ov.kpis.wastageMonthPaisa > 0 || ov.kpis.giftMonthPaisa > 0)
            ? `This month: ${formatTaka(ov.kpis.wastageMonthPaisa)} wasted, ${formatTaka(ov.kpis.giftMonthPaisa)} given free.`
            : ovSt === "ok" ? "Nothing wasted or given away this month." : undefined}
      />

      <div className="mt-[18px]">
        <RangeBar range={range} onPick={setRange} only={presets}
          maxBack={firstMoveDay ? Math.min(364, Math.max(1, reach - 1)) : 364}
          right={<Link href="/inventory/movements" className="underline font-semibold" style={{ color: "var(--t-accent)" }}>every movement →</Link>} />
      </div>

      <KpiRow>
        <Kpi
          icon={<Icon name="download" size={18} />} iconBg="var(--s-ok)" iconColor="var(--t-ok)"
          label="Came in" value={mvSt === "ok" ? formatTaka(cut.inPaisa) : "—"}
          scope={<Scope text="at cost" />}
          delta={<Delta now={mvSt === "ok" ? cut.inPaisa : null} before={cmp(before.inPaisa)} />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {mvSt === "error" ? "the movement list did not answer"
              : mvSt === "loading" ? "reading the movements…"
                : "bought, returned by customers, adjusted up, opening stock"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="upload" size={18} />} iconBg="var(--s-accent)" iconColor="var(--t-accent)"
          label="Went out" value={mvSt === "ok" ? formatTaka(cut.outPaisa) : "—"}
          scope={<Scope text="at cost" />}
          delta={<Delta now={mvSt === "ok" ? cut.outPaisa : null} before={cmp(before.outPaisa)} />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {mvSt === "error" ? "the movement list did not answer"
              : mvSt === "loading" ? "reading the movements…"
                : "sold, wasted, given away, adjusted down, sent back"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="bolt" size={18} />}
          iconBg={cut.wastagePaisa > 0 ? "var(--s-bad)" : "var(--s-ok)"}
          iconColor={cut.wastagePaisa > 0 ? "var(--t-bad)" : "var(--t-ok)"}
          label="Lost to wastage" value={mvSt === "ok" ? formatTaka(cut.wastagePaisa) : "—"}
          negative={mvSt === "ok" && cut.wastagePaisa > 0}
          scope={<Scope text="this period" />}
          delta={<Delta now={mvSt === "ok" ? cut.wastagePaisa : null} before={cmp(before.wastagePaisa)} invert />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {mvSt !== "ok" ? "reading the movements…"
              : cut.giftPaisa > 0 ? `${formatTaka(cut.giftPaisa)} more was given away`
                : "nothing was given away in this period"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="layers" size={18} />} iconBg="var(--s-info)" iconColor="var(--t-info)"
          label="Movements" value={mvSt === "ok" ? count(cut.moves) : "—"}
          scope={<Scope text="this period" />}
          delta={<Delta now={mvSt === "ok" ? cut.moves : null} before={cmp(before.moves)} />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {mvSt !== "ok" ? "reading the movements…"
              : cut.reasons.length === 0 ? "nothing moved in this period"
                : cut.internalMoves > 0
                  ? `${count(cut.reasons.length)} kinds · ${count(cut.internalMoves)} were moves inside the shop`
                  : `${count(cut.reasons.length)} kinds of movement`}
          </div>
        </Kpi>
      </KpiRow>

      <div className="mb-[18px]">
        <ChartCard<Tab>
          title="Stock, day by day"
          tab={tab} onTab={setTab}
          tabs={[
            { v: "net", label: "In minus out" },
            { v: "in", label: "Came in" },
            { v: "out", label: "Went out" },
            { v: "count", label: "Movements" },
          ]}
          big={mvSt === "ok" ? chart[tab].big : "—"}
          scope={<Scope text={chart[tab].scope} />}
          empty={mvSt === "loading" ? "Reading the movements…"
            : mvSt === "error" ? "The movement list did not answer, so nothing can be drawn."
              : cut.moves === 0 ? "Nothing moved in this period." : undefined}
        >
          {chart[tab].node}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-[18px] mb-[18px]">
        <Card title="Why stock moved" right={<Scope text="this period" />}>
          <div className="mt-[18px]">
            {cut.reasons.length > 0 ? cut.reasons.map((r) => (
              <TrackRow key={r.reason}
                label={r.internal ? `${reasonLabel(r.reason)} — inside the shop` : reasonLabel(r.reason)}
                value={r.internal ? formatTaka(r.inPaisa + r.outPaisa)
                  : r.inPaisa >= r.outPaisa ? `+${formatTaka(r.inPaisa - r.outPaisa)}` : `-${formatTaka(r.outPaisa - r.inPaisa)}`}
                width={((r.inPaisa + r.outPaisa) / reasonMax) * 100}
                color={r.internal ? "var(--f-chart-dim)" : r.inPaisa >= r.outPaisa ? "var(--t-ok)" : "var(--t-warn)"}
                right={<span className="text-[10.5px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                  {`${count(r.n)} time${r.n === 1 ? "" : "s"}`}
                </span>} />
            )) : (
              <Empty state={mvSt} empty="Nothing moved in this period."
                error="The movement list did not answer." />
            )}
          </div>
          <Rule />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Stock grew by" value={mvSt === "ok" ? formatTaka(cut.inPaisa - cut.outPaisa) : "—"}
              tone={mvSt === "ok" && cut.inPaisa < cut.outPaisa ? "warn" : undefined}
              sub="what came in, less what went out" />
            <Stat label="Everything that moved" value={mvSt === "ok" ? formatTaka(cut.inPaisa + cut.outPaisa) : "—"}
              sub={mvSt === "ok" && cut.internalPaisa > 0
                ? `both directions together; ${formatTaka(cut.internalPaisa)} more only moved inside the shop`
                : "both directions added together"} />
          </div>
        </Card>

        <Card title="Needs counting" right={<Scope text="now" tone="now" />}>
          <div className="mt-[18px]">
            <SubHead>Below zero — the shop cannot hold less than nothing</SubHead>
            <div className="mt-3.5">
              {negative.length > 0 ? (
                <Table head={[{ label: "Item" }, { label: "On the books", right: true }, { label: "Worth", right: true }]} min={460}>
                  {negative.slice(0, 6).map((r) => (
                    <tr key={r.itemId}>
                      <Td>{r.name}</Td>
                      <Td right color="var(--t-bad)" bold>{heldBy(r)}</Td>
                      <Td right>{formatTaka(r.valuePaisa)}</Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty state={stSt} empty="Nothing is below zero." error="The stock board did not answer." />
              )}
            </div>
          </div>
          <Rule />
          <div>
            <SubHead>Running low</SubHead>
            <div className="mt-3.5">
              {low.length > 0 ? low.slice(0, 5).map((r) => (
                <TrackRow key={r.itemId} label={r.name}
                  value={heldBy(r)}
                  width={r.reorderLevel && r.reorderLevel > 0
                    ? Math.min(100, (r.totalQtyMilli / 1000 / r.reorderLevel) * 100) : 12}
                  color="var(--t-warn)"
                  right={r.reorderLevel ? <span className="text-[10.5px]" style={{ color: "var(--t-faint)" }}>{`reorder at ${r.reorderLevel}`}</span> : undefined} />
              )) : (
                <Empty state={stSt} empty="Nothing is running low." error="The stock board did not answer." />
              )}
            </div>
          </div>
          {expiring.length > 0 ? (
            <>
              <Rule />
              <div className="flex flex-wrap gap-2.5">
                <Chip tone="warn">{`${count(expiring.length)} lot${expiring.length === 1 ? "" : "s"} expiring soon`}</Chip>
                {expiring.slice(0, 3).map((e) => (
                  <Chip key={e.id} tone="mute">{`${e.item.name} · ${dayLabel(e.expiryDate.slice(0, 10))}`}</Chip>
                ))}
              </div>
            </>
          ) : null}
        </Card>
      </div>

      <Card title="What the shelves hold most of" right={<Scope text="now" tone="now" />}>
        <div className="mt-[18px]">
          {dearest.length > 0 ? dearest.map((r) => (
            <TrackRow key={r.itemId} label={r.name} value={formatTaka(r.valuePaisa)}
              width={(Math.abs(r.valuePaisa) / dearMax) * 100}
              color={r.valuePaisa < 0 ? "var(--t-bad)" : "var(--f-chart)"}
              right={<span className="text-[10.5px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                {heldBy(r)}
              </span>} />
          )) : (
            <Empty state={stSt} empty="The stockroom is empty." error="The stock board did not answer." />
          )}
        </div>
        <Rule />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Items on the board" value={stock ? count(rows.length) : "—"} href="/inventory/stock"
            sub={stock ? `${count(onShelf.length)} keep stock of their own` : undefined} />
          <Stat label="Below zero" value={stock ? count(negative.length) : "—"}
            tone={stock && negative.length > 0 ? "bad" : undefined} />
          <Stat label="Running low" value={stock ? count(low.length) : "—"}
            tone={stock && low.length > 0 ? "warn" : undefined} />
          <Stat label="Built to order" value={stock ? count(rows.filter((r) => r.assemblyMode === "MAKE_TO_ORDER").length) : "—"}
            sub="never counted as stock" />
        </div>
      </Card>

      <SourceNote>
        The figures marked <b>now</b> are the stock board as it stands and do not follow the period switch. The period
        figures are the stockroom&apos;s own movement list for{" "}
        {range.from === range.to ? dayLabel(range.from) : `${dayLabel(range.from)} to ${dayLabel(range.to)}`}, valued at
        cost: a purchase, a customer return, an upward adjustment and opening stock come in; a sale, a wastage, a gift,
        a downward adjustment and a supplier return go out. A transfer between warehouses and an assembly are written
        twice — out of one place, into another — so they are shown on their own and left out of came-in and went-out,
        because nothing entered or left the shop. Stock worth here is the averaged cost of what is on the shelves, which
        is not the same number as the Inventory account on the Accounts dashboard — where the two disagree, the
        books-vs-shop check is what settles it.
        {!prevCovered ? " The period before this one reaches further back than the movement list, so no comparison with it is shown." : ""}
      </SourceNote>
    </div>
  );
}
