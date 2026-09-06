import type { ProductDetail } from "../../_data/productDetails";

/*
  Structured data for a product page (owner, 6 Sep 2026) — what Google reads
  for a rich result (price, stock, stars, picture under the blue link):
    · Product + Offer  — name, pictures, the price in BDT, in stock or not
    · AggregateRating  — only when the product has published reviews
    · BreadcrumbList   — Home › category › product
  Everything in it is the page's own data; nothing is written here.
*/

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://radianbd.com").replace(/\/$/, "");

export default function ProductJsonLd({ detail, siteName }: { detail: ProductDetail; siteName: string }) {
  const { product, crumb } = detail;
  const url = `${SITE}/p/${product.slug}`;
  const state = detail.availability?.state ?? "IN_STOCK";
  const availability =
    state === "OUT_OF_STOCK"
      ? "https://schema.org/OutOfStock"
      : state === "PRE_ORDER"
        ? "https://schema.org/PreOrder"
        : "https://schema.org/InStock";

  const productNode: Record<string, unknown> = {
    "@type": "Product",
    name: product.name,
    url,
    ...(detail.gallery.length ? { image: detail.gallery } : {}),
    ...(detail.shortDesc ? { description: detail.shortDesc } : {}),
    brand: { "@type": "Brand", name: siteName },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "BDT",
      price: (product.pricePaisa / 100).toFixed(2),
      availability,
      itemCondition: "https://schema.org/NewCondition",
    },
  };
  if (detail.reviews.count > 0 && detail.reviews.rating) {
    productNode.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: detail.reviews.rating,
      reviewCount: detail.reviews.count,
    };
  }

  const graph = [
    productNode,
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: crumb.catLabel, item: `${SITE}/${crumb.catSlug}` },
        { "@type": "ListItem", position: 3, name: product.name, item: url },
      ],
    },
  ];

  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
