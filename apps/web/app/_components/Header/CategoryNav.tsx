"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Zone } from "../Header/Header";
import { getShopCategories } from "../../_data/shop";

/*
  Category nav — Header-এর নিচের সারি।

  LIVE as of 30 Jul 2026. THIS WAS THE BUG ON THIS PAGE: the labels below were
  hard-coded, so a category added in the admin panel never reached the menu —
  even though `Category.showOnNavbar` and `Category.sortOrder` had existed and
  been editable there the whole time. Nothing was missing; the storefront simply
  never asked.

  Now: `showOnNavbar` decides membership, `sortOrder` decides order, both from
  the admin.

  ZONE FILTERING — changed shape, same intent.
  The old list carried `dhakaOnly` by slug (Cakes, Balloons — fresh cream and
  inflated balloons do not survive a courier). That list had to be remembered by
  hand. It is now derived: a category shows in the nationwide zone when it holds
  at least one published NATIONWIDE product (`nationwideCount`).

  ⚠️ Consequence worth knowing: if products have not been given a zone yet, the
  nationwide menu comes back short. That is the data, not a fault — and it fails
  in the safe direction.
*/

interface NavItem {
  label: string;
  href: string;
  /** hidden in the nationwide zone — nothing here ships by courier */
  dhakaOnly?: boolean;
  hot?: boolean;
}

/** Rendered only if the API cannot be reached — see `_data/shop.ts`. */
const FALLBACK: NavItem[] = [
  { label: "Flowers", href: "/categories/fresh-flowers" },
  { label: "Cakes", href: "/categories/cakes", dhakaOnly: true },
  { label: "Combos", href: "/categories/flower-combos" },
  { label: "Chocolates", href: "/categories/chocolates" },
  { label: "Plants", href: "/categories/plants" },
  { label: "Balloons", href: "/categories/balloon-bouquets", dhakaOnly: true },
  { label: "Gift Boxes", href: "/categories/gift-boxes" },
  { label: "Personalised", href: "/categories/personalised" },
];

export default function CategoryNav({ zone }: { zone: Zone | null }) {
  const pathname = usePathname();
  const [nav, setNav] = useState<NavItem[]>(FALLBACK);

  useEffect(() => {
    let alive = true;
    getShopCategories().then((rows) => {
      if (!alive || rows === null) return;
      setNav(
        rows
          .filter((c) => c.showOnNavbar)
          .map((c) => ({
            label: c.name,
            href: `/categories/${c.slug}`,
            dhakaOnly: c.nationwideCount === 0,
          })),
      );
    });
    return () => {
      alive = false;
    };
  }, []);

  const visible = nav.filter((c) => zone !== "bangladesh" || !c.dhakaOnly);

  // An empty <nav> still occupies its padding, so the header keeps a blank
  // strip under it and reads as a rendering fault. Common in the nationwide
  // zone before products have been given zones — see the note above.
  if (visible.length === 0) return null;

  return (
    <nav
      aria-label="Product categories"
      className="flex gap-8 pb-3 overflow-x-auto scrollbar-none text-[14.5px] font-medium text-body justify-start lg:justify-center"
    >
      {visible.map((cat) => {
        const active = pathname === cat.href || pathname.startsWith(cat.href + "/");

        return (
          <Link
            key={cat.href}
            href={cat.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap pb-0.5 border-b-2 transition-colors font-medium text-[14.5px] ${
              active
                ? "text-purple font-semibold border-orchid"
                : cat.hot
                  ? "text-orchid font-semibold border-transparent hover:text-purple"
                  : "text-body border-transparent hover:text-orchid"
            }`}
          >
            {cat.label}
          </Link>
        );
      })}
    </nav>
  );
}
