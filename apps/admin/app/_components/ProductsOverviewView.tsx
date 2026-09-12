"use client";

/*  PRODUCTS OVERVIEW — what the website sells, what it earns, and what is broken.

    Built on OverviewKit (12 Sep 2026), same pattern as the Business and
    Accounts dashboards: a live band for what is true now, one period switch
    that belongs to the reader, headline figures that each say what they count,
    and cards that name a thing instead of explaining it.

    IT REPLACES a screen of eighteen coloured tiles whose colours were fixed in
    Day-skin classes, so half of them disappeared at Night.

    TWO POPULATIONS, KEPT APART AND BOTH MARKED.
      NOW  - the catalogue itself: how many products, how many drafts, what the
             shelves are worth. These do NOT follow the period switch.
      PERIOD - what customers ordered inside the chosen dates, from
             `/products/analytics`.

    WHAT THE PERIOD FIGURES COUNT, EXACTLY (read off the API, not guessed):
      orders   = orders in the window MINUS cancelled ones
      revenue  = line total minus line discount, on every order that is not
                 cancelled - so an order still on its way IS counted, and a
                 refund is NOT taken off here (it is its own figure)
      margin   = revenue - refunds - units x the product's cost
    The Accounts dashboard books income on DELIVERY instead, so the two screens
    answer different questions and are labelled so.

    THE COUNTER IS NOT HERE. A counter bill sells a stockroom Item, never a
    website Product, so `channel=counter` on this endpoint is always empty. The
    counter's own items are on /pos, and this screen says so rather than
    printing a zero that looks like a bad day.  */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import {
  ApiCatalogFunnel, ApiFunnelItem, ApiProduct, formatTaka, getCatalogFunnel, listProductsAll,
} from "../_data/api";
import {
  Card, Chip, Delta, Empty, Kpi, KpiRow, NowBand, RangeBar, Rule, Scope, Seg,
  SourceNote, Stat, SubHead, Table, Td, TrackRow, count, daysBetween, presetRange,
  previousRange, useLoadState, type NowJob, type Range,
} from "./OverviewKit";

const marginOf = (p: ApiProduct) => p.offerPricePaisa - p.costPaisa;
/*  null, not 0. A product with no selling price has no margin to speak of, and
    a printed "0%" sorted it to the top of the thin-margin list - above the
    products that really were thin.  */
const marginPctOf = (p: ApiProduct): number | null =>
  p.offerPricePaisa > 0 ? Math.round((marginOf(p) / p.offerPricePaisa) * 100) : null;

type SoldBy = "units" | "money";

export function ProductsOverviewView() {
  const [range, setRange] = useState<Range>(presetRange("d30"));
  const [soldBy, setSoldBy] = useState<SoldBy>("units");
  const [items, setItems] = useState<ApiProduct[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [complete, setComplete] = useState(true);
  const [now, setNow] = useState<ApiCatalogFunnel | null>(null);
  const [prevF, setPrevF] = useState<ApiCatalogFunnel | null>(null);
  const { settle, begin, at } = useLoadState();

  /*  the catalogue is read once - it has no period  */
  useEffect(() => {
    let alive = true;
    begin("catalog");
    void (async () => {
      const [r] = await Promise.allSettled([listProductsAll()]);
      if (!alive) return;
      setItems(r.status === "fulfilled" ? r.value.items : null);
      setTotal(r.status === "fulfilled" ? r.value.total : null);
      setComplete(r.status === "fulfilled" ? r.value.complete : true);
      settle({ catalog: r });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*  what sold follows the reader's dates, and the period before it for the
      comparison. Each call carries its own state: one failing must not make
      the other print a zero.  */
  useEffect(() => {
    let alive = true;
    begin("sold", "before");
    /*  clear FIRST. Keeping the old period's figures on screen while the new
        dates are already in the heading is the exact lie rule 3 exists to
        stop: a month's revenue printed under the word "today".  */
    setNow(null); setPrevF(null);
    const prev = previousRange(range);
    void (async () => {
      const r = await Promise.allSettled([
        getCatalogFunnel({ from: range.from, to: range.to }, "web"),
        getCatalogFunnel({ from: prev.from, to: prev.to }, "web"),
      ]);
      if (!alive) return;
      setNow(r[0].status === "fulfilled" ? r[0].value : null);
      setPrevF(r[1].status === "fulfilled" ? r[1].value : null);
      settle({ sold: r[0], before: r[1] });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  const catSt = at("catalog"), soldSt = at("sold"), beforeSt = at("before");

  /* ── the catalogue, right now ──────────────────────────────────────────── */
  const c = useMemo(() => {
    const all = items ?? [];
    const withCost = all.filter((p) => p.costPaisa > 0);
    /*  DEC-ADM-012: the server strips every cost from an account whose template
        does not say "See cost prices". Every cost reading zero on a catalogue
        that has products is that, not a shop that forgot to price its goods -
        so the screen stops talking about costs instead of blaming the data.  */
    const costsHidden = all.length >= 3 && withCost.length === 0;
    return {
      all, costsHidden,
      live: all.filter((p) => p.isPublished),
      drafts: all.filter((p) => !p.isPublished),
      oos: all.filter((p) => p.stockQty <= 0),
      low: all.filter((p) => p.stockQty > 0 && p.stockQty <= 5),
      loss: withCost.filter((p) => marginOf(p) < 0),
      noCost: all.length >= 3 && withCost.length === 0 ? [] : all.filter((p) => p.costPaisa <= 0),
      noPhoto: all.filter((p) => (p.images?.length ?? 0) === 0),
      /*  what the shelves would fetch at today's selling price - NOT what they
          cost, which is Inventory's figure  */
      shelfPaisa: all.reduce((t, p) => t + p.offerPricePaisa * Math.max(0, p.stockQty), 0),
      thin: withCost.slice().sort((a, b) => (marginPctOf(a) ?? -9999) - (marginPctOf(b) ?? -9999)).slice(0, 6),
      running: all.filter((p) => p.isPublished).slice().sort((a, b) => a.stockQty - b.stockQty).slice(0, 6),
    };
  }, [items]);

  /* ── what sold, inside the chosen dates ───────────────────────────────── */
  const t = now?.totals ?? null;
  const tb = prevF?.totals ?? null;
  const rows = now?.items ?? [];
  const sold = useMemo(() => {
    const byUnits = rows.filter((r) => r.units > 0).sort((a, b) => b.units - a.units);
    const byMoney = rows.filter((r) => r.revenuePaisa > 0).sort((a, b) => b.revenuePaisa - a.revenuePaisa);
    const cats = new Map<string, { name: string; units: number; paisa: number }>();
    for (const r of rows) {
      if (r.units <= 0 && r.revenuePaisa <= 0) continue;
      const key = r.categoryName ?? "Not in a category";
      const g = cats.get(key) ?? { name: key, units: 0, paisa: 0 };
      g.units += r.units; g.paisa += r.revenuePaisa; cats.set(key, g);
    }
    return {
      byUnits, byMoney,
      cats: [...cats.values()].sort((a, b) => b.paisa - a.paisa),
      nothingSold: rows.length > 0 && byUnits.length === 0 && byMoney.length === 0,
    };
  }, [rows]);

  const runMax = Math.max(1, ...c.running.map((p) => Math.max(0, p.stockQty)));
  const list = soldBy === "units" ? sold.byUnits : sold.byMoney;
  const listMax = Math.max(1, ...list.map((r) => (soldBy === "units" ? r.units : r.revenuePaisa)));
  const catMax = Math.max(1, ...sold.cats.map((g) => g.paisa));
  const catTotal = sold.cats.reduce((n, g) => n + g.paisa, 0);
  const shown = list.slice(0, 8);

  const jobs: NowJob[] = items ? [
    { key: "oos", label: "Live but out of stock", count: c.oos.filter((p) => p.isPublished).length, href: "/inventory/stock", tone: "danger" },
    { key: "loss", label: "Priced below cost", count: c.loss.length, href: "/products/list", tone: "danger" },
    { key: "draft", label: "Still a draft", count: c.drafts.length, href: "/products/list", tone: "warn" },
    { key: "nocost", label: "No cost price set", count: c.noCost.length, href: "/products/list", tone: "warn" },
    { key: "nophoto", label: "No photo", count: c.noPhoto.length, href: "/products/list", tone: "info" },
  ] : [];

  const rowLabel = (r: ApiFunnelItem) =>
    soldBy === "units" ? `${count(r.units)} sold` : formatTaka(r.revenuePaisa);

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Catalogue"
        title="Products"
        desc="What the website sells, what it earned in the days you choose, and what is waiting to be fixed."
      />

      <NowBand
        title="The catalogue right now"
        figures={[
          { label: "Live on the website", value: items ? count(c.live.length) : "—", quiet: !items,
            sub: items ? `of ${count(total ?? c.all.length)}` : undefined },
          { label: "Still drafts", value: items ? count(c.drafts.length) : "—", quiet: !items || c.drafts.length === 0 },
          { label: "Out of stock", value: items ? count(c.oos.length) : "—", quiet: !items || c.oos.length === 0,
            sub: items ? "drafts included" : undefined },
          { label: "Shelf worth", value: items ? formatTaka(c.shelfPaisa) : "—", quiet: !items,
            sub: items ? "at today's selling price" : undefined },
        ]}
        jobs={jobs}
        loading={catSt === "loading"}
        failed={catSt === "error"}
        note={[
          catSt === "error" ? "The catalogue did not answer, so nothing on this line can be trusted." : "",
          !complete ? "Only part of the catalogue could be read, so these counts are short." : "",
          c.costsHidden ? "Cost prices are not shown to this account, so no margin figure on this screen covers them." : "",
          items && c.all.length === 0 ? "There is no product in the catalogue yet." : "",
        ].filter(Boolean).join(" ") || undefined}
      />

      <RangeBar range={range} onPick={setRange}
        right={<Link href="/pos" className="underline font-semibold" style={{ color: "var(--t-accent)" }}>counter items →</Link>} />

      <KpiRow>
        <Kpi
          icon={<Icon name="cart" size={18} />} iconBg="var(--s-accent)" iconColor="var(--t-accent)"
          label="Ordered" value={t ? count(t.units) : "—"}
          scope={<Scope text="website only" />}
          delta={<Delta now={t ? t.units : null} before={beforeSt === "error" ? undefined : tb ? tb.units : null} />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {t ? `${count(t.orders)} orders kept · ${count(t.delivered)} delivered · ${count(t.cancelled)} more cancelled`
              : soldSt === "error" ? "the sales report did not answer" : "reading the sales report…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="cash" size={18} />} iconBg="var(--s-ok)" iconColor="var(--t-ok)"
          label="Order value" value={t ? formatTaka(t.revenuePaisa) : "—"}
          scope={<Scope text="ordered, not yet booked" />}
          delta={<Delta now={t ? t.revenuePaisa : null} before={beforeSt === "error" ? undefined : tb ? tb.revenuePaisa : null} />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {t ? "cancelled orders left out, refunds counted separately"
              : soldSt === "error" ? "the sales report did not answer" : "reading the sales report…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="chart" size={18} />}
          iconBg={t && t.marginPaisa < 0 ? "var(--s-bad)" : "var(--s-orchid)"}
          iconColor={t && t.marginPaisa < 0 ? "var(--t-bad)" : "var(--t-orchid)"}
          label="Kept after cost" value={t ? formatTaka(t.marginPaisa) : "—"}
          negative={!!t && t.marginPaisa < 0}
          scope={<Scope text="after goods and refunds" />}
          delta={<Delta now={t ? t.marginPaisa : null} before={beforeSt === "error" ? undefined : tb ? tb.marginPaisa : null} />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {t
              ? t.revenuePaisa > 0
                ? `${Math.round((t.marginPaisa / t.revenuePaisa) * 100)}% of the order value`
                : "nothing was ordered, so there is no share to take"
              : soldSt === "error" ? "the sales report did not answer" : "reading the sales report…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="upload" size={18} />} iconBg="var(--s-warn)" iconColor="var(--t-warn)"
          label="Refunded" value={t ? formatTaka(t.refundPaisa) : "—"}
          scope={<Scope text="this period" />}
          delta={<Delta now={t ? t.refundPaisa : null} before={beforeSt === "error" ? undefined : tb ? tb.refundPaisa : null} invert />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {t
              ? t.refundPaisa === 0 ? "nothing was sent back in this period"
                : t.cancelled > 0 ? `${count(t.cancelled)} more orders were cancelled outright`
                  : "no order was cancelled in this period"
              : soldSt === "error" ? "the sales report did not answer" : "reading the sales report…"}
          </div>
        </Kpi>
      </KpiRow>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_1fr] gap-[18px] mb-[18px]">
        <Card
          title="What sold most"
          right={
            <div className="flex items-center gap-2.5">
              <Seg<SoldBy> label="Ranked by" value={soldBy} onPick={setSoldBy}
                options={[{ v: "units", label: "By units" }, { v: "money", label: "By money" }]} />
              <Scope text="this period" />
            </div>
          }
        >
          <div className="mt-[18px]">
            {shown.length > 0 ? shown.map((r) => (
              <Link key={r.productId} href={`/products/${r.slug}`} className="block">
                <TrackRow
                  label={r.name}
                  value={rowLabel(r)}
                  width={((soldBy === "units" ? r.units : r.revenuePaisa) / listMax) * 100}
                  color="var(--f-chart)"
                  right={<span className="text-[10.5px]" style={{ color: "var(--t-faint)" }}>
                    {r.categoryName ?? "no category"}
                  </span>}
                />
              </Link>
            )) : (
              <Empty state={soldSt}
                empty={sold.nothingSold ? "Not one product sold in this period." : "No product sold in this period."}
                error="The sales report did not answer, so what sold cannot be listed." />
            )}
          </div>
          {list.length > shown.length ? (
            <div className="text-[11.5px] mt-3" style={{ color: "var(--t-faint)" }}>
              The {shown.length} biggest of {count(list.length)} products that sold.{" "}
              <Link href="/products/funnel" className="underline font-semibold" style={{ color: "var(--t-accent)" }}>see them all</Link>
            </div>
          ) : null}
        </Card>

        <Card title="Which category sells most" right={<Scope text="this period" />}>
          <div className="mt-[18px]">
            {sold.cats.length > 0 ? sold.cats.slice(0, 8).map((g) => (
              <TrackRow key={g.name} label={g.name} value={formatTaka(g.paisa)}
                width={(g.paisa / catMax) * 100} color="var(--t-orchid)"
                right={<span className="text-[10.5px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                  {catTotal > 0 ? `${Math.round((g.paisa / catTotal) * 100)}%` : `${count(g.units)} sold`}
                </span>} />
            )) : (
              <Empty state={soldSt} empty="Nothing sold in this period, so no category leads."
                error="The sales report did not answer." />
            )}
          </div>
          <Rule />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Categories that sold" value={sold.cats.length > 0 ? count(sold.cats.length) : "—"} />
            <Stat label="Products that sold"
              value={now ? count(rows.filter((r) => r.units > 0).length) : "—"}
              sub="counted inside this period, whatever they are now" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-[18px]">
        <Card title="Thinnest margin — check the price or the cost" right={<Scope text="now" tone="now" />}>
          {c.thin.length > 0 ? (
            <Table head={[{ label: "Product" }, { label: "Sells for", right: true }, { label: "Costs", right: true }, { label: "Kept", right: true }]} min={520}>
              {c.thin.map((p) => (
                <tr key={p.id}>
                  <Td><Link href={`/products/${p.slug}`} className="hover:underline">{p.name}</Link></Td>
                  <Td right>{formatTaka(p.offerPricePaisa)}</Td>
                  <Td right>{formatTaka(p.costPaisa)}</Td>
                  <Td right bold color={marginPctOf(p) === null ? "var(--t-faint)"
                    : marginOf(p) < 0 ? "var(--t-bad)" : marginPctOf(p)! < 20 ? "var(--t-warn)" : "var(--t-ok)"}>
                    {marginPctOf(p) === null ? "no price set" : `${marginPctOf(p)}%`}
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <div className="mt-4">
              <Empty state={catSt}
                empty={c.costsHidden
                  ? "Cost prices are not shown to this account, so no margin can be worked out here."
                  : "No product has a cost price yet, so no margin can be worked out."}
                error="The catalogue did not answer." />
            </div>
          )}
          {c.loss.length > 0 ? (
            <div className="mt-4">
              <Chip tone="bad">{`${count(c.loss.length)} product${c.loss.length === 1 ? "" : "s"} priced below cost`}</Chip>
            </div>
          ) : null}
        </Card>

        <Card title="Running out" right={<Scope text="now" tone="now" />}>
          <div className="mt-[18px]">
            <SubHead>Live products, least stock first</SubHead>
            <div className="mt-3.5">
              {c.running.length > 0 ? c.running.map((p) => (
                <Link key={p.id} href={`/products/${p.slug}`} className="block">
                  <TrackRow label={p.name}
                    value={p.stockQty <= 0 ? "out of stock" : `${count(p.stockQty)} left`}
                    width={(Math.max(0, p.stockQty) / runMax) * 100}
                    color={p.stockQty <= 0 ? "var(--t-bad)" : p.stockQty <= 5 ? "var(--t-warn)" : "var(--t-ok)"} />
                </Link>
              )) : (
                <Empty state={catSt} empty="No product is live on the website yet."
                  error="The catalogue did not answer." />
              )}
            </div>
          </div>
          <Rule />
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Out of stock" value={items ? count(c.oos.length) : "—"}
              tone={items && c.oos.length > 0 ? "bad" : undefined} href="/inventory/stock" />
            <Stat label="Five or fewer left" value={items ? count(c.low.length) : "—"}
              tone={items && c.low.length > 0 ? "warn" : undefined} />
            <Stat label="No photo yet" value={items ? count(c.noPhoto.length) : "—"} href="/products/list" />
          </div>
        </Card>
      </div>

      <SourceNote>
        The band and the two cards marked <b>now</b> are the catalogue as it stands and do not follow the period
        switch. What sold covers {range.from === range.to ? "the chosen day" : `${daysBetween(range.from, range.to)} days`}{" "}
        of <b>website</b> orders: an order counts once it is placed and stops counting if it is cancelled, so an order
        still on its way is included and a refund is shown on its own. The counter sells stockroom items rather than
        website products, so nothing it billed appears here — it is on the Counter screen.
        {beforeSt === "error" ? " The period before this one did not answer, so no comparison is shown." : ""}
        {!complete ? " Only part of the catalogue could be read, so the counts marked now are short of the real ones." : ""}
      </SourceNote>
    </div>
  );
}
