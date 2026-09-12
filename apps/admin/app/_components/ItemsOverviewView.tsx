"use client";

/*  ITEMS OVERVIEW — the master list the whole shop is built from.

    Built on OverviewKit (12 Sep 2026), the same pattern as the other overview
    screens.

    An Item is a thing in the stockroom: a rose stem, a ribbon, a teddy, a
    service. A website Product is a different record. The counter sells ITEMS,
    the website sells PRODUCTS - so this screen's period figures come from
    `/pos/items-sold`, which is the only place an item earns money.

    TWO POPULATIONS, BOTH MARKED.
      NOW    - the master list itself: how many items, what they cost, what is
               missing. These do NOT follow the period switch.
      PERIOD - what the counter sold, inside the dates the reader picks.

    COST FIGURES CAN BE ABSENT ON PURPOSE. DEC-ADM-012: the server strips every
    cost from anyone whose template does not say "See cost prices". So a missing
    cost is NOT the same as a cost of zero, and this screen counts the items
    that have no cost separately from the ones it cannot see.  */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import {
  ApiItem, ApiItemCategory, ApiItemsSold, ITEM_TYPE_META, formatTaka,
  listItemCategories, listItems, posItemsSold,
} from "../_data/api";
import {
  Card, Chip, Delta, Empty, Kpi, KpiRow, NowBand, RangeBar, Rule, Scope, SourceNote,
  Stat, SubHead, Table, Td, TrackRow, count, dayLabel, presetRange, previousRange,
  useLoadState, type NowJob, type Range,
} from "./OverviewKit";

export function ItemsOverviewView() {
  const [range, setRange] = useState<Range>(presetRange("d30"));
  const [items, setItems] = useState<ApiItem[] | null>(null);
  const [cats, setCats] = useState<ApiItemCategory[] | null>(null);
  const [sold, setSold] = useState<ApiItemsSold | null>(null);
  const [before, setBefore] = useState<ApiItemsSold | null>(null);
  const { settle, begin, at } = useLoadState();

  useEffect(() => {
    let alive = true;
    begin("items", "cats");
    void (async () => {
      const r = await Promise.allSettled([listItems(), listItemCategories()]);
      if (!alive) return;
      setItems(r[0].status === "fulfilled" ? r[0].value : null);
      setCats(r[1].status === "fulfilled" ? r[1].value : null);
      settle({ items: r[0], cats: r[1] });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    begin("sold", "soldBefore");
    /*  clear FIRST: last month's takings under the word "today" is exactly the
        lie rule 3 exists to stop  */
    setSold(null); setBefore(null);
    const prev = previousRange(range);
    void (async () => {
      const r = await Promise.allSettled([
        posItemsSold({ from: range.from, to: range.to }),
        posItemsSold({ from: prev.from, to: prev.to }),
      ]);
      if (!alive) return;
      setSold(r[0].status === "fulfilled" ? r[0].value : null);
      setBefore(r[1].status === "fulfilled" ? r[1].value : null);
      settle({ sold: r[0], soldBefore: r[1] });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  const itSt = at("items"), catSt = at("cats"), soldSt = at("sold");

  const m = useMemo(() => {
    const all = items ?? [];
    /*  a cost of `undefined` is a cost this reader is not allowed to see;
        a cost of 0 is a cost nobody has entered. They are counted apart.  */
    const costHidden = all.filter((i) => i.effectiveCostPaisa === undefined).length;
    const allCostsHidden = all.length > 0 && costHidden === all.length;
    const priced = all.filter((i) => (i.effectiveCostPaisa ?? 0) > 0);
    /*  a cost of zero on an item whose cost this account CAN see is a cost
        nobody entered - saleable or not, it is still missing  */
    const noCost = all.filter((i) => i.effectiveCostPaisa !== undefined && i.effectiveCostPaisa <= 0);
    const noPrice = all.filter((i) => i.isSaleable && (i.effectiveSellPricePaisa ?? null) === null);
    /*  `_count` is optional on a list read. Absent is NOT zero: reading it as
        zero turned every assembled item into "no recipe" and put a red job
        chip on the band for work nobody had to do.  */
    const counted = all.filter((i) => i._count !== undefined);
    const recipeKnown = counted.length > 0 || all.length === 0;
    const emptyRecipe = counted.filter((i) => i.assemblyMode !== "NONE" && (i._count?.components ?? 0) === 0);
    const byType = (Object.keys(ITEM_TYPE_META) as (keyof typeof ITEM_TYPE_META)[])
      .map((t) => ({ t, label: ITEM_TYPE_META[t].label, n: all.filter((i) => i.itemType === t).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
    return {
      all,
      live: all.filter((i) => i.isActive),
      hidden: all.filter((i) => !i.isActive),
      saleable: all.filter((i) => i.isSaleable),
      online: all.filter((i) => i.isOnline),
      assembled: all.filter((i) => i.assemblyMode !== "NONE"),
      emptyRecipe, recipeKnown, allCostsHidden,
      noPhoto: all.filter((i) => !i.imageUrl),
      noCategory: all.filter((i) => !i.itemCategoryId),
      noPrice, noCost, costHidden, priced,
      dearest: priced.slice().sort((a, b) => (b.effectiveCostPaisa ?? 0) - (a.effectiveCostPaisa ?? 0)).slice(0, 6),
      byType,
    };
  }, [items]);

  const typeMax = Math.max(1, ...m.byType.map((x) => x.n));
  const catRows = useMemo(() => (cats ?? [])
    .filter((c) => c._count !== undefined)
    .map((c) => ({ id: c.id, name: c.name, n: c._count?.items ?? 0 }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n), [cats]);
  /*  the list answered but carried no counts - that is "not measured", not
      "no category holds an item"  */
  const catCountsMissing = (cats ?? []).length > 0 && (cats ?? []).every((c) => c._count === undefined);
  const catMax = Math.max(1, ...catRows.map((c) => c.n));

  const soldIds = useMemo(() => new Set((sold?.rows ?? []).map((r) => r.itemId)), [sold]);
  const t = sold?.totals ?? null;
  const tb = before?.totals ?? null;
  const soldRows = (sold?.rows ?? []).slice().sort((a, b) => b.revenuePaisa - a.revenuePaisa);
  const soldMax = Math.max(1, ...soldRows.map((r) => r.revenuePaisa));

  const jobs: NowJob[] = items ? [
    { key: "noPrice", label: "On sale with no price", count: m.noPrice.length, href: "/items/list?only=noPrice", tone: "danger" },
    { key: "recipe", label: "Assembled but no recipe", count: m.recipeKnown ? m.emptyRecipe.length : 0, href: "/assembly", tone: "danger" },
    { key: "noCost", label: "No cost set", count: m.noCost.length, href: "/items/list?only=noCost", tone: "warn" },
    { key: "noCat", label: "Not in a category", count: m.noCategory.length, href: "/items/list", tone: "warn" },
    { key: "noPhoto", label: "No photo", count: m.noPhoto.length, href: "/items/list?only=noPhoto", tone: "info" },
  ] : [];

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Master data"
        title="Items"
        desc="Every thing the shop keeps, builds or sells across the counter — and what the counter sold from it."
      />

      <NowBand
        title="The master list right now"
        figures={[
          { label: "Items in use", value: items ? count(m.live.length) : "—", quiet: !items,
            sub: items ? `of ${count(m.all.length)}` : undefined },
          { label: "Sold at the counter", value: items ? count(m.saleable.length) : "—", quiet: !items,
            sub: items ? `${count(m.online.length)} also on the website` : undefined },
          { label: "Built from a recipe", value: items ? count(m.assembled.length) : "—", quiet: !items || m.assembled.length === 0 },
          { label: "Hidden", value: items ? count(m.hidden.length) : "—", quiet: !items || m.hidden.length === 0,
            sub: items && m.hidden.length > 0 ? "switched off, not deleted" : undefined },
        ]}
        jobs={jobs}
        loading={itSt === "loading"}
        failed={itSt === "error"}
        note={itSt === "error"
          ? "The item list did not answer, so nothing on this line can be trusted."
          : m.costHidden > 0
            ? `${count(m.costHidden)} items keep their cost hidden from this account, so no cost figure here covers them.`
            : items && m.all.length === 0 ? "There is no item on the master list yet." : undefined}
      />

      <div className="mt-[18px]">
        <RangeBar range={range} onPick={setRange}
          right={<Link href="/pos" className="underline font-semibold" style={{ color: "var(--t-accent)" }}>the counter →</Link>} />
      </div>

      <KpiRow>
        <Kpi
          icon={<Icon name="register" size={18} />} iconBg="var(--s-accent)" iconColor="var(--t-accent)"
          label="Sold at the counter" value={t ? count(t.items) : "—"}
          scope={<Scope text="different items" />}
          delta={<Delta now={t ? t.items : null} before={at("soldBefore") === "error" ? undefined : tb ? tb.items : null} />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {t ? "counted inside this period, whatever they are now"
              : soldSt === "error" ? "the counter report did not answer" : "reading the counter report…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="layers" size={18} />} iconBg="var(--s-info)" iconColor="var(--t-info)"
          label="Counter bills" value={t ? count(t.bills) : "—"}
          scope={<Scope text="this period" />}
          delta={<Delta now={t ? t.bills : null} before={at("soldBefore") === "error" ? undefined : tb ? tb.bills : null} />}
        >
          {/*  Units are NOT shown as one headline. `totals.units` adds stems,
               metres of ribbon and hours of gift-wrapping together, so the
               number moves when the mix changes and means nothing on its own.
               Units belong beside their unit name, which is what the rows
               below do.  */}
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {t ? `${count(t.items)} different item${t.items === 1 ? "" : "s"} crossed the counter`
              : soldSt === "error" ? "the counter report did not answer" : "reading the counter report…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="cash" size={18} />} iconBg="var(--s-ok)" iconColor="var(--t-ok)"
          label="Counter takings" value={t ? formatTaka(t.revenuePaisa) : "—"}
          scope={<Scope text="delivered bills" />}
          delta={<Delta now={t ? t.revenuePaisa : null} before={at("soldBefore") === "error" ? undefined : tb ? tb.revenuePaisa : null} />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {t ? "refunds already taken off"
              : soldSt === "error" ? "the counter report did not answer" : "reading the counter report…"}
          </div>
        </Kpi>
        <Kpi
          icon={<Icon name="box" size={18} />} iconBg="var(--s-orchid)" iconColor="var(--t-orchid)"
          label="Dearest thing kept" value={m.dearest.length > 0 ? formatTaka(m.dearest[0].effectiveCostPaisa ?? 0) : "—"}
          scope={<Scope text="now" tone="now" />}
        >
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {m.dearest.length > 0 ? m.dearest[0].name
              : itSt === "error" ? "the item list did not answer"
                : !items ? "reading the item list…"
                  : m.allCostsHidden ? "cost prices are not shown to this account"
                    : "no item has a cost price yet"}
          </div>
        </Kpi>
      </KpiRow>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-[18px] mb-[18px]">
        <Card title="What the counter sold" right={<Scope text="this period" />}>
          <div className="mt-[18px]">
            {soldRows.length > 0 ? soldRows.slice(0, 8).map((r) => (
              <TrackRow key={r.itemId} label={r.name} value={formatTaka(r.revenuePaisa)}
                width={(r.revenuePaisa / soldMax) * 100} color="var(--f-chart)"
                right={<span className="text-[10.5px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                  {`${count(r.units)} ${r.unitName ?? "units"} · ${count(r.bills)} bill${r.bills === 1 ? "" : "s"}`}
                </span>} />
            )) : (
              <Empty state={soldSt} empty="The counter sold nothing in this period."
                error="The counter report did not answer, so what sold cannot be listed." />
            )}
          </div>
          {soldRows.length > 8 ? (
            <div className="text-[11.5px] mt-3" style={{ color: "var(--t-faint)" }}>
              The 8 biggest of {count(soldRows.length)} items that sold.{" "}
              <Link href="/pos/sales-history" className="underline font-semibold" style={{ color: "var(--t-accent)" }}>see the bills</Link>
            </div>
          ) : null}
          <Rule />
          <div className="grid grid-cols-2 gap-4">
            {/*  the intersection, not a subtraction: an item sold in this
                 period may since have been switched off, which made the
                 subtraction go negative and get clamped to a confident zero  */}
            <Stat label="Never sold in this period"
              value={items && sold ? count(m.saleable.filter((i) => !soldIds.has(i.id)).length) : "—"}
              sub={items ? `of the ${count(m.saleable.length)} that can be sold today` : undefined} />
            <Stat label="Item value per bill"
              value={t && t.bills > 0 ? formatTaka(Math.round(t.revenuePaisa / t.bills)) : "—"}
              sub={t && t.bills === 0 ? "no bill in this period" : "the items only — no delivery, discount or VAT"} />
          </div>
        </Card>

        <Card title="What kind of things these are" right={<Scope text="now" tone="now" />}>
          <div className="mt-[18px]">
            {m.byType.length > 0 ? m.byType.map((x) => (
              <TrackRow key={x.t} label={x.label} value={count(x.n)}
                width={(x.n / typeMax) * 100} color="var(--t-orchid)"
                right={<span className="text-[10.5px]" style={{ color: "var(--t-faint)" }}>
                  {`${Math.round((x.n / Math.max(1, m.all.length)) * 100)}%`}
                </span>} />
            )) : (
              <Empty state={itSt} empty="There is no item on the master list yet."
                error="The item list did not answer." />
            )}
          </div>
          <Rule />
          <SubHead>Biggest categories</SubHead>
          <div className="mt-3.5">
            {catRows.length > 0 ? catRows.slice(0, 5).map((c) => (
              <TrackRow key={c.id} label={c.name} value={`${count(c.n)} items`}
                width={(c.n / catMax) * 100} color="var(--f-chart)" />
            )) : (
              <Empty state={catSt}
                empty={catCountsMissing
                  ? "The category list came back without its item counts, so they cannot be ranked."
                  : "No category holds an item yet."}
                error="The category list did not answer." />
            )}
          </div>
          {items && m.noCategory.length > 0 ? (
            <div className="mt-4">
              <Chip tone="warn">{`${count(m.noCategory.length)} item${m.noCategory.length === 1 ? "" : "s"} in no category`}</Chip>
            </div>
          ) : null}
        </Card>
      </div>

      <Card title="The dearest things the shop keeps" right={<Scope text="now" tone="now" />}>
        {m.dearest.length > 0 ? (
          <Table head={[{ label: "Item" }, { label: "Kind" }, { label: "Costs", right: true }, { label: "Counter price", right: true }]} min={600}>
            {m.dearest.map((i) => (
              <tr key={i.id}>
                <Td><Link href={`/items/${i.id}`} className="hover:underline">{i.name}</Link></Td>
                <Td color="var(--t-faint)">{ITEM_TYPE_META[i.itemType]?.label ?? i.itemType}</Td>
                <Td right bold>{formatTaka(i.effectiveCostPaisa ?? 0)}</Td>
                <Td right color={i.isSaleable && (i.effectiveSellPricePaisa ?? null) === null ? "var(--t-bad)" : undefined}>
                  {i.isSaleable
                    ? (i.effectiveSellPricePaisa ?? null) === null ? "no price set" : formatTaka(i.effectiveSellPricePaisa!)
                    : "not for sale"}
                </Td>
              </tr>
            ))}
          </Table>
        ) : (
          <div className="mt-4">
            <Empty state={itSt}
              empty={m.costHidden > 0
                ? "Every cost is hidden from this account, so nothing can be ranked by cost."
                : "No item has a cost price yet."}
              error="The item list did not answer." />
          </div>
        )}
        <Rule />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Items with a cost"
            value={!items ? "—" : m.allCostsHidden ? "—" : count(m.priced.length)}
            sub={m.allCostsHidden ? "costs are hidden from this account" : undefined} />
          <Stat label="On sale with no price" value={items ? count(m.noPrice.length) : "—"}
            tone={items && m.noPrice.length > 0 ? "bad" : undefined} href="/items/list?only=noPrice" />
          <Stat label="No recipe yet"
            value={items && m.recipeKnown ? count(m.emptyRecipe.length) : "—"}
            tone={items && m.recipeKnown && m.emptyRecipe.length > 0 ? "bad" : undefined}
            sub={items && !m.recipeKnown ? "recipes were not read with the list" : undefined}
            href="/assembly" />
          <Stat label="No photo" value={items ? count(m.noPhoto.length) : "—"} href="/items/list?only=noPhoto" />
        </div>
      </Card>

      <SourceNote>
        Everything marked <b>now</b> is the master list as it stands and does not follow the period switch. The counter
        figures cover {range.from === range.to ? dayLabel(range.from) : `${dayLabel(range.from)} to ${dayLabel(range.to)}`}{" "}
        and count only bills that were handed over, with refunds already taken off — an advance that has not been
        collected is not a sale yet. The website sells Products rather than Items, so nothing the website sold appears
        here; it is on the Products screen.
        {m.costHidden > 0 ? ` ${count(m.costHidden)} items keep their cost hidden from this account.` : ""}
      </SourceNote>
    </div>
  );
}
