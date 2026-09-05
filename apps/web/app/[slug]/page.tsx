import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { getCategoryConfig } from "../_data/categories";
import { toCategoryConfig, toProduct } from "../_data/categoryApi";
import { getCategoryPage, getCollectionDetail, getShopProducts } from "../_data/shop";
import CategorySections from "../_components/Category/CategorySections";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";

/*
  ══════════════════════════════════════════════════════════════════════════
  One route, every category — now from the admin rather than a list in code.

  WHAT CHANGED, 31 Jul 2026, and why it was done first:

  This page used to render from `CATEGORY_SLUGS`, eight slugs hard-coded in
  `_data/categories.ts`. A category created in the admin appeared on the
  homepage rail and 404'd when clicked — found during the homepage connection
  on 30 Jul and deliberately left alone, because the only quick fix would have
  filled a real category with products out of the mock array. A 404 is a
  visible failure; that would have been an invisible lie.

  Now the slug is asked of the API. Anything the shop creates works, anything
  it deactivates stops working, and neither needs a developer.

  WHY THIS IS A SERVER COMPONENT (D-CAT-05). A "flower delivery in Dhaka" search lands here,
  not on the homepage — this is the page Google actually indexes, and a page
  that assembles itself in the browser hands it an empty shell. The zone comes
  from a cookie so the server can pick the right products before rendering;
  `ZoneSync` keeps that cookie level with the zone store in the browser.

  THE MOCK IS STILL THE FALLBACK — for everything except products. If the API
  is unreachable, one of the eight original categories still renders its
  layout and its wording from `_data/categories.ts`. It does NOT render mock
  products at mock prices: a slow API is not a reason to advertise things the
  shop may not have. Products fail to an empty grid that says so.
  ══════════════════════════════════════════════════════════════════════════
*/

type Params = { slug: string };

/** what the zone store put there — anything else is treated as unset */
async function zoneFromCookie(): Promise<"dhaka" | "bangladesh" | null> {
  const c = await cookies();
  const v = c.get("radian-zone")?.value;
  return v === "bangladesh" || v === "dhaka" ? v : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getCategoryPage(slug, null);

  if (page) {
    return {
      title: page.seo.title,
      description: page.seo.description,
      // an unfinished or private category can be kept out of Google from the
      // admin — the same escape hatch products and brands already have
      robots: page.seo.noIndex ? { index: false, follow: false } : undefined,
      openGraph: {
        title: page.seo.ogTitle ?? page.seo.title,
        description: page.seo.ogDescription ?? page.seo.description,
        images: page.seo.ogImageUrl ? [page.seo.ogImageUrl] : undefined,
      },
    };
  }

  const fallback = getCategoryConfig(slug);
  return fallback ? { title: fallback.seo.title, description: fallback.seo.description } : {};
}

const withoutBudget = (f: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(f).filter(([k]) => k !== "budget"));

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const zone = await zoneFromCookie();
  const sp = await searchParams;

  /*
    The tiles on this page link back to this page with a filter on the query
    string — `?colour=red`, `?occasions=birthday`, `?min=1500&max=3000`. They
    are read here and sent to the API, so the grid shows the filtered set on
    the FIRST render. Filtering in the browser after the fact would mean the
    shopper watches the wrong products appear and then vanish, and Google would
    index the unfiltered page under the filtered address.
  */
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && v ? v : undefined;
  };
  /*
    ⚠️ THE SECOND NAME ON TWO OF THESE IS NOT TIDINESS — IT IS THE OLD LINK.

    Tiles used to be written `?style=bouquet` and the delivery band still says
    `?delivery=express`, and neither word was ever read here: those tiles
    reloaded the page unfiltered and looked broken to nobody in particular.
    The links themselves are fixed (see `tagTiles` and `CategoryDelivery`), but
    a bookmark, an ad or a shared message carrying the old spelling must keep
    working, so both spellings are accepted and only one is sent on.
  */
  /*
    The Gift Finder on this page (5 Sep 2026) ends here with `?recipients=`,
    `?occasions=` and `?budget=<price-range collection>` — the same address
    shape the homepage's finder sends to /products, but kept on this category
    so the answer is "roses for mom under ৳2,000", never every gift in the
    shop. A budget slug becomes its collection's price window before the API
    is asked, so the grid is right on the first render.
  */
  const budgetSlug = one("budget");
  const budget = budgetSlug ? await getCollectionDetail(budgetSlug, zone) : null;
  const filters = {
    colour: one("colour"),
    occasion: one("occasions") ?? one("occasion"),
    tag: one("tag") ?? one("style"),
    recipient: one("recipients"),
    budget: budgetSlug,
    min: one("min") ?? (budget?.minPaisa != null ? String(Math.round(budget.minPaisa / 100)) : undefined),
    max: one("max") ?? (budget?.maxPaisa != null ? String(Math.round(budget.maxPaisa / 100)) : undefined),
    speed: one("speed") ?? one("delivery"),
    sort: one("sort") ?? "popular",
  };

  const page = await getCategoryPage(slug, zone);

  if (!page) {
    // API unreachable, or the slug names nothing live. One of the original
    // eight still has a layout in code; anything else is a 404, as it should be.
    const fallback = getCategoryConfig(slug);
    if (!fallback) return notFound();
    return (
      <main>
        <CategorySections config={fallback} />
        <Reviews />
        <VisitStore />
      </main>
    );
  }

  /*
    The first page of the grid only. The grid asks for the rest itself as the
    shopper presses Load More, rather than the server writing the entire
    catalogue into the HTML of every category page.
  */
  // `budget` is already the window above — the API never sees the slug
  const list = await getShopProducts({ category: slug, zone, limit: 24, ...withoutBudget(filters) });

  const config = toCategoryConfig(page);
  // with a filter on, the count under the grid must be the filtered count —
  // "24 of 312" beside twelve red roses is a lie about what was found
  const filtered = Object.entries(filters).some(([k, v]) => k !== "sort" && v);

  return (
    <main>
      <CategorySections
        config={filtered && list ? { ...config, totalProducts: list.total } : config}
        filters={filters}
        products={(list?.items ?? []).map(toProduct)}
        rails={{
          bestsellers: page.rails.bestsellers.map(toProduct),
          readyToday: page.rails.readyToday.map(toProduct),
        }}
        apiSlug={slug}
        apiZone={zone}
        /* the raw rows — the sections the owner added ride along with these */
        blocks={page.sections}
        /* products could not be read — the grid says so rather than looking
           like a category nobody has filled in */
        productsFailed={list === null}
      />
      <Reviews />
      <VisitStore />
    </main>
  );
}
