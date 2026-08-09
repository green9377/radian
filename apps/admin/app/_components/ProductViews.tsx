"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import {
  listProducts,
  updateProduct,
  formatTaka,
  genBg,
  type ApiProduct,
  getAddOns,
  listItems,
  createAddOn,
  updateAddOn,
  deleteAddOn,
  createAddOnGroup,
  updateAddOnGroup,
  deleteAddOnGroup,
  setAddOnGroupItems,
  createAddOnRule,
  updateAddOnRule,
  deleteAddOnRule,
  type ApiAddOn,
  getVariantAttributes,
  createVariantAttribute,
  updateVariantAttribute,
  deleteVariantAttribute,
  setVariantValues,
  type ApiVariantAttribute,
  uploadItemImage,
} from "../_data/api";

import {
  DEMO_PRODUCTS,
  DEMO_UPGRADES,
  DEMO_ADDONS,
  DEMO_ADDON_GROUPS,
  DEMO_ADDON_RULES,
  type DemoUpgrade,
  type DemoAddon,
  type DemoAddonGroup,
  type DemoAddonRule,
  type AddonRuleField,
  type DiscountKind,
  demoAddonStats,
  demoUpgradeStats,
  demoOrderCount,
  PLACEMENTS,
  PLACEMENT_LABEL,
} from "../_data/demoProducts";


/*
  Picking a photograph on this screen used to call `URL.createObjectURL(file)`
  and store the result as a CSS background.

  That address is a handle to a file sitting in THIS tab's memory. It is not a
  web address: it stops working the moment the tab is closed, and it never meant
  anything to anyone else's browser. Both places were saving it to the database,
  so the option photo and the add-on photo looked right until the page was
  reloaded — and would never have appeared on the storefront at all.

  Both fields hold a CSS background string (a colour OR a picture), which is why
  the value is wrapped in url(...) rather than stored bare.
*/
function useCssImage() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function pick(id: string, file: File | undefined, apply: (css: string) => void) {
    if (!file) return;
    setBusyId(id); setErr("");
    try {
      const url = await uploadItemImage(file, "products", 1200);
      apply(`url(${url}) center/cover`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not upload that photo.");
    } finally { setBusyId(null); }
  }

  /**
   * ফেরত আসে **সোজা URL** — CSS নয়।
   *
   * ⚠️ `pick()` (উপরে) ফেরত দেয় `url(…) center/cover`, কারণ সেটা background
   * হিসেবে বসে। কিন্তু variant-এর ছবি database-এ **URL** হিসেবে থাকতে হবে,
   * নাহলে category page বা Google feed সেটা ছবি হিসেবে পড়তে পারবে না —
   * CSS একটা style, ঠিকানা নয়। এই দুটো গুলিয়ে ফেলার কারণেই variant-এর
   * ছবি এতদিন রঙের কলামে গিয়ে বসত।
   *
   * ⚠️ আকার জোর করে বর্গাকার করা হয় **না** — মালিকের সংশোধন, ১ আগস্ট ২০২৬:
   * *"আমি just product image-এ বলসি ১/১ হবে, আর বাকিগুলা হচ্ছে তার
   * requirement-এ যা দরকার সে অনুযায়ী হবে।"* DEC-PDP-11 শুধু product
   * photo-র নিয়ম। ১ MB-র সীমা (DEC-PDP-12) সব ছবিতেই খাটে, আর সেটা
   * `uploadItemImage` নিজেই সামলায়।
   */
  async function pickUrl(id: string, file: File | undefined, apply: (url: string) => void) {
    if (!file) return;
    setBusyId(id); setErr("");
    try {
      const url = await uploadItemImage(file, "products", 1200);
      apply(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not upload that photo.");
    } finally { setBusyId(null); }
  }

  return { busyId, err, pick, pickUrl };
}

/*
  Product Management — sub-sections.
  Every screen tries the API (:4000) first. If it is down or the catalog is
  empty it falls back to the demo catalog so the whole module stays clickable
  and reviewable. In demo mode edits stay in memory (nothing is sent anywhere).
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

/* ---------------- atoms ---------------- */
function DemoPill() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] bg-[#fff8ec] text-[#b45309] border border-[#f0c88a] px-2.5 py-1 rounded-full">
      <Icon name="bolt" size={12} /> Demo data
    </span>
  );
}

function PageHead({
  eyebrow,
  title,
  demo,
  children,
}: {
  eyebrow: string;
  title: string;
  demo?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
          <span
            className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold"
            style={{ borderRadius: "50% 50% 50% 0" }}
          />
          {eyebrow}
        </div>
        {demo && <DemoPill />}
      </div>
      <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">
        {title}
      </h1>
      {children && (
        <p className="text-body-soft text-[13.5px] m-0 max-w-[760px]">{children}</p>
      )}
    </div>
  );
}

const PLACEMENT_COLOR = ["#7d2ea8", "#cf43ea", "#e6a8f5"]; // product · cart · checkout

/* a stable colour per group id, so the same group is always the same colour
   on the card chips, the group rail and the preview tabs */
const GROUP_COLORS = ["#7d2ea8", "#0f7d55", "#b45309", "#3b5bdb", "#b76e79", "#0b7285"];
function groupTint(id: string, alpha: number) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  const hex = GROUP_COLORS[h % GROUP_COLORS.length];
  if (alpha >= 1) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/* one colour per rule condition, so the rules list is readable at a glance */
const FIELD_COLOR: Record<string, string> = {
  OCCASION: "#cf43ea",
  CATEGORY: "#0f7d55",
  ZONE: "#3b5bdb",
  PRODUCT_TYPE: "#b45309",
};

const HUE: Record<string, string> = {
  purple: "from-[#470066] to-[#7d2ea8]",
  orchid: "from-[#cf43ea] to-[#9c1fb8]",
  rose: "from-[#b76e79] to-[#e09aa4]",
  green: "from-[#0f7d55] to-[#37a97c]",
  amber: "from-[#b45309] to-[#e29a34]",
  red: "from-[#c0392b] to-[#e0705f]",
  blue: "from-[#3b5bdb] to-[#7793f7]",
  teal: "from-[#0b7285] to-[#3aa8bd]",
};
function Kpi({
  n,
  l,
  hue,
  icon,
}: {
  n: string;
  l: string;
  hue: keyof typeof HUE;
  icon: string;
}) {
  return (
    <div
      className={`rounded-[16px] px-4 py-4 text-white bg-gradient-to-br ${HUE[hue]} shadow-lift relative overflow-hidden`}
    >
      <span className="absolute -right-4 -bottom-5 opacity-15">
        <Icon name={icon} size={78} />
      </span>
      <span className="opacity-90 relative">
        <Icon name={icon} size={17} />
      </span>
      <div className="text-[27px] font-display font-medium leading-none mt-2.5 relative">
        {n}
      </div>
      <div className="text-[12px] opacity-90 mt-1.5 relative">{l}</div>
    </div>
  );
}

function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
      <h3 className="font-display text-[16px] text-purple m-0 mb-1">{title}</h3>
      {sub ? (
        <p className="text-[13px] text-body-soft m-0 mb-4">{sub}</p>
      ) : (
        <div className="mb-3" />
      )}
      {children}
    </div>
  );
}

function HowTo({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-[14px] border-[1.5px] border-orchid-mid bg-orchid-soft/60 px-4 py-3 mb-5 text-[12.5px] text-purple">
      <span className="shrink-0 text-orchid">
        <Icon name="sparkle" size={17} />
      </span>
      <div>{children}</div>
    </div>
  );
}

/** photo slot for a row — real upload arrives with Cloudinary */
function ImgBox({ bg }: { bg?: string }) {
  return bg ? (
    <div
      className="w-[44px] h-[44px] rounded-[10px] shrink-0 shadow-soft"
      style={{ background: bg }}
    />
  ) : (
    <button
      type="button"
      title="Add photo"
      className="w-[44px] h-[44px] rounded-[10px] shrink-0 border-[1.5px] border-dashed border-orchid-mid grid place-items-center text-orchid bg-white/70 hover:bg-orchid-soft transition-colors"
    >
      <Icon name="plus" size={17} />
    </button>
  );
}

/*  the real photo when there is one; the coloured tile only for a product
    that truly has none (owner, 9 Aug 2026 — every list showed colour boxes
    for products whose photos were sitting right there)  */
function Thumb({ slug, imageUrl, size = 40 }: { slug: string; imageUrl?: string | null; size?: number }) {
  return (
    <div
      className="rounded-[10px] shrink-0 shadow-soft"
      style={{
        background: imageUrl ? `url(${imageUrl}) center/cover no-repeat` : genBg(slug),
        width: size,
        height: size,
      }}
    />
  );
}

/* ---------------- catalog hook (API → demo fallback) ---------------- */
function useCatalog() {
  const [items, setItems] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*  6 Aug 2026 — demo fallback removed on the owner's order: an emptied
      catalog was answered with fake products, which reads as "delete is
      broken". Empty is empty; unreachable says so.  */
  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await listProducts();
      setItems(res.items);
      setDemo(false);
    } catch {
      setItems([]);
      setDemo(false);
      setError("Could not reach the API — nothing is shown rather than demo data.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  /** patch one product — API when live, memory when demo */
  async function patch(id: string, body: Record<string, unknown>) {
    if (!demo) await updateProduct(id, body);
    setItems((prev) =>
      prev.map((x) => (x.id === id ? { ...x, ...(body as Partial<ApiProduct>) } : x)),
    );
  }

  return { items, setItems, loading, demo, error, setError, reload: load, patch };
}

const marginOf = (p: ApiProduct) => p.offerPricePaisa - p.costPaisa;
const marginPctOf = (p: ApiProduct) =>
  p.offerPricePaisa > 0 ? Math.round((marginOf(p) / p.offerPricePaisa) * 100) : 0;

/* ================= 1 · OVERVIEW ================= */
export function ProductsOverview() {
  const { items, loading, demo } = useCatalog();

  /* extras (add-ons / upgrades / variant templates) — live counts from the
     master data, so the overview reflects the whole module, not just products. */
  const [extras, setExtras] = useState<{ addons: number; groups: number; rules: number; variants: number } | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([getAddOns().catch(() => null), getVariantAttributes().catch(() => null)]).then(([b, v]) => {
      if (!alive) return;
      setExtras({
        addons: b ? b.addons.filter((a) => a.isActive).length : 0,
        groups: b ? b.groups.length : 0,
        rules: b ? b.rules.filter((r) => r.isActive).length : 0,
        variants: v ? v.length : 0,
      });
    });
    return () => { alive = false; };
  }, []);
  const upgradeCount = items.filter((p) => p.upgradeOfProductId).length;
  const productsWithUpgrade = new Set(items.filter((p) => p.upgradeOfProductId).map((p) => p.upgradeOfProductId)).size;

  const s = useMemo(() => {
    const published = items.filter((p) => p.isPublished);
    const drafts = items.filter((p) => !p.isPublished);
    const oos = items.filter((p) => p.stockQty <= 0);
    const low = items.filter((p) => p.stockQty > 0 && p.stockQty <= 5);
    const nation = items.filter((p) => p.zone === "NATIONWIDE");
    const withCost = items.filter((p) => p.costPaisa > 0);
    const avgMargin = withCost.length
      ? Math.round(withCost.reduce((x, p) => x + marginPctOf(p), 0) / withCost.length)
      : 0;
    const negative = withCost.filter((p) => marginOf(p) < 0);
    return {
      published,
      drafts,
      oos,
      low,
      nation,
      avgMargin,
      negative,
      sold: items.reduce((x, p) => x + p.salesCount, 0),
      value: items.reduce((x, p) => x + p.offerPricePaisa * Math.max(0, p.stockQty), 0),
      noCost: items.filter((p) => p.costPaisa <= 0),
      noTags: items.filter((p) => (p.tags?.length ?? 0) === 0),
    };
  }, [items]);

  const top = useMemo(
    () => [...items].sort((a, b) => b.salesCount - a.salesCount).slice(0, 5),
    [items],
  );
  const lowStock = useMemo(
    () => [...items].sort((a, b) => a.stockQty - b.stockQty).slice(0, 5),
    [items],
  );
  const worst = useMemo(
    () =>
      [...items]
        .filter((p) => p.costPaisa > 0)
        .sort((a, b) => marginPctOf(a) - marginPctOf(b))
        .slice(0, 5),
    [items],
  );

  return (
    <div className={WRAP}>
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <PageHead
          eyebrow="Product Management · overview"
          title="Product Overview"
          demo={demo}
        >
          Your whole catalog at a glance — what sells, what is stuck, and where
          money is leaking.
        </PageHead>
        <Link
          href="/products/new"
          className="bg-purple hover:bg-purple-deep text-white text-[14px] font-medium px-5 py-3 rounded-[12px] inline-flex items-center gap-2 shadow-soft transition-colors"
        >
          <Icon name="plus" size={18} /> Add product
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
        <Kpi n={loading ? "…" : String(items.length)} l="Total products" hue="purple" icon="box" />
        <Kpi n={String(s.published.length)} l="Published" hue="green" icon="check" />
        <Kpi n={String(s.drafts.length)} l="Drafts" hue="amber" icon="edit" />
        <Kpi n={String(s.oos.length)} l="Out of stock" hue="red" icon="bolt" />
        <Kpi n={String(s.low.length)} l="Low stock (≤5)" hue="rose" icon="layers" />
        <Kpi n={String(s.nation.length)} l="Ships nationwide" hue="blue" icon="truck" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3 mb-6">
        <Kpi n={`${s.avgMargin}%`} l="Average margin" hue={s.avgMargin < 20 ? "amber" : "teal"} icon="cash" />
        <Kpi n={String(s.negative.length)} l="Selling at a loss" hue={s.negative.length ? "red" : "green"} icon="shield" />
        <Kpi n={String(s.sold)} l="Total units sold" hue="orchid" icon="star" />
        <Kpi n={formatTaka(s.value)} l="Stock value" hue="purple" icon="tag" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 2xl:gap-5 mb-4">
        <Card title="Top sellers" sub="Most units sold">
          <MiniList rows={top} right={(p) => `${p.salesCount} sold`} empty={loading ? "loading…" : "—"} />
        </Card>
        <Card title="Running out" sub="Lowest stock first">
          <MiniList
            rows={lowStock}
            right={(p) => `${p.stockQty} left`}
            tone={(p) => (p.stockQty <= 0 ? "danger" : p.stockQty <= 5 ? "warn" : undefined)}
            empty={loading ? "loading…" : "—"}
          />
        </Card>
        <Card title="Thinnest margin" sub="Check price or cost">
          <MiniList
            rows={worst}
            right={(p) => `${marginPctOf(p)}%`}
            tone={(p) => (marginOf(p) < 0 ? "danger" : marginPctOf(p) < 20 ? "warn" : undefined)}
            empty={loading ? "loading…" : "Add cost prices"}
          />
        </Card>
      </div>

      <Card title="Extras at a glance" sub="Add-ons, upgrades and variant templates — tap to manage">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <ExtraTile href="/products/addons" icon="tag" n={extras ? extras.addons : "…"} l="Live add-ons" sub={extras ? `${extras.groups} groups · ${extras.rules} rules` : ""} />
          <ExtraTile href="/products/addons" icon="bolt" n={extras ? extras.rules : "…"} l="Active auto-rules" sub="attach add-ons by condition" />
          <ExtraTile href="/products/upgrades" icon="box" n={upgradeCount} l="Upgrade products" sub={`${productsWithUpgrade} product${productsWithUpgrade === 1 ? "" : "s"} offer one`} />
          <ExtraTile href="/products/variants" icon="sparkle" n={extras ? extras.variants : "…"} l="Variant templates" sub="colour · flavour · size" />
          <ExtraTile href="/products/funnel" icon="chart" n={s.published.length} l="Live on funnel" sub="see where money leaks" />
        </div>
      </Card>

      <Card title="Needs your attention" sub="Click a tile to go fix it">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Attn n={s.oos.length} l="Out of stock" href="/products/stock" tone="danger" />
          <Attn n={s.drafts.length} l="Still drafts" href="/products/list" tone="warn" />
          <Attn n={s.negative.length} l="Negative margin" href="/products/margin" tone="danger" />
          <Attn n={s.noCost.length + s.noTags.length} l="Incomplete info" href="/products/health" tone="warn" />
        </div>
      </Card>
    </div>
  );
}

function MiniList({
  rows,
  right,
  tone,
  empty,
}: {
  rows: ApiProduct[];
  right: (p: ApiProduct) => string;
  tone?: (p: ApiProduct) => "warn" | "danger" | undefined;
  empty: string;
}) {
  if (rows.length === 0)
    return <div className="text-[13px] text-body-soft py-2">{empty}</div>;
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((p) => {
        const t = tone?.(p);
        const c = t === "danger" ? "text-[#c0392b]" : t === "warn" ? "text-[#b45309]" : "text-purple";
        return (
          <Link
            key={p.id}
            href={`/products/${p.slug}`}
            className="flex items-center gap-3 hover:bg-lavender/60 rounded-[10px] -mx-1.5 px-1.5 py-1 transition-colors"
          >
            <Thumb slug={p.slug} imageUrl={p.images?.[0]?.url} size={34} />
            <span className="flex-1 min-w-0 text-[13px] text-body truncate">{p.name}</span>
            <span className={`text-[12.5px] font-semibold shrink-0 ${c}`}>{right(p)}</span>
          </Link>
        );
      })}
    </div>
  );
}

function ExtraTile({
  href,
  icon,
  n,
  l,
  sub,
}: {
  href: string;
  icon: string;
  n: number | string;
  l: string;
  sub?: string;
}) {
  return (
    <Link
      href={href}
      className="border border-lavender-deep bg-white rounded-[14px] px-4 py-3.5 block hover:border-orchid hover:shadow-soft transition-all"
    >
      <div className="flex items-center gap-2 text-orchid mb-1.5">
        <Icon name={icon} size={17} />
        <span className="text-[24px] font-medium font-display leading-none text-purple">{n}</span>
      </div>
      <div className="text-[12.5px] font-semibold text-body">{l}</div>
      {sub && <div className="text-[13px] text-body-soft mt-0.5 leading-snug">{sub}</div>}
    </Link>
  );
}

function Attn({
  n,
  l,
  href,
  tone,
}: {
  n: number;
  l: string;
  href: string;
  tone: "warn" | "danger";
}) {
  const c = !n
    ? "text-[#0f7d55] bg-[#e8f6ef] border-[#bfe3d2]"
    : tone === "danger"
      ? "text-[#c0392b] bg-[#fdecea] border-[#e0a1a1]"
      : "text-[#b45309] bg-[#fff8ec] border-[#f0c88a]";
  return (
    <Link href={href} className={`border rounded-[14px] px-4 py-3.5 block hover:opacity-80 ${c}`}>
      <div className="text-[24px] font-medium font-display leading-none">{n}</div>
      <div className="text-[12px] mt-1.5 font-medium">{l}</div>
    </Link>
  );
}

/* ================= 2 · STOCK BOARD ================= */
export function StockBoard() {
  const { items, setItems, loading, demo, patch } = useCatalog();
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [q, setQ] = useState("");

  const rows = useMemo(
    () =>
      items
        .filter((p) => {
          const okQ = !q || p.name.toLowerCase().includes(q.toLowerCase());
          const okF =
            filter === "all"
              ? true
              : filter === "out"
                ? p.stockQty <= 0
                : p.stockQty > 0 && p.stockQty <= 5;
          return okQ && okF;
        })
        .sort((a, b) => a.stockQty - b.stockQty),
    [items, q, filter],
  );

  const setStock = (p: ApiProduct, qty: number) =>
    patch(p.id, { stockQty: Math.max(0, qty) }).catch((e) =>
      alert("Could not save: " + (e instanceof Error ? e.message : e)),
    );

  const out = items.filter((p) => p.stockQty <= 0).length;
  const low = items.filter((p) => p.stockQty > 0 && p.stockQty <= 5).length;

  return (
    <div className={WRAP}>
      <PageHead eyebrow="Product Management · stock" title="Stock Board" demo={demo}>
        Set stock for every product in one place, without opening each one.
      </PageHead>

      <HowTo>
        <b>How to read this:</b> the number is how many you can still sell. Use −
        / + or type a number — it saves as soon as you leave the box. Each order
        drops it by 1 automatically. <b>Show on site</b> off means the customer
        never sees a number, but the product still sells.
      </HowTo>

      <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3 mb-5">
        <Kpi n={String(items.length)} l="Products" hue="purple" icon="box" />
        <Kpi n={String(out)} l="Out of stock" hue="red" icon="bolt" />
        <Kpi n={String(low)} l="Low (≤5)" hue="amber" icon="layers" />
        <Kpi
          n={String(items.reduce((x, p) => x + Math.max(0, p.stockQty), 0))}
          l="Units on hand"
          hue="teal"
          icon="grid"
        />
      </div>

      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <div className="relative max-w-[300px] w-full">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft">
            <Icon name="search" size={18} />
          </span>
          <input
            className="ipt ipt-icon h-[44px]"
            placeholder="Search product…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="inline-flex bg-lavender rounded-[11px] p-1 gap-1">
          {(["all", "low", "out"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[12.5px] font-semibold px-3.5 py-2 rounded-[9px] transition-colors ${filter === f ? "bg-white text-purple shadow-soft" : "text-body-soft hover:text-purple"}`}
            >
              {f === "all" ? "All" : f === "low" ? "Low stock" : "Out of stock"}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-body-soft ml-auto">
          {loading ? "loading…" : `${rows.length} shown`}
        </span>
      </div>

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
              <th className="text-left font-medium px-4 py-3">Product</th>
              <th className="text-left font-medium px-4 py-3">Category</th>
              <th className="text-left font-medium px-4 py-3">Sold</th>
              <th className="text-left font-medium px-4 py-3">Stock left</th>
              <th className="text-left font-medium px-4 py-3">Show on site</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-lavender/70 border-t border-lavender-deep">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Thumb slug={p.slug} imageUrl={p.images?.[0]?.url} />
                    <Link href={`/products/${p.slug}`} className="font-medium text-purple hover:underline">
                      {p.name}
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-3 text-body-soft">{p.category?.name ?? "—"}</td>
                <td className="px-4 py-3 text-body-soft">{p.salesCount}</td>
                <td className="px-4 py-3">
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      onClick={() => setStock(p, p.stockQty - 1)}
                      className="w-[30px] h-[30px] rounded-[9px] border border-lavender-deep bg-white text-purple hover:border-orchid"
                    >
                      −
                    </button>
                    <input
                      className="ipt text-center"
                      style={{ width: 74, minHeight: 34 }}
                      value={p.stockQty}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) =>
                            x.id === p.id ? { ...x, stockQty: Number(e.target.value) || 0 } : x,
                          ),
                        )
                      }
                      onBlur={(e) => setStock(p, Number(e.target.value) || 0)}
                    />
                    <button
                      onClick={() => setStock(p, p.stockQty + 1)}
                      className="w-[30px] h-[30px] rounded-[9px] border border-lavender-deep bg-white text-purple hover:border-orchid"
                    >
                      +
                    </button>
                    {p.stockQty <= 0 && (
                      <span className="text-[11px] font-bold text-[#c0392b] ml-1">OUT</span>
                    )}
                    {p.stockQty > 0 && p.stockQty <= 5 && (
                      <span className="text-[11px] font-bold text-[#b45309] ml-1">LOW</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => patch(p.id, { showStock: !p.showStock })}
                    className={`w-[38px] h-[22px] rounded-full relative transition-colors ${p.showStock ? "bg-[#0f7d55]" : "bg-[#cdbfda]"}`}
                  >
                    <span
                      className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-all ${p.showStock ? "left-[18px]" : "left-[2px]"}`}
                    />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= 3 · PRICE & MARGIN ================= */
export function MarginBoard() {
  const { items, setItems, loading, demo, patch } = useCatalog();
  const [q, setQ] = useState("");
  const [onlyRisk, setOnlyRisk] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  /* type freely, save on blur — same pattern as the stock board */
  const typeLocal = (id: string, patchObj: Partial<ApiProduct>) =>
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patchObj } : x)));
  async function commit(id: string, body: Record<string, unknown>) {
    try {
      await patch(id, body);
      setSaved(id);
      setTimeout(() => setSaved((v) => (v === id ? null : v)), 1200);
    } catch (e) {
      alert("Could not save: " + (e instanceof Error ? e.message : e));
    }
  }

  const rows = useMemo(
    () =>
      items
        .filter((p) => {
          const okQ = !q || p.name.toLowerCase().includes(q.toLowerCase());
          const risk = p.costPaisa <= 0 || marginPctOf(p) < 20;
          return okQ && (!onlyRisk || risk);
        })
        .sort((a, b) => marginPctOf(a) - marginPctOf(b)),
    [items, q, onlyRisk],
  );

  const withCost = items.filter((p) => p.costPaisa > 0);
  const avg = withCost.length
    ? Math.round(withCost.reduce((x, p) => x + marginPctOf(p), 0) / withCost.length)
    : 0;
  const negative = withCost.filter((p) => marginOf(p) < 0).length;
  const noCost = items.filter((p) => p.costPaisa <= 0).length;
  const profit = items.reduce(
    (x, p) => x + (p.costPaisa > 0 ? marginOf(p) * p.salesCount : 0),
    0,
  );

  return (
    <div className={WRAP}>
      <PageHead eyebrow="Product Management · money" title="Price & Margin" demo={demo}>
        Cost against selling price for the whole catalog — so nothing quietly
        sells at a loss.
      </PageHead>

      <HowTo>
        <b>How to read this:</b> <b>Cost</b> = what you pay. <b>Customer pays</b>{" "}
        = price after any product discount. <b>Margin</b> = what is left for
        Radian. Green is healthy, amber is thin (under 20%), red means you lose
        money on every sale. Coupons are separate — they live in Offers.
      </HowTo>

      <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3 mb-5">
        <Kpi n={`${avg}%`} l="Average margin" hue={avg < 20 ? "amber" : "teal"} icon="cash" />
        <Kpi n={String(negative)} l="Selling at a loss" hue={negative ? "red" : "green"} icon="shield" />
        <Kpi n={String(noCost)} l="No cost entered" hue={noCost ? "amber" : "green"} icon="edit" />
        <Kpi n={formatTaka(profit)} l="Gross profit so far" hue="purple" icon="star" />
      </div>

      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <div className="relative max-w-[300px] w-full">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft">
            <Icon name="search" size={18} />
          </span>
          <input
            className="ipt ipt-icon h-[44px]"
            placeholder="Search product…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button
          onClick={() => setOnlyRisk(!onlyRisk)}
          className={`text-[12.5px] font-semibold px-4 py-2.5 rounded-[11px] border transition-colors ${onlyRisk ? "bg-purple border-purple text-white" : "bg-white border-lavender-deep text-purple hover:border-orchid"}`}
        >
          Only problems
        </button>
        <span className="text-[13px] text-body-soft ml-auto">
          {loading ? "loading…" : `${rows.length} shown`}
        </span>
      </div>

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
              <th className="text-left font-medium px-4 py-3">Product</th>
              <th className="text-left font-medium px-4 py-3">Cost (edit)</th>
              <th className="text-left font-medium px-4 py-3">Price (edit)</th>
              <th className="text-left font-medium px-4 py-3">Margin</th>
              <th className="text-left font-medium px-4 py-3 w-[190px]">Health</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const m = marginOf(p);
              const pct = marginPctOf(p);
              const noC = p.costPaisa <= 0;
              const c = noC
                ? "text-body-soft"
                : m < 0
                  ? "text-[#c0392b]"
                  : pct < 20
                    ? "text-[#b45309]"
                    : "text-[#0f7d55]";
              const bar = noC ? 0 : Math.max(0, Math.min(100, pct));
              return (
                <tr key={p.id} className="hover:bg-lavender/70 border-t border-lavender-deep">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Thumb slug={p.slug} imageUrl={p.images?.[0]?.url} />
                      <div>
                        <Link href={`/products/${p.slug}`} className="font-medium text-purple hover:underline block">
                          {p.name}
                        </Link>
                        <span className="text-[13px] text-body-soft">
                          was {formatTaka(p.sellingPricePaisa)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] text-body-soft">৳</span>
                      <input
                        className="ipt"
                        style={{ width: 92, minHeight: 34, borderColor: noC ? "#f0c88a" : undefined }}
                        type="number"
                        placeholder="not set"
                        value={p.costPaisa ? Math.round(p.costPaisa / 100) : ""}
                        onChange={(e) => typeLocal(p.id, { costPaisa: (Number(e.target.value) || 0) * 100 })}
                        onBlur={(e) => commit(p.id, { costPaisa: (Number(e.target.value) || 0) * 100 })}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] text-body-soft">৳</span>
                      <input
                        className="ipt"
                        style={{ width: 100, minHeight: 34 }}
                        type="number"
                        title="Selling price — what the customer pays is this minus any discount"
                        value={Math.round(p.sellingPricePaisa / 100)}
                        onChange={(e) => typeLocal(p.id, { sellingPricePaisa: (Number(e.target.value) || 0) * 100 })}
                        onBlur={(e) => commit(p.id, { sellingPricePaisa: (Number(e.target.value) || 0) * 100 })}
                      />
                      {saved === p.id && <span className="text-[#0f7d55]"><Icon name="check" size={15} /></span>}
                    </div>
                    <span className="text-[13px] text-body-soft">pays {formatTaka(p.offerPricePaisa)}</span>
                  </td>
                  <td className={`px-4 py-3 font-semibold ${c}`}>
                    {noC ? "—" : `${formatTaka(m)} · ${pct}%`}
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-[8px] rounded-full bg-lavender-deep/60 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${m < 0 ? "bg-[#c0392b]" : pct < 20 ? "bg-[#e29a34]" : "bg-[#0f7d55]"}`}
                        style={{ width: `${bar}%` }}
                      />
                    </div>
                    <span className={`text-[11px] font-semibold ${c}`}>
                      {noC ? "add cost to measure" : m < 0 ? "losing money" : pct < 20 ? "thin" : "healthy"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= 4 · PRODUCT HEALTH ================= */
const CHECKS = [
  { key: "cat", label: "Category", ok: (p: ApiProduct) => !!p.category },
  { key: "tags", label: "Tags", ok: (p: ApiProduct) => (p.tags?.length ?? 0) > 0 },
  { key: "cost", label: "Cost price", ok: (p: ApiProduct) => p.costPaisa > 0 },
  { key: "price", label: "Selling price", ok: (p: ApiProduct) => p.sellingPricePaisa > 0 },
  { key: "stock", label: "In stock", ok: (p: ApiProduct) => p.stockQty > 0 },
  { key: "pub", label: "Published", ok: (p: ApiProduct) => p.isPublished },
];

export function HealthBoard() {
  const { items, loading, demo } = useCatalog();
  const [onlyBad, setOnlyBad] = useState(true);

  const scored = useMemo(
    () =>
      items
        .map((p) => {
          const failed = CHECKS.filter((c) => !c.ok(p));
          return { p, failed, pct: Math.round(((CHECKS.length - failed.length) / CHECKS.length) * 100) };
        })
        .sort((a, b) => a.pct - b.pct),
    [items],
  );
  const rows = onlyBad ? scored.filter((r) => r.failed.length > 0) : scored;
  const perfect = scored.filter((r) => r.failed.length === 0).length;
  const avg = scored.length ? Math.round(scored.reduce((x, r) => x + r.pct, 0) / scored.length) : 0;

  return (
    <div className={WRAP}>
      <PageHead eyebrow="Product Management · quality" title="Product Health" demo={demo}>
        Which products are missing something before they are ready to sell.
      </PageHead>

      <HowTo>
        <b>How to read this:</b> each product is checked on {CHECKS.length} basics.
        Green chip = done, red chip = missing. Click the product name to fix it.
        100% means it is ready for the storefront.
      </HowTo>

      <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3 mb-5">
        <Kpi n={`${avg}%`} l="Catalog completeness" hue={avg >= 80 ? "green" : "amber"} icon="check" />
        <Kpi n={String(perfect)} l="Fully complete" hue="teal" icon="shield" />
        <Kpi n={String(scored.length - perfect)} l="Need work" hue="amber" icon="edit" />
        <Kpi n={String(items.length)} l="Products" hue="purple" icon="box" />
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setOnlyBad(!onlyBad)}
          className={`text-[12.5px] font-semibold px-4 py-2.5 rounded-[11px] border transition-colors ${onlyBad ? "bg-purple border-purple text-white" : "bg-white border-lavender-deep text-purple hover:border-orchid"}`}
        >
          Only incomplete
        </button>
        <span className="text-[13px] text-body-soft ml-auto">
          {loading ? "loading…" : `${rows.length} shown`}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {rows.map(({ p, pct }) => (
          <div
            key={p.id}
            className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-4 py-3.5 flex items-center gap-4 flex-wrap"
          >
            <Thumb slug={p.slug} imageUrl={p.images?.[0]?.url} size={44} />
            <div className="min-w-[170px] flex-1">
              <Link href={`/products/${p.slug}`} className="font-medium text-purple hover:underline block">
                {p.name}
              </Link>
              <span className="text-[13px] text-body-soft">{p.category?.name ?? "no category"}</span>
            </div>
            <div className="flex gap-1.5 flex-wrap flex-1">
              {CHECKS.map((c) => {
                const ok = c.ok(p);
                return (
                  <span
                    key={c.key}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${ok ? "bg-[#e8f6ef] text-[#0f7d55]" : "bg-[#fdecea] text-[#c0392b]"}`}
                  >
                    {ok ? "✓" : "✕"} {c.label}
                  </span>
                );
              })}
            </div>
            <div
              className={`text-[18px] font-display font-medium shrink-0 ${pct === 100 ? "text-[#0f7d55]" : pct >= 70 ? "text-[#b45309]" : "text-[#c0392b]"}`}
            >
              {pct}%
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-4 py-12 text-center text-body-soft text-[13px]">
            {loading ? "loading…" : "Every product is complete."}
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= 5 · BULK ACTIONS ================= */
export function BulkActions() {
  const { items, setItems, loading, demo, patch } = useCatalog();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [pctChange, setPctChange] = useState("10");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importName, setImportName] = useState("");
  const [importError, setImportError] = useState("");

  const rows = useMemo(
    () => items.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())),
    [items, q],
  );
  const chosen = items.filter((p) => sel.has(p.id));
  const allShown = rows.length > 0 && rows.every((p) => sel.has(p.id));
  const pct = Number(pctChange) || 0;

  async function run(label: string, body: (p: ApiProduct) => Record<string, unknown>) {
    if (!chosen.length) return;
    if (!confirm(`${label} — ${chosen.length} product(s)?`)) return;
    setBusy(true);
    setDone("");
    try {
      for (const p of chosen) await patch(p.id, body(p));
      setDone(`${label} applied to ${chosen.length} product(s).`);
      setSel(new Set());
    } catch (e) {
      alert("Bulk action failed: " + (e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "text-[13px] font-semibold px-4 py-2.5 rounded-[11px] bg-white border border-lavender-deep text-purple disabled:opacity-40 hover:border-orchid";

  /* ---------------- CSV import / export ----------------
     SKU is the key that links a spreadsheet row back to a product, so it is
     never editable through import. Everything is previewed before it saves. */
  /* offerPriceTk is DERIVED (selling − discount) — the API has no such field,
     so it is exported for reading only and ignored on upload. To change what a
     customer pays, edit discountType / discountValue instead. */
  const CSV_COLS = [
    "sku", "name", "sellingPriceTk", "costTk", "discountType", "discountValue",
    "stockQty", "zone", "productType", "isPublished", "offerPriceTk_readonly",
  ] as const;
  type CsvCol = (typeof CSV_COLS)[number];

  const csvValueOf = (p: ApiProduct, c: CsvCol): string =>
    c === "sku" ? p.sku ?? ""
    : c === "name" ? p.name
    : c === "sellingPriceTk" ? String(Math.round(p.sellingPricePaisa / 100))
    : c === "costTk" ? String(Math.round(p.costPaisa / 100))
    : c === "discountType" ? p.discountType
    /* PERCENT is stored as basis points (1000 = 10%) — the spreadsheet shows
       plain percent, and import converts it back. FLAT is shown in taka. */
    : c === "discountValue"
      ? p.discountType === "PERCENT"
        ? String(p.discountValue / 100)
        : p.discountType === "FLAT"
          ? String(Math.round(p.discountValue / 100))
          : "0"
    : c === "stockQty" ? String(p.stockQty)
    : c === "zone" ? p.zone
    : c === "productType" ? p.productType
    : c === "isPublished" ? (p.isPublished ? "yes" : "no")
    : String(Math.round(p.offerPricePaisa / 100));

  function exportCsv(list: ApiProduct[], filename: string) {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [CSV_COLS.join(",")];
    list.forEach((p) => lines.push(CSV_COLS.map((c) => esc(csvValueOf(p, c))).join(",")));
    if (!list.length) lines.push(CSV_COLS.map(() => "").join(",")); // blank template row
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** tiny CSV reader — handles quoted fields and commas inside them */
  function parseCsv(text: string): string[][] {
    const out: string[][] = [];
    let row: string[] = [], cell = "", inQ = false;
    const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (inQ) {
        if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
        else cell += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); out.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); out.push(row); }
    return out.filter((r) => r.some((c) => c.trim()));
  }

  interface ImportRow {
    line: number;
    sku: string;
    product?: ApiProduct;
    changes: { field: string; from: string; to: string; body: Record<string, unknown> }[];
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setImportError("");
    setImportName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const grid = parseCsv(String(reader.result));
        if (grid.length < 2) { setImportError("The file has a header but no rows."); setImportRows([]); return; }
        const head = grid[0].map((h) => h.trim());
        if (!head.includes("sku")) { setImportError("No 'sku' column found. Download the template and use that."); setImportRows([]); return; }
        const idx = (c: string) => head.indexOf(c);
        const rows: ImportRow[] = grid.slice(1).map((cells, i) => {
          const sku = (cells[idx("sku")] ?? "").trim();
          const product = items.find((p) => (p.sku ?? "").trim().toUpperCase() === sku.toUpperCase() && sku);
          const changes: ImportRow["changes"] = [];
          if (product) {
            const put = (col: CsvCol, label: string, to: string, body: Record<string, unknown>) => {
              const from = csvValueOf(product, col);
              if (to !== "" && to !== from) changes.push({ field: label, from, to, body });
            };
            const at = (c: string) => (idx(c) >= 0 ? (cells[idx(c)] ?? "").trim() : "");
            if (at("name")) put("name", "name", at("name"), { name: at("name") });
            if (at("sellingPriceTk")) put("sellingPriceTk", "price", at("sellingPriceTk"), { sellingPricePaisa: Number(at("sellingPriceTk")) * 100 });
            if (at("costTk")) put("costTk", "cost", at("costTk"), { costPaisa: Number(at("costTk")) * 100 });
            const dType = at("discountType").toUpperCase();
            if (dType && ["NONE", "FLAT", "PERCENT"].includes(dType)) {
              put("discountType", "discount", dType, { discountType: dType });
            }
            if (at("discountValue")) {
              const raw = Number(at("discountValue")) || 0;
              const kind = dType || product.discountType;
              /* PERCENT → basis points, FLAT → paisa. Same rule as the editor. */
              const stored = kind === "PERCENT" ? Math.round(raw * 100) : kind === "FLAT" ? Math.round(raw * 100) : 0;
              put("discountValue", "discount value", at("discountValue"), { discountValue: stored });
            }
            if (at("stockQty")) put("stockQty", "stock", at("stockQty"), { stockQty: Number(at("stockQty")) });
            if (at("zone")) put("zone", "zone", at("zone").toUpperCase(), { zone: at("zone").toUpperCase() });
            if (at("productType")) put("productType", "type", at("productType").toUpperCase(), { productType: at("productType").toUpperCase() });
            if (at("isPublished")) {
              const yes = /^(yes|true|1|published)$/i.test(at("isPublished"));
              put("isPublished", "status", yes ? "yes" : "no", { isPublished: yes });
            }
          }
          return { line: i + 2, sku, product, changes };
        });
        setImportRows(rows);
      } catch {
        setImportError("Could not read that file. Make sure it is a CSV.");
        setImportRows([]);
      }
    };
    reader.readAsText(f);
  }

  const okRows = importRows.filter((r) => r.product && r.changes.length > 0);
  const skipRows = importRows.filter((r) => r.product && r.changes.length === 0);
  const badRows = importRows.filter((r) => !r.product);

  async function applyImport() {
    if (!okRows.length) return;
    if (!confirm(`Save changes to ${okRows.length} product(s)?`)) return;
    setBusy(true);
    setDone("");
    try {
      for (const r of okRows) {
        const body = r.changes.reduce((acc, c) => ({ ...acc, ...c.body }), {} as Record<string, unknown>);
        await patch(r.product!.id, body);
      }
      setDone(`Uploaded — ${okRows.length} product(s) updated.`);
      setImportRows([]);
      setImportName("");
    } catch (e) {
      setImportError("Upload failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className={WRAP}>
      <PageHead eyebrow="Product Management · bulk" title="Bulk Actions" demo={demo}>
        Change many products at once — publish a season, shift prices before
        Valentine&apos;s, switch delivery zone.
      </PageHead>

      <HowTo>
        <b>How to use:</b> click rows in the table to tick them, then press an
        action above. Nothing happens until you choose an action, and every
        change is confirmed first.
      </HowTo>

      {/* ---------- IMPORT / EXPORT ---------- */}
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        {/* download */}
        <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5 border-t-[5px] border-t-[#0f7d55]">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[#0f7d55]"><Icon name="download" size={18} /></span>
            <h3 className="font-display text-[16px] text-purple m-0">Download</h3>
          </div>
          <p className="text-[13px] text-body-soft mt-0 mb-3.5">
            Get a spreadsheet, edit it in Excel, then upload it back. The SKU
            column links a row to a product — never change it. The last column,{" "}
            <span className="font-mono">offerPriceTk_readonly</span>, is what the
            customer pays; it is worked out from price and discount, so edit{" "}
            <span className="font-mono">discountValue</span> to move it.
          </p>
          <div className="flex gap-2.5 flex-wrap">
            <button onClick={() => exportCsv(items, "radian-products")} className="bg-purple hover:bg-purple-deep text-white text-[13px] font-semibold px-4 py-2.5 rounded-[11px] inline-flex items-center gap-1.5">
              <Icon name="download" size={16} /> All products ({items.length})
            </button>
            <button disabled={!chosen.length} onClick={() => exportCsv(chosen, "radian-selected")} className={btn}>
              Selected only ({chosen.length})
            </button>
            <button onClick={() => exportCsv([], "radian-template")} className={btn}>
              Blank template
            </button>
          </div>
        </div>

        {/* upload */}
        <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5 border-t-[5px] border-t-[#3b5bdb]">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[#3b5bdb]"><Icon name="upload" size={18} /></span>
            <h3 className="font-display text-[16px] text-purple m-0">Upload</h3>
          </div>
          <p className="text-[13px] text-body-soft mt-0 mb-3.5">
            Pick your edited file. <b>Nothing is saved until you press Apply</b> —
            you see every change first.
          </p>
          <label className="flex flex-col items-center justify-center gap-1.5 border-[1.5px] border-dashed border-orchid-mid rounded-[14px] py-6 cursor-pointer hover:bg-orchid-soft/40 transition-colors">
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onPickFile} />
            <span className="text-orchid"><Icon name="upload" size={22} /></span>
            <span className="text-[13px] font-semibold text-purple">Choose a CSV file</span>
            <span className="text-[13px] text-body-soft">{importName || "no file chosen yet"}</span>
          </label>
          {importError && (
            <p className="text-[12.5px] text-[#c0392b] mt-3 mb-0">{importError}</p>
          )}
        </div>
      </div>

      {/* ---------- IMPORT PREVIEW ---------- */}
      {importRows.length > 0 && (
        <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-lavender-deep flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-display text-[16px] text-purple m-0">Check before saving</h3>
              <div className="text-[13px] text-body-soft mt-0.5">
                <b className="text-[#0f7d55]">{okRows.length} ready</b>
                {skipRows.length > 0 && <> · <b className="text-[#b45309]">{skipRows.length} nothing changed</b></>}
                {badRows.length > 0 && <> · <b className="text-[#c0392b]">{badRows.length} SKU not found</b></>}
              </div>
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => { setImportRows([]); setImportName(""); setImportError(""); }} className={btn}>
                Cancel
              </button>
              <button
                disabled={!okRows.length || busy}
                onClick={applyImport}
                className="bg-purple hover:bg-purple-deep text-white text-[13px] font-semibold px-4 py-2.5 rounded-[11px] disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                <Icon name="check" size={16} /> Apply {okRows.length} change{okRows.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[420px]">
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0">
                <tr className="bg-lavender/70 text-left text-[11px] uppercase tracking-[0.04em] text-body-soft">
                  <th className="px-4 py-2.5 font-semibold">Row</th>
                  <th className="px-4 py-2.5 font-semibold">SKU</th>
                  <th className="px-4 py-2.5 font-semibold">Product</th>
                  <th className="px-4 py-2.5 font-semibold">What will change</th>
                </tr>
              </thead>
              <tbody>
                {importRows.map((r) => (
                  <tr key={r.line} className="border-t border-lavender-deep align-top">
                    <td className="px-4 py-2.5 text-body-soft">{r.line}</td>
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-purple">{r.sku || "—"}</td>
                    <td className="px-4 py-2.5 text-purple">{r.product?.name ?? <span className="text-body-soft">not in catalog</span>}</td>
                    <td className="px-4 py-2.5">
                      {!r.product ? (
                        <span className="text-[11.5px] bg-[#fdecea] text-[#c0392b] px-2 py-1 rounded-full">SKU not found — row skipped</span>
                      ) : r.changes.length === 0 ? (
                        <span className="text-[11.5px] bg-lavender text-body-soft px-2 py-1 rounded-full">nothing changed</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {r.changes.map((c) => (
                            <span key={c.field} className="text-[11.5px] bg-[#eef6fd] text-[#1e4e79] border border-[#b8d4ea] px-2 py-1 rounded-full">
                              {c.field}: <s className="opacity-60">{c.from}</s> → <b>{c.to}</b>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="font-display text-[16px] text-purple m-0">
            {chosen.length} selected
          </h3>
          {chosen.length > 0 && (
            <button onClick={() => setSel(new Set())} className="text-[12.5px] font-medium text-orchid hover:text-purple">
              Clear selection
            </button>
          )}
        </div>
        <div className="flex gap-2.5 flex-wrap items-center">
          <button disabled={!chosen.length || busy} onClick={() => run("Publish", () => ({ isPublished: true }))} className="text-[13px] font-semibold px-4 py-2.5 rounded-[11px] bg-purple text-white disabled:opacity-40 hover:bg-purple-deep">
            Publish
          </button>
          <button disabled={!chosen.length || busy} onClick={() => run("Unpublish", () => ({ isPublished: false }))} className={btn}>
            Unpublish
          </button>
          <button disabled={!chosen.length || busy} onClick={() => run("Zone → Dhaka", () => ({ zone: "DHAKA" }))} className={btn}>
            Zone → Dhaka
          </button>
          <button disabled={!chosen.length || busy} onClick={() => run("Zone → Nationwide", () => ({ zone: "NATIONWIDE" }))} className={btn}>
            Zone → Nationwide
          </button>
          <span className="w-px h-7 bg-lavender-deep mx-1" />
          <input className="ipt" style={{ width: 84 }} value={pctChange} onChange={(e) => setPctChange(e.target.value)} />
          <span className="text-[13px] text-body-soft">% price</span>
          <button
            disabled={!chosen.length || busy || !pct}
            onClick={() =>
              /* offerPricePaisa is DERIVED by the API from sellingPrice + discount.
                 Sending it does nothing, so we only move the selling price and
                 let the discount carry over. */
              run(`Raise price by ${pct}%`, (p) => ({
                sellingPricePaisa: Math.round(p.sellingPricePaisa * (1 + pct / 100)),
              }))
            }
            className={btn}
          >
            Raise
          </button>
          <button
            disabled={!chosen.length || busy || !pct}
            onClick={() =>
              run(`Cut price by ${pct}%`, (p) => ({
                sellingPricePaisa: Math.round(p.sellingPricePaisa * (1 - pct / 100)),
              }))
            }
            className={btn}
          >
            Cut
          </button>
        </div>
        {busy && <p className="text-[13px] text-body-soft mt-3 mb-0">Saving…</p>}
        {done && (
          <p className="text-[12.5px] font-semibold text-[#0f7d55] mt-3 mb-0 inline-flex items-center gap-1.5">
            <Icon name="check" size={15} /> {done}
          </p>
        )}
      </div>

      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <div className="relative max-w-[300px] w-full">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft">
            <Icon name="search" size={18} />
          </span>
          <input className="ipt ipt-icon h-[44px]" placeholder="Search product…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button
          onClick={() => setSel(allShown ? new Set() : new Set(rows.map((p) => p.id)))}
          className="text-[12.5px] font-semibold px-4 py-2.5 rounded-[11px] bg-white border border-lavender-deep text-purple hover:border-orchid"
        >
          {allShown ? "Unselect all" : "Select all shown"}
        </button>
        <span className="text-[13px] text-body-soft ml-auto">
          {loading ? "loading…" : `${rows.length} products`}
        </span>
      </div>

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
              <th className="px-4 py-3 w-[44px]" />
              <th className="text-left font-medium px-4 py-3">Product</th>
              <th className="text-left font-medium px-4 py-3">Category</th>
              <th className="text-left font-medium px-4 py-3">Price</th>
              <th className="text-left font-medium px-4 py-3">Zone</th>
              <th className="text-left font-medium px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const on = sel.has(p.id);
              return (
                <tr
                  key={p.id}
                  onClick={() =>
                    setSel((s) => {
                      const n = new Set(s);
                      if (n.has(p.id)) n.delete(p.id);
                      else n.add(p.id);
                      return n;
                    })
                  }
                  className={`border-t border-lavender-deep cursor-pointer ${on ? "bg-orchid-soft/50" : "hover:bg-lavender/70"}`}
                >
                  <td className="px-4 py-3">
                    <span className={`w-[19px] h-[19px] rounded-[6px] border-[1.5px] grid place-items-center ${on ? "bg-purple border-purple text-white" : "border-lavender-deep bg-white"}`}>
                      {on && <Icon name="check" size={13} />}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Thumb slug={p.slug} imageUrl={p.images?.[0]?.url} />
                      <span className="font-medium text-purple">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-body-soft">{p.category?.name ?? "—"}</td>
                  <td className="px-4 py-3">{formatTaka(p.offerPricePaisa)}</td>
                  <td className="px-4 py-3 text-body-soft">{p.zone === "DHAKA" ? "Dhaka" : "Nationwide"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${p.isPublished ? "bg-[#e8f6ef] text-[#0f7d55]" : "bg-[#f0edf4] text-body-soft"}`}>
                      {p.isPublished ? "Published" : "Draft"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!demo && (
        <p className="text-body-soft text-[12px] mt-3.5">
          Bulk changes save one by one to the catalog and are written to the audit trail.
        </p>
      )}
    </div>
  );
}
/* ================= 6 · VARIANT ATTRIBUTES (template master) =================
   NOT a place to drag products together. This is the reusable list of option
   values — which colours exist, which flavours, sizes, weights. The product
   upload / edit page just picks from these, so nobody re-types "Red" or a hex
   code ever again. */
type VDisplay = "SWATCH" | "PHOTO" | "TEXT";
interface VValue {
  id: string;
  label: string;
  /** রঙের বিন্দু — product page-এর pill-এ এটাই দেখা যায় */
  hex?: string;
  /**
   * ছবি — category page-এর card-এ এটাই দেখা যায়।
   *
   * ⚠️ আগে ছবিটা `hex`-এর ভেতরেই ঢোকানো হতো, `url(…) center/cover` লেখা
   * হিসেবে, আর সেটা database-এ `swatch` কলামে চলে যেত। ফল: একটা মানের
   * **হয় রঙ, নয় ছবি** — দুটো একসাথে নয়। কিন্তু মালিকের দরকার ঠিক দুটোই:
   * *"product page-এ সব size আকারে দেখাব, আর ছবি দিয়ে দেখাতে চাইলে
   * category page-এ দেখাব।"* একই মান, দুই জায়গায় দুই চেহারা — তাই দুই ঘর।
   *
   * `imageUrl` কলামটা database-এ প্রথম দিন থেকেই ছিল, কেউ কখনো ভরেনি।
   */
  imageUrl?: string;
  active: boolean;
}
interface VAttribute {
  id: string;
  name: string;
  display: VDisplay;
  values: VValue[];
}
/**
 * Category page কোন চেহারায় দেখাবে।
 *
 * ⚠️ এটা আর ঠিক করে না **কী সংরক্ষণ হবে** — প্রতিটা মানের এখন রঙ আর ছবি
 * দুটোই থাকে। এটা শুধু বলে category page-এর card কোনটা আগে দেখাবে।
 * Product page সবসময় pill-ই দেখায়, ছাঁচ যাই হোক — মালিকের নিয়ম।
 */
const DISPLAY_LABEL: Record<VDisplay, string> = {
  SWATCH: "Colour",
  PHOTO: "Photo",
  TEXT: "Text",
};

/**
 * এই list-এর মানগুলো **frontend-এ কোন চেহারায় দেখা যাবে**।
 *
 * ⚠️ এটা ঠিক করে না **কী ভরা যাবে** — মালিকের চূড়ান্ত কথা, ১ আগস্ট ২০২৬:
 * *"color, image, text — তিনটাই থাকবে। যখন যেটা frontend-এ দেখাতে চাইব
 * সেটাই দেখাব।"*
 *
 * তাই প্রতিটা option-এ তিনটা ঘরই সবসময় থাকে — রঙ, ছবি, নাম। এই বোতামটা
 * শুধু **একটা switch**: আজ রঙ দেখাব, কাল ছবি। ছবি একবার তুলে রাখলে সেটা
 * বসেই থাকে, mode ফেরালেই আবার দেখা যায় — কিছু হারায় না।
 *
 * ⚠️ আমি এর আগে দুবার ভুল করেছি এখানে। প্রথমে ছবিটা রঙের কলামে ঢুকিয়েছি
 * (তখন দুটো একসাথে রাখাই যেত না), তারপর mode দিয়ে ঘর লুকিয়েছি (তখন ছবি
 * তুলতেই পারতেন না যদি না mode বদলাতেন)। দুটোই ভুল ছিল একই কারণে:
 * **সংরক্ষণ আর প্রদর্শন এক জিনিস নয়।**
 */
const DISPLAY_HINT: Record<VDisplay, string> = {
  SWATCH: "Frontend shows the colour dot.",
  PHOTO: "Frontend shows the photo — category cards use this.",
  TEXT: "Frontend shows the name only.",
};
const v = (label: string, hex?: string): VValue => ({
  id: label.toLowerCase().replace(/\s+/g, "-") + Math.random().toString(36).slice(2, 6),
  label,
  hex,
  active: true,
});

const SEED_ATTRIBUTES: VAttribute[] = [
  {
    id: "colour",
    name: "Colour",
    display: "SWATCH",
    values: [
      v("Red", "#C4172B"),
      v("Pink", "#E8A0C0"),
      v("Deep Red", "#7A0C2E"),
      v("White", "#F4F1EC"),
      v("Yellow", "#E9B93A"),
      v("Purple", "#8A45B8"),
      v("Mixed", "#C7263C"),
    ],
  },
  {
    id: "flavour",
    name: "Flavour",
    display: "PHOTO",
    values: [
      v("Chocolate"),
      v("Red Velvet"),
      v("Vanilla"),
      v("Fresh Fruit"),
      v("Black Forest"),
    ],
  },
  {
    id: "size",
    name: "Size",
    display: "TEXT",
    values: [v("Standard"), v("Large"), v("Grand")],
  },
  {
    id: "weight",
    name: "Weight",
    display: "TEXT",
    values: [v("1 lb"), v("1.5 lb"), v("2 lb"), v("3 lb")],
  },
  {
    id: "stems",
    name: "Stem count",
    display: "TEXT",
    values: [v("12 stems"), v("24 stems"), v("50 stems"), v("100 stems")],
  },
];

function fromApiAttr(a: ApiVariantAttribute): VAttribute {
  return {
    id: a.id,
    name: a.name,
    display: (a.displayMode as VDisplay) ?? "SWATCH",
    // create/update responses omit the values relation, so default to []
    values: (a.values ?? []).map((val) => ({
      id: val.id,
      label: val.label,
      hex: val.swatch ?? undefined,
      imageUrl: val.imageUrl ?? undefined,
      active: val.isActive,
    })),
  };
}
const toApiValues = (values: VValue[]) =>
  values.map((val, i) => ({
    label: val.label,
    swatch: val.hex ?? null,
    /*  ⚠️ এই লাইনটা ছিল না — তাই ছবি কোনোদিন save হয়নি। API প্রথম দিন
        থেকেই `imageUrl` নিত, পর্দা কখনো পাঠায়নি।  */
    /*  খালি লেখা মানে "মুছে দাও" — `?? null` ফাঁকা string-কে ফাঁকা string
        হিসেবেই পাঠাত, আর তখন ছবি সরানো যেত না।  */
    imageUrl: val.imageUrl?.trim() ? val.imageUrl : null,
    sortOrder: i,
    isActive: val.active,
  }));

export function VariantAttributes() {
  const [attrs, setAttrs] = useState<VAttribute[]>([]);
  const [demo, setDemo] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDisplay, setNewDisplay] = useState<VDisplay>("SWATCH");
  const [draft, setDraft] = useState<Record<string, string>>({});
  /** কোন list খোলা আছে (বাঁ পাশের তালিকা থেকে) */
  const [selId, setSelId] = useState<string | null>(null);
  /** কোন option-টা এই মুহূর্তে edit-এ আছে। null = সবগুলো শুধু দেখার। */
  const [editVal, setEditVal] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await getVariantAttributes();
        if (!alive) return;
        setAttrs(list.map(fromApiAttr));
        setDemo(false);
      } catch {
        if (!alive) return;
        setAttrs(SEED_ATTRIBUTES);
        setDemo(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  /* persist a whole attribute's value list — one call after edits settle */
  const valueTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const persistValues = (aid: string, values: VValue[]) => {
    if (demo || aid.length < 20) return; // demo/seed ids are short
    clearTimeout(valueTimers.current[aid]);
    valueTimers.current[aid] = setTimeout(() => {
      setVariantValues(aid, toApiValues(values)).catch(() => {});
    }, 500);
  };

  const setAttr = (id: string, patch: Partial<VAttribute>) =>
    setAttrs((a) =>
      a.map((x) => {
        if (x.id !== id) return x;
        const next = { ...x, ...patch };
        if (!demo && id.length >= 20 && (patch.name !== undefined || patch.display !== undefined)) {
          /*
            ⚠️ খালি নাম কখনো save হয় না — ১ আগস্ট ২০২৬-এ ঠিক এটাই ঘটেছিল।
            "Colour" list-টার নাম মুছে খালি হয়ে গিয়েছিল, আর তার সাতটা রঙ
            নিয়ে সে database-এ নামহীন বসে ছিল। নামহীন list কোথাও খুঁজে
            পাওয়া যায় না, অথচ product-গুলো তখনো তার মানগুলোর দিকেই দেখাচ্ছিল।

            প্রতিটা keystroke-এ save হয় বলে একবার select-all + delete-ই
            যথেষ্ট ছিল। ফাঁকা নাম টাইপ করতে দেওয়া হয় (নাহলে মোছা যেত না),
            শুধু পাঠানো হয় না — মালিক নতুন নাম লিখলেই সেটা যায়।
          */
          if (next.name.trim()) {
            updateVariantAttribute(id, { name: next.name.trim(), displayMode: next.display }).catch(() => {});
          }
        }
        return next;
      }),
    );
  const img = useCssImage();
  const setValue = (aid: string, vid: string, patch: Partial<VValue>) =>
    setAttrs((a) =>
      a.map((x) => {
        if (x.id !== aid) return x;
        const values = x.values.map((y) => (y.id === vid ? { ...y, ...patch } : y));
        persistValues(aid, values);
        return { ...x, values };
      }),
    );
  const addValue = (aid: string) => {
    const label = (draft[aid] ?? "").trim();
    if (!label) return;
    setAttrs((a) =>
      a.map((x) => {
        if (x.id !== aid) return x;
        const values = [...x.values, v(label, x.display === "SWATCH" ? "#CCCCCC" : undefined)];
        persistValues(aid, values);
        return { ...x, values };
      }),
    );
    setDraft((d) => ({ ...d, [aid]: "" }));
  };
  async function addAttr() {
    const n = newName.trim();
    if (!n) return;
    if (demo) {
      setAttrs((a) => [...a, { id: n.toLowerCase().replace(/\s+/g, "-"), name: n, display: newDisplay, values: [] }]);
      setNewName("");
      return;
    }
    try {
      const created = await createVariantAttribute({ name: n, displayMode: newDisplay });
      setAttrs((a) => [...a, fromApiAttr(created)]);
    } catch {
      setAttrs((a) => [...a, { id: n.toLowerCase().replace(/\s+/g, "-"), name: n, display: newDisplay, values: [] }]);
    }
    setNewName("");
  }
  function removeAttr(id: string) {
    setAttrs((a) => a.filter((x) => x.id !== id));
    if (!demo && id.length >= 20) deleteVariantAttribute(id).catch(() => {});
  }
  async function seedSamples() {
    if (demo) return;
    setSeeding(true);
    try {
      const out: VAttribute[] = [];
      for (const sa of SEED_ATTRIBUTES) {
        const created = await createVariantAttribute({ name: sa.name, displayMode: sa.display });
        const withValues = await setVariantValues(created.id, toApiValues(sa.values));
        out.push(fromApiAttr(withValues));
      }
      setAttrs(out);
    } catch {
      alert("Could not seed samples — is the API running?");
    } finally {
      setSeeding(false);
    }
  }

  const totalValues = attrs.reduce((s, a) => s + a.values.length, 0);

  /*  কোন list খোলা আছে। প্রথমবার প্রথমটাই।  */
  const openId = selId ?? attrs[0]?.id ?? null;
  const open = attrs.find((x) => x.id === openId) ?? null;

  return (
    <div className={WRAP}>
      {img.err && (
        <div className="mb-4 rounded-[12px] border border-[#f1c9c4] bg-[#fdf3f2] px-4 py-2.5 text-[13px] text-[#b42318]">
          {img.err}
        </div>
      )}

      <PageHead eyebrow="Product Management · catalog" title="Variants & options" demo={demo}>
        Build each list once. Every option can hold a colour, a photo and a
        name — the button on the right picks which one the site shows.
      </PageHead>

      {/*
        ═══════════════════════════════════════════════════════════════════════
        ⚠️ পুরো পর্দাটা নতুন করে বানানো — ১ আগস্ট ২০২৬।

        মালিক: *"এত text, পুরা page একদম white. কেমন জানি মাথা গুলিয়ে যায়।
        এটার আরও easy UI/UX চাই — যাতে কাজ করতে এসে কারো কাছে boring না
        লাগে।"*

        যা ভুল ছিল, আর সেটা text-এর পরিমাণ নয় — **গঠন**। ছয়টা list একটার
        নিচে আরেকটা, প্রতিটার প্রতিটা option একটা করে সাদা input box, আর সব
        সবসময় "লেখার" অবস্থায়। পর্দার কোথাও **দেখার** মতো কিছু ছিল না, শুধু
        ভরার মতো ঘর। তাই এতগুলো সাদা বাক্স মাথা ধরিয়ে দিত।

        এখন Delivery module-এর মতোই দুই ভাগ — বাঁয়ে তালিকা, ডানে কাজ।
        একবারে একটা list, আর তার option-গুলো তাদের **নিজের চেহারায়**:
        রঙ হলে বড় রঙের গোল, ছবি হলে ছবির টালি, লেখা হলে ছোট pill।
        সবসময় edit নয় — চাপলে তবেই edit খোলে।
        ═══════════════════════════════════════════════════════════════════════
      */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">

        {/* ── বাঁ পাশ: কোন list ── */}
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-2.5">
          {attrs.map((a) => {
            const on = a.id === openId;
            return (
              <button
                key={a.id}
                onClick={() => { setSelId(a.id); setEditVal(null); }}
                className={`w-full flex items-center gap-2.5 rounded-[11px] px-3 py-2.5 mb-1 text-left transition-colors ${
                  on ? "bg-purple text-white" : "hover:bg-lavender/70"
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-[9px] grid place-items-center shrink-0 ${
                    on ? "bg-white/20 text-white" : "bg-lavender text-purple"
                  }`}
                >
                  <Icon name={a.display === "SWATCH" ? "sparkle" : a.display === "PHOTO" ? "photo" : "hash"} size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13.5px] font-semibold truncate ${on ? "text-white" : "text-purple"}`}>
                    {a.name || "Untitled"}
                  </span>
                  <span className={`block text-[11.5px] ${on ? "text-white/70" : "text-body-soft"}`}>
                    {a.values.length} option{a.values.length === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
            );
          })}

          {/*  নতুন list — নিচে, ছোট করে। কাজের সময় এটা প্রধান জিনিস নয়।  */}
          <div className="border-t border-lavender-deep mt-2 pt-2.5 px-1">
            <input
              className="ipt h-[38px] text-[13px]"
              placeholder="New list — Scent…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addAttr()}
            />
            <div className="flex gap-1 mt-2">
              {(["SWATCH", "PHOTO", "TEXT"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setNewDisplay(d)}
                  title={DISPLAY_HINT[d]}
                  className={`flex-1 text-[11.5px] font-semibold py-1.5 rounded-[8px] transition-colors ${
                    newDisplay === d ? "bg-purple text-white" : "bg-lavender text-body-soft hover:text-purple"
                  }`}
                >
                  {DISPLAY_LABEL[d]}
                </button>
              ))}
            </div>
            <button
              onClick={addAttr}
              disabled={!newName.trim()}
              className="w-full mt-2 bg-lavender hover:bg-orchid-soft text-purple text-[12.5px] font-semibold py-2 rounded-[9px] disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
            >
              <Icon name="plus" size={14} /> Add list
            </button>
          </div>
        </div>

        {/* ── ডান পাশ: সেই list-এর option ── */}
        {!open ? (
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-16 text-center">
            <div className="font-display text-[19px] text-purple mb-1">No lists yet</div>
            <div className="text-[13px] text-body-soft mb-5 max-w-[420px] mx-auto">
              Add one on the left, or drop in a ready-made set to see how it works.
            </div>
            <button
              onClick={seedSamples}
              disabled={seeding}
              className="bg-purple hover:bg-purple-deep text-white text-[13px] font-semibold px-4 py-2.5 rounded-[11px] disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              <Icon name="sparkle" size={16} /> {seeding ? "Adding samples…" : "Load sample lists"}
            </button>
          </div>
        ) : (
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-5">
            {/* header of the open list */}
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <input
                className="ipt font-display"
                style={{ minHeight: 40, maxWidth: 240, fontSize: 17 }}
                value={open.name}
                onChange={(e) => setAttr(open.id, { name: e.target.value })}
              />
              <div className="inline-flex bg-lavender rounded-[10px] p-1 gap-1 ml-auto">
                {(["SWATCH", "PHOTO", "TEXT"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setAttr(open.id, { display: d })}
                    title={DISPLAY_HINT[d]}
                    className={`text-[12px] font-semibold px-3 py-1.5 rounded-[8px] transition-colors ${
                      open.display === d ? "bg-white text-purple shadow-soft" : "text-body-soft hover:text-purple"
                    }`}
                  >
                    {DISPLAY_LABEL[d]}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { removeAttr(open.id); setSelId(null); }}
                title="Delete this list"
                className="w-9 h-9 grid place-items-center rounded-[10px] text-body-soft hover:text-[#c0392b] hover:bg-[#fdecee]"
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
            <p className="text-[12.5px] text-body-soft mt-0 mb-4">{DISPLAY_HINT[open.display]}</p>

            {/*
              ── option-গুলো, নিজের চেহারায় ──────────────────────────────────
              ⚠️ প্রতিটা option আর একটা করে input box নয়। রঙ হলে রঙই দেখা
              যায়, ছবি হলে ছবি। চাপলে তবেই edit খোলে — তাই পর্দাটা বেশিরভাগ
              সময় **দেখার** জিনিস, ভরার নয়।
            */}
            <div className="flex flex-wrap gap-2.5">
              {open.values.map((val) => {
                const editing = editVal === val.id;
                return (
                  <div
                    key={val.id}
                    className={`rounded-[14px] border transition-colors ${
                      editing ? "border-orchid bg-orchid-soft/40" : "border-lavender-deep bg-white hover:border-orchid-mid"
                    } ${val.active ? "" : "opacity-45"}`}
                    style={{ width: open.display === "TEXT" ? 150 : 116 }}
                  >
                    <button
                      onClick={() => setEditVal(editing ? null : val.id)}
                      className="w-full p-2.5 text-left"
                    >
                      {/*
                        টালিটা **frontend যা দেখাবে** তাই দেখায় — mode অনুযায়ী।
                        কিন্তু নিচের edit-এ তিনটা ঘরই থাকে, তাই যা তোলা আছে
                        তা কখনো হারায় না।
                      */}
                      {open.display === "SWATCH" && (
                        <span
                          className="block w-full h-[54px] rounded-[10px] border border-lavender-deep"
                          style={{ background: val.hex || "#f2edf7" }}
                        />
                      )}
                      {open.display === "PHOTO" && (
                        <span
                          className="block w-full h-[54px] rounded-[10px] border border-lavender-deep bg-cover bg-center grid place-items-center text-body-soft"
                          style={val.imageUrl ? { backgroundImage: `url(${val.imageUrl})` } : { background: "#f7f2fb" }}
                        >
                          {!val.imageUrl && <Icon name="photo" size={16} />}
                        </span>
                      )}
                      {open.display === "TEXT" && (val.hex || val.imageUrl) && (
                        /*  Text mode-এ রঙ/ছবি দেখানো হয় না, কিন্তু আছে কিনা
                            বলা হয় — নাহলে মালিক ভাববেন মুছে গেছে।  */
                        <span className="flex items-center gap-1.5 mb-1">
                          {val.hex && (
                            <span className="w-3 h-3 rounded-full border border-lavender-deep" style={{ background: val.hex }} />
                          )}
                          {val.imageUrl && (
                            <span className="w-3 h-3 rounded-[3px] bg-cover bg-center border border-lavender-deep" style={{ backgroundImage: `url(${val.imageUrl})` }} />
                          )}
                          <span className="text-[10px] text-body-soft">saved</span>
                        </span>
                      )}
                      <span className="block text-[13px] font-semibold text-purple mt-2 truncate">
                        {val.label || "Untitled"}
                      </span>
                      {!val.active && (
                        <span className="block text-[11px] text-body-soft">hidden</span>
                      )}
                    </button>

                    {editing && (
                      <div className="border-t border-lavender-deep p-2.5 flex flex-col gap-2">
                        <input
                          className="ipt"
                          style={{ minHeight: 32, paddingTop: 2, paddingBottom: 2 }}
                          value={val.label}
                          onChange={(e) => setValue(open.id, val.id, { label: e.target.value })}
                        />
                        {/*
                          ⚠️ তিনটাই সবসময় — মালিক: *"color, image, text তিনটাই
                          থাকবে। যখন যেটা frontend-এ দেখাতে চাইব সেটাই দেখাব।"*

                          mode শুধু বলে **কোনটা দেখাব**, কোনটা **রাখা যাবে** তা
                          নয়। তাই Size list-এও রঙ বসানো যায় — আজ না লাগলেও কাল
                          mode বদলালেই কাজে লাগবে, আর কিছু আবার টাইপ করতে হবে না।
                        */}
                        <div className="flex gap-1.5">
                          <label
                            title="Colour"
                            className="relative flex-1 h-[30px] rounded-[8px] border border-lavender-deep cursor-pointer overflow-hidden grid place-items-center"
                            style={val.hex ? { background: val.hex } : undefined}
                          >
                            <input
                              type="color"
                              value={val.hex ?? "#cccccc"}
                              onChange={(e) => setValue(open.id, val.id, { hex: e.target.value })}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                            {!val.hex && <span className="text-[10.5px] text-body-soft">Colour</span>}
                          </label>

                          <label
                            title="Photo"
                            className="relative flex-1 h-[30px] rounded-[8px] border border-lavender-deep cursor-pointer overflow-hidden grid place-items-center bg-cover bg-center"
                            style={val.imageUrl ? { backgroundImage: `url(${val.imageUrl})` } : undefined}
                          >
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/avif"
                              className="hidden"
                              disabled={img.busyId === val.id}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = "";
                                /*  আকার নিয়ে জোর নেই — ১:১ শুধু product
                                    photo-র নিয়ম। ১ MB-র সীমা সব ছবিতে।  */
                                void img.pickUrl(val.id, f, (url) => setValue(open.id, val.id, { imageUrl: url }));
                              }}
                            />
                            {img.busyId === val.id ? (
                              <span className="text-[10px] font-bold">…</span>
                            ) : !val.imageUrl ? (
                              <span className="text-[10.5px] text-body-soft">Photo</span>
                            ) : null}
                          </label>

                          {val.imageUrl && (
                            <button
                              title="Remove photo"
                              onClick={() => setValue(open.id, val.id, { imageUrl: "" })}
                              className="w-[28px] h-[30px] grid place-items-center rounded-[8px] text-body-soft hover:text-[#c0392b] hover:bg-[#fdecee]"
                            >
                              ×
                            </button>
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setValue(open.id, val.id, { active: !val.active })}
                            className={`flex-1 text-[11.5px] font-bold py-1.5 rounded-[8px] ${
                              val.active ? "bg-[#e8f6ef] text-[#0f7d55]" : "bg-[#f0edf4] text-body-soft"
                            }`}
                          >
                            {val.active ? "ON" : "OFF"}
                          </button>
                          <button
                            onClick={() => {
                              setAttrs((x) =>
                                x.map((y) => {
                                  if (y.id !== open.id) return y;
                                  const values = y.values.filter((z) => z.id !== val.id);
                                  persistValues(open.id, values);
                                  return { ...y, values };
                                }),
                              );
                              setEditVal(null);
                            }}
                            className="w-[34px] grid place-items-center rounded-[8px] text-body-soft hover:text-[#c0392b] hover:bg-[#fdecee]"
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/*  নতুন option — একই আকারের একটা খালি টালি, তাই সারিটা ভাঙে না  */}
              <div
                className="rounded-[14px] border-[1.5px] border-dashed border-orchid-mid bg-orchid-soft/30 p-2.5 flex flex-col justify-center"
                style={{ width: open.display === "TEXT" ? 150 : 116 }}
              >
                <input
                  className="ipt text-[13px]"
                  style={{ minHeight: 34, paddingTop: 2, paddingBottom: 2 }}
                  placeholder={open.display === "SWATCH" ? "Ivory…" : open.display === "PHOTO" ? "Mango…" : "2 lb…"}
                  value={draft[open.id] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [open.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addValue(open.id)}
                />
                <button
                  onClick={() => addValue(open.id)}
                  disabled={!(draft[open.id] ?? "").trim()}
                  className="mt-2 text-[12px] font-semibold text-orchid disabled:opacity-40 inline-flex items-center justify-center gap-1"
                >
                  <Icon name="plus" size={13} /> Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= 7 · UPGRADE PRODUCTS ================= */
/* a product becomes an upgrade purely by pointing upgradeOfProductId at a base.
   so the "upgrade" a screen shows is just a real product, read through this lens. */
function productToUpgrade(p: ApiProduct): DemoUpgrade {
  return {
    id: p.id,
    baseProductId: p.upgradeOfProductId ?? "",
    linkedProductId: p.id,
    name: p.name,
    costPaisa: p.costPaisa,
    pricePaisa: p.sellingPricePaisa,
    discountType: p.discountType,
    // API stores PERCENT as basis points (1000=10%); the UI shows whole percent
    discountValue: p.discountType === "PERCENT" ? Math.round(p.discountValue / 100) : p.discountValue,
    stockQty: p.stockQty,
    active: p.isPublished,
  };
}

export function UpgradeProducts() {
  const { items, setItems, demo, patch } = useCatalog();
  const [demoUps, setDemoUps] = useState<DemoUpgrade[]>([]);
  const [base, setBase] = useState("");
  const [picker, setPicker] = useState<string | null>(null); // baseId whose picker is open
  const [pq, setPq] = useState("");
  const [tab, setTab] = useState<"setup" | "perf">("setup");
  const [days, setDays] = useState(30);

  /* demo fallback keeps the old sample behaviour so the screen is never dead */
  useEffect(() => {
    if (!items.length) return;
    setBase((b) => b || items[0].id);
    if (demo) {
      setDemoUps((prev) =>
        prev.length ? prev : DEMO_UPGRADES.map((u, i) => ({ ...u, baseProductId: items[Math.min(i, items.length - 1)].id })),
      );
    }
  }, [items, demo]);

  // real mode: the upgrades ARE the products whose upgradeOfProductId is set
  const ups: DemoUpgrade[] = demo
    ? demoUps
    : items.filter((p) => p.upgradeOfProductId).map(productToUpgrade);

  const nameOf = (id: string) => items.find((p) => p.id === id)?.name ?? "—";
  const slugOf = (id: string) => items.find((p) => p.id === id)?.slug ?? "x";
  const grouped = useMemo(() => {
    const m = new Map<string, DemoUpgrade[]>();
    ups.forEach((u) => m.set(u.baseProductId, [...(m.get(u.baseProductId) ?? []), u]));
    return [...m.entries()];
  }, [ups]);

  /** link an existing catalog product as the upgrade of a base — the whole
      feature in one PATCH. In demo mode it just stays in memory. */
  function linkExisting(baseId: string, prod: ApiProduct) {
    setPicker(null);
    if (demo) {
      setDemoUps((p) => [...p, { ...productToUpgrade(prod), baseProductId: baseId }]);
      return;
    }
    patch(prod.id, { upgradeOfProductId: baseId }).catch((e) =>
      alert("Could not link: " + (e instanceof Error ? e.message : e)),
    );
  }
  /** stop a product being an upgrade — it stays in the catalog, just unlinked */
  function unlink(u: DemoUpgrade) {
    if (demo) { setDemoUps((p) => p.filter((x) => x.id !== u.id)); return; }
    patch(u.id, { upgradeOfProductId: null }).catch(() => {});
  }

  /* editing a row edits the underlying product (the upgrade IS that product).
     debounced so typing a price does not fire a call per keystroke. */
  const upTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const set = (id: string, p: Partial<DemoUpgrade>) => {
    if (demo) { setDemoUps((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x))); return; }
    const cur = ups.find((x) => x.id === id);
    if (!cur) return;
    const next = { ...cur, ...p };
    const body: Record<string, unknown> = {};
    if (p.name !== undefined) body.name = next.name;
    if (p.costPaisa !== undefined) body.costPaisa = next.costPaisa;
    if (p.pricePaisa !== undefined) body.sellingPricePaisa = next.pricePaisa;
    if (p.active !== undefined) body.isPublished = next.active;
    if (p.discountType !== undefined || p.discountValue !== undefined) {
      body.discountType = next.discountType;
      // whole percent → basis points on the way back to the API
      body.discountValue = next.discountType === "PERCENT" ? next.discountValue * 100 : next.discountValue;
    }
    // reflect the change IMMEDIATELY on the product (ups is derived from items),
    // then debounce the API call — otherwise the field snaps back while typing.
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...body } as ApiProduct : x)));
    clearTimeout(upTimers.current[id]);
    upTimers.current[id] = setTimeout(() => { updateProduct(id, body).catch(() => {}); }, 500);
  };
  /** same discount rule as the rest of Radian: NONE | FLAT ৳ | PERCENT % */
  const paysOf = (u: DemoUpgrade) =>
    u.discountType === "PERCENT"
      ? Math.round(u.pricePaisa * (1 - (u.discountValue || 0) / 100))
      : u.discountType === "FLAT"
        ? Math.max(0, u.pricePaisa - (u.discountValue || 0))
        : u.pricePaisa;

  /* ---- performance (demo money data; real version reads OrderLine) ---- */
  const basePriceOf = (upgradeId: string) => {
    const u = ups.find((x) => x.id === upgradeId);
    const bp = u ? items.find((p) => p.id === u.baseProductId) : undefined;
    return bp ? bp.offerPricePaisa || bp.sellingPricePaisa : 0;
  };
  const upStats = demoUpgradeStats(ups, basePriceOf, days);
  const perfRows = ups
    .map((up) => {
      const stat = upStats.find((x) => x.upgradeId === up.id)!;
      const total = stat.baseOrders + stat.upgradeOrders;
      const takePct = total ? Math.round((stat.upgradeOrders / total) * 100) : 0;
      return {
        up,
        stat,
        takePct,
        delta: takePct - stat.prevTakePct,
        basePrice: basePriceOf(up.id),
        pays: paysOf(up),
      };
    })
    .sort((a, b) => b.takePct - a.takePct);
  const totalUpgradeOrders = upStats.reduce((s2, x) => s2 + x.upgradeOrders, 0);
  const totalAllOrders = upStats.reduce((s2, x) => s2 + x.baseOrders + x.upgradeOrders, 0);
  const overallTakePct = totalAllOrders ? Math.round((totalUpgradeOrders / totalAllOrders) * 100) : 0;
  const upgradeRevenue = upStats.reduce((s2, x) => s2 + x.revenuePaisa, 0);
  const totalLift = upStats.reduce((s2, x) => s2 + x.liftPaisa, 0);
  const avgLift = totalUpgradeOrders ? Math.round(totalLift / totalUpgradeOrders) : 0;
  const baseRevenue = upStats.reduce((s2, x) => {
    const bp = basePriceOf(x.upgradeId);
    return s2 + x.baseOrders * bp;
  }, 0);
  const upgradeSharePct =
    upgradeRevenue + baseRevenue > 0 ? Math.round((upgradeRevenue / (upgradeRevenue + baseRevenue)) * 100) : 0;
  const upgradeMargin = ups.reduce((s2, u) => {
    const st = upStats.find((x) => x.upgradeId === u.id);
    return s2 + (st ? st.upgradeOrders * (paysOf(u) - u.costPaisa) : 0);
  }, 0);
  const needsWork = perfRows.filter((r) => {
    const jump = r.basePrice > 0 ? ((r.pays - r.basePrice) / r.basePrice) * 100 : 0;
    return r.up.active && (r.takePct < 8 || jump > 90 || r.up.costPaisa <= 0);
  }).length;
  const byBase = grouped
    .map(([baseId, list]) => {
      const ids = list.map((u) => u.id);
      const rows2 = upStats.filter((x) => ids.includes(x.upgradeId));
      const upgradeOrders = rows2.reduce((s2, x) => s2 + x.upgradeOrders, 0);
      const baseOrders = Math.max(0, Math.round(rows2.reduce((s2, x) => s2 + x.baseOrders, 0) / Math.max(1, rows2.length)));
      return {
        baseId,
        upgradeOrders,
        baseOrders,
        total: baseOrders + upgradeOrders,
        lift: rows2.reduce((s2, x) => s2 + x.liftPaisa, 0),
      };
    })
    .sort((a, b) => b.lift - a.lift);

  return (
    <div className={WRAP}>
      <PageHead eyebrow="Product Management · catalog" title="Upgrade Products" demo={demo}>
        A bigger or premium version of a product — its own name and its own extra
        price. The customer picks it instead of the standard one.
      </PageHead>

      <HowTo>
        <b>An upgrade is a different thing, not a top-up.</b> 50 roses → 100
        roses is its own product: it carries its <b>own cost, own price, own
        discount and own margin</b>. Nothing is inherited from the product it
        upgrades, so the customer pays the upgrade&apos;s price — never base +
        extra. <br />
        <b>Add-on is the opposite:</b> a ৳500 bouquet + a ৳50 card = ৳550, added
        on top. That lives in Add-ons &amp; services.
      </HowTo>

      <div className="flex gap-2.5 rounded-[14px] border-[1.5px] border-[#b8d4ea] bg-[#eef6fd] px-4 py-3 mb-5 text-[12.5px] text-[#1e4e79]">
        <span className="shrink-0"><Icon name="shield" size={18} /></span>
        <div>
          <b>Storefront rule — an upgrade has no page of its own.</b> On the
          product page an upgrade is a <b>choice, not a link</b>: clicking it
          selects that version and updates the price, photo and stock right
          there. The customer never leaves the page and the URL never changes.
          Even when the upgrade is an existing catalog product, it is used as an
          option here — it is not opened as a separate product.
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3 mb-5">
        <Kpi n={String(ups.length)} l="Upgrades" hue="purple" icon="layers" />
        <Kpi n={String(ups.filter((u) => u.active).length)} l="Active" hue="green" icon="check" />
        <Kpi n={String(grouped.length)} l="Products with upgrades" hue="orchid" icon="box" />
        <Kpi
          n={(() => {
            const withCost = ups.filter((u) => u.costPaisa > 0);
            if (!withCost.length) return "—";
            const avg = Math.round(
              withCost.reduce((x, u) => {
                const pays = paysOf(u);
                return x + (pays > 0 ? ((pays - u.costPaisa) / pays) * 100 : 0);
              }, 0) / withCost.length,
            );
            return `${avg}%`;
          })()}
          l="Average margin"
          hue="teal"
          icon="cash"
        />
      </div>

      <div className="flex gap-1 flex-wrap mb-5 border-b border-lavender-deep">
        {([["setup", "Setup"], ["perf", "Performance"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-[13.5px] font-medium border-b-2 -mb-px ${tab === id ? "text-purple border-orchid" : "text-body-soft border-transparent hover:text-purple"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "setup" && (
        <>
      <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5 mb-4">
        <h3 className="font-display text-[16px] text-purple m-0 mb-1">Add an upgrade</h3>
        <p className="text-[13px] text-body-soft mt-0 mb-4">
          An upgrade is a real product from your catalog — pick the base, then pick
          the bigger version. Need a product that does not exist yet?{" "}
          <Link href="/products/new" className="text-orchid hover:underline">create it first</Link>.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2.5 items-center">
          <select className="ipt" value={base} onChange={(e) => setBase(e.target.value)}>
            <option value="">Choose the base product…</option>
            {items.filter((p) => !p.upgradeOfProductId).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={() => { if (base) { setPicker(picker === base ? null : base); setPq(""); } }}
            disabled={!base}
            className="bg-purple hover:bg-purple-deep text-white text-[13px] font-semibold px-4 py-2.5 rounded-[11px] disabled:opacity-40 inline-flex items-center gap-1.5 justify-center"
          >
            <Icon name="search" size={16} /> Choose the upgrade product
          </button>
        </div>

        {picker === base && base && (
          <div className="bg-lavender/60 rounded-[12px] p-3 mt-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-body-soft mb-2">
              Which product is the bigger version of <b className="text-purple">{nameOf(base)}</b>?
            </div>
            <input
              className="ipt mb-2"
              style={{ minHeight: 38 }}
              placeholder="Search product or SKU…"
              value={pq}
              onChange={(e) => setPq(e.target.value)}
            />
            <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto">
              {items
                .filter((x) => x.id !== base && !x.upgradeOfProductId)
                .filter((x) => !pq || x.name.toLowerCase().includes(pq.toLowerCase()) || (x.sku ?? "").toLowerCase().includes(pq.toLowerCase()))
                .slice(0, 40)
                .map((x) => (
                  <button
                    key={x.id}
                    onClick={() => linkExisting(base, x)}
                    className="flex items-center gap-3 bg-white border border-lavender-deep rounded-[10px] px-2.5 py-2 hover:border-orchid text-left"
                  >
                    <Thumb slug={x.slug} imageUrl={x.images?.[0]?.url} size={32} />
                    <span className="flex-1 min-w-0 text-[13px] text-purple font-medium truncate">{x.name}</span>
                    <span className="text-[13px] text-body-soft font-mono">{x.sku ?? "—"}</span>
                    <span className="text-[13px] text-body-soft">{formatTaka(x.offerPricePaisa)}</span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {grouped.map(([baseId, list]) => {
          const bp = items.find((p) => p.id === baseId);
          return (
            <div key={baseId} className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
              <div className="flex items-center gap-3 mb-4">
                <Thumb slug={slugOf(baseId)} imageUrl={items.find((p) => p.id === baseId)?.images?.[0]?.url} size={44} />
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-body-soft">Base product</div>
                  <Link href={`/products/${slugOf(baseId)}`} className="font-display text-[16px] text-purple hover:underline">
                    {nameOf(baseId)}
                  </Link>
                  {bp && (
                    <span className="text-[13px] text-body-soft ml-2">
                      {formatTaka(bp.offerPricePaisa)}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-[44px_1fr_92px_92px_136px_104px_100px_50px_40px] gap-2 px-1 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-body-soft">
                <span>Photo</span>
                <span>Upgrade name</span>
                <span>Cost ৳</span>
                <span>Price ৳</span>
                <span>Discount</span>
                <span>Pays</span>
                <span>Margin</span>
                <span>Live</span>
                <span />
              </div>
              <div className="flex flex-col gap-2.5">
                {list.map((u) => {
                  const linked = u.linkedProductId
                    ? items.find((x) => x.id === u.linkedProductId)
                    : undefined;
                  const pays = paysOf(u);
                  const margin = pays - u.costPaisa;
                  const mPct = pays > 0 ? Math.round((margin / pays) * 100) : 0;
                  const noCost = u.costPaisa <= 0;
                  return (
                    <div
                      key={u.id}
                      className={`grid grid-cols-[44px_1fr_92px_92px_136px_104px_100px_50px_40px] gap-2 items-center rounded-[12px] p-2.5 ${u.active ? "bg-lavender/50" : "bg-lavender/30 opacity-60"}`}
                    >
                      <ImgBox bg={linked ? genBg(linked.slug) : undefined} />
                      <div className="min-w-0">
                        <input
                          className="ipt"
                          style={{ minHeight: 36 }}
                          value={u.name}
                          onChange={(e) => set(u.id, { name: e.target.value })}
                        />
                        {linked && (
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            <span
                              className="text-[10px] font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded-full bg-[#eef6fd] text-[#1e4e79] border border-[#b8d4ea]"
                              title="On the website this only switches the option — it never opens its own page"
                            >
                              option only · no own page
                            </span>
                            <Link
                              href={`/products/${linked.slug}`}
                              className="text-[11px] font-semibold text-orchid hover:underline"
                              title="Admin only — edit this product in the catalog"
                            >
                              edit in catalog
                            </Link>
                          </div>
                        )}
                      </div>
                      <input
                        className="ipt"
                        style={{ minHeight: 36 }}
                        type="number"
                        value={Math.round(u.costPaisa / 100)}
                        onChange={(e) => set(u.id, { costPaisa: (Number(e.target.value) || 0) * 100 })}
                      />
                      <input
                        className="ipt"
                        style={{ minHeight: 36 }}
                        type="number"
                        value={Math.round(u.pricePaisa / 100)}
                        onChange={(e) => set(u.id, { pricePaisa: (Number(e.target.value) || 0) * 100 })}
                      />
                      <div className="grid grid-cols-[54px_1fr] gap-1">
                        <select
                          className="ipt"
                          style={{ minHeight: 36, paddingLeft: 8, paddingRight: 4 }}
                          value={u.discountType}
                          onChange={(e) =>
                            set(u.id, {
                              discountType: e.target.value as DemoUpgrade["discountType"],
                              discountValue: 0,
                            })
                          }
                        >
                          <option value="NONE">—</option>
                          <option value="FLAT">৳</option>
                          <option value="PERCENT">%</option>
                        </select>
                        <input
                          className="ipt"
                          style={{ minHeight: 36 }}
                          type="number"
                          disabled={u.discountType === "NONE"}
                          value={
                            u.discountType === "FLAT"
                              ? Math.round(u.discountValue / 100)
                              : u.discountValue
                          }
                          onChange={(e) =>
                            set(u.id, {
                              discountValue:
                                u.discountType === "FLAT"
                                  ? (Number(e.target.value) || 0) * 100
                                  : Number(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                      <div className="font-semibold text-purple text-[13.5px]">
                        {formatTaka(pays)}
                        {pays < u.pricePaisa && (
                          <div className="text-[11px] font-normal text-body-soft line-through">
                            {formatTaka(u.pricePaisa)}
                          </div>
                        )}
                      </div>
                      <div
                        className={`text-[13.5px] font-semibold ${noCost ? "text-[#b45309]" : margin < 0 ? "text-[#c0392b]" : mPct < 20 ? "text-[#b45309]" : "text-[#0f7d55]"}`}
                      >
                        {noCost ? (
                          <span className="text-[11px]">no cost</span>
                        ) : (
                          <>
                            {formatTaka(margin)}
                            <div className="text-[11px] font-normal">{mPct}%</div>
                          </>
                        )}
                      </div>
                      <button
                        onClick={() => set(u.id, { active: !u.active })}
                        title={u.active ? "Turn off" : "Turn on"}
                        className={`w-[38px] h-[22px] rounded-full relative transition-colors justify-self-start ${u.active ? "bg-[#0f7d55]" : "bg-[#cdbfda]"}`}
                      >
                        <span
                          className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-all ${u.active ? "left-[18px]" : "left-[2px]"}`}
                        />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Remove "${u.name}" as an upgrade? The product stays in your catalog.`)) unlink(u); }}
                        title="Remove as upgrade (the product itself stays)"
                        className="border border-lavender-deep bg-white text-body-soft hover:text-[#c0392b] hover:border-[#e0a1a1] rounded-[10px] w-[38px] h-[38px] grid place-items-center justify-self-end"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2.5 flex-wrap mt-3">
                <button
                  onClick={() => { setPicker(picker === baseId ? null : baseId); setPq(""); }}
                  className="border border-lavender-deep bg-white text-[13px] px-3.5 py-2 rounded-[10px] hover:border-orchid text-purple font-medium inline-flex items-center gap-1.5"
                >
                  <Icon name="plus" size={15} /> Add another upgrade to this product
                </button>
              </div>

              {picker === baseId && (
                <div className="bg-lavender/60 rounded-[12px] p-3 mt-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-body-soft mb-2">
                    Pick another product as an upgrade of <b className="text-purple">{nameOf(baseId)}</b>
                  </div>
                  <input
                    className="ipt mb-2"
                    style={{ minHeight: 38 }}
                    placeholder="Search product or SKU…"
                    value={pq}
                    onChange={(e) => setPq(e.target.value)}
                  />
                  <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto">
                    {items
                      .filter((x) => x.id !== baseId && !x.upgradeOfProductId)
                      .filter(
                        (x) =>
                          !pq ||
                          x.name.toLowerCase().includes(pq.toLowerCase()) ||
                          (x.sku ?? "").toLowerCase().includes(pq.toLowerCase()),
                      )
                      .slice(0, 40)
                      .map((x) => (
                        <button
                          key={x.id}
                          onClick={() => linkExisting(baseId, x)}
                          className="flex items-center gap-3 bg-white border border-lavender-deep rounded-[10px] px-2.5 py-2 hover:border-orchid text-left"
                        >
                          <Thumb slug={x.slug} imageUrl={x.images?.[0]?.url} size={32} />
                          <span className="flex-1 min-w-0 text-[13px] text-purple font-medium truncate">
                            {x.name}
                          </span>
                          <span className="text-[13px] text-body-soft font-mono">
                            {x.sku ?? "—"}
                          </span>
                          <span className="text-[13px] text-body-soft">
                            {formatTaka(x.offerPricePaisa)}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
        </>
      )}

      {tab === "perf" && (
        <>
          <HowTo>
            An upgrade replaces the standard product, so the question is not
            &ldquo;how much extra&rdquo; but <b>how many customers moved up</b>.
            That is the <b>take rate</b>. A high take rate with a small price gap
            means you are leaving money on the table; a very low take rate means
            the jump is too big or the upgrade is not explained well.
          </HowTo>

          <div className="flex gap-2 flex-wrap items-center mb-4">
            <div className="inline-flex rounded-[11px] border border-lavender-deep bg-white overflow-hidden">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`text-[12.5px] font-medium px-3.5 py-2 ${days === d ? "bg-purple text-white" : "text-body-soft hover:text-purple"}`}
                >
                  {d} days
                </button>
              ))}
            </div>
            <span className="text-[13px] text-body-soft">Source: own database (OrderLine)</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3 mb-3">
            <Kpi n={`${overallTakePct}%`} l="Customers who moved up" hue={overallTakePct < 10 ? "amber" : "green"} icon="star" />
            <Kpi n={formatTaka(totalLift)} l="Extra revenue from upgrades" hue="purple" icon="cash" />
            <Kpi n={formatTaka(upgradeRevenue)} l="Upgrade revenue" hue="orchid" icon="tag" />
            <Kpi n={formatTaka(avgLift)} l="Average order lift" hue="teal" icon="chart" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3 mb-5">
            <Kpi n={`${upgradeSharePct}%`} l="Share of product revenue" hue="blue" icon="chart" />
            <Kpi n={formatTaka(upgradeMargin)} l="Margin earned" hue={upgradeMargin > 0 ? "green" : "red"} icon="shield" />
            <Kpi n={`${grouped.length}/${items.length}`} l="Products with an upgrade" hue="rose" icon="box" />
            <Kpi n={String(needsWork)} l="Need attention" hue={needsWork ? "red" : "teal"} icon="bolt" />
          </div>

          {/* best and weakest, side by side */}
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            {[
              { row: perfRows[0], tone: "good" as const },
              { row: perfRows[perfRows.length - 1], tone: "bad" as const },
            ].map(({ row, tone }, i) =>
              row && perfRows.length > 1 ? (
                <div
                  key={i}
                  className="rounded-[16px] border-[1.5px] shadow-soft px-5 py-4"
                  style={{
                    borderColor: tone === "good" ? "#9fd8bf" : "#f0b8b0",
                    background: tone === "good" ? "linear-gradient(135deg,#f2fbf7,#ffffff)" : "linear-gradient(135deg,#fdf2f0,#ffffff)",
                  }}
                >
                  <div
                    className="text-[11px] font-bold uppercase tracking-[0.05em] mb-1.5"
                    style={{ color: tone === "good" ? "#0f7d55" : "#c0392b" }}
                  >
                    {tone === "good" ? "Best performer" : "Weakest link"}
                  </div>
                  <div className="font-display text-[19px] text-purple leading-tight">{row.up.name}</div>
                  <div className="text-[13px] text-body-soft mb-3">on {nameOf(row.up.baseProductId)}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ["Take rate", `${row.takePct}%`],
                      ["Price jump", `+${row.basePrice > 0 ? Math.round(((row.pays - row.basePrice) / row.basePrice) * 100) : 0}%`],
                      ["Extra earned", formatTaka(row.stat.liftPaisa)],
                    ].map(([l, v]) => (
                      <div key={l} className="bg-white/70 border border-lavender-deep rounded-[10px] px-2.5 py-2">
                        <span className="block text-[10px] uppercase tracking-[0.04em] text-body-soft">{l}</span>
                        <b className="text-[14px] text-purple">{v}</b>
                      </div>
                    ))}
                  </div>
                  <div className="text-[12px] mt-3" style={{ color: tone === "good" ? "#0f7d55" : "#c0392b" }}>
                    {tone === "good"
                      ? "Copy this pattern — same kind of jump on your other products."
                      : "Start here: shrink the jump, or show the upgrade better on the page."}
                  </div>
                </div>
              ) : null,
            )}
          </div>

          {/* where the sweet spot is */}
          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5 mb-4">
            <div className="font-display text-[15px] text-purple">Price jump vs. how many take it</div>
            <div className="text-[13px] text-body-soft mb-4">
              The gentler the jump, the more people move up. Anything past +90% rarely sells.
            </div>
            <div className="relative h-[180px] border-l border-b border-lavender-deep ml-9 mr-2">
              {/* bands */}
              <span className="absolute inset-y-0 left-0 w-[45%] bg-[#e8f6ef]/70" />
              <span className="absolute inset-y-0 left-[45%] w-[30%] bg-[#fff8ec]/70" />
              <span className="absolute inset-y-0 left-[75%] right-0 bg-[#fdecea]/70" />
              {perfRows.map((r) => {
                const jump = r.basePrice > 0 ? ((r.pays - r.basePrice) / r.basePrice) * 100 : 0;
                const x = Math.min(97, (jump / 150) * 100);
                const y = 100 - Math.min(96, r.takePct * 2.2);
                return (
                  <span
                    key={r.up.id}
                    title={`${r.up.name} — +${Math.round(jump)}% jump, ${r.takePct}% take`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-soft"
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      width: Math.max(12, Math.min(30, 12 + r.stat.upgradeOrders)),
                      height: Math.max(12, Math.min(30, 12 + r.stat.upgradeOrders)),
                      background: r.takePct >= 18 ? "#37a97c" : r.takePct >= 8 ? "#e29a34" : "#e0705f",
                    }}
                  />
                );
              })}
              <span className="absolute -left-9 top-0 text-[13px] text-body-soft">45%</span>
              <span className="absolute -left-7 bottom-0 text-[13px] text-body-soft">0%</span>
              <span className="absolute -left-9 top-1/2 -translate-y-1/2 text-[13px] text-body-soft rotate-[-90deg] origin-center">take</span>
            </div>
            <div className="flex justify-between text-[13px] text-body-soft ml-9 mr-2 mt-1">
              <span>+0%</span><span className="text-[#0f7d55]">sweet spot</span><span className="text-[#b45309]">risky</span><span className="text-[#c0392b]">too steep</span><span>+150%</span>
            </div>
            <div className="text-[13px] text-body-soft mt-2">Bubble size = how many orders took it.</div>
          </div>

          {/* per base product */}
          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5 mb-4">
            <div className="font-display text-[15px] text-purple mb-1">Standard vs. upgraded, per product</div>
            <div className="text-[13px] text-body-soft mb-4">How the orders of each product split</div>
            <div className="flex flex-col gap-3">
              {byBase.map((b) => (
                <div key={b.baseId} className="flex items-center gap-3 flex-wrap">
                  <span className="text-[13px] text-purple font-medium w-[170px] shrink-0 truncate">{nameOf(b.baseId)}</span>
                  <span className="flex h-[22px] rounded-[8px] overflow-hidden flex-1 min-w-[180px] bg-lavender">
                    <span
                      className="grid place-items-center text-[11px] font-bold text-white bg-[#c6b0dd]"
                      style={{ width: `${b.total ? (b.baseOrders / b.total) * 100 : 100}%` }}
                    >
                      {b.baseOrders > 0 && b.baseOrders}
                    </span>
                    <span
                      className="grid place-items-center text-[11px] font-bold text-white bg-gradient-to-r from-[#7d2ea8] to-[#cf43ea]"
                      style={{ width: `${b.total ? (b.upgradeOrders / b.total) * 100 : 0}%` }}
                    >
                      {b.upgradeOrders > 0 && b.upgradeOrders}
                    </span>
                  </span>
                  <span className="text-[12.5px] w-[130px] text-right shrink-0">
                    <b className="text-purple">{b.total ? Math.round((b.upgradeOrders / b.total) * 100) : 0}%</b>
                    <span className="text-body-soft"> moved up</span>
                  </span>
                  <b className="text-[13px] text-purple w-[86px] text-right shrink-0">{formatTaka(b.lift)}</b>
                </div>
              ))}
              {byBase.length === 0 && <div className="text-[13px] text-body-soft">No upgrades yet.</div>}
            </div>
            <div className="flex gap-4 mt-4 text-[13px] text-body-soft">
              <span className="inline-flex items-center gap-1.5"><span className="w-[10px] h-[10px] rounded-full bg-[#c6b0dd]" /> took the standard</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-[10px] h-[10px] rounded-full bg-[#9c1fb8]" /> moved up</span>
            </div>
          </div>

          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft overflow-hidden mb-4">
            <div className="px-5 py-3.5 border-b border-lavender-deep">
              <div className="font-display text-[15px] text-purple">Every upgrade</div>
              <div className="text-[13px] text-body-soft">Sorted by take rate — the weakest sit at the bottom</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="bg-lavender/50 text-left">
                    <th className="px-4 py-2.5 font-semibold text-[11px] uppercase tracking-[0.04em] text-body-soft">Upgrade</th>
                    <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[0.04em] text-body-soft">Take rate</th>
                    <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[0.04em] text-body-soft text-right">Price jump</th>
                    <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[0.04em] text-body-soft text-right">Standard</th>
                    <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[0.04em] text-body-soft text-right">Upgraded</th>
                    <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[0.04em] text-body-soft text-right">Extra earned</th>
                    <th className="px-4 py-2.5 font-semibold text-[11px] uppercase tracking-[0.04em] text-body-soft">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {perfRows.map(({ up, stat, takePct, delta, basePrice, pays }) => {
                    const jump = basePrice > 0 ? Math.round(((pays - basePrice) / basePrice) * 100) : 0;
                    return (
                      <tr key={up.id} className="border-t border-lavender-deep">
                        <td className="px-4 py-3">
                          <div className="font-medium text-purple">{up.name}</div>
                          <div className="text-[13px] text-body-soft truncate">on {nameOf(up.baseProductId)}</div>
                        </td>
                        <td className="px-3 py-3 min-w-[170px]">
                          <div className="flex items-center gap-2">
                            <span className="h-[7px] rounded-full bg-lavender flex-1 min-w-[60px] overflow-hidden">
                              <span
                                className={`block h-full rounded-full ${takePct < 8 ? "bg-[#e0705f]" : takePct < 18 ? "bg-[#e29a34]" : "bg-[#37a97c]"}`}
                                style={{ width: `${Math.min(100, takePct * 2.5)}%` }}
                              />
                            </span>
                            <b className="text-purple w-[38px] text-right">{takePct}%</b>
                            <span className={`text-[11px] w-[42px] ${delta >= 0 ? "text-[#0f7d55]" : "text-[#c0392b]"}`}>
                              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <b className={jump > 90 ? "text-[#c0392b]" : "text-purple"}>+{jump}%</b>
                          <div className="text-[13px] text-body-soft">{formatTaka(basePrice)} → {formatTaka(pays)}</div>
                        </td>
                        <td className="px-3 py-3 text-right">{stat.baseOrders}</td>
                        <td className="px-3 py-3 text-right font-medium text-purple">{stat.upgradeOrders}</td>
                        <td className="px-3 py-3 text-right font-medium text-purple">{formatTaka(stat.liftPaisa)}</td>
                        <td className="px-4 py-3">
                          {!up.active ? (
                            <span className="text-[11.5px] bg-lavender text-body-soft px-2 py-1 rounded-full">Off</span>
                          ) : takePct < 8 ? (
                            <span className="text-[11.5px] bg-[#fdecea] text-[#c0392b] px-2 py-1 rounded-full">
                              {jump > 90 ? "Jump too big" : "Explain it better"}
                            </span>
                          ) : takePct >= 30 ? (
                            <span className="text-[11.5px] bg-[#e8f6ef] text-[#0f7d55] px-2 py-1 rounded-full">Strong — price it higher</span>
                          ) : (
                            <span className="text-[11.5px] bg-lavender text-purple px-2 py-1 rounded-full">Doing fine</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {perfRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-body-soft text-[13px]">
                        No upgrades yet — add one in the Setup tab.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2.5 rounded-[14px] border-[1.5px] border-[#b8d4ea] bg-[#eef6fd] px-4 py-3 text-[12.5px] text-[#1e4e79]">
            <span className="shrink-0"><Icon name="chart" size={18} /></span>
            <div>
              <b>How to act on this.</b> Take rate above 30% with a small price
              jump means the upgrade is underpriced — raise it. Below 8% with a
              jump over 90% means the step is too steep; put a middle option in
              between. &ldquo;Times shown&rdquo; needs storefront tracking
              (Funnel Phase 2), so take rate is measured against the orders of
              the base product — the honest version until then.
            </div>
          </div>
        </>
      )}

      <p className="text-body-soft text-[12px] mt-4">
        {demo
          ? "Demo data — the API is unreachable, so these samples are held in memory."
          : "Saved to your database — an upgrade is a real product linked by upgradeOfProductId. Edits here change that product; removing only unlinks it, the product stays in your catalog."}
      </p>
    </div>
  );
}

/* ================= 8 · ADD-ONS (items · groups · auto rules · preview) ==========
   An add-on is its own small thing — never a product on the website, never sold
   on its own. It is ALWAYS additive: 500 bouquet + 50 card = 550.
   Only what is needed: title · image (1:1) · SKU · price · discount · stock.

   One add-on can sit in MANY groups, and one product can match MANY rules —
   the matched groups then stack up as tabs on the product page and a duplicate
   add-on is shown only once. */
/* the storefront/editor UI speaks the Demo* shapes; the API speaks ApiAddOn.
   these two adapters are the only place the two vocabularies meet. */
/*  ── DEC-PRD-033, 9 Aug 2026 — the add-on photo never reached the shop ──
    `DemoAddon.image` is a CSS background (a gradient OR a picture), and it
    was being written into `AddOn.imageUrl` as-is. So the column held
    `url(https://…) center/cover`, the storefront wrapped that in url()
    a second time, and the tile came out blank — add-ons showed, photos
    did not. The column holds an ADDRESS; CSS is a style, not an address.
    The sibling variant field learned this on 1 Aug (see `pickUrl`); the
    add-on card was missed.

    These two adapters are now the only place the CSS and the URL meet.  */
const ADDON_TILE = "linear-gradient(150deg,#EFE4F7,#DDC9EC)";
/** `url(https://x) center/cover` → `https://x`; anything else → null */
const bareUrl = (css: string | null | undefined): string | null => {
  if (!css) return null;
  const m = /^url\(\s*['"]?(.+?)['"]?\s*\)/.exec(css.trim());
  if (m) return m[1];
  return /^https?:\/\//i.test(css.trim()) ? css.trim() : null;
};

function fromApiAddon(a: ApiAddOn): DemoAddon {
  /*  ⚠️ Tolerates the rows saved wrong before this fix — an address that
      still arrives wearing CSS is unwrapped rather than shown broken.  */
  const url = bareUrl(a.imageUrl);
  return {
    id: a.id,
    name: a.name,
    sku: a.sku ?? "",
    image: url ? `url(${url}) center/cover` : ADDON_TILE,
    itemId: a.itemId ?? null,
    itemLabel: a.item ? `${a.item.name} · ${a.item.sku}` : null,
    pricePaisa: a.pricePaisa,
    discountType: a.discountType,
    discountValue: a.discountValue,
    stockQty: a.stockQty,
    active: a.isActive,
  };
}
function toApiAddon(a: DemoAddon): Record<string, unknown> {
  return {
    name: a.name,
    sku: a.sku || null,
    //  the column takes the address only — never the CSS around it
    imageUrl: bareUrl(a.image),
    pricePaisa: a.pricePaisa,
    discountType: a.discountType,
    discountValue: a.discountValue,
    stockQty: a.stockQty,
    /*  DEC-PRD-039 — the link travels; the label is display only.  */
    itemId: a.itemId ?? null,
    isActive: a.active,
  };
}

export function AddonsView() {
  const { items } = useCatalog();
  const [rows, setRows] = useState<DemoAddon[]>([]);
  const [groups, setGroups] = useState<DemoAddonGroup[]>([]);
  const [rules, setRules] = useState<DemoAddonRule[]>([]);
  const [demo, setDemo] = useState(false);
  const [tab, setTab] = useState<"items" | "groups" | "rules" | "preview" | "perf">("items");
  const [days, setDays] = useState(30);
  const [q, setQ] = useState("");
  /** DEC-PRD-038 — "" = every group · a group id · "__none" = in no group */
  const [groupFilter, setGroupFilter] = useState("");
  /** DEC-PRD-039 — which add-on is choosing its stockroom Item, and the query */
  const [itemFor, setItemFor] = useState<string | null>(null);
  const [itemQ, setItemQ] = useState("");
  const [itemHits, setItemHits] = useState<{ id: string; sku: string; name: string }[]>([]);

  /*  DEC-PRD-039 — the same `listItems` search the product editor uses for a
      variant's Item, so the two screens can never disagree about what exists.  */
  useEffect(() => {
    if (!itemFor) return;
    let stale = false;
    const t = setTimeout(() => {
      listItems(itemQ.trim() ? { search: itemQ.trim() } : undefined)
        .then((r) => !stale && setItemHits(r.slice(0, 30)))
        .catch(() => !stale && setItemHits([]));
    }, 250);
    return () => { stale = true; clearTimeout(t); };
  }, [itemQ, itemFor]);
  const [newGroup, setNewGroup] = useState("");
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string>("");
  const [previewTab, setPreviewTab] = useState(0);

  /* Load from the real API (:4000/addons). If it is down or empty we drop to the
     demo catalog so the screen stays reviewable — same pattern as the rest of
     the module. In demo mode nothing is sent anywhere (the orange badge shows). */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = await getAddOns();
        if (!alive) return;
        // API reachable — real mode even when empty (an empty DB is a valid state,
        // it just means nothing has been added yet). Demo mode is ONLY for an
        // unreachable API, so a real empty catalog can actually be filled.
        setRows(b.addons.map(fromApiAddon));
        setGroups(b.groups.map((g) => ({ id: g.id, name: g.name, addonIds: g.addonIds })));
        setRules(b.rules.map((r) => ({ id: r.id, field: r.field, values: r.values, groupId: r.groupId, active: r.isActive })));
        setDemo(false);
      } catch {
        if (!alive) return;
        setRows(DEMO_ADDONS); setGroups(DEMO_ADDON_GROUPS); setRules(DEMO_ADDON_RULES); setDemo(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  /* debounced field save — type freely, one PATCH lands ~600ms after you stop */
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const queueSave = (id: string, next: DemoAddon) => {
    if (demo || id.startsWith("a")) return; // demo rows never persist
    clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(() => {
      updateAddOn(id, toApiAddon(next)).catch(() => {});
    }, 600);
  };

  const img = useCssImage();
  const set = (id: string, patch: Partial<DemoAddon>) =>
    setRows((r) =>
      r.map((x) => {
        if (x.id !== id) return x;
        const next = { ...x, ...patch };
        queueSave(id, next);
        return next;
      }),
    );
  const paysOf = (a: DemoAddon) =>
    a.discountType === "PERCENT"
      ? Math.max(0, Math.round(a.pricePaisa * (1 - Math.min(100, a.discountValue || 0) / 100)))
      : a.discountType === "FLAT"
        ? Math.max(0, a.pricePaisa - (a.discountValue || 0))
        : a.pricePaisa;
  const addonById = (id: string) => rows.find((x) => x.id === id);
  const groupsOf = (addonId: string) => groups.filter((g) => g.addonIds.includes(addonId));

  const toggleInGroup = (groupId: string, addonId: string) =>
    setGroups((x) =>
      x.map((g) => {
        if (g.id !== groupId) return g;
        const addonIds = g.addonIds.includes(addonId) ? g.addonIds.filter((z) => z !== addonId) : [...g.addonIds, addonId];
        if (!demo) setAddOnGroupItems(groupId, addonIds).catch(() => {});
        return { ...g, addonIds };
      }),
    );

  const renameGroup = (id: string, name: string) => {
    setGroups((x) => x.map((y) => (y.id === id ? { ...y, name } : y)));
    if (demo) return;
    clearTimeout(saveTimers.current["g:" + id]);
    saveTimers.current["g:" + id] = setTimeout(() => { updateAddOnGroup(id, { name }).catch(() => {}); }, 600);
  };

  async function makeGroup(name: string) {
    const n = name.trim();
    if (!n) return;
    if (demo) { setGroups((g) => [...g, { id: "g" + Date.now(), name: n, addonIds: [] }]); return; }
    try {
      const g = await createAddOnGroup({ name: n });
      setGroups((x) => [...x, { id: g.id, name: g.name, addonIds: [] }]);
    } catch { /* keep silent — badge covers offline */ }
  }

  /* one-click: write the 8 sample add-ons + 3 groups + 3 rules into the real
     database, so a fresh install is not staring at an empty screen. */
  const [seeding, setSeeding] = useState(false);
  async function seedSamples() {
    if (demo) return;
    setSeeding(true);
    try {
      // add-ons first, keep demo-id → real-id so groups can be rebuilt
      const idMap: Record<string, string> = {};
      const created: DemoAddon[] = [];
      for (const d of DEMO_ADDONS) {
        const a = await createAddOn(toApiAddon(d));
        idMap[d.id] = a.id;
        created.push(fromApiAddon({ ...a, groupIds: [] }));
      }
      const newGroups: DemoAddonGroup[] = [];
      const gMap: Record<string, string> = {};
      for (const g of DEMO_ADDON_GROUPS) {
        const ng = await createAddOnGroup({ name: g.name });
        gMap[g.id] = ng.id;
        const addonIds = g.addonIds.map((x) => idMap[x]).filter(Boolean);
        await setAddOnGroupItems(ng.id, addonIds);
        newGroups.push({ id: ng.id, name: ng.name, addonIds });
      }
      const newRules: DemoAddonRule[] = [];
      for (const r of DEMO_ADDON_RULES) {
        const gid = gMap[r.groupId];
        if (!gid) continue;
        const nr = await createAddOnRule({ field: r.field, values: r.values, groupId: gid, isActive: r.active });
        newRules.push({ id: nr.id, field: nr.field, values: nr.values, groupId: nr.groupId, active: nr.isActive });
      }
      setRows(created);
      setGroups(newGroups);
      setRules(newRules);
    } catch {
      alert("Could not seed samples — is the API running?");
    } finally {
      setSeeding(false);
    }
  }

  /* deleting must not leave orphans: an add-on leaves every group it sits in,
     and a group takes its rules with it. The API mirrors this server-side. */
  function deleteAddon(id: string) {
    setRows((r) => r.filter((x) => x.id !== id));
    setGroups((x) => x.map((g) => ({ ...g, addonIds: g.addonIds.filter((z) => z !== id) })));
    if (!demo) deleteAddOn(id).catch(() => {});
  }
  function deleteGroup(id: string) {
    setGroups((x) => x.filter((y) => y.id !== id));
    setRules((x) => x.filter((y) => y.groupId !== id));
    if (!demo) deleteAddOnGroup(id).catch(() => {});
  }

  async function addBlank() {
    const blank = {
      name: "", sku: "", image: "linear-gradient(150deg,#EFE4F7,#DDC9EC)",
      pricePaisa: 0, discountType: "NONE" as DiscountKind, discountValue: 0,
      stockQty: null, active: true,
    };
    if (demo) { setRows((r) => [{ id: "a" + Date.now(), ...blank }, ...r]); return; }
    try {
      const a = await createAddOn(toApiAddon(blank as DemoAddon));
      setRows((r) => [fromApiAddon({ ...a, groupIds: [] }), ...r]);
    } catch {
      setRows((r) => [{ id: "a" + Date.now(), ...blank }, ...r]);
    }
  }

  async function addRule() {
    const base = { field: "OCCASION" as AddonRuleField, values: [] as string[], groupId: groups[0]?.id ?? "", active: true };
    if (demo || !base.groupId) { setRules((x) => [...x, { id: "r" + Date.now(), ...base }]); return; }
    try {
      const r = await createAddOnRule({ field: base.field, values: base.values, groupId: base.groupId, isActive: true });
      setRules((x) => [...x, { id: r.id, field: r.field, values: r.values, groupId: r.groupId, active: r.isActive }]);
    } catch { setRules((x) => [...x, { id: "r" + Date.now(), ...base }]); }
  }
  const patchRule = (id: string, patch: Partial<DemoAddonRule>) => {
    setRules((x) => x.map((y) => (y.id === id ? { ...y, ...patch } : y)));
    if (demo || id.startsWith("r")) return;
    const cur = rules.find((y) => y.id === id);
    const merged = { ...cur, ...patch } as DemoAddonRule;
    clearTimeout(saveTimers.current["r:" + id]);
    saveTimers.current["r:" + id] = setTimeout(() => {
      updateAddOnRule(id, { field: merged.field, values: merged.values, groupId: merged.groupId, isActive: merged.active }).catch(() => {});
    }, 400);
  };
  function removeRule(id: string) {
    setRules((x) => x.filter((y) => y.id !== id));
    if (!demo) deleteAddOnRule(id).catch(() => {});
  }

  /* ---- rule matching ---- */
  const fieldValueOf = (p: ApiProduct, f: AddonRuleField): string[] =>
    f === "CATEGORY"
      ? [p.category?.name ?? ""]
      : f === "ZONE"
        ? [p.zone ?? ""]
        : f === "PRODUCT_TYPE"
          ? [p.productType ?? ""]
          : (p.tags ?? []).map((t) => t.slug);
  const ruleMatches = (r: DemoAddonRule, p: ApiProduct) =>
    fieldValueOf(p, r.field).some((v) => r.values.includes(v));
  const matchCount = (r: DemoAddonRule) => items.filter((p) => ruleMatches(r, p)).length;

  const RULE_VALUES: Record<AddonRuleField, string[]> = {
    OCCASION: ["birthday", "anniversary", "love", "congratulations", "get-well", "sorry", "corporate"],
    CATEGORY: [...new Set(items.map((p) => p.category?.name).filter(Boolean) as string[])],
    ZONE: ["DHAKA", "NATIONWIDE"],
    PRODUCT_TYPE: ["READYMADE", "CRAFTED"],
  };
  const FIELD_LABEL: Record<AddonRuleField, string> = {
    OCCASION: "Occasion tag",
    CATEGORY: "Category",
    ZONE: "Delivery zone",
    PRODUCT_TYPE: "Product type",
  };

  /*  DEC-PRD-038 — owner, 9 Aug 2026: *"add-on page-e add-on search korar
      option ache kintu group ta nei. dhoro ekta group 'flower', okhane
      10,000 add-on holo — segula ke ber korbo kivabe?"*

      Fair: the search box finds one add-on by name; it cannot answer "show me
      this group". With a group of thousands the card wall is unusable without
      it. `groupFilter` is "" for everything, or a group id.  */
  const shown = rows.filter((a) => {
    if (q) {
      const needle = q.toLowerCase();
      if (!a.name.toLowerCase().includes(needle) && !a.sku.toLowerCase().includes(needle)) {
        return false;
      }
    }
    if (groupFilter === "__none") return groupsOf(a.id).length === 0;
    if (groupFilter) return groups.find((g) => g.id === groupFilter)?.addonIds.includes(a.id) ?? false;
    return true;
  });
  const outOfStock = rows.filter((a) => a.stockQty !== null && a.stockQty <= 0).length;

  /* things that would quietly break the storefront */
  const skuSeen = new Map<string, number>();
  rows.forEach((a) => a.sku.trim() && skuSeen.set(a.sku.trim().toUpperCase(), (skuSeen.get(a.sku.trim().toUpperCase()) ?? 0) + 1));
  const isDupeSku = (sku: string) => !!sku.trim() && (skuSeen.get(sku.trim().toUpperCase()) ?? 0) > 1;
  const problems: string[] = [];
  const unnamed = rows.filter((a) => !a.name.trim()).length;
  const noSku = rows.filter((a) => !a.sku.trim()).length;
  const dupeSku = [...skuSeen.values()].filter((n) => n > 1).length;
  const orphanAddons = rows.filter((a) => groupsOf(a.id).length === 0).length;
  const emptyGroups = groups.filter((g) => g.addonIds.length === 0).length;
  const emptyRules = rules.filter((r) => r.values.length === 0).length;
  if (unnamed) problems.push(`${unnamed} add-on${unnamed > 1 ? "s have" : " has"} no name`);
  if (noSku) problems.push(`${noSku} without a SKU`);
  if (dupeSku) problems.push(`${dupeSku} duplicate SKU${dupeSku > 1 ? "s" : ""}`);
  if (orphanAddons) problems.push(`${orphanAddons} in no group — nobody will ever see ${orphanAddons > 1 ? "them" : "it"}`);
  if (emptyGroups) problems.push(`${emptyGroups} empty group${emptyGroups > 1 ? "s" : ""}`);
  if (emptyRules) problems.push(`${emptyRules} rule${emptyRules > 1 ? "s" : ""} with no value picked`);

  /* ---- what a chosen product would actually show ---- */
  const previewProduct = items.find((p) => p.id === previewId) ?? items[0];
  const previewGroups = (previewProduct
    ? rules
        .filter((r) => r.active && r.values.length > 0 && ruleMatches(r, previewProduct))
        .map((r) => ({ rule: r, group: groups.find((g) => g.id === r.groupId) }))
        .filter((x) => !!x.group)
    : []
  ).filter((x, i, arr) => arr.findIndex((y) => y.group!.id === x.group!.id) === i); // one tab per group
  const seenBefore = (gi: number, addonId: string) =>
    previewGroups.slice(0, gi).some((x) => x.group!.addonIds.includes(addonId));

  /* ---- performance (demo money data; real version reads OrderLine) ---- */
  const orderCount = demoOrderCount(days);
  const stats = demoAddonStats(rows, days);
  const statOf = (id: string) => stats.find((s) => s.addonId === id);
  const perfRows = rows
    .map((a) => {
      const stat = statOf(a.id)!;
      const attachPct = orderCount ? Math.round((stat.ordersWith / orderCount) * 100) : 0;
      return { addon: a, stat, attachPct, delta: attachPct - stat.prevAttachPct };
    })
    .sort((x, y) => y.attachPct - x.attachPct);
  const addonRevenue = stats.reduce((s, x) => s + x.revenuePaisa, 0);
  const ordersWithAny = Math.min(orderCount, Math.round(orderCount * (1 - stats.reduce((s, x) => s * (1 - x.ordersWith / (orderCount || 1)), 1))));
  const attachRateAll = orderCount ? Math.round((ordersWithAny / orderCount) * 100) : 0;
  const grossSales = items.reduce((s, p) => s + (p.offerPricePaisa || p.sellingPricePaisa || 0), 0) * Math.max(1, Math.round(orderCount / Math.max(1, items.length)));
  const sharePct = grossSales ? Math.round((addonRevenue / (grossSales + addonRevenue)) * 100) : 0;
  const perOrder = orderCount ? Math.round(addonRevenue / orderCount) : 0;
  const groupPerf = groups.map((g) => ({
    id: g.id,
    name: g.name,
    revenue: g.addonIds.reduce((s, id) => s + (statOf(id)?.revenuePaisa ?? 0), 0),
  })).sort((a, b) => b.revenue - a.revenue);
  const topGroupRev = groupPerf[0]?.revenue ?? 0;
  const totalAddonUnits = stats.reduce((s, x) => s + x.units, 0);
  const pagePerf = PLACEMENTS.map((page) => {
    const units = stats.reduce((s, x) => s + (x.byPage.find((b) => b.page === page)?.units ?? 0), 0);
    const revenue = stats.reduce((s, x) => s + (x.byPage.find((b) => b.page === page)?.revenuePaisa ?? 0), 0);
    return { page, units, revenue, sharePct: totalAddonUnits ? Math.round((units / totalAddonUnits) * 100) : 0 };
  });

  const TABS = [
    ["items", "Add-ons", String(rows.length)],
    ["groups", "Groups", String(groups.length)],
    ["rules", "Auto rules", String(rules.filter((r) => r.active).length)],
    ["preview", "Product preview", ""],
    ["perf", "Performance", ""],
  ] as const;

  return (
    <div className={WRAP}>
      {img.err && (
        <div className="mb-4 rounded-[12px] border border-[#f1c9c4] bg-[#fdf3f2] px-4 py-2.5 text-[13px] text-[#b42318]">
          {img.err}
        </div>
      )}
      <PageHead eyebrow="Product Management · catalog" title="Add-ons" demo={demo}>
        The little extras a customer adds to a gift — a card, gift wrap, a vase.
        Never sold on their own, always added on top.
      </PageHead>

      <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3 mb-5">
        <Kpi n={String(rows.length)} l="Add-ons" hue="purple" icon="box" />
        <Kpi n={String(rows.filter((a) => a.active).length)} l="Live" hue="green" icon="check" />
        <Kpi n={String(groups.length)} l="Groups" hue="orchid" icon="layers" />
        <Kpi n={String(outOfStock)} l="Out of stock" hue={outOfStock ? "red" : "teal"} icon="bolt" />
      </div>

      {problems.length > 0 && (
        <div className="flex gap-2.5 rounded-[14px] border-[1.5px] border-[#f0c88a] bg-[#fff8ec] px-4 py-3 mb-5 text-[12.5px] text-[#7a4b09]">
          <span className="text-[#b45309] shrink-0"><Icon name="bolt" size={18} /></span>
          <div>
            <b>Needs a look:</b> {problems.join(" · ")}.
          </div>
        </div>
      )}

      <div className="flex gap-1 flex-wrap mb-5 border-b border-lavender-deep">
        {TABS.map(([id, label, count]) => (
          <button
            key={id}
            onClick={() => setTab(id as typeof tab)}
            className={`px-4 py-2.5 text-[13.5px] font-medium border-b-2 -mb-px inline-flex items-center gap-2 ${tab === id ? "text-purple border-orchid" : "text-body-soft border-transparent hover:text-purple"}`}
          >
            {label}
            {count && (
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${tab === id ? "bg-orchid-soft text-purple" : "bg-lavender text-body-soft"}`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ---------- ITEMS ---------- */}
      {tab === "items" && (
        <>
          <div className="flex gap-2.5 flex-wrap items-center mb-4">
            <div className="relative max-w-[300px] w-full">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft">
                <Icon name="search" size={18} />
              </span>
              <input
                className="ipt ipt-icon h-[44px]"
                placeholder="Search add-on or SKU..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            {/*  DEC-PRD-038 — pick a group and the wall narrows to it. The
                count beside each name is why it is a dropdown and not a row
                of chips: a shop with twenty groups would wrap three lines.  */}
            <select
              className="ipt h-[44px] max-w-[260px]"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value="">Every group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.addonIds.length})
                </option>
              ))}
              <option value="__none">In no group</option>
            </select>

            {(q || groupFilter) && (
              <span className="text-[13px] text-body-soft">
                {shown.length} of {rows.length}
                {groupFilter && groupFilter !== "__none"
                  ? ` in ${groups.find((g) => g.id === groupFilter)?.name ?? ""}`
                  : ""}
              </span>
            )}
            <button
              onClick={addBlank}
              className="ml-auto bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] inline-flex items-center gap-2 shadow-soft"
            >
              <Icon name="plus" size={17} /> New add-on
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5">
            {shown.map((a) => {
              const pays = paysOf(a);
              const off = pays < a.pricePaisa;
              const out = a.stockQty !== null && a.stockQty <= 0;
              const inGroups = groupsOf(a.id);
              return (
                <div
                  key={a.id}
                  className={`group bg-white rounded-[16px] shadow-soft overflow-hidden border transition-all hover:shadow-lift hover:-translate-y-[2px] ${a.active ? "border-orchid-mid/60" : "border-lavender-deep opacity-70"}`}
                >
                  <span className={`block h-[4px] ${a.active ? "bg-gradient-to-r from-[#7d2ea8] via-[#cf43ea] to-[#e6a8f5]" : "bg-lavender-deep"}`} />
                  {/* photo - always 1:1, same shape as the storefront tile */}
                  <div className="p-3 pb-0">
                    <div
                      className="relative aspect-square rounded-[12px] overflow-hidden border border-lavender-deep"
                      style={{ background: a.image }}
                    >
                      <label
                        title="Change photo - square 1:1, 800x800"
                        className="absolute inset-0 flex flex-col items-center justify-center gap-1 cursor-pointer text-purple/40 hover:text-white hover:bg-black/30 transition-colors"
                      >
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/avif"
                          className="hidden"
                          disabled={img.busyId === a.id}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            void img.pick(a.id, f, (css) => set(a.id, { image: css }));
                          }}
                        />
                        {img.busyId === a.id ? (
                          <span className="text-[12px] font-semibold text-white">Uploading…</span>
                        ) : (
                          <>
                            <Icon name="photo" size={26} />
                            <span className="text-[11px] font-semibold">1:1 · 800×800</span>
                          </>
                        )}
                      </label>
                      {off && (
                        <span className="absolute top-2 left-2 bg-rosegold text-white text-[11px] font-bold px-2 py-0.5 rounded-full pointer-events-none">
                          {a.discountType === "PERCENT" ? `${a.discountValue}% OFF` : "OFFER"}
                        </span>
                      )}
                      {out && (
                        <span className="absolute top-2 right-2 bg-[#c0392b] text-white text-[11px] font-bold px-2 py-0.5 rounded-full pointer-events-none">
                          OUT
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-3">
                    <input
                      className="ipt"
                      style={{ minHeight: 36 }}
                      placeholder="Add-on name"
                      value={a.name}
                      onChange={(e) => set(a.id, { name: e.target.value })}
                    />

                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <span className="block text-[10px] font-semibold uppercase tracking-[0.04em] text-body-soft mb-1">SKU</span>
                        <input
                          className="ipt font-mono"
                          style={{ minHeight: 32, fontSize: 11.5, borderColor: isDupeSku(a.sku) ? "#e0705f" : undefined }}
                          title={isDupeSku(a.sku) ? "Another add-on already uses this SKU" : undefined}
                          placeholder="ADD-CARD"
                          value={a.sku}
                          onChange={(e) => set(a.id, { sku: e.target.value })}
                        />
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold uppercase tracking-[0.04em] text-body-soft mb-1">Price</span>
                        <input
                          className="ipt"
                          style={{ minHeight: 32 }}
                          type="number"
                          value={Math.round(a.pricePaisa / 100)}
                          onChange={(e) => set(a.id, { pricePaisa: (Number(e.target.value) || 0) * 100 })}
                        />
                      </div>
                    </div>

                    {/* Discount — full width so the type + value both read clearly */}
                    <div className="mt-2.5">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.04em] text-body-soft mb-1">Discount</span>
                      <div className="grid grid-cols-[92px_1fr] gap-2">
                        <select
                          className="ipt"
                          style={{ minHeight: 38, paddingLeft: 12, paddingRight: 8 }}
                          value={a.discountType}
                          onChange={(e) => set(a.id, { discountType: e.target.value as DemoAddon["discountType"], discountValue: 0 })}
                        >
                          <option value="NONE">None</option>
                          <option value="FLAT">Flat ৳</option>
                          <option value="PERCENT">Percent %</option>
                        </select>
                        <input
                          className="ipt"
                          style={{ minHeight: 38 }}
                          type="number"
                          disabled={a.discountType === "NONE"}
                          placeholder={a.discountType === "NONE" ? "no discount" : a.discountType === "PERCENT" ? "e.g. 10" : "amount in ৳"}
                          value={a.discountType === "FLAT" ? Math.round(a.discountValue / 100) : a.discountType === "PERCENT" ? a.discountValue : ""}
                          onChange={(e) =>
                            set(a.id, {
                              discountValue: a.discountType === "FLAT" ? (Number(e.target.value) || 0) * 100 : Number(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                    </div>

                    {/* Stock — typed by hand, unlimited, or counted by Inventory */}
                    <div className="mt-2.5">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.04em] text-body-soft mb-1">Stock</span>
                      {/*  DEC-PRD-039 — owner, 9 Aug 2026: *"add-on-e manual stock
                          deoar option ache kintu inventory-r sathe connect-er
                          option nei."* Right — a chocolate bar is a real thing in
                          the stockroom; gift wrap is not. Linked wins and the
                          typed box disappears, the same rule variants follow, so
                          two counts can never disagree.  */}
                      {a.itemId ? (
                        <div className="flex items-center gap-2">
                          <span className="flex-1 min-w-0 text-[12.5px] text-purple bg-lavender/60 border border-lavender-deep rounded-[10px] px-2.5 py-2 truncate">
                            📦 {a.itemLabel ?? "Counted in Inventory"}
                          </span>
                          <button
                            onClick={() => set(a.id, { itemId: null, itemLabel: null })}
                            className="text-[12px] text-body-soft hover:text-[#c0392b] px-1"
                          >
                            Unlink
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-[1fr_auto] gap-2">
                            <input
                              className="ipt"
                              style={{ minHeight: 38 }}
                              type="number"
                              disabled={a.stockQty === null}
                              placeholder={a.stockQty === null ? "Unlimited" : "0"}
                              value={a.stockQty ?? ""}
                              onChange={(e) => set(a.id, { stockQty: Number(e.target.value) || 0 })}
                            />
                            <button
                              onClick={() => set(a.id, { stockQty: a.stockQty === null ? 0 : null })}
                              title="A service like gift wrap never runs out"
                              className={`text-[12px] font-semibold px-3 rounded-[10px] border inline-flex items-center gap-1.5 whitespace-nowrap ${a.stockQty === null ? "bg-purple border-purple text-white" : "bg-white border-lavender-deep text-body-soft hover:border-orchid"}`}
                            >
                              <span className="text-[14px] leading-none">∞</span> Unlimited
                            </button>
                          </div>
                          <button
                            onClick={() => { setItemFor(a.id); setItemQ(""); }}
                            className="mt-1.5 w-full text-[11.5px] px-2 py-1.5 rounded-[9px] border border-dashed border-orchid-mid text-orchid bg-white hover:bg-orchid-soft/40"
                          >
                            Count from Inventory…
                          </button>
                        </>
                      )}
                    </div>

                    {/* which groups it sits in - read only here, edited in Groups tab */}
                    <div className="flex flex-wrap gap-1 mt-2.5 min-h-[20px]">
                      {inGroups.map((g) => (
                        <span
                          key={g.id}
                          className="text-[11px] font-medium px-2 py-0.5 rounded-full border"
                          style={{ background: groupTint(g.id, 0.14), borderColor: groupTint(g.id, 0.5), color: groupTint(g.id, 1) }}
                        >
                          {g.name}
                        </span>
                      ))}
                      {inGroups.length === 0 && (
                        <span className="text-[13px] text-body-soft">In no group yet</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-lavender-deep">
                      <span className="inline-flex items-baseline gap-1.5 bg-gradient-to-r from-[#f3e6fb] to-[#fbe7f4] border border-orchid-mid/50 rounded-[10px] px-2.5 py-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-body-soft">Adds</span>
                        <b className="text-[16px] font-display text-purple leading-none">+{formatTaka(pays)}</b>
                      </span>
                      {off && <span className="text-[11.5px] line-through text-body-soft">{formatTaka(a.pricePaisa)}</span>}
                    </div>

                    <div className="flex items-center justify-between mt-2.5">
                      <button
                        onClick={() => set(a.id, { active: !a.active })}
                        className="inline-flex items-center gap-2 text-[13px] text-body-soft"
                      >
                        <span className={`w-[36px] h-[21px] rounded-full relative transition-colors ${a.active ? "bg-[#0f7d55]" : "bg-[#cdbfda]"}`}>
                          <span className={`absolute top-[2px] w-[17px] h-[17px] rounded-full bg-white transition-all ${a.active ? "left-[17px]" : "left-[2px]"}`} />
                        </span>
                        {a.active ? "Live" : "Hidden"}
                      </button>
                      <button
                        onClick={() => deleteAddon(a.id)}
                        className="text-body-soft hover:text-[#c0392b]"
                        title="Delete"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {shown.length === 0 && (q || groupFilter || rows.length > 0) && (
            <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-12 text-center text-[13px] text-body-soft">
              Nothing matches your search.
            </div>
          )}

          {/*  DEC-PRD-039 — the Item search, at full width under the wall. In a
              152px card an item's name would not even be readable; this is the
              same reasoning the variant picker settled on.  */}
          {itemFor && (
            <div className="mt-4 border border-lavender-deep rounded-[14px] p-4 bg-white shadow-soft">
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="text-[13px] text-body-soft">
                  Which stockroom item holds{" "}
                  <b className="font-semibold text-purple">
                    {rows.find((x) => x.id === itemFor)?.name || "this add-on"}
                  </b>
                  ?
                </div>
                <button
                  onClick={() => setItemFor(null)}
                  className="text-[13px] text-body-soft hover:text-purple"
                >
                  Close
                </button>
              </div>
              <input
                className="ipt h-[42px] mb-2.5"
                placeholder="Search by item code or name…"
                value={itemQ}
                onChange={(e) => setItemQ(e.target.value)}
                autoFocus
              />
              <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto">
                {itemHits.length === 0 && (
                  <div className="text-[13px] text-body-soft px-1 py-2">
                    No item matches “{itemQ || "…"}”. Make it in{" "}
                    <Link href="/items/new" className="text-orchid font-medium hover:underline">
                      Items
                    </Link>{" "}
                    first.
                  </div>
                )}
                {itemHits.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => {
                      set(itemFor, { itemId: it.id, itemLabel: `${it.name} · ${it.sku}` });
                      setItemFor(null);
                    }}
                    className="flex items-center gap-3 border border-lavender-deep rounded-[10px] px-2.5 py-2 hover:border-orchid text-left"
                  >
                    <span className="flex-1 min-w-0 text-[13px] text-purple font-medium truncate">
                      {it.name}
                    </span>
                    <span className="text-[13px] text-body-soft font-mono">{it.sku}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {rows.length === 0 && !q && (
            <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-14 text-center">
              <div className="font-display text-[19px] text-purple mb-1">No add-ons yet</div>
              <div className="text-[13px] text-body-soft mb-5 max-w-[420px] mx-auto">
                Start with <b>New add-on</b> above, or drop in a ready-made set —
                greeting card, gift wrap, vase, teddy — to see how groups and rules work.
              </div>
              {!demo && (
                <button
                  onClick={seedSamples}
                  disabled={seeding}
                  className="bg-purple hover:bg-purple-deep text-white text-[13px] font-semibold px-4 py-2.5 rounded-[11px] disabled:opacity-40 inline-flex items-center gap-1.5"
                >
                  <Icon name="sparkle" size={16} /> {seeding ? "Adding samples…" : "Load 8 sample add-ons"}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------- GROUPS ---------- */}
      {tab === "groups" && (
        <>
          <HowTo>
            A group is a named set - &ldquo;Birthday add-ons&rdquo;. Open the
            picker and tick as many as you want; it stays open until you press
            Done. <b>The same add-on can sit in as many groups as you like</b> - a
            greeting card belongs to birthday, anniversary and everyday alike.
          </HowTo>

          <div className="flex flex-col gap-3.5">
            {groups.map((g) => {
              const open = pickerFor === g.id;
              return (
                <div
                  key={g.id}
                  className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4 border-l-[5px]"
                  style={{ borderLeftColor: groupTint(g.id, 1) }}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                    <input
                      className="ipt font-display"
                      style={{ minHeight: 38, maxWidth: 260, fontSize: 15 }}
                      value={g.name}
                      onChange={(e) => renameGroup(g.id, e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-body-soft">
                        {g.addonIds.length} item{g.addonIds.length === 1 ? "" : "s"}
                        {g.addonIds.filter((id) => !addonById(id)?.active).length > 0 && (
                          <> ({g.addonIds.filter((id) => !addonById(id)?.active).length} hidden)</>
                        )}{" "}
                        ·{" "}
                        <b style={{ color: groupTint(g.id, 1) }}>
                          +{formatTaka(
                            g.addonIds.reduce((s, id) => {
                              const a = addonById(id);
                              return s + (a && a.active ? paysOf(a) : 0);
                            }, 0),
                          )}
                        </b>{" "}
                        if all added
                      </span>
                      <button
                        onClick={() => setPickerFor(open ? null : g.id)}
                        className={`text-[12.5px] font-semibold px-3 h-[34px] rounded-[10px] border inline-flex items-center gap-1.5 ${open ? "text-white" : "bg-white border-lavender-deep text-purple hover:border-orchid"}`}
                        style={open ? { background: groupTint(g.id, 1), borderColor: groupTint(g.id, 1) } : undefined}
                      >
                        <Icon name={open ? "check" : "plus"} size={15} /> {open ? "Done" : "Choose add-ons"}
                      </button>
                      <button
                        onClick={() => deleteGroup(g.id)}
                        className="border border-lavender-deep bg-white text-body-soft hover:text-[#c0392b] hover:border-[#e0a1a1] rounded-[10px] w-[34px] h-[34px] grid place-items-center"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {g.addonIds.map((id) => {
                      const a = addonById(id);
                      if (!a) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-2 border rounded-[11px] pl-1.5 pr-2 py-1.5"
                          style={{ background: groupTint(g.id, 0.1), borderColor: groupTint(g.id, 0.4) }}
                        >
                          <span className="w-[26px] h-[26px] rounded-[7px]" style={{ background: a.image }} />
                          <span className="text-[12.5px] font-medium text-purple">{a.name || "untitled"}</span>
                          <span className="text-[13px] text-body-soft">+{formatTaka(paysOf(a))}</span>
                          <button onClick={() => toggleInGroup(g.id, id)} className="text-body-soft hover:text-[#c0392b]">x</button>
                        </span>
                      );
                    })}
                    {g.addonIds.length === 0 && (
                      <span className="text-[13px] text-body-soft py-1.5">Empty - click &ldquo;Choose add-ons&rdquo;.</span>
                    )}
                  </div>

                  {/* multi select picker - stays open, tick as many as you want */}
                  {open && (
                    <div className="mt-3 pt-3 border-t border-lavender-deep">
                      <div className="text-[13px] text-body-soft mb-2">
                        Tick to add, tick again to remove. Every add-on stays listed - one already
                        used elsewhere can still be picked here.
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-2">
                        {rows.map((a) => {
                          const on = g.addonIds.includes(a.id);
                          const other = groupsOf(a.id).filter((x) => x.id !== g.id).length;
                          return (
                            <button
                              key={a.id}
                              onClick={() => toggleInGroup(g.id, a.id)}
                              className="flex items-center gap-2.5 text-left rounded-[12px] border px-2 py-2 transition-colors bg-white border-lavender-deep hover:border-orchid-mid"
                              style={on ? { background: groupTint(g.id, 0.1), borderColor: groupTint(g.id, 0.55) } : undefined}
                            >
                              <span className="w-[34px] h-[34px] rounded-[9px] shrink-0" style={{ background: a.image }} />
                              <span className="min-w-0 flex-1">
                                <span className="block text-[12.5px] font-medium text-purple truncate">{a.name || "untitled"}</span>
                                <span className="block text-[13px] text-body-soft">
                                  +{formatTaka(paysOf(a))}
                                  {other > 0 && ` · in ${other} other group${other === 1 ? "" : "s"}`}
                                </span>
                              </span>
                              <span
                                className={`w-[20px] h-[20px] rounded-[6px] border grid place-items-center shrink-0 ${on ? "text-white" : "bg-white border-lavender-deep text-transparent"}`}
                                style={on ? { background: groupTint(g.id, 1), borderColor: groupTint(g.id, 1) } : undefined}
                              >
                                <Icon name="check" size={13} />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2.5 mt-4">
            <input
              className="ipt"
              style={{ maxWidth: 280 }}
              placeholder="New group - Eid add-ons, Corporate..."
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newGroup.trim()) {
                  makeGroup(newGroup.trim());
                  setNewGroup("");
                }
              }}
            />
            <button
              onClick={() => {
                const n = newGroup.trim();
                if (!n) return;
                makeGroup(n);
                setNewGroup("");
              }}
              disabled={!newGroup.trim()}
              className="bg-purple hover:bg-purple-deep text-white text-[13px] font-semibold px-4 py-2.5 rounded-[11px] disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              <Icon name="plus" size={16} /> Create group
            </button>
          </div>
        </>
      )}

      {/* ---------- RULES ---------- */}
      {tab === "rules" && (
        <>
          <HowTo>
            Write the rule once instead of setting add-ons on every product.
            A rule can list <b>many values</b> - one &ldquo;Everyday extras&rdquo;
            group can cover Fresh Flowers, Bouquets and Hampers together. If a
            product is caught by several rules, <b>every matched group attaches</b>
            {" "}and shows as its own tab on the product page; an add-on appearing in
            two of them is shown only once.
          </HowTo>

          <div className="flex flex-col gap-3">
            {rules.map((r) => {
              const g = groups.find((x) => x.id === r.groupId);
              const n = matchCount(r);
              return (
                <div
                  key={r.id}
                  className={`bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4 border-l-[5px] ${r.active ? "" : "opacity-60"}`}
                  style={{ borderLeftColor: FIELD_COLOR[r.field] }}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-body-soft">Attach</span>
                      <select
                        className="ipt"
                        style={{ minHeight: 36, maxWidth: 200 }}
                        value={r.groupId}
                        onChange={(e) => patchRule(r.id, { groupId: e.target.value })}
                      >
                        {groups.map((gg) => (<option key={gg.id} value={gg.id}>{gg.name}</option>))}
                      </select>
                      <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-body-soft">when</span>
                      <select
                        className="ipt"
                        style={{ minHeight: 36, maxWidth: 150 }}
                        value={r.field}
                        onChange={(e) => patchRule(r.id, { field: e.target.value as AddonRuleField, values: [] })}
                      >
                        {(Object.keys(FIELD_LABEL) as AddonRuleField[]).map((f) => (
                          <option key={f} value={f}>{FIELD_LABEL[f]}</option>
                        ))}
                      </select>
                      <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-body-soft">is any of</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => patchRule(r.id, { active: !r.active })}
                        className={`w-[38px] h-[22px] rounded-full relative transition-colors ${r.active ? "bg-[#0f7d55]" : "bg-[#cdbfda]"}`}
                      >
                        <span className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-all ${r.active ? "left-[18px]" : "left-[2px]"}`} />
                      </button>
                      <button
                        onClick={() => removeRule(r.id)}
                        className="border border-lavender-deep bg-white text-body-soft hover:text-[#c0392b] hover:border-[#e0a1a1] rounded-[10px] w-[34px] h-[34px] grid place-items-center"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </div>

                  {/* value chips - pick as many as you want */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {RULE_VALUES[r.field].map((v2) => {
                      const on = r.values.includes(v2);
                      return (
                        <button
                          key={v2}
                          onClick={() => patchRule(r.id, { values: on ? r.values.filter((z) => z !== v2) : [...r.values, v2] })}
                          className={`text-[12px] font-medium px-2.5 py-1.5 rounded-full border transition-colors ${on ? "text-white" : "bg-white border-lavender-deep text-body-soft hover:border-orchid"}`}
                          style={on ? { background: FIELD_COLOR[r.field], borderColor: FIELD_COLOR[r.field] } : undefined}
                        >
                          {v2}
                        </button>
                      );
                    })}
                    {RULE_VALUES[r.field].length === 0 && (
                      <span className="text-[13px] text-body-soft">No values available yet.</span>
                    )}
                  </div>
                  {r.values.length === 0 && RULE_VALUES[r.field].length > 0 && (
                    <div className="text-[12px] text-[#b45309] mt-2">
                      Pick at least one value — until then this rule does nothing.
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-lavender-deep flex-wrap">
                    <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full ${n ? "bg-[#e8f6ef] text-[#0f7d55]" : "bg-[#fff8ec] text-[#b45309]"}`}>
                      {n} product{n === 1 ? "" : "s"} match right now
                    </span>
                    <span className="text-[13px] text-body-soft">
                      they will offer:{" "}
                      {(g?.addonIds ?? []).map((id) => addonById(id)?.name).filter(Boolean).join(" · ") || "nothing yet"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={addRule}
            className="mt-4 bg-purple hover:bg-purple-deep text-white text-[13px] font-semibold px-4 py-2.5 rounded-[11px] inline-flex items-center gap-1.5"
          >
            <Icon name="plus" size={16} /> Add rule
          </button>
        </>
      )}

      {/* ---------- PREVIEW - what one product actually ends up with ---------- */}
      {tab === "preview" && (
        <>
          <HowTo>
            Pick any product and see exactly what the customer will be offered -
            every rule it matches, each matched group as its own tab, duplicates
            marked. This is the check before you trust the rules.
          </HowTo>

          <div className="mb-4 max-w-[380px]">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-body-soft mb-1">Product</span>
            <select
              className="ipt"
              value={previewProduct?.id ?? ""}
              onChange={(e) => { setPreviewId(e.target.value); setPreviewTab(0); }}
            >
              {items.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>

          {previewProduct && (
            <div className="grid lg:grid-cols-[300px_1fr] gap-4 items-start">
              <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-body-soft mb-2.5">Why these groups</div>
                <div className="flex flex-col gap-2">
                  {previewGroups.map(({ rule, group }) => (
                    <div
                      key={rule.id}
                      className="text-[12px] leading-[1.5] rounded-[10px] px-3 py-2 border-l-[4px] border border-lavender-deep"
                      style={{ background: groupTint(group!.id, 0.09), borderLeftColor: groupTint(group!.id, 1) }}
                    >
                      <b style={{ color: groupTint(group!.id, 1) }}>{group!.name}</b>
                      <div className="text-body-soft">
                        {FIELD_LABEL[rule.field]} matched{" "}
                        <b>{fieldValueOf(previewProduct, rule.field).find((v) => rule.values.includes(v))}</b>
                      </div>
                    </div>
                  ))}
                  {previewGroups.length === 0 && (
                    <div className="text-[13px] text-body-soft">
                      No rule matches this product - it will show no add-ons. Add a rule, or
                      attach a group by hand on the product page.
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
                <div className="px-4 pt-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-body-soft mb-1">Make it extra special</div>
                  <div className="text-[13px] text-body-soft mb-3">
                    Base price {formatTaka(previewProduct.offerPricePaisa || previewProduct.sellingPricePaisa)} - each pick is added on top.
                  </div>
                  <div className="flex gap-1.5 flex-wrap border-b border-lavender-deep">
                    {previewGroups.map(({ group }, i) => (
                      <button
                        key={group!.id}
                        onClick={() => setPreviewTab(i)}
                        className="px-3.5 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors"
                        style={{
                          color: previewTab === i ? groupTint(group!.id, 1) : undefined,
                          borderBottomColor: previewTab === i ? groupTint(group!.id, 1) : "transparent",
                        }}
                      >
                        {group!.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-4">
                  {previewGroups[previewTab] ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                      {previewGroups[previewTab].group!.addonIds.map((id) => {
                        const a = addonById(id);
                        if (!a || !a.active) return null;
                        const dupe = seenBefore(previewTab, id);
                        const out = a.stockQty !== null && a.stockQty <= 0;
                        return (
                          <div key={id} className={`border border-lavender-deep rounded-[13px] overflow-hidden bg-white ${out ? "opacity-55" : ""}`}>
                            <div className="aspect-square relative" style={{ background: a.image }}>
                              {dupe && (
                                <span className="absolute top-1.5 left-1.5 bg-white/90 text-[9.5px] font-bold text-body-soft px-1.5 py-0.5 rounded-full">
                                  ALSO IN AN EARLIER TAB
                                </span>
                              )}
                              {out && (
                                <span className="absolute bottom-1.5 left-1.5 bg-[#c0392b] text-white text-[9.5px] font-bold px-1.5 py-0.5 rounded-full">
                                  OUT OF STOCK
                                </span>
                              )}
                            </div>
                            <div className="px-2.5 py-2">
                              <div className="text-[12.5px] font-medium text-purple leading-tight truncate">{a.name}</div>
                              <div className="text-[13px] text-body-soft mt-0.5">+{formatTaka(paysOf(a))}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[13px] text-body-soft py-8 text-center">Nothing to show.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------- PERFORMANCE ---------- */}
      {tab === "perf" && (
        <>
          <HowTo>
            <b>Attach rate is the number that matters</b> — not how many pieces
            sold. It says: out of every 100 orders, how many took this add-on.
            A low rate means wrong group, wrong price or a weak photo.
            Money and order counts come from our own database, so they are exact.
          </HowTo>

          <div className="flex gap-2 flex-wrap items-center mb-4">
            <div className="inline-flex rounded-[11px] border border-lavender-deep bg-white overflow-hidden">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`text-[12.5px] font-medium px-3.5 py-2 ${days === d ? "bg-purple text-white" : "text-body-soft hover:text-purple"}`}
                >
                  {d} days
                </button>
              ))}
            </div>
            <span className="text-[13px] text-body-soft">
              {orderCount.toLocaleString()} orders in this window
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3 mb-5">
            <Kpi n={`${attachRateAll}%`} l="Orders with an add-on" hue={attachRateAll < 25 ? "amber" : "green"} icon="check" />
            <Kpi n={formatTaka(addonRevenue)} l="Add-on revenue" hue="purple" icon="cash" />
            <Kpi n={`${sharePct}%`} l="Share of total sales" hue="orchid" icon="chart" />
            <Kpi n={formatTaka(perOrder)} l="Extra per order" hue="teal" icon="tag" />
          </div>

          {/* where the decision happens */}
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden mb-4">
            <div className="px-5 py-3.5 border-b border-lavender-deep">
              <div className="font-display text-[15px] text-purple">Where the customer decides</div>
              <div className="text-[13px] text-body-soft">
                The same add-on is offered in three places — this is where it actually gets picked
              </div>
            </div>

            <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-lavender-deep">
              {pagePerf.map((pp) => (
                <div key={pp.page} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-semibold text-purple">{PLACEMENT_LABEL[pp.page]}</span>
                    <span className="text-[13px] text-body-soft">
                      {pp.page === "PRODUCT" ? "while choosing the gift" : pp.page === "CART" ? "before paying" : "last chance"}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <b className="font-display text-[26px] text-purple leading-none">{pp.sharePct}%</b>
                    <span className="text-[13px] text-body-soft">of all add-ons taken</span>
                  </div>
                  <span className="block h-[8px] rounded-full bg-lavender overflow-hidden my-2.5">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-[#9c1fb8] to-[#cf43ea]"
                      style={{ width: `${pp.sharePct}%` }}
                    />
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[12px]">
                    <div>
                      <span className="block text-body-soft text-[11px] uppercase tracking-[0.04em]">Revenue</span>
                      <b className="text-purple text-[13.5px]">{formatTaka(pp.revenue)}</b>
                    </div>
                    <div>
                      <span className="block text-body-soft text-[11px] uppercase tracking-[0.04em]">Units</span>
                      <b className="text-purple text-[13.5px]">{pp.units.toLocaleString()}</b>
                    </div>
                    <div>
                      <span className="block text-body-soft text-[11px] uppercase tracking-[0.04em]">Times shown</span>
                      <span className="text-body-soft text-[11.5px]">tracking pending</span>
                    </div>
                    <div>
                      <span className="block text-body-soft text-[11px] uppercase tracking-[0.04em]">Per order</span>
                      <b className="text-purple text-[13.5px]">{formatTaka(orderCount ? Math.round(pp.revenue / orderCount) : 0)}</b>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-3 border-t border-lavender-deep text-[13px] text-body-soft">
              Read it like this: a cheap impulse item picked mostly at{" "}
              <b className="text-purple">Checkout</b> is doing its job. An expensive
              item picked mostly at <b className="text-purple">Checkout</b> is a
              warning — it means the product page never sold the idea, and the
              customer only noticed it at the end.
            </div>
          </div>

          {/* per add-on */}
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden mb-4">
            <div className="px-5 py-3.5 border-b border-lavender-deep flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="font-display text-[15px] text-purple">Every add-on</div>
                <div className="text-[13px] text-body-soft">Sorted by attach rate — the weakest sit at the bottom</div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {PLACEMENTS.map((pg, i) => (
                  <span key={pg} className="inline-flex items-center gap-1.5 text-[13px] text-body-soft">
                    <span className="w-[10px] h-[10px] rounded-full" style={{ background: PLACEMENT_COLOR[i] }} />
                    {PLACEMENT_LABEL[pg]}
                  </span>
                ))}
                <span className="text-[13px] text-body-soft">· Source: own database (OrderLine)</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="bg-lavender/50 text-left">
                    <th className="px-4 py-2.5 font-semibold text-[11px] uppercase tracking-[0.04em] text-body-soft">Add-on</th>
                    <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[0.04em] text-body-soft">Attach rate</th>
                    <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[0.04em] text-body-soft text-right">Orders</th>
                    <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[0.04em] text-body-soft text-right">Units</th>
                    <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[0.04em] text-body-soft">Picked on</th>
                    <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[0.04em] text-body-soft text-right">Revenue</th>
                    <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-[0.04em] text-body-soft text-right">Times shown</th>
                    <th className="px-4 py-2.5 font-semibold text-[11px] uppercase tracking-[0.04em] text-body-soft">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {perfRows.map(({ addon: a, stat, attachPct, delta }) => {
                    const weak = attachPct < 10;
                    return (
                      <tr key={a.id} className="border-t border-lavender-deep align-middle">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="w-[36px] h-[36px] rounded-[9px] shrink-0" style={{ background: a.image }} />
                            <div className="min-w-0">
                              <div className="font-medium text-purple truncate">{a.name || "untitled"}</div>
                              <div className="text-[13px] text-body-soft font-mono">{a.sku || "no SKU"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 min-w-[170px]">
                          <div className="flex items-center gap-2">
                            <span className="h-[7px] rounded-full bg-lavender flex-1 min-w-[60px] overflow-hidden">
                              <span
                                className={`block h-full rounded-full ${weak ? "bg-[#e0705f]" : attachPct < 20 ? "bg-[#e29a34]" : "bg-[#37a97c]"}`}
                                style={{ width: `${Math.min(100, attachPct * 2)}%` }}
                              />
                            </span>
                            <b className="text-purple w-[38px] text-right">{attachPct}%</b>
                            <span className={`text-[11px] w-[42px] ${delta >= 0 ? "text-[#0f7d55]" : "text-[#c0392b]"}`}>
                              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">{stat.ordersWith.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right">{stat.units.toLocaleString()}</td>
                        <td className="px-3 py-3 min-w-[150px]">
                          <div className="flex h-[9px] rounded-full overflow-hidden bg-lavender">
                            {PLACEMENTS.map((pg, i) => {
                              const u = stat.byPage.find((b) => b.page === pg)?.units ?? 0;
                              const pct = stat.units ? (u / stat.units) * 100 : 0;
                              return (
                                <span
                                  key={pg}
                                  title={`${PLACEMENT_LABEL[pg]} — ${Math.round(pct)}% (${u} units)`}
                                  style={{ width: `${pct}%`, background: PLACEMENT_COLOR[i] }}
                                />
                              );
                            })}
                          </div>
                          <div className="text-[13px] text-body-soft mt-1 truncate">
                            {(() => {
                              const best = [...stat.byPage].sort((a2, b2) => b2.units - a2.units)[0];
                              const pct = stat.units ? Math.round((best.units / stat.units) * 100) : 0;
                              return `mostly ${PLACEMENT_LABEL[best.page]} · ${pct}%`;
                            })()}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-purple">{formatTaka(stat.revenuePaisa)}</td>
                        <td className="px-3 py-3 text-right text-body-soft text-[11.5px]">
                          {stat.shown === null ? "tracking pending" : stat.shown.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          {!a.active ? (
                            <span className="text-[11.5px] bg-lavender text-body-soft px-2 py-1 rounded-full">Hidden</span>
                          ) : groupsOf(a.id).length === 0 ? (
                            <span className="text-[11.5px] bg-[#fff8ec] text-[#b45309] px-2 py-1 rounded-full">In no group</span>
                          ) : weak ? (
                            <span className="text-[11.5px] bg-[#fdecea] text-[#c0392b] px-2 py-1 rounded-full">Check price or photo</span>
                          ) : attachPct >= 30 ? (
                            <span className="text-[11.5px] bg-[#e8f6ef] text-[#0f7d55] px-2 py-1 rounded-full">Strong — push it wider</span>
                          ) : (
                            <span className="text-[11.5px] bg-lavender text-purple px-2 py-1 rounded-full">Doing fine</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* group + rule level */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="By group" sub="Which set is actually earning">
              <div className="flex flex-col gap-2.5">
                {groupPerf.map((g) => (
                  <div key={g.id} className="flex items-center gap-3">
                    <span className="text-[13px] text-purple font-medium w-[150px] shrink-0 truncate">{g.name}</span>
                    <span className="h-[9px] rounded-full bg-lavender flex-1 overflow-hidden">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${topGroupRev ? Math.max(3, (g.revenue / topGroupRev) * 100) : 3}%`,
                          background: `linear-gradient(90deg, ${groupTint(g.id, 0.65)}, ${groupTint(g.id, 1)})`,
                        }}
                      />
                    </span>
                    <b className="text-[13px] text-purple w-[86px] text-right">{formatTaka(g.revenue)}</b>
                  </div>
                ))}
                {groupPerf.length === 0 && <div className="text-[13px] text-body-soft">No groups yet.</div>}
              </div>
            </Card>

            <Card title="By rule" sub="Is the automation paying off?">
              <div className="flex flex-col gap-2.5">
                {rules.map((r) => {
                  const g = groups.find((x) => x.id === r.groupId);
                  const rev = g ? groupPerf.find((x) => x.id === g.id)?.revenue ?? 0 : 0;
                  const n = matchCount(r);
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-3 border border-lavender-deep rounded-[11px] px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-[12.5px] text-purple font-medium truncate">
                          {g?.name ?? "—"} <span className="text-body-soft font-normal">on {n} products</span>
                        </div>
                        <div className="text-[13px] text-body-soft truncate">
                          {FIELD_LABEL[r.field]}: {r.values.join(", ") || "no value picked"}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <b className="text-[13px] text-purple">{formatTaka(rev)}</b>
                        <div className="text-[13px] text-body-soft">{r.active ? "active" : "off"}</div>
                      </div>
                    </div>
                  );
                })}
                {rules.length === 0 && <div className="text-[13px] text-body-soft">No rules yet.</div>}
              </div>
            </Card>
          </div>

          <div className="flex gap-2.5 rounded-[14px] border-[1.5px] border-[#b8d4ea] bg-[#eef6fd] px-4 py-3 mt-4 text-[12.5px] text-[#1e4e79]">
            <span className="shrink-0"><Icon name="chart" size={18} /></span>
            <div>
              <b>Where each number comes from.</b> Orders, units, revenue and{" "}
              <b>which page the add-on was picked on</b> are read straight from our
              own order lines — exact, no outside tool involved. Every order line
              carries an <span className="font-mono">addedFrom</span> stamp
              (PRODUCT · CART · CHECKOUT) the moment it is created.
              &ldquo;Times shown&rdquo; is the one thing we cannot know yet — it
              needs storefront tracking (Funnel Phase 2). Until then attach rate
              is measured against total orders, which is the honest version of
              the question.
            </div>
          </div>
        </>
      )}

      <div className="flex gap-2.5 rounded-[14px] border-[1.5px] border-[#f0c88a] bg-[#fff8ec] px-4 py-3 mt-5 text-[12.5px] text-[#7a4b09]">
        <span className="text-[#b45309] shrink-0"><Icon name="bolt" size={18} /></span>
        <div>
          {demo
            ? "Demo data — the API had no add-ons yet, so these are samples held in memory."
            : "Saved to your database as you type."} Add-ons stay their own thing in the
          schema (<span className="font-mono">AddOn</span> ·{" "}
          <span className="font-mono">AddOnGroup</span> ·{" "}
          <span className="font-mono">AddOnGroupItem</span> ·{" "}
          <span className="font-mono">AddOnRule</span>) and never appear as
          products on the website.
        </div>
      </div>
    </div>
  );
}
