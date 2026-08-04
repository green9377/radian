import type { CategoryConfig, CategorySection, SlotKey } from "./categories";
import { SLOTS } from "./categories";
import type { Product, ProductCategory, Occasion, Recipient } from "./products";
import type { ShopCategoryPage, ShopProduct } from "./shop";

/*
  ═══════════════════════════════════════════════════════════════════════════
  API → the shape the category page has always been given.

  Fourteen components read `CategoryConfig`. This file turns the API's answer
  into exactly that object, so not one of them changes, and the mock configs in
  `categories.ts` stay usable side by side as the fallback.

  It is the seam `categories.ts` was written for. Its own comment said so:

      ⇄ SWAP HERE — Ecommerce module lock হলে শুধু এই function বদলাবে
      Component গুলো জানবেই না যে কিছু বদলেছে।

  WHAT COMES FROM WHERE, now that both exist:

    the admin  — name, description, banner, SEO, which sections are on, the
                 wording above each one, every tile, the FAQ, the products
    the code   — the ORDER of the sections, and the fallback wording of any
                 section the owner has not written words for yet (D-CAT-04)

  The order is not sent by the server and must never be. Fourteen sections in
  an arbitrary order is an untested page, and a bad order costs sales quietly.
  ═══════════════════════════════════════════════════════════════════════════
*/

/**
 * Section order and default wording, from the code.
 *
 * The API returns the same fourteen keys in the same order — the manifest in
 * `storefront/layout.ts` mirrors SLOTS deliberately — but this walks SLOTS
 * rather than the response, so a server that goes out of step cannot reorder
 * the page. It can only switch sections off and rename them.
 */
/** the two a sub-category page keeps — D42/D43, see `toCategoryConfig` */
const LEAN_SLOTS = new Set<SlotKey>(["banner", "productGrid"]);

function sections(page: ShopCategoryPage, lean = false): CategorySection[] {
  const byKey = new Map(page.sections.map((s) => [s.key, s]));

  return SLOTS.map(({ slot, base }) => {
    const s = byKey.get(slot as SlotKey);
    if (!s) return base; // a section the API does not know about yet: leave it as shipped
    return {
      ...base,
      slot,
      enabled: s.enabled && (!lean || LEAN_SLOTS.has(slot)),
      eyebrow: s.copy?.eyebrow ?? base.eyebrow,
      heading: s.copy?.title ?? base.heading,
      subheading: s.copy?.subtitle ?? base.subheading,
      // decoration the shop can set per section — see `CategorySection`
      icon: (s.config.icon as string) ?? null,
      iconUrl: (s.config.iconUrl as string) ?? null,
      bgImageUrl: (s.config.bgImageUrl as string) ?? null,
    };
  });
}

/**
 * One product card.
 *
 * `cat` and the tag arrays are cast: the mock file declared them as unions of
 * the eight slugs and eight occasions that existed when it was written, and
 * the shop can now name a category or an occasion anything it likes. The cast
 * lives here, once, rather than widening a type that the mock data still
 * relies on for its own safety.
 */
export const toProduct = (p: ShopProduct): Product => ({
  slug: p.slug,
  name: p.name,
  pricePaisa: p.pricePaisa,
  cat: p.cat as ProductCategory,
  sub: p.sub ?? undefined,
  zone: p.zone,
  badge: p.badge,
  stars: p.stars,
  meta: p.meta,
  // a real photograph if there is one; the API's gradient if there is not
  bg: p.imageUrl ? `url(${p.imageUrl}) center/cover` : p.bg,
  best: p.best,
  exp: p.exp,
  sd: p.sd,
  mn: p.mn,
  neu: p.neu,
  occ: p.occ as Occasion[],
  rec: p.rec as Recipient[],
  prepaidOnly: p.prepaidOnly,
});

/**
 * `lean` — the sub-category page (D42/D43).
 *
 * A sub-page is the end of the journey, not another place to browse from:
 * somebody who has already pressed Roses wants roses, not a fresh set of rails
 * offering them lilies. So everything except the banner and the grid is
 * switched off, in code rather than as fourteen admin settings per
 * sub-category — forty-four sub-pages would otherwise be six hundred switches
 * nobody will ever visit.
 */
export function toCategoryConfig(page: ShopCategoryPage, opts?: { lean?: boolean }): CategoryConfig {
  return {
    slug: page.slug,
    cat: page.slug as ProductCategory,
    parent: page.parent ?? undefined,
    label: page.label,
    h1: page.h1,
    lead: page.lead,
    // The panel stays a tint, always. The photograph goes in the arch beside
    // the words — see `bannerImageUrl` in `categories.ts` for why.
    bannerBg: page.bannerBg,
    bannerImageUrl: page.bannerUrl,
    promises: page.promises,
    totalProducts: page.totalProducts,
    seo: { title: page.seo.title, description: page.seo.description },
    sections: sections(page, opts?.lean),

    subCategories: page.subCategories.map((t) => ({
      label: t.label,
      sub: t.sub ?? undefined,
      href: t.href,
      bg: t.imageUrl ? `url(${t.imageUrl}) center/cover` : t.bg,
    })),
    attributes: page.attributes.map((t) => ({
      label: t.label,
      sub: t.sub ?? undefined,
      href: t.href,
      bg: t.imageUrl ? `url(${t.imageUrl}) center/cover` : t.bg,
    })),
    occasions: page.occasions.map((t) => ({
      label: t.label,
      sub: t.sub ?? undefined,
      href: t.href,
      bg: t.imageUrl ? `url(${t.imageUrl}) center/cover` : t.bg,
    })),

    /*
      ── ছবি আগে, রঙ পরে · মালিকের নিয়ম ১ আগস্ট ২০২৬ ─────────────────────────
      *"color size flavour … সব size আকারে আমরা product page-এ দেখাতে পারব,
      আর image দিয়ে দেখাতে চাইলে আমরা category page-এ দেখাব।"*

      ⚠️ এখানে ঠিক উল্টো ছিল: `c.swatch || (c.imageUrl ? … )` — রঙ থাকলে
      রঙই জিতত, আর ছবিটা কখনো দেখা যেত না। কিন্তু একটা মানের **দুটোই**
      থাকে (রঙ product page-এর pill-এর জন্য, ছবি এই page-এর card-এর জন্য),
      তাই রঙ প্রায় সবসময়ই থাকত — মানে ছবি প্রায় কখনোই না।

      Category page-এর কাজই ছবি দিয়ে দেখানো, তাই এখানে ছবি আগে। ছবি না
      থাকলে রঙ, আর তাও না থাকলে system-এর সবচেয়ে হালকা lavender — কারণ
      `background: null` মানে পাতায় একটা কালো পাপড়ি।
    */
    colours: page.colours.map((c) => ({
      label: c.label,
      sub: c.sub,
      swatch: c.imageUrl
        ? `url(${c.imageUrl}) center/cover`
        : c.swatch || "#EDE4F5",
      href: c.href,
    })),

    budgets: page.budgets.map((b) => ({
      kicker: b.kicker ?? "",
      label: b.label,
      href: b.href,
      bg: b.bg,
    })),
    combos: page.combos.map((t) => ({
      label: t.label,
      sub: t.sub ?? undefined,
      href: t.href,
      bg: t.imageUrl ? `url(${t.imageUrl}) center/cover` : t.bg,
    })),
    crossSell: page.crossSell.map((t) => ({
      label: t.label,
      sub: t.sub ?? undefined,
      href: t.href,
      bg: t.imageUrl ? `url(${t.imageUrl}) center/cover` : t.bg,
    })),

    faqs: page.faqs.map((f) => ({ q: f.question, a: f.answer })),
  };
}
