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
  VARIANT UI — তিনটা আলাদা স্তর, প্রতিটা আলাদা প্রশ্নের উত্তর দেয়:

    VARIANT → sibling product (colour বা flavour)। Click = অন্য PDP
              (নিজের ছবি, নিজের stock, নিজের SEO page)।
    SIZE    → একই product, দাম বদলায়। ছোট pill — ছবি লাগে না।
    BUNDLE  → অন্য product যোগ হয়। Photo card — নতুন জিনিস দেখাতে হয়।

  কেন আলাদা: variant × size × bundle সব card করলে ২৭টা card — page অচল।
  আলাদা রাখলে প্রতিটা সিদ্ধান্ত ছোট, আর customer এক নজরে বোঝে কী বদলাচ্ছে।
*/

/*
  ═══════════════════════════════════════════════════════════════════════════
  DEC-PRD-012 — এক page, সব রঙ।  মালিক, ১ আগস্ট ২০২৬:

    *"যখন তার multi variant থাকবে তখন তা show করাব, আর তা একটা product
      page-এ হবে। প্রতিটার আলাদা image আর stock।"*

  ⚠️ নিচের `VariantRow`-এর সাথে গুলিয়ে ফেলা চলবে না। ওটা পুরনো নকশা —
  প্রতিটা রঙ আলাদা product, swatch-এ click করলে অন্য page খুলত। সেই নকশায়
  product-কে দলে ঢোকানোর পর্দাটা কখনো বানানোই হয়নি, তাই swatch বাস্তবে
  কোনোদিন দেখা যায়নি।

  এখানে click করলে **কোথাও যাওয়া হয় না** — একই page-এ ছবি, দাম আর মজুদ
  বদলায়। কেনার পথ ছোট হয়, আর পুরো page নতুন করে লোড হয় না।
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
  /** product-এর নিজের দাম — এর সাথে আলাদা হলেই দামটা লেখা হয় */
  basePaisa: number;
  /**
   * দোকান কি মজুদের সংখ্যা দেখাতে বলেছে (admin-এর switch)। মিথ্যা হলে
   * এখানেও কিছু লেখা হয় না — উপরের সবুজ চিপ চুপ থাকলে নিচে সংখ্যা ফাঁস
   * করাটা ওই switch-টাকে অর্থহীন করে দিত।
   */
  showStock: boolean;
  onPick: (id: string) => void;
}) {
  const active = variants.find((v) => v.id === activeId);

  /*  শিরোনামটা মালিকের তালিকার নাম — "Colour", "Flavour", "Weight"।
      সবগুলো এক তালিকার, তাই প্রথমটাই যথেষ্ট।  */
  const heading = variants[0]?.attribute || "Choose";

  /*  ⚠️ মজুদ তখনই দরজা বন্ধ করে যখন অন্তত একটায় মজুদ আছে। সবগুলো শূন্য
      মানে ঘরগুলো এখনো ভরা হয়নি — তখন কোনোটাকেই "Sold out" বলা হয় না।
      PdpView-তেও ঠিক এই একই শর্ত, দুই জায়গা যেন একই কথা বলে।  */
  const anyStock = variants.some((v) => v.stockQty > 0);

  /*  master যা দেখাতে বলেছে। এক তালিকার সবগুলো একই ধরনের, তাই একবার।  */
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
            {/*  উপরের চিপটা গোটা product-এর যোগফল বলে (৬ + ৪ = ১০)। কোন
                রঙটা কেনা হচ্ছে তার নিজের সংখ্যাটা এখানে, কারণ সিদ্ধান্তটা
                এখানেই নেওয়া হচ্ছে — "১০ আছে" পড়ে লাল ৮টা চাইলে হতাশা।  */}
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

          /*  রঙের গোল বোতাম — নিজের ছবি থাকলে ছবিটাই, নাহলে রঙ। ছবিও নেই
              রঙও নেই এমন মান page-এর নিজের নরম বেগুনি নেয়; কালো গোল বসিয়ে
              "এটা একটা রঙ" বলার চেয়ে সেটা সৎ।  */
          const fill = v.imageUrl
            ? `url(${v.imageUrl}) center/cover`
            : v.swatch || "#DDC9EC";

          /*
            ⚠️ ছবি কখনো বাধ্যতামূলক নয় — মালিকের নিয়ম, ২ আগস্ট ২০২৬:
            *"ami chai eta requirement na hok"*.

            তালিকাটা PHOTO ধরনের হলেও যে মানটার ছবি নেই সেটা শুধু নাম নিয়ে
            বসে। নাহলে "Standard"-এর ঘরে একটা খালি বেগুনি চৌকো উঠত, আর
            গ্রাহক ভাবত ছবিটা লোড হতে পারেনি।
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
                {/*  শেষ হয়ে যাওয়াটা কাটা দাগ দিয়ে বোঝানো — শুধু ফিকে করলে
                    সেটা "বাছা হয়নি"-র মতোই দেখায়।  */}
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
                {/*  দাম তখনই লেখা হয় যখন সেটা সত্যিই আলাদা। এক দামের চারটে
                    রঙের নিচে চারবার একই সংখ্যা লিখলে চোখ সেটা পড়াই ছেড়ে
                    দেয়, আর তখন আসল আলাদা দামটাও কেউ দেখে না।  */}
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
          /* colour = গোল swatch · flavour = ছবির pill */
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
  UPGRADE — এটার বড় সংস্করণ।  DEC-PRD-020, মালিক ২ আগস্ট ২০২৬:

  > *"upgrade product-এ click করলে price change হবে, কিন্তু অন্য page-এ যেন
  >  না নেয়।"*

  ⚠️ প্রতিটা upgrade নিজেই একটা **সত্যিকারের product** — নিজের দাম, নিজের
  মজুদ, নিজের page। তবু এখানে link নয়, বাছাই: click করলে দাম আর ছবি এই
  page-এই বদলায়। কারণ গ্রাহক তখনো "কোনটা কিনব" ভাবছেন, আর প্রতিটা তুলনায়
  page ছেড়ে চলে গেলে ফেরার পথ হারিয়ে যায়।

  ⚠️ প্রথম card-টা "এইটাই" — যেটা এখন খোলা আছে। ফেরার পথ ছাড়া বাছাই দেওয়া
  মানে একবার বড়টা ছুঁলে আর ছোটটায় ফেরা যায় না।
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
  /** এই page-এর product-টার নাম — প্রথম card */
  thisName: string;
  thisPaisa: number;
  /** `null` = এই product-টাই বাছা */
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
              {/*  ⚠️ গোল চিহ্ন, চৌকো নয় — এখানে একটাই বাছা যায়। bundle-এ
                  চৌকো, কারণ ওখানে কয়েকটা নেওয়া যায়। চিহ্নটা যা বলে
                  আচরণটাও তাই হওয়া দরকার।  */}
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
  DEC-PRD-013 — কয়েকটা একসাথে নেওয়া যায়। মালিক, ২ আগস্ট ২০২৬:
  *"customer একসাথে কয়েকটা bundle নিতে পারবে"*.

  ⚠️ আগে এটা ছিল "এর মধ্যে একটা", আর সেজন্য প্রথম card-টা ছিল একটা বানানো
  "Just Flowers · No extra" — ফেরার পথ। এখন কিছুই tick না করাই ফেরার পথ,
  তাই ওই card-টা server-এ তৈরি হওয়াই বন্ধ করা হয়েছে।

  ⚠️ tick-box আঁকা হয় গোল নয়, চৌকো চিহ্ন দিয়ে — গোল মানে "একটা বাছুন"।
  চিহ্নটা যা বলে আচরণটাও তাই হওয়া দরকার, নাহলে গ্রাহক দ্বিতীয়টা ছুঁতেই
  ভয় পান যে প্রথমটা চলে যাবে।
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
  /** main product-এর দাম — ছাড় এর উপরেই বসে (DEC-PRD-018) */
  basePaisa: number;
  /** গোটা তালিকার একটাই ছাড়। `null` = ছাড় নেই। */
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
          /*  card-এ জিনিসটার **নিজের** দাম — ছাড় ছাড়া। ছাড়টা তালিকার
              নিচে একবার লেখা হয়, কারণ সেটা main product সহ মোট দামের
              উপর বসে; এখানে বসালে একই ছাড় চারবার লেখা হতো আর যোগফলটা
              কেউ মেলাতে পারত না।  */
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
              {/*  চৌকো tick — "আরও নিতে পারেন" বলার সবচেয়ে ছোট উপায়।
                  না বাছা অবস্থাতেও ঘরটা দেখা যায়, নাহলে একাধিক নেওয়া যায়
                  সেটা কেউ বুঝতই না।  */}
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
        DEC-PRD-018 — ছাড়টা এখানে, একবার। মালিকের নিয়ম: শুধু main product
        নিলে ছাড় নেই; তালিকা থেকে একটাও নিলে ছাড় বসে, main সহ মোট দামের
        উপর। তাই সংখ্যাটা কোনো একটা card-এ লেখা যায় না।
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
