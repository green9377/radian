import type { Occasion } from "./products";
import type { Zone } from "../_store/useZoneStore";

/*
  ═══════════════════════════════════════════════════════════════════
  COLLECTIONS config — budget-first shopping (IGP-inspired)।

  একটাই generic route /collections/[slug] সব collection দেখায়। নতুন budget
  tier যোগ করতে শুধু এখানে একটা config — page/view-এ হাত পড়বে না।

  🔒 দাম সবসময় PAISA integer (Constitution)। under-1000 মানে ৳1000-এর নিচে,
     অর্থাৎ pricePaisa < 100000। ranges inclusive-min, exclusive-max।

  চিপ-navigation: এই সব collection নিজেদের মধ্যে link করে (budget browsing)।
  Footer শুধু /collections/under-1000 দেখায়; বাকিগুলো chip/SEO দিয়ে পাওয়া যায়।

  ⇄ SWAP HERE — API এলে filter DB query হবে; getCollectionProducts signature
     এক থাকবে।
  ═══════════════════════════════════════════════════════════════════
*/

export interface CollectionConfig {
  slug: string;
  /**
   * chip-row কোন কোন collection পাশে দেখাবে তা ঠিক করে। শুধু একই kind-এর
   * collection নিজেদের মধ্যে chip-navigate করে (budget tier আলাদা, theme আলাদা)।
   */
  kind: "budget" | "theme";
  /** chip-এ ছোট নাম, e.g. "Under ৳1000" */
  chip: string;
  eyebrow: string;
  title: string;
  lede: string;
  /** inclusive lower bound in paisa (optional) */
  minPaisa?: number;
  /** exclusive upper bound in paisa (optional) */
  maxPaisa?: number;
  /** occasion tag filter (theme collections; product.occ-এ থাকতে হবে) */
  occasion?: Occasion;
  seo: { title: string; description: string };
}

/* Budget tiers — ranges never overlap (min inclusive, max exclusive). */
export const COLLECTIONS: CollectionConfig[] = [
  {
    slug: "under-1000",
    kind: "budget",
    chip: "Under ৳1000",
    eyebrow: "Thoughtful, not pricey",
    title: "Gifts under ৳1000",
    lede: "Beautiful flowers and gifts that say everything — without stretching the budget. Same fast delivery, same hand-arranged care.",
    maxPaisa: 100000,
    seo: {
      title: "Gifts Under ৳1000 | Radian Flowers & Gifts Dhaka",
      description:
        "Affordable flowers, cakes and gifts under ৳1000 in Dhaka — hand-arranged with express, same-day and midnight delivery.",
    },
  },
  {
    slug: "1000-2000",
    kind: "budget",
    chip: "৳1000–2000",
    eyebrow: "The sweet spot",
    title: "Gifts from ৳1000 to ৳2000",
    lede: "A little more to make it memorable — fuller bouquets, cakes and gift sets in the most-loved price range.",
    minPaisa: 100000,
    maxPaisa: 200000,
    seo: {
      title: "Gifts ৳1000–2000 | Radian Flowers & Gifts Dhaka",
      description:
        "Flowers, cakes and gift sets between ৳1000 and ৳2000 in Dhaka, hand-arranged with fast delivery from Radian.",
    },
  },
  {
    slug: "2000-3000",
    kind: "budget",
    chip: "৳2000–3000",
    eyebrow: "Make it special",
    title: "Gifts from ৳2000 to ৳3000",
    lede: "Premium arrangements and curated gift boxes for the moments that deserve a little extra.",
    minPaisa: 200000,
    maxPaisa: 300000,
    seo: {
      title: "Gifts ৳2000–3000 | Radian Flowers & Gifts Dhaka",
      description:
        "Premium flowers and gift boxes between ৳2000 and ৳3000 in Dhaka, hand-arranged with fast delivery from Radian.",
    },
  },
  {
    slug: "3000-plus",
    kind: "budget",
    chip: "৳3000 & above",
    eyebrow: "The grand gesture",
    title: "Luxury gifts ৳3000 & above",
    lede: "Our most lavish flowers, hampers and signature arrangements — for when only the very best will do.",
    minPaisa: 300000,
    seo: {
      title: "Luxury Gifts ৳3000+ | Radian Flowers & Gifts Dhaka",
      description:
        "Luxury flowers, hampers and signature arrangements from ৳3000 in Dhaka, hand-arranged with fast delivery from Radian.",
    },
  },

  // ── Themed collection (occasion-based, not budget) ──
  {
    slug: "valentines",
    kind: "theme",
    chip: "Valentine's",
    eyebrow: "Say it with flowers",
    title: "The Valentine's Collection",
    lede: "Romantic roses, love-struck bouquets and gifts made for the one who matters most — hand-arranged and delivered right on time.",
    occasion: "love",
    seo: {
      title: "Valentine's Flowers & Gifts | Radian Dhaka",
      description:
        "Romantic roses, bouquets and gifts for Valentine's Day in Dhaka — hand-arranged with express, same-day and midnight delivery from Radian.",
    },
  },
];

export const COLLECTION_SLUGS: string[] = COLLECTIONS.map((c) => c.slug);

export function getCollection(slug: string): CollectionConfig | undefined {
  return COLLECTIONS.find((c) => c.slug === slug);
}

/*
  ⚠️ `getCollectionProducts()` LIVED HERE AND IS GONE (9 Sep 2026). It filtered
  `PRODUCTS` — the hand-written catalogue — so any collection the admin had not
  filled quietly showed invented products. The collection page reads
  `/shop/collections` and shows nothing when there is nothing.
*/
