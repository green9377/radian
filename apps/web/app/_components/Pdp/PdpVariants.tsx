"use client";

import Link from "next/link";

import { formatTaka } from "../../_data/products";
import { bundleTotals, type BundleList } from "../../_data/bundlePricing";
import type {
  BundleOption,
  PickedVariant,
  SizeOption,
  VariantGroup,
  VariantPart,
} from "../../_data/productDetails";
import Icon from "./PdpIcons";
import TileImage from "../ui/TileImage";
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
  /**
   * DEC-PRD-045 fix (31 Aug 2026) — the second argument says whether the
   * customer pressed the value that was ALREADY chosen on that same list.
   * Only then does pressing again mean "unchoose"; see the note on `pickValue`.
   */
  onPick: (id: string, sameValuePressed: boolean) => void;
}) {
  const active = variants.find((v) => v.id === activeId);

  /*  R1, 4 Sep 2026 — whether an option is sold out is the SHOP's verdict
      (`soldOut`, decided on the server beside `availability`), not a guess
      made from the numbers here. The old guess — "all zeroes means the boxes
      were never filled, so nothing is sold out" — let a colour with an empty
      shelf be bought and then refused at Preparing. It survives only as a
      fallback for a payload without the flag. PdpView reads the same flag.  */
  const anyStock = variants.some((v) => v.stockQty > 0);
  const isOut = (v: PickedVariant) => v.soldOut ?? (anyStock && v.stockQty === 0);

  /*  ── DEC-PRD-045 · one row of buttons per list ────────────────────────
      A product in three sizes and three colours arrives here as nine
      variants. Drawn flat that is nine buttons reading "Small · Red",
      "Small · Pink" … which nobody can choose from. Drawn as two rows it is
      three buttons and three buttons, and the pair between them is the
      thing being bought.

      A product with one list has one part per variant, so this produces
      exactly one row — the screen it always was.  */
  const partsOf = (v: PickedVariant): VariantPart[] =>
    v.parts?.length
      ? v.parts
      : [
          {
            valueId: v.id,
            label: v.label,
            attribute: v.attribute,
            attributeId: v.attribute,
            displayMode: v.displayMode,
            swatch: v.swatch,
            imageUrl: v.imageUrl,
          },
        ];

  /*  The lists, in the order the first variant carries them — which is the
      master's own order, set on the server.  */
  const axes: { id: string; name: string; displayMode: string; values: VariantPart[] }[] = [];
  for (const v of variants) {
    for (const p of partsOf(v)) {
      let axis = axes.find((a) => a.id === p.attributeId);
      if (!axis) {
        axis = { id: p.attributeId, name: p.attribute, displayMode: p.displayMode, values: [] };
        axes.push(axis);
      }
      if (!axis.values.some((x) => x.valueId === p.valueId)) axis.values.push(p);
    }
  }

  /** what is chosen right now, per list */
  const chosen = new Map<string, string>();
  if (active) for (const p of partsOf(active)) chosen.set(p.attributeId, p.valueId);

  /*  Every variant that would still be reachable if this one value were
      chosen and the OTHER lists kept their current answer. Empty means the
      shop does not sell that combination — the button goes quiet rather than
      leading to a dead end (the fault every two-axis shop has to answer).  */
  const reachable = (axisId: string, valueId: string) =>
    variants.filter((v) => {
      const parts = partsOf(v);
      if (!parts.some((p) => p.attributeId === axisId && p.valueId === valueId)) return false;
      return parts.every(
        (p) => p.attributeId === axisId || !chosen.has(p.attributeId) || chosen.get(p.attributeId) === p.valueId,
      );
    });

  /*  Pressing a button keeps every other list where it is. When that exact
      pair is not sold, the nearest one carrying the pressed value is taken
      instead — in stock first, so a press never lands on "Sold out" while a
      live pair exists.  */
  const pickValue = (axisId: string, valueId: string) => {
    const near = reachable(axisId, valueId);
    const pool = near.length
      ? near
      : variants.filter((v) => partsOf(v).some((p) => p.attributeId === axisId && p.valueId === valueId));
    const target = pool.find((v) => !isOut(v)) ?? pool[0];
    /*  ⚠️ 31 Aug 2026 — the owner's bug: "variant select hoyeo ase na".
        On a two-list product, pressing Pink already resolves to the pair
        Pink · Large. Pressing Large then resolves to the SAME pair, and the
        toggle upstairs read that as "you pressed what was already chosen" and
        cleared the whole selection — the big photo snapped back to the
        product's own image, Add to Cart went back to "Choose an option", and
        anything ordered after that carried no variant at all.
        Unchoosing may only happen when the pressed value is the one already
        chosen ON THIS LIST. Pressing the other list is always a choice.  */
    /*  ⚠️ Only a ONE-list product may be unchosen by pressing again. On two
        lists the shopper never chose half of it — pressing Pink made the shop
        pick Large for them — so pressing Large is them CONFIRMING a value they
        were handed, not asking to clear it. Reading it as "unchoose" is what
        threw the selection away and sent the photo back to the main image.  */
    if (target) onPick(target.id, axes.length === 1 && chosen.get(axisId) === valueId);
  };

  return (
    <>
      {axes.map((axis) => {
        const asSwatch = axis.displayMode === "SWATCH";
        const asPhoto = axis.displayMode === "PHOTO";
        const here = chosen.get(axis.id);
        const chosenLabel = axis.values.find((x) => x.valueId === here)?.label;

        return (
          <section className="mb-6" key={axis.id}>
            <div className="flex items-baseline gap-2 mb-3">
              <b className="text-[14px] font-bold text-ink">{axis.name}</b>
              {chosenLabel && (
                <span className="text-[13px] text-body-soft">
                  — {chosenLabel}
                  {/*  The chip above gives the whole product's total (6 + 4 = 10).
                      The number for the exact thing being bought belongs here,
                      because this is where the decision is made — reading "10 left"
                      and then asking for 8 red ones ends in disappointment.  */}
                  {showStock && axes.length === 1 && active && active.stockQty > 0 && (
                    <span className="text-body-soft"> · {active.stockQty} left</span>
                  )}
                </span>
              )}
            </div>

            <div className={`flex flex-wrap ${asSwatch ? "gap-3" : "gap-2.5"}`}>
              {axis.values.map((val) => {
                const on = here === val.valueId;
                const near = reachable(axis.id, val.valueId);
                /*  Not sold in this combination at all, or sold and run out.
                    Both end the same way for the customer, so both look the
                    same: the button is there, and it is shut.  */
                const out = near.length === 0 || near.every(isOut);
                /*  Only worth printing on a single-list product. With two
                    lists a price belongs to the PAIR, and printing it under
                    one half of the pair is how a page tells a lie.  */
                const only = axes.length === 1 ? near[0] : null;
                const dearer = !!only && only.pricePaisa !== basePaisa;

                /*
                  ⚠️ The round colour button shows the **colour**, not the photo —
                  owner, 9 Aug 2026 (translated): *"if you select a colour and give an
                  image, the frontend shows that image instead of the colour's name
                  and colour, which is a problem for the customer."*

                  A photo only goes here when the list is of the PHOTO kind (flavour,
                  pattern) — where there is no colour to show at all.
                */
                const fill = asSwatch
                  ? val.swatch || "#DDC9EC"
                  : val.imageUrl
                    ? `url(${val.imageUrl}) center/cover`
                    : val.swatch || "#DDC9EC";

                /*
                  ⚠️ A photo is never required — the owner's rule, 2 Aug 2026:
                  *"ami chai eta requirement na hok"*. A value with no photo sits
                  there with just its name; an empty purple square would read as an
                  image that failed to load.
                */
                const withPhoto = asPhoto && !!val.imageUrl;

                if (asSwatch) {
                  return (
                    <button
                      key={val.valueId}
                      onClick={() => !out && pickValue(axis.id, val.valueId)}
                      disabled={out}
                      aria-current={on}
                      title={out ? `${val.label} — not available` : val.label}
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
                      {/*  Shut is shown with a strike — fading alone looks the
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
                    key={val.valueId}
                    onClick={() => !out && pickValue(axis.id, val.valueId)}
                    disabled={out}
                    aria-current={on}
                    className={`text-left rounded-[12px] border-[1.5px] overflow-hidden bg-white transition-all duration-200 ${
                      withPhoto ? "w-[86px]" : "px-4 py-2.5"
                    } ${
                      on ? "border-orchid bg-orchid-soft" : "border-lavender-deep hover:border-orchid-mid"
                    } ${out ? "opacity-45 cursor-not-allowed" : "active:scale-[0.97]"}`}
                  >
                    {withPhoto && <TileImage src={val.imageUrl} alt={val.label} variant="thumb" className="aspect-square" />}
                    <span className={withPhoto ? "block px-1.5 pt-1.5 pb-2" : "block"}>
                      <span
                        className={`block text-[13px] font-semibold truncate ${
                          on ? "text-purple" : "text-ink"
                        } ${out ? "line-through" : ""}`}
                      >
                        {val.label}
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
                        ) : dearer && only ? (
                          <>
                            {formatTaka(only.pricePaisa)}
                            {only.wasPaisa ? (
                              <span className="line-through opacity-60 ml-1">{formatTaka(only.wasPaisa)}</span>
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
      })}
    </>
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
              href={`/p/${o.slug}`}
              aria-label={o.label}
              title={o.label}
              className={`${shape} ring-1 ring-lavender-deep ring-offset-2 transition-transform hover:scale-110`}
              style={{ background: o.swatch }}
            />
          ) : (
            <Link
              key={o.slug}
              href={`/p/${o.slug}`}
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
  ONE CARD LANGUAGE — owner, 26 Aug 2026:

  *"ami chai agula amn vabe sajaw jate sobgula aksate sundor shape a thake…
   akta product a jodi amder sob use kra lage tahole se page ta kmn hobe"*

  Upgrade, bundle and add-on all draw the SAME photo card now: square photo,
  name, price, and a mark in the top-right corner that is always visible —
  a circle where only one can be chosen (upgrade), a rounded square where
  several can (bundle, add-on). The mark's shape is the promise.

  And none of the three stacks downward any more: each section is ONE ROW
  that scrolls sideways (*"beshi hole nicher dike chole ase ata thik krba"*).
  The row shows a sliver of the next card so the scroll explains itself.
  ═══════════════════════════════════════════════════════════════════════════
*/
export function CardRail({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="flex gap-3 overflow-x-auto scrollbar-none snap-x pb-1 -mx-1 px-1">
        {children}
      </div>
      {/*  the fade is the rail saying "there is more this way" — without it a
          row that happens to end at the edge looks finished when it is not  */}
      <span className="pointer-events-none absolute right-[-4px] top-0 bottom-1 w-10 bg-gradient-to-l from-white to-transparent" />
    </div>
  );
}

export function CornerMark({ on, round }: { on: boolean; round?: boolean }) {
  return (
    <span
      className={`absolute top-2 right-2 z-[3] w-[22px] h-[22px] grid place-items-center transition-colors shadow-[0_2px_8px_rgba(71,0,102,0.12)] ${
        round ? "rounded-full" : "rounded-[7px]"
      } ${on ? "bg-orchid text-white" : "bg-white/95 border-[1.5px] border-lavender-deep"}`}
    >
      {on && <Icon name="check" className="w-3 h-3" />}
    </span>
  );
}

export function PickCard({
  on,
  round,
  bg,
  tag,
  name,
  priceLine,
  onClick,
  ariaPressed,
}: {
  on: boolean;
  round?: boolean;
  bg: string;
  tag?: string | null;
  name: string;
  priceLine: React.ReactNode;
  onClick: () => void;
  ariaPressed?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={ariaPressed}
      aria-current={ariaPressed === undefined ? on : undefined}
      className={`relative w-[148px] sm:w-[156px] shrink-0 snap-start text-left rounded-[18px] overflow-hidden bg-white border-2 transition-all duration-200 active:scale-[0.97] ${
        on
          ? "border-orchid shadow-[0_10px_28px_rgba(207,67,234,0.18)]"
          : "border-lavender-deep hover:border-orchid-mid hover:-translate-y-[3px]"
      }`}
    >
      {tag && (
        <span className="absolute top-2 left-2 z-[3] bg-orchid text-white text-[9px] font-bold tracking-[0.1em] uppercase rounded-full px-2 py-1">
          {tag}
        </span>
      )}
      <CornerMark on={on} round={round} />
      <TileImage src={bg} alt={name} variant="thumb" className="aspect-square" />
      <span className="block px-3 pt-2.5 pb-3">
        <span className={`block text-[12.5px] font-semibold truncate ${on ? "text-purple" : "text-ink"}`}>
          {name}
        </span>
        <span className="block font-display text-[15px] font-semibold text-purple mt-0.5">
          {priceLine}
        </span>
      </span>
    </button>
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
  thisBg,
  activeSlug,
  onPick,
}: {
  upgrades: { slug: string; name: string; pricePaisa: number; bg: string }[];
  /** the name of this page's own product — the first card */
  thisName: string;
  thisPaisa: number;
  /** this product's own photo, so the first card is a real card too */
  thisBg: string;
  /** `null` = this product itself is the one selected */
  activeSlug: string | null;
  onPick: (slug: string | null) => void;
}) {
  /*  ⚠️ The row-list with a bare radio is gone — owner, 26 Aug 2026: the
      bundle's photo cards were the style he liked, so the upgrade speaks the
      same language now. The mark stays ROUND, because only one size can be
      chosen — the shape is the promise (bundles keep the square).  */
  const options = [
    { slug: null as string | null, name: thisName, pricePaisa: thisPaisa, bg: thisBg },
    ...upgrades,
  ];

  return (
    <section className="mb-7">
      <BlkTitle title="Choose the size you want to send" hint="one of these" />
      <CardRail>
        {options.map((o) => (
          <PickCard
            key={o.slug ?? "__this"}
            on={o.slug === activeSlug}
            round
            bg={o.bg}
            tag={o.slug === null ? "This one" : null}
            name={o.name}
            priceLine={formatTaka(o.pricePaisa)}
            onClick={() => onPick(o.slug)}
          />
        ))}
      </CardRail>
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
  basePaisa,
  list,
  onToggle,
}: {
  bundles: BundleOption[];
  activeIds: string[];
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
      <BlkTitle title="Make It a Bundle" />
      {/*  The card shows the item's **own** price — no discount. The discount
          is written once under the list, because it applies to the total
          including the main product. Square marks: several can be taken.  */}
      <CardRail>
        {bundles.map((b) => (
          <PickCard
            key={b.id}
            on={activeIds.includes(b.id)}
            bg={b.bg}
            tag={b.tag}
            name={b.label}
            priceLine={<>+ {formatTaka(b.pricePaisa)}</>}
            onClick={() => onToggle(b.id)}
            ariaPressed={activeIds.includes(b.id)}
          />
        ))}
      </CardRail>

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
