import type { ProductDetail } from "../../_data/productDetails";

/*
  Structured data for a product page (owner, 6 Sep 2026) — what Google reads
  for a rich result (price, stock, stars, picture under the blue link).

  Owner, 7 Sep 2026: a product with variants goes to Google AS ITS VARIANTS —
  a ProductGroup, and under it one Product per combination with its own name,
  price, stock and SKU (Google's own shape for this). A product without
  variants is one Product with one Offer. The SKU is the ecommerce code from
  the admin's Basics tab; a variant's is its linked stockroom Item's code, else
  the product code with the option names. The SKU appears here as
  DATA only — it is never rendered as text on the page.

  Everything in it is the page's own data; nothing is written here.
*/

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://radianbd.com").replace(/\/$/, "");
const money = (paisa: number) => (paisa / 100).toFixed(2);

function availabilityUrl(state: "IN_STOCK" | "OUT_OF_STOCK" | "PRE_ORDER") {
  return state === "OUT_OF_STOCK"
    ? "https://schema.org/OutOfStock"
    : state === "PRE_ORDER"
      ? "https://schema.org/PreOrder"
      : "https://schema.org/InStock";
}

export default function ProductJsonLd({ detail, siteName }: { detail: ProductDetail; siteName: string }) {
  const { product, crumb } = detail;
  const url = `${SITE}/p/${product.slug}`;
  const state = detail.availability?.state ?? "IN_STOCK";
  const variants = detail.variants ?? [];

  const common: Record<string, unknown> = {
    url,
    ...(detail.gallery.length ? { image: detail.gallery } : {}),
    ...(detail.shortDesc ? { description: detail.shortDesc } : {}),
    brand: { "@type": "Brand", name: siteName },
    ...(detail.reviews.count > 0 && detail.reviews.rating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: detail.reviews.rating,
            reviewCount: detail.reviews.count,
          },
        }
      : {}),
  };
  const offer = (pricePaisa: number, avail: string, sku?: string | null) => ({
    "@type": "Offer",
    url,
    priceCurrency: "BDT",
    price: money(pricePaisa),
    availability: avail,
    itemCondition: "https://schema.org/NewCondition",
    ...(sku ? { sku } : {}),
    ...(detail.offer?.endsAtMs ? { priceValidUntil: new Date(detail.offer.endsAtMs).toISOString().slice(0, 10) } : {}),
  });

  const productNode: Record<string, unknown> =
    variants.length > 0
      ? {
          "@type": "ProductGroup",
          name: product.name,
          ...common,
          ...(detail.sku ? { productGroupID: detail.sku } : {}),
          variesBy: [...new Set(variants.flatMap((v) => (v.parts ?? []).map((p) => p.attribute)))],
          hasVariant: variants.map((v) => ({
            "@type": "Product",
            name: `${product.name} — ${v.label}`,
            ...(v.sku ? { sku: v.sku } : {}),
            ...(v.imageUrl ? { image: v.imageUrl } : {}),
            offers: offer(v.pricePaisa, availabilityUrl(v.soldOut ? "OUT_OF_STOCK" : "IN_STOCK"), v.sku),
          })),
        }
      : {
          "@type": "Product",
          name: product.name,
          ...common,
          ...(detail.sku ? { sku: detail.sku } : {}),
          offers: offer(product.pricePaisa, availabilityUrl(state), detail.sku),
        };

  const graph = [
    productNode,
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { name: "Home", item: `${SITE}/` },
        { name: crumb.catLabel, item: `${SITE}/${crumb.catSlug}` },
        ...(crumb.subSlug && crumb.subLabel
          ? [{ name: crumb.subLabel, item: `${SITE}/${crumb.catSlug}/${crumb.subSlug}` }]
          : []),
        { name: product.name, item: url },
      ].map((r, i) => ({ "@type": "ListItem", position: i + 1, ...r })),
    },
  ];

  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
