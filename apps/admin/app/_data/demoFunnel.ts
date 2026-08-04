import type {
  ApiCatalogFunnel,
  ApiFunnelItem,
  ApiProduct,
  ApiProductAnalytics,
} from "./api";
import { DEMO_PRODUCTS } from "./demoProducts";

/*
  DEMO funnel — used when the API has no orders yet, so the Funnel and Analysis
  screens can be judged with real-looking numbers. In demo mode the top of the
  funnel (views / carts / checkouts) is filled in too, so you can see exactly
  how the page will look once web-analytics tracking is connected.
*/

type Seed = {
  slug: string;
  views: number;
  carts: number;
  checkouts: number;
  orders: number;
  delivered: number;
  cancelled: number;
  refundPaisa?: number;
};

/* deliberately varied so each leak type is visible */
const SEEDS: Seed[] = [
  { slug: "velvet-red-24-premium-roses", views: 3120, carts: 402, checkouts: 288, orders: 241, delivered: 233, cancelled: 6 },
  { slug: "blush-romance-12-pink-roses", views: 2480, carts: 286, checkouts: 201, orders: 168, delivered: 164, cancelled: 3 },
  { slug: "chocolate-fudge-cake", views: 1960, carts: 244, checkouts: 178, orders: 151, delivered: 146, cancelled: 4 },
  { slug: "red-velvet-cream-cheese", views: 1610, carts: 198, checkouts: 149, orders: 128, delivered: 121, cancelled: 5 },
  { slug: "midnight-rose-heart", views: 1120, carts: 141, checkouts: 108, orders: 96, delivered: 93, cancelled: 2 },
  // leaks at view → cart (page problem: price / photo)
  { slug: "rose-gold-premium-hamper", views: 3240, carts: 92, checkouts: 61, orders: 41, delivered: 39, cancelled: 2 },
  // leaks at checkout (delivery / payment friction)
  { slug: "signature-radian-gift-box", views: 2880, carts: 388, checkouts: 152, orders: 96, delivered: 92, cancelled: 4 },
  // high cancellation (stock / lead-time problem)
  { slug: "photo-print-birthday-cake", views: 940, carts: 138, checkouts: 104, orders: 84, delivered: 61, cancelled: 23, refundPaisa: 264000 },
  { slug: "lindt-luxury-selection", views: 760, carts: 88, checkouts: 69, orders: 61, delivered: 59, cancelled: 2 },
  { slug: "ferrero-bloom-bouquet", views: 690, carts: 61, checkouts: 44, orders: 36, delivered: 35, cancelled: 1 },
  { slug: "money-plant-ceramic-pot", views: 520, carts: 74, checkouts: 58, orders: 51, delivered: 50, cancelled: 1 },
  { slug: "vanilla-butter-cream-1kg", views: 610, carts: 92, checkouts: 71, orders: 62, delivered: 60, cancelled: 2 },
  { slug: "birthday-balloon-bouquet", views: 430, carts: 48, checkouts: 36, orders: 31, delivered: 30, cancelled: 1 },
  { slug: "white-orchid-elegance", views: 880, carts: 96, checkouts: 71, orders: 58, delivered: 56, cancelled: 2 },
  // published but nothing sells
  { slug: "pastel-birthday-arch", views: 210, carts: 6, checkouts: 2, orders: 0, delivered: 0, cancelled: 0 },
  { slug: "sunrise-gerbera-basket", views: 168, carts: 4, checkouts: 1, orders: 0, delivered: 0, cancelled: 0 },
];

function itemFor(s: Seed): ApiFunnelItem | null {
  const p = DEMO_PRODUCTS.find((x) => x.slug === s.slug);
  if (!p) return null;
  const unitMargin = p.offerPricePaisa - p.costPaisa;
  return {
    productId: p.id,
    slug: p.slug,
    sku: p.sku ?? null,
    name: p.name,
    categoryId: p.category?.id ?? null,
    categoryName: p.category?.name ?? null,
    isPublished: p.isPublished,
    stockQty: p.stockQty,
    orders: s.orders,
    cancelled: s.cancelled,
    delivered: s.delivered,
    units: s.orders,
    revenuePaisa: s.orders * p.offerPricePaisa,
    refundPaisa: s.refundPaisa ?? 0,
    marginPaisa: s.orders * unitMargin,
    views: s.views,
    addToCarts: s.carts,
    checkouts: s.checkouts,
  };
}

export const DEMO_FUNNEL: ApiCatalogFunnel = (() => {
  const items = SEEDS.map(itemFor).filter(Boolean) as ApiFunnelItem[];
  const totals = items.reduce(
    (t, i) => ({
      orders: t.orders + i.orders,
      delivered: t.delivered + i.delivered,
      cancelled: t.cancelled + i.cancelled,
      units: t.units + i.units,
      revenuePaisa: t.revenuePaisa + i.revenuePaisa,
      refundPaisa: t.refundPaisa + i.refundPaisa,
      marginPaisa: t.marginPaisa + i.marginPaisa,
    }),
    { orders: 0, delivered: 0, cancelled: 0, units: 0, revenuePaisa: 0, refundPaisa: 0, marginPaisa: 0 },
  );
  return { days: 30, trackingConnected: true, totals, items };
})();

/** stage totals for the catalog funnel (demo only — real mode has no views) */
export const DEMO_FUNNEL_STAGES = DEMO_FUNNEL.items.reduce(
  (t, i) => ({
    views: t.views + (i.views ?? 0),
    carts: t.carts + (i.addToCarts ?? 0),
    checkouts: t.checkouts + (i.checkouts ?? 0),
  }),
  { views: 0, carts: 0, checkouts: 0 },
);

/* deterministic pseudo-random so the chart is stable between reloads */
function seeded(slug: string, i: number) {
  let h = 0;
  for (const c of slug + i) h = (h * 31 + c.charCodeAt(0)) % 1000;
  return h / 1000;
}

/**
 * Demo analytics for ANY product — including real ones straight from the API
 * that simply have no orders yet. Numbers are derived from the slug so they
 * stay identical between reloads, and money uses the product's own price/cost.
 */
export function demoAnalyticsFor(
  product: ApiProduct,
  days: number,
): ApiProductAnalytics {
  const s = (n: number) => seeded(product.slug, n);
  const views = Math.round(180 + s(1) * 3000);
  const cartRate = 0.03 + s(2) * 0.14; // 3% – 17%
  const addToCarts = Math.max(1, Math.round(views * cartRate));
  const checkouts = Math.max(1, Math.round(addToCarts * (0.45 + s(3) * 0.45)));
  const orders = Math.max(0, Math.round(checkouts * (0.55 + s(4) * 0.4)));
  const cancelled = Math.round(orders * (s(5) * 0.18));
  const delivered = Math.max(0, orders - cancelled);
  const scale = days / 30;

  const nOrders = Math.max(0, Math.round(orders * scale));
  const unitMargin = product.offerPricePaisa - product.costPaisa;

  const daily: ApiProductAnalytics["daily"] = [];
  let left = nOrders;
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    const share = seeded(product.slug, d + 40);
    const n =
      d === 0
        ? left
        : Math.min(left, Math.round((nOrders / days) * (0.4 + share * 1.6)));
    left -= n;
    daily.push({
      date,
      orders: n,
      units: n,
      revenuePaisa: n * product.offerPricePaisa,
    });
  }

  return {
    days,
    trackingConnected: true,
    product,
    funnel: {
      views: Math.round(views * scale),
      addToCarts: Math.round(addToCarts * scale),
      checkouts: Math.round(checkouts * scale),
      orders: nOrders,
      delivered: Math.round(delivered * scale),
      cancelled: Math.round(cancelled * scale),
    },
    money: {
      units: nOrders,
      revenuePaisa: nOrders * product.offerPricePaisa,
      refundPaisa: Math.round(cancelled * scale) * Math.round(product.offerPricePaisa * 0.4),
      marginPaisa: nOrders * unitMargin,
    },
    daily,
  };
}

export function demoProductAnalytics(
  slug: string,
  days: number,
): ApiProductAnalytics | null {
  const p = DEMO_PRODUCTS.find((x) => x.slug === slug);
  const item = DEMO_FUNNEL.items.find((x) => x.slug === slug);
  if (!p || !item) return null;

  const scale = days / 30;
  const orders = Math.max(0, Math.round(item.orders * scale));
  const daily: ApiProductAnalytics["daily"] = [];
  let left = orders;
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    const share = seeded(slug, d);
    const n = d === 0 ? left : Math.min(left, Math.round((orders / days) * (0.4 + share * 1.6)));
    left -= n;
    daily.push({
      date,
      orders: n,
      units: n,
      revenuePaisa: n * p.offerPricePaisa,
    });
  }

  const unitMargin = p.offerPricePaisa - p.costPaisa;
  return {
    days,
    trackingConnected: true,
    product: p,
    funnel: {
      views: Math.round((item.views ?? 0) * scale),
      addToCarts: Math.round((item.addToCarts ?? 0) * scale),
      checkouts: Math.round((item.checkouts ?? 0) * scale),
      orders,
      delivered: Math.round(item.delivered * scale),
      cancelled: Math.round(item.cancelled * scale),
    },
    money: {
      units: orders,
      revenuePaisa: orders * p.offerPricePaisa,
      refundPaisa: Math.round(item.refundPaisa * scale),
      marginPaisa: orders * unitMargin,
    },
    daily,
  };
}
