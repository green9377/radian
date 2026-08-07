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
import { BundleCards, SizeRow, UpgradeRow, VariantPicker, VariantRow } from "./PdpVariants";
import { bundleTotals } from "../../_data/bundlePricing";

/*
  PDP — gallery + buy panel. একটাই client component,
  কারণ upgrade / add-on / qty সব একটাই price state ছোঁয়।

  Layout (FlowerAura pattern):
   - Thumbnail বাঁ পাশে vertical → main image বড় থাকে, trust icon-ও একই স্ক্রিনে ধরে।
   - Delivery slot, gift message, anonymous gift — সব CHECKOUT-এ। PDP-তে নয়।
*/

const FALLBACK_BG = "linear-gradient(150deg,#EFE4F7,#DDC9EC)";

/**
 * এই সংখ্যা বা তার নিচে নামলে "কম বাকি" হিসেবে দেখানো হয়।
 *
 * ৫ — admin-এর নিজের Low-stock তালিকাও এই একই সংখ্যা ব্যবহার করে, তাই
 * দোকান যেটাকে "কম" বলে আর ক্রেতা যেটা দেখে, দুটো এক থাকে।
 */
const LOW_STOCK = 5;

export default function PdpView({ detail }: { detail: ProductDetail }) {
  const router = useRouter();
  const { zone } = useZoneStore();
  const { product } = detail;

  /*
    DEC-PRD-012 — রঙ / ফ্লেভার / মাপ, সব এই page-এ। Click করলে কোথাও
    যাওয়া হয় না, শুধু ছবি-দাম-মজুদ বদলায়।

    ⚠️ শুরুতে যেটায় মজুদ আছে সেটাই বাছা থাকে। প্রথমটাই ধরে নিলে খোলামাত্র
    "Sold out" লেখা উঠত, অথচ পাশের রঙটা পাওয়া যাচ্ছে — গ্রাহক তখন page
    ছেড়ে চলে যায়।
  */
  const vList = detail.variants ?? [];
  const [variantId, setVariantId] = useState(
    (vList.find((v) => v.stockQty > 0) ?? vList[0])?.id ?? "",
  );

  /*
    DEC-PRD-020 — বড় সংস্করণ। মালিক, ২ আগস্ট ২০২৬: *"upgrade product-এ
    click করলে price change হবে, কিন্তু অন্য page-এ যেন না নেয়।"*

    ⚠️ `null` = এই product-টাই, যেটা page-এ খোলা আছে। কোনো upgrade বাছলে
    দাম আর ছবি বদলায়, কিন্তু URL এক থাকে — গ্রাহক যেখানে ছিল সেখানেই।
  */
  const upList = detail.upgrades ?? [];
  const [upgradeSlug, setUpgradeSlug] = useState<string | null>(null);
  const upgrade = upList.find((u) => u.slug === upgradeSlug) ?? null;

  /* তিন স্তর: colour = sibling product (link), size + bundle = এখানে */
  const [sizeId, setSizeId] = useState(detail.sizes[0].id);
  /*
    DEC-PRD-018 — মালিক, ২ আগস্ট ২০২৬: *"just main product নিলে কোনো
    discount নেই, আর সাথে extra কোনো bundle থেকে product select করলেই সে
    discount পাবে"*. তালিকা থেকে যা খুশি নেওয়া যায়, তাই একটা id নয়,
    একটা তালিকা।

    ⚠️ শুরুতে কিছুই বাছা থাকে না। আগে এখানে "Most loved" card-টা আগে থেকে
    বাছা থাকত — অর্থাৎ page খোলামাত্র Buy Now-এর সংখ্যায় এমন একটা জিনিসের
    দাম বসে যেত যা গ্রাহক চাননি। এখন যোগ করলে তবেই দাম বাড়ে।
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

  /* personalisation — cart-এ যেতে হলে state-এ ধরতে হয় (আগে uncontrolled ছিল) */
  const [persoText, setPersoText] = useState("");
  const [persoImage, setPersoImage] = useState("");

  const addLine = useCartStore((s) => s.add);

  const variant = vList.find((v) => v.id === variantId) ?? null;

  /*
    বাছা variant-এর ছবি প্রথম ঘরে বসে — thumbnail আর বড় ছবি দুটোতেই।

    ⚠️ যোগ করা হয় না, **বদলে দেওয়া** হয়। যোগ করলে প্রতিবার রঙ বদলালে
    থাম্বনেইলের সংখ্যা বাড়ত আর `media`-র index সরে যেত, তাই লাল বাছার পর
    ২ নম্বর ছবিতে click করলে ৩ নম্বরটা খুলত।
  */
  /*  ⚠️ upgrade বাছা থাকলে তার ছবিটাই প্রথম ঘরে — মালিকের নিয়মে দাম আর
      ছবি দুটোই বদলায়। রঙের ছবির চেয়ে upgrade আগে, কারণ upgrade বাছলে
      রঙের বাছাই এমনিতেই মুছে যায় (নিচে) — ওটা অন্য product-এর রঙ।  */
  const gallery = upgrade
    ? [upgrade.bg, ...detail.gallery.slice(1)]
    : variant?.imageUrl
      ? [`url(${variant.imageUrl}) center/cover`, ...detail.gallery.slice(1)]
      : detail.gallery;

  /*  রঙ বদলালে বড় ছবিটা আবার প্রথমটায় ফেরে — নাহলে ৪ নম্বর ছবি খোলা
      অবস্থায় রঙ বদলালে নতুন ছবিটা কেউ দেখতেই পেত না।  */
  useEffect(() => {
    if (variant?.imageUrl) setMedia(0);
  }, [variantId]);   // eslint-disable-line react-hooks/exhaustive-deps

  /*
    ⚠️ upgrade বাছলে রঙ আর bundle-এর বাছাই মুছে যায়, আর সেটা ইচ্ছাকৃত।
    Upgrade একটা **আলাদা product** — তার নিজের রঙ, নিজের মজুদ, নিজের
    bundle তালিকা আছে, আর সেগুলো এই page-এ আসেনি। পুরনো বাছাই ধরে রাখলে
    cart-এ ৫০টা গোলাপের সাথে ২৪টার লাল রঙ জুড়ে যেত — এমন একটা জিনিস
    যা কোথাও নেই।
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
    Add-on tab গুলো এক আকারে আনা হয়।

    ⚠️ আগে `detail.addonTabs` ছিল শুধু tab-এর ID, আর প্রতিটা add-on
    `getAddon(key)` দিয়ে এই file-এর নিজের তালিকা থেকে খোঁজা হত। Database-এর
    add-on ওই তালিকায় নেই — তাই সেটা দাম ছাড়া বসত, আর cart-এ গিয়ে চুপচাপ
    উধাও হয়ে যেত। এখন API পুরো tab পাঠায় (`addonGroups`); mock path শুধু
    cart-এর পুরনো hard-coded catalog-এর জন্য বেঁচে আছে।
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

  /*  এক জায়গায় দাম খোঁজার map — একই add-on দুই tab-এ থাকলেও একবারই।  */
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
    দাম = size + bundle (+ add-ons)।

    ⚠️ কাটা দাম আর বানানো নয় (31 Jul 2026)। আগে ছিল `unitPaisa / 0.81` —
    অর্থাৎ ৭১টা product-এর প্রত্যেকটাতে "19% OFF", কোনোটাতে সত্যিই ছাড়
    দেওয়া হোক বা না হোক। এখন `detail.mrpPaisa` আসে মালিকের নিজের discount
    থেকে; ছাড় না থাকলে সেটা null আর কাটা দাগটাই আঁকা হয় না।

    ছাড়ের অনুপাত base দামের উপর মাপা হয়ে বেছে নেওয়া size-এ বসে — একটা
    product-এ ২০% ছাড় মানে Large-এও ২০%। ⚠️ প্রতি size-এ আলাদা MRP-র ঘর
    schema-তে নেই; মালিক size-ভিত্তিক ছাড় চাইলে সেটা আলাদা সিদ্ধান্ত।
  */
  /*
    DEC-PRD-012 — variant-এর নিজের দাম থাকলে সেটাই চলে।

    ⚠️ মিলিয়ে দেখা হয় product-এর দামের সাথে, কারণ server override না
    থাকলে product-এর দামটাই ফেরত পাঠায় — অর্থাৎ আলাদা মানে সত্যিই মালিক
    আলাদা দাম লিখেছেন। মালিকের নিয়ম: *"same product just color change হলে
    দাম same থাকবে, আবার kg change হলে আলাদা হবে।"*
  */
  const variantPaisa =
    variant && variant.pricePaisa !== product.pricePaisa ? variant.pricePaisa : null;
  /*
    DEC-PRD-018 — মালিক, ২ আগস্ট: ছাড় বসে **main product সহ** মোট দামের
    উপর, আর তালিকা থেকে একটাও নিলে তবেই। তাই base হিসেবে যায় গ্রাহক
    main-এর জন্য যা দিচ্ছে — রঙ বা মাপ বাছার পরের দাম। ২ কেজি কেক নিলে
    ছাড়ও সেই বড় দামের উপরেই বসে।
  */
  /*  ⚠️ upgrade বাছা থাকলে সেটাই আসল দাম — ওটা অন্য একটা product, আর
      তার নিজের দাম আছে। রঙ/মাপ তখন মুছে যায় (উপরের effect), তাই এখানে
      দুটো নিয়ম পাশাপাশি লড়ে না।  */
  const chosenPaisa = upgrade ? upgrade.pricePaisa : (variantPaisa ?? size.pricePaisa);
  const totals = bundleTotals(chosenPaisa, detail.bundle, bundleIds);
  const unitPaisa = totals.totalPaisa;
  const offRatio =
    detail.mrpPaisa && detail.mrpPaisa > product.pricePaisa
      ? 1 - product.pricePaisa / detail.mrpPaisa
      : 0;
  const wasPaisa = offRatio > 0 ? Math.round(unitPaisa / (1 - offRatio)) : null;
  const total = (unitPaisa + addonTotal) * qty;
  const off = wasPaisa ? Math.round(offRatio * 100) : 0;

  /*
    Order cut-off countdown।

    ⚠️ আগে এটা ছিল `cut.setHours(18, 0, 0, 0)` — component নিজেই ৬টা বাজে
    ধরে নিত। দুটো ভুল একসাথে: (১) কোনো delivery mode-এর আসল cut-off ৬টা না
    হলে ঘড়িটা মিথ্যা বলত, (২) হিসাবটা হত **দর্শকের ঘড়িতে**, তাই টরন্টো
    থেকে কেউ দেখলে ঢাকার cut-off ৯ ঘণ্টা দূরে দেখাত।

    এখন server বাংলাদেশ সময়ে কত মিনিট বাকি সেটা পাঠায়; browser শুধু গোনে।
    আজকের মতো সব cut-off পেরিয়ে গেলে `null` — তখন ঘড়িই দেখানো হয় না,
    কাল সকালের জন্য নতুন করে গোনা শুরু হয় না। শেষ হয়ে যাওয়া প্রতিশ্রুতি
    ফিরিয়ে নেওয়াই সৎ, নতুন করে দেওয়া নয়।
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
    /*  Server-এর মিনিট + page খোলার পর কত সময় গেল। প্রতি second-এ নতুন
        request নয়, আবার ঘড়িটা জমেও থাকে না।  */
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
    Cart-এ শুধু CONFIG যায় — দাম নয়। দাম cart page-এ resolveCart()
    আবার হিসাব করবে (দাম বদলালে stale হয়ে যেত)।
    variant = আলাদা product (D16), তাই product.slug-ই variant।
  */
  /** এই মুহূর্তের config — addToCart আর buyNow দুটোই একই জিনিস cart-এ পাঠায় */
  function currentLine() {
    return {
      /*  DEC-PRD-020 — upgrade বাছা থাকলে cart-এ **ওরই** slug যায়, কারণ
          সেটাই সত্যিকারের product যা গ্রাহক কিনছেন। page বদলায়নি, কিন্তু
          জিনিসটা বদলেছে — আর cart-কে সত্যিটাই জানতে হয়, নাহলে দোকানে
          ২৪টা গোলাপের order যেত আর গ্রাহক ৫০টার দাম দিতেন।  */
      slug: upgrade ? upgrade.slug : product.slug,
      /*  DEC-PRD-012 — কোন রঙটা কেনা হচ্ছে। খালি = এই product-এর variant
          নেই। দাম এখানে যায় না; cart নিজে আবার হিসাব করে।  */
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
    DEC-PRD-012 — কোনো একটা রঙ শেষ মানে product শেষ নয়।

    ⚠️ variant-এর মজুদ তখনই দরজা বন্ধ করে যখন **অন্তত একটায়** মজুদ আছে।
    সবগুলো শূন্য হলে ধরে নেওয়া হয় মালিক এখনো ঘরগুলো ভরেননি, আর তখন
    product-এর নিজের হিসাবই চলে। নাহলে ৩০টা গোলাপ দোকানে থাকা অবস্থায়
    শুধু variant-এর ঘর খালি বলে গোটা page "Sold out" দেখাত।
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
    Buy Now (D17 — primary CTA)। Add to Cart-এর মতোই cart-এ config বসায়,
    কিন্তু cart page না দেখিয়ে সোজা /checkout-এ নিয়ে যায়। দাম এখানে নয়,
    checkout-এ resolveCart() হিসাব করবে — cart-এর সাথে এক নিয়ম।

    ⚠️ blocked (zone mismatch) হলে OutOfZone panel দেখাচ্ছে, CtaRow নয় —
    তাই এখানে আলাদা guard লাগে না।
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
          <div className="grid grid-cols-[68px_1fr] sm:grid-cols-[76px_1fr] gap-3">
            <div className="flex flex-col gap-2.5">
              {gallery.map((bg, i) => (
                <button
                  key={i}
                  onClick={() => setMedia(i)}
                  aria-label={`Photo ${i + 1}`}
                  className={`aspect-square rounded-[12px] border-2 transition-colors ${
                    media === i ? "border-orchid" : "border-transparent"
                  }`}
                  style={{ background: bg }}
                />
              ))}
              {detail.videoId && (
                <button
                  onClick={() => setMedia("video")}
                  aria-label="Watch video"
                  className={`aspect-square rounded-[12px] border-2 bg-purple text-white grid place-items-center relative ${
                    media === "video" ? "border-orchid" : "border-transparent"
                  }`}
                >
                  <span className="w-8 h-8 rounded-full bg-white/20 grid place-items-center">
                    <Icon name="play" className="w-3.5 h-3.5" />
                  </span>
                  <em className="absolute bottom-1 not-italic text-[8px] tracking-[0.12em] uppercase opacity-75">
                    Watch
                  </em>
                </button>
              )}
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
                  {/* zoom — ছবির উপরে click করলে বড় করে দেখা যায় */}
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
                  {/*  ⚠️ ছাড় না থাকলে sticker-টাই থাকে না। কাটা দামের
                      সাথে এটাও gate করা উচিত ছিল প্রথম দিনেই — না করায়
                      ছাড়-বিহীন product-এর ছবির উপরে গোলাপি গোল ব্যাজে
                      **"0% OFF"** লেখা উঠছিল।  */}
                  {wasPaisa !== null && (
                    <span className="absolute top-4 left-4 z-[4] bg-orchid text-white text-[12.5px] font-bold rounded-full px-4 py-2 shadow-[0_8px_22px_rgba(207,67,234,0.4)]">
                      {off}% OFF
                    </span>
                  )}
                  {/*  ⚠️ শুধু ছবি না থাকলে। এটা tinted panel-এর লেবেল, ছবির
                      জলছাপ নয় — আসল ছবির উপরে "Product photo" লেখা থাকলে
                      মনে হয় page-টা এখনো তৈরি হয়নি।  */}
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

          {/* trust — thumbnail row-এর নিচে, সব একই ওজনের */}
          <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-lavender-deep">
            {detail.trust.map((t) => (
              <div key={t.label} className="flex flex-col items-center text-center gap-1.5">
                {/*  DEC-PRD-023 — দোকানের নিজের আপলোড করা icon থাকলে সেটাই।
                    ⚠️ `<img>`, `next/image` নয়: ফাইলটা যেকোনো আকারের হতে
                    পারে আর SVG-ও হতে পারে, যেটা next/image মাপতে পারে না।  */}
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
                  onPick={setVariantId}
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
              {soldOut ? (
                <SoldOut backHref={`/${detail.crumb.catSlug}`} />
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
            className="absolute bottom-6 flex gap-2.5"
          >
            {gallery.map((bg, i) => (
              <button
                key={i}
                onClick={() => setMedia(i)}
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
