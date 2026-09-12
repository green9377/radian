"use client";

/*  SUPPLIERS OVERVIEW — who the shop buys from, who it owes, and who has gone
    quiet.

    Built on OverviewKit (12 Sep 2026), the same pattern as the other overview
    screens.

    TWO BOOKS, ONE TABLE (DEC-SUP-009/010). This module holds the PRODUCT
    suppliers and the fulfilment VENDORS in one table with two faces. A party
    can be both, and one that is stands in BOTH books - so the two counts must
    never be added together, and this screen says so instead of printing a
    total that double-counts.

    EVERY BALANCE IS A NOW FIGURE. `duePaisa`, `creditPaisa` and
    `totalBoughtPaisa` are running balances the server derives (DEC-SUP-008);
    they are true at this moment and carry the `now` mark.

    THE PERIOD COMES FROM THE PURCHASE BOOK, AND IT IS MATCHED BY NAME. A
    purchase row carries `supplierName` as text, not a supplier id, so "bought
    from in this period" is grouped by that name. `unlinkedNameCount` is the
    server's own count of purchase names with no supplier record behind them;
    when it is not zero the screen says so, because those rows cannot be
    matched to a supplier at all.  */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import {
  ApiPurchase, ApiSupplier, SupplierStats, formatTaka, getSupplierStats, listPurchases,
  listSuppliers,
} from "../_data/api";
import {
  BD_OFFSET_MS, Card, Chip, Delta, Empty, Kpi, KpiRow, NowBand, RangeBar, Rule, Scope,
  SourceNote, Stat, SubHead, Table, Td, TrackRow, bdDay, count, dayLabel,
  presetRange, previousRange, useLoadState, type NowJob, type Range,
} from "./OverviewKit";

function bdDayOf(iso: string): string {
  return new Date(new Date(iso).getTime() + BD_OFFSET_MS).toISOString().slice(0, 10);
}

/** a supplier is quiet when nothing has been bought from them in this long */
const QUIET_DAYS = 60;

/**
 * ONE SUPPLIER, ONE LABEL.
 *
 * The balance cards were labelling a supplier by nickname while the purchase
 * cards label it by the name written on the purchase, so "Bhai" was owed money
 * and "Ajgor" was bought from - the same shop, reading as two. The record's own
 * name leads, with the nickname after it when there is one.
 */
const label = (s: { name: string; nickname: string | null }) =>
  s.nickname && s.nickname !== s.name ? `${s.name} (${s.nickname})` : s.name;

export function SuppliersOverviewView() {
  const [range, setRange] = useState<Range>(presetRange("d30"));
  const [rows, setRows] = useState<ApiSupplier[] | null>(null);
  const [stats, setStats] = useState<SupplierStats | null>(null);
  const [purchases, setPurchases] = useState<ApiPurchase[] | null>(null);
  const { settle, begin, at } = useLoadState();

  useEffect(() => {
    let alive = true;
    begin("rows", "stats", "purchases");
    void (async () => {
      const r = await Promise.allSettled([listSuppliers(), getSupplierStats(), listPurchases()]);
      if (!alive) return;
      setRows(r[0].status === "fulfilled" ? r[0].value : null);
      setStats(r[1].status === "fulfilled" ? r[1].value : null);
      setPurchases(r[2].status === "fulfilled" ? r[2].value : null);
      settle({ rows: r[0], stats: r[1], purchases: r[2] });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowsSt = at("rows"), statsSt = at("stats"), purSt = at("purchases");

  /* ── the book as it stands ─────────────────────────────────────────────── */
  const b = useMemo(() => {
    const all = rows ?? [];
    const owed = all.filter((s) => s.duePaisa > 0).sort((x, y) => y.duePaisa - x.duePaisa);
    const credit = all.filter((s) => s.creditPaisa > 0).sort((x, y) => y.creditPaisa - x.creditPaisa);
    const edge = bdDay(QUIET_DAYS - 1);
    return {
      all, owed, credit,
      dual: all.filter((s) => s.dualRole),
      inactive: all.filter((s) => s.status !== "ACTIVE"),
      neverBought: all.filter((s) => s.purchaseCount === 0),
      quiet: all
        .filter((s) => s.purchaseCount > 0 && s.lastPurchaseAt && bdDayOf(s.lastPurchaseAt) < edge)
        .sort((x, y) => Date.parse(x.lastPurchaseAt!) - Date.parse(y.lastPurchaseAt!)),
      topBought: all.slice().filter((s) => s.totalBoughtPaisa > 0)
        .sort((x, y) => y.totalBoughtPaisa - x.totalBoughtPaisa).slice(0, 8),
    };
  }, [rows]);

  /*  THE TWO BOOKS COME FROM `stats.board`, NOT FROM THE LIST ROWS.
      `ApiSupplier.type` is optional and nullable, so `!s.type?.isFulfillment`
      is true for a row whose type was simply not sent - which quietly filed
      every fulfilment vendor into the supplier book. Every board row carries
      `isFulfillment` as a required field.
      DEC-SUP-010: a dual-role party belongs in BOTH, so the two counts overlap
      and must never be added together.  */
  const books = useMemo(() => {
    const board = stats?.board ?? [];
    return {
      suppliers: board.filter((x) => !x.isFulfillment || x.dualRole).length,
      vendors: board.filter((x) => x.isFulfillment || x.dualRole).length,
      dual: board.filter((x) => x.dualRole).length,
      inactive: board.filter((x) => x.status !== "ACTIVE").length,
    };
  }, [stats]);

  const owedMax = Math.max(1, ...b.owed.map((s) => s.duePaisa));
  const boughtMax = Math.max(1, ...b.topBought.map((s) => s.totalBoughtPaisa));

  /* ── the period, off the purchase book, matched by name ───────────────── */
  function cutPurchases(from: string, to: string) {
    const byName = new Map<string, { name: string; paisa: number; n: number }>();
    let paisa = 0, n = 0, unnamedPaisa = 0, unnamed = 0;
    for (const p of purchases ?? []) {
      const d = bdDayOf(p.purchaseDate);
      if (d < from || d > to) continue;
      if (p.status === "CANCELLED") continue;
      n++; paisa += p.grandTotalPaisa;
      /*  a purchase with no supplier written on it is counted on its own. In
          the name list it became a row called "no supplier named" and pushed
          the supplier COUNT up by one, which is a supplier that does not
          exist.  */
      if (!p.supplierName) { unnamed++; unnamedPaisa += p.grandTotalPaisa; continue; }
      const g = byName.get(p.supplierName) ?? { name: p.supplierName, paisa: 0, n: 0 };
      g.paisa += p.grandTotalPaisa; g.n++; byName.set(p.supplierName, g);
    }
    return {
      paisa, n, unnamed, unnamedPaisa,
      rows: [...byName.values()].sort((x, y) => y.paisa - x.paisa),
    };
  }

  const prev = previousRange(range);
  const cut = useMemo(() => cutPurchases(range.from, range.to), [purchases, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const before = useMemo(() => cutPurchases(prev.from, prev.to), [purchases, prev.from, prev.to]); // eslint-disable-line react-hooks/exhaustive-deps
  /*  the purchase book comes back whole, so an earlier period with nothing in
      it means nothing was bought then - not that the read fell short  */
  const cmp = (v: number) => (purSt === "ok" ? v : undefined);
  const periodMax = Math.max(1, ...cut.rows.map((r) => r.paisa));

  const jobs: NowJob[] = [
    ...(statsSt === "ok" && stats ? [
      { key: "owed", label: "Suppliers waiting for money", count: stats.dueCount, href: "/suppliers/list", tone: "warn" as const },
      { key: "unlinked", label: "Purchase names with no supplier", count: stats.unlinkedNameCount, href: "/purchases/list", tone: "warn" as const },
    ] : []),
    ...(rowsSt === "ok" ? [
      { key: "quiet", label: `Nothing bought in ${QUIET_DAYS} days`, count: b.quiet.length, href: "/suppliers/list", tone: "info" as const },
    ] : []),
  ];

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Stock"
        title="Suppliers"
        desc="Who the shop buys from, who is waiting for money, and who has not been used in a while."
      />

      <NowBand
        title="The supplier book right now"
        figures={[
          { label: "Suppliers on the book", value: stats ? count(stats.supplierCount) : "—", quiet: !stats,
            sub: rows ? `${count(b.all.filter((s) => s.status === "ACTIVE").length)} active` : undefined },
          { label: "Owed to them", value: stats ? formatTaka(stats.totalDuePaisa) : "—",
            quiet: !stats || stats.totalDuePaisa === 0,
            sub: stats ? `${count(stats.dueCount)} waiting` : undefined },
          { label: "Credit the shop holds", value: stats ? formatTaka(stats.totalCreditPaisa) : "—",
            quiet: !stats || stats.totalCreditPaisa === 0, sub: stats ? "paid ahead, owed back in goods" : undefined },
          { label: "Never bought from", value: rows ? count(b.neverBought.length) : "—",
            quiet: !rows || b.neverBought.length === 0 },
        ]}
        jobs={jobs}
        loading={statsSt === "loading" || rowsSt === "loading"}
        failed={statsSt === "error" && rowsSt === "error"}
        note={[
          statsSt === "error" ? "The supplier summary did not answer, so the counts and balances on this line are not shown." : "",
          rowsSt === "error" ? "The supplier list did not answer, so the quiet check is missing from this strip." : "",
          stats && stats.unlinkedNameCount > 0
            ? `${count(stats.unlinkedNameCount)} supplier name${stats.unlinkedNameCount === 1 ? "" : "s"} on purchases have no supplier record, so those purchases are in no supplier's figures.`
            : "",
          statsSt === "ok" ? "Every balance here is true at this moment and does not follow the period switch." : "",
        ].filter(Boolean).join(" ") || undefined}
      />

      <div className="mt-[18px]">
        <RangeBar range={range} onPick={setRange}
          right={<Link href="/purchases" className="underline font-semibold" style={{ color: "var(--t-accent)" }}>the purchases →</Link>} />
      </div>

      <KpiRow>
        <Kpi
          icon={<Icon name="cart" size={18} />} iconBg="var(--s-accent)" iconColor="var(--t-accent)"
          label="Bought from them" value={purSt === "ok" ? formatTaka(cut.paisa) : "—"}
          scope={<Scope text="booked in this period" />}
          delta={<Delta now={purSt === "ok" ? cut.paisa : null} before={cmp(before.paisa)} />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {purSt === "ok"
              ? cut.n === 0 ? "nothing was bought in this period"
                : `${count(cut.n)} purchase${cut.n === 1 ? "" : "s"} from ${count(cut.rows.length)} name${cut.rows.length === 1 ? "" : "s"}${cut.unnamed > 0 ? ` · ${count(cut.unnamed)} with no supplier written on them` : ""}`
              : purSt === "error" ? "the purchase book did not answer" : "reading the purchase book…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="users" size={18} />} iconBg="var(--s-info)" iconColor="var(--t-info)"
          label="Supplier names used" value={purSt === "ok" ? count(cut.rows.length) : "—"}
          scope={<Scope text="on this period's purchases" />}
          delta={<Delta now={purSt === "ok" ? cut.rows.length : null} before={cmp(before.rows.length)} />}
        >
          {/*  NOT compared against the number of supplier records: a purchase
               carries the supplier as text, so a name with no record behind it
               counts here and not there, and the figure could exceed it.  */}
          <div className="text-[11.5px] mt-3.5 leading-[1.5]" style={{ color: "var(--t-faint)" }}>
            {purSt === "ok"
              ? "distinct names written on the purchases, not supplier records"
              : purSt === "error" ? "the purchase book did not answer" : "reading the purchase book…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="alert" size={18} />}
          iconBg={stats && stats.totalDuePaisa > 0 ? "var(--s-warn)" : "var(--s-ok)"}
          iconColor={stats && stats.totalDuePaisa > 0 ? "var(--t-warn)" : "var(--t-ok)"}
          label="Owed to suppliers" value={stats ? formatTaka(stats.totalDuePaisa) : "—"}
          scope={<Scope text="now" tone="now" />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {stats
              ? stats.totalDuePaisa === 0 ? "nobody is waiting for money"
                : `${count(stats.dueCount)} supplier${stats.dueCount === 1 ? "" : "s"} waiting, whenever the bill was raised`
              : statsSt === "error" ? "the supplier book did not answer" : "reading the supplier book…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="clock" size={18} />}
          iconBg={rowsSt === "ok" && b.quiet.length > 0 ? "var(--s-warn)" : "var(--s-ok)"}
          iconColor={rowsSt === "ok" && b.quiet.length > 0 ? "var(--t-warn)" : "var(--t-ok)"}
          label="Gone quiet" value={rows ? count(b.quiet.length) : "—"}
          scope={<Scope text={`nothing in ${QUIET_DAYS} days`} tone="now" />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {rows
              ? b.quiet.length > 0
                ? "the shop has bought from them before, but not lately"
                : `every supplier used before has been used in the last ${QUIET_DAYS} days`
              : rowsSt === "error" ? "the supplier book did not answer" : "reading the supplier book…"}
          </div>
        </Kpi>
      </KpiRow>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-[18px] mb-[18px]">
        <Card title="Who was bought from" right={<Scope text="this period" />}>
          <div className="mt-[18px]">
            {cut.rows.length > 0 ? cut.rows.slice(0, 8).map((r) => (
              <TrackRow key={r.name} label={r.name} value={formatTaka(r.paisa)}
                width={(r.paisa / periodMax) * 100} color="var(--f-chart)"
                right={<span className="text-[10.5px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                  {`${count(r.n)} purchase${r.n === 1 ? "" : "s"}`}
                </span>} />
            )) : (
              <Empty state={purSt} empty="Nothing was bought in this period."
                error="The purchase book did not answer." />
            )}
          </div>
          <Rule />
          <SubHead>Bought from, all time</SubHead>
          <div className="mt-3.5">
            {b.topBought.length > 0 ? b.topBought.slice(0, 5).map((s) => (
              <Link key={s.id} href={`/suppliers/${s.id}`} className="block">
                <TrackRow label={label(s)} value={formatTaka(s.totalBoughtPaisa)}
                  width={(s.totalBoughtPaisa / boughtMax) * 100} color="var(--t-orchid)"
                  right={<span className="text-[10.5px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                    {`${count(s.purchaseCount)} purchase${s.purchaseCount === 1 ? "" : "s"}`}
                  </span>} />
              </Link>
            )) : (
              <Empty state={rowsSt} empty="Nothing has been bought from anyone yet."
                error="The supplier book did not answer." />
            )}
          </div>
        </Card>

        <Card title="Who is waiting for money" right={<Scope text="now" tone="now" />}>
          <div className="mt-[18px]">
            {b.owed.length > 0 ? b.owed.slice(0, 8).map((s) => (
              <Link key={s.id} href={`/suppliers/${s.id}`} className="block">
                <TrackRow label={label(s)} value={formatTaka(s.duePaisa)}
                  width={(s.duePaisa / owedMax) * 100} color="var(--t-warn)"
                  right={s.creditPaisa > 0
                    ? <span className="text-[10.5px] tabular-nums" style={{ color: "var(--t-ok)" }}>
                      {`${formatTaka(s.creditPaisa)} credit`}
                    </span>
                    : undefined} />
              </Link>
            )) : (
              <Empty state={rowsSt} empty="Nobody is waiting for money."
                error="The supplier book did not answer." />
            )}
          </div>
          <Rule />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Owed altogether" value={stats ? formatTaka(stats.totalDuePaisa) : "—"}
              tone={stats && stats.totalDuePaisa > 0 ? "warn" : undefined} />
            <Stat label="Credit the shop holds" value={stats ? formatTaka(stats.totalCreditPaisa) : "—"}
              sub={b.credit.length > 0 ? `with ${count(b.credit.length)} of them` : undefined} />
          </div>
          {b.owed.some((s) => s.creditPaisa > 0) ? (
            <div className="mt-4">
              <Chip tone="warn">
                a supplier is owed money and holding credit at the same time — net it off before paying
              </Chip>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.1fr] gap-[18px]">
        <Card title="The two books" right={<Scope text="now" tone="now" />}>
          <div className="mt-[18px] grid grid-cols-2 gap-4">
            <Stat label="Product suppliers" value={stats ? count(books.suppliers) : "—"}
              sub="the shop buys goods from them" href="/suppliers/list" />
            <Stat label="Fulfilment vendors" value={stats ? count(books.vendors) : "—"}
              sub="they deliver on the shop's behalf" href="/suppliers/vendors" />
          </div>
          <Rule />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="In both books" value={stats ? count(books.dual) : "—"}
              sub={stats && books.dual > 0
                ? "counted in both columns above, so never add the two up"
                : "nobody is both"} />
            <Stat label="Switched off" value={stats ? count(books.inactive) : "—"}
              sub="kept on the book, not in use" />
          </div>
          {statsSt === "error" ? (
            <p className="text-[12px] m-0 mt-4" style={{ color: "var(--t-faint)" }}>
              The supplier summary did not answer, so the two books cannot be counted.
            </p>
          ) : null}
        </Card>

        <Card title={`Not used in ${QUIET_DAYS} days`} right={<Scope text="now" tone="now" />}>
          {b.quiet.length > 0 ? (
            <Table head={[{ label: "Supplier" }, { label: "Last bought" }, { label: "Purchases", right: true }, { label: "Bought", right: true }, { label: "Owed", right: true }]} min={620}>
              {b.quiet.slice(0, 8).map((s) => (
                <tr key={s.id}>
                  <Td bold><Link href={`/suppliers/${s.id}`} className="hover:underline">{label(s)}</Link></Td>
                  <Td>{s.lastPurchaseAt ? dayLabel(bdDayOf(s.lastPurchaseAt)) : "—"}</Td>
                  <Td right>{count(s.purchaseCount)}</Td>
                  <Td right>{formatTaka(s.totalBoughtPaisa)}</Td>
                  <Td right bold color={s.duePaisa > 0 ? "var(--t-warn)" : undefined}>
                    {s.duePaisa > 0 ? formatTaka(s.duePaisa) : "—"}
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <div className="mt-4">
              <Empty state={rowsSt}
                empty={`Every supplier the shop has used has been used in the last ${QUIET_DAYS} days.`}
                error="The supplier book did not answer." />
            </div>
          )}
          {rows && b.neverBought.length > 0 ? (
            <div className="mt-4">
              <Chip tone="mute">
                {`${count(b.neverBought.length)} more ${b.neverBought.length === 1 ? "supplier has" : "suppliers have"} never been bought from at all`}
              </Chip>
            </div>
          ) : null}
        </Card>
      </div>

      <SourceNote>
        Every balance marked <b>now</b> — what is owed, what credit the shop holds, what has been bought all time — is
        a running total the books derive, true at this moment, and does not follow the period switch. The period
        figures come from the <b>purchase book</b>, counted over the purchases booked between {dayLabel(range.from)}{" "}
        and {dayLabel(range.to)}, with cancelled ones left out. A purchase records its supplier as a <b>name</b> rather
        than a link, so &ldquo;who was bought from&rdquo; is grouped by that name; any name with no supplier record
        behind it is counted on the band and belongs to no supplier&apos;s figures. A supplier is named here by the
        record&apos;s own name with its nickname after it, so the same shop reads the same way in every card even when
        the purchases were written up under the other one. A party that both supplies goods
        and delivers stands in both books, so the two counts overlap and must never be added together. The purchase
        book is read whole, so a comparison with the period before is against that same book — an earlier period with
        nothing in it means nothing was bought then.
      </SourceNote>
    </div>
  );
}
