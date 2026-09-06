import type { ShopCategoryPage, ShopProduct } from "../../_data/shop";

/*
  Structured data for a category page — what Google reads, what no customer
  sees (owner, 6 Sep 2026):
    · BreadcrumbList  — Home › parent › this page
    · CollectionPage + ItemList — the first products of the grid
    · FAQPage         — the category's own questions, when it has any
  Everything in it is the page's real data; nothing is written here.
*/

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://radianbd.com").replace(/\/$/, "");

export default function CategoryJsonLd({
  page,
  path,
  products,
  siteName,
}: {
  page: ShopCategoryPage;
  /** this page's own path, e.g. /fresh-flower/rose */
  path: string;
  products: ShopProduct[];
  siteName: string;
}) {
  const url = `${SITE}${path}`;

  const crumbs = [
    { name: "Home", item: `${SITE}/` },
    ...(page.parent ? [{ name: page.parent.label, item: `${SITE}/${page.parent.slug}` }] : []),
    { name: page.label, item: url },
  ];

  const graph: Record<string, unknown>[] = [
    {
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        item: c.item,
      })),
    },
    {
      "@type": "CollectionPage",
      name: page.seo.title,
      description: page.seo.description || undefined,
      url,
      isPartOf: { "@type": "WebSite", name: siteName, url: `${SITE}/` },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: page.totalProducts,
        itemListElement: products.map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${SITE}/p/${p.slug}`,
          name: p.name,
          ...(p.imageUrl ? { image: p.imageUrl } : {}),
        })),
      },
    },
  ];

  if (page.faqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: page.faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  }

  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
