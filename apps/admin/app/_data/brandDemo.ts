import type { ApiBrand } from "./api";

/*
  Brand demo + sample data.

  1. DEMO_BRANDS — a realistic, deliberately-uneven Bangladesh gift-brand set
     (featured / plain / empty / hidden). Shown ONLY when the API (:4000) is
     UNREACHABLE, so every state on the Brands screen stays explorable. Same
     shape GET /brands returns.
  2. SAMPLE_BRANDS — a clean starter set. When the API is UP but the DB has no
     brands yet, "Load samples" POSTs these as real records.

  ⇄ SWAP HERE: delete once the DB is seeded and demo is no longer wanted.
*/
type Raw = { name: string; featured?: boolean; active?: boolean; products: number; desc?: string };

const RAW: Raw[] = [
  { name: "Ferrero Rocher", featured: true, products: 8, desc: "Premium Italian chocolates — a top gifting favourite." },
  { name: "Cadbury", products: 12, desc: "Everyday chocolates loved across Bangladesh." },
  { name: "Lindt", featured: true, products: 5, desc: "Swiss luxury chocolate." },
  { name: "Toblerone", products: 4 },
  { name: "Rex London", products: 6, desc: "Playful mugs, soft toys & keepsakes." },
  { name: "Yankee Candle", products: 3, desc: "Scented candles for cosy gifting." },
  { name: "L'Occitane", featured: true, products: 0, desc: "French skincare & fragrance gift sets." },
  { name: "Radian Signature", featured: true, products: 15, desc: "Our own curated house range." },
  { name: "Local Artisans", active: false, products: 2, desc: "Handmade pieces from Bangladeshi makers." },
];

export function demoBrandSlug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const DEMO_BRANDS: ApiBrand[] = RAW.map((b, i) => ({
  id: "demo-brand-" + demoBrandSlug(b.name),
  slug: demoBrandSlug(b.name),
  name: b.name,
  logoUrl: null,
  description: b.desc ?? null,
  metaTitle: null,
  metaDescription: null,
  isFeatured: b.featured ?? false,
  sortOrder: i,
  isActive: b.active ?? true,
  _count: { products: b.products },
}));

/** clean starter set for seeding a real (empty) database */
export const SAMPLE_BRANDS: { name: string; isFeatured: boolean; description: string | null }[] =
  RAW.filter((b) => b.active !== false).map((b) => ({
    name: b.name, isFeatured: b.featured ?? false, description: b.desc ?? null,
  }));
