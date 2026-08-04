import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchProductDetail } from "../../_data/productApi";
import { formatTaka } from "../../_data/products";
import PdpView from "../../_components/Pdp/PdpView";
import SpecFaq from "../../_components/Pdp/SpecFaq";
import RelatedRail from "../../_components/Pdp/RelatedRail";
import Reviews from "../../_components/GBE/Reviews";
import VisitStore from "../../_components/GBE/VisitStore";

/*
  একটাই route — ৭১টা product এখান দিয়ে যায়।
  নতুন product = _data/products.ts-এ একটা entry। এই file-এ হাত পড়বে না।

  Page background tinted, content white card-এ — content zone আর খালি জায়গা
  আলাদা দেখায় (FlowerAura pattern)।

  Footer layout.tsx-এ আছে। GBE order (locked): Reviews → Visit Store → Footer.
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
    DEC-PRD-024 — Search & sharing tab এখান দিয়েই Google-এ পৌঁছায়।

    মালিক, ২ আগস্ট ২০২৬: *"এই page-এ কি Google-এর সাথে connect করা? যেভাবে
    লিখব সেভাবে Google-এ published হবে? আর image-এর কীসের link দেব বুঝলাম না।"*

    ⚠️ উত্তর ছিল **না**। ছয়টা ঘর admin-এ লেখা যেত, API পাঠাতও, কিন্তু এই
    function সেগুলো পড়তই না — নিজে নাম আর একটা বাঁধা বাক্য দিয়ে title
    বানাত। অর্থাৎ মালিক যা-ই লিখুন, Google দেখত অন্য কিছু। ঠিক এই ভুলটাই
    upgrade আর variant swatch-এ হয়েছিল: admin ছিল, API ছিল, পড়ার জায়গা ছিল না।

    ⚠️ প্রতিটা ঘর খালি রাখা যায়, আর তখন নিচের fallback চলে — মালিককে ৭১টা
    product-এ ছয়টা করে ঘর ভরতে বলা মানে সেগুলো কখনো ভরা হবে না।
    ═══════════════════════════════════════════════════════════════════════════
  */
  const seo = detail.seo;
  const price = formatTaka(detail.product.pricePaisa);

  const title = seo?.title?.trim() || `${detail.product.name} — ${price} | Radian`;
  /*  ⚠️ fallback-এ "2 hours" ছিল — অবসরপ্রাপ্ত প্রতিশ্রুতিটার শেষ লুকানো
      কপি, সরাসরি Google-এর snippet-এ। Fallback গতির নাম নেয় না।  */
  const description =
    seo?.description?.trim() ||
    `${detail.nature.label}. ${detail.crumb.catLabel} delivered fast inside Dhaka, nationwide in 1–3 days.`;

  /*  WhatsApp/Facebook-এ যে ছবিটা যায়। মালিকের দেওয়া ছবি → নাহলে
      product-এর প্রথম ছবি। ⚠️ gallery-র entry CSS হতে পারে
      (`linear-gradient(...)`), তাই শুধু সত্যিকারের `url(...)` থেকেই
      ঠিকানাটা বের করা হয় — নাহলে share card-এ ভাঙা ছবির চিহ্ন যেত।  */
  const firstPhoto = detail.gallery.find((g) => g.startsWith("url("));
  const shareImage =
    seo?.ogImageUrl?.trim() || firstPhoto?.slice(4, firstPhoto.indexOf(")")) || undefined;

  return {
    title,
    description,
    /*  ⚠️ "Keep this page out of Google" — `follow: true` রাখা হয়, কারণ
        মালিক page-টা লুকাতে চান, তার ভেতরের link-গুলোকে নয়।  */
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
          <Link href={`/categories/${detail.crumb.catSlug}`} className="hover:text-orchid">
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
