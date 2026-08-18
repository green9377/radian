"use client";

import Link from "next/link";

import { formatTaka } from "../../_data/products";
import { bundleTotals, type BundleList } from "../../_data/bundlePricing";
import type {
  BundleOption,
  PickedVariant,
  SizeOption,
  VariantGroup,
} from "../../_data/productDetails";
import Icon from "./PdpIcons";
import { BlkTitle } from "./PdpBuyBar";

/*
  VARIANT UI — three separate layers, each answering a different question:

    VARIANT → a sibling product (colour or flavour). Click = another PDP
              (own photos, own stock, own SEO page).
    SIZE    → the same product at a different price. A small pill — no photo
              needed.
    BUNDLE  → another product is added. A photo card — a new thing has to be
              shown.

  Why separate: making a card for every variant × size × bundle gives 27 cards
  — an unusable page. Kept apart, each decision is small, and the customer sees
  at a glance what is changing.
*/

/*
  ═══════════════════════════════════════════════════════════════════════════
  DEC-PRD-012 — one page, every colour. Owner, 1 Aug 2026 (translated):

    *"when it has multiple variants we'll show them, and it will be on one
      product page. Each with its own image and stock."*

  ⚠️ Not to be confused with `VariantRow` below. That is the old design — every
  colour a separate product, clicking a swatch opened another page. In that
  design the screen for putting products into a group was never built, so the
  swatches were in practice never seen at all.

  Clicking here goes **nowhere** — the photos, price and stock change on the
  same page. The path to buying gets shorter, and the whole page is not
  reloaded.
  ═══════════════════════════════════════════════════════════════════════════
*/
export function VariantPicker({
  variants,
  activeId,
  basePaisa,
  showStock,
  onPick,
}: {
  variants: PickedVariant[];
  activeId: string;
  /** the product's own price — the price is only printed when it differs from this */
  basePaisa: number;
  /**
   * Whether the shop asked for stock numbers to be shown (the admin's switch).
   * When false nothing is printed here either — if the green chip above stays
   * quiet, leaking the number below would make that switch meaningless.
   */
  showStock: boolean;
  onPick: (id: string) => void;
}) {
  const active = variants.find((v) => v.id === activeId);

  /*  The heading is the owner's list name — "Colour", "Flavour", "Weight".
      They all belong to one list, so the first is enough.  */
  const heading = variants[0]?.attribute || "Choose";

  /*  ⚠️ Stock only closes the door when at least one of them has stock. All
      zeroes means the fields have not been filled in yet — and then none of
      them is called "Sold out". PdpView uses this exact same condition, so the
      two places say the same thing.  */
  const anyStock = variants.some((v) => v.stockQty > 0);

  /*  What the master asked to show. Everything on one list is of the same
      kind, so this is read once.  */
  const mode = variants[0]?.displayMode ?? "SWATCH";
  const asSwatch = mode === "SWATCH";
  const asPhoto = mode === "PHOTO";

  return (
    <section className="mb-6">
      <div className="flex items-baseline gap-2 mb-3">
        <b className="text-[14px] font-bold text-ink">{heading}</b>
        {active && (
          <span className="text-[13px] text-body-soft">
            — {active.label}
            {/*  The chip above gives the whole product's total (6 + 4 = 10).
                The number for the colour actually being bought belongs here,
                because this is where the decision is made — reading "10 left"
                and then asking for 8 red ones ends in disappointment.  */}
            {showStock && active.stockQty > 0 && (
              <span className="text-body-soft"> · {active.stockQty} left</span>
            )}
          </span>
        )}
      </div>

      <div className={`flex flex-wrap ${asSwatch ? "gap-3" : "gap-2.5"}`}>
        {variants.map((v) => {
          const on = v.id === activeId;
          const out = anyStock && v.stockQty === 0;
          const dearer = v.pricePaisa !== basePaisa;

          /*
            ⚠️ The round colour button shows the **colour**, not the photo —
            owner, 9 Aug 2026 (translated): *"if you select a colour and give an
            image, the frontend shows that image instead of the colour's name
            and colour, which is a problem for the customer."*

            He was right. When a photo existed it used to go on the round
            button, leaving three near-identical little images side by side —
            no way to tell which was pink and which was white from a 10-pixel
            thumbnail. A button for choosing a colour will show the colour; the
            variant's photo changes the big image above, which is where it is
            actually useful.

            A photo only goes here when the list is of the PHOTO kind (flavour,
            pattern) — where there is no colour to show at all.
          */
          const fill = asSwatch
            ? v.swatch || "#DDC9EC"
            : v.imageUrl
              ? `url(${v.imageUrl}) center/cover`
              : v.swatch || "#DDC9EC";

          /*
            ⚠️ A photo is never required — the owner's rule, 2 Aug 2026:
            *"ami chai eta requirement na hok"* ("I want this not to be a
            requirement").

            Even when the list is of the PHOTO kind, a value with no photo sits
            there with just its name. Otherwise an empty purple square would
            appear in "Standard"'s place and the customer would think the image
            had failed to load.
          */
          const withPhoto = asPhoto && !!v.imageUrl;

          if (asSwatch) {
            return (
              <button
                key={v.id}
                onClick={() => !out && onPick(v.id)}
                disabled={out}
                aria-current={on}
                title={out ? `${v.label} — sold out` : v.label}
                className={`relative w-11 h-11 rounded-full transition-transform ${
                  on
                    ? "ring-2 ring-orchid ring-offset-2"
                    : "ring-1 ring-lavender-deep ring-offset-2 hover:scale-110"
                } ${out ? "opacity-40 cursor-not-allowed hover:scale-100" : ""}`}
                style={{ background: fill }}
              >
                {on && !out && (
                  <span className="absolute inset-0 grid place-items-center">
                    <Icon name="check" className="w-4 h-4 text-white drop-shadow" />
                  </span>
                )}
                {/*  Sold out is shown with a strike — fading alone looks the
                    same as "not selected".  */}
                {out && (
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="block w-full h-[1.5px] bg-white/90 rotate-45" />
                  </span>
                )}
              </button>
            );
          }

          return (
            <button
              key={v.id}
              onClick={() => !out && onPick(v.id)}
              disabled={out}
              aria-current={on}
              className={`text-left rounded-[12px] border-[1.5px] overflow-hidden bg-white transition-all duration-200 ${
                withPhoto ? "w-[86px]" : "px-4 py-2.5"
              } ${
                on ? "border-orchid bg-orchid-soft" : "border-lavender-deep hover:border-orchid-mid"
              } ${out ? "opacity-45 cursor-not-allowed" : "active:scale-[0.97]"}`}
            >
              {withPhoto && <span className="block aspect-square" style={{ background: fill }} />}
              <span className={withPhoto ? "block px-1.5 pt-1.5 pb-2" : "block"}>
                <span
                  className={`block text-[13px] font-semibold truncate ${
                    on ? "text-purple" : "text-ink"
                  } ${out ? "line-through" : ""}`}
                >
                  {v.label}
                </span>
                {/*  The price is printed only when it really differs. Print
                    the same number four times under four same-priced colours
                    and the eye stops reading it — and then nobody sees the one
                    that genuinely is different either.  */}
                {/*  DEC-PRD-032 — this one's own offer, struck price beside it.
                    Only where the shop actually set one; a derived "was" price
                    is how the ৳1,418 nonsense happened (8 Aug 2026).  */}
                <span className="block text-[11.5px] text-body-soft">
                  {out ? (
                    "Sold out"
                  ) : dearer ? (
                    <>
                      {formatTaka(v.pricePaisa)}
                      {v.wasPaisa ? (
                        <span className="line-through opacity-60 ml-1">{formatTaka(v.wasPaisa)}</span>
                      ) : null}
                    </>
                  ) : (
                    ""
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function VariantRow({ group }: { group: VariantGroup }) {
  const active = group.options.find((o) => o.active);
  const isColour = group.kind === "colour";

  return (
    <section className="mb-6">
      <div className="flex items-baseline gap-2 mb-3">
        <b className="text-[14px] font-bold text-ink">{group.label}</b>
        <span className="text-[13px] text-body-soft">— {active?.label}</span>
      </div>

      <div className={`flex flex-wrap ${isColour ? "gap-3" : "gap-2.5"}`}>
        {group.options.map((o) => {
          /* colour = a round swatch · flavour = a photo pill */
          const shape = isColour
            ? "w-11 h-11 rounded-full"
            : "w-[76px] rounded-[12px] overflow-hidden";

          if (o.active) {
            return isColour ? (
              <span
                key={o.slug}
                aria-current="true"
                className={`${shape} relative ring-2 ring-orchid ring-offset-2 grid place-items-center`}
                style={{ background: o.swatch }}
              >
                <Icon name="check" className="w-4 h-4 text-white drop-shadow" />
              </span>
            ) : (
              <span
                key={o.slug}
                aria-current="true"
                className={`${shape} relative border-2 border-orchid bg-white block`}
              >
                <span className="block aspect-square" style={{ background: o.swatch }} />
                <span className="block px-1.5 py-1 text-[10.5px] font-semibold text-purple text-center truncate">
                  {o.label}
                </span>
                <span className="absolute top-1 right-1 w-[18px] h-[18px] rounded-full bg-orchid text-white grid place-items-center">
                  <Icon name="check" className="w-2.5 h-2.5" />
                </span>
              </span>
            );
          }

          return isColour ? (
            <Link
              key={o.slug}
              href={`/products/${o.slug}`}
              aria-label={o.label}
              title={o.label}
              className={`${shape} ring-1 ring-lavender-deep ring-offset-2 transition-transform hover:scale-110`}
              style={{ background: o.swatch }}
            />
          ) : (
            <Link
              key={o.slug}
              href={`/products/${o.slug}`}
              title={o.label}
              className={`${shape} border-[1.5px] border-lavender-deep bg-white block transition-all hover:border-orchid-mid hover:-translate-y-[2px]`}
            >
              <span className="block aspect-square" style={{ background: o.swatch }} />
              <span className="block px-1.5 py-1 text-[10.5px] font-medium text-body-soft text-center truncate">
                {o.label}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function SizeRow({
  label,
  sizes,
  activeId,
  onPick,
}: {
  label: string;
  sizes: SizeOption[];
  activeId: string;
  onPick: (id: string) => void;
}) {
  return (
    <section className="mb-6">
      <div className="flex items-baseline gap-2 mb-3">
        <b className="text-[14px] font-bold text-ink">{label}</b>
        <span className="text-[13px] text-body-soft">— price changes</span>
      </div>
      <div className="flex gap-2.5 flex-wrap">
        {sizes.map((s) => {
          const on = s.id === activeId;
          return (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              className={`text-left rounded-[12px] border-[1.5px] px-4 py-2.5 transition-all duration-200 active:scale-[0.97] ${
                on
                  ? "border-orchid bg-orchid-soft"
                  : "border-lavender-deep bg-white hover:border-orchid-mid"
              }`}
            >
              <span
                className={`block text-[13.5px] font-semibold ${on ? "text-purple" : "text-ink"}`}
              >
                {s.label}
              </span>
              <span className="block text-[12px] text-body-soft">
                {formatTaka(s.pricePaisa)}
                {s.sub ? ` · ${s.sub}` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/*
  ═══════════════════════════════════════════════════════════════════════════
  UPGRADE — bigger versions of this one. DEC-PRD-020, owner 2 Aug 2026:

  > *"clicking an upgrade product should change the price, but it must not take
  >  you to another page."* (translated)

  ⚠️ Every upgrade is itself a **real product** — its own price, its own stock,
  its own page. Even so, these are choices here and not links: clicking changes
  the price and photos on this very page. Because the customer is still working
  out "which one do I buy", and leaving the page for every comparison loses
  them the way back.

  ⚠️ The first card is "this one" — the one currently open. Offering a choice
  with no way back would mean that touching the bigger one once makes the
  smaller unreachable.
  ═══════════════════════════════════════════════════════════════════════════
*/
export function UpgradeRow({
  upgrades,
  thisName,
  thisPaisa,
  activeSlug,
  onPick,
}: {
  upgrades: { slug: string; name: string; pricePaisa: number; bg: string }[];
  /** the name of this page's own product — the first card */
  thisName: string;
  thisPaisa: number;
  /** `null` = this product itself is the one selected */
  activeSlug: string | null;
  onPick: (slug: string | null) => void;
}) {
  const options = [
    { slug: null as string | null, name: thisName, pricePaisa: thisPaisa, bg: "" },
    ...upgrades,
  ];

  return (
    <section className="mb-6">
      <div className="flex items-baseline gap-2 mb-3">
        <b className="text-[14px] font-bold text-ink">Choose the size you want to send</b>
      </div>
      <div className="flex flex-col gap-2">
        {options.map((o) => {
          const on = o.slug === activeSlug;
          return (
            <button
              key={o.slug ?? "__this"}
              onClick={() => onPick(o.slug)}
              aria-current={on}
              className={`flex items-center gap-3 text-left rounded-[14px] border-[1.5px] px-3 py-2.5 transition-all duration-200 active:scale-[0.99] ${
                on
                  ? "border-orchid bg-orchid-soft"
                  : "border-lavender-deep bg-white hover:border-orchid-mid"
              }`}
            >
              {/*  ⚠️ A round mark, not a square — only one can be chosen here.
                  Bundles get squares, because several can be taken there. The
                  behaviour has to match what the mark promises.  */}
              <span
                className={`w-[18px] h-[18px] rounded-full border-2 shrink-0 grid place-items-center ${
                  on ? "border-orchid" : "border-lavender-deep"
                }`}
              >
                {on && <span className="w-[9px] h-[9px] rounded-full bg-orchid" />}
              </span>
              {o.bg && (
                <span
                  className="w-[38px] h-[38px] rounded-[10px] shrink-0 border border-lavender-deep"
                  style={{ background: o.bg }}
                />
              )}
              <span className="flex-1 min-w-0">
                <span className={`block text-[13.5px] font-semibold truncate ${on ? "text-purple" : "text-ink"}`}>
                  {o.name}
                </span>
              </span>
              <span className="font-display text-[15px] font-semibold text-purple shrink-0">
                {formatTaka(o.pricePaisa)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/*
  DEC-PRD-013 — several can be taken together. Owner, 2 Aug 2026 (translated):
  *"the customer will be able to take several bundles at once"*.

  ⚠️ This used to be "one of these", and that is why the first card was an
  invented "Just Flowers · No extra" — the way back. Ticking nothing is the way
  back now, so that card is no longer created on the server at all.

  ⚠️ The tick-box is drawn as a square, not a circle — a circle means "pick
  one". The behaviour has to match what the mark promises, otherwise the
  customer is afraid to touch the second one in case the first disappears.
*/
export function BundleCards({
  bundles,
  activeIds,
  hint,
  basePaisa,
  list,
  onToggle,
}: {
  bundles: BundleOption[];
  activeIds: string[];
  hint: string;
  /** the main product's price — the discount applies on top of this (DEC-PRD-018) */
  basePaisa: number;
  /** a single discount for the whole list. `null` = no discount. */
  list: BundleList | null | undefined;
  onToggle: (id: string) => void;
}) {
  const picked = bundles.filter((b) => activeIds.includes(b.id));
  const totals = bundleTotals(basePaisa, list, activeIds);

  return (
    <section>
      <BlkTitle title="Make It a Bundle" hint={hint} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {bundles.map((b) => {
          const on = activeIds.includes(b.id);
          /*  The card shows the item's **own** price — no discount. The
              discount is written once under the list, because it applies to
              the total including the main product; putting it here would print
              the same discount four times and leave nobody able to make the
              total add up.  */
          return (
            <button
              key={b.id}
              onClick={() => onToggle(b.id)}
              aria-pressed={on}
              className={`relative text-left rounded-[18px] overflow-hidden bg-white border-2 transition-all duration-200 active:scale-[0.97] ${
                on
                  ? "border-orchid shadow-[0_10px_28px_rgba(207,67,234,0.18)]"
                  : "border-lavender-deep hover:border-orchid-mid hover:-translate-y-[3px]"
              }`}
            >
              {b.tag && (
                <span className="absolute top-2 left-2 z-[3] bg-orchid text-white text-[9px] font-bold tracking-[0.1em] uppercase rounded-full px-2 py-1">
                  {b.tag}
                </span>
              )}
              {/*  A square tick — the smallest way to say "you can take more".
                  The box stays visible while unticked, otherwise nobody would
                  realise several can be taken.  */}
              <span
                className={`absolute top-2 right-2 z-[3] w-[22px] h-[22px] rounded-[7px] grid place-items-center transition-colors ${
                  on ? "bg-orchid text-white" : "bg-white/90 border-[1.5px] border-lavender-deep"
                }`}
              >
                {on && <Icon name="check" className="w-3 h-3" />}
              </span>
              <span className="block aspect-square" style={{ background: b.bg }} />
              <span className="block px-3 pt-2.5 pb-3">
                <span className="block text-[12.5px] font-semibold text-ink truncate">
                  {b.label}
                </span>
                <span className="block font-display text-[15px] font-semibold text-purple mt-0.5">
                  + {formatTaka(b.pricePaisa)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/*
        DEC-PRD-018 — the discount lives here, once. The owner's rule: take
        only the main product and there is no discount; take even one thing
        from the list and it applies, to the total including the main. So the
        number cannot belong to any single card.
      */}
      {picked.length > 0 && totals.savePaisa > 0 ? (
        <p className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#0f7d55] bg-[#e8f6ef] rounded-full px-3 py-1.5 mt-2.5 mb-0">
          <Icon name="check" className="w-3 h-3" />
          Bundle price — you save {formatTaka(totals.savePaisa)}
        </p>
      ) : (
        <p className="text-[12.5px] text-body-soft mt-2.5 mb-0">
          {picked.length === 0
            ? "Add as many as you like — or none."
            : `${picked.length} added · + ${formatTaka(totals.totalPaisa - basePaisa)}`}
        </p>
      )}
    </section>
  );
}
