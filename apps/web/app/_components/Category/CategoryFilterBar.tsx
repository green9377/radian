"use client";

import { usePathname, useRouter } from "next/navigation";
import type { CategoryConfig } from "../../_data/categories";

/*
  ═══════════════════════════════════════════════════════════════════════════
  The filter bar — 2 Aug 2026.

  WHY IT DID NOT EXIST, AND WHY THAT WAS A BUG. Every tile on this page links
  back to it with a filter on the query string, and the grid honoured them
  perfectly: press Red, get red roses. But the page said nothing about it. No
  chip, no word, no way back — the shopper was left with twelve products, a
  heading that reads "The Full Collection", and a browser Back button as the
  only exit. And `sort` was read by the page from the first day and could not
  be set by anybody, because nothing on the screen wrote it.

  TWO DECISIONS WORTH KEEPING:

  1. IT NAVIGATES, IT DOES NOT FILTER. Pressing a chip changes the URL and the
     server renders the answer. Filtering in the browser would be faster to
     write and wrong for this page: the category page is the one Google indexes
     (D-CAT-05), a filtered view has to be a real address, and the grid's own
     Load More already carries the filters through to the API.

  2. THE LABELS COME FROM THE TILES, NOT FROM THE SLUG. The page already holds
     the words for every colour, style and occasion it offered — so a chip says
     "Baby Pink", the shop's own name for it, rather than a slug tidied up by a
     regular expression. The tidy-up is only the fallback for a link somebody
     typed by hand.
  ═══════════════════════════════════════════════════════════════════════════
*/

/** the four the API can actually sort by — see `orderBy` in `catalog.ts` */
const SORTS: { v: string; label: string }[] = [
  { v: "popular", label: "Most popular" },
  { v: "price_asc", label: "Price: low to high" },
  { v: "price_desc", label: "Price: high to low" },
  { v: "new", label: "Newest first" },
];

/*  ⚠️ "express" no longer spells out a duration. This label shows on the
    active-filter chip a shopper just clicked, and it said "2-hour delivery" on
    a shop whose express service is three hours. The chip's job is to name the
    filter, not to make the promise — the promise belongs to the delivery
    masters, and the product page reads it from there.  */
const SPEED_LABEL: Record<string, string> = {
  express: "Express delivery",
  same_day: "Same day",
  midnight: "Midnight",
};

/** "baby-pink" → "Baby Pink" — only when the page has no better word for it */
const titleCase = (s: string) =>
  s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const taka = (n: number) => `৳${n.toLocaleString("en-BD")}`;

type Chip = { key: string; label: string };

export default function CategoryFilterBar({
  config,
  filters,
}: {
  config: CategoryConfig;
  /** exactly what the page sent to the API — normalised names, not raw query */
  filters: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const pathname = usePathname();

  /** the word this page used when it offered that tile */
  const labelFrom = (
    tiles: { label: string; href: string }[],
    param: string,
    value: string,
  ) =>
    tiles.find((t) => {
      const q = t.href.split("?")[1];
      return q ? new URLSearchParams(q).get(param) === value : false;
    })?.label;

  const chips: Chip[] = [];
  if (filters.colour) {
    chips.push({
      key: "colour",
      label: labelFrom(config.colours ?? [], "colour", filters.colour) ?? titleCase(filters.colour),
    });
  }
  if (filters.tag) {
    chips.push({
      key: "tag",
      label: labelFrom(config.attributes ?? [], "tag", filters.tag) ?? titleCase(filters.tag),
    });
  }
  if (filters.occasion) {
    chips.push({
      key: "occasion",
      label:
        labelFrom(config.occasions ?? [], "occasions", filters.occasion) ??
        titleCase(filters.occasion),
    });
  }
  if (filters.speed) {
    chips.push({ key: "speed", label: SPEED_LABEL[filters.speed] ?? titleCase(filters.speed) });
  }
  /*
    Price is ONE chip, not two. "min ৳1,500" beside "max ৳3,000" is two things
    to remove for one decision the shopper made once, on one budget card.
  */
  if (filters.min || filters.max) {
    const lo = filters.min ? Number(filters.min) : null;
    const hi = filters.max ? Number(filters.max) : null;
    chips.push({
      key: "price",
      label:
        lo !== null && hi !== null
          ? `${taka(lo)} – ${taka(hi)}`
          : hi !== null
            ? `Under ${taka(hi)}`
            : `${taka(lo ?? 0)} and above`,
    });
  }

  const go = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const put = (k: string, v?: string) => {
      if (v) p.set(k, v);
    };
    put("colour", next.colour);
    put("tag", next.tag);
    // written back under the name the page has always published for occasions,
    // so a shared link keeps the spelling the shop's own tiles use
    put("occasions", next.occasion);
    put("speed", next.speed);
    put("min", next.min);
    put("max", next.max);
    // "popular" is the default — leaving it out keeps the plain category
    // address clean, which is the one Google should be indexing
    if (next.sort && next.sort !== "popular") p.set("sort", next.sort);

    const qs = p.toString();
    /*  `scroll: false` — the shopper is standing at the grid. Sending them
        back to the banner to read the same heading again is the page taking
        their place away from them.  */
    router.push(qs ? `${pathname}?${qs}#all-products` : `${pathname}#all-products`, {
      scroll: false,
    });
  };

  const drop = (key: string) =>
    go(key === "price" ? { ...filters, min: undefined, max: undefined } : { ...filters, [key]: undefined });

  const sort = filters.sort ?? "popular";

  return (
    <div className="max-w-[var(--page-w)] mx-auto -mt-4 mb-9 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2 min-h-[36px]">
        {chips.length > 0 && (
          <span className="text-[12.5px] text-body-soft mr-1">Showing</span>
        )}
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => drop(c.key)}
            title="Remove this filter"
            className="inline-flex items-center gap-2 bg-orchid-soft text-purple rounded-full pl-4 pr-3 py-[7px] text-[12.5px] font-semibold whitespace-nowrap hover:bg-orchid hover:text-white transition-colors cursor-pointer"
          >
            {c.label}
            <span aria-hidden className="text-[13px] leading-none opacity-70">
              ✕
            </span>
          </button>
        ))}
        {chips.length > 1 && (
          <button
            onClick={() => go({ sort })}
            className="text-[12.5px] text-body-soft underline hover:text-purple transition-colors cursor-pointer"
          >
            Clear all
          </button>
        )}
      </div>

      <label className="inline-flex items-center gap-2 text-[12.5px] text-body-soft">
        Sort
        <select
          value={sort}
          onChange={(e) => go({ ...filters, sort: e.target.value })}
          className="border border-lavender-deep rounded-full px-4 py-[7px] text-[12.5px] text-purple bg-white cursor-pointer hover:border-orchid transition-colors outline-none"
        >
          {SORTS.map((s) => (
            <option key={s.v} value={s.v}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
