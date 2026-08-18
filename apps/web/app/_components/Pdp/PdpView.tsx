"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useZoneStore } from "../../_store/useZoneStore";
import { useCartStore } from "../../_store/useCartStore";
import { formatTaka } from "../../_data/products";
import { track } from "../../_data/tracking";
import {
  ADDON_TABS,
  OFFERS,
  getAddon,
  type AddonGroup,
  type AddonItem,
  type ProductDetail,
} from "../../_data/productDetails";
import Icon from "./PdpIcons";
import { BlkTitle, CtaRow, OutOfZone, SoldOut, StickyBar } from "./PdpBuyBar";
import OfferWindow from "./OfferWindow";
import { BundleCards, SizeRow, UpgradeRow, VariantPicker, VariantRow } from "./PdpVariants";
import { bundleTotals } from "../../_data/bundlePricing";

/*
  PDP - gallery plus buy panel. One client component, because upgrade, add-on
  and qty all touch the same price state.

  Layout (FlowerAura pattern):
   - Thumbnails run vertically down the left, so the main image stays large and
     the trust icons still fit on the same screen.
   - Delivery slot, gift message and anonymous gift all live in CHECKOUT, never
     on the PDP.
*/

const FALLBACK_BG = "linear-gradient(150deg,#EFE4F7,#DDC9EC)";

/**
 * At or below this number, stock is shown as "only a few left".
 *
 * 5 - the admin's own Low-stock list uses this same number, so what the shop
 * calls low and what the buyer sees stay the same thing.
 */
const LOW_STOCK = 5;

export default function PdpView({ detail }: { detail: ProductDetail }) {
  const router = useRouter();
  const { zone } = useZoneStore();
  const { product } = detail;

  /*
    DEC-PRD-012 - colour, flavour and size all live on this page. Clicking one
    navigates nowhere; only the image, price and stock change.

    NOTHING IS SELECTED AT FIRST - DEC-PRD-031, owner, 8 August 2026.
    The first in-stock variant used to be selected automatically, and its photo
    displaced the main one - so the customer never saw the product's own
    picture at all, which is exactly what the owner spotted. Now the page opens
    on the product's own photo and price; choosing a colour or stem count is
    what changes them.
  */
  const vList = detail.variants ?? [];
  /*
    DEC-PRD-036 - the owner, 9 August 2026: *"prothome je price show hoy, amar
    bujhar upay nei ota kon variant-er. je price show hok se variant-e click
    thakle eta clear hobe."* (When a price is shown first, I have no way of
    knowing which variant it belongs to. Whichever price is shown, that
    variant should be clicked, and then it is clear.)

    So the page opens WITH THAT COLOUR SELECTED - the one whose price the
    "from ৳50" refers to - and the price and the selection say the same thing.
    This applies only when every variant carries its own price (priceFrom); if
    the product has a price of its own, the old rule stands: nothing selected,
    main photo, main price (the 8 August decision is untouched).
  */
  const cheapestId =
    detail.priceFrom && vList.length > 0
      ? vList.reduce((a, b) => (b.pricePaisa < a.pricePaisa ? b : a)).id
      : "";
  const [variantId, setVariantId] = useState(cheapestId);

  /*
    DEC-PRD-020 - the larger version. The owner, 2 August 2026: *"clicking an
    upgrade product should change the price, but it must not take me to
    another page."*

    `null` means this product, the one the page is open on. Choosing an upgrade
    changes the price and the photo while the URL stays put - the customer
    stays where they were.
  */
  const upList = detail.upgrades ?? [];
  const [upgradeSlug, setUpgradeSlug] = useState<string | null>(null);
  const upgrade = upList.find((u) => u.slug === upgradeSlug) ?? null;

  /* Three layers: colour is a sibling product (a link), size and bundle are here */
  const [sizeId, setSizeId] = useState(detail.sizes[0].id);
  /*
    DEC-PRD-018 - the owner, 2 August 2026: *"taking just the main product
    gets no discount; the discount comes as soon as an extra product is
    selected from a bundle"*. Any number may be taken from the list, so this
    is a list of ids rather than one id.

    Nothing is selected at the start. The "Most loved" card used to be
    pre-selected - meaning the Buy Now figure included, from the moment the
    page opened, the price of something the customer never asked for. Now the
    price only rises once they add something.
  */
  const [bundleIds, setBundleIds] = useState<string[]>([]);
  const [tabIdx, setTabIdx] = useState(0);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState(1);
  const [media, setMedia] = useState<number | "video">(0);
  const [added, setAdded] = useState(false);
  const [wished, setWished] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [clock, setClock] = useState<string | null>(null);

  /* Personalisation - it has to be held in state to reach the cart (it used
     to be uncontrolled) */
  const [persoText, setPersoText] = useState("");
  const [persoImage, setPersoImage] = useState("");

  const addLine = useCartStore((s) => s.add);

  const variant = vList.find((v) => v.id === variantId) ?? null;

  /*
    The selected variant's photo takes the first slot, in both the thumbnails
    and the large image.

    It REPLACES rather than appends. Appending would have grown the thumbnail
    count every time the colour changed and shifted `media`'s index, so after
    picking red, clicking photo 2 opened photo 3.
  */
  /*  When an upgrade is selected its photo takes the first slot - the owner's
      rule is that the price and the photo both change. Upgrade wins over the
      variant photo, because selecting an upgrade clears the colour selection
      anyway (below): that colour belongs to a different product.  */
  /*
    ═══ GALLERY - DEC-PRD-036, owner 9 August 2026 ═════════════════════════

    *"variant-er image just click korar pore ase - egula gallery-teo thakbe.
    customer colour select korle gallery theke se colour-er image asbe, abar
    gallery theke je variant-er image dekhbe, pash theke se variant-e auto
    move hobe."* (A variant's image only appears after a click - these should
    be in the gallery too. When the customer selects a colour, that colour's
    image should come up from the gallery, and when they view a variant's
    image in the gallery, the selection beside it should move to that variant
    automatically.)

    So the list is now FIXED: all of the product's own photos first, then every
    colour's photo - always, whatever is selected. The slots do not move, so
    the indexes do not move either.

    Bound both ways:
      pick a colour        -> the large image jumps to that colour's slot (effect below)
      open a colour's photo -> that colour becomes selected (openMedia)
    Viewing the product's own photos changes nothing - you can browse them with
    a colour still held.
  */
  const variantSlots = upgrade ? [] : vList.filter((v) => v.imageUrl);
  const gallery = upgrade
    ? [upgrade.bg, ...detail.gallery]
    : [...detail.gallery, ...variantSlots.map((v) => `url(${v.imageUrl}) center/cover`)];

  const openMedia = (i: number) => {
    setMedia(i);
    const slot = i - detail.gallery.length;
    if (!upgrade && slot >= 0 && variantSlots[slot]) setVariantId(variantSlots[slot].id);
  };

  /*  Changing the colour moves the large image to its slot; a colour with no
      photo (or clearing the selection) returns to the first image - otherwise,
      changing colour while photo 4 was open meant nobody ever saw the new
      one.  */
  useEffect(() => {
    if (upgrade) return;
    const slot = variant?.imageUrl ? variantSlots.findIndex((v) => v.id === variant.id) : -1;
    setMedia(slot >= 0 ? detail.gallery.length + slot : 0);
  }, [variantId]);   // eslint-disable-line react-hooks/exhaustive-deps

  /*
    Selecting an upgrade clears the colour and bundle selections, deliberately.
    An upgrade is A DIFFERENT PRODUCT - it has its own colours, its own stock
    and its own bundle list, and none of those were loaded onto this page.
    Keeping the old selections would have put "50 roses in the red of the
    24-stem one" into the cart - a thing that exists nowhere.
  */
  useEffect(() => {
    if (!upgradeSlug) return;
    setMedia(0);
    setVariantId("");
    setBundleIds([]);
  }, [upgradeSlug]);

  const size = detail.sizes.find((s) => s.id === sizeId) ?? detail.sizes[0];
  const blocked = zone === "bangladesh" && product.zone === "dhaka";

  useEffect(() => {
    track("ViewContent", {
      content_id: product.slug,
      content_name: product.name,
      value: product.pricePaisa / 100,
      currency: "BDT",
    });
  }, [product.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
    Normalise the add-on tabs into one shape.

    `detail.addonTabs` used to be only tab IDs, and each add-on was looked up
    with `getAddon(key)` against a list inside this very file. An add-on from
    the database is not in that list - so it rendered with no price and then
    vanished silently on the way to the cart. The API now sends whole tabs
    (`addonGroups`); the mock path survives only for the cart's old hard-coded
    catalog.
  */
  const groups: AddonGroup[] = useMemo(() => {
    if (detail.addonGroups) return detail.addonGroups;
    return detail.addonTabs
      .map((id) => ADDON_TABS.find((t) => t.id === id))
      .filter((t): t is (typeof ADDON_TABS)[number] => Boolean(t))
      .map((t) => ({
        id: t.id,
        label: t.label,
        items: t.items.map((k) => getAddon(k)).filter((a): a is AddonItem => a !== null),
      }));
  }, [detail.addonGroups, detail.addonTabs]);

  /*  One map to look prices up in - the same add-on in two tabs is counted
      once.  */
  const addonByKey = useMemo(() => {
    const m = new Map<string, AddonItem>();
    for (const g of groups) for (const a of g.items) m.set(a.key, a);
    return m;
  }, [groups]);

  const addonTotal = useMemo(
    () =>
      Object.keys(picked)
        .filter((k) => picked[k])
        .reduce((sum, k) => sum + (addonByKey.get(k)?.pricePaisa ?? 0), 0),
    [picked, addonByKey],
  );

  /*
    Price = size + bundle (+ add-ons).

    The struck-through price is no longer invented (31 Jul 2026). It used to be
    `unitPaisa / 0.81` - which is to say "19% OFF" on all 71 products, whether
    any discount had been given or not. `detail.mrpPaisa` now comes from the
    owner's own discount; with no discount it is null and no strike-through is
    drawn at all.

    The discount ratio is measured against the base price and applied to the
    chosen size - 20% off a product means 20% off Large too. There is no
    per-size MRP field in the schema; if the owner wants size-specific
    discounts, that is a separate decision.
  */
  /*
    DEC-PRD-012 - when a variant carries its own price, that price wins.

    It is compared against the product's price because, with no override, the
    server returns the product's price - so a difference means the owner
    really did type a different one. The owner's rule: *"for the same product,
    if only the colour changes the price stays the same; if the kg changes it
    differs."*
  */
  /*  If a variant is selected, its price is used - never guessed by comparing
      numbers. The server payload applies the discount and sends the final
      figure (DEC-PRD-032); had that coincidentally equalled the product's
      price, the old condition would have concluded "this variant has no price
      of its own" and shown the wrong one. 9 August 2026.  */
  const variantPaisa = variant ? variant.pricePaisa : null;
  /*
    DEC-PRD-018 - the owner, 2 August: the discount applies to the total
    INCLUDING the main product, and only once something is taken from the
    list. So the base is what the customer is paying for the main item - the
    price after choosing a colour or a size. Take the 2 kg cake and the
    discount lands on that larger price.
  */
  /*  When an upgrade is selected that is the real price - it is a different
      product with a price of its own. Colour and size are cleared at that
      point (the effect above), so two rules never fight here.  */
  const chosenPaisa = upgrade ? upgrade.pricePaisa : (variantPaisa ?? size.pricePaisa);
  const totals = bundleTotals(chosenPaisa, detail.bundle, bundleIds);
  const unitPaisa = totals.totalPaisa;
  const offRatio =
    detail.mrpPaisa && detail.mrpPaisa > product.pricePaisa
      ? 1 - product.pricePaisa / detail.mrpPaisa
      : 0;
  /*  DEC-PRD-032 - with a colour selected, the struck-through price is ITS
      OWN, the `wasPaisa` the server sent. Once a bundle is added no
      strike-through is shown at all: the total is no longer the price of that
      one thing, and two unlike numbers side by side make the customer compute
      a saving that is not real. 9 August 2026.  */
  /*  DEC-PRD-031 - a variant's own price is final; the product's discount does
      not stack on it. This used to invert the ratio and invent a "was" price
      (৳1,300 / 0.9166 = ৳1,418) - the server saying flat ৳200 and the page
      saying ratio ৳118, two sets of arithmetic producing a meaningless
      number. The owner caught it on 8 August.  */
  const bundled = bundleIds.length > 0;
  const wasPaisa = variant
    ? !bundled && variant.wasPaisa
      ? variant.wasPaisa
      : null
    : offRatio > 0
      ? Math.round(unitPaisa / (1 - offRatio))
      : null;
  const total = (unitPaisa + addonTotal) * qty;
  /*  The percentage comes from whichever price the discount was applied to -
      the variant's own when there is one, otherwise the product's ratio.  */
  const off = wasPaisa
    ? variant
      ? Math.round(((wasPaisa - unitPaisa) / wasPaisa) * 100)
      : Math.round(offRatio * 100)
    : 0;

  /*
    Order cut-off countdown.

    This used to be `cut.setHours(18, 0, 0, 0)` - the component assuming 6pm by
    itself. Two faults at once: (1) if a delivery mode's real cut-off was not
    6pm the clock lied, and (2) the arithmetic ran ON THE VIEWER'S CLOCK, so
    somebody watching from Toronto saw Dhaka's cut-off nine hours away.

    The server now sends how many minutes remain in Bangladesh time and the
    browser only counts down. Once every cut-off for the day has passed it is
    `null` - no clock is shown, and it does not quietly restart counting for
    tomorrow morning. Withdrawing a promise that has expired is honest;
    issuing a fresh one is not.
  */
  const minutesLeft =
    zone === "bangladesh"
      ? (detail.cutoffMinutesLeft?.nationwide ?? null)
      : (detail.cutoffMinutesLeft?.dhaka ?? null);

  useEffect(() => {
    if (minutesLeft === null) {
      setClock(null);
      return;
    }
    /*  The server's minutes plus however long the page has been open. No
        request every second, and the clock never freezes either.  */
    const endsAt = Date.now() + minutesLeft * 60_000;
    const tick = () => {
      const s = Math.max(0, Math.floor((endsAt - Date.now()) / 1000));
      const p = (n: number) => String(n).padStart(2, "0");
      setClock(
        s === 0
          ? null
          : `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`,
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [minutesLeft]);

  /*
    Only the CONFIG goes to the cart, never the price. The cart page recomputes
    it with resolveCart() (a stored price would go stale the moment one
    changed). A variant is a separate product (D16), so product.slug IS the
    variant.
  */
  /** The configuration right now - addToCart and buyNow send the cart the same
      thing */
  function currentLine() {
    return {
      /*  DEC-PRD-020 - with an upgrade selected, ITS slug goes to the cart,
          because that is the product the customer is actually buying. The page
          did not change but the thing did, and the cart has to know the truth -
          otherwise the shop received an order for 24 roses while the customer
          paid for 50.  */
      slug: upgrade ? upgrade.slug : product.slug,
      /*  DEC-PRD-012 - which colour is being bought. Empty means this product
          has no variants. No price travels here; the cart works it out
          again.  */
      variantId: variant?.id,
      sizeId: size.id,
      bundleIds,
      addonKeys: Object.keys(picked).filter((k) => picked[k]),
      persoText: persoText.trim() || undefined,
      persoImage: persoImage || undefined,
      qty,
    };
  }

  /*  DEC-PDP-09 — worked out once, read by three places (CTA row, sticky bar,
      and the guards below). Absent `availability` means the mock is feeding
      this component, and the mock has no stock to run out of. */
  /*
    DEC-PRD-012 - one colour running out does not mean the product has.

    Variant stock only closes the door when AT LEAST ONE variant has stock. If
    every one is zero we assume the owner has not filled those boxes in yet,
    and the product's own count governs. Otherwise a page would have read
    "Sold out" with 30 roses standing in the shop, purely because the variant
    boxes were empty.
  */
  const anyVariantStock = vList.some((v) => v.stockQty > 0);
  const variantOut = anyVariantStock && !!variant && variant.stockQty === 0;
  const soldOut = detail.availability?.state === "OUT_OF_STOCK" || variantOut;
  const preorder =
    detail.availability?.state === "PRE_ORDER"
      ? { backOn: detail.availability.backOn }
      : null;

  function addToCart() {
    /*  ⚠️ A GUARD, NOT A UI DETAIL. `SoldOut` already replaces the buttons, so
        nothing should reach here — but `addLine` is also what the sticky bar
        and any future shortcut call, and a cart line for something we do not
        have becomes a real order later. Cheap to check, expensive to miss.  */
    if (soldOut) return;
    addLine(currentLine());
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  }

  /*
    Buy Now (D17 - the primary CTA). It puts the same config into the cart as
    Add to Cart, but goes straight to /checkout instead of showing the cart
    page. No price here either; resolveCart() works it out at checkout - the
    same rule the cart follows.

    When blocked (a zone mismatch) the OutOfZone panel is showing rather than
    CtaRow, so no separate guard is needed here.
  */
  function buyNow() {
    if (soldOut) return;
    addLine(currentLine());
    router.push("/checkout");
  }

  /*  Live offers when the page came from the API; the hard-coded four only
      while the mock still feeds this component (cart's `resolveCart` does).
      `?? OFFERS` and not `.length ? … : OFFERS` — an API that answers with an
      empty list is saying "nothing is running", and that answer must win. */
  const offers = detail.offers ?? OFFERS;

  /*  Real photographs, or the tinted panel the page falls back to. The
      fallback is a gradient; an uploaded picture arrives as `url(…)`.  */
  const hasPhotos = gallery.some((g) => g.startsWith("url("));

  const tabs = groups;
  const activeTab = tabs[tabIdx] ?? tabs[0];

  return (
    <>
      <div className="grid lg:grid-cols-[1.18fr_1fr] gap-8 lg:gap-10 items-start">
        {/* ════════ GALLERY ════════ */}
        <div className="lg:sticky lg:top-[124px]">
          {/*  ⚠️ The rail is ABSOLUTE inside its grid cell — 9 Aug 2026. With
              every colour's photo now always present (DEC-PRD-036) the rail
              grew TALLER than the main image and dangled below it, which the
              owner caught at once. Absolute means the rail contributes no
              height, so the row's height is the main image's; anything past
              that scrolls quietly inside.  */}
          <div className="grid grid-cols-[68px_1fr] sm:grid-cols-[76px_1fr] gap-3">
            <div className="relative">
            <div className="absolute inset-0 flex flex-col gap-2.5 overflow-y-auto scrollbar-none">
              {gallery.map((bg, i) => (
                <button
                  key={i}
                  onClick={() => openMedia(i)}
                  aria-label={`Photo ${i + 1}`}
                  className={`aspect-square shrink-0 rounded-[12px] border-2 transition-colors ${
                    media === i ? "border-orchid" : "border-transparent"
                  }`}
                  style={{ background: bg }}
                />
              ))}
              {/*  DEC-PRD-036 — the video's OWN thumbnail, not a purple box
                  saying "Watch" (owner, 9 Aug 2026). YouTube serves a still
                  for every video at a predictable address; the play badge on
                  top says it is a video, the picture says what is in it.  */}
              {detail.videoId && (
                <button
                  onClick={() => setMedia("video")}
                  aria-label="Watch video"
                  className={`aspect-square shrink-0 rounded-[12px] border-2 relative overflow-hidden grid place-items-center ${
                    media === "video" ? "border-orchid" : "border-transparent"
                  }`}
                  style={{
                    background: `url(https://i.ytimg.com/vi/${detail.videoId}/hqdefault.jpg) center/cover`,
                  }}
                >
                  <span className="w-8 h-8 rounded-full bg-black/45 text-white grid place-items-center">
                    <Icon name="play" className="w-3.5 h-3.5" />
                  </span>
                </button>
              )}
            </div>
            </div>

            <div className="relative aspect-square rounded-[28px] overflow-hidden shadow-soft bg-lavender">
              {media === "video" && detail.videoId ? (
                <iframe
                  className="absolute inset-0 w-full h-full border-0"
                  src={`https://www.youtube.com/embed/${detail.videoId}?rel=0`}
                  title={`${product.name} video`}
                  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <>
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        gallery[typeof media === "number" ? media : 0] ?? FALLBACK_BG,
                    }}
                  />
                  {/* zoom - clicking the image opens it larger */}
                  <button
                    onClick={() => setZoom(true)}
                    aria-label="Zoom photo"
                    className="absolute inset-0 z-[3] cursor-zoom-in group"
                  >
                    <span className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 bg-white/92 backdrop-blur text-purple text-[11.5px] font-bold rounded-full px-3 py-2 shadow-[0_6px_18px_rgba(71,0,102,0.14)] transition-transform group-hover:scale-105">
                      <Icon name="search" className="w-3.5 h-3.5" />
                      Tap to zoom
                    </span>
                  </button>
                  {/*  No discount, no sticker. This should have been gated
                      along with the struck-through price on day one - because
                      it was not, products with no discount carried a pink
                      badge reading "0% OFF" over the photo.  */}
                  {wasPaisa !== null && (
                    <span className="absolute top-4 left-4 z-[4] bg-orchid text-white text-[12.5px] font-bold rounded-full px-4 py-2 shadow-[0_8px_22px_rgba(207,67,234,0.4)]">
                      {off}% OFF
                    </span>
                  )}
                  {/*  Only when there are no photos. This labels the tinted
                      panel; it is not a watermark. "Product photo" written
                      over a real photograph makes the page look unfinished.  */}
                  {!hasPhotos && (
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px] tracking-[0.18em] uppercase text-purple/40 font-semibold">
                      Product photo
                    </span>
                  )}
                </>
              )}

              <button
                onClick={() => setWished((w) => !w)}
                aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
                aria-pressed={wished}
                className="absolute top-4 right-4 z-[5] w-11 h-11 rounded-full bg-white/90 backdrop-blur grid place-items-center shadow-[0_6px_18px_rgba(71,0,102,0.14)] transition-all duration-200 hover:scale-110 active:scale-95"
              >
                <Icon
                  name="heart"
                  className={`w-[19px] h-[19px] ${
                    wished ? "text-orchid fill-orchid" : "text-purple"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* trust - under the thumbnail row, all three weighted the same */}
          <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-lavender-deep">
            {detail.trust.map((t) => (
              <div key={t.label} className="flex flex-col items-center text-center gap-1.5">
                {/*  DEC-PRD-023 - the shop's own uploaded icon wins when there
                    is one. `<img>` rather than `next/image`: the file can be
                    any size and can be an SVG, which next/image cannot
                    measure.  */}
                <span className="w-10 h-10 rounded-full border-[1.5px] border-lavender-deep grid place-items-center text-purple overflow-hidden">
                  {t.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.iconUrl} alt="" className="w-[20px] h-[20px] object-contain" />
                  ) : (
                    <Icon name={t.icon} className="w-[18px] h-[18px]" />
                  )}
                </span>
                <b className="text-[13px] font-bold text-ink leading-tight">{t.label}</b>
                <span className="text-[12px] text-body-soft font-light leading-tight">
                  {t.sub}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ════════ BUY PANEL ════════ */}
        <div>
          <div className="flex gap-2 flex-wrap mb-3">
            {/*
              ⚠️ THE CHIP CAN NOW BE ABSENT — 1 Aug 2026. It used to be printed
              unconditionally and its text came from the ZONE alone, so every
              Dhaka product carried "30–120 Min Delivery" in green above the
              price whether or not the shop had ticked express for it. That was
              the most visible untruth on the page.

              `deliveryChip` is null when the product can take none of the fast
              options — a hamper that only goes on a scheduled day. An empty
              chip with a lightning bolt in it would be worse than no chip, so
              the whole span goes.
            */}
            {(zone === "bangladesh" || detail.deliveryChip) && (
              <span className="inline-flex items-center gap-1.5 bg-orchid-soft text-purple rounded-lg px-2.5 py-1 text-[11.5px] font-bold">
                <Icon
                  name={zone === "bangladesh" ? "truck" : "bolt"}
                  className="w-3.5 h-3.5 text-orchid"
                />
                {zone === "bangladesh" ? "Nationwide · 1–3 Days" : detail.deliveryChip}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-bold ${
                detail.nature.type === "fresh"
                  ? "bg-[#E8F9EE] text-[#0E7A3D]"
                  : "bg-[#EEF1FB] text-[#3A4B8A]"
              }`}
            >
              <Icon
                name={detail.nature.type === "fresh" ? "leaf" : "sparkle"}
                className="w-3.5 h-3.5"
              />
              {detail.nature.label}
            </span>
          </div>

          <h1 className="font-display text-[clamp(25px,2.8vw,33px)] font-medium text-ink leading-[1.2]">
            {product.name}
          </h1>

          {/*  DEC-PRD-031, ৬ আগস্ট — মালিকের লেখা এক লাইন, title আর
              review-এর মাঝে। ফাঁকা রাখলে line-টাই থাকে না।  */}
          {detail.shortDesc && (
            <p className="mt-1.5 text-[14.5px] text-body-soft leading-[1.5]">
              {detail.shortDesc}
            </p>
          )}

          {/*
            ⚠️ কোনো review না থাকলে পুরো সারিটা উঠে যায় (31 Jul 2026)।
            আগে ৭১টা product-এই hardcoded "4.9 · 412 Reviews" বসানো ছিল —
            একটাও সত্যি নয়। এখন এই product-এর নিজের published review থেকেই
            আসে; না থাকলে ⭐ লাইনটাই নেই, শূন্য বা ধার করা তারা নয়।
          */}
          {(detail.reviews.rating !== null || detail.reviews.live) && (
            <div className="flex items-center gap-2.5 flex-wrap mt-3 text-[13.5px] text-body-soft">
              {detail.reviews.rating !== null && (
                <>
                  {/* 4.9 কীসের মধ্যে — স্পষ্ট করে "out of 5" */}
                  <span className="inline-flex items-center gap-1 bg-[#0E7A3D] text-white rounded-[7px] px-2 py-1 text-[12.5px] font-bold">
                    <Icon name="star" className="w-3 h-3 fill-white stroke-none" />
                    {detail.reviews.rating}
                    <span className="font-medium opacity-80">/5</span>
                  </span>
                  <a href="#reviews" className="text-orchid font-semibold">
                    {detail.reviews.count} Reviews
                  </a>
                </>
              )}
              {detail.reviews.rating !== null && detail.reviews.live && (
                <span className="text-lavender-deep">•</span>
              )}
              {detail.reviews.live && (
                <span className="inline-flex items-center gap-1.5 text-[#0E7A3D] font-semibold">
                  <i className="w-[7px] h-[7px] rounded-full bg-[#0E7A3D] inline-block animate-pulse" />
                  {detail.reviews.live}
                </span>
              )}
            </div>
          )}

          {/*
            ─── কত বাকি ───

            মালিক switch চালু করলে **সংখ্যাটা সবসময় দেখায়** — সেটাই তো
            চালু করার মানে। শুধু **কম হয়ে গেলে সুরটা বদলায়**: শান্ত ধূসর
            "30 in stock" থেকে জরুরি হলুদ "Only 3 left"।

            একই তথ্য, দুই স্বর। ৩০টা থাকা একটা তথ্য; ৩টা থাকা একটা তাড়া।

            `stockLeft` null মানে হয় দোকান বলতে চায় না, নয়তো কিছু গোনা হয় না।
            দুটোর মানে এক — চুপ থাকা।
          */}
          {typeof detail.stockLeft === "number" && detail.stockLeft > 0 && (
            <div
              className={
                "mt-3 inline-flex items-center gap-2 text-[13px] font-semibold rounded-full px-3 py-1.5 border " +
                (detail.stockLeft <= LOW_STOCK
                  ? "text-[#B45309] bg-[#FFF6E5] border-[#F0D9A8]"
                  : "text-[#0E7A3D] bg-[#E8F9EE] border-[#C4EED4]")
              }
            >
              <i
                className={
                  "w-[7px] h-[7px] rounded-full inline-block " +
                  (detail.stockLeft <= LOW_STOCK
                    ? "bg-[#B45309] animate-pulse"
                    : "bg-[#0E7A3D]")
                }
              />
              {detail.stockLeft <= LOW_STOCK
                ? `Only ${detail.stockLeft} left`
                : `${detail.stockLeft} in stock`}
            </div>
          )}

          {/* price — title/review-এর একই ব্লকে, একটাই দাগ */}
          <div className="flex items-baseline gap-3 flex-wrap mt-4">
            <div className="font-display text-[32px] font-semibold text-ink">
              {/*  DEC-PRD-035 — the page opens with nothing picked, so when
                  every colour has its own price this headline is the cheapest
                  of them, not a price on offer. Says "from" until they pick,
                  then becomes that colour's real price.  */}
              {detail.priceFrom && !variant && !upgrade && (
                <span className="text-[15px] font-normal text-body-soft mr-1.5">from</span>
              )}
              {formatTaka(unitPaisa)}
              {/*  "৳2,400 / stick" — smaller and lighter, because it explains
                  the number rather than competing with it. Absent unless the
                  shop set a unit, which it should only do where the measure
                  is the point.  */}
              {detail.unitSuffix && (
                <span className="text-[17px] font-normal text-body-soft ml-1.5">
                  / {detail.unitSuffix}
                </span>
              )}
            </div>
            {/* তিনটেই একসাথে আসে বা একটাও আসে না — ছাড় না থাকলে কাটা দাগ,
                শতাংশ আর "You save" তিনটেরই কোনো মানে নেই */}
            {wasPaisa !== null && (
              <>
                <span className="text-[17px] text-body-soft line-through">
                  {formatTaka(wasPaisa)}
                </span>
                <span className="text-[16px] font-bold text-[#E39400]">{off}% OFF</span>
                {/* কত টাকা বাঁচল — %-এর চেয়ে এটা বেশি বোঝা যায় */}
                <span className="text-[12.5px] font-bold text-[#0E7A3D] bg-[#E8F9EE] border border-[#C4EED4] rounded-full px-2.5 py-1">
                  You save {formatTaka(wasPaisa - unitPaisa)}
                </span>
              </>
            )}
          </div>

          {/*  DEC-PRD-042 — when the offer ends, right under the price where the
              eye already is. Only alongside a real struck price: a window with
              nothing struck through is not an offer, and a variant's own price
              is not covered by the product's window.  */}
          {wasPaisa !== null && !variant && !bundled && detail.offer?.endsAtMs != null && (
            <OfferWindow endsAtMs={detail.offer.endsAtMs} />
          )}

          <div className="h-px bg-lavender-deep my-[18px]" />

          {blocked ? (
            <OutOfZone reason={detail.ozReason} />
          ) : (
            <>
              {/*
                ─── ০. UPGRADE — এটার বড় সংস্করণ ───
                DEC-PRD-020। মালিক: *"upgrade product-এ click করলে price
                change হবে, কিন্তু অন্য page-এ যেন না নেয়।"*

                সবার উপরে, কারণ এটাই সবচেয়ে বড় সিদ্ধান্ত — কোন জিনিসটা
                কেনা হচ্ছে। রঙ বা bundle তার পরের প্রশ্ন।
              */}
              {upList.length > 0 && (
                <UpgradeRow
                  upgrades={upList}
                  thisName={product.name}
                  thisPaisa={variantPaisa ?? size.pricePaisa}
                  activeSlug={upgradeSlug}
                  onPick={setUpgradeSlug}
                />
              )}

              {/* ─── ১. VARIANT — colour বা flavour, sibling product ─── */}
              {/*  ⚠️ upgrade বাছা থাকলে রঙ দেখানো হয় না — ওগুলো এই
                  product-এর রঙ, আর কেনা হচ্ছে অন্যটা।  */}
              {!upgrade && vList.length > 0 && (
                <VariantPicker
                  variants={vList}
                  activeId={variantId}
                  basePaisa={product.pricePaisa}
                  /*  admin-এর "show stock" switch — সেটা বন্ধ থাকলে
                      `stockLeft` আসেই না, আর তখন রঙের পাশেও কিছু লেখা হয় না।  */
                  showStock={detail.stockLeft !== null && detail.stockLeft !== undefined}
                  /*  ⚠️ বাছা রঙে আবার ছোঁয়া = বাছাই তুলে নেওয়া — মূল
                      product-এর ছবি আর দামে ফেরা। আগে ফেরার পথই ছিল না,
                      reload দিতে হতো (মালিক, ৮ আগস্ট)।  */
                  onPick={(id) => setVariantId((cur) => (cur === id ? "" : id))}
                />
              )}
              {detail.variant && <VariantRow group={detail.variant} />}

              {/*
                ─── ২. SIZE — একই product, দাম বদলায় ───
                একটামাত্র option হলে এটা chooser নয়, শুধু একটা লেবেল — এবং
                "Standard" ছাড়া কিছু নেই দেখলে customer ভাবে বাকিটা load
                হয়নি। দাম উপরে আছেই, তাই row-টা লুকিয়ে দেওয়াই সৎ।
                (`getProductDetail`-এর guard নিশ্চিত করে অন্তত একটা থাকবে —
                এটা crash-এর guard নয়, presentation-এর সিদ্ধান্ত।)
              */}
              {detail.sizes.length > 1 && (
                <SizeRow
                  label={detail.sizeLabel}
                  sizes={detail.sizes}
                  activeId={size.id}
                  onPick={setSizeId}
                />
              )}

              {/* ─── ৩. BUNDLE — অন্য product যোগ হয় ─── */}
              {detail.bundles.length > 0 && (
                <BundleCards
                  bundles={detail.bundles}
                  activeIds={bundleIds}
                  hint={detail.bundleHint}
                  basePaisa={chosenPaisa}
                  list={detail.bundle}
                  onToggle={(id) =>
                    setBundleIds((cur) =>
                      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
                    )
                  }
                />
              )}

              {/*
                ─── OFFERS — upgrade আর add-on এর মাঝখানে ───
                কিছু চলমান না থাকলে পুরো strip উঠে যায়। "Offers Available ·
                0 running" লেখা বাক্স খোলার মতো কিছু না থাকা সত্ত্বেও ক্লিক
                টানে — যা পাওয়া যাবে না তার প্রতিশ্রুতি।
              */}
              {offers.length > 0 && (
              <details className="mt-6 border-[1.5px] border-lavender-deep rounded-[18px] overflow-hidden group">
                <summary className="flex items-center gap-3 px-5 py-3.5 cursor-pointer list-none bg-gradient-to-r from-orchid-soft to-[#FDF4FF]">
                  <span className="w-8 h-8 rounded-full bg-white grid place-items-center text-orchid shrink-0">
                    <Icon name="tag" className="w-4 h-4" />
                  </span>
                  <b className="text-[14.5px] text-purple font-bold">Offers Available</b>
                  <span className="text-[12px] text-body-soft">· {offers.length} running</span>
                  <Icon
                    name="chev"
                    className="w-4 h-4 ml-auto text-orchid transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="p-3.5 bg-white space-y-2.5">
                  {offers.map((o) => (
                    <div
                      key={o.text}
                      className="flex items-center gap-3 border border-lavender-deep rounded-[12px] px-3.5 py-3 flex-wrap"
                    >
                      <span
                        className="w-[38px] h-[38px] rounded-[9px] grid place-items-center text-white text-[10.5px] font-bold shrink-0"
                        style={{ background: o.color }}
                      >
                        {o.logo}
                      </span>
                      <p className="text-[13.5px] text-body flex-1 min-w-[160px]">{o.text}</p>
                      {o.code ? (
                        <span className="inline-flex items-center gap-1.5 border border-dashed border-orchid-mid text-orchid bg-orchid-soft rounded-lg px-2.5 py-1.5 text-[12px] font-bold">
                          <Icon name="tag" className="w-3 h-3" />
                          {o.code}
                        </span>
                      ) : (
                        <span className="text-[11.5px] font-semibold text-orchid">{o.note}</span>
                      )}
                    </div>
                  ))}
                </div>
              </details>
              )}

              {/*
                ─── ADD-ONS IN TABS ───
                কোনো tab না থাকলে পুরো section উঠে যায়। খালি grid-এর উপরে
                "Make It Extra Special" শিরোনাম দাঁড়িয়ে থাকলে সেটা ভাঙা
                page-এর মতো দেখায় — homepage-এর category rail-এ ঠিক এই
                নিয়মই নেওয়া হয়েছিল (৩০ জুলাই)।
              */}
              {tabs.length > 0 && (
              <section className="mt-7">
                <BlkTitle title="Make It Extra Special" hint="optional · added to cart" />
                <div className="flex gap-2 overflow-x-auto scrollbar-none mb-3.5">
                  {tabs.map((t, i) => (
                    <button
                      key={t.id}
                      onClick={() => setTabIdx(i)}
                      className={`px-4 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors ${
                        i === tabIdx
                          ? "bg-purple text-white"
                          : "bg-lavender text-body-soft hover:text-purple"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {activeTab?.items.map((a) => {
                    const key = a.key;
                    const on = !!picked[key];
                    return (
                      <button
                        key={key}
                        onClick={() => setPicked((p) => ({ ...p, [key]: !p[key] }))}
                        className={`relative rounded-[18px] overflow-hidden bg-white border-[1.5px] text-center transition-all duration-200 active:scale-[0.97] ${
                          on
                            ? "border-orchid shadow-[0_6px_20px_rgba(207,67,234,0.15)]"
                            : "border-lavender-deep hover:border-orchid-mid"
                        }`}
                      >
                        {on && (
                          <span className="absolute top-[7px] right-[7px] z-[3] w-[22px] h-[22px] rounded-full bg-orchid text-white grid place-items-center">
                            <Icon name="check" className="w-3 h-3" />
                          </span>
                        )}
                        <span className="block aspect-[1/0.85]" style={{ background: a.bg }} />
                        <span className="block px-2.5 pt-2 pb-3">
                          <b className="block text-[11.5px] text-purple font-semibold truncate">
                            {a.name}
                          </b>
                          <span className="text-[11.5px] text-body-soft">
                            +{formatTaka(a.pricePaisa)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
              )}

              {/* ─── PERSONALISATION — শুধু যেখানে দরকার ─── */}
              {detail.perso && (
                <section className="mt-7">
                  <BlkTitle title={detail.perso.title} hint="required" />
                  <div className="bg-lavender border-[1.5px] border-lavender-deep rounded-[18px] p-5 space-y-3.5">
                    {detail.perso.fields.map((f) => (
                      <div key={f.label}>
                        <label className="block text-[13px] font-semibold text-purple mb-1.5">
                          {f.label}
                        </label>
                        {f.type === "text" ? (
                          <>
                            <input
                              value={persoText}
                              onChange={(e) => setPersoText(e.target.value)}
                              className="w-full border-[1.5px] border-lavender-deep rounded-[12px] px-4 py-3 text-[14px] bg-white outline-none focus:border-orchid"
                              placeholder={f.placeholder}
                              maxLength={f.max}
                            />
                            <p className="text-[12px] text-body-soft mt-1.5">{f.hint}</p>
                          </>
                        ) : (
                          <label className="flex items-center gap-3.5 border-[1.5px] border-dashed border-[#CBB6DC] rounded-[12px] p-4 bg-white cursor-pointer hover:border-orchid hover:bg-orchid-soft transition-colors">
                            <span className="w-10 h-10 rounded-full bg-lavender grid place-items-center text-orchid shrink-0">
                              <Icon
                                name={persoImage ? "check" : "upload"}
                                className="w-[18px] h-[18px]"
                              />
                            </span>
                            <span className="min-w-0">
                              <b className="block text-[13.5px] text-purple font-semibold truncate">
                                {persoImage || "Tap to upload"}
                              </b>
                              <span className="text-[12px] text-body-soft">{f.hint}</span>
                            </span>
                            {/*
                              এখন শুধু file NAME রাখা হয় — cart/checkout-এ দেখানোর জন্য।
                              ⇄ SWAP HERE: upload API এলে এখানে asset id বসবে।
                            */}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                setPersoImage(e.target.files?.[0]?.name ?? "")
                              }
                            />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/*
                ─── COUNTDOWN — এখন CTA-র ঠিক উপরে ───

                ⚠️ ঘড়ি না থাকলে পুরো বাক্সটাই ওঠে। আগে `--:--:--` লেখা
                হলুদ বাক্সটা দাঁড়িয়ে থাকত — আর তার পাশে "at their door by
                6:00 PM today" বলে **একটা প্রতিশ্রুতি**, যেটার পেছনে কোনো
                সময় নেই। আজকের cut-off পেরিয়ে গেলে বা ওই zone-এ কোনো
                cut-off বসানো না থাকলে চুপ থাকাই সৎ।

                ⚠️ "6:00 PM" এখনো লেখা আছে — server যে মিনিট পাঠায় সেটা
                সঠিক, কিন্তু এই বাক্যের ঘণ্টাটা নয়। Delivery module-এর
                label থেকে আনতে হবে; আলাদা কাজ, লিখে রাখা হলো।
              */}
              {clock && (
              <div className="flex items-center gap-3 bg-[#FFF7E8] border-[1.5px] border-[#F2D9A8] rounded-[18px] px-4 py-3 mt-7">
                <span className="w-9 h-9 rounded-full bg-white grid place-items-center text-[#8A5A00] shrink-0">
                  <Icon name="bolt" className="w-[18px] h-[18px]" />
                </span>
                <div className="min-w-0">
                  <b className="block text-[14px] text-[#8A5A00] font-bold">
                    {zone === "bangladesh"
                      ? "Order today — delivered in 1–3 days nationwide"
                      : "Order now — at their door by 6:00 PM today"}
                  </b>
                  <span className="text-[12.5px] text-[#9A7434]">
                    {/*  ⚠️ "2-hour" removed — this countdown is driven by the
                         method's own cut-off, and naming a duration beside it
                         made the two disagree the moment the owner changed the
                         express from two hours to three.  */}
                    {zone === "bangladesh"
                      ? "Courier cut-off for today's dispatch"
                      : "Cut-off for express delivery inside Dhaka"}
                  </span>
                </div>
                <div className="ml-auto font-display text-[19px] font-semibold text-[#8A5A00] tabular-nums">
                  {clock}
                </div>
              </div>
              )}

              {/*
                DEC-PDP-09 — মালিক, ১ আগস্ট ২০২৬: "stock 0 হলে order দেওয়া
                যাবে না। হয় stock out আসবে, বা pre-order আসবে।"

                ⚠️ THE SERVER DECIDED THIS, not the browser. `detail.stockLeft`
                is sitting right here and it would be one line to test it — but
                that number is a selling line the shop may set to anything (the
                admin's "Show a different number"), so it must never be what
                opens or closes the till. `availability` is worked out from the
                real count, and the order endpoint refuses on the same rule, so
                a page that says sold out can never sit above a button that
                still takes money.
              */}
              {/*  ⚠️ backHref ছিল `/${catSlug}` — অমন কোনো route নেই。 category
                  পাতা `/categories/<slug>`-এ থাকে (breadcrumb নিজেই তাই লেখে)。
                  তাই "See what else we have" চাপলে ৪০৪ ছাড়া কিছু হতো না。   */}
              {soldOut ? (
                <SoldOut
                  backHref={`/categories/${detail.crumb.catSlug}`}
                  hasRelated={(detail.crossProducts ?? []).length > 0}
                />
              ) : (
                <CtaRow
                  qty={qty}
                  setQty={setQty}
                  total={total}
                  added={added}
                  preorder={preorder}
                  onAddToCart={addToCart}
                  onBuyNow={buyNow}
                />
              )}
            </>
          )}

          {/*
            customization enquiry — order channel নয়।  DEC-PRD-027

            ⚠️ আগে এই বাক্সটা **সব** product-এ দেখাত, লেখা আসত category-র
            template থেকে, আর নম্বর ছিল `wa.me/8801000000000` — একটা বানানো
            নম্বর, যাতে চাপলে কোথাও যেত না। মালিক দুটোই ধরেছেন।

            এখন: product-এ switch অন থাকলে তবেই, লেখা তাঁর, নম্বর Company
            settings-এর। নম্বর না থাকলে বোতামটাই আঁকা হয় না — ভুয়া জায়গায়
            পাঠানোর চেয়ে চুপ থাকা ভালো।
          */}
          {detail.customise && (
            <div className="mt-5 bg-[#E8F9EE] border-[1.5px] border-[#C4EED4] rounded-[18px] px-5 py-4 flex items-center gap-3.5 flex-wrap">
              <span className="w-11 h-11 rounded-full bg-white grid place-items-center text-[#1DA851] shrink-0">
                <Icon name="wa" className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <b className="block text-[14px] text-[#0E7A3D] font-semibold">
                  {detail.customise.title}
                </b>
                <span className="text-[12.5px] text-[#3D7A55]">{detail.customise.sub}</span>
              </div>
              {detail.customise.whatsapp && (
                <a
                  href={`https://wa.me/${detail.customise.whatsapp}?text=${encodeURIComponent(
                    `Hi, I'd like to customise: ${product.name}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#1DA851] text-white rounded-full px-5 py-2.5 text-[13px] font-semibold inline-flex items-center gap-2"
                >
                  WhatsApp <Icon name="wa" className="w-4 h-4" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {!blocked && (
        <StickyBar
          total={total}
          label={detail.crumb.short}
          added={added}
          soldOut={soldOut}
          preorder={!!preorder}
          onAddToCart={addToCart}
          onBuyNow={buyNow}
        />
      )}

      {/* ─── ZOOM LIGHTBOX ─── */}
      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Product photo, zoomed"
          onClick={() => setZoom(false)}
          className="fixed inset-0 z-[95] bg-ink/85 backdrop-blur-sm grid place-items-center p-6 cursor-zoom-out"
        >
          <button
            onClick={() => setZoom(false)}
            aria-label="Close zoom"
            className="absolute top-5 right-5 w-11 h-11 rounded-full bg-white/95 text-purple grid place-items-center text-[22px] leading-none hover:scale-110 transition-transform"
          >
            ×
          </button>

          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-[min(88vw,88vh)] aspect-square rounded-[28px] overflow-hidden shadow-lift cursor-default"
            style={{
              background:
                gallery[typeof media === "number" ? media : 0] ?? FALLBACK_BG,
            }}
          >
            {!hasPhotos && (
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[12px] tracking-[0.18em] uppercase text-purple/40 font-semibold">
                Product photo — zoomed
              </span>
            )}
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-6 flex gap-2.5 max-w-[90vw] overflow-x-auto scrollbar-none"
          >
            {gallery.map((bg, i) => (
              <button
                key={i}
                onClick={() => openMedia(i)}
                aria-label={`Photo ${i + 1}`}
                className={`w-14 h-14 rounded-[12px] border-2 transition-colors ${
                  media === i ? "border-orchid" : "border-white/40"
                }`}
                style={{ background: bg }}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
