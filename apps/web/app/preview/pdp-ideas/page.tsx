import type { Metadata } from "next";

import { baseFor } from "../../_data/shop";
import IdeasView from "./IdeasView";

/*
  DESIGN PREVIEW — NOT A SHOP PAGE.

  The owner reviews design on the demo, nothing else (CLAUDE.md section 2), so
  design proposals are shown HERE, on the demo itself, with the shop's real
  product photography — not on some external mockup page he has never used
  (26 Aug 2026: "ami to kichui dekhte pacchi na... amder to uploaded product
  image achei"). Once the owner picks which ideas to build, this page's blocks
  graduate into the real PDP and the page itself can be deleted.

  noindex — a proposal must never reach Google.
*/

export const metadata: Metadata = {
  title: "Design preview — product page ideas",
  robots: { index: false, follow: false },
};

type Row = { slug: string; name: string; imageUrl: string | null; pricePaisa: number };

export default async function PdpIdeasPage() {
  /*  Real photos, straight from the live catalogue. If the API is asleep the
      page still renders — the blocks fall back to the brand gradient the shop
      itself falls back to.  */
  let rows: Row[] = [];
  try {
    const res = await fetch(`${baseFor()}/shop/products?zone=DHAKA&limit=12`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const json = (await res.json()) as { items?: Row[] } | Row[];
      rows = (Array.isArray(json) ? json : (json.items ?? [])).filter((r) => r.imageUrl);
    }
  } catch {
    /* asleep — gradients it is */
  }

  return <IdeasView products={rows} />;
}
