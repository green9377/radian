"use client";

import Link from "next/link";
import type { Zone } from "../../_store/useZoneStore";
import { formatTaka, type Product } from "../../_data/products";
import { useInWishlist, useWishlistStore } from "../../_store/useWishlistStore";
import { useCardWording } from "./useCardWording";
import TileImage from "../ui/TileImage";

/*
  Reusable product card — Best Sellers, Delivery section, Collection,
  Search, Related rail — the one card used everywhere.

  The wishlist heart works on every page from this one place (one template):
  a saved product shows a filled pink heart, click = toggle. Hydration-safe
  (useInWishlist answers false until hydrated, so server and client hearts
  match).

  Badge rule (approved board): zone = All Bangladesh and a courier-safe
  product → always the courier badge. Image: gradient placeholder.
*/

function HeartIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      className={`w-4 h-4 stroke-current stroke-[1.8] ${filled ? "fill-current" : "fill-none"}`}
      viewBox="0 0 24 24"
    >
      <path
        d="M12 20.3S4 15 4 9.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8 2.9c0 5.4-8 10.7-8 10.7z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg
      className="w-[15px] h-[15px] stroke-current fill-none stroke-[1.8]"
      viewBox="0 0 24 24"
    >
      <path
        d="M3 4h2.4l2.2 12.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.3L21 8H6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.8" cy="20.6" r="1.1" />
      <circle cx="17.6" cy="20.6" r="1.1" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      className="w-[11px] h-[11px] stroke-current fill-none stroke-[1.8]"
      viewBox="0 0 24 24"
    >
      <path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/*  ── DEC-PRD-050 · exactly two badges on a card, never three ──────────────

    One is the DELIVERY PROMISE, top-left. It is the shop's biggest claim and
    the reason somebody chooses Radian over the florist down the road, so it
    never gives up its corner.

    The other is the MERCHANDISING badge, bottom-left of the photograph, and
    only one of the two can show: Best seller beats New. A product can rarely
    be both anyway (a bouquet published last week has no 90-day sales behind
    it), and when it is, "other people bought this" outsells "this is new".

    Bottom-left and not top-right because top-right is the wishlist heart, and
    a card with a pill in all three corners is the crowded screen the brief
    forbids. Two badges on opposite corners of one photograph read as a
    caption; three read as a sale rack.

    FlowerAura, checked 24 Aug 2026, runs the same shape: a delivery pill and
    at most one merchandising pill per card, never both merchandising ones. */
/*  The saving, beside the price and off the photograph (owner, 7 Sep 2026: a
    sticker on the picture spoiled it). The shape is the one the owner set: a
    flat amount as taka, a percent as % — never both.  */
function offLabel(product: Product): string | null {
  const was = product.mrpPaisa;
  if (was == null || was <= product.pricePaisa) return null;
  return product.discountKind === "PERCENT"
    ? `${Math.round(((was - product.pricePaisa) / was) * 100)}% OFF`
    : `${formatTaka(was - product.pricePaisa)} OFF`;
}

function MerchBadge({ product }: { product: Product }) {
  const base =
    "absolute bottom-[12px] left-[13px] z-[4] inline-flex items-center gap-[5px] text-[10.5px] font-semibold tracking-[0.04em] rounded-full px-[10px] py-[5px] whitespace-nowrap shadow-[0_4px_14px_rgba(71,0,102,0.14)]";

  if (product.best) {
    /*  Rose gold, the accent colour, kept for this one thing on a card. It is
        the only label here the shop has to have EARNED, and it should not
        look like the same paint as the delivery promise.  */
    return (
      <span className={`${base} bg-[#FFF6EC] text-[#8A5A00] border border-[#EBD3B0]`}>
        <span className="text-[11px] leading-none">★</span> Best seller
      </span>
    );
  }
  if (product.neu) {
    return (
      <span className={`${base} bg-lavender text-purple`}>New</span>
    );
  }
  return null;
}

/*  ── THE PILL SAYS WHAT THE DELIVERY MASTERS SAY — 4 Sep 2026 ─────────────

    "Today, 2 hrs" was typed here and sat on every express card while the
    admin's fastest service was a 3-hour express; "1–3 days" likewise, whatever
    the courier method actually promised. The words now come from
    `/shop/card-wording` (the type's own name, the method's own ETA), and until
    they arrive — or when the shop advertises no such service — the pill says
    LESS: "Nationwide" without a number, "Midnight ready" without a time, and
    a product with no speed the shop can name gets no pill at all. A speed
    claim is a promise; the card is not allowed to invent one.  */
function Badge({ product, zone }: { product: Product; zone: Zone | null }) {
  const words = useCardWording();
  const kind =
    zone === "bangladesh" && product.zone === "both"
      ? "courier"
      : product.badge;

  const base =
    "absolute top-[13px] left-[13px] z-[4] inline-flex items-center gap-[6px] text-[11px] font-semibold tracking-[0.04em] rounded-full px-3 py-[6px] whitespace-nowrap shadow-[0_4px_14px_rgba(71,0,102,0.12)]";

  if (kind === "midnight") {
    return (
      <span className={`${base} bg-purple text-white`}>
        <MoonIcon /> {words?.midnight ?? "Midnight ready"}
      </span>
    );
  }
  if (kind === "courier") {
    return (
      <span className={`${base} bg-[#FFF4E3] text-[#8A5A00]`}>
        🚚 {words?.courier ?? "Nationwide"}
      </span>
    );
  }
  // the fast pill: the timed service for an express product, the same-day
  // service for one that can only leave today — and nothing for one that can do neither
  if (!product.exp && !product.sd) return null;
  const fast = product.exp ? words?.express : words?.sameDay;
  if (words && !fast) return null;
  return (
    <span className={`${base} bg-white/95 text-purple`}>
      <span className="w-[7px] h-[7px] bg-orchid rounded-[50%_50%_50%_0] -rotate-45 inline-block" />
      {fast ?? "Today"}
    </span>
  );
}

export default function ProductCard({
  product,
  zone,
}: {
  product: Product;
  zone: Zone | null;
}) {
  const saved = useInWishlist(product.slug);
  const toggle = useWishlistStore((s) => s.toggle);

  return (
    <div className="bg-white rounded-[28px] overflow-hidden shadow-soft transition-all duration-300 hover:-translate-y-[7px] hover:shadow-lift relative h-full flex flex-col">
      {/* the picture — a real <img> with the product's name as its alt */}
      <Link href={`/p/${product.slug}`} className="block">
        <TileImage src={product.imageUrl} alt={product.name} variant="card" className="aspect-square">
          <Badge product={product} zone={zone} />
          <MerchBadge product={product} />
        </TileImage>
      </Link>

      {/* Wishlist */}
      <button
        type="button"
        onClick={() => toggle(product.slug)}
        aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
        aria-pressed={saved}
        className={`absolute top-[11px] right-[11px] z-[4] w-9 h-9 rounded-full grid place-items-center transition-all duration-200 hover:scale-[1.08] cursor-pointer ${
          saved
            ? "bg-white text-orchid"
            : "bg-white/90 text-purple hover:text-orchid"
        }`}
      >
        <HeartIcon filled={saved} />
      </button>

      {/* Body */}
      <div className="px-3 sm:px-[19px] pt-4 pb-4 sm:pb-5">
        <Link href={`/p/${product.slug}`}>
          <h3 className="text-[15.5px] font-medium text-ink whitespace-nowrap overflow-hidden text-ellipsis">
            {product.name}
          </h3>
        </Link>
        {/* The line under the name is always there, even empty — otherwise a
            card with "3 sold" is taller than its neighbour and the price row
            jumps up on the cards that have nothing to say (owner, 5 Sep 2026). */}
        <div className="flex items-center gap-[6px] text-[12px] text-rosegold mt-[5px] mb-[10px] min-h-[18px] whitespace-nowrap overflow-hidden text-ellipsis">
          {product.stars}
          {product.meta && (
            <span className="text-body-soft overflow-hidden text-ellipsis">
              {product.stars ? "· " : ""}
              {product.meta}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-[6px] sm:gap-[10px]">
          {/*  DEC-PRD-035 — "from" when every colour prices itself, because
              this number is then the cheapest one, not the price of whatever
              they end up choosing. A card that says ৳4,400 over a page that
              charges ৳450 is the shop contradicting itself in public.  */}
          <div className="min-w-0">
            <div className="font-display text-[17px] sm:text-[20px] font-semibold text-purple whitespace-nowrap">
              {product.priceFrom && (
                <span className="text-[12px] font-medium text-body-soft mr-1">from</span>
              )}
              {formatTaka(product.pricePaisa)}
              {/* the struck price, when a discount is really cutting it */}
              {product.mrpPaisa != null && product.mrpPaisa > product.pricePaisa && (
                <span className="ml-1.5 text-[12.5px] font-medium text-body-soft line-through">{formatTaka(product.mrpPaisa)}</span>
              )}
            </div>
            {/* the saving, under the price — off the photograph (owner, 7 Sep 2026) */}
            {offLabel(product) && (
              <span className="inline-block mt-1 text-[11px] font-bold text-[#0E7A3D] bg-[#E8F9EE] border border-[#C4EED4] rounded-full px-2 py-[2px] whitespace-nowrap">
                {offLabel(product)}
              </span>
            )}
          </div>
          {/*  A closed door reads as one (7 Sep 2026): the same availability
              rule the page and the order door use. "Add" opens the product
              page — colour, size and message are chosen there, so a card
              never puts a guessed variant in the cart.  */}
          {product.availability === "OUT_OF_STOCK" ? (
            <span className="inline-flex items-center rounded-full bg-[#F3F0F6] text-body-soft px-3 sm:px-[16px] py-2 sm:py-[10px] text-[12.5px] sm:text-[13px] font-semibold shrink-0">
              Sold out
            </span>
          ) : (
            <Link
              href={`/p/${product.slug}`}
              aria-label={`Add ${product.name}`}
              className="inline-flex items-center gap-[5px] sm:gap-[7px] bg-lavender text-purple rounded-full px-3 sm:px-[18px] py-2 sm:py-[10px] text-[12.5px] sm:text-[13px] font-semibold transition-all duration-200 hover:bg-purple hover:text-white cursor-pointer shrink-0"
            >
              {product.availability === "PRE_ORDER" ? "Pre-order" : "Add"} <CartIcon />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
