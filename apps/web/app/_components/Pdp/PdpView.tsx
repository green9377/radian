"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useZoneStore } from "../../_store/useZoneStore";
import { useCartStore } from "../../_store/useCartStore";
import { useInWishlist, useWishlistStore } from "../../_store/useWishlistStore";
import { formatTaka } from "../../_data/products";
import { getDeliveryModes, zoneCode, type DeliveryMode } from "../../_data/shop";
import { track } from "../../_data/tracking";
import { uploadPersoPhoto } from "../../_data/checkoutApi";
import {
  type AddonGroup,
  type AddonItem,
  type ProductDetail,
} from "../../_data/productDetails";
import Icon from "./PdpIcons";
import TileImage, { imageSrc } from "../ui/TileImage";
import QtyStepper from "../Common/QtyStepper";
import { BlkTitle, CtaRow, OutOfZone, SoldOut, StickyBar } from "./PdpBuyBar";
import OfferWindow from "./OfferWindow";
import { BundleCards, CardRail, SizeRow, UpgradeRow, VariantPicker, VariantRow } from "./PdpVariants";
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
  /*  ⚠️ COUNTS, not booleans — 26 Aug 2026, the owner: "+ - kichi to daw
      nai". Two boxes of chocolates is a real order; a tick can only say
      yes. 0 / absent = not taken.  */
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [qty, setQty] = useState(1);
  const [media, setMedia] = useState<number | "video">(0);
  const [added, setAdded] = useState(false);
  /*  The same wishlist the cards and the header read — until 7 Sep 2026 this
      heart was a local flag that forgot itself on refresh.  */
  const wished = useInWishlist(product.slug);
  const toggleWish = useWishlistStore((s) => s.toggle);
  const [zoom, setZoom] = useState(false);

  /* Personalisation - it has to be held in state to reach the cart (it used
     to be uncontrolled) */
  const [persoText, setPersoText] = useState("");
  /*  DEC-PRD-061 — the STORED URL of the customer's photograph, not its file
      name. Until 30 Aug this held `file.name`: the picture never left the
      device, and the shop received a bouquet order with a filename on it.  */
  const [persoImage, setPersoImage] = useState("");
  const [persoImageName, setPersoImageName] = useState("");
  const [persoUploading, setPersoUploading] = useState(false);
  const [persoUploadErr, setPersoUploadErr] = useState("");

  async function pickPersoPhoto(file: File | null) {
    if (!file) return;
    setPersoUploadErr("");
    setPersoImageName(file.name);
    setPersoUploading(true);
    try {
      setPersoImage(await uploadPersoPhoto(file));
    } catch (e) {
      /*  The photo is NOT kept on a failure. A name on the screen with no
          file behind it is exactly the state this whole change exists to end.  */
      setPersoImage("");
      setPersoImageName("");
      setPersoUploadErr(e instanceof Error ? e.message : "Could not upload the photo.");
    } finally {
      setPersoUploading(false);
    }
  }

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
  /*  ⚠️ With an upgrade selected the OLD product's photos leave the rail —
      owner, 26 Aug 2026: "upgrade product dile ager product image dhore
      rakhe". A different thing is being bought; photos of the thing that is
      NOT being bought, sitting in the gallery, read as the page not having
      changed at all. The upgrade card carries one photo, so the rail shows
      that one until the customer comes back.  */
  /*  Addresses, not CSS. No photographs at all = one empty slot, drawn as the
      site's placeholder — never a coloured panel (owner, 6 Sep 2026).  */
  const photos = upgrade
    ? [imageSrc(upgrade.bg)]
    : [...detail.gallery, ...variantSlots.map((v) => v.imageUrl as string)];
  const gallery: (string | null)[] = photos.length > 0 ? photos : [null];

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

  // the tabs, with their add-ons already in them — the shop's own grouping
  const groups: AddonGroup[] = detail.addonGroups;

  /*  One map to look prices up in - the same add-on in two tabs is counted
      once.  */
  const addonByKey = useMemo(() => {
    const m = new Map<string, AddonItem>();
    for (const g of groups) for (const a of g.items) m.set(a.key, a);
    return m;
  }, [groups]);

  const addonTotal = useMemo(
    () =>
      Object.entries(picked).reduce(
        (sum, [k, n]) => sum + (addonByKey.get(k)?.pricePaisa ?? 0) * Math.max(0, n),
        0,
      ),
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
  /*  ONE badge, in the shape the owner set it (6 Sep 2026): a flat ৳150 reads
      "৳150 OFF", a 2% reads "2% OFF" — never both. The variant's own kind
      when a variant is picked, else the product's; an offer-module cut with
      no product discount behind it reads as the amount.  */
  const discountKind = variant ? (variant.discountKind ?? null) : (detail.discountKind ?? null);
  const offLabel =
    wasPaisa !== null
      ? discountKind === "PERCENT"
        ? `${off}% OFF`
        : `${formatTaka(wasPaisa - unitPaisa)} OFF`
      : "";

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
      /*  The whole pipeline — cart maths, checkout pricing, the add-on stock
          gate and the prepare-time deduction — iterates this array element by
          element, so quantity travels as REPETITION and no shape changes
          anywhere downstream (checked each stop before writing this).  */
      addonKeys: Object.entries(picked).flatMap(([k, n]) =>
        Array.from({ length: Math.max(0, n) }, () => k),
      ),
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

    ⚠️ R1, 4 Sep 2026 — the "every variant zero means the boxes were never
    filled, so the product's own count governs" guess is gone. It sold a
    colour whose shelf read 0 and Preparing then refused it. The SHOP now says
    per option whether it may be sold (`soldOut`, decided beside
    `availability` on the server); when all options are 0, `availability`
    itself reads OUT_OF_STOCK. The old `stockQty === 0` test stays only as a
    fallback for a payload without the flag.
  */
  const variantOut =
    !!variant && (variant.soldOut ?? (vList.some((v) => v.stockQty > 0) && variant.stockQty === 0));

  /*  ── DEC-PRD-045 · a two-list product must be answered ────────────────
      With one list, choosing nothing has always been allowed: the product's
      own price and photo stand, and the shop sends the plain thing.

      With two lists there is no plain thing. Nine pairs exist, each with its
      own price and its own item in the warehouse, and an order naming none of
      them cannot be picked off a shelf. So the buttons wait until a pair is
      chosen — and because the pair carries the price, waiting is also the
      only honest way to show one.  */
  const axisCount = new Set(
    vList.flatMap((v) => (v.parts?.length ? v.parts.map((p) => p.attributeId) : [])),
  ).size;
  /*  ⚠️ `!upgrade` — 26 Aug 2026, the owner pressed an upgrade and Buy Now
      stayed shut. The pair rule (DEC-PRD-045) belongs to THIS product's two
      lists; with an upgrade selected a DIFFERENT product is being bought,
      whole, and holding the buttons hostage to the colours of the one being
      left behind was a bug wearing a rule's clothes.  */
  const needsPick = !upgrade && axisCount > 1 && !variant;

  /*  ── DEC-PRD-048 · a required box actually stops the sale ──────────────
      The page has printed "required" beside this section since it was built,
      and nothing ever checked it. Now the shop decides per box, and an empty
      one holds the buttons — with the reason on them, not a silent refusal.  */
  const persoMissing = (detail.perso?.fields ?? []).some(
    (f) => f.required && !(f.type === "text" ? persoText.trim() : persoImage.trim()),
  );
  const buyBlocked = needsPick || persoMissing;

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
    if (soldOut || buyBlocked) return;
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
    if (soldOut || buyBlocked) return;
    addLine(currentLine());
    router.push("/checkout");
  }

  // the Marketing module's live offers; an empty list = nothing running, no strip
  const offers = detail.offers;

  /*  Real photographs, or the tinted panel the page falls back to. The
      fallback is a gradient; an uploaded picture arrives as `url(…)`.  */
  const hasPhotos = gallery.some(Boolean);

  /*  The thumbnail rail scrolls inside a fixed height. It says so: an arrow
      at the end that has more, measured on scroll and on resize, and the
      selected photo is brought into view when the colour picker moves it.  */
  const railRef = useRef<HTMLDivElement>(null);
  const [railMore, setRailMore] = useState({ up: false, down: false });
  const measureRail = () => {
    const el = railRef.current;
    if (!el) return;
    const up = el.scrollTop > 4;
    const down = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
    setRailMore((cur) => (cur.up === up && cur.down === down ? cur : { up, down }));
  };
  const railBy = (dir: -1 | 1) => {
    const el = railRef.current;
    if (el) el.scrollBy({ top: dir * el.clientHeight * 0.6, behavior: "smooth" });
  };
  useEffect(() => {
    measureRail();
    const el = railRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measureRail);
    ro.observe(el);
    return () => ro.disconnect();
  }, [gallery.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (typeof media !== "number") return;
    railRef.current
      ?.querySelector<HTMLElement>(`[data-thumb="${media}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [media]);

  const tabs = groups;
  const activeTab = tabs[tabIdx] ?? tabs[0];

  /*  The delivery chip beside the title — the live method that matches the
      product's own switches, in the admin's words. Dhaka: express (a promise
      in minutes) → same-day → midnight, whichever the product carries first;
      All Bangladesh: the courier method and its ETA.  */
  const [modes, setModes] = useState<DeliveryMode[] | null>(null);
  useEffect(() => {
    let alive = true;
    getDeliveryModes(zoneCode(zone)).then((m) => {
      if (alive) setModes(m ?? []);
    });
    return () => {
      alive = false;
    };
  }, [zone]);
  const deliveryChip = (() => {
    if (!modes) return null;
    const pick = (m: DeliveryMode) => (m.eta ? `${m.label} · ${m.eta}` : m.label);
    if (zone === "bangladesh") {
      const courier = modes.find((m) => m.timing === "LEAD_DAYS") ?? modes[0];
      return courier ? pick(courier) : null;
    }
    const midnight = (m: DeliveryMode) => m.label.toLowerCase().includes("midnight");
    const express = modes.find((m) => m.timing === "FROM_CONFIRM");
    const sameDay = modes.find((m) => m.timing === "TODAY_SLOT" && !midnight(m));
    const mid = modes.find(midnight);
    if (detail.speeds?.express && express) return express.label;
    if (detail.speeds?.sameDay && sameDay) return sameDay.label;
    if (detail.speeds?.midnight && mid) return mid.label;
    return null;
  })();

  return (
    <>
      <div className="grid lg:grid-cols-[1.14fr_1fr] gap-8 lg:gap-12">
        {/* ════════ GALLERY ════════ */}
        {/*  ⚠️ STICKY NEEDS ROOM TO SLIDE — 26 Aug 2026. The sticky class used
            to sit on the grid ITEM while the grid had items-start, so the cell
            was exactly the gallery's own height and sticky had nowhere to go:
            the photo scrolled away and a hole of dead white opened under the
            trust badges (the owner's screenshot). Now the cell stretches to
            the row's full height (grid default) and an INNER wrapper sticks,
            so the photo rides along the whole buy column.  */}
        <div className="min-w-0">
        {/*  170 = the sticky header's measured 154px + a breath. It was 124,
            which tucked the top of the rail 30px UNDER the header — measured
            in the browser on 26 Aug after the owner caught it twice.  */}
        <div className="lg:sticky lg:top-[170px]">
          {/*  ⚠️ The rail is ABSOLUTE inside its grid cell — 9 Aug 2026. With
              every colour's photo now always present (DEC-PRD-036) the rail
              grew TALLER than the main image and dangled below it, which the
              owner caught at once. Absolute means the rail contributes no
              height, so the row's height is the main image's; anything past
              that scrolls quietly inside.  */}
          <div className="grid grid-cols-[68px_1fr] sm:grid-cols-[76px_1fr] gap-3">
            <div className="relative">
            {/*  more photos than fit: a small arrow at whichever end has more
                (owner, 6 Sep 2026) — a rail that scrolls silently hides its
                own photos  */}
            {railMore.up && (
              <button
                type="button"
                onClick={() => railBy(-1)}
                aria-label="Earlier photos"
                className="absolute left-1/2 -translate-x-1/2 top-1 z-[3] w-7 h-7 rounded-full bg-white/95 text-purple shadow-soft grid place-items-center hover:bg-purple hover:text-white transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 stroke-current fill-none stroke-[2.2]"><path d="m6 15 6-6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}
            {railMore.down && (
              <button
                type="button"
                onClick={() => railBy(1)}
                aria-label="More photos"
                className="absolute left-1/2 -translate-x-1/2 bottom-1 z-[3] w-7 h-7 rounded-full bg-white/95 text-purple shadow-soft grid place-items-center hover:bg-purple hover:text-white transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 stroke-current fill-none stroke-[2.2]"><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}
            <div ref={railRef} onScroll={measureRail} className="absolute inset-0 flex flex-col gap-2.5 overflow-y-auto scrollbar-none scroll-smooth">
              {gallery.map((src, i) => (
                <button
                  key={i}
                  data-thumb={i}
                  onClick={() => openMedia(i)}
                  aria-label={`Photo ${i + 1}`}
                  className={`aspect-square shrink-0 rounded-[12px] border-2 overflow-hidden transition-colors ${
                    media === i ? "border-orchid" : "border-transparent"
                  }`}
                >
                  <TileImage src={src} alt="" variant="thumb" className="w-full h-full" />
                </button>
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
                  {/*  the frame fills the square; TileImage is `relative` itself,
                      so it cannot be the absolute layer (an `absolute` class on
                      it lost to `relative` and the photo had no height)  */}
                  <div className="absolute inset-0">
                    <TileImage
                      src={gallery[typeof media === "number" ? media : 0]}
                      alt={product.name}
                      variant="large"
                      eager
                      className="w-full h-full"
                    />
                  </div>
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
                  {/*  The saving is said once, beside the price — never on the
                      photograph (owner, 7 Sep 2026, same rule as the cards).  */}
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
                onClick={() => toggleWish(product.slug)}
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

          {/*  ── trust badges, quietened 23 Aug 2026 ─────────────────────
              They used to be three large circles here, and the "Why buy from
              us" cards said almost the same words somewhere else on the page
              — "freshness gurnaty" against "freshnes", "2 hours delievry"
              against "very fast delivery in dhaka city". Two masters, one
              message, printed twice.

              The two now have different jobs. These are the GLANCE: facts,
              three words each, read while judging the price. The shop's
              PROMISE is the coloured band under the buy box (`WhyBuy.tsx`),
              and it is the loud one. Making both loud is what made the page
              repeat itself.  */}
          {/*  "What's inside" lives in the spec table under the buy box
              (Before You Order) and nowhere else — the copy that sat here
              under the photo went on 6 Sep 2026 (owner: it did not look right)  */}
          <div className="flex flex-wrap gap-x-5 gap-y-2.5 mt-5 pt-4 border-t border-lavender-deep">
            {detail.trust.map((t) => (
              <div key={t.label} className="flex items-center gap-2 min-w-0">
                {/*  DEC-PRD-023 - the shop's own uploaded icon wins when there
                    is one. `<img>` rather than `next/image`: the file can be
                    any size and can be an SVG, which next/image cannot
                    measure.  */}
                <span className="w-[22px] h-[22px] grid place-items-center text-orchid shrink-0 overflow-hidden">
                  {t.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.iconUrl} alt="" className="w-[17px] h-[17px] object-contain" />
                  ) : (
                    <Icon name={t.icon} className="w-[16px] h-[16px]" />
                  )}
                </span>
                <span className="min-w-0 text-[12.5px] leading-tight">
                  <b className="font-bold text-ink">{t.label}</b>
                  {t.sub ? <span className="text-body-soft font-light"> · {t.sub}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </div>
        </div>

        {/* ════════ BUY PANEL ════════ */}
        {/*  min-w-0: a grid column grows to fit an unbroken word otherwise, and
            one long description without spaces pushed this column to 7,000px
            and crushed the gallery (owner's screenshot, 6 Sep 2026)  */}
        <div className="min-w-0">
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
            {/*  ⚠️ THE CHIP FOLLOWS THE VIEWER'S ZONE — owner, 26 Aug 2026:
                "jodi karo location inside dhaka thake tahole se ken couriar
                ta dekhbe." A 'both'-zone product carries a nationwide chip of
                its own, and a Dhaka viewer was being shown courier words. In
                Dhaka the chip speaks Dhaka (express / same-day / midnight,
                from the product's own switches — or stays silent); courier
                wording exists only for the All-Bangladesh viewer.  */}
            {/*  7 Sep 2026 — the words are the Delivery module's own (the method's
                label and ETA, as the admin wrote them), not a sentence kept in
                code. No live method matches the product's switches → no chip.  */}
            {(() => {
              const chip = deliveryChip;
              return chip ? (
                <span className="inline-flex items-center gap-1.5 bg-orchid-soft text-purple rounded-lg px-2.5 py-1 text-[11.5px] font-bold">
                  <Icon
                    name={zone === "bangladesh" ? "truck" : "bolt"}
                    className="w-3.5 h-3.5 text-orchid"
                  />
                  {chip}
                </span>
              ) : null;
            })()}
            {detail.nature.label && (
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
            )}
          </div>

          <h1 className="font-display text-[clamp(25px,2.8vw,33px)] font-medium text-ink leading-[1.2] [overflow-wrap:anywhere]">
            {product.name}
          </h1>

          {/*  DEC-PRD-031, 6 August - one line written by the owner, between
              the title and the reviews. Leave it blank and the line is gone.  */}
          {detail.shortDesc && (
            <p className="mt-1.5 text-[14.5px] text-body-soft leading-[1.5] [overflow-wrap:anywhere]">
              {detail.shortDesc}
            </p>
          )}

          {/*
            With no reviews the whole row disappears (31 Jul 2026). All 71
            products used to carry a hardcoded "4.9 · 412 Reviews" - not one of
            them true. It now comes from this product's own published reviews;
            with none, there is no star line at all, rather than zeros or
            borrowed stars.

            ── DEC-PRD-050 · why the badges are a LINE here and not a ribbon ──
            On a grid a badge earns its space: it is how one card is picked out
            of twenty. Here the shopper has already chosen, and a ribbon over
            the photograph would be the shop shouting at somebody who is
            already listening. FlowerAura, checked 24 Aug 2026, badges its
            listings heavily and puts nothing at all on the product page.

            The wording names the category — "Best seller in Fresh Flowers".
            "Best seller" alone is a boast; with a scope it is a fact, and it
            is also literally what the ranking measured.
          */}
          {(detail.bestSeller || detail.newArrival) && (
            <div className="flex items-center gap-2 flex-wrap mt-3">
              {detail.bestSeller ? (
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#8A5A00] bg-[#FFF6EC] border border-[#EBD3B0] rounded-full px-3 py-[5px]">
                  <Icon name="star" className="w-3 h-3 fill-[#B8860B] stroke-none" />
                  {detail.bestSellerIn
                    ? `Best seller in ${detail.bestSellerIn}`
                    : "Best seller"}
                </span>
              ) : (
                <span className="inline-flex items-center text-[12.5px] font-semibold text-purple bg-lavender rounded-full px-3 py-[5px]">
                  New arrival
                </span>
              )}
            </div>
          )}

          {(detail.reviews.rating !== null || detail.reviews.live) && (
            <div className="flex items-center gap-2.5 flex-wrap mt-3 text-[13.5px] text-body-soft">
              {detail.reviews.rating !== null && (
                <>
                  {/* 4.9 out of what - say "out of 5" plainly */}
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
            ─── How many are left ───

            When the owner turns the switch on, THE NUMBER ALWAYS SHOWS - that
            is what turning it on means. Only the TONE changes once it gets
            low: from a calm grey "30 in stock" to an urgent amber
            "Only 3 left".

            Same fact, two voices. Having 30 is information; having 3 is a
            reason to hurry.

            `stockLeft` being null means either the shop does not want to say
            or nothing is being counted. Both mean the same thing here: stay
            quiet.
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

          {/* price - in the same block as the title and reviews, one line */}
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
            {/* the struck price and ONE badge, or neither */}
            {wasPaisa !== null && (
              <>
                <span className="text-[17px] text-body-soft line-through">
                  {formatTaka(wasPaisa)}
                </span>
                <span className="text-[12.5px] font-bold text-[#0E7A3D] bg-[#E8F9EE] border border-[#C4EED4] rounded-full px-2.5 py-1">
                  {offLabel}
                </span>
              </>
            )}
          </div>

          {/*  DEC-PRD-042 — when the offer ends, right under the price where the
              eye already is. Only alongside a real struck price. DEC-PRD-062:
              the server sends the window whenever the product's discount is
              the one cutting the price — with the "every variant" switch on,
              that includes a picked variant, so the countdown stays.  */}
          {wasPaisa !== null && !bundled && detail.offer?.endsAtMs != null && (!variant || variant.offerFromProduct) && (
            <OfferWindow endsAtMs={detail.offer.endsAtMs} />
          )}

          <div className="h-px bg-lavender-deep my-[18px]" />

          {blocked ? (
            <OutOfZone reason={detail.ozReason} />
          ) : (
            <>
              {/*
                ─── 0. UPGRADE - the larger version of this ───
                DEC-PRD-020. The owner: *"clicking an upgrade product should
                change the price, but it must not take me to another page."*

                First of all, because it is the biggest decision on the page -
                which thing is being bought. Colour and bundle come after that.
              */}
              {upList.length > 0 && (
                <UpgradeRow
                  label={detail.sizeLabel}
                  upgrades={upList}
                  thisName={product.name}
                  thisPaisa={variantPaisa ?? size.pricePaisa}
                  thisBg={detail.gallery[0] ?? ""}
                  activeSlug={upgradeSlug}
                  onPick={setUpgradeSlug}
                />
              )}

              {/* ─── 1. VARIANT - colour or flavour, a sibling product ─── */}
              {/*  With an upgrade selected the colours are hidden - those are
                  THIS product's colours, and a different one is being
                  bought.  */}
              {!upgrade && vList.length > 0 && (
                <VariantPicker
                  variants={vList}
                  activeId={variantId}
                  basePaisa={product.pricePaisa}
                  /*  The admin's "show stock" switch - with it off, `stockLeft`
                      never arrives, and then nothing is written beside the
                      colours either.  */
                  showStock={detail.stockLeft !== null && detail.stockLeft !== undefined}
                  /*  Tapping the selected colour again clears the selection and
                      returns to the product's own photo and price. There used
                      to be no way back at all - you had to reload (owner,
                      8 August).  */
                  /*  press the SAME value again to clear it; pressing the other
                      list is always a choice, never an unchoosing (31 Aug)  */
                  onPick={(id, samePressed) =>
                    setVariantId((cur) => (samePressed && cur === id ? "" : id))
                  }
                />
              )}
              {detail.variant && <VariantRow group={detail.variant} />}

              {/*
                ─── 2. SIZE - the same product, a different price ───
                With only one option this is not a chooser, it is a label - and
                a customer seeing nothing but "Standard" assumes the rest failed
                to load. The price is already above, so hiding the row is the
                honest thing. (The guard in `getProductDetail` guarantees at
                least one exists - this is a presentation decision, not a
                crash guard.)
              */}
              {detail.sizes.length > 1 && (
                <SizeRow
                  label={detail.sizeLabel}
                  sizes={detail.sizes}
                  activeId={size.id}
                  onPick={setSizeId}
                />
              )}

              {/* ─── 3. BUNDLE - another product gets added ─── */}
              {detail.bundles.length > 0 && (
                <BundleCards
                  bundles={detail.bundles}
                  activeIds={bundleIds}
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
                ─── OFFERS - between the upgrades and the add-ons ───
                With nothing running the whole strip disappears. A box reading
                "Offers Available · 0 running" invites a click with nothing
                behind it - a promise of something that cannot be had.
              */}
              {/*  ── OFFERS — redesigned 26 Aug 2026 (owner: the collapsible
                  stays, the look goes). A rose-gold coupon ticket: gradient
                  band, gold-tinted seal, and each offer as a perforated
                  voucher row — the dashed divider is where a paper coupon
                  would tear. Codes are the loudest thing on the row because
                  the code is the part the shopper takes with them.  */}
              {/*  ── OFFERS, third pass (26 Aug) — a COUPON, drawn as one.
                  The closed bar wears the coupon's own uniform: gold dashed
                  edge on cream, a gold seal, the count in a gold pill. Open,
                  every offer is a ticket with real cut-out notches at the
                  fold (two circles of the page's white) — the thing people
                  have torn along all their lives, so it explains itself.  */}
              {offers.length > 0 && (
              <details className="mt-7 group">
                <summary className="relative flex items-center gap-3 px-4 py-3 cursor-pointer list-none rounded-[16px] border-[1.5px] border-dashed border-[#D9A66A] bg-gradient-to-r from-[#FFFAF3] to-[#FDF4EA] transition-shadow hover:shadow-[0_8px_24px_rgba(217,166,106,0.18)]">
                  <span className="w-9 h-9 rounded-[11px] bg-gradient-to-br from-[#E3B778] to-[#B76E79] grid place-items-center text-white shrink-0 shadow-[0_4px_12px_rgba(183,110,121,0.3)]">
                    <Icon name="tag" className="w-[17px] h-[17px]" />
                  </span>
                  <b className="text-[14.5px] text-ink font-bold">Offers for you</b>
                  <span className="text-[11.5px] font-bold text-[#8A5A00] bg-[#F6E3C6] rounded-full px-2 py-0.5">
                    {offers.length}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-bold text-[#B76E79]">
                    View
                    <Icon name="chev" className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                  </span>
                </summary>
                <div className="pt-2.5 space-y-2.5">
                  {offers.map((o) => (
                    <div
                      key={o.text}
                      className="relative flex items-stretch rounded-[14px] bg-white border border-[#EFE0CB] shadow-[0_4px_16px_rgba(183,110,121,0.08)] overflow-hidden"
                    >
                      <span
                        className="w-[52px] grid place-items-center text-white text-[10.5px] font-bold shrink-0"
                        style={{ background: o.color }}
                      >
                        {o.logo}
                      </span>
                      {/*  the tear line, notches included — the page's white
                          bites two half-circles out of the ticket's edge  */}
                      <span className="relative self-stretch border-l-[1.5px] border-dashed border-[#E4CBA8]">
                        <i className="absolute -top-[6px] -left-[6px] w-[11px] h-[11px] rounded-full bg-white border-b border-[#EFE0CB]" />
                        <i className="absolute -bottom-[6px] -left-[6px] w-[11px] h-[11px] rounded-full bg-white border-t border-[#EFE0CB]" />
                      </span>
                      <div className="flex items-center gap-3 px-3.5 py-3 flex-1 min-w-0 flex-wrap">
                        <p className="text-[13px] text-body flex-1 min-w-[150px] leading-snug m-0">{o.text}</p>
                        {o.code ? (
                          <span className="inline-flex items-center gap-1.5 border-[1.5px] border-dashed border-[#D9A66A] text-[#8A5A00] bg-[#FFFAF3] rounded-[9px] px-3 py-1.5 text-[12.5px] font-bold tracking-[0.06em] shrink-0">
                            <Icon name="tag" className="w-3 h-3" />
                            {o.code}
                          </span>
                        ) : (
                          <span className="text-[11.5px] font-bold text-[#0E7A3D] bg-[#E8F9EE] rounded-full px-2.5 py-1 shrink-0">{o.note}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
              )}

              {/*
                ─── ADD-ONS IN TABS ───
                With no tabs the whole section disappears. A "Make It Extra
                Special" heading standing over an empty grid reads as a broken
                page - the same rule the homepage's category rail took
                (30 July).
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
                {/*  ⚠️ A RAIL, NOT A GRID — 26 Aug 2026, the owner: many
                    add-ons pushed the page downward and there was no way to
                    scroll sideways. One row now, same card language as
                    bundles and upgrades (square mark: several can be taken;
                    the empty box is visible so the choice explains itself).  */}
                {/*  FlowerAura's pattern, on the owner's ask (26 Aug): every
                    add-on card carries its own ADD button, and the button IS
                    the state — outlined "+ Add" resting, filled "Added" when
                    taken. An impulse purchase should not make anybody guess
                    whether tapping the picture did something.  */}
                {/*  ⚠️ role="button", not <button> — the picked state carries a
                    QtyStepper whose number is TYPEABLE (house rule 18), and an
                    input inside a button cannot be typed into. "+ Add" puts
                    one in; the stepper then owns the card's foot — press − to
                    zero and it is out again, exactly the FlowerAura pattern
                    the owner pointed at, with the typing ours.  */}
                <CardRail>
                  {activeTab?.items.map((a) => {
                    const key = a.key;
                    const n = picked[key] ?? 0;
                    const on = n > 0;
                    return (
                      <div
                        key={key}
                        role="button"
                        tabIndex={0}
                        aria-pressed={on}
                        onClick={() => { if (!on) setPicked((p) => ({ ...p, [key]: 1 })); }}
                        onKeyDown={(e) => {
                          if (!on && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            setPicked((p) => ({ ...p, [key]: 1 }));
                          }
                        }}
                        className={`relative w-[136px] sm:w-[144px] shrink-0 snap-start rounded-[18px] overflow-hidden bg-white border-2 text-center transition-all duration-200 ${
                          on
                            ? "border-orchid shadow-[0_10px_28px_rgba(207,67,234,0.18)] cursor-default"
                            : "border-lavender-deep hover:border-orchid-mid hover:-translate-y-[3px] cursor-pointer active:scale-[0.97]"
                        }`}
                      >
                        <TileImage src={a.bg} alt={a.name} variant="thumb" className="aspect-square" />
                        <span className="block px-2.5 pt-2">
                          <b className="block text-[11.5px] text-ink font-semibold truncate">
                            {a.name}
                          </b>
                          {/*  DEC-PRD-049 — "Free" where the shop meant free.
                              "+৳ 0" read as a price that had failed to
                              load.  */}
                          {a.isFree || a.pricePaisa === 0 ? (
                            <span className="text-[12px] font-bold text-[#0E7A3D]">Free</span>
                          ) : (
                            <span className="block font-display text-[13.5px] font-semibold text-purple">
                              +{formatTaka(a.pricePaisa)}
                            </span>
                          )}
                        </span>
                        {/*  the stopPropagation used to sit on this whole footer,
                            so "+ Add" swallowed its own click (owner, 7 Sep
                            2026); it belongs on the stepper only, where a
                            typed quantity must not re-add the card  */}
                        <span className="block px-2.5 pt-1.5 pb-2.5">
                          {on ? (
                            <span onClick={(e) => e.stopPropagation()}>
                            <QtyStepper
                              grow
                              size="sm"
                              min={0}
                              value={n}
                              onChange={(q) =>
                                setPicked((p) => {
                                  const next = { ...p };
                                  if (q <= 0) delete next[key];
                                  else next[key] = q;
                                  return next;
                                })
                              }
                              label={`${a.name} quantity`}
                            />
                            </span>
                          ) : (
                            <span className="h-[32px] inline-flex w-full items-center justify-center gap-1 rounded-full text-[12px] font-bold border-[1.5px] border-orchid text-orchid bg-white">
                              + Add
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </CardRail>
              </section>
              )}

              {/* ─── PERSONALISATION - only where it is wanted ─── */}
              {detail.perso && (
                <section className="mt-7">
                  {/*  DEC-PRD-048 — "required" is the shop's switch now. It
                      used to be this word, hardcoded, with nothing behind it:
                      the buttons worked and the server took the order. Owner,
                      24 Aug 2026: *"required thakar poreo buy now ba add to
                      cart krtache."*  */}
                  <BlkTitle
                    title={detail.perso.title}
                    hint={detail.perso.fields.some((f) => f.required) ? "required" : undefined}
                  />
                  <div className="bg-lavender border-[1.5px] border-lavender-deep rounded-[18px] p-5 space-y-3.5">
                    {detail.perso.fields.map((f) => (
                      <div key={f.label}>
                        <label className="block text-[13px] font-semibold text-purple mb-1.5">
                          {f.label}
                          {f.required && <span className="text-orchid ml-1">*</span>}
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
                            {/*  DEC-PRD-057 — the words land on the card as they
                                type. A plain input feels like a form; watching
                                the card fill makes the moment emotional, and
                                someone mid-message does not abandon a cart.
                                Same field underneath — only the face is new.  */}
                            {persoText.trim().length > 0 && (
                              <div className="mt-3">
                                <div className="relative rounded-[16px] border-[1.5px] border-[#E8C9CE] bg-gradient-to-br from-[#fffdfb] to-[#fbf3f5] px-5 pt-6 pb-4 shadow-[0_12px_30px_rgba(183,110,121,0.14)]">
                                  <span className="absolute top-1.5 left-0 right-0 text-center text-[#B76E79] text-[14px] opacity-70">❦</span>
                                  <p className="font-display text-[14.5px] leading-[1.65] text-[#4a2b35] text-center m-0 mt-2 break-words">
                                    {persoText}
                                  </p>
                                  <div className="text-center text-[10.5px] text-[#B76E79] tracking-[0.14em] uppercase mt-2.5">
                                    — with love
                                  </div>
                                </div>
                                <div className="text-center text-[10.5px] text-body-soft mt-1.5 tracking-[0.05em] uppercase">
                                  The card that travels with the flowers
                                </div>
                              </div>
                            )}
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
                                {persoUploading
                                  ? "Uploading…"
                                  : persoImageName || "Tap to upload"}
                              </b>
                              <span className="text-[12px] text-body-soft">
                                {persoUploadErr || f.hint}
                              </span>
                            </span>
                            {/*  DEC-PRD-061 — the file goes UP here and the URL
                                is what is kept. It used to keep `file.name`
                                and nothing else, so the picture never left the
                                phone.  */}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={persoUploading}
                              onChange={(e) => void pickPersoPhoto(e.target.files?.[0] ?? null)}
                            />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/*
                ─── COUNTDOWN - now directly above the CTA ───

                With no clock the whole box goes. The amber box used to stand
                there reading `--:--:--`, and beside it A PROMISE - "at their
                door by 6:00 PM today" - with no time behind it. Once today's
                cut-off has passed, or when that zone has no cut-off set at
                all, staying quiet is the honest answer.

                "6:00 PM" is still hardcoded in that sentence. The minutes the
                server sends are correct; the hour in this wording is not. It
                needs to come from the Delivery module's label - a separate
                job, written down here so it is not forgotten.
              */}
              {/*  The delivery date is asked at checkout, not here (owner,
                  6 Sep 2026) — the "When should it arrive?" pills that sat
                  here went; the checkout page keeps its own.  */}

              {/*
                DEC-PDP-09 - the owner, 1 August 2026: "at stock 0 no order may
                be placed. Either it says stock out, or it becomes a
                pre-order."

                ⚠️ THE SERVER DECIDED THIS, not the browser. `detail.stockLeft`
                is sitting right here and it would be one line to test it — but
                that number is a selling line the shop may set to anything (the
                admin's "Show a different number"), so it must never be what
                opens or closes the till. `availability` is worked out from the
                real count, and the order endpoint refuses on the same rule, so
                a page that says sold out can never sit above a button that
                still takes money.
              */}
              {/*  backHref used to be `/${catSlug}` - no such route exists. The
                  category page lives at `/<slug>` (the breadcrumb
                  writes it that way itself). So "See what else we have" led
                  nowhere but a 404.  */}
              {/*  ── THE BUTTONS NEVER LEAVE THE SCREEN — 26 Aug 2026 ──────
                  FlowerAura holds its CTA at the viewport's bottom edge while
                  the buy column scrolls (position: sticky; bottom: 0 on the
                  wrap) and the owner asked for exactly that. Same trick here:
                  the wrap sticks to the bottom on desktop, on white, with a
                  soft top shadow so content sliding under it reads as under.
                  Mobile keeps the separate StickyBar it always had.  */}
              <div className="lg:sticky lg:bottom-0 lg:z-30 lg:bg-white lg:pb-3 lg:-mb-1 lg:shadow-[0_-14px_22px_-16px_rgba(71,0,102,0.22)] lg:rounded-t-[14px]">
              {/*  DEC-PRD-058 — by the time the buyer reaches the buttons the
                  choices are far above, out of sight. This slim line says what
                  is being bought at the exact moment of commitment. Only drawn
                  once something beyond the plain product is chosen — on a bare
                  page it would just repeat the title.  */}
              {!soldOut &&
                (upgrade || variant || bundleIds.length > 0 || Object.keys(picked).length > 0 || detail.sizes.length > 1) && (
                <div className="hidden lg:flex items-center gap-3 bg-lavender border-[1.5px] border-lavender-deep rounded-[14px] px-3 py-2 mb-2.5">
                  <TileImage
                    src={gallery[typeof media === "number" ? media : 0]}
                    alt=""
                    variant="thumb"
                    className="w-[38px] h-[38px] rounded-[10px] shrink-0 border border-lavender-deep"
                  />
                  <span className="min-w-0 flex-1">
                    <b className="block text-[12.5px] text-ink truncate">
                      {(upgrade ? upgrade.name : product.name)
                        + (variant ? ` — ${variant.label}` : "")
                        + (detail.sizes.length > 1 ? ` · ${size.label}` : "")}
                    </b>
                    <span className="block text-[11.5px] text-body-soft truncate">
                      {[
                        bundleIds.length > 0 ? `${bundleIds.length} bundle item${bundleIds.length > 1 ? "s" : ""}` : null,
                        Object.keys(picked).length > 0
                          ? `${Object.values(picked).reduce((a, b) => a + b, 0)} add-on${Object.values(picked).reduce((a, b) => a + b, 0) > 1 ? "s" : ""}`
                          : null,
                        qty > 1 ? `qty ${qty}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "as shown"}
                    </span>
                  </span>
                  <span className="font-display text-[16px] font-semibold text-purple whitespace-nowrap shrink-0">
                    {formatTaka(total)}
                  </span>
                </div>
              )}
              {soldOut ? (
                <SoldOut
                  backHref={`/${detail.crumb.catSlug}`}
                  hasRelated={(detail.crossProducts ?? []).length > 0}
                />
              ) : (
                <CtaRow
                  qty={qty}
                  setQty={setQty}
                  total={total}
                  added={added}
                  note={detail.underBuyText}
                  preorderNote={detail.underBuyPreorderText}
                  preorder={preorder}
                  needsPick={buyBlocked}
                  blockedReason={
                    needsPick ? "Choose an option first" : "Fill in what is required"
                  }
                  /*  DEC-PRD-060 — the product's own field, read and said out
                      loud. The COD rule itself stays in one place, on the
                      server (`assertCodAllowed`).  */
                  prepaidOnly={product.prepaidOnly === true}
                  onAddToCart={addToCart}
                  onBuyNow={buyNow}
                />
              )}
              </div>
            </>
          )}

          {/*
            A customisation enquiry - not an order channel. DEC-PRD-027

            This box used to appear on EVERY product, its wording came from a
            category template, and the number was `wa.me/8801000000000` - an
            invented number that went nowhere when tapped. The owner caught
            both.

            Now: only when the switch is on for that product, the wording is
            his, and the number comes from Company settings. With no number the
            button is not drawn at all - silence beats sending somebody to a
            place that does not exist.
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
          needsPick={buyBlocked}
          blockedReason={needsPick ? "Choose an option" : "Fill in what is needed"}
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

          <TileImage
            src={gallery[typeof media === "number" ? media : 0]}
            alt={product.name}
            variant="original"
            eager
            className="w-[min(88vw,88vh)] aspect-square rounded-[28px] shadow-lift cursor-default"
          >
            {!hasPhotos && (
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[12px] tracking-[0.18em] uppercase text-purple/40 font-semibold">
                Product photo — zoomed
              </span>
            )}
          </TileImage>

          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-6 flex gap-2.5 max-w-[90vw] overflow-x-auto scrollbar-none"
          >
            {gallery.map((src, i) => (
              <button
                key={i}
                onClick={() => openMedia(i)}
                aria-label={`Photo ${i + 1}`}
                className={`w-14 h-14 rounded-[12px] border-2 overflow-hidden transition-colors ${
                  media === i ? "border-orchid" : "border-white/40"
                }`}
              >
                <TileImage src={src} alt="" variant="thumb" className="w-full h-full" />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
