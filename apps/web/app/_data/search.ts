import type { Zone } from "../_store/useZoneStore";
import {
  zoneFilter,
  type Occasion,
  type Product,
  type ProductCategory,
} from "./products";
import { getShopProducts, zoneCode } from "./shop";
import { toProduct } from "./categoryApi";

/*
  ═══════════════════════════════════════════════════════════════════
  SEARCH ENGINE — pure, zero side-effects।

  Header search box + /search page দুটোই এই একটা function-এ ভর করে।
  কোনো component নিজে matching করে না (D23-এর একই যুক্তি: এক rule,
  এক জায়গা)।

  ── কী field-এ মেলে (সোবুজ approved) ─────────────────────────────
  name + category + sub + occasion। name-এ match সবচেয়ে ভারী।
  rec (her/him) ইচ্ছাকৃতভাবে বাদ — সেটা Gift Finder-এর কাজ,
  নইলে "friend" লিখলেই প্রায় পুরো ক্যাটালগ আসবে।

  ── zone (§৫) ────────────────────────────────────────────────────
  প্রতিটা list-এ zoneFilter লাগে। All Bangladesh = শুধু courier-safe
  (zone "both") product। null zone = সব দেখায়।

  ── AND across tokens ────────────────────────────────────────────
  "pink roses" লিখলে দুটো শব্দই কোথাও না কোথাও মিলতে হবে — নইলে
  "pink" ওয়ালা সব কিছু চলে আসত। এক token কিছুতেই না মিললে product বাদ।

  ⇄ SWAP HERE — Ecommerce module lock হলে searchProducts()-এর ভেতরটা
  `fetch('/api/search?q=')` হবে; component-এ একটা লাইনও বদলাবে না।
  ═══════════════════════════════════════════════════════════════════
*/

/** Category → মানুষ যে শব্দে খোঁজে (synonym সহ) */
const CAT_TERMS: Record<ProductCategory, string[]> = {
  flowers: ["flower", "flowers", "bloom", "blooms", "bouquet"],
  cakes: ["cake", "cakes"],
  balloons: ["balloon", "balloons"],
  chocolates: ["chocolate", "chocolates", "choco"],
  giftboxes: ["gift box", "gift boxes", "giftbox", "hamper", "hampers", "gift"],
  combos: ["combo", "combos", "bundle", "bundles"],
  plants: ["plant", "plants"],
  personalised: [
    "personalised",
    "personalized",
    "custom",
    "customised",
    "photo",
    "engraved",
    "name",
  ],
};

/** Occasion → মানুষ যে শব্দে খোঁজে (synonym সহ) */
const OCC_TERMS: Record<Occasion, string[]> = {
  birthday: ["birthday", "birthdays"],
  anniversary: ["anniversary", "anniversaries"],
  love: ["love", "romance", "romantic", "valentine", "valentines"],
  congratulations: ["congratulations", "congrats", "congratulation"],
  "get-well": ["get well", "get-well", "getwell", "recovery"],
  sorry: ["sorry", "apology", "apologise", "apologize"],
  corporate: ["corporate", "office", "business"],
  "just-because": ["just because", "just-because"],
};

/** Product-এর সব searchable text এক haystack-এ (weight অনুযায়ী আলাদা) */
interface Haystack {
  name: string;
  cat: string;
  sub: string;
  occ: string;
}

function buildHaystack(p: Product): Haystack {
  return {
    name: p.name.toLowerCase(),
    cat: CAT_TERMS[p.cat].join(" "),
    sub: (p.sub ?? "").toLowerCase().replace(/-/g, " "),
    occ: (p.occ ?? []).flatMap((o) => OCC_TERMS[o]).join(" "),
  };
}

/*
  এক token-এর সর্বোচ্চ score। name সবচেয়ে ভারী, তারপর cat > sub > occ।
  একটা token কোথাও না মিললে 0 ফেরত — caller সেই product বাদ দেয় (AND)।
*/
function tokenScore(t: string, h: Haystack): number {
  if (h.name.includes(t)) return 40;
  if (h.cat.includes(t)) return 18;
  if (h.sub.includes(t)) return 15;
  if (h.occ.includes(t)) return 12;
  return 0;
}

function scoreProduct(p: Product, tokens: string[], qFull: string): number {
  const h = buildHaystack(p);

  // পুরো query হুবহু নামে থাকলে — সবচেয়ে relevant, একদম উপরে
  let score = h.name.includes(qFull) ? 100 : 0;

  for (const t of tokens) {
    const s = tokenScore(t, h);
    if (s === 0) return 0; // এক token-ও না মিললে বাদ (AND)
    score += s;
  }
  return score;
}

/** query-কে normalize করে token-এ ভাঙে */
function tokenize(query: string): { qFull: string; tokens: string[] } {
  const qFull = query.trim().toLowerCase();
  const tokens = qFull.split(/\s+/).filter(Boolean);
  return { qFull, tokens };
}

/*
  ⚠️ `searchProducts()` — THE SYNCHRONOUS ONE — IS GONE (9 Sep 2026). It
  searched `PRODUCTS`, the hand-written catalogue, so a shopper could be shown
  a product the shop does not sell. `searchProductsLive` below asks the shop.
  The scoring helpers above are kept for the day ranking moves to the server.
*/

/*
  ═══ THE SWAP, taken 4 Aug 2026 — exactly as the header foretold ═══

  `searchProducts` above searched the MOCK. On the live shop that meant the
  search box was a liar in both directions: it FOUND 71 bouquets nobody could
  buy, and it MISSED every product the owner had actually uploaded. Typing the
  exact name of a real product returned nothing.

  `searchProductsLive` asks `/shop/products?search=` — the same
  contains-match on name and slug the admin's own hand-pick box uses. The
  fancy scoring above is not ported: fuzzy ranking over data that is WRONG is
  worth less than plain matching over data that is TRUE. If ranking is ever
  wanted, it belongs on the server where the whole catalogue is.

  ⚠️ null = the shop could not be reached. The old sync function's [] meant
  "no matches", and reusing it for failure would show "No matches for
  'roses'" over a network blip — a false answer. The view says "couldn't
  search right now" instead.
*/
export async function searchProductsLive(
  query: string,
  zone: Zone | null,
): Promise<Product[] | null> {
  const q = query.trim();
  if (!q) return [];
  const res = await getShopProducts({
    search: q,
    zone: zoneCode(zone) ?? undefined,
    limit: 48,
  });
  if (!res) return null;
  return res.items.map(toProduct);
}

/**
 * খালি ফলাফলের fallback — zone-এর জনপ্রিয় product, এখন আসল বিক্রির গোনা
 * থেকে (`salesCount` → sort=popular)। "এগুলো match" বলে চালানো হয় না; আলাদা
 * "জনপ্রিয়" heading-এ বসে (Constitution: মিথ্যা প্রতিশ্রুতি নয়)।
 */
export async function popularProductsLive(
  zone: Zone | null,
  limit = 8,
): Promise<Product[]> {
  const res = await getShopProducts({
    sort: "popular",
    zone: zoneCode(zone) ?? undefined,
    limit,
  });
  return res ? res.items.map(toProduct) : [];
}
