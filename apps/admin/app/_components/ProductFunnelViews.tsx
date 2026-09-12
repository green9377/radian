"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import {
  getCatalogFunnel,
  getProductAnalytics,
  getProductBySlug,
  formatTaka,
  genBg,
  storefrontUrl,
  type ApiCatalogFunnel,
  type ApiProductAnalytics,
  getProductTimeline,
  type ActivityEvent,
} from "../_data/api";
/*  DEMO_FUNNEL / demoAnalyticsFor imports removed 9 Aug 2026 — the funnel
    no longer invents numbers when the shop is empty (owner's order). Only
    DEMO_FUNNEL_STAGES survives: it labels the greyed-out stages that real
    tracking has not reached yet, and draws nothing as data.  */
import { DEMO_FUNNEL_STAGES } from "../_data/demoFunnel";

/*
  Product Funnel (catalog) + Product Analysis (single) — Phase 1.
  Money half (orders / delivered / revenue / margin / refunds) is REAL, from our
  own database. Views / add-to-cart / checkout are greyed out until web-analytics
  tracking is connected — deliberately never guessed.
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";
const RANGES = [7, 30, 90];

function PageHead({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
        <span
          className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold"
          style={{ borderRadius: "50% 50% 50% 0" }}
        />
        {eyebrow}
      </div>
      <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">
        {title}
      </h1>
      {children && (
        <p className="text-body-soft text-[13.5px] m-0 max-w-[780px]">{children}</p>
      )}
    </div>
  );
}

function RangePicker({
  days,
  setDays,
}: {
  days: number;
  setDays: (d: number) => void;
}) {
  return (
    <div className="inline-flex bg-lavender rounded-[11px] p-1 gap-1">
      {RANGES.map((d) => (
        <button
          key={d}
          onClick={() => setDays(d)}
          className={`text-[12.5px] font-semibold px-3.5 py-2 rounded-[9px] transition-colors ${days === d ? "bg-white text-purple shadow-soft" : "text-body-soft hover:text-purple"}`}
        >
          {d} days
        </button>
      ))}
    </div>
  );
}

function SourceLegend({ demo }: { demo: boolean }) {
  return (
    <div className="flex gap-2.5 flex-wrap items-center text-[11.5px] mb-4">
      <span className="text-body-soft">Where the numbers come from:</span>
      {demo ? (
        <span className="bg-[#fff8ec] text-[#b45309] border border-[#f0c88a] px-2.5 py-1 rounded-full font-semibold inline-flex items-center gap-1.5">
          <Icon name="bolt" size={12} /> Demo data — no real orders yet
        </span>
      ) : (
        <>
          <span className="bg-[#e8f6ef] text-[#0f7d55] px-2.5 py-1 rounded-full font-semibold">
            Radian database — money, authoritative
          </span>
          <span className="bg-[#f0edf4] text-body-soft px-2.5 py-1 rounded-full font-semibold">
            Web analytics — not connected yet
          </span>
        </>
      )}
    </div>
  );
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const dropLine = (from: number, to: number) =>
  from > 0 ? `${100 - pct(to, from)}% left here` : "";

/* ---------- funnel stage bar ---------- */
function Stage({
  label,
  value,
  pctOfTop,
  tracked,
  drop,
}: {
  label: string;
  value: number | null;
  pctOfTop: number;
  tracked: boolean;
  drop?: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center text-[13px] mb-1">
        <span className="flex items-center gap-2">
          <b className={tracked ? "text-purple" : "text-body-soft"}>{label}</b>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tracked ? "bg-[#e8f6ef] text-[#0f7d55]" : "bg-[#f0edf4] text-body-soft"}`}
          >
            {tracked ? "DB" : "not tracked"}
          </span>
        </span>
        <b className={tracked ? "text-purple" : "text-body-soft"}>
          {value === null ? "—" : value.toLocaleString("en-IN")}
        </b>
      </div>
      <div className="h-[26px] rounded-[7px] bg-lavender overflow-hidden">
        <div
          className={`h-full rounded-[7px] ${tracked ? "bg-gradient-to-r from-[#470066] to-[#9c1fb8]" : "bg-lavender-deep"}`}
          style={{ width: `${Math.max(tracked ? 6 : 0, pctOfTop)}%` }}
        />
      </div>
      {drop && (
        <div className="text-center text-[13px] text-body-soft mt-1">{drop}</div>
      )}
    </div>
  );
}

/* ================= CATALOG FUNNEL ================= */
export function CatalogFunnel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ApiCatalogFunnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyLeaks, setOnlyLeaks] = useState(false);
  const [demo, setDemo] = useState(false);

  /*  ⚠️ NO DEMO FALLBACK — owner, 9 Aug 2026: *"ager sob data catalog
      funnel-e ache, egula sob clean koro."* The screen used to pour in
      DEMO_FUNNEL whenever there were no real orders, so a freshly wiped
      shop showed ৳23,95,850 of revenue that never happened — the same
      invented-numbers trap already removed from the product list and POS
      on 8 Aug. Empty is empty; API down is an error, not a story.  */
  async function load(d: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await getCatalogFunnel(d);
      setData(res);
      setDemo(false);
    } catch {
      setData(null);
      setError("The funnel could not be loaded — the API did not answer");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(days);
  }, [days]);

  const items = data?.items ?? [];

  // category average conversion is only meaningful once views exist; for Phase 1
  // we rank by revenue lost to cancellations + refunds, which IS real money.
  // benchmark = catalog-wide view→order rate (only meaningful when views exist)
  const benchmark = useMemo(() => {
    const v = items.reduce((s, i) => s + (i.views ?? 0), 0);
    const o = items.reduce((s, i) => s + i.orders, 0);
    return v > 0 ? o / v : 0;
  }, [items]);

  const rows = useMemo(() => {
    const list = items
      .map((i) => {
        const unit = i.orders > 0 ? i.revenuePaisa / i.orders : 0;
        const cancelLoss = Math.round(unit * i.cancelled);
        // missed revenue: if it converted at the catalog average
        const expected = i.views ? Math.round(i.views * benchmark) : 0;
        const missed = expected > i.orders ? Math.round((expected - i.orders) * unit) : 0;
        const conv = i.views ? (i.orders / i.views) * 100 : null;
        const leak =
          i.views && i.addToCarts !== null && pct(i.addToCarts, i.views) < 8
            ? "View → cart"
            : i.checkouts !== null && i.addToCarts
              ? pct(i.checkouts, i.addToCarts) < 55
                ? "Cart → checkout"
                : pct(i.orders, i.checkouts) < 70
                  ? "Checkout → order"
                  : i.cancelled > i.orders * 0.15
                    ? "Cancelled after order"
                    : "healthy"
              : i.orders === 0 && i.isPublished
                ? "No orders at all"
                : i.cancelled > 0
                  ? "Cancelled after order"
                  : "healthy";
        return {
          ...i,
          conv,
          leak,
          deliverRate: pct(i.delivered, i.orders),
          lostPaisa: i.refundPaisa + cancelLoss + missed,
        };
      })
      .filter(
        (i) =>
          !q ||
          i.name.toLowerCase().includes(q.toLowerCase()) ||
          (i.sku ?? "").toLowerCase().includes(q.toLowerCase()),
      )
      .filter((i) => (!onlyLeaks ? true : i.leak !== "healthy"));
    return list.sort((a, b) => b.lostPaisa - a.lostPaisa || b.revenuePaisa - a.revenuePaisa);
  }, [items, q, onlyLeaks, benchmark]);

  const t = data?.totals;
  const top = t ? Math.max(t.orders, 1) : 1;

  return (
    <div className={WRAP}>
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <PageHead eyebrow="Product Management · funnel" title="Product Funnel" />
        <RangePicker days={days} setDays={setDays} />
      </div>

      <SourceLegend demo={demo} />

      {error && (
        <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-4 text-[13px]">
          {error}.{" "}
          <button className="underline" onClick={() => load(days)}>
            Retry
          </button>
        </div>
      )}

      {/* catalog funnel */}
      <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5 mb-4">
        <h3 className="font-display text-[16px] text-purple m-0 mb-1">
          Catalog funnel · last {days} days
        </h3>
        <p className="text-[13px] text-body-soft m-0 mb-4">
          {demo
            ? "Demo numbers."
            : "The first three stages need web-analytics tracking."}
        </p>
        <div className="flex flex-col gap-3">
          <Stage
            label="Viewed"
            value={demo ? DEMO_FUNNEL_STAGES.views : null}
            pctOfTop={100}
            tracked={demo}
            drop={demo ? dropLine(DEMO_FUNNEL_STAGES.views, DEMO_FUNNEL_STAGES.carts) : undefined}
          />
          <Stage
            label="Added to cart"
            value={demo ? DEMO_FUNNEL_STAGES.carts : null}
            pctOfTop={demo ? pct(DEMO_FUNNEL_STAGES.carts, DEMO_FUNNEL_STAGES.views) : 70}
            tracked={demo}
            drop={demo ? dropLine(DEMO_FUNNEL_STAGES.carts, DEMO_FUNNEL_STAGES.checkouts) : undefined}
          />
          <Stage
            label="Checkout started"
            value={demo ? DEMO_FUNNEL_STAGES.checkouts : null}
            pctOfTop={demo ? pct(DEMO_FUNNEL_STAGES.checkouts, DEMO_FUNNEL_STAGES.views) : 45}
            tracked={demo}
            drop={demo && t ? dropLine(DEMO_FUNNEL_STAGES.checkouts, t.orders) : undefined}
          />
          <Stage
            label="Ordered"
            value={t?.orders ?? 0}
            pctOfTop={demo ? pct(t?.orders ?? 0, DEMO_FUNNEL_STAGES.views) : 100}
            tracked
            drop={t && t.orders ? `${t.cancelled} cancelled after ordering` : undefined}
          />
          <Stage
            label="Delivered"
            value={t?.delivered ?? 0}
            pctOfTop={
              demo
                ? pct(t?.delivered ?? 0, DEMO_FUNNEL_STAGES.views)
                : t
                  ? (t.delivered / top) * 100
                  : 0
            }
            tracked
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3 mt-5 pt-4 border-t border-lavender-deep">
          <div>
            <div className="text-[13px] text-body-soft">Revenue</div>
            <div className="text-[19px] font-medium text-purple">
              {formatTaka(t?.revenuePaisa ?? 0)}
            </div>
          </div>
          <div>
            <div className="text-[13px] text-body-soft">Margin earned</div>
            <div className="text-[19px] font-medium text-[#0f7d55]">
              {formatTaka(t?.marginPaisa ?? 0)}
            </div>
          </div>
          <div>
            <div className="text-[13px] text-body-soft">Units sold</div>
            <div className="text-[19px] font-medium">{t?.units ?? 0}</div>
          </div>
          <div>
            <div className="text-[13px] text-body-soft">Refunded</div>
            <div className="text-[19px] font-medium text-[#c0392b]">
              {formatTaka(t?.refundPaisa ?? 0)}
            </div>
          </div>
        </div>
      </div>

      {/* leak table */}
      <div className="flex gap-2.5 flex-wrap items-center mb-3">
        <div className="relative max-w-[300px] w-full">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft">
            <Icon name="search" size={18} />
          </span>
          <input
            className="ipt ipt-icon h-[44px]"
            placeholder="Search product or SKU…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button
          onClick={() => setOnlyLeaks(!onlyLeaks)}
          className={`text-[12.5px] font-semibold px-4 py-2.5 rounded-[11px] border transition-colors ${onlyLeaks ? "bg-purple border-purple text-white" : "bg-white border-lavender-deep text-purple hover:border-orchid"}`}
        >
          Only problems
        </button>
        <span className="text-[13px] text-body-soft ml-auto">
          {loading ? "loading…" : `${rows.length} products`}
        </span>
      </div>

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
              <th className="text-left font-medium px-4 py-3">Product</th>
              <th className="text-left font-medium px-4 py-3">Views</th>
              <th className="text-left font-medium px-4 py-3">Orders</th>
              <th className="text-left font-medium px-4 py-3">Conv.</th>
              <th className="text-left font-medium px-4 py-3">Revenue</th>
              <th className="text-left font-medium px-4 py-3">Leaks at</th>
              <th className="text-left font-medium px-4 py-3">Money lost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              return (
                <tr
                  key={r.productId}
                  className="border-t border-lavender-deep hover:bg-lavender/70 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/products/${r.slug}/analysis`}
                      className="flex items-center gap-3 group"
                    >
                      {/*  the real photo; the coloured tile only for a product
                          that truly has none (owner, 9 Aug 2026)  */}
                      <div
                        className="w-[40px] h-[40px] rounded-[10px] shrink-0 shadow-soft bg-cover bg-center"
                        style={{
                          background: r.imageUrl
                            ? `url(${r.imageUrl}) center/cover no-repeat`
                            : genBg(r.slug),
                        }}
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-purple group-hover:underline leading-snug">
                          {r.name}
                        </div>
                        <div className="text-[13px] text-body-soft">
                          <span className="font-mono">{r.sku ?? "no SKU"}</span> ·{" "}
                          {r.categoryName ?? "—"}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-body-soft">
                    {r.views === null ? "—" : r.views.toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3">
                    {r.orders}
                    {r.orders > 0 && (
                      <span className="text-[13px] text-body-soft ml-1.5">
                        {r.deliverRate}% delivered
                      </span>
                    )}
                  </td>
                  <td
                    className={`px-4 py-3 font-medium ${
                      r.conv === null
                        ? "text-body-soft"
                        : r.conv < 3
                          ? "text-[#c0392b]"
                          : r.conv < 6
                            ? "text-[#b45309]"
                            : "text-[#0f7d55]"
                    }`}
                  >
                    {r.conv === null ? "—" : `${r.conv.toFixed(1)}%`}
                  </td>
                  <td className="px-4 py-3">{formatTaka(r.revenuePaisa)}</td>
                  <td className="px-4 py-3">
                    {r.leak === "healthy" ? (
                      <span className="text-[13px] text-body-soft">healthy</span>
                    ) : (
                      <span
                        className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full ${
                          r.leak === "No orders at all" || r.leak === "View → cart"
                            ? "bg-[#fdecea] text-[#c0392b]"
                            : "bg-[#fff8ec] text-[#b45309]"
                        }`}
                      >
                        {r.leak}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[#c0392b]">
                    {r.lostPaisa > 0 ? formatTaka(r.lostPaisa) : "—"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="text-center text-body-soft py-12 border-t border-lavender-deep"
                >
                  {loading ? "loading…" : "No orders in this period."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2.5 rounded-[14px] border-[1.5px] border-[#f0c88a] bg-[#fff8ec] px-4 py-3 mt-4 text-[12.5px] text-[#7a4b09]">
        <span className="text-[#b45309] shrink-0">
          <Icon name="bolt" size={18} />
        </span>
        <div>&ldquo;Money lost&rdquo; counts refunds and the value of cancelled orders.</div>
      </div>
    </div>
  );
}

/* ================= SINGLE PRODUCT ANALYSIS ================= */
export function ProductAnalysis({ slug }: { slug: string }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ApiProductAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      /*  ⚠️ NO DEMO FALLBACK — same rule as the catalog funnel above (owner,
          9 Aug 2026). A product with no orders shows zeros, because zero is
          what happened. Invented numbers on an analysis screen are worse
          than none: they get believed.  */
      try {
        /*  A missing product and an API that did not answer are not the same
            sentence. `getProductBySlug` used to fall back to a list row and so
            never threw; now it does, and reporting that as "No such product"
            would send somebody looking for a product that is sitting there.  */
        let p: Awaited<ReturnType<typeof getProductBySlug>> = null;
        let readFailed = false;
        try {
          p = await getProductBySlug(slug);
        } catch {
          readFailed = true;
        }
        if (!alive) return;
        if (readFailed) {
          setError("This product could not be loaded — the API did not answer");
          return;
        }
        if (!p) {
          setError("No such product");
          return;
        }
        const a = await getProductAnalytics(p.id, days).catch(() => null);
        if (!alive) return;
        if (!a) {
          setError("Analytics could not be loaded — the API did not answer");
          return;
        }
        setData(a);
        setDemo(false);
      } catch {
        if (alive) setError("Analytics could not be loaded — the API did not answer");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug, days]);

  const f = data?.funnel;
  const m = data?.money;
  const p = data?.product;
  const maxDaily = useMemo(
    () => Math.max(1, ...(data?.daily ?? []).map((d) => d.orders)),
    [data],
  );

  const diagnosis = useMemo(() => {
    if (!data || !f || !m || !p) return null;
    if (f.views && f.addToCarts !== null && pct(f.addToCarts, f.views) < 8)
      return `${f.views.toLocaleString("en-IN")} views, ${f.addToCarts} added to cart — check the price, the main photo and the description.`;
    if (f.checkouts !== null && f.addToCarts && pct(f.checkouts, f.addToCarts) < 55)
      return `Added to the cart but left before checkout — usually the zone, the slot or the delivery charge.`;
    if (f.checkouts && pct(f.orders, f.checkouts) < 70)
      return `Checkout started but not finished — look at the payment step.`;
    if (f.orders === 0 && p.isPublished)
      return "Live but sold nothing in this period — check its category, tags, photo and price.";
    if (f.cancelled > 0 && f.cancelled >= f.orders * 0.2)
      return "A high share of orders are cancelled — usually stock, lead time or the delivery zone.";
    if (p.costPaisa <= 0)
      return "No cost price is set, so margin cannot be measured.";
    if (m.refundPaisa > 0)
      return "Money was refunded on this product — check the order notes.";
    return "No problems detected from order data.";
  }, [data, f, m, p]);

  return (
    <div className={WRAP}>
      <Link
        href="/products/funnel"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-body-soft hover:text-purple mb-3"
      >
        <Icon name="chevronLeft" size={16} /> Product funnel
      </Link>

      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <PageHead eyebrow="Product Management · analysis" title={p?.name ?? "Product analysis"} />
        <RangePicker days={days} setDays={setDays} />
      </div>

      <SourceLegend demo={demo} />

      {error && (
        <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-4 text-[13px]">
          {error}
        </div>
      )}
      {loading && <div className="text-[13px] text-body-soft">loading…</div>}

      {p && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          {/* left */}
          <div className="flex flex-col gap-4">
            <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
              <h3 className="font-display text-[16px] text-purple m-0 mb-4">
                Funnel
              </h3>
              <div className="flex flex-col gap-3">
                <Stage
                  label="Viewed"
                  value={f?.views ?? null}
                  pctOfTop={100}
                  tracked={!!f?.views}
                  drop={f?.views && f.addToCarts !== null ? dropLine(f.views, f.addToCarts) : undefined}
                />
                <Stage
                  label="Added to cart"
                  value={f?.addToCarts ?? null}
                  pctOfTop={f?.views ? pct(f.addToCarts ?? 0, f.views) : 70}
                  tracked={f?.addToCarts !== null && f?.addToCarts !== undefined}
                  drop={f?.addToCarts && f.checkouts !== null ? dropLine(f.addToCarts, f.checkouts) : undefined}
                />
                <Stage
                  label="Checkout started"
                  value={f?.checkouts ?? null}
                  pctOfTop={f?.views ? pct(f.checkouts ?? 0, f.views) : 45}
                  tracked={f?.checkouts !== null && f?.checkouts !== undefined}
                  drop={f?.checkouts ? dropLine(f.checkouts, f.orders) : undefined}
                />
                <Stage
                  label="Ordered"
                  value={f?.orders ?? 0}
                  pctOfTop={f?.views ? pct(f.orders, f.views) : 100}
                  tracked
                  drop={f && f.cancelled ? `${f.cancelled} cancelled` : undefined}
                />
                <Stage
                  label="Delivered"
                  value={f?.delivered ?? 0}
                  pctOfTop={
                    f?.views
                      ? pct(f.delivered, f.views)
                      : f && f.orders
                        ? (f.delivered / f.orders) * 100
                        : 0
                  }
                  tracked
                />
              </div>
              {f?.views ? (
                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-lavender-deep text-center">
                  <div>
                    <div className="text-[13px] text-body-soft">View → cart</div>
                    <div className="text-[17px] font-medium text-purple">{pct(f.addToCarts ?? 0, f.views)}%</div>
                  </div>
                  <div>
                    <div className="text-[13px] text-body-soft">Cart → order</div>
                    <div className="text-[17px] font-medium text-purple">{pct(f.orders, f.addToCarts ?? 1)}%</div>
                  </div>
                  <div>
                    <div className="text-[13px] text-body-soft">View → order</div>
                    <div className="text-[17px] font-medium text-orchid">{((f.orders / f.views) * 100).toFixed(1)}%</div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
              <h3 className="font-display text-[16px] text-purple m-0 mb-4">
                Orders per day
              </h3>
              {data && data.daily.length > 0 ? (
                <div className="flex items-end gap-[3px] h-[110px]">
                  {data.daily.map((d) => (
                    <div
                      key={d.date}
                      title={`${d.date} · ${d.orders} orders · ${formatTaka(d.revenuePaisa)}`}
                      className="flex-1 bg-gradient-to-t from-[#470066] to-[#cf43ea] rounded-t-[4px] min-w-[4px]"
                      style={{ height: `${(d.orders / maxDaily) * 100}%` }}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-[13px] text-body-soft">
                  No orders in this period.
                </div>
              )}
            </div>

            <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
              <h3 className="font-display text-[16px] text-purple m-0 mb-3">
                What this means
              </h3>
              <div className="bg-lavender/60 rounded-[12px] px-4 py-3 text-[13px] leading-relaxed text-body">
                {diagnosis}
              </div>
            </div>
          </div>

          {/* right */}
          <div className="lg:sticky lg:top-4 flex flex-col gap-3">
            <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft overflow-hidden">
              <div
                className="h-[130px]"
                style={{
                  background: p.images?.[0]?.url
                    ? `url(${p.images[0].url}) center/cover no-repeat`
                    : genBg(p.slug),
                }}
              />
              <div className="p-4">
                <div className="font-medium text-purple leading-snug">{p.name}</div>
                <div className="text-[13px] text-body-soft mt-0.5">
                  <span className="font-mono">{p.sku ?? "no SKU"}</span> ·{" "}
                  {p.category?.name ?? "—"}
                </div>
                <div className="flex gap-2 mt-3">
                  <Link
                    href={`/products/${p.slug}`}
                    className="flex-1 text-center border border-lavender-deep hover:border-orchid text-purple text-[12.5px] font-medium py-2 rounded-[10px]"
                  >
                    Edit
                  </Link>
                  <a
                    href={storefrontUrl(p.slug)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 text-center border border-lavender-deep hover:border-orchid text-purple text-[12.5px] font-medium py-2 rounded-[10px]"
                  >
                    View on site
                  </a>
                </div>
              </div>
            </div>

            <HistoryCard productId={p.id} events={events} setEvents={setEvents} />

            <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft p-4 text-[13px]">
              {[
                ["Units sold", String(m?.units ?? 0)],
                ["Revenue", formatTaka(m?.revenuePaisa ?? 0)],
                ["Margin earned", formatTaka(m?.marginPaisa ?? 0)],
                ["Refunded", formatTaka(m?.refundPaisa ?? 0)],
                ["Cancelled orders", String(f?.cancelled ?? 0)],
                ["Stock left", String(p.stockQty)],
              ].map(([k, v], i, arr) => (
                <div
                  key={k}
                  className={`flex justify-between py-2 ${i < arr.length - 1 ? "border-b border-lavender-deep" : ""}`}
                >
                  <span className="text-body-soft">{k}</span>
                  <span className="font-medium text-purple">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   History — every create / edit / delete on this product.
   The API has recorded this from day one (ActivityEvent), but nothing in the
   admin ever showed it. This is that missing window: who changed what, when.
--------------------------------------------------------------------------- */
function HistoryCard({
  productId,
  events,
  setEvents,
}: {
  productId: string;
  events: ActivityEvent[];
  setEvents: (e: ActivityEvent[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && events.length === 0 && !failed) {
      setLoading(true);
      try {
        setEvents(await getProductTimeline(productId));
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    }
  }

  const when = (iso: string) => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `${Math.max(1, mins)} min ago`;
    if (mins < 1440) return `${Math.round(mins / 60)} hr ago`;
    return `${Math.round(mins / 1440)} days ago`;
  };
  const tint = (kind: string) =>
    kind === "system" ? "#3b5bdb" : kind === "money" ? "#0f7d55" : "#cf43ea";

  return (
    <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-lavender/50"
      >
        <span>
          <span className="block text-[13px] font-medium text-purple">History</span>
          <span className="block text-[13px] text-body-soft">Who changed what, and when</span>
        </span>
        <span className={`text-body-soft transition-transform ${open ? "rotate-180" : ""}`}>
          <Icon name="chevronDown" size={18} />
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-lavender-deep pt-3">
          {loading && <div className="text-[13px] text-body-soft">loading…</div>}
          {failed && (
            <div className="text-[13px] text-body-soft">
              Could not reach the API — history is only kept on the server.
            </div>
          )}
          {!loading && !failed && events.length === 0 && (
            <div className="text-[13px] text-body-soft">Nothing recorded yet.</div>
          )}
          <div className="flex flex-col gap-0">
            {events.slice(0, 30).map((e, i) => (
              <div key={e.id} className="flex gap-2.5">
                <div className="flex flex-col items-center">
                  <span className="w-[9px] h-[9px] rounded-full mt-1.5 shrink-0" style={{ background: tint(e.kind) }} />
                  {i < Math.min(events.length, 30) - 1 && <span className="w-px flex-1 bg-lavender-deep" />}
                </div>
                <div className="pb-3 min-w-0">
                  <div className="text-[13px] text-body leading-snug">{e.label}</div>
                  <div className="text-[13px] text-body-soft">
                    {e.actorName ?? "system"} · {when(e.createdAt)}
                  </div>
                  {e.note && <div className="text-[13px] text-body-soft italic mt-0.5">{e.note}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
