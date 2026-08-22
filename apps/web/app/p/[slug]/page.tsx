import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchProductDetail } from "../../_data/productApi";
import { formatTaka } from "../../_data/products";
import PdpView from "../../_components/Pdp/PdpView";
import SpecFaq from "../../_components/Pdp/SpecFaq";
import RelatedRail from "../../_components/Pdp/RelatedRail";
import ProductReviews from "../../_components/Pdp/ProductReviews";
import Reviews from "../../_components/GBE/Reviews";
import VisitStore from "../../_components/GBE/VisitStore";

/*
  One route — every product page goes through here.
  Lives at /p/<slug> since the flat-URL decision (owner, 22 Aug 2026).

  Page background tinted, content on a white card — the content zone and the
  empty space read as different things (FlowerAura pattern).

  The footer is in layout.tsx. GBE order (locked): Reviews → Visit Store → Footer.
*/

type Params = { slug: string };

/*
  ⚠️ `generateStaticParams` IS GONE, 31 Jul 2026.

  It listed the 71 slugs from `_data/products.ts` and pre-rendered a page for
  each at build time. Two things were wrong with that the moment the catalogue
  moved into the database: a product the owner adds in the admin is not on that
  list, and the pages that ARE on it would hold whatever price the build
  captured, for as long as the build lived.

  The page is now rendered per request. `cache: "no-store"` in `productApi.ts`
  means an edit in the admin shows on the next refresh — which is what the
  owner expects of a price. Putting ISR on top of this is a later, deliberate
  decision with a stated staleness window, not a default to drift into.
*/
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await fetchProductDetail(slug);
  if (!detail) return {};

  /*
    ═══════════════════════════════════════════════════════════════════════════
    DEC-PRD-024 — the Search & sharing tab reaches Google THROUGH HERE.

    The owner, 2 Aug 2026: *"Is this page connected to Google? Will it be
    published on Google the way I write it? And I don't understand what link
    to give for the image."*

    ⚠️ The answer was **no**. The six fields could be typed in the admin and
    the API sent them, but this function never read them — it built the title
    itself from the name and a fixed sentence. Whatever the owner wrote,
    Google saw something else. The exact mistake upgrades and variant
    swatches had: the admin existed, the API existed, nothing read them.

    ⚠️ Every field may stay empty, and then the fallbacks below run — telling
    the owner to fill six fields on every product means they never get filled.
    ═══════════════════════════════════════════════════════════════════════════
  */
  const seo = detail.seo;
  const price = formatTaka(detail.product.pricePaisa);

  const title = seo?.title?.trim() || `${detail.product.name} — ${price} | Radian`;
  /*  ⚠️ The fallback used to say "2 hours" — the last hidden copy of a
      retired promise, straight into Google's snippet. Fallbacks name no speed.  */
  const description =
    seo?.description?.trim() ||
    `${detail.nature.label}. ${detail.crumb.catLabel} delivered fast inside Dhaka, nationwide in 1–3 days.`;

  /*  The picture that travels to WhatsApp/Facebook. The owner's chosen image
      → else the product's first photo. ⚠️ A gallery entry can be CSS
      (`linear-gradient(...)`), so the address is only pulled from a real
      `url(...)` — otherwise the share card carried a broken-image mark.  */
  const firstPhoto = detail.gallery.find((g) => g.startsWith("url("));
  const shareImage =
    seo?.ogImageUrl?.trim() || firstPhoto?.slice(4, firstPhoto.indexOf(")")) || undefined;

  return {
    title,
    description,
    /*  ⚠️ "Keep this page out of Google" — `follow: true` stays, because the
        owner wants the PAGE hidden, not the links inside it.  */
    ...(seo?.noIndex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: seo?.ogTitle?.trim() || title,
      description: seo?.ogDescription?.trim() || description,
      type: "website",
      ...(shareImage ? { images: [{ url: shareImage }] } : {}),
    },
    twitter: {
      card: shareImage ? "summary_large_image" : "summary",
      title: seo?.ogTitle?.trim() || title,
      description: seo?.ogDescription?.trim() || description,
      ...(shareImage ? { images: [shareImage] } : {}),
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const detail = await fetchProductDetail(slug);

  /*  No such published product — or the catalogue could not be read at all.
      Both are a 404 on purpose: the one thing that must never happen here is
      a page that shows a product the shop does not have. See `productApi.ts`. */
  if (!detail) return notFound();

  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        {/* breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 flex-wrap py-4 text-[13.5px] text-body-soft"
        >
          <Link href="/" className="hover:text-orchid">
            Home
          </Link>
          <span className="text-lavender-deep">›</span>
          <Link href={`/${detail.crumb.catSlug}`} className="hover:text-orchid">
            {detail.crumb.catLabel}
          </Link>
          <span className="text-lavender-deep">›</span>
          <span className="text-purple font-semibold">{detail.crumb.short}</span>
        </nav>

        {/* content card */}
        <div className="bg-white rounded-[28px] shadow-soft p-5 sm:p-8 lg:p-10 mb-10">
          <PdpView detail={detail} />
        </div>

        <SpecFaq detail={detail} />

        {/*  DEC-WEB-005 — this product's OWN reviews, FlowerAura-style. Sits
            above the shop-wide GBE rail, so the PDP's #reviews anchor lands
            here (first match in document order) — on words about THIS bouquet,
            not about the shop in general.  */}
        <ProductReviews detail={detail} />

        <RelatedRail
          slugs={detail.crossSlugs}
          dhakaOnly={detail.product.zone === "dhaka"}
          /*  Real cards from the API. `?? []` and not `|| []` — an API that
              returns an empty list is saying the shop has nothing to suggest,
              and that answer must win over the mock catalogue. */
          items={detail.crossProducts ?? []}
        />

        <div className="pb-16" />
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
