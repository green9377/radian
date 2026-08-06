"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PRODUCTS } from "../_data/products";
import { getProductDetail } from "../_data/productDetails";
import Icon from "./Icon";
import BundleEditor from "./BundleEditor";
import CraftEditor from "./CraftEditor";
import ShopIconPreview, { ICON_NAMES } from "./ShopIconPreview";
import {
  createProduct,
  updateProduct,
  getProductBySlug,
  listCategories,
  listTags,
  listBrands,
  listUnits,
  listProducts,
  getVariantAttributes,
  getAddOns,
  formatTaka,
  createBundle,
  getBundleList,
  saveBundleList,
  type ApiBundleList,
  uploadItemImage,
  uploadProductPhoto,
  uploadImage,
  TARGET_MB,
  listDeliveryTypes,
  type ApiDeliveryType,
  /*  DEC-PRD-030 — category-র badge আর What's inside এই পর্দাতেও দেখাতে হয়,
      নাহলে মালিক ভাবেন কিছুই সেট করা নেই।  */
  listCategoryBadges,
  listCategorySpecs,
  type ApiCategoryTrustBadge,
  type ApiCategorySpec,
  listItems,
  getInvItemStock,
  listSuppliers,
  type ApiItem,
  type ApiSupplier,
  type InvItemStock,
  type ApiCategory,
  type ApiBrand,
  type ApiUnit,
  type ApiTag,
  type ApiProduct,
  type ApiVariantAttribute,
  type AddOnBundle,
  WEB_HOST,
} from "../_data/api";

/*
  Product Editor — add / edit form for Product Management.
  Left: section nav. Middle: the active section. Right: live storefront preview.
  Data is mock now (_data/*). SWAP HERE: Product API (:4000) will load/save later.
*/

const CATEGORIES = [
  "Fresh Flowers",
  "Cakes",
  "Chocolates",
  "Gift Boxes",
  "Personalised",
  "Plants",
  "Balloon Bouquets",
  "Flower Combos",
];
const CAT_LABEL: Record<string, string> = {
  flowers: "Fresh Flowers",
  cakes: "Cakes",
  chocolates: "Chocolates",
  giftboxes: "Gift Boxes",
  personalised: "Personalised",
  plants: "Plants",
  balloons: "Balloon Bouquets",
  combos: "Flower Combos",
};
/*
  ⚠️ এখানে `TRUST_ICONS` নামে হাতে লেখা একটা তালিকা ছিল — "bolt · 2-hour",
  "truck · nationwide" এরকম আটটা লেখা, একটা `<select>`-এ। DEC-PRD-031,
  মালিক ৩ আগস্ট ২০২৬: *"icon-এ text আসে কেন, এটা তো image আসবে।"*

  ঠিক বলেছেন, আর সমস্যাটা শুধু দেখতে নয়। Category-র picker চলত অন্য একটা
  তালিকায় (`ICON_NAMES`, ২০টা), আর দুটোর মধ্যে অনুবাদ হতো `startsWith()`
  দিয়ে। যে নামটা এই ছোট তালিকায় নেই — "clock", "medal", "globe" — সেটা
  কপি করার সময় নীরবে অন্য একটা icon-এ নেমে যেত।

  এখন দুই পর্দায় **একই তালিকা, একই picker, একই upload**। অনুবাদ নেই, তাই
  ভুলও নেই।
*/
/*
  ⚠️ হাতে লেখা OCCASIONS আর RECIPIENTS তালিকা দুটো এখান থেকে উঠে গেছে —
  DEC-PRD-022, ২ আগস্ট ২০২৬। ওগুলোই ছিল কারণ, কেন Occasions & Tags-এ বানানো
  নতুন tag এই পর্দায় কোনোদিন দেখা যেত না। এখন চিপ আঁকা হয় `/tags` থেকে,
  group ধরে — মালিক যা বানান তাই এখানে।
*/

/*
  ⚠️ PRICING SITS LAST, AND THAT IS THE OWNER'S CALL — 2 Aug 2026:
  *"ami chai price tab sheshe thakuk and sekhanei price ar sob calculation
  hok. ata bujte and dekhte valo lagbe."*

  কেন এটা সত্যিই ভালো। দাম আর একটা সংখ্যা নয় — রঙ/মাপে আলাদা দাম বসে
  (DEC-PRD-012), আর bundle-এর ছাড় main product সহ মোট দামের উপর বসে
  (DEC-PRD-018)। Pricing আগে থাকলে মালিক এমন একটা সংখ্যা লিখতেন যেটা পরের
  দুটো tab আবার বদলে দেয়, আর তিনি দুবার একই সিদ্ধান্ত নিতেন। শেষে থাকলে
  সব তথ্য হাতে নিয়ে একবারেই ঠিক করা যায়।
*/
const SECTIONS = [
  ["basics", "Basics", "tag"],
  ["stock", "Stock & lead time", "box"],
  ["media", "Photos & video", "photo"],
  ["delivery", "Delivery", "truck"],
  ["variants", "Variants & options", "layers"],
  ["tags", "Tags", "hash"],
  ["story", "Product story", "book"],
  // SEO-D01 — written here while adding the product, or later in bulk from
  // Marketing → SEO. Same six columns; whichever is convenient that day.
  ["seo", "Search & sharing", "search"],
  ["price", "Pricing", "cash"],
] as const;
type SecId = (typeof SECTIONS)[number][0];

/*  DEC-PRD-030 — `iconUrl` ভরা থাকলে সেটাই আঁকা হয়, `icon` নয়।  */
type TrustRow = { icon: string; iconUrl?: string | null; label: string; sub: string };
type SpecRow = { item: string; qty: string };
type FaqRow = { q: string; a: string };

const taka = (n: number) => "৳ " + Math.round(n).toLocaleString("en-IN");

/**
 * The id out of whatever the owner pasted.
 *
 * He will paste the address bar — `youtu.be/ID`, `watch?v=ID`, `embed/ID`,
 * sometimes with `?t=42` on the end. The storefront embeds the id alone, so a
 * whole URL stored here renders a dead player. Anything unrecognisable becomes
 * null rather than a guess: no video is better than a broken one.
 */
function youtubeId(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/);
  if (m) return m[1];
  return /^[\w-]{11}$/.test(s) ? s : null;
}

/* ---------- small building blocks ---------- */
/**
 * The `?` beside a heading. Everything a card needs to EXPLAIN goes in here.
 *
 * ⚠️ মালিক দুবার একই কথা বলেছেন — ১ আগস্ট ("clean and bold, so looking at it
 * makes you want to work") আর ৩ আগস্ট ("অনেক অনেক text... কাজ করার সময় যেন
 * boring না লাগে, এলোমেলো না লাগে")। Basics tab-এ চিপের ভেতরে ব্যাখ্যা রাখার
 * পর সেটাই তাঁর পছন্দ হয়েছে, আর বাকি দুটো tab পিছিয়ে ছিল।
 *
 * কেন এটা সত্যিই ভালো: সবসময় দেখা যাওয়া ব্যাখ্যা একবার পড়া হয়, তারপর
 * আসবাব হয়ে যায় — প্রতিবার তাকানোর খরচ নেয়, ফেরত দেয় শুধু প্রথমবার।
 * `?`-এর ভেতরে সেটা কিছুই নেয় না, আর দরকারের মুহূর্তে হাতের কাছে থাকে।
 */
function Tip({ why }: { why: string }) {
  return (
    <span
      title={why}
      className="inline-grid place-items-center w-[18px] h-[18px] rounded-full bg-lavender text-purple text-[11px] font-bold cursor-help align-middle ml-2 shrink-0"
    >
      ?
    </span>
  );
}

/*
  ═══════════════════════════════════════════════════════════════════════════
  DEC-PRD-030 — "category থেকে যা আসছে" বাক্স।

  মালিক, ৩ আগস্ট ২০২৬: *"ami catagory page a giye whats inside and trust
  budge a add krlm... tahole product story tab a ata auto show krbe pore
  ami chaile nijer moto kre edit o krte parbo right?"*

  ⚠️ দুটো অবস্থা, আর তফাতটা স্পষ্ট রাখাই এই component-এর পুরো কাজ:

    product-এ কিছু লেখা নেই  → category-রটা ধূসর করে দেখানো + একটা button
    product-এ কিছু লেখা আছে   → category-রটা আর দেখানো হয় না, বদলে একটা
                                 লাইন: "এটা category-রটাকে বদলে দিচ্ছে",
                                 পাশে ফিরে যাওয়ার পথ

  ⚠️ ধূসর সারিগুলো **কোথাও save হয় না**। এগুলো শুধু আয়না — website-এ
  এই মুহূর্তে যা দেখাচ্ছে তাই। কপি হয় একমাত্র button চাপলে।
  ═══════════════════════════════════════════════════════════════════════════
*/
function FromCategory({
  from,
  count,
  hasOwn,
  onCopy,
  onClear,
  children,
}: {
  /** category-র নাম, যেমন "Demo Gifts" */
  from: string;
  /** category-তে কটা সারি আছে */
  count: number;
  /** product নিজে কিছু লিখেছে কি না */
  hasOwn: boolean;
  onCopy: () => void;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (hasOwn) {
    return (
      <div className="flex items-center gap-2 flex-wrap mb-3 text-[12.5px]">
        <span className="inline-flex items-center gap-1.5 bg-[#fff4e5] text-[#8a5a00] font-semibold rounded-full px-2.5 py-1">
          This product&rsquo;s own
        </span>
        <span className="text-body-soft">
          {from ? `— it replaces ${from}'s.` : "— it replaces the category's."}
        </span>
        {count > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-orchid font-semibold hover:underline"
          >
            Clear all and go back to {from}&rsquo;s
          </button>
        )}
      </div>
    );
  }
  if (count === 0) return null;
  return (
    <div className="border border-lavender-deep bg-lavender/40 rounded-[12px] p-3 mb-3">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-orchid">
          On the page now · from {from}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="border border-orchid bg-white text-orchid text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] hover:bg-orchid hover:text-white transition-colors"
        >
          Use these and edit
        </button>
      </div>
      <div className="grid gap-1.5 opacity-70">{children}</div>
    </div>
  );
}

function Card({
  icon,
  title,
  hint,
  tip,
  children,
}: {
  icon?: string;
  title: React.ReactNode;
  /** always-visible line under the heading — use sparingly */
  hint?: string;
  /** the same words, hidden behind a `?`. Prefer this. */
  tip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-6 mb-5">
      {/*  ⚠️ hint না থাকলে সারিটা center-aligned আর ফাঁক কম — মালিকের
          নির্দেশ: page টা bold লাগবে, "alemelo" নয়। ব্যাখ্যা `?`-এ।  */}
      <div className={`flex gap-3 ${hint ? "items-start mb-4" : "items-center mb-3.5"}`}>
        {icon && (
          <span className="w-9 h-9 rounded-[11px] bg-orchid-soft text-purple grid place-items-center shrink-0">
            <Icon name={icon} size={19} />
          </span>
        )}
        <div>
          <h3 className="font-display font-bold text-[17.5px] text-purple m-0 leading-tight tracking-[-0.01em]">
            {title}
            {tip && <Tip why={tip} />}
          </h3>
          {hint && (
            <p className="text-body-soft text-[13px] mt-1 mb-0 leading-relaxed">
              {hint}
            </p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function Seg<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  /** `disabled` — an option that exists but is not ready. Shown, so it reads
   *  as coming rather than missing, and unpressable so it cannot be saved. */
  options: { v: T; label: React.ReactNode; disabled?: boolean }[];
}) {
  return (
    /*  `self-start w-fit` — 1 Aug 2026. `inline-flex` alone still stretched:
        `Field` is a flex COLUMN, and a column stretches its children to full
        width by default. So a two-word toggle sat in a bar the width of the
        card with a lake of empty purple beside it, which is most of what made
        this screen feel scattered. A control should be as wide as its
        choices.  */
    <div className="inline-flex self-start w-fit bg-lavender rounded-[11px] p-[4px] gap-[4px] flex-wrap">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.v)}
          className={
            "text-[13px] px-4 py-2 rounded-[8px] font-medium transition-colors " +
            (o.disabled
              ? "text-body-soft/50 cursor-not-allowed"
              : value === o.v
                ? "bg-white text-purple shadow-soft"
                : "text-body-soft hover:text-purple")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Sw({
  on,
  onToggle,
  children,
}: {
  on: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-3 text-[14px] text-left"
    >
      <span
        className={
          "w-[44px] h-[24px] rounded-full relative shrink-0 transition-colors " +
          (on ? "bg-orchid" : "bg-[#d9cbe6]")
        }
      >
        <span
          className={
            "absolute top-[2px] w-[20px] h-[20px] bg-white rounded-full transition-all shadow " +
            (on ? "left-[22px]" : "left-[2px]")
          }
        />
      </span>
      <span>{children}</span>
    </button>
  );
}

function Chips({
  all,
  value,
  onToggle,
  gold,
}: {
  all: string[];
  value: string[];
  onToggle: (v: string) => void;
  gold?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {all.map((c) => {
        const on = value.includes(c);
        const onCls = gold
          ? "bg-rosegold border-rosegold text-white"
          : "bg-purple border-purple text-white";
        return (
          <button
            key={c}
            type="button"
            onClick={() => onToggle(c)}
            className={
              "text-[13px] px-3.5 py-2 rounded-full border font-medium capitalize transition-colors " +
              (on
                ? onCls
                : "bg-white border-lavender-deep text-body hover:border-orchid-mid")
            }
          >
            {c.replace(/-/g, " ")}
          </button>
        );
      })}
    </div>
  );
}

function Field({
  label,
  note,
  full,
  children,
}: {
  label?: React.ReactNode;
  note?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={"flex flex-col gap-2 " + (full ? "col-span-full" : "")}>
      {label && (
        <label className="text-[13.5px] font-semibold text-body tracking-[0.01em]">
          {label}
        </label>
      )}
      {children}
      {note && <span className="text-[13px] text-body-soft">{note}</span>}
    </div>
  );
}

/**
 * A number box that says what it is measuring, inside the box.
 *
 * ⚠️ WHY THIS EXISTS — owner, 1 Aug 2026: *"day and time-এর ঘর বোঝার উপায়
 * নাই, কোনটা day আর কোনটা time"*. He was looking at two identical empty
 * rectangles, one wanting minutes and one wanting days. The only thing telling
 * them apart was a label above, and a label above a box is read once and then
 * skipped — the box itself said nothing. Somebody types 3 meaning three days
 * into the minutes box and the workshop's whole schedule quietly goes wrong.
 *
 * The unit rides inside the field, in the corner, greyed. It cannot be typed
 * over, it cannot scroll away from the number, and it is impossible to fill the
 * box without seeing it.
 */
function NumBox({
  value,
  onChange,
  unit,
  width = "w-[150px]",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  /** "min", "days" — short, lowercase, never a sentence */
  unit: string;
  width?: string;
  placeholder?: string;
}) {
  return (
    <div className="relative inline-flex items-center">
      {/*
        ⚠️ TWO REAL FAULTS IN THE FIRST VERSION, owner caught both 1 Aug 2026:

          1. THE BROWSER'S SPINNER SAT ON TOP OF THE UNIT. `type="number"`
             draws its own up/down arrows at the right edge — exactly where
             the unit label is pinned. They overlapped, so "MIN" was printed
             through a pair of arrows and looked like a rendering bug. The
             arrows are useless for a quantity anyone types, so they are gone.

          2. THE NUMBER AND ITS UNIT WERE AT OPPOSITE ENDS. A left-aligned "0"
             with "MIN" a hundred pixels away does not read as one value; it
             reads as two things in a box. Right-aligned, they sit together
             and are read together — "0 min".
      */}
      <input
        /*  ⚠️ `ipt-unit`, NOT `pr-[62px]`. `.ipt` sets `padding` as a
            shorthand and loads AFTER Tailwind, so any `pr-*` utility is
            silently dropped — the value then printed straight through the
            unit and read "MIN0". `globals.css` already carried this exact
            warning for `.ipt-icon` and I walked into it anyway.  */
        className={`ipt ipt-unit h-[54px] text-[18px] font-semibold ${width}`}
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <span className="pointer-events-none absolute right-4 text-[12px] font-bold uppercase tracking-[0.08em] text-body-soft">
        {unit}
      </span>
    </div>
  );
}

/**
 * One question: name on the left, control on the right, and one short line
 * saying what it does. That is the whole component.
 *
 * ⚠️ IT REPLACED A FRAMED-PANEL VERSION AFTER ONE LOOK — owner, 1 Aug 2026:
 * *"পুরা tab অনেক অনেক text, যা মোটেও ভালো লাগছে না… click করার পর ডানপাশে
 * এলোমেলো হয়ে যায়"*. Two separate faults, both mine:
 *
 *   · TOO MUCH TEXT. Every panel carried a kicker, a title, an explanation
 *     line AND a coloured result box — four pieces of prose for one number.
 *     Explanation belongs in the `?` tooltip, where it costs nothing until
 *     it is wanted. What stays on the page is the result, in one line, and
 *     it REPLACES the explanation instead of sitting under it.
 *
 *   · THE RIGHT SIDE JUMPED. The old row was `justify-between` + `flex-wrap`,
 *     so the control's position was decided by how long the text beside it
 *     happened to be. Change the number, the sentence changes length, the
 *     control moves. Here the right column is a FIXED width and the text can
 *     never push it — a control that moves while you are using it is the
 *     thing that makes a form feel unsteady.
 */
function Row({
  kicker,
  label,
  chip,
  hint,
  children,
}: {
  /** two words naming WHICH measurement — the fix for day-vs-time */
  kicker?: string;
  label: string;
  chip?: React.ReactNode;
  /** ONE short line. The result of what was typed, not a lecture. */
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-6 py-5 border-b border-lavender-deep last:border-0 last:pb-0 first:pt-0">
      <div className="flex-1 min-w-0">
        {kicker && (
          <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-orchid mb-1.5">
            {kicker}
          </div>
        )}
        <div className="text-[15.5px] font-semibold text-ink inline-flex items-center gap-2 flex-wrap">
          {label}
          {chip}
        </div>
        {hint && <div className="text-[13px] text-body-soft mt-1">{hint}</div>}
      </div>
      {/*  FIXED, never `flex-wrap`. See the note above — this is why the right
          side stopped moving about.  */}
      <div className="w-[230px] shrink-0 flex justify-end">{children}</div>
    </div>
  );
}

function ImgBox({ bg }: { bg?: string }) {
  return bg ? (
    <div
      className="w-[48px] h-[48px] rounded-[10px] shrink-0 shadow-soft"
      style={{ background: bg }}
    />
  ) : (
    <button
      type="button"
      className="w-[48px] h-[48px] rounded-[10px] shrink-0 border-[1.5px] border-dashed border-orchid-mid grid place-items-center text-orchid bg-white/70 hover:bg-orchid-soft transition-colors"
      title="Add photo"
    >
      <Icon name="plus" size={18} />
    </button>
  );
}
const delBtn =
  "border border-lavender-deep bg-white text-body-soft hover:text-[#c0392b] hover:border-[#e0a1a1] rounded-[10px] w-[38px] h-[38px] grid place-items-center shrink-0 transition-colors";
const addBtn =
  "self-start mt-3 border border-lavender-deep bg-white text-[13px] px-3.5 py-2 rounded-[10px] hover:border-orchid text-purple font-medium inline-flex items-center gap-1.5 transition-colors";
const gridCls =
  "grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4";

/**
 * Two even columns, generous rows.
 *
 * ⚠️ NOT `auto-fit`, which is what `gridCls` above does and what made the
 * Basics screen look untidy: auto-fit packs as many columns as will fit, so
 * three boxes sat in a row and the fourth dropped underneath on its own. A
 * ragged last row reads as a mistake even when every field is correct.
 *
 * Fixed at two, so fields pair off and every row is full.
 */
const pairCls = "grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-7";

/**
 * DEC-PRD-012 — পর্দায় একটা variant।
 *
 * master-এর নাম/রঙ/ছবি সাথে রাখা হয় শুধু **আঁকার জন্য**; save-এ যায় কেবল
 * `variantValueId` আর এই product-এর নিজের তিনটে ঘর। master-এর কিছু এখানে
 * কপি করে রাখা হয় না — নাহলে "Red"-এর রঙ বদলালে product-এ পুরনোটা বসে থাকত।
 */
interface VariantRow {
  variantValueId: string;
  label: string;
  swatch: string | null;
  /** master-এর ছবি — এই product নিজের না দিলে এটাই দেখা যাবে */
  masterImage: string | null;
  attribute: string;
  /** এই product-এ এই রঙের নিজের ছবি */
  imageUrl: string;
  stockQty: string;
  /**
   * DEC-PRD-015 — এই রঙের নিজের stockroom Item। `null` = নিজের কিছু নেই,
   * তখন product-এর Item-ই ধরা হয়।
   */
  itemId: string | null;
  /** বাছা Item-এর নাম/code — শুধু দেখানোর জন্য, save-এ যায় না */
  itemLabel: string | null;
  /** খালি = product-এর মূল দাম */
  price: string;
  isActive: boolean;
}

/**
 * How many photos one product may carry. Owner's decision, 1 Aug 2026.
 *
 * FlowerAura and FNP show four to six on most listings; eight leaves room to
 * tell a story — the bouquet, a detail, the wrap, the box, someone holding it —
 * without making the page slow to open on a phone, which is where nearly every
 * order in Bangladesh is placed.
 *
 * ⚠️ ONE CONSTANT, READ BY BOTH THE UPLOADER AND THE GRID. They used to
 * disagree — uploads were capped at 12 while the grid drew `slice(0, 6)` — so
 * photos 7 to 12 were saved, published to the website, and invisible to the
 * person who put them there.
 */
const MAX_PHOTOS = 8;

/**
 * Where a field ends up. Owner's question, 1 Aug 2026: "which of these is
 * connected to the website and which is not, and why."
 *
 * WHY IT IS ON THE FORM AND NOT IN A DOCUMENT. The answer is only useful at
 * the moment somebody is deciding whether to fill a box in. A wiki page nobody
 * opens does not stop a shop typing a brand name for two hundred products and
 * discovering later that no page has ever shown one.
 *
 *   live     — a customer sees this
 *   partial  — a customer sees it sometimes; the note says when
 *   staff    — never leaves the building
 *   off      — stored, and nothing on the site reads it yet
 *
 * ⚠️ THE LABEL IS ONE WORD. Owner, 1 Aug 2026, after the Stock tab had been
 * cleaned twice and still read as a wall: *"এখনো অনেক অনেক text"*.
 *
 * The chips were a large part of it and I had not counted them as text. Three
 * rows in a column each carrying "Seen by customers" is nine words saying one
 * thing three times, and it competes with the field names it is meant to
 * annotate. Use the shared vocabulary — Live · Sometimes · Staff · Not live —
 * so the eye learns four shapes instead of reading a phrase every time. The
 * colour already carries the meaning; the word is only there to name it, and
 * the sentence explaining it belongs in `why`, on hover, where it is free.
 */
function Where({
  kind,
  why,
  children,
}: {
  kind: "live" | "partial" | "staff" | "off";
  /**
   * ⚠️ THE REASON LIVES IN HERE, NOT UNDER THE FIELD — owner, 1 Aug 2026:
   * "the details underneath are making the page a mess. I want it clean and
   * bold, so looking at it makes you want to work."
   *
   * He is right and the first version was wrong in a specific way: an
   * explanation that is always visible is read once and then becomes
   * furniture — it costs every future glance and repays only the first. On
   * hover it costs nothing and is there the moment it is wanted.
   */
  why: string;
  children: React.ReactNode;
}) {
  const style = {
    live: "bg-[#e8f6ee] text-[#12693f] border-[#bfe3cd]",
    partial: "bg-[#fff6e5] text-[#8a5a00] border-[#f0d9a8]",
    staff: "bg-lavender text-purple border-lavender-deep",
    off: "bg-[#f4f4f6] text-[#6b6b76] border-[#dedee4]",
  }[kind];
  return (
    <span
      title={why}
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-[3px] rounded-full border cursor-help ${style}`}
    >
      {children}
      <span className="opacity-45 font-normal">?</span>
    </span>
  );
}

/**
 * DEC-PRD-032, ৬ আগস্ট — মালিক: "পুরা product upload page কোনটা mandatory
 * আর কোনটা না তার কোনো sign নাই।" এই লাল তারা-টাই সেই sign — যে ৪টা
 * শর্ত ছাড়া `assertPublishReady` (backend) publish আটকায়, ঠিক সেই
 * field-গুলোর পাশেই বসে, যাতে save করার আগেই বোঝা যায়।
 */
function Req() {
  return (
    <span className="text-[#c0392b] font-bold ml-0.5" title="Publish করতে এই ঘরটা লাগবে">
      *
    </span>
  );
}

/** a label with its "where does this show" chip beside it */
function L({
  children,
  chip,
  required,
}: {
  children: React.ReactNode;
  chip?: React.ReactNode;
  /** DEC-PRD-032 — লাল তারা: এটা ফাঁকা থাকলে product publish হবে না */
  required?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      {children}
      {required && <Req />}
      {chip}
    </span>
  );
}

// Zone-based delivery speeds (later these come from the Delivery module config)
/*  ⚠️ `DHAKA_SPEEDS` আর `NATION_SPEEDS` এখানে লেখা ছিল — পাঁচটা নাম, কোডে।
    মালিক delivery module-এ নতুন একটা ধরন বানালে সেটা এই পর্দায় কোনোদিনই
    আসত না, কারণ কোড ওই পাঁচটা ছাড়া আর কিছু জানত না। আর "Standard courier
    (1–3 days)" / "Express courier (next day)" — এই দুটো তো delivery
    module-এ কখনো ছিলই না, শুধু এখানে লেখা ছিল।

    এখন নামগুলো `/delivery/types` থেকে আসে। মালিকের নির্দেশ, ১ আগস্ট ২০২৬:
    *"delivery module-এ যা edit বা change করা হয়, তা যেন auto পুরা system-এ
    কাজ করে।"*  */

// One representative product per category — used to load a section template
const CAT_REP: Record<string, string> = {
  "Fresh Flowers": "velvet-red-24-premium-roses",
  Cakes: "chocolate-fudge-celebration-cake",
  Chocolates: "lindt-luxury-selection",
  "Gift Boxes": "signature-radian-gift-box",
  Personalised: "photo-mug-custom",
  Plants: "money-plant-ceramic-pot",
  "Balloon Bouquets": "birthday-balloon-bouquet",
  "Flower Combos": "roses-and-chocolate-cake-combo",
};
const tplFor = (catLabel: string) => {
  const s = CAT_REP[catLabel];
  return s ? getProductDetail(s) : null;
};

export default function ProductEditor({ slug }: { slug?: string }) {
  const src = useMemo(
    () => (slug ? PRODUCTS.find((p) => p.slug === slug) : undefined),
    [slug],
  );
  const detail = useMemo(() => (slug ? getProductDetail(slug) : null), [slug]);

  const [sec, setSec] = useState<SecId>("basics");

  /*  Moving to another section scrolls back to the top of it. Without this
      you land halfway down a section you have not read, because the browser
      keeps the old scroll position on a page whose content just changed.  */
  const secIdx = SECTIONS.findIndex(([id]) => id === sec);
  const goSec = (i: number) => {
    setSec(SECTIONS[i][0]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Basics
  const [name, setName] = useState(src?.name ?? "");
  const [slugV, setSlugV] = useState(src?.slug ?? "");
  const [skuV, setSkuV] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  // real category selection (ids) — the source of truth sent to the API
  const [topCatId, setTopCatId] = useState<string>("");
  const [subCatId, setSubCatId] = useState<string>("");
  const [ptype, setPtype] = useState<"READYMADE" | "CRAFTED">(
    src?.prepaidOnly || src?.cat === "personalised" ? "CRAFTED" : "READYMADE",
  );
  const [status, setStatus] = useState<"ACTIVE" | "DRAFT">("ACTIVE");
  // which category's template to load in section headers
  const [tplCat, setTplCat] = useState(src ? CAT_LABEL[src.cat] : CATEGORIES[0]);

  // Pricing
  const [cost, setCost] = useState("");
  const [sell, setSell] = useState(src ? String(src.pricePaisa / 100) : "");
  const [discType, setDiscType] = useState<"NONE" | "FLAT" | "PCT">("NONE");
  /**
   * DEC-PRD-028 — ছাড়ের শুরু আর শেষ। `yyyy-mm-dd`, খালি = সীমা নেই।
   *
   * ⚠️ `<input type="date">`-এর নিজের আকারই এটা, আর সেটাই রাখা হয়েছে —
   * `Date`-এ রূপান্তর করলে browser-এর সময়অঞ্চল ঢুকে পড়ে আর তারিখ একদিন
   * সরে যেতে পারে (preorderDate-এ ঠিক এটাই ধরা পড়েছিল)।
   */
  const [discStart, setDiscStart] = useState("");
  const [discEnd, setDiscEnd] = useState("");
  const [discVal, setDiscVal] = useState("");
  const [advReq, setAdvReq] = useState(!!src?.prepaidOnly);
  const [advType, setAdvType] = useState<"FULL" | "PARTIAL">("FULL");
  /*  ৩ আগস্টের নিরীক্ষা — কলাম দুটো আর storefront-এর "Bestseller" তাক
      আগেই ছিল, admin-এ বসানোর switch-ই ছিল না। কেউ কোনোদিন on করতে
      পারত না।  */
  const [isBest, setIsBest] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [advPartType, setAdvPartType] = useState<"PCT" | "FLAT">("PCT");
  const [advPartVal, setAdvPartVal] = useState("50");

  // Stock
  const [stockMode, setStockMode] = useState<"MANUAL" | "TRACKED">("MANUAL");
  const [stock, setStock] = useState(src ? "24" : "");
  /*  ⚠️ OFF, not on — owner's instruction, 1 Aug 2026. Starting ON meant every
      product ever created published its exact count until somebody thought to
      stop it. See the Stock card for the reasoning.  */
  const [showStock, setShowStock] = useState(false);

  /*
    ── The Item link (DEC-ITM-002), added 1 Aug 2026 ────────────────────────
    TRACKED stock means the number is not typed here — it is counted in the
    stockroom, against an Item. So the field stops being a box and becomes a
    choice: which Item is this listing?

    `linkedItem` is kept whole rather than just its id because the screen has
    to show what was chosen — its stockroom code, and the vendor it carries.
  */
  const [itemId, setItemId] = useState<string | null>(null);
  const [linkedItem, setLinkedItem] = useState<ApiProduct["item"]>(null);
  const [itemStock, setItemStock] = useState<InvItemStock | null>(null);
  /*
    ── Who provides it — owner's ruling, 1 Aug 2026 ─────────────────────────
    Three shapes, and the vendor one is NOT a stock mode: a vendor product has
    no stock at all and never becomes an Item. So "ours vs theirs" is asked
    first, and only "ours" goes on to ask how the counting works.
  */
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [vendors, setVendors] = useState<ApiSupplier[]>([]);
  /** the number shown on the website. "" = show the real one */
  const [displayQty, setDisplayQty] = useState("");
  /** minutes to make one — what the daily-capacity module counts in */
  const [makeMinutes, setMakeMinutes] = useState("");
  /** DEC-PDP-09 — what happens the moment the count reaches zero */
  const [soldOutMode, setSoldOutMode] = useState<"STOCK_OUT" | "PRE_ORDER">(
    "STOCK_OUT",
  );
  /** "Expected back on", yyyy-mm-dd. "" = the owner did not say. */
  const [preorderDate, setPreorderDate] = useState("");

  const [itemQ, setItemQ] = useState("");
  const [itemHits, setItemHits] = useState<ApiItem[]>([]);
  const [itemBusy, setItemBusy] = useState(false);

  /*  Searched on the server, not filtered in the browser: a stockroom has
      thousands of items and the list endpoint already knows how to search
      them. Debounced, because every keystroke is otherwise a request.  */
  useEffect(() => {
    /*  No longer gated on TRACKED — the Item link is its own card now and is
        shown for every product, tracked or not (DEC-ITM-002).  */
    if (linkedItem) return;
    const q = itemQ.trim();
    const id = setTimeout(() => {
      setItemBusy(true);
      listItems(q ? { search: q } : undefined)
        .then((r) => setItemHits(r.slice(0, 8)))
        .catch(() => setItemHits([]))
        .finally(() => setItemBusy(false));
    }, 300);
    return () => clearTimeout(id);
  }, [itemQ, linkedItem]);

  /**
   * DEC-PRD-015 — কোন variant-টার জন্য এই মুহূর্তে Item খোঁজা হচ্ছে।
   * `null` = কারও জন্য নয়। খোঁজার ঘরটা card-এর ভেতরে বসানো যেত না —
   * card ১৩২px চওড়া, আর তাতে item-এর নাম পড়াই যেত না।
   */
  const [vItemFor, setVItemFor] = useState<string | null>(null);
  const [vItemQ, setVItemQ] = useState("");
  const [vItemHits, setVItemHits] = useState<{ id: string; sku: string; name: string }[]>([]);

  /*  DEC-PRD-015 — variant-এর জন্য Item খোঁজা। product-এর নিজের খোঁজার
      হুবহু একই ডাক (`listItems`), যাতে দুই জায়গায় দুই রকম ফল না আসে।  */
  useEffect(() => {
    if (!vItemFor) return;
    let stale = false;
    const t = setTimeout(() => {
      listItems(vItemQ.trim() ? { search: vItemQ.trim() } : undefined)
        .then((r) => !stale && setVItemHits(r.slice(0, 30)))
        .catch(() => !stale && setVItemHits([]));
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [vItemQ, vItemFor]);

  /*  The live figure. Read, never typed — that is the whole point of TRACKED.  */
  useEffect(() => {
    if (!itemId) {
      setItemStock(null);
      return;
    }
    let stale = false;
    getInvItemStock(itemId)
      .then((s) => !stale && setItemStock(s))
      .catch(() => !stale && setItemStock(null));
    return () => {
      stale = true;
    };
  }, [itemId]);
  const [lead, setLead] = useState("0");

  // Media
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  /** "2 photos were cropped square" — information, not a failure */
  const [photoNote, setPhotoNote] = useState("");
  /** which tile is being dragged, so the rest can show where it would land */
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [photos, setPhotos] = useState<string[]>(
    detail?.gallery
      ? detail.gallery.slice(0, 3)
      : src?.bg
        ? [src.bg]
        : [],
  );
  const [video, setVideo] = useState(
    detail?.videoId ? `https://youtu.be/${detail.videoId}` : "",
  );

  /*
    Product photographs — THE ONE THAT MATTERED MOST.

    This screen used to read each picked file in the browser and push the base64
    string straight into `photos`. Six of those on one product is roughly a
    megabyte of text saved into the product row, and the request usually failed
    long before that: the photo was on screen, so it looked done, and it was gone
    on the next load. A whole catalogue could be entered that way and lost.

    Each file is uploaded first; only the returned address is added to the strip.
    Uploaded one at a time on purpose — six at once from a shop connection times
    out, and this way a single bad file names itself instead of taking the batch
    down with it.
  */
  /*
    ⚠️ THE OLD LIMIT CHECK DROPPED EVERY PHOTO IN SILENCE.

        for (const f of files) {
          if (photos.length + files.length > 12) break;

    `photos` is state, so it does not change inside the loop, and neither does
    `files.length` — the condition is a constant. Pick 13 at once and it breaks
    on the FIRST file, so nothing uploads at all. Pick 6 when 7 are already
    there and, again, nothing. No error either: `failed` stays empty, so the
    owner is shown a successful-looking screen with no new photos on it and no
    idea why.

    Now: work out how much room is left BEFORE uploading, upload exactly that
    many, and say plainly how many were left out.
  */
  async function addPhotos(files: File[]) {
    setPhotoErr("");
    setPhotoNote("");
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setPhotoErr(`Already at ${MAX_PHOTOS} photos — remove one to add another.`);
      return;
    }
    const take = files.slice(0, room);
    const skipped = files.length - take.length;

    setPhotoBusy(true);
    const failed: string[] = [];
    let cropped = 0;
    let shrunk = 0;
    for (const f of take) {
      try {
        /*  `uploadProductPhoto`, not the generic uploader — product photos are
            squared before they leave the browser. Owner's standing rule:
            "image jen 1/1 hoy alwas".  */
        const { url, wasCropped, wasShrunk } = await uploadProductPhoto(f);
        if (wasCropped) cropped++;
        if (wasShrunk) shrunk++;
        setPhotos((p) => (p.includes(url) ? p : [...p, url]));
      } catch (e) {
        failed.push(`${f.name} — ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
    /*  ⚠️ SAID OUT LOUD. Cutting the top off a tall bouquet without a word is
        the kind of small dishonesty that gets noticed a week later, by which
        time nobody remembers the upload.  */
    /*  ⚠️ SAID OUT LOUD, BOTH OF THEM. A shop owner who carefully exported a
        6 MB photograph deserves to know it did not go up untouched, and
        cutting the top off a tall bouquet in silence is the kind of small
        dishonesty that gets noticed a week later — by which time nobody
        remembers the upload. One sentence, only when something happened.  */
    const said: string[] = [];
    if (cropped > 0)
      said.push(`${cropped} cropped square from the centre`);
    if (shrunk > 0)
      said.push(`${shrunk} made smaller to fit under ${TARGET_MB} MB`);
    setPhotoNote(said.length ? said.join(" · ") + "." : "");
    if (skipped > 0)
      failed.unshift(
        `${skipped} photo${skipped === 1 ? "" : "s"} left out — ${MAX_PHOTOS} is the limit`,
      );
    if (failed.length) setPhotoErr(failed.join(" · "));
    setPhotoBusy(false);
  }

  /*
    Reordering. The first photo IS the main image — the card, the search
    result, the WhatsApp preview all use it — and until now the only way to
    change which one that was, was to delete every photo and upload them again
    in the right order.
  */
  function movePhoto(from: number, to: number) {
    if (from === to || to < 0 || to >= photos.length) return;
    setPhotos((p) => {
      const next = [...p];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  // Delivery
  const [zone, setZone] = useState<"DHAKA" | "NATIONWIDE">(
    src?.zone === "both" ? "NATIONWIDE" : "DHAKA",
  );
  /**
   * DEC-PRD-012 — এই product-এর variant-গুলো, প্রতিটার নিজের ছবি-মজুদ-দাম।
   * খালি = এই product-এর কোনো variant নেই, আর page-এ ওই অংশটাই দেখা যায় না।
   */
  const [variants, setVariants] = useState<VariantRow[]>([]);
  /** কোন variant-টা এই মুহূর্তে edit-এ আছে */
  const [vOpen, setVOpen] = useState<string | null>(null);
  const [vBusy, setVBusy] = useState<string | null>(null);

  /**
   * কোন variant template খোলা আছে। `null` = যেটায় ইতিমধ্যে একটা মান বাছা
   * আছে সেটাই খোলে (`pickedAttrId`), নাহলে কিছুই না।
   */
  const [vAttrOpen, setVAttrOpen] = useState<string | null>(null);

  /** DEC-DLV-008 — যে delivery-গুলোতে এই product যেতে পারে, id দিয়ে */
  const [delivTypeIds, setDelivTypeIds] = useState<string[]>([]);
  /** delivery module থেকে আসা নামের তালিকা */
  const [delivTypes, setDelivTypes] = useState<ApiDeliveryType[]>([]);

  /*
    ⚠️ দুই module একই জায়গাকে দুই নামে ডাকে, আর সেটা ধরা পড়েছিল খালি
    পর্দা দেখে — Nationwide বাছলে "কোনো delivery নেই" লেখা উঠছিল, অথচ
    "Nationwide Courier" টেবিলে বসে ছিল।

        Product.zone        →  DHAKA | NATIONWIDE
        DeliveryZone (enum) →  DHAKA | BANGLADESH | COUNTER

    দুটোই ঠিক নিজের জায়গায়: Product বলে "এই জিনিস কতদূর যায়", Delivery
    বলে "দেশের কোন ভাগ"। কিন্তু মেলানোর সময় অনুবাদ লাগে, আর সেই অনুবাদটা
    একটাই জায়গায় থাকা দরকার — নাহলে পরের বার কেউ আবার `===` লিখে ফেলবে।
  */
  const deliveryZoneOf = (z: "DHAKA" | "NATIONWIDE") =>
    z === "NATIONWIDE" ? "BANGLADESH" : "DHAKA";

  // Tags
  /**
   * DEC-PRD-022 — এই product-এ বসানো tag, slug দিয়ে। **একটাই তালিকা।**
   *
   * ⚠️ আগে দুটো ছিল — `occ` আর `rec` — আর চিপগুলো আঁকা হতো এই ফাইলে হাতে
   * লেখা দুটো array থেকে। দুটো সমস্যা একসাথে:
   *
   *   ১. মালিক Occasions & Tags-এ নতুন tag বা নতুন group বানালে সেটা এই
   *      পর্দায় **কখনো দেখা যেত না** — হাতে লেখা তালিকায় সে নেই।
   *   ২. product খোলার সময় দুটো তালিকাতেই সব slug বসত, তাই কোনো tag-এর
   *      tick তুলে দিলেও সেটা অন্য তালিকায় থেকে যেত আর ফিরে আসত।
   *
   * এখন চিপগুলো `apiTags` থেকে group ধরে আঁকা হয়, আর বাছাই একটাই তালিকায়
   * থাকে — তাই দুটো সমস্যাই আর নেই।
   */
  const [tagSel, setTagSel] = useState<string[]>([
    ...(src?.occ ?? []),
    ...(src?.rec ?? []),
  ]);

  // Story
  const [typeText, setTypeText] = useState<string>(
    detail?.nature.type ?? "fresh",
  );
  const [natureLabel, setNatureLabel] = useState(detail?.nature.label ?? "");
  const [salesLabel, setSalesLabel] = useState(src?.meta ?? "");
  /**
   * DEC-PRD-025 — প্রতি সময়ের নিজের শুরুর সংখ্যা। মালিকের প্রশ্নই এটার
   * কারণ: *"today sale ১০ দিলাম, সেভাবে week আর month-এ দিলাম — তাহলে
   * today/week/month শেষ হলে কী হবে?"* একটাই ঘর থাকলে "আজ ১০" আর "এ মাসে
   * ২০০" একসাথে বলাই যেত না।
   */
  const [salesWindow, setSalesWindow] = useState<"TODAY" | "WEEK" | "MONTH" | "ALL">("MONTH");
  const [seedToday, setSeedToday] = useState("");
  const [seedWeek, setSeedWeek] = useState("");
  const [seedMonth, setSeedMonth] = useState("");
  const [seedAll, setSeedAll] = useState("");

  /**
   * DEC-PRD-026 — গ্রাহক এই product-এ নিজের লেখা বা ছবি দিতে পারবে কি না।
   * দুটোই বন্ধ = product page-এ ওই অংশটাই নেই।
   */
  const [persoTitle, setPersoTitle] = useState("");
  const [persoText, setPersoText] = useState(false);
  const [persoTextLabel, setPersoTextLabel] = useState("");
  const [persoTextMax, setPersoTextMax] = useState("");
  const [persoTextHint, setPersoTextHint] = useState("");
  const [persoImage, setPersoImage] = useState(false);
  const [persoImageLabel, setPersoImageLabel] = useState("");
  const [persoImageHint, setPersoImageHint] = useState("");

  /** DEC-PRD-027 — "Want this customised?" সবুজ বাক্স */
  const [customiseOn, setCustomiseOn] = useState(false);
  const [customiseTitle, setCustomiseTitle] = useState("");
  const [customiseSub, setCustomiseSub] = useState("");
  const [trust, setTrust] = useState<TrustRow[]>(
    /*  DEC-PRD-031 — mock detail-এর icon নামও ICON_NAMES-এরই একটা।  */
    detail?.trust.map((t) => ({
      icon: t.icon,
      iconUrl: null,
      label: t.label,
      sub: t.sub,
    })) ?? [],
  );
  /*  DEC-PRD-031 — কোন সারির icon বাছা হচ্ছে, আর কোনটায় upload চলছে।
      সারির index দিয়ে, কারণ product-এর badge-এর নিজের id নেই — সেগুলো
      save করার আগ পর্যন্ত শুধু এই পর্দার তালিকা।  */
  const [iconPick, setIconPick] = useState<number | null>(null);
  const [iconBusy, setIconBusy] = useState<number | null>(null);
  const [iconErr, setIconErr] = useState<string | null>(null);

  const [spec, setSpec] = useState<SpecRow[]>(
    detail?.spec.map((s) => ({ item: s.item, qty: s.qty })) ?? [],
  );
  const [faqs, setFaqs] = useState<FaqRow[]>(
    detail?.faqs.map((f) => ({ q: f.q, a: f.a })) ?? [],
  );

  /*
    ═══════════════════════════════════════════════════════════════════════
    DEC-PRD-030 — category থেকে যা আসছে, সেটা এই পর্দাতেই দেখা যাবে।

    মালিকের প্রশ্ন, ৩ আগস্ট ২০২৬: *"ami catagory page a giye whats inside
    and trust budge a add krlm... tahole product story tab a ata auto show
    krbe pore ami chaile nijer moto kre edit o krte parbo right?"*

    ⚠️ উত্তরটা ছিল অর্ধেক হ্যাঁ। Website-এ আসত, কিন্তু এই পর্দায় ঘরদুটো
    **খালিই** থাকত — দেখে বোঝার উপায় ছিল না যে কিছু সেট করা আছে।

    ⚠️ এগুলো product-এ **save হয় না**। শুধু দেখানোর জন্য। কপি হয় তখনই,
    যখন মালিক নিজে "Use these and edit" চাপেন — আর তখন থেকে ওই product
    নিজের কপি রাখে, category বদলালেও বদলায় না। এটাই DEC-PRD-023-এর
    "replace" নিয়ম, শুধু এবার চোখে দেখা যায়।
    ═══════════════════════════════════════════════════════════════════════
  */
  const [catTrust, setCatTrust] = useState<ApiCategoryTrustBadge[]>([]);
  const [catSpec, setCatSpec] = useState<ApiCategorySpec[]>([]);
  /** কোন category থেকে এসেছে — sub না হলে top, তাই নামটা আলাদা করে রাখা */
  const [storyFrom, setStoryFrom] = useState("");
  const [oz, setOz] = useState(detail?.ozReason ?? "");

  /* ⇄ SWAPPED: save/load via :4000 API */
  const router = useRouter();
  const [apiProductId, setApiProductId] = useState<string | null>(null);
  const [loadedCatId, setLoadedCatId] = useState<string | null>(null);
  const [apiCats, setApiCats] = useState<ApiCategory[]>([]);
  const [apiTags, setApiTags] = useState<ApiTag[]>([]);
  const [apiBrands, setApiBrands] = useState<ApiBrand[]>([]);
  const [brandId, setBrandId] = useState<string>("");
  const [apiUnits, setApiUnits] = useState<ApiUnit[]>([]);
  const [unitId, setUnitId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  /*  SEO-D01 — the six columns. Blank is fine: the storefront falls back to
      the product name and short description, so nothing is broken by leaving
      them empty. They can also be filled later, in bulk, from Marketing → SEO. */
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [ogImageUrl, setOgImageUrl] = useState("");
  /** DEC-PRD-024 — share-এর ছবি upload হচ্ছে কি না */
  const [ogBusy, setOgBusy] = useState(false);
  const [noIndex, setNoIndex] = useState(false);

  /*
    This product's own variant identity (colour/flavour) — picked, never typed.

    ⚠️ `variantValueId` is the one that matters now (D-CAT-01, 31 Jul 2026).
    The label and swatch beside it are copies kept for the screens that still
    read them; the storefront filters on the id. Two products holding the word
    "Red" were two different colours to the database until this existed, which
    is why "Shop by colour" could not be built at all.
  */
  const [variantValueId, setVariantValueId] = useState<string | null>(null);
  const [variantLabel, setVariantLabel] = useState("");
  const [variantSwatch, setVariantSwatch] = useState("");
  const [upPickerOpen, setUpPickerOpen] = useState(false);
  const [upPq, setUpPq] = useState("");
  // upgrades chosen before the product is saved (linked on create)
  const [pendingUp, setPendingUp] = useState<ApiProduct[]>([]);
  /**
   * নতুন product-এ যে bundle-গুলো আগেই বাছা হয়েছে। মালিক, ২ আগস্ট ২০২৬:
   * *"bundle-এ এখনো কিছু select করার option নেই, discount দেওয়ারও না"* —
   * তিনি একটা **নতুন** product-এ ছিলেন।
   *
   * ⚠️ Bundle-এর সারি একটা product id-র দিকে দেখায়, আর না-সংরক্ষিত
   * product-এর id নেই। তাই আগে এখানে শুধু "Save this product first" লেখা
   * ছিল — সত্যি, কিন্তু একটা বন্ধ দরজা। Upgrade card-টা ঠিক এই সমস্যার
   * সমাধান আগেই করে রেখেছিল: এখন বাছো, save-এর মুহূর্তে জোড়া লাগে।
   * Bundle-ও এখন তাই করে।
   */
  const [pendingBundles, setPendingBundles] = useState<ApiProduct[]>([]);
  const [pendingLabel, setPendingLabel] = useState("");
  const [pendingDiscType, setPendingDiscType] = useState<"NONE" | "FLAT" | "PERCENT">("NONE");
  const [pendingDiscValue, setPendingDiscValue] = useState("");
  const [bunPq, setBunPq] = useState("");

  /**
   * DEC-PRD-019 — সংরক্ষিত product-এর bundle তালিকা, Pricing tab-এ দেখানোর
   * জন্য। মালিক, ২ আগস্ট ২০২৬: *"price tab akhono variant tab bundle ar
   * baki product tene anche na... discount dile bundle product soho dekhabe
   * koto discount koto amdr profit."*
   *
   * ⚠️ Pricing tab খোলার সময় নতুন করে আনা হয় — কারণ মালিক আগের tab-এ
   * এইমাত্র একটা জিনিস যোগ করে থাকতে পারেন, আর তখন পুরনো তালিকা নিয়ে
   * বসে থাকলে হিসাবটা মিথ্যা হতো।
   */
  const [bundleList, setBundleList] = useState<ApiBundleList | null>(null);
  // add-on groups manually pinned to this product (besides the auto rules)
  const [manualGroupIds, setManualGroupIds] = useState<string[]>([]);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  // masters loaded from the API so the editor reflects the new systems
  const [vAttrs, setVAttrs] = useState<ApiVariantAttribute[]>([]);

  /*  যে template-এ ইতিমধ্যে একটা মান বাছা আছে — product খুললে সেটাই খুলে
      থাকে, যাতে মালিককে খুঁজতে না হয় "Red" কোন set-এর ভেতরে ছিল।  */
  const pickedAttrId =
    vAttrs.find((a) =>
      a.values.some((v) => (variantValueId ? v.id === variantValueId : v.label === variantLabel && !!variantLabel)),
    )?.id ?? null;
  const [addonBundle, setAddonBundle] = useState<AddOnBundle | null>(null);
  const [allProducts, setAllProducts] = useState<ApiProduct[]>([]);

  /*
    DEC-PRD-019 — Pricing tab খুললেই bundle তালিকাটা নতুন করে আনা হয়।

    ⚠️ শুধু একবার mount-এ আনলে হতো না: মালিক Variants tab-এ একটা জিনিস
    যোগ করে সোজা Pricing-এ যান, আর তখন পুরনো তালিকা নিয়ে বসা মানে হিসাবটা
    মিথ্যা। ছোট একটা request, আর তাতে সংখ্যাটা সবসময় সত্যি থাকে।

    ⚠️ এই hook-টা `apiProductId` **ঘোষণার নিচে** থাকতেই হবে। উপরে বসিয়ে
    আমি একই ভুল দুবার করেছি (২ আগস্ট, variant item picker-এও) — JavaScript
    ঘোষণার আগে পড়তে গেলে "Cannot access before initialization" দিয়ে গোটা
    পর্দা ফেলে দেয়।
  */
  useEffect(() => {
    if (sec !== "price" || !apiProductId) return;
    let alive = true;
    getBundleList({ productId: apiProductId })
      .then((r) => alive && setBundleList(r))
      .catch(() => alive && setBundleList(null));
    return () => {
      alive = false;
    };
  }, [sec, apiProductId]);

  useEffect(() => {
    listCategories()
      .then((cs) => setApiCats(cs as ApiCategory[]))
      .catch(() => {});
    listTags().then(setApiTags).catch(() => {});
    listBrands().then(setApiBrands).catch(() => {});
    listUnits().then(setApiUnits).catch(() => {});
    getVariantAttributes().then(setVAttrs).catch(() => {});
    getAddOns().then(setAddonBundle).catch(() => {});
    listProducts().then((r) => setAllProducts(r.items)).catch(() => {});
    listSuppliers().then(setVendors).catch(() => {});
    /*  DEC-DLV-008 — নামগুলো delivery module থেকে, প্রতিবার নতুন করে।
        cache করা হয় না ইচ্ছাকৃতভাবে: মালিক পাশের tab-এ একটা ধরন যোগ করে
        এখানে এলে সেটা যেন সাথে সাথেই দেখা যায়। */
    /*  ⚠️ `rateCount > 0` — যে নামের কোনো এলাকায় দাম বসানো নেই, সেটা এখানে
        দেখানো হয় না। দেখালে মালিক টিক দিতেন, save হতো, আর checkout ওই
        delivery কখনো দেখাত না — একটা টিক যা কিছুই করে না। দাম বসানোর
        সাথে সাথেই নামটা এখানে ফিরে আসে।  */
    listDeliveryTypes()
      .then((r) => setDelivTypes(r.filter((t) => t.isActive && (t.rateCount ?? 1) > 0)))
      .catch(() => {});
    if (slug) {
      /*
        ⚠️ THIS USED TO RESTORE TWELVE FIELDS AND LEAVE THE REST BLANK
        — 1 Aug 2026, and it destroyed data rather than merely looking wrong.

        Every state variable above is initialised from `src`, the MOCK product
        array. For the seventy-one demo slugs that filled the form and nothing
        looked amiss. For a product created in the admin, `src` is undefined —
        so the name, the prices, the stock, the delivery ticks, the photos and
        every child list opened EMPTY, and pressing Publish wrote those empties
        back over a real product. The owner described it exactly: "open an old
        product and the title and everything is gone."

        So: the database is the source now, for every field, and the mock is
        only the placeholder for a product that does not exist yet.
      */
      getProductBySlug(slug)
        .then((p) => {
          if (!p) return;
          setApiProductId(p.id);

          // identity
          setName(p.name ?? "");
          setSlugV(p.slug ?? "");
          if (p.sku) setSkuV(p.sku);
          setShortDesc(p.shortDesc ?? "");
          if (p.category) setLoadedCatId(p.category.id);
          if (p.brandId) setBrandId(p.brandId);
          if (p.unitId) setUnitId(p.unitId);
          if (p.productType) setPtype(p.productType);
          setStatus(p.isPublished ? "ACTIVE" : "DRAFT");

          // money — paisa in the database, taka in the boxes
          setCost(p.costPaisa ? String(p.costPaisa / 100) : "");
          setSell(p.sellingPricePaisa ? String(p.sellingPricePaisa / 100) : "");
          setDiscType(
            p.discountType === "PERCENT" ? "PCT" : p.discountType === "FLAT" ? "FLAT" : "NONE",
          );
          /*  PERCENT is basis points, FLAT is paisa — both are the typed
              number × 100, so one conversion serves for the box.  */
          setDiscVal(p.discountValue ? String(p.discountValue / 100) : "");
          setAdvReq(!!p.advanceRequired);
          /*  ৩ আগস্টের নিরীক্ষা — শুধু switch-টা ফিরত, ধরনটা ফিরত না।
              "PARTIAL ৩০%" save করে আবার খুললে FULL দেখাত, আর পরের save
              চুপচাপ FULL লিখে দিত। এখন চারটেই ফেরে।  */
          if (p.advanceType) setAdvType(p.advanceType);
          if (p.advancePercent != null) {
            setAdvPartType("PCT");
            setAdvPartVal(String(p.advancePercent));
          } else if (p.advanceAmountPaisa != null) {
            setAdvPartType("FLAT");
            setAdvPartVal(String(p.advanceAmountPaisa / 100));
          }
          setIsBest(!!p.isBestSeller);
          setIsNew(!!p.isNewArrival);

          // stock & lead time
          if (p.stockMode) setStockMode(p.stockMode);
          if (p.itemId) setItemId(p.itemId);
          if (p.item) setLinkedItem(p.item);
          setSupplierId(p.supplierId ?? null);
          setDisplayQty(p.displayQty != null ? String(p.displayQty) : "");
          setMakeMinutes(p.makeMinutes != null ? String(p.makeMinutes) : "");
          setStock(String(p.stockQty ?? 0));
          setShowStock(!!p.showStock);
          setSoldOutMode(p.soldOutMode ?? "STOCK_OUT");
          /*  `datetime` → `yyyy-mm-dd` for <input type="date">. Sliced rather
              than passed through `Date`, which would drag the browser's
              timezone in and can move the date by a day. */
          setPreorderDate(p.preorderDate ? p.preorderDate.slice(0, 10) : "");
          /*  DEC-PRD-028 — `slice(0,10)`, `new Date()` নয়: browser-এর
              সময়অঞ্চল ঢুকলে তারিখ একদিন সরে যেতে পারে।  */
          setDiscStart(p.discountStartsAt ? p.discountStartsAt.slice(0, 10) : "");
          setDiscEnd(p.discountEndsAt ? p.discountEndsAt.slice(0, 10) : "");
          setLead(String(p.leadTimeDays ?? 0));

          // delivery
          if (p.zone) setZone(p.zone);
          /*  DEC-DLV-008 — id দিয়ে, নাম দিয়ে নয়। মালিক delivery module-এ
              "Same Day" → "Same-day" করলেও এই সংযোগ ছেঁড়ে না।  */
          setDelivTypeIds((p.deliveryTypes ?? []).map((d) => d.typeId));
          setVariants(
            (p.variants ?? []).map((v) => ({
              variantValueId: v.variantValueId,
              label: v.variantValue?.label ?? "",
              swatch: v.variantValue?.swatch ?? null,
              masterImage: v.variantValue?.imageUrl ?? null,
              attribute: v.variantValue?.attribute?.name ?? "",
              imageUrl: v.imageUrl ?? "",
              stockQty: String(v.stockQty ?? 0),
              itemId: v.itemId ?? null,
              itemLabel: v.item ? `${v.item.name} · ${v.item.sku}` : null,
              price: v.pricePaisa != null ? String(v.pricePaisa / 100) : "",
              isActive: v.isActive,
            })),
          );

          // variant & add-ons
          if (p.variantValueId) setVariantValueId(p.variantValueId);
          if (p.variantLabel) setVariantLabel(p.variantLabel);
          if (p.variantSwatch) setVariantSwatch(p.variantSwatch);
          if (p.manualAddOnGroups) setManualGroupIds(p.manualAddOnGroups.map((g) => g.id));

          /*
            ── TAGS ─────────────────────────────────────────────────────────
            ⚠️ এখানে একটা সত্যিকারের bug ছিল (২ আগস্ট ২০২৬-এ ধরা): দুটো
            তালিকাতেই **সব** tag বসানো হতো —

                const slugs = p.tags.map((t) => t.slug);
                setOcc(slugs); setRec(slugs);

            ফল: `buildDto` পাঠাত `[...occ, ...rec]`, অর্থাৎ প্রতিটা tag
            দুবার আর দুই তালিকাতেই। তাই "Birthday" tick তুলে দিলে সেটা
            `occ` থেকে যেত ঠিকই, কিন্তু `rec`-এ বসে থাকত — আর তাই **কোনো
            tag কখনো তোলা যেত না**। মালিক tick তুলতেন, Publish চাপতেন,
            আর tag-টা ফিরে আসত।

            এখন প্রতিটা slug যে তালিকার, সেই তালিকাতেই যায়। যেটা কোনো
            তালিকায় নেই (মালিক পরে অন্য group বানালে) সেটা চুপচাপ বাদ
            যায় না — সেটা `extraTags`-এ রাখা হয় আর save-এ ফেরত যায়,
            নাহলে এই পর্দায় একবার ঢুকলেই অন্য group-এর tag মুছে যেত।
          */
          if (p.tags) setTagSel(p.tags.map((t) => t.slug));

          /*  DEC-PRD-025/026/027 — নতুন ঘরগুলো ফেরত আনা। ⚠️ সংখ্যাটা
              `salesSeed` থেকে, `salesCount` থেকে নয় — নাহলে বিক্রি হওয়া
              product একবার edit করলেই মালিকের শুরুর সংখ্যা বদলে যেত।  */
          if (p.salesWindow) setSalesWindow(p.salesWindow);
          setSeedToday(p.salesSeedToday ? String(p.salesSeedToday) : "");
          setSeedWeek(p.salesSeedWeek ? String(p.salesSeedWeek) : "");
          setSeedMonth(p.salesSeedMonth ? String(p.salesSeedMonth) : "");
          setSeedAll(p.salesSeedAll ? String(p.salesSeedAll) : "");
          setPersoTitle(p.persoTitle ?? "");
          setPersoText(!!p.persoText);
          setPersoTextLabel(p.persoTextLabel ?? "");
          setPersoTextMax(p.persoTextMax != null ? String(p.persoTextMax) : "");
          setPersoTextHint(p.persoTextHint ?? "");
          setPersoImage(!!p.persoImage);
          setPersoImageLabel(p.persoImageLabel ?? "");
          setPersoImageHint(p.persoImageHint ?? "");
          setCustomiseOn(!!p.customiseOn);
          setCustomiseTitle(p.customiseTitle ?? "");
          setCustomiseSub(p.customiseSub ?? "");

          // story
          /*  ৩ আগস্টের নিরীক্ষা — এখানে natureType (enum) থেকে পড়া হতো,
              মালিকের নিজের লেখাটা (typeText) নয়। "Handmade" লিখে save
              করলে আবার খুললে "fresh" দেখাত, আর পরের save সেটাই লিখে দিত।
              মালিকের লেখা আগে; enum শুধু fallback।  */
          if (p.typeText) setTypeText(p.typeText);
          else if (p.natureType) setTypeText(p.natureType.toLowerCase());
          setNatureLabel(p.natureLabel ?? "");
          setSalesLabel(p.salesCount ? String(p.salesCount) : "");
          setOz(p.nationwideMsg ?? "");
          setVideo(p.videoId ? `https://youtu.be/${p.videoId}` : "");

          // the child lists — the ones that were never loaded OR saved
          if (p.images) setPhotos(p.images.map((i) => i.url));
          if (p.specRows) setSpec(p.specRows.map((s) => ({ item: s.item, qty: s.qty })));
          if (p.faqs) setFaqs(p.faqs.map((f) => ({ q: f.question, a: f.answer })));
          if (p.trustBadges)
            setTrust(
              p.trustBadges.map((t) => ({
                /*  DEC-PRD-031 — নাম যা, নাম তাই। আগে এখানে একটা অনুবাদ
                    ছিল, আর সেটাই "bolt" কে "truck" বানিয়ে দিত।  */
                icon: t.icon,
                iconUrl: t.iconUrl ?? null,
                label: t.label,
                sub: t.sub ?? "",
              })),
            );

          // SEO
          if (p.metaTitle) setMetaTitle(p.metaTitle);
          if (p.metaDescription) setMetaDescription(p.metaDescription);
          if (p.ogImageUrl) setOgImageUrl(p.ogImageUrl);
          setNoIndex(!!p.noIndex);
        })
        .catch(() => {});
    }
  }, [slug]);

  // real category list, split into top-level + children of the chosen top
  const topCats = apiCats
    .filter((c) => !c.parentId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const childCats = apiCats
    .filter((c) => c.parentId === topCatId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const catName = apiCats.find((c) => c.id === topCatId)?.name ?? "";

  // preselect the category: from the loaded product when editing, else the first one.
  // Never silently defaults an existing product — if it can't be resolved it stays
  // empty and Save is blocked, so we never overwrite a real category by accident.
  useEffect(() => {
    if (topCatId) return;
    if (!apiCats.length) return;
    if (slug) {
      if (!loadedCatId) return;
      const c = apiCats.find((x) => x.id === loadedCatId);
      if (c) {
        if (c.parentId) {
          setTopCatId(c.parentId);
          setSubCatId(c.id);
        } else {
          setTopCatId(c.id);
        }
      }
    } else {
      const first = apiCats.find((x) => !x.parentId);
      if (first) setTopCatId(first.id);
    }
  }, [apiCats, loadedCatId, slug, topCatId]);

  function resolveCategoryId(): string | null {
    return subCatId || topCatId || null;
  }

  /*
    DEC-PRD-030 — চলতি category (আর না থাকলে তার parent) থেকে badge আর
    What's inside টেনে আনা।

    ⚠️ shop-এর `pickList(product, category, parent)`-এর হুবহু একই ক্রম।
    আলাদা ক্রম রাখলে admin এক জিনিস দেখাত আর website আরেকটা — সেটাই
    এই কাজটার মূল সমস্যা ছিল, নতুন করে বানানোর মানে হয় না।

    ⚠️ `resolveCategoryId()`-এর **পরে** থাকতেই হবে। উপরে নিলে
    "Cannot access 'resolveCategoryId' before initialization" — ২ আগস্ট
    এই ভুল দুইবার হয়েছে, দুইবারই আধঘণ্টা গেছে।
  */
  useEffect(() => {
    const own = subCatId || topCatId;
    if (!own) {
      setCatTrust([]);
      setCatSpec([]);
      setStoryFrom("");
      return;
    }
    const nameOf = (id: string) => apiCats.find((c) => c.id === id)?.name ?? "";
    let alive = true;
    (async () => {
      const [t1, s1] = await Promise.all([
        listCategoryBadges(own).catch(() => []),
        listCategorySpecs(own).catch(() => []),
      ]);
      if (!alive) return;
      const live = <T extends { isActive: boolean }>(xs: T[]) => xs.filter((x) => x.isActive);
      let trustRows = live(t1);
      let specRows = live(s1);
      let from = own;
      /*  sub-category-তে কিছু না থাকলে উপরেরটা — খালি তালিকা মানে
          "কিছু বলিনি", "কিছু নেই" নয়।  */
      if (subCatId && topCatId && trustRows.length === 0 && specRows.length === 0) {
        const [t2, s2] = await Promise.all([
          listCategoryBadges(topCatId).catch(() => []),
          listCategorySpecs(topCatId).catch(() => []),
        ]);
        if (!alive) return;
        trustRows = live(t2);
        specRows = live(s2);
        from = topCatId;
      }
      setCatTrust(trustRows);
      setCatSpec(specRows);
      setStoryFrom(nameOf(from));
    })();
    return () => {
      alive = false;
    };
  }, [subCatId, topCatId, apiCats]);

  function buildDto(publish: boolean): Record<string, unknown> {
    const toPaisa = (v: string) => Math.round(parseFloat(v || "0") * 100);
    /*  DEC-PRD-022 — একটাই তালিকা, তাই এখানে আর জোড়া লাগানোর কিছু নেই।
        যে slug-এর সাথে কোনো tag মেলে না সেটা বাদ যায় — মালিক Tags
        module-এ সেটা মুছে ফেলেছেন, তাই product-এও থাকা উচিত নয়।  */
    const tagIds = [...new Set(tagSel)]
      .map((s) => apiTags.find((t) => t.slug === s)?.id)
      .filter((x): x is string => !!x);
    const nature = catName === "Balloon Bouquets" || catName === "Personalised" ? "ARTIFICIAL" : "FRESH";
    return {
      slug:
        slugV ||
        name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-"),
      name,
      sku: skuV.trim() || null,
      categoryId: resolveCategoryId(),
      brandId: brandId || null,
      unitId: unitId || null,
      tagIds,
      productType: ptype,
      zone,
      natureType: nature,
      natureLabel: natureLabel || undefined,
      shortDesc: shortDesc || undefined,
      typeText: typeText || undefined,
      costPaisa: toPaisa(cost),
      sellingPricePaisa: toPaisa(sell),
      discountType: discType === "PCT" ? "PERCENT" : discType,
      /*  DEC-PRD-028 — খালি হলে `null`, নাহলে দিনের শুরু/শেষ ধরে ISO।
          ⚠️ শেষ তারিখে `23:59:59` — নাহলে "১০ আগস্ট পর্যন্ত" মানে দাঁড়াত
          ১০ তারিখ রাত ১২টা ০১ মিনিটে ছাড় শেষ, আর গোটা দিনটাই হারাত।  */
      discountStartsAt: discStart ? new Date(discStart + "T00:00:00").toISOString() : null,
      discountEndsAt: discEnd ? new Date(discEnd + "T23:59:59").toISOString() : null,
      discountValue:
        discType === "FLAT"
          ? toPaisa(discVal)
          : discType === "PCT"
            ? Math.round(parseFloat(discVal || "0") * 100)
            : 0,
      advanceRequired: advReq,
      advanceType: advReq ? advType : undefined,
      advancePercent:
        advReq && advType === "PARTIAL" && advPartType === "PCT"
          ? parseInt(advPartVal || "0")
          : undefined,
      advanceAmountPaisa:
        advReq && advType === "PARTIAL" && advPartType === "FLAT" ? toPaisa(advPartVal) : undefined,
      stockMode,
      /*  DEC-ITM-021 — the FK, never the SKU text.
          ⚠️ Sent whatever the stock mode is. It used to be cleared outside
          TRACKED, which quietly unlinked a vendor product the moment the
          owner left it on Manual — and Manual is exactly where a vendor
          product belongs, since Radian holds none of it.  */
      /*  A vendor product holds none of our stock, so it carries no Item —
          clearing it is not tidiness, it is the rule.  */
      itemId: supplierId ? null : itemId,
      supplierId,
      displayQty: displayQty.trim() === "" ? null : parseInt(displayQty) || 0,
      makeMinutes: makeMinutes.trim() === "" ? null : parseInt(makeMinutes) || 0,
      stockQty: parseInt(stock || "0") || 0,
      showStock,
      soldOutMode,
      /*  Only ever sent alongside PRE_ORDER. Keeping a stale date on a product
          switched back to STOCK_OUT would mean the page starts promising
          again the day somebody flips the choice back. */
      preorderDate:
        soldOutMode === "PRE_ORDER" && preorderDate ? preorderDate : null,
      leadTimeDays: parseInt(lead || "0") || 0,
      // null, not undefined, when it is cleared — undefined would leave the old
      // colour in place and the product would stay red after being un-reddened
      variantValueId: variantValueId,
      variantLabel: variantLabel || undefined,
      variantSwatch: variantSwatch || undefined,
      manualAddOnGroupIds: manualGroupIds,
      /*  ⚠️ `salesCount` আর পর্দা থেকে লেখা হয় না — DEC-PRD-025। ওটা এখন
          পুরোপুরি Sales module-এর: order delivered হলে বাড়ে, sorting আর
          card-এর "N sold" ওটাই পড়ে। মালিকের লেখা সংখ্যা চারটে seed ঘরে।
          আগে দুটোই এই এক ঘর থেকে লেখা হতো, তাই একটা edit করলেই
          সত্যিকারের গোনা মুছে যেত।  */
      /*  DEC-PRD-025 — প্রতি সময়ের নিজের ঘর। ⚠️ `salesCount` বিক্রি হলে
          বাড়ে, seed বাড়ে না — page-এর হিসাব seed-টাই পড়ে, নাহলে সপ্তাহের
          হিসাবে পুরনো বিক্রি দুবার গোনা হতো।  */
      salesSeedToday: parseInt(seedToday) || 0,
      salesSeedWeek: parseInt(seedWeek) || 0,
      salesSeedMonth: parseInt(seedMonth) || 0,
      salesSeedAll: parseInt(seedAll) || 0,
      salesWindow,
      /*  DEC-PRD-026 — খালি লেখা `null` হয়ে যায়, যাতে API-তে ফাঁকা string
          না বসে; তখন storefront নিজের সাধারণ শব্দ ব্যবহার করে।  */
      persoTitle: persoTitle.trim() || null,
      persoText,
      persoTextLabel: persoTextLabel.trim() || null,
      persoTextMax: parseInt(persoTextMax) || null,
      persoTextHint: persoTextHint.trim() || null,
      persoImage,
      persoImageLabel: persoImageLabel.trim() || null,
      persoImageHint: persoImageHint.trim() || null,
      /*  DEC-PRD-027 */
      customiseOn,
      customiseTitle: customiseTitle.trim() || null,
      customiseSub: customiseSub.trim() || null,
      /*  DEC-DLV-008 — এটাই এখন আসল উত্তর।  */
      deliveryTypeIds: delivTypeIds,
      /*  DEC-PRD-012 — খালি array পাঠানোই ঠিক: মালিক সব তুলে দিলে
          product-টার আর কোনো variant নেই।  */
      variants: variants.map((v, i) => ({
        variantValueId: v.variantValueId,
        imageUrl: v.imageUrl.trim() || null,
        stockQty: parseInt(v.stockQty || "0") || 0,
        /*  DEC-PRD-015 — Inventory-তে থাকলে এই id-ই মজুদের উৎস।  */
        itemId: v.itemId,
        /*  খালি ঘর = product-এর মূল দাম, শূন্য টাকা নয়।  */
        pricePaisa: v.price.trim() === "" ? null : Math.round(parseFloat(v.price) * 100),
        sortOrder: i,
        isActive: v.isActive,
      })),
      /*  ⚠️ পুরনো তিনটা column এখনো লেখা হচ্ছে, আর এটা সাময়িক সেতু।
          storefront এখনো `supportsExpress` ইত্যাদি পড়ে (ধাপ ৪-এ বদলাবে),
          তাই বাছাই থেকে ওগুলো বানিয়ে দেওয়া হয় — নাহলে product save করার
          সাথে সাথেই website-এ দ্রুত delivery-র চিহ্ন উধাও হয়ে যেত।

          নামের সাথে মেলানো হচ্ছে, আর সেটা ভঙ্গুর — কিন্তু এটা এক দিকের,
          সাময়িক, আর ধাপ ৪-এ পুরোটা মুছে যাবে। ততক্ষণ পর্যন্ত একই সত্যের
          দুই ঘর, যেটা একটা ধার।  */
      ...(() => {
        const names = delivTypes
          .filter((t) => delivTypeIds.includes(t.id))
          .map((t) => t.name.toLowerCase());
        const has = (re: RegExp) => names.some((n) => re.test(n));
        return {
          supportsExpress: has(/hour|express/),
          supportsSameDay: has(/same/),
          supportsMidnight: has(/midnight/),
        };
      })(),
      isPublished: publish,
      isBestSeller: isBest,
      isNewArrival: isNew,
      // SEO-D01 — null, not undefined, so clearing a field actually clears it
      metaTitle: metaTitle.trim() || null,
      metaDescription: metaDescription.trim() || null,
      ogImageUrl: ogImageUrl.trim() || null,
      noIndex,

      /*
        ⚠️ NONE OF THESE SIX WERE EVER SENT — 1 Aug 2026, and it is the bug
        the owner hit first: he uploaded photographs, saw them in the strip,
        pressed Publish, and the product had no picture anywhere.

        Nothing was broken about the UPLOAD. `addPhotos()` sends each file to
        the media store and puts the returned address in `photos` — that half
        has worked since 30 July. The addresses simply never left this screen,
        because this object never mentioned them. Same for sizes, what's
        inside, FAQ and trust badges: every one of them had a card, an editor
        and a state variable, and none of them reached the database.

        Always sent, even when empty — an empty array is how the owner says
        "I removed them all", and the API keeps them if the key is absent.
      */
      /*  ⚠️ Only real addresses. `photos` is seeded from the mock catalogue,
          whose "pictures" are CSS gradient strings — saving one would store
          `linear-gradient(...)` as an image address and the storefront would
          draw a broken-image icon where the product should be.  */
      images: photos.filter((u) => /^https?:\/\//i.test(u)).map((url) => ({ url })),
      /*  ⚠️ `sizes` ইচ্ছে করেই নেই — মালিক card-টা তুলে দিয়েছেন (২ আগস্ট
          ২০২৬)। না পাঠানো মানে API পুরনো মাপগুলো যেমন আছে তেমনই রাখে;
          খালি array পাঠালে সেগুলো প্রতিবার Publish-এ মুছে যেত।  */
      specRows: spec
        .filter((s) => s.item.trim())
        .map((s) => ({ item: s.item.trim(), qty: s.qty.trim() })),
      faqs: faqs
        .filter((f) => f.q.trim())
        .map((f) => ({ question: f.q.trim(), answer: f.a.trim() })),
      trustBadges: trust
        .filter((t) => t.label.trim())
        .map((t) => ({
          /*  DEC-PRD-031 — picker আর storefront এখন একই নাম ব্যবহার করে,
              তাই কেটে নেওয়ার কিছু নেই।  */
          icon: t.icon,
          /*  DEC-PRD-030 — category থেকে কপি করা upload-করা icon যেন
              হারিয়ে না যায়।  */
          iconUrl: t.iconUrl || null,
          label: t.label.trim(),
          sub: t.sub.trim() || null,
        })),
      /*  the owner pastes a full YouTube address; the page wants the id  */
      videoId: youtubeId(video),
      nationwideMsg: oz.trim() || null,
    };
  }

  async function handleSave(publish: boolean) {
    setSaveErr(null);
    if (!name.trim()) {
      setSaveErr("Give the product a name.");
      return;
    }
    const dto = buildDto(publish);
    if (!dto.categoryId) {
      setSaveErr("No category matched — set one in the Basics section.");
      return;
    }
    setSaving(true);
    try {
      if (apiProductId) {
        await updateProduct(apiProductId, dto);
      } else {
        dto.specRows = spec.filter((s) => s.item).map((s) => ({ item: s.item, qty: s.qty }));
        dto.faqs = faqs.filter((f) => f.q).map((f) => ({ question: f.q, answer: f.a }));
        dto.trustBadges = trust
          .filter((t) => t.label)
          .map((t) => ({ icon: t.icon.split(" ")[0] || "star", label: t.label, sub: t.sub || undefined }));
        const created = await createProduct(dto);
        // now that we have an id, link any upgrades chosen before saving
        /*  DEC-PRD-013 — save-এর সাথে সাথেই bundle-গুলো বসে যায়।
            ⚠️ ব্যর্থ হলে চুপ করে যায় না — কিন্তু পুরো save-ও ভেঙে দেয় না;
            product ততক্ষণে তৈরি, আর সেটা হারানোর চেয়ে একটা bundle না
            বসা কম ক্ষতি।  */
        /*  DEC-PRD-017 — একটাই bundle, তার ভেতরে সব কটা product, আর
            একটাই ছাড়। মালিকের নিয়ম: ছাড় বসে main সহ মোট দামের উপর।
            ⚠️ ব্যর্থ হলে পুরো save ভাঙে না — product ততক্ষণে তৈরি, আর
            সেটা হারানোর চেয়ে একটা bundle না বসা কম ক্ষতি।  */
        if (pendingBundles.length > 0) {
          await createBundle({
            productId: created.id,
            addsProductIds: pendingBundles.map((p) => p.id),
            label: pendingLabel.trim() || null,
            discountType: pendingDiscType,
            /*  FLAT = paisa · PERCENT = basis points — BundleEditor-এর
                হুবহু একই হিসাব, দুই জায়গায় দুই রকম হলে একদিন ১০% হয়ে
                যেত ০.১%।  */
            discountValue:
              pendingDiscType === "NONE" ? 0 : Math.round((Number(pendingDiscValue) || 0) * 100),
          }).catch(() => {});
        }
        for (const u of pendingUp) {
          await updateProduct(u.id, { upgradeOfProductId: created.id }).catch(() => {});
        }
      }
      router.push("/products");
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function autoSlug(v: string) {
    setName(v);
    setSlugV(
      v
        .toLowerCase()
        .replace(/—/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-"),
    );
  }
  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  /* which add-on groups will auto-attach to THIS product, from the rules on the
     Add-ons screen — computed live from the current category / occasion / zone /
     type so the editor shows exactly what the customer will be offered. */
  const matchedAddonGroups = useMemo(() => {
    if (!addonBundle) return [] as { name: string; addons: string[]; why: string }[];
    const has = (field: string, values: string[]) => {
      if (field === "CATEGORY") return values.includes(catName);
      if (field === "ZONE") return values.includes(zone);
      if (field === "PRODUCT_TYPE") return values.includes(ptype);
      /*  DEC-PRD-022 — এক তালিকা। occasion rule-গুলো slug ধরেই মেলে, আর
          বাছাই এখন `tagSel`-এ, তাই সেটাই দেখা হয়।  */
      if (field === "OCCASION") return tagSel.some((o) => values.includes(o));
      return false;
    };
    const groupById = new Map(addonBundle.groups.map((g) => [g.id, g]));
    const addonById = new Map(addonBundle.addons.map((a) => [a.id, a]));
    const seen = new Set<string>();
    const out: { name: string; addons: string[]; why: string }[] = [];
    addonBundle.rules
      .filter((r) => r.isActive && r.values.length && has(r.field, r.values))
      .forEach((r) => {
        const g = groupById.get(r.groupId);
        if (!g || seen.has(g.id)) return;
        seen.add(g.id);
        out.push({
          name: g.name,
          addons: g.addonIds.map((id) => addonById.get(id)?.name).filter(Boolean) as string[],
          why: `${r.field.toLowerCase()} matches ${r.values.filter((v) =>
            r.field === "OCCASION" ? tagSel.includes(v) : true,
          ).join(", ")}`,
        });
      });
    return out;
  }, [addonBundle, catName, zone, ptype, tagSel]);

  // products already linked as upgrades of THIS product
  const myUpgrades = useMemo(
    () => (apiProductId ? allProducts.filter((p) => p.upgradeOfProductId === apiProductId) : []),
    [allProducts, apiProductId],
  );

  /* link / unlink an upgrade right here — no trip to the Upgrade screen.
     the chosen product's upgradeOfProductId points at THIS product. */
  function linkUpgrade(prod: ApiProduct) {
    setUpPickerOpen(false);
    setUpPq("");
    if (apiProductId) {
      setAllProducts((prev) => prev.map((p) => (p.id === prod.id ? { ...p, upgradeOfProductId: apiProductId } : p)));
      updateProduct(prod.id, { upgradeOfProductId: apiProductId }).catch(() =>
        setAllProducts((prev) => prev.map((p) => (p.id === prod.id ? { ...p, upgradeOfProductId: null } : p))),
      );
    } else {
      // product not saved yet — remember it, link on create
      setPendingUp((prev) => (prev.some((x) => x.id === prod.id) ? prev : [...prev, prod]));
    }
  }
  function unlinkUpgrade(prod: ApiProduct) {
    if (apiProductId && prod.upgradeOfProductId) {
      setAllProducts((prev) => prev.map((p) => (p.id === prod.id ? { ...p, upgradeOfProductId: null } : p)));
      updateProduct(prod.id, { upgradeOfProductId: null }).catch(() => {});
    } else {
      setPendingUp((prev) => prev.filter((x) => x.id !== prod.id));
    }
  }

  // Pricing math
  const sellN = parseFloat(sell || "0");
  const costN = parseFloat(cost || "0");
  const dv = parseFloat(discVal || "0");

  /*
    DEC-PRD-028 — ছাড়টা এই মুহূর্তে চলছে কি না, আর সেটা এক লাইনে বলা।

    ⚠️ দিন ধরে তুলনা, ঘণ্টা ধরে নয়: শেষ তারিখ "১০ আগস্ট" মানে ১০ তারিখ
    দিনটাও ধরা — মালিক তাই বোঝেন, আর server-ও দিনের শেষ পর্যন্ত ধরে।

    ⚠️ `offer`-এর **আগে** থাকতেই হবে — নিচে নামালে "Cannot access
    'discLive' before initialization"। ২ আগস্ট এই ভুল দুইবার হয়েছে।
  */
  const discLive = (() => {
    const today = new Date().toISOString().slice(0, 10);
    if (discStart && discStart > today)
      return { on: false, text: `Starts ${discStart}` };
    if (discEnd && discEnd < today) return { on: false, text: `Ended ${discEnd}` };
    if (discEnd) return { on: true, text: `Running · ends ${discEnd}` };
    return { on: true, text: "Running · no end date" };
  })();

  /*
    ⚠️ তারিখ ফুরিয়ে গেলে এই পর্দাতেও ছাড় বসে না — server-এর `paidPaisa()`
    ঠিক এই নিয়মই চালায়। আগে বসত, ফলে admin ৳2,160 দেখাত অথচ দোকান
    ৳2,400 নিত। এক নিয়ম, দুই জায়গায় এক উত্তর।
  */
  const offer =
    discType === "NONE" || !discLive.on
      ? sellN
      : discType === "FLAT"
        ? Math.max(0, sellN - dv)
        : Math.max(0, Math.round(sellN * (1 - dv / 100)));

  const showDisc = offer < sellN && sellN > 0;
  const saved = Math.max(0, sellN - offer);
  const margin = offer - costN;
  const marginPct = offer > 0 ? Math.round((margin / offer) * 100) : 0;
  const leadN = parseInt(lead || "0");

  /*
    ═══════════════════════════════════════════════════════════════════════
    BUNDLE — Pricing tab-এর হিসাব। DEC-PRD-019, মালিক ২ আগস্ট ২০২৬।

    ⚠️ দুই অবস্থা, এক অঙ্ক। সংরক্ষিত product-এ তালিকা আর দাম server থেকে
    আসে (`bundleList`); নতুন product-এ সেগুলো এখনো এই পর্দাতেই বসে আছে
    (`pendingBundles`)। দুটোকে এক আকারে এনে একটাই হিসাব চালানো হয় —
    নাহলে "নতুন" আর "পুরনো" product-এ দুটো আলাদা সংখ্যা দেখাত।

    ⚠️ সব টাকা টাকায় (paisa নয়), কারণ এই পর্দার বাকি সব অঙ্ক টাকায় —
    `sellN`, `costN`, `offer`. একটা ঘরে paisa ঢুকলে সেটাই একদিন ১০০ গুণ
    ভুল দেখাত।
  */
  const bunItems = apiProductId
    ? (bundleList?.items ?? []).map((i) => ({
        id: i.id,
        name: i.name,
        price: i.alonePaisa / 100,
        cost: (i.costPaisa ?? 0) / 100,
      }))
    : pendingBundles.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.offerPricePaisa / 100,
        /*  নতুন product-এর পর্দায় খরচ জানা নেই — তালিকা থেকে যা আসে
            তাতে শুধু বিক্রয়মূল্য থাকে। Save করার পর server আসল খরচ
            পাঠায়। শূন্য ধরা মানে লাভ **বেশি** দেখাত, তাই লাভের লাইনটাই
            তখন দেখানো হয় না (নিচে `bunCostKnown`)।  */
        cost: 0,
      }));
  const bunCostKnown = !!apiProductId;
  const bunDiscType = apiProductId ? (bundleList?.discountType ?? "NONE") : pendingDiscType;
  const bunDiscVal = apiProductId
    ? (bundleList?.discountValue ?? 0) / 100
    : parseFloat(pendingDiscValue || "0");

  const bunItemsTotal = bunItems.reduce((n, i) => n + i.price, 0);
  const bunItemsCost = bunItems.reduce((n, i) => n + i.cost, 0);
  /*  ⚠️ base হিসেবে `offer` — product-এর নিজের ছাড় বসানোর পরের দাম।
      দুটো ছাড় পরপর বসে, আর সেটাই সৎ: গ্রাহক প্রথমটা এমনিতেই পান।  */
  const bunBefore = offer + bunItemsTotal;
  const bunAfter =
    bunDiscType === "NONE"
      ? bunBefore
      : bunDiscType === "FLAT"
        ? Math.max(0, bunBefore - bunDiscVal)
        : Math.max(0, Math.round(bunBefore * (1 - bunDiscVal / 100)));
  const bunSave = Math.max(0, bunBefore - bunAfter);
  const bunProfit = bunAfter - (costN + bunItemsCost);
  const bunProfitPct = bunAfter > 0 ? Math.round((bunProfit / bunAfter) * 100) : 0;

  /** Pricing tab-এর ছাড়টা বদলানো — তালিকা অক্ষত রেখে শুধু ছাড় লেখা হয় */
  function saveBundleDiscount(type: "NONE" | "FLAT" | "PERCENT", valueTaka: number) {
    if (!apiProductId) {
      setPendingDiscType(type);
      setPendingDiscValue(type === "NONE" ? "" : String(valueTaka));
      return;
    }
    const next = {
      ...(bundleList as ApiBundleList),
      discountType: type,
      discountValue: Math.round(valueTaka * 100),
    };
    setBundleList(next);
    saveBundleList({
      productId: apiProductId,
      addsProductIds: next.items.map((i) => i.id),
      discountType: type,
      discountValue: next.discountValue,
    })
      .then(setBundleList)
      .catch(() => {});
  }

  const previewBg =
    photos[0] ??
    detail?.gallery?.[0] ??
    src?.bg ??
    "linear-gradient(160deg,#F8E4E8,#EFC5CF)";
  const previewIsPhoto =
    previewBg.startsWith("data:") || previewBg.startsWith("http");
  /*  Live preview-এর ছোট চিহ্ন। DEC-DLV-008-এর পর এটাও বাছা নামগুলো থেকেই
      আসে — আগে `deliv` নামে একটা আলাদা তালিকা ছিল, আর সেটা তিনটা লেখা
      শব্দের উপর দাঁড়িয়ে ছিল।  */
  const pickedNames = delivTypes
    .filter((t) => delivTypeIds.includes(t.id))
    .map((t) => t.name.toLowerCase());
  const badge = pickedNames.some((n) => /midnight/.test(n))
    ? { t: "Midnight", i: "moon" }
    : pickedNames.some((n) => /hour|express/.test(n))
      ? { t: "2-Hour", i: "bolt" }
      : zone === "NATIONWIDE"
        ? { t: "Nationwide", i: "truck" }
        : null;

  /*
    ---- template loaders ----
    ⚠️ Trust badge আর "What's inside"-এর loader দুটো উঠে গেছে — DEC-PRD-023।
    ওগুলো এই ফাইলে হাতে লেখা preset থেকে সারি বানাত, আর মালিকের সেগুলো
    বদলানোর কোনো পর্দা ছিল না। এখন আসল উৎস Categories → "Product page —
    badges & what's inside"।

    FAQ-এর loader থাকছে: product-এর নিজের প্রশ্নগুলো লেখার সময় শুরু করার
    একটা জায়গা লাগে, আর category-র FAQ এমনিতেই নিচে যোগ হয় — কিছু চাপা
    পড়ে না।
  */
  const loadFaqTpl = () => {
    const d = tplFor(tplCat);
    if (d) setFaqs(d.faqs.map((f) => ({ q: f.q, a: f.a })));
  };
  const templateBar = (onLoad: () => void) => (
    <div className="flex items-center gap-2 mb-4 bg-lavender/60 rounded-[11px] p-2">
      <span className="text-[13px] text-body-soft px-1.5 font-medium">
        Template
      </span>
      <select
        className="ipt h-[38px] max-w-[260px]"
        value={tplCat}
        onChange={(e) => setTplCat(e.target.value)}
      >
        {CATEGORIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={onLoad}
        className="border border-lavender-deep bg-white text-[13px] px-3.5 py-2 rounded-[10px] hover:border-orchid text-purple font-medium"
      >
        Load
      </button>
      <span className="text-[13px] text-body-soft ml-1 hidden sm:block">
        load, then edit
      </span>
    </div>
  );

  return (
    <div className="px-6 md:px-8 pt-6 pb-24 max-w-[1650px]">
      {/* top bar */}
      <div className="sticky top-0 z-20 -mx-6 md:-mx-8 px-6 md:px-8 py-3.5 bg-lavender/85 backdrop-blur border-b border-lavender-deep flex items-center gap-3 mb-6">
        <Link
          href="/products/list"
          className="border border-lavender-deep bg-white text-body-soft hover:text-purple w-[38px] h-[38px] rounded-[11px] grid place-items-center shrink-0"
          title="Back"
        >
          <Icon name="chevronLeft" size={19} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] text-purple m-0 truncate leading-tight">
            {slug ? name || "Edit product" : "Add product"}
          </h1>
          <p className="text-body-soft text-[12.5px] m-0">
            {slug ? "Editing product" : "New product — fill in and publish"}
            {"  "}
            <span className="text-[#c0392b] font-bold">*</span>
            <span className="text-body-soft"> = Publish করতে লাগবে</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={saving}
          className="border border-lavender-deep bg-white text-[13.5px] px-4 py-2.5 rounded-[11px] font-medium hover:border-orchid text-purple disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          onClick={() => handleSave(true)}
          disabled={saving}
          className="bg-purple hover:bg-purple-deep text-white text-[13.5px] px-5 py-2.5 rounded-[11px] font-medium inline-flex items-center gap-2 shadow-soft disabled:opacity-50"
        >
          <Icon name="check" size={17} /> {saving ? "Saving…" : "Publish"}
        </button>
      </div>

      {saveErr && (
        <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-4 text-[13px]">
          {saveErr}
        </div>
      )}

      <div className="flex gap-6 items-start">
        {/* section nav */}
        <nav className="w-[196px] shrink-0 sticky top-[84px] hidden md:block">
          {SECTIONS.map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSec(id)}
              className={
                "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-[11px] text-[13.5px] mb-1 text-left transition-colors " +
                (sec === id
                  ? "bg-white text-purple font-medium shadow-soft border border-lavender-deep"
                  : "text-body-soft hover:bg-white/60 hover:text-purple")
              }
            >
              <Icon name={icon} size={18} />
              {label}
            </button>
          ))}
        </nav>

        {/* main column */}
        <div className="flex-1 min-w-0">
          {/* mobile section picker */}
          <div className="md:hidden mb-4">
            <select
              className="ipt h-[44px]"
              value={sec}
              onChange={(e) => setSec(e.target.value as SecId)}
            >
              {SECTIONS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* BASICS */}
          {/*
            ── BASICS, rebuilt 1 Aug 2026 ──────────────────────────────────
            Owner: "the basics page does not feel good — it should be clean
            and bold, so anyone working in it feels at ease."

            What was wrong was not the styling, it was that ten unrelated
            questions sat in one grid in one card, so the eye had nowhere to
            rest and nothing said which answers mattered. Now three cards,
            each one question:

              what it is called  →  where it sits  →  how it is sold

            The name is the headline of a page, so it is typed at headline
            size. Every field carries a chip saying where it ends up, because
            that was the owner's other question and the answer is only useful
            while the box is being filled in.
          */}
          {sec === "basics" && (
            <>
              <Card
                icon="tag"
                title="What the customer sees"
                hint="The words on the page and the address it lives at."
              >
                <div className="flex flex-col gap-8">
                  <Field
                    label={
                      <L
                        required
                        chip={
                          <Where
                            kind="live"
                            why="The heading on the product page, the name on every card, and the title Google shows."
                          >
                            On the page
                          </Where>
                        }
                      >
                        Product name
                      </L>
                    }
                    full
                  >
                    <input
                      className="ipt h-[58px] font-display text-[20px] px-4"
                      value={name}
                      onChange={(e) => autoSlug(e.target.value)}
                      placeholder="Velvet Red — 24 Premium Roses"
                    />
                  </Field>

                  <Field
                    label={
                      <L
                        chip={
                          <Where
                            kind="partial"
                            why="One line under the name on a product CARD — and only when there is nothing better to show there. Sales count, “New arrival” and made-to-order days all come first. It never appears on the product page itself."
                          >
                            On cards only
                          </Where>
                        }
                      >
                        Short description
                      </L>
                    }
                    full
                  >
                    <textarea
                      className="ipt"
                      rows={2}
                      value={shortDesc}
                      onChange={(e) => setShortDesc(e.target.value)}
                      placeholder="A dozen velvet-red roses, delivered in 2 hours."
                    />
                  </Field>

                  <Field
                    label={
                      <L
                        chip={
                          <Where
                            kind="live"
                            why="Made from the name. Changing it on a product people already have links to breaks those links."
                          >
                            The address
                          </Where>
                        }
                      >
                        Web address
                      </L>
                    }
                    full
                  >
                    <div className="flex items-stretch rounded-[11px] border border-lavender-deep overflow-hidden bg-white">
                      <span className="px-3.5 grid place-items-center text-[13px] text-body-soft bg-lavender/60 border-r border-lavender-deep whitespace-nowrap">
                        {WEB_HOST}/products/
                      </span>
                      <input
                        className="flex-1 min-w-0 h-[44px] px-3 text-[13.5px] outline-none"
                        value={slugV}
                        onChange={(e) => setSlugV(e.target.value)}
                      />
                    </div>
                  </Field>
                </div>
              </Card>

              <Card
                icon="grid"
                title="Where it sits in the shop"
                hint="This decides which pages it appears on — and what it inherits."
              >
                {/*  Two even columns: category pairs with sub-category, brand
                    pairs with SKU. Four boxes, two full rows, nothing left
                    hanging on a line of its own.  */}
                <div className={pairCls}>
                  <Field
                    label={
                      <L
                        required
                        chip={
                          <Where
                            kind="live"
                            why="Its breadcrumb, which category page it appears on, and where its bundles and “why buy from us” cards are inherited from."
                          >
                            On the page
                          </Where>
                        }
                      >
                        Category
                      </L>
                    }
                  >
                    <select
                      className="ipt h-[44px]"
                      value={topCatId}
                      onChange={(e) => {
                        setTopCatId(e.target.value);
                        setSubCatId("");
                      }}
                    >
                      <option value="" disabled>
                        Select a category…
                      </option>
                      {topCats.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={
                      <L
                        chip={
                          <Where
                            kind="live"
                            why="The middle step of the breadcrumb. Leave it empty and there simply isn’t one."
                          >
                            On the page
                          </Where>
                        }
                      >
                        Sub-category
                      </L>
                    }
                  >
                    <select
                      className="ipt h-[44px]"
                      value={subCatId}
                      onChange={(e) => setSubCatId(e.target.value)}
                      disabled={!topCatId || childCats.length === 0}
                    >
                      <option value="">— None —</option>
                      {childCats.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={
                      <L
                        chip={
                          <Where
                            kind="off"
                            why="Saved, but no page on the site reads it today. Fill it in only if you want the record for yourself."
                          >
                            Not shown yet
                          </Where>
                        }
                      >
                        Brand
                      </L>
                    }
                  >
                    <select
                      className="ipt h-[44px]"
                      value={brandId}
                      onChange={(e) => setBrandId(e.target.value)}
                    >
                      <option value="">— No brand —</option>
                      {apiBrands
                        .filter((b) => b.isActive || b.id === brandId)
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field
                    label={
                      <L
                        chip={
                          <Where
                            kind="staff"
                            why="Never printed on a page a customer reads. It DOES travel in machine data — the Google Merchant feed, the page's structured data, the analytics layer — because that is the identifier those expect for one product."
                          >
                            Not on the page
                          </Where>
                        }
                      >
                        SKU / product code
                      </L>
                    }
                  >
                    <input
                      className="ipt h-[44px] font-mono"
                      value={skuV}
                      onChange={(e) => setSkuV(e.target.value.toUpperCase())}
                      placeholder="ROSE-78"
                    />
                  </Field>
                </div>
              </Card>

              <Card
                icon="cash"
                title="How it is sold"
                hint="These change the rules, not the words."
              >
                {/*  The two toggles sit side by side because they are the same
                    kind of question — one of two things — and reading them as
                    a pair is faster than reading them as a stack.  */}
                <div className={pairCls}>
                  <Field
                    label={
                      <L
                        chip={
                          <Where
                            kind="live"
                            why="Draft means the product is not on the website at all — no page, no card, nothing."
                          >
                            The live switch
                          </Where>
                        }
                      >
                        Status
                      </L>
                    }
                  >
                    <Seg
                      value={status}
                      onChange={setStatus}
                      options={[
                        { v: "ACTIVE", label: "Active — on the website" },
                        { v: "DRAFT", label: "Draft — hidden" },
                      ]}
                    />
                  </Field>
                  <Field
                    label={
                      <L
                        chip={
                          <Where
                            kind="partial"
                            why="Nobody sees this. Made-to-order changes the cancellation and advance-payment rules, because a thing already made for one person cannot be sold to anybody else."
                          >
                            At checkout
                          </Where>
                        }
                      >
                        Product type
                      </L>
                    }
                  >
                    <Seg
                      value={ptype}
                      onChange={setPtype}
                      options={[
                        { v: "READYMADE", label: "Readymade" },
                        { v: "CRAFTED", label: "Crafted / made-to-order" },
                      ]}
                    />
                  </Field>
                  <Field
                    label={
                      <L
                        chip={
                          <Where
                            kind="live"
                            why="Printed small after the price — “৳2,400 / stick”. Leave it empty unless the measure is the point; “per piece” on a bouquet says nothing."
                          >
                            After the price
                          </Where>
                        }
                      >
                        Selling unit
                      </L>
                    }
                  >
                    <select
                      className="ipt h-[44px]"
                      value={unitId}
                      onChange={(e) => setUnitId(e.target.value)}
                    >
                      <option value="">— No unit —</option>
                      {apiUnits
                        .filter((u) => u.isActive || u.id === unitId)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.shortCode})
                          </option>
                        ))}
                    </select>
                  </Field>
                  {/*  DEC-PRD-032 — Bestseller আর New arrival। কলাম দুটো আর
                      homepage-এর তাক আগে থেকেই ছিল; admin-এ switch-ই ছিল না,
                      তাই কেউ কোনোদিন on করতে পারত না। ৩ আগস্টের নিরীক্ষায়
                      ধরা।  */}
                  <div className="flex flex-col gap-2 justify-center">
                    <Sw on={isBest} onToggle={() => setIsBest(!isBest)}>
                      Bestseller — shows on the Bestsellers shelf
                    </Sw>
                    <Sw on={isNew} onToggle={() => setIsNew(!isNew)}>
                      New arrival — shows the “New” tag
                    </Sw>
                  </div>
                </div>
              </Card>
            </>
          )}

          {/* PRICING */}
          {sec === "price" && (
            <>
              {/*
                ── PRICING, rebuilt 1 Aug 2026 ─────────────────────────────
                Owner, on the version before this: "too much text, scattered."

                What was wrong, precisely:
                  · three boxes each carrying a note, so six lines of small
                    grey text competed with three numbers
                  · three equal result panels, one of which showed "=" and
                    another "—" whenever there was no discount, so the
                    section's biggest object was mostly empty punctuation
                  · a two-line paragraph about coupons at the bottom, read
                    once and then in the way for ever

                Now: two numbers, one discount row, and ONE bold answer.
              */}
              <Card
                icon="cash"
                title="Pricing"
                hint="Everything in ৳. Coupons and campaigns live in Marketing — this is the everyday price."
              >
                <div className={pairCls}>
                  <Field
                    label={
                      <L
                        chip={
                          <Where
                            kind="staff"
                            why="What the product costs Radian. Used for your margin and never sent to the website in any form — not as text, not in data."
                          >
                            Never leaves
                          </Where>
                        }
                      >
                        Cost price
                      </L>
                    }
                  >
                    <input
                      className="ipt h-[52px] text-[17px] font-medium"
                      type="number"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      placeholder="1400"
                    />
                  </Field>
                  <Field
                    label={
                      <L
                        required
                        chip={
                          <Where
                            kind="live"
                            why="The everyday price, before any discount. With a discount set, this is the struck-through number the customer sees."
                          >
                            On the page
                          </Where>
                        }
                      >
                        Selling price
                      </L>
                    }
                  >
                    <input
                      className="ipt h-[52px] text-[17px] font-medium"
                      type="number"
                      value={sell}
                      onChange={(e) => setSell(e.target.value)}
                      placeholder="2450"
                    />
                  </Field>
                </div>

                <div className="mt-7">
                  <Field
                    label={
                      <L
                        chip={
                          <Where
                            kind="live"
                            why="Set one and the page draws the struck-through price and the “% OFF” badge. Set none and it draws neither — no invented savings."
                          >
                            On the page
                          </Where>
                        }
                      >
                        Discount
                      </L>
                    }
                  >
                    {/*  type and amount on one line — they are one decision,
                        and splitting them put the amount on its own row.  */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <Seg
                        value={discType}
                        onChange={setDiscType}
                        options={[
                          { v: "NONE", label: "None" },
                          { v: "FLAT", label: "৳ Flat" },
                          { v: "PCT", label: "% Off" },
                        ]}
                      />
                      {discType !== "NONE" && (
                        <div className="flex items-stretch rounded-[11px] border border-lavender-deep overflow-hidden bg-white">
                          <input
                            className="w-[110px] h-[44px] px-3 text-[15px] font-medium outline-none"
                            type="number"
                            value={discVal}
                            onChange={(e) => setDiscVal(e.target.value)}
                            placeholder={discType === "FLAT" ? "300" : "15"}
                          />
                          <span className="px-3.5 grid place-items-center text-[14px] font-medium text-body-soft bg-lavender/60 border-l border-lavender-deep">
                            {discType === "FLAT" ? "৳" : "%"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/*
                      ═══════════════════════════════════════════════════════
                      DEC-PRD-028 — মালিক, ৩ আগস্ট ২০২৬: *"আমরা যদি নির্দিষ্ট
                      product-এ কোনো offer চালাই like discount, তার timing
                      দেওয়ার জায়গা নেই — start date আর end date। যা frontend
                      আর admin panel একই সাথে দেখাবে আর কাজ করবে।"*

                      ⚠️ আগে ছাড় বসালে সেটা **চিরকাল** চলত। তিন দিনের একটা
                      offer মানে ছিল: তারিখ মনে রেখে চতুর্থ দিনে নিজে গিয়ে
                      মুছে দেওয়া। কেউ মনে রাখে না।

                      ⚠️ ঘর দুটো ছাড়ের **ভেতরে**, আলাদা card-এ নয় — তারিখ
                      ছাড়ের অংশ, আলাদা সিদ্ধান্ত নয়।
                      ═══════════════════════════════════════════════════════
                    */}
                    {discType !== "NONE" && (
                      <div className="mt-3 flex items-end gap-3 flex-wrap">
                        <Field label="Starts" note="Blank = right away">
                          <input
                            className="ipt h-[44px]"
                            style={{ width: 170 }}
                            type="date"
                            value={discStart}
                            onChange={(e) => setDiscStart(e.target.value)}
                          />
                        </Field>
                        <Field label="Ends" note="Blank = until you stop it">
                          <input
                            className="ipt h-[44px]"
                            style={{ width: 170 }}
                            type="date"
                            value={discEnd}
                            onChange={(e) => setDiscEnd(e.target.value)}
                          />
                        </Field>
                        {/*  ⚠️ অবস্থাটা লেখা থাকে, কারণ তারিখ দুটো দেখে
                            "এটা কি এখন চলছে?" মাথায় হিসাব করা যায় না —
                            আর সেই ভুলেই ছাড় না চলা অবস্থায় দাম কমেছে ভেবে
                            বসে থাকা যায়।  */}
                        <span
                          className={`text-[12.5px] font-semibold pb-2.5 ${
                            discLive.on ? "text-[#0f7d55]" : "text-[#b45309]"
                          }`}
                        >
                          {discLive.text}
                        </span>
                      </div>
                    )}
                  </Field>
                </div>

                {/*
                  ONE answer, not three panels. The customer's price is the
                  thing being decided, so it is the only thing at full size;
                  the old price and the margin sit beside it as supporting
                  facts and disappear entirely when there is nothing to say —
                  rather than standing there showing "—".
                */}
                <div className="mt-7 rounded-[16px] bg-lavender/70 border border-lavender-deep px-5 py-4 flex items-end gap-5 flex-wrap">
                  <div>
                    <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-body-soft">
                      Customer pays
                    </div>
                    <div className="font-display text-[34px] leading-[1.1] font-medium text-purple mt-1">
                      {taka(offer)}
                    </div>
                  </div>

                  {showDisc && (
                    <div className="flex items-center gap-2.5 pb-1.5">
                      <span className="text-[17px] line-through text-body-soft">
                        {taka(sellN)}
                      </span>
                      <span className="text-[12.5px] font-bold text-[#12693f] bg-[#e8f6ee] border border-[#bfe3cd] rounded-full px-2.5 py-1">
                        saves {taka(saved)}
                        {discType === "PCT" ? ` · ${dv || 0}%` : ""}
                      </span>
                    </div>
                  )}

                  {costN > 0 && (
                    <div className="ml-auto text-right pb-1">
                      <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-body-soft">
                        Your margin
                      </div>
                      <div
                        className={
                          "text-[19px] font-medium mt-0.5 " +
                          (margin < 0 ? "text-[#c0392b]" : "text-[#12693f]")
                        }
                      >
                        {taka(margin)} · {marginPct}%
                      </div>
                    </div>
                  )}
                </div>

                {/*  Only when it is actually true. A permanent warning is a
                    decoration; one that appears the moment you price below
                    cost is a warning.  */}
                {costN > 0 && margin < 0 && (
                  <div className="mt-3 flex items-start gap-2 text-[13px] text-[#c0392b]">
                    <span className="mt-[1px] shrink-0">
                      <Icon name="alert" size={15} />
                    </span>
                    <span>
                      This price is below what the product costs you — every sale
                      loses {taka(Math.abs(margin))}.
                    </span>
                  </div>
                )}
              </Card>

              <Card
                icon="lock"
                title="Payment rule"
                hint="Only for products you cannot afford to have cancelled."
              >
                <div className="flex flex-col gap-5">
                  <Sw on={advReq} onToggle={() => setAdvReq(!advReq)}>
                    Always take payment in advance
                  </Sw>
                  {/*
                    ⚠️ THREE CONTROLS IN A ROW, REDUCED TO TWO — 1 Aug 2026.
                    Choosing "Partial" used to open a second toggle (% or ৳)
                    AND a separate number box, so one question — "how much
                    upfront" — was spread across three boxes with three labels.
                    The amount and its unit are one control now, the same shape
                    as the discount field two cards up, so there is one idea to
                    learn instead of two.
                  */}
                  {advReq && (
                    <Field label="How much, upfront">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Seg
                          value={advType}
                          onChange={setAdvType}
                          options={[
                            { v: "FULL", label: "The whole price" },
                            { v: "PARTIAL", label: "Part of it" },
                          ]}
                        />
                        {advType === "PARTIAL" && (
                          <div className="flex items-stretch rounded-[11px] border border-lavender-deep overflow-hidden bg-white">
                            <input
                              className="w-[100px] h-[44px] px-3 text-[15px] font-medium outline-none"
                              type="number"
                              value={advPartVal}
                              onChange={(e) => setAdvPartVal(e.target.value)}
                              placeholder={advPartType === "PCT" ? "50" : "500"}
                            />
                            {/*
                              ⚠️ BOTH UNITS VISIBLE — corrected 1 Aug 2026.
                              This was one button showing the CURRENT unit,
                              which flipped when pressed. Compact, and wrong:
                              the owner read it as a label and reported that
                              the ৳ option had disappeared. A control nobody
                              can tell is a control is not a control — the
                              alternative has to be on screen, not one press
                              away behind a guess.
                            */}
                            <div className="flex border-l border-lavender-deep">
                              {(["PCT", "FLAT"] as const).map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => setAdvPartType(t)}
                                  className={
                                    "w-[46px] grid place-items-center text-[14px] font-semibold transition-colors " +
                                    (advPartType === t
                                      ? "bg-purple text-white"
                                      : "bg-lavender/50 text-body-soft hover:text-purple")
                                  }
                                >
                                  {t === "PCT" ? "%" : "৳"}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Field>
                  )}

                  {advReq && advType === "PARTIAL" && (
                    <div className="rounded-[16px] bg-lavender/70 border border-lavender-deep px-5 py-4 flex items-end gap-8 flex-wrap">
                      {(() => {
                        const v = parseFloat(advPartVal || "0");
                        const now =
                          advPartType === "PCT"
                            ? Math.round((offer * v) / 100)
                            : Math.min(offer, v);
                        const later = Math.max(0, offer - now);
                        return (
                          <>
                            <div>
                              <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-body-soft">
                                Pays now
                              </div>
                              <div className="font-display text-[26px] leading-[1.1] font-medium text-purple mt-1">
                                {taka(now)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-body-soft">
                                On delivery
                              </div>
                              <div className="font-display text-[26px] leading-[1.1] font-medium text-body mt-1">
                                {taka(later)}
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </Card>

              {/*
                ═══════════════════════════════════════════════════════════════
                WHAT THE CUSTOMER ACTUALLY PAYS — DEC-PRD-019, ২ আগস্ট ২০২৬

                মালিক: *"ami chai price tab sheshe thakuk and sekhanei price ar
                sob calculation hok."*

                ⚠️ এই card-টা কিছু **সিদ্ধান্ত নেয় না** — উপরের ঘরগুলো আর
                পরের tab-গুলোতে যা বসানো হয়েছে সেটাই এক জায়গায় দেখায়।
                দাম এখন আর একটা সংখ্যা নয়: রঙ/মাপে আলাদা দাম বসে, আর
                bundle-এর ছাড় main product সহ মোট দামের উপর বসে। তিন
                জায়গায় ছড়ানো থাকলে মালিক কোনোদিনই মোট ছবিটা দেখতেন না।
                ═══════════════════════════════════════════════════════════════
              */}
              <Card
                icon="cash"
                title="What the customer pays"
                hint="Everything that moves the price, in one place."
              >
                <div className="flex flex-col gap-2 text-[13.5px]">
                  <div className="flex items-center justify-between gap-3 py-1.5 border-b border-lavender-deep">
                    <span className="text-body-soft">This product</span>
                    <b className="font-semibold text-purple">{taka(offer)}</b>
                  </div>

                  {/*  রঙ/মাপে আলাদা দাম — খালি রাখা মানে product-এর দামই
                      চলে, তাই যেগুলোয় সত্যিই আলাদা সংখ্যা লেখা আছে শুধু
                      সেগুলোই দেখানো হয়।  */}
                  {variants.filter((v) => v.price.trim()).length > 0 && (
                    <div className="py-1.5 border-b border-lavender-deep">
                      <div className="text-body-soft mb-1">
                        With a different price of its own
                      </div>
                      {variants
                        .filter((v) => v.price.trim())
                        .map((v) => (
                          <div
                            key={v.variantValueId}
                            className="flex items-center justify-between gap-3 py-0.5"
                          >
                            <span className="text-body">{v.label}</span>
                            <b className="font-semibold text-purple">
                              {taka(parseFloat(v.price) || 0)}
                            </b>
                          </div>
                        ))}
                    </div>
                  )}

                  {variants.length > 0 && variants.every((v) => !v.price.trim()) && (
                    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-lavender-deep">
                      <span className="text-body-soft">
                        {variants.length} colours / sizes — all at this price
                      </span>
                      <b className="font-semibold text-purple">{taka(offer)}</b>
                    </div>
                  )}

                  {/*
                    ═══════════════════════════════════════════════════════════
                    BUNDLE — DEC-PRD-019, মালিক ২ আগস্ট ২০২৬:
                    *"price tab akhono variant tab bundle ar baki product tene
                    anche na. se oikhaner info tene anbe... discount dile
                    bundle product soho dekhabe koto discount koto amdr
                    profit."*

                    ⚠️ ছাড়ের ঘরটা এখন **এখানে**, Bundles card-এ নয়। যে
                    সংখ্যাটা লেখা হচ্ছে তার ফল ঠিক তার নিচেই দেখা যায় —
                    দুই পর্দায় ভাগ করলে মালিক কোনোদিন পুরো ছবিটা দেখতেন না।
                    ═══════════════════════════════════════════════════════════
                  */}
                  {bunItems.length === 0 ? (
                    <div className="py-1.5">
                      <span className="text-body-soft">
No bundle products yet — add them on{" "}
                        <b className="font-semibold text-purple">Variants &amp; options</b>.
                      </span>
                    </div>
                  ) : (
                    <div className="pt-1.5">
                      <div className="text-body-soft mb-1">
                        If they also take everything in the bundle
                      </div>
                      {bunItems.map((i) => (
                        <div
                          key={i.id}
                          className="flex items-center justify-between gap-3 py-0.5"
                        >
                          <span className="text-body truncate">{i.name}</span>
                          <span className="text-body-soft shrink-0">+ {taka(i.price)}</span>
                        </div>
                      ))}

                      <div className="flex items-center justify-between gap-3 py-1.5 mt-1 border-t border-lavender-deep">
                        <span className="text-body-soft">Everything together</span>
                        <b className="font-semibold text-purple">{taka(bunBefore)}</b>
                      </div>

                      {/* ── the one discount, and its answer right below ── */}
                      <div className="flex items-center gap-2.5 flex-wrap py-2">
                        <span className="text-body-soft">Bundle discount</span>
                        <select
                          className="ipt h-[38px]"
                          style={{ width: 130 }}
                          value={bunDiscType}
                          onChange={(e) =>
                            saveBundleDiscount(
                              e.target.value as "NONE" | "FLAT" | "PERCENT",
                              bunDiscVal,
                            )
                          }
                        >
                          <option value="NONE">No discount</option>
                          <option value="FLAT">৳ off</option>
                          <option value="PERCENT">% off</option>
                        </select>
                        <input
                          /*  ⚠️ প্রস্থটা inline style-এ — `.ipt` নিজে
                              `width:100%` বসায় আর সেটা Tailwind-এর পরে load
                              হয়, তাই `w-[100px]` চুপচাপ হারিয়ে যেত।  */
                          className="ipt h-[38px]"
                          style={{ width: 100 }}
                          type="number"
                          min={0}
                          disabled={bunDiscType === "NONE"}
                          placeholder={bunDiscType === "PERCENT" ? "10" : "50"}
                          value={bunDiscType === "NONE" ? "" : bunDiscVal || ""}
                          onChange={(e) =>
                            saveBundleDiscount(bunDiscType, Number(e.target.value) || 0)
                          }
                        />
                      </div>

                      <div className="rounded-[14px] bg-lavender/60 border border-lavender-deep px-3.5 py-3 flex items-center justify-between gap-4 flex-wrap">
                        <div>
                          <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-body-soft">
                            Customer pays
                          </div>
                          <div className="font-display text-[24px] leading-[1.1] font-medium text-purple mt-1">
                            {taka(bunAfter)}
                          </div>
                          {bunSave > 0 && (
                            <div className="text-[12.5px] text-[#0f7d55] font-semibold mt-0.5">
                              saves {taka(bunSave)}
                            </div>
                          )}
                        </div>
                        {/*  ⚠️ লাভ তখনই দেখানো হয় যখন খরচ সত্যিই জানা।
                            নতুন product-এর পর্দায় bundle-এর জিনিসগুলোর খরচ
                            আসে না, আর শূন্য ধরে দেখালে লাভ বেশি দেখাত —
                            আর সেই সংখ্যা দেখে দাম ঠিক করা হতো।  */}
                        {bunCostKnown && costN > 0 && (
                          <div className="text-right">
                            <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-body-soft">
                              Your profit
                            </div>
                            <div
                              className={`font-display text-[24px] leading-[1.1] font-medium mt-1 ${
                                bunProfit >= 0 ? "text-[#0f7d55]" : "text-[#c0392b]"
                              }`}
                            >
                              {taka(bunProfit)}
                            </div>
                            <div className="text-[12.5px] text-body-soft mt-0.5">
                              {bunProfitPct}% · cost {taka(costN + bunItemsCost)}
                            </div>
                          </div>
                        )}
                      </div>

                      <p className="text-[12.5px] text-body-soft mt-2 mb-0">
      One is enough for the discount. None, and they pay {taka(offer)}.
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            </>
          )}

          {/* STOCK */}
          {sec === "stock" && (
            <>
              {/*
                ── WHO PROVIDES IT — asked first, 1 Aug 2026 ────────────────
                Owner's ruling. A vendor product is not a third way of counting
                stock; it is the absence of stock. Radian holds none of it,
                never makes an Item for it, and it never appears in a
                stocktake. So the question comes before the counting question,
                and answering "a vendor" removes the counting question
                entirely.
              */}
              <Card
                icon="truck"
                title="Who provides this?"
              >
                <Seg
                  value={supplierId ? "VENDOR" : "OURS"}
                  onChange={(v) => {
                    if (v === "OURS") setSupplierId(null);
                    else setSupplierId(vendors[0]?.id ?? null);
                  }}
                  options={[
                    { v: "OURS", label: "We do" },
                    { v: "VENDOR", label: "A vendor does" },
                  ]}
                />

                {supplierId && (
                  <div className="mt-5">
                    <Field
                      label={
                        <L
                          chip={
                            <Where
                              kind="staff"
                              why="They make it when an order comes in. Their commission, delivery cost, return and payment rules are all configured on them, in the vendor module — not here."
                            >
                              Vendor module
                            </Where>
                          }
                        >
                          Which vendor
                        </L>
                      }
                    >
                      <select
                        className="ipt h-[48px] max-w-[420px]"
                        value={supplierId}
                        onChange={(e) => setSupplierId(e.target.value)}
                      >
                        {vendors.length === 0 && <option value="">— no vendors yet —</option>}
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.nickname ? `${v.nickname} — ${v.name}` : v.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <div className="mt-4 flex items-start gap-2.5 rounded-[12px] bg-[#fff6e5] border border-[#f0d9a8] px-4 py-3 text-[13px] text-[#8a5a00]">
                      <span className="mt-[1px] shrink-0">
                        <Icon name="alert" size={15} />
                      </span>
                      <span>
                        No stock is kept for this product and no stockroom item is
                        needed. When an order arrives the vendor is told what to make —
                        never anything about the customer. The money is split by the
                        commission set on{" "}
                        <Link href="/suppliers" className="font-semibold hover:underline">
                          their vendor page
                        </Link>
                        .
                      </span>
                    </div>

                    {vendors.length === 0 && (
                      <p className="text-[13px] text-body-soft mt-3 mb-0">
                        No vendors yet —{" "}
                        <Link
                          href="/suppliers/vendors/new"
                          className="text-orchid font-medium hover:underline"
                        >
                          add one
                        </Link>{" "}
                        first.
                      </p>
                    )}
                  </div>
                )}
              </Card>
              {/*  everything below is only asked when the product is OURS —
                  a vendor keeps none of it  */}
              {!supplierId && (
              <>

              <Card
                icon="box"
                title="Stock"
              >
                {/*
                  ⚠️ FLEX, NOT `pairCls` — 1 Aug 2026. The two-column grid is
                  right when there are reliably two fields, and here there are
                  not: on Tracked, "How many you have" disappears (the
                  stockroom owns the number) and the toggle was left sitting in
                  a half-width column with an empty half beside it. That gap is
                  a large part of what made the tab read as unfinished.
                  Flex lets one field simply be one field.
                */}
                <div className="flex flex-wrap items-start gap-x-12 gap-y-7">
                  <Field
                    label={
                      <L
                        chip={
                          <Where
                            kind="staff"
                            why="Manual means you type the number and each order takes one off. Tracked means the Inventory module keeps it — receiving, issuing and stocktakes move it instead of you."
                          >
                            Staff
                          </Where>
                        }
                      >
                        Stock mode
                      </L>
                    }
                  >
                    {/*
                      ⚠️ SELECTABLE, NOT DISABLED — corrected 1 Aug 2026.
                      I read "tracking must not be on by default" as "tracking
                      must not be available", and greyed the option out. The
                      owner meant the first: MANUAL is where a product starts,
                      and switching to TRACKED is his to make. Refusing the
                      choice is not the same as not making it for him.

                      What is honest to say is what it does TODAY, and that
                      goes in the note below rather than in a locked button.
                    */}
                    <Seg
                      value={stockMode}
                      onChange={setStockMode}
                      options={[
                        { v: "MANUAL", label: "Manual" },
                        { v: "TRACKED", label: "Tracked" },
                      ]}
                    />
                  </Field>

                  {/*
                    ═══════════════════════════════════════════════════════════
                    DEC-PRD-014 — মালিক, ২ আগস্ট ২০২৬: *"variant থাকলে
                    variant-এর stock-ই চলবে, product-এর ঘরটা তখন যোগফল
                    দেখাবে।"*

                    ⚠️ ঘরটা লুকানো হয় না, **তালা দেওয়া হয়**। লুকিয়ে দিলে
                    মালিক ভাবতেন এই product-এর মজুদ কোথাও গোনাই হচ্ছে না।
                    সংখ্যাটা দেখিয়ে "কোথা থেকে এল" লিখে দিলে এক নজরেই
                    বোঝা যায় — আর দুই জায়গায় দুটো সংখ্যা লেখার সুযোগই
                    থাকে না।
                    ═══════════════════════════════════════════════════════════
                  */}
                  {stockMode === "MANUAL" && variants.length > 0 && (
                    <Field label={<L>How many you have</L>}>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="inline-flex items-center h-[46px] px-4 rounded-[12px] bg-lavender/60 border border-lavender-deep text-[15px] font-semibold text-purple">
                          {variants.reduce((n, v) => n + (parseInt(v.stockQty, 10) || 0), 0)} pcs
                        </span>
                        <span className="text-[13px] text-body-soft">
                          Counted per colour in{" "}
                          <b className="font-semibold text-purple">Variants &amp; options</b> —{" "}
                          {variants.map((v) => `${v.label} ${parseInt(v.stockQty, 10) || 0}`).join(" · ")}
                        </span>
                      </div>
                    </Field>
                  )}

                  {stockMode === "MANUAL" && variants.length === 0 && (
                    <Field
                      label={
                        <L
                          chip={
                            <Where
                              kind="partial"
                              why="The number itself is never sent to the website unless the switch below is on. What it always does is decide whether the product can be bought at all — at zero it is out of stock."
                            >
                              {/*  amber, so the word must be the amber word.
                                   Green "Live" beside amber "Live" teaches
                                   nothing — the colour would be doing all the
                                   work and the reader would stop trusting it. */}
                              Sometimes
                            </Where>
                          }
                        >
                          How many you have
                        </L>
                      }
                    >
                      {/*  Same box shape as the making-time fields, unit and
                          all. Three number boxes on one tab that look alike
                          get read alike — and the unit inside is what stops
                          "25" being typed into the wrong one.  */}
                      <NumBox
                        value={stock}
                        onChange={setStock}
                        unit="pcs"
                        width="w-[168px]"
                        placeholder="0"
                      />
                    </Field>
                  )}
                </div>

                {/*
                  ⚠️ OFF BY DEFAULT — owner's instruction, 1 Aug 2026.
                  It used to start ON, so every product ever created announced
                  its exact count to customers unless somebody remembered to
                  turn it off. "Only 3 left" is a selling tool when you mean it
                  and an embarrassment when you do not, and it is the one
                  number on the page that changes without anyone editing
                  anything. A claim that loud has to be switched on
                  deliberately, per product.
                */}
                {/*
                  ── REAL INVENTORY → which item ─────────────────────────────
                  ⚠️ THIS WAS A CARD OF ITS OWN AND THE OWNER ASKED WHY IT WAS
                  THERE AT ALL (1 Aug 2026). Fair: it stood above the stock
                  mode and asked a question that only means anything AFTER
                  "from inventory" has been chosen. I had pulled it out when
                  the vendor link lived here — now that "who provides this" is
                  its own question at the top, it belongs back inside.

                  ⚠️ Searched by SKU, LINKED by id — DEC-ITM-021 forbids joining
                  the two by matching SKU text.
                */}
                {stockMode === "TRACKED" && (
                  <div className="mt-6 pt-6 border-t border-lavender-deep">
                    {linkedItem ? (
                      <div className="rounded-[14px] border border-lavender-deep bg-lavender/40 p-4">
                        <div className="flex items-start gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-body-soft">
                              Linked stockroom item
                            </div>
                            <div className="text-[15px] font-medium text-purple mt-1">
                              {linkedItem.name}
                            </div>
                            <div className="text-[13px] text-body-soft font-mono mt-0.5">
                              {linkedItem.sku}
                            </div>
                          </div>

                          {/*  Only when the stockroom is the source. On Manual
                              the owner's own number is the truth and showing a
                              second one beside it invites the question of
                              which is right.  */}
                          <div className={stockMode === "TRACKED" ? "text-right" : "hidden"}>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-body-soft">
                              In stock now
                            </div>
                            <div className="font-display text-[24px] font-medium text-purple mt-1 leading-none">
                              {itemStock
                                ? itemStock.mode === "CAN_BUILD"
                                  ? `can build ${itemStock.canBuild ?? 0}`
                                  : itemStock.mode === "NA"
                                    ? "n/a"
                                    : Math.round(itemStock.totalQtyMilli / 1000)
                                : "…"}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setItemId(null);
                              setLinkedItem(null);
                              setItemQ("");
                            }}
                            className="text-[13px] text-body-soft hover:text-[#c0392b] border border-lavender-deep bg-white rounded-[10px] px-3 py-2"
                          >
                            Change
                          </button>
                        </div>

                        {/*  DEC-SUP-004 — the vendor badge the pending list
                            calls G1. It is a fact about the Item, shown here,
                            never a second thing to choose.  */}
                        {linkedItem.supplier && (
                          <div className="mt-3.5 pt-3.5 border-t border-lavender-deep flex items-center gap-2.5 flex-wrap text-[13px]">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-[3px] rounded-full border bg-[#fff6e5] text-[#8a5a00] border-[#f0d9a8]">
                              Vendor product
                            </span>
                            <b className="font-medium text-purple">
                              {linkedItem.supplier.nickname || linkedItem.supplier.name}
                            </b>
                            {linkedItem.supplier.leadTimeHours ? (
                              <span className="text-body-soft">
                                · needs {linkedItem.supplier.leadTimeHours}h notice
                              </span>
                            ) : null}
                            <span className="text-body-soft">
                              ·{" "}
                              {linkedItem.supplier.notifyChannel === "OFF"
                                ? "no messaging set up"
                                : `${linkedItem.supplier.notifyChannel === "WHATSAPP" ? "WhatsApp" : "SMS"}, sent by hand`}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Field
                        label={
                          <L
                            chip={
                              <Where
                                kind="staff"
                                why="Search by the stockroom code or the item name. This is Item.sku, which is NOT the product code on the Basics tab — two codes on purpose, joined by this link and never by matching the text."
                              >
                                The stockroom link
                              </Where>
                            }
                          >
                            Which item is this?
                          </L>
                        }
                      >
                        <div className="flex items-center gap-3 flex-wrap">
                          <input
                            className="ipt h-[48px] flex-1 min-w-[220px]"
                            value={itemQ}
                            onChange={(e) => setItemQ(e.target.value)}
                            placeholder="Search by item code or name…"
                          />
                          {/*
                            ⚠️ THE MISSING DOOR — owner, 1 Aug: "I could not
                            find any option to add a vendor product."

                            Nothing was broken; the path simply ran through
                            three screens with no sign anywhere: make the
                            vendor in Suppliers, make the Item and pick that
                            vendor on it, then come back here. A route that
                            exists and is not signposted is, to the person
                            using it, a route that does not exist.

                            The item's name is carried across so the same
                            words are not typed twice.
                          */}
                          <Link
                            href={`/items/new?name=${encodeURIComponent(name)}`}
                            className="inline-flex items-center gap-2 text-[13.5px] font-medium text-purple border border-lavender-deep bg-white rounded-[11px] px-4 h-[48px] hover:border-orchid transition-colors whitespace-nowrap"
                          >
                            <Icon name="plus" size={15} /> New item
                          </Link>
                        </div>
                        <div className="mt-2 border border-lavender-deep rounded-[12px] bg-white overflow-hidden">
                          {itemBusy && itemHits.length === 0 && (
                            <div className="px-3.5 py-3 text-[13px] text-body-soft">Looking…</div>
                          )}
                          {!itemBusy && itemHits.length === 0 && (
                            <div className="px-3.5 py-3.5 text-[13px] text-body-soft">
                              <b className="block text-purple font-medium mb-1">
                                No item matches “{itemQ || "…"}”.
                              </b>
                              Selling someone else&rsquo;s product? Make the vendor in{" "}
                              <Link
                                href="/suppliers/vendors/new"
                                className="text-orchid font-medium hover:underline"
                              >
                                Suppliers
                              </Link>{" "}
                              first, then press <b className="text-purple font-medium">New item</b>{" "}
                              and choose them on it. The vendor then appears here by itself.
                            </div>
                          )}
                          {itemHits.map((it) => (
                            <button
                              key={it.id}
                              type="button"
                              onClick={() => {
                                setItemId(it.id);
                                setLinkedItem({
                                  id: it.id,
                                  sku: it.sku,
                                  name: it.name,
                                  isStockTracked: it.isStockTracked,
                                  supplier: it.supplier
                                    ? {
                                        id: it.supplier.id,
                                        name: it.supplier.name,
                                        nickname: it.supplier.nickname ?? null,
                                        notifyChannel: "OFF",
                                        notifyMode: "MANUAL",
                                        leadTimeHours: null,
                                      }
                                    : null,
                                });
                              }}
                              className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left border-b border-lavender-deep last:border-0 hover:bg-lavender/60 transition-colors"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-[13.5px] font-medium text-purple truncate">
                                  {it.name}
                                </div>
                                <div className="text-[12.5px] text-body-soft font-mono">
                                  {it.sku}
                                </div>
                              </div>
                              {it.supplier && (
                                <span className="text-[11px] font-semibold px-2 py-[3px] rounded-full border bg-[#fff6e5] text-[#8a5a00] border-[#f0d9a8] shrink-0">
                                  {it.supplier.nickname || it.supplier.name}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </Field>
                    )}

                    {/*  Honest about the half that is not built: the message
                        itself. Fields, phone and lead time are all in place;
                        there is no SMS/WhatsApp gateway, so nothing sends
                        itself yet (PENDING F11).  */}
                    {linkedItem?.supplier && (
                      <p className="text-[13px] text-body-soft mt-3 mb-0">
                        When an order comes in, the vendor still has to be messaged by
                        hand from their supplier page. Automatic sending waits on the
                        WhatsApp gateway.
                      </p>
                    )}
                                    </div>
                )}
                {/*
                  ── WHAT THE WEBSITE IS TOLD, AND WHAT HAPPENS AT ZERO ──────
                  ⚠️ REBUILT TWICE ON 1 Aug 2026 AND THE SECOND REASON MATTERS
                  MORE. First pass: these were loose blocks in the wrong order —
                  a full-width box asking "show a different number" sat ABOVE
                  the switch deciding whether any number shows at all. Fixed by
                  framing them into panels.

                  The owner then looked at the panels and said the tab was
                  drowning in text, and that the right-hand side jumped about
                  when he clicked. Both true. Every panel had a kicker, a title,
                  an explanation AND a coloured result box; and the control's
                  position depended on how long the sentence beside it was.

                  Now: plain rows. Name left, control right at a fixed width,
                  ONE line underneath that says what the page will actually
                  print. The reasoning moved into the `?` tooltips, where it
                  costs nothing until somebody wants it.

                  ── the two counters, kept from the original note ────────────
                  The shown number and the real one are allowed to differ. Real
                  5,000, shown 20. HE WAS TOLD THIS IS NOT TRUE AND CHOSE IT
                  KNOWINGLY, for urgency — his shop, his risk. The one thing
                  built in his favour is that the shown number COUNTS DOWN.

                    shown — the promise. Falls when an order is placed.
                    real  — the physical thing. Falls at delivery.
                */}
                <div className="mt-7 pt-1 border-t border-lavender-deep">
                  <Row
                    label="Show how many are left"
                    chip={
                      <Where
                        kind="live"
                        why="Off by default, per product. It used to start on, so every product announced its exact count unless somebody remembered to turn it off. Only shown when it is low — 5 or fewer — because a big number creates no urgency and tells competitors what you hold."
                      >
                        Live
                      </Where>
                    }
                    hint={
                      showStock
                        ? (() => {
                            const n =
                              displayQty.trim() !== ""
                                ? Number(displayQty)
                                : Number(stock);
                            if (!Number.isFinite(n) || n <= 0)
                              return (
                                <span className="text-[#8a5a00]">
                                  At 0 the badge disappears
                                </span>
                              );
                            if (n <= 5)
                              return (
                                <>
                                  Page shows{" "}
                                  <b className="font-semibold text-[#8a5a00]">
                                    &ldquo;Only {n} left&rdquo;
                                  </b>
                                </>
                              );
                            return (
                              <>
                                Page shows{" "}
                                <b className="font-semibold text-[#12693f]">
                                  &ldquo;{n} in stock&rdquo;
                                </b>
                              </>
                            );
                          })()
                        : "The page never mentions it"
                    }
                  >
                    <Sw on={showStock} onToggle={() => setShowStock(!showStock)}>
                      {showStock ? "On" : "Off"}
                    </Sw>
                  </Row>

                  {showStock && (
                    <Row
                      label="Show a different number"
                      chip={
                        <Where
                          kind="live"
                          why="Leave it empty and the website shows the real number. Put a number here and the website shows THAT instead — it falls as orders come in, and the real stock is untouched until delivery."
                        >
                          Live
                        </Where>
                      }
                    >
                      <NumBox
                        value={displayQty}
                        onChange={setDisplayQty}
                        /*  "pcs", not "shown" — the suffix names the UNIT,
                            never the field's job.  */
                        unit="pcs"
                        placeholder="real"
                      />
                    </Row>
                  )}

                  {/*
                    DEC-PDP-09 — "stock 0 হলে order দেওয়া যাবে না। হয় stock out
                    আসবে, বা pre-order আসবে।"

                    ⚠️ ONLY WHEN THE NUMBER ABOVE MEANS SOMETHING. A vendor
                    product holds none of our stock and a Tracked one is counted
                    in the Item module — for both, `stockQty` is not the truth,
                    so this would be a question about a number that never moves.
                  */}
                  {stockMode === "MANUAL" && !supplierId && (
                    <>
                      <Row
                        label="When it runs out"
                        chip={
                          <Where
                            kind="live"
                            why="At zero the website refuses the order either way — this only decides which of the two things the customer is told: a closed door, or a later date. Pre-order money follows the product's own advance rule in Pricing; there is no separate setting."
                          >
                            Live
                          </Where>
                        }
                        hint={
                          soldOutMode === "PRE_ORDER" ? (
                            "Orders keep coming, customer is told"
                          ) : (
                            <>
                              Page shows{" "}
                              <b className="font-semibold text-[#8a5a00]">
                                &ldquo;Out of stock&rdquo;
                              </b>
                            </>
                          )
                        }
                      >
                        <Seg
                          value={soldOutMode}
                          onChange={setSoldOutMode}
                          options={[
                            { v: "STOCK_OUT", label: "Stock out" },
                            { v: "PRE_ORDER", label: "Pre-order" },
                          ]}
                        />
                      </Row>

                      {soldOutMode === "PRE_ORDER" && (
                        <Row
                          label="Expected back on"
                          chip={
                            <Where
                              kind="live"
                              why="Printed under the Pre-order button. Leave it empty and the page just says Pre-order with no date — better than a date you are not sure of. A date that has already passed is dropped automatically."
                            >
                              Live
                            </Where>
                          }
                          hint={
                            /*  ⚠️ A DATE THAT HAS GONE PAST IS NOT SHOWN. The
                                owner chose to type dates himself, and the honest
                                cost is that one day a date goes stale. "back on
                                12 July" read in August does more damage than
                                silence. Said here so it is never a surprise.  */
                            preorderDate &&
                            new Date(preorderDate).getTime() <= Date.now() ? (
                              <span className="text-[#8a5a00]">
                                That date has passed — it will be hidden
                              </span>
                            ) : preorderDate ? (
                              "Shown under the Pre-order button"
                            ) : (
                              "Optional — empty promises no date"
                            )
                          }
                        >
                          <input
                            className="ipt h-[54px] w-[200px] text-[16px] font-semibold"
                            type="date"
                            value={preorderDate}
                            onChange={(e) => setPreorderDate(e.target.value)}
                          />
                        </Row>
                      )}
                    </>
                  )}
                </div>
              </Card>

              {/*
                ── TWO CLOCKS, AND THEY ARE NOT THE SAME CLOCK ───────────────
                Owner, 1 Aug 2026: *"day and time-এর ঘর বোঝার উপায় নাই, কোনটা
                day আর কোনটা time"*.

                He was right, and the fault was not the wording — both
                questions were dressed identically. Two bare number boxes, two
                labels above them, nothing INSIDE either box saying what it
                measured. Read quickly, "Minutes to make one" and "Days to make
                it" are the same shape, and somebody types 3 meaning three days
                into the minutes box.

                Two things tell them apart now, and neither is a sentence:
                  · the unit lives inside the field — MIN · DAYS
                  · a two-word kicker names WHICH CLOCK above the label

                ⚠️ NO FRAMES, NO RESULT BOXES. The first fix used framed panels
                with coloured result boxes and the owner said the tab was
                drowning in text. The result is now one short line where the
                explanation used to be — it replaces the prose rather than
                adding to it.

                The title changed too: "Made to order" described only the first
                half; the second half applies to anything with a wait.
              */}
              <Card
                icon="clock"
                title="How long it takes"
              >
                {/*
                  Owner's decision, 1 Aug 2026: minutes, not size bands — the
                  guess about which band a 40-minute job belongs in IS the
                  error. Empty means nothing has to be made, so it costs the
                  workshop no time and can never be refused for a full day.
                */}
                <Row
                  kicker="Workshop time"
                  label="How long one takes to make"
                  chip={
                    <Where
                      kind="staff"
                      why="Daily capacity counts in these minutes, against the day's hours for the team that makes this category. Leave it empty for anything taken off a shelf — that costs no making time and can never be refused for a full day."
                    >
                      Staff
                    </Where>
                  }
                  hint={(() => {
                    const m = parseInt(makeMinutes || "0") || 0;
                    if (m <= 0) return "Nothing to make — takes none of the day";
                    const h = Math.floor(m / 60);
                    const r = m % 60;
                    const t =
                      h === 0
                        ? `${r} minutes`
                        : r === 0
                          ? `${h} hour${h > 1 ? "s" : ""}`
                          : `${h}h ${r}m`;
                    return `${t} of the day, each one`;
                  })()}
                >
                  <NumBox
                    value={makeMinutes}
                    onChange={setMakeMinutes}
                    unit="min"
                    placeholder="0"
                  />
                </Row>

                {/*
                  ⚠️ THIS CHIP WAS A LIE FOR ABOUT AN HOUR, 1 Aug 2026, AND THE
                  HOUR IS THE POINT. It said "Moves the date" in green while
                  nothing on the website read `leadTimeDays` — the API sent it,
                  `apps/web` ignored it, and a 3-day bouquet was offered 2-hour
                  express. The field was describing what it is FOR, not what it
                  DOES. It went grey — "Not on the site yet" — the moment that
                  was found, and green again only once the checkout actually
                  consulted it (DEC-PDP-10).

                  Leave it that way round. A form that overstates itself is
                  worse than one that says nothing: the owner fills the box,
                  trusts it, and hears about it from a customer.
                */}
                <Row
                  kicker="Delivery date"
                  label="Days before it can go out"
                  chip={
                    <Where
                      kind="live"
                      why="Checkout closes the first days on the date strip, greys out 2-Hour Express and Same Day with the reason, and slides the courier window. Capacity uses it too: a job spanning days spreads its minutes across them."
                    >
                      Live
                    </Where>
                  }
                  hint={
                    leadN > 0 ? (
                      <span className="text-[#8a5a00]">
                        Checkout closes the first {leadN} day
                        {leadN === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="text-[#12693f]">
                        Ready today — can go out the same day
                      </span>
                    )
                  }
                >
                  <NumBox value={lead} onChange={setLead} unit="days" />
                </Row>
              </Card>
              </>
              )}
            </>
          )}

          {/* MEDIA */}
          {sec === "media" && (
            <>
              <Card
                icon="photo"
                title={<>Photos<Req /></>}
                hint="Square photos, 1:1. Drag to reorder — the first is the main image. Publish করার আগে অন্তত একটা ছবি লাগবে।"
              >
                {/*
                  ── THREE FAULTS FIXED HERE, 1 Aug 2026 ─────────────────────

                  1. `photos.slice(0, 6)` DREW ONLY THE FIRST SIX while the
                     uploader accepted twelve and `buildDto` saved all of them.
                     Photos 7-12 went to the database, appeared on the website,
                     and could not be seen or deleted from this screen. One
                     constant now — MAX_PHOTOS — read by both.

                  2. The upload limit check was a constant expression, so a
                     large selection silently uploaded NOTHING. See `addPhotos`.

                  3. NO WAY TO CHOOSE THE MAIN PHOTO. The first is the main
                     image — card, search result, WhatsApp preview — and the
                     only way to change it was to delete everything and upload
                     again in order. Drag to reorder now, and a one-click
                     "Make main" for the intent people actually have: it is
                     rarely about 4th versus 5th, it is about which is first.
                */}
                <div className="flex gap-3 flex-wrap">
                  {photos.map((g, i) => (
                    <div
                      key={g + i}
                      draggable
                      onDragStart={() => setDragIdx(i)}
                      onDragEnd={() => setDragIdx(null)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragIdx !== null) movePhoto(dragIdx, i);
                        setDragIdx(null);
                      }}
                      className={`relative group cursor-grab active:cursor-grabbing transition-opacity ${
                        dragIdx === i ? "opacity-40" : ""
                      }`}
                    >
                      <div
                        className={`w-[104px] h-[104px] rounded-[12px] shadow-soft bg-cover bg-center border-2 ${
                          i === 0 ? "border-orchid" : "border-transparent"
                        }`}
                        style={
                          g.startsWith("data:") || g.startsWith("http")
                            ? { backgroundImage: `url(${g})` }
                            : { background: g }
                        }
                      />

                      {i === 0 ? (
                        <span className="absolute bottom-1.5 left-1.5 text-[10px] px-2 py-0.5 rounded-full bg-orchid text-white font-bold tracking-[0.04em] uppercase">
                          Main
                        </span>
                      ) : (
                        /*  Hover only. Visible on every tile it would be five
                            buttons competing with the photographs, which are
                            the thing this card exists to show.  */
                        <button
                          type="button"
                          onClick={() => movePhoto(i, 0)}
                          className="absolute bottom-1.5 left-1.5 right-1.5 text-[10px] py-1 rounded-full bg-white/95 text-purple font-semibold opacity-0 group-hover:opacity-100 transition-opacity shadow-soft"
                        >
                          Make main
                        </button>
                      )}

                      <button
                        type="button"
                        aria-label="Remove photo"
                        onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-purple text-white text-[12px] grid place-items-center shadow-soft"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  {/*
                    ── THE EMPTY STATE IS THREE SLOTS, NOT ONE PLUS ──────────
                    Owner, 1 Aug 2026: *"+ icon-এর জায়গায় যেন ৩টা image-এর
                    মতো থাকে, তাহলে বুঝতে সুবিধা হবে"*.

                    A single small square asks for A photo. Three say, without
                    a sentence, two things at once: bring SEVERAL, and they
                    will all be SQUARE. The shape of the empty box is the only
                    part of this card anybody reads before acting.

                    They shrink away as real photos arrive — once there is
                    something to look at, ghosts are just clutter. Below three
                    photos the row is topped back up so it never looks sparse.

                    The tile disappears entirely at the limit rather than
                    sitting there refusing: a plus sign that does nothing is a
                    broken button.
                  */}
                  {photos.length < MAX_PHOTOS &&
                    Array.from({
                      length: Math.max(1, Math.min(3 - photos.length, MAX_PHOTOS - photos.length)),
                    }).map((_, k) => (
                      <label
                        key={`slot-${k}`}
                        className={`w-[104px] h-[104px] rounded-[12px] border-[1.5px] border-dashed grid place-items-center transition-colors cursor-pointer text-center px-1 ${
                          k === 0
                            ? "border-orchid-mid text-orchid bg-orchid-soft/60 hover:bg-orchid-soft"
                            : "border-lavender-deep text-body-soft/50 bg-lavender/40 hover:border-orchid-mid hover:text-orchid"
                        }`}
                      >
                        {photoBusy && k === 0 ? (
                          <span className="text-[11px] font-semibold leading-tight">
                            Uploading…
                          </span>
                        ) : (
                          <Icon name="plus" size={k === 0 ? 24 : 18} />
                        )}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/avif"
                          multiple
                          disabled={photoBusy}
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files ?? []);
                            e.target.value = "";
                            if (files.length) void addPhotos(files);
                          }}
                        />
                      </label>
                    ))}
                </div>

                {photoErr && (
                  <p className="text-[12.5px] text-[#b42318] mt-3 mb-0">{photoErr}</p>
                )}
                {photoNote && (
                  <p className="text-[12.5px] text-[#8a5a00] mt-3 mb-0">{photoNote}</p>
                )}

                <span className="block text-[13px] text-body-soft mt-3">
                  {photos.length}/{MAX_PHOTOS} · square 1:1 · any size, stored under{" "}
                  {TARGET_MB} MB
                </span>
              </Card>
              <Card
                icon="photo"
                title="Video"
                hint="Add a YouTube link to show a video on the product page."
              >
                <Field label="YouTube link" full>
                  <input
                    className="ipt h-[44px]"
                    value={video}
                    onChange={(e) => setVideo(e.target.value)}
                    placeholder="https://youtu.be/ScMzIvxBSi4"
                  />
                </Field>
              </Card>
            </>
          )}

          {/* DELIVERY */}
          {sec === "delivery" && (
            <>
              <Card
                icon="truck"
                title={<>Zone & delivery<Req /></>}
                hint="Tick where it sells. Each zone keeps its own deliveries — set up in Delivery → Zones · types · slots. Publish করার আগে অন্তত একটা delivery speed (Express/Same Day/Midnight) টিক করা লাগবে।"
              >
                {/*
                  DEC-DLV-011 (rev 2, মালিকের কথা হুবহু) — "inside dhaka ja
                  thake thakbe. national ja thakar thakbe. kon product jodi
                  just inside hoy tahole ta select krbe, kon product jodi 2
                  tai kaj kre tahole 2 tai select krbe."

                  তাই এক card, দুই ঘর — যার delivery তার নিজের ঘরে, কোনো
                  মেশামেশি নেই। Inside Dhaka সবসময় টিক-করা (বাংলাদেশ মানে
                  ঢাকাসহ — "শুধু বাইরে" বলে অবস্থা নেই)। Outside-এর টিক
                  দিলে DB-তে zone=NATIONWIDE, আর সেই ঘরের courier-চিপ খোলে।
                  নামগুলো delivery module থেকে আসে (DEC-DLV-008) — এখানে
                  কিছুই hardcode নয়।
                */}
                {(() => {
                  const chip = (t: ApiDeliveryType) => {
                    const on = delivTypeIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() =>
                          setDelivTypeIds(
                            on
                              ? delivTypeIds.filter((x) => x !== t.id)
                              : [...delivTypeIds, t.id],
                          )
                        }
                        className={
                          "text-[13px] px-3.5 py-2 rounded-full border font-medium transition-colors " +
                          (on
                            ? "bg-purple border-purple text-white"
                            : "bg-white border-lavender-deep text-body hover:border-orchid-mid")
                        }
                      >
                        {t.name}
                      </button>
                    );
                  };
                  const dhakaTypes = delivTypes.filter((t) => t.zone === "DHAKA");
                  const courierTypes = delivTypes.filter((t) => t.zone === "BANGLADESH");
                  const outsideOn = zone === "NATIONWIDE";
                  const emptyNote = (
                    <div className="text-[13px] text-body-soft">
                      No delivery set up for this zone yet —{" "}
                      <Link href="/delivery/setup" className="text-orchid font-medium hover:underline">
                        add it in Delivery
                      </Link>
                      .
                    </div>
                  );
                  return (
                    <div className="flex flex-col gap-3">
                      {/* ── ঘর ১ · Inside Dhaka — সবসময় বিক্রি হয় ── */}
                      <div className="rounded-[14px] border border-lavender-deep bg-white p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span
                            className="text-[13px] px-3.5 py-1.5 rounded-full font-semibold bg-purple text-white cursor-default select-none"
                            title="Every product sells inside Dhaka — this is home."
                          >
                            ✓ Inside Dhaka
                          </span>
                          <span className="text-[12px] text-body-soft">always on</span>
                        </div>
                        {dhakaTypes.length ? (
                          <div className="flex flex-wrap gap-2">{dhakaTypes.map(chip)}</div>
                        ) : (
                          emptyNote
                        )}
                      </div>

                      {/* ── ঘর ২ · Outside Dhaka — ঐচ্ছিক ── */}
                      <div
                        className={
                          "rounded-[14px] border p-4 transition-colors " +
                          (outsideOn
                            ? "border-lavender-deep bg-white"
                            : "border-dashed border-lavender-deep bg-lavender/30")
                        }
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <button
                            type="button"
                            onClick={() => {
                              const next = outsideOn ? "DHAKA" : "NATIONWIDE";
                              setZone(next);
                              /*  Outside-এর টিক তুললে শুধু courier-ঘরের বাছাই
                                  ঝরে — ঢাকার speed-গুলো টিকে থাকে।  */
                              if (next === "DHAKA")
                                setDelivTypeIds((ids) =>
                                  ids.filter((id) =>
                                    delivTypes.some((t) => t.id === id && t.zone === "DHAKA"),
                                  ),
                                );
                            }}
                            className={
                              "text-[13px] px-3.5 py-1.5 rounded-full font-semibold transition-colors " +
                              (outsideOn
                                ? "bg-purple text-white"
                                : "bg-white border border-lavender-deep text-body hover:border-orchid-mid")
                            }
                          >
                            {outsideOn ? "✓ " : ""}Outside Dhaka — all Bangladesh
                          </button>
                          <span className="text-[12px] text-body-soft">
                            {outsideOn ? "courier-safe" : "tick if a courier can carry it"}
                          </span>
                        </div>
                        {outsideOn &&
                          (courierTypes.length ? (
                            <div className="flex flex-wrap gap-2">{courierTypes.map(chip)}</div>
                          ) : (
                            emptyNote
                          ))}
                      </div>
                    </div>
                  );
                })()}

                {/*
                  ⚠️ কিছু টিক না দিলে product-টা schedule করা দিনেই যাবে —
                  বন্ধ হয়ে যাবে না। এটা লেখা থাকা দরকার, কারণ খালি রেখে
                  publish করা সবচেয়ে সহজ ভুল, আর তার ফল দেখা যায় checkout-এ,
                  অনেক পরে।
                */}
                {/*
                  ⚠️ চুপচাপ হারিয়ে যাওয়া নয়। আগে টিক দেওয়া কোনো নামের দাম
                  মুছে ফেললে সেটা উপরের তালিকা থেকে চলে যায় — কিন্তু product-এ
                  টিকটা রয়ে যায়। না বললে মালিক ভাবতেন সবকিছু ঠিক আছে।
                */}
                {delivTypeIds.some((id) => !delivTypes.some((t) => t.id === id)) && (
                  <div className="rounded-[12px] px-4 py-3 text-[13px] mt-4 border border-[#f0d9a8] bg-[#fff6e5] text-[#8a5a00]">
                    One of the deliveries picked here has no charge set in any
                    zone, so customers will never be offered it. Set a charge in{" "}
                    <Link href="/delivery/setup" className="font-semibold hover:underline">
                      Delivery → Zones · types · slots
                    </Link>
                    , or untick it.
                  </div>
                )}

                <div className="bg-lavender rounded-[12px] px-4 py-3 text-[13px] text-purple mt-4">
                  {delivTypeIds.length === 0 ? (
                    <>
                      Nothing picked — this product will only go out on a
                      scheduled day, not on any of the fast options.
                    </>
                  ) : (
                    <>
                      {delivTypes
                        .filter((t) => delivTypeIds.includes(t.id))
                        .map((t) => t.name)
                        .join(" + ")}
                    </>
                  )}
                </div>
              </Card>
            </>
          )}

          {/* VARIANTS / SIZES / UPGRADES */}
          {sec === "variants" && (
            <>
              {/*
                ⚠️ একটা বেগুনি বাক্স ছিল এখানে, চার লাইনে Variant / Size /
                Upgrade / Add-ons চারটাই ব্যাখ্যা করত — মালিক দেখেই বললেন
                *"এটা কোন design হলো"*। ঠিক বলেছেন: চারটা জিনিসের সংজ্ঞা
                একসাথে পড়ানো হচ্ছিল, অথচ মানুষ এসেছে একটা কাজ করতে।

                প্রতিটা সংজ্ঞা এখন তার নিজের card-এর `?`-এ, যেখানে সেটা
                দরকার হওয়ার মুহূর্তে পাওয়া যায় — আর তার আগে জায়গা নেয় না।
              */}
              {/*
                ═══════════════════════════════════════════════════════════════
                DEC-PRD-012 — এক product, অনেক variant। মালিক, ১ আগস্ট ২০২৬:

                *"একটা product যদি কোনো variant না থাকে তখন সেখানে আমি কিছুই
                choose করব না। যখন তার multi variant থাকবে তখন তা show করাব —
                আর তা একটা product page-এ হবে। প্রতিটার আলাদা image আর stock
                থাকবে।"*

                ⚠️ আগে এখানে **একটাই** মান বাছা যেত, কারণ পুরনো নকশায়
                product-টা নিজেই একটা রঙ ছিল আর তিনটা রঙ মানে তিনটা আলাদা
                product। সেই নকশার জোড়া লাগানোর পর্দা কখনো বানানো হয়নি, তাই
                swatch বাস্তবে কোনোদিন দেখাই যায়নি — মালিক ঠিক সেটাই ধরেছেন।
                ═══════════════════════════════════════════════════════════════
              */}
              <Card
                icon="sparkle"
                /*  ⚠️ ছোট রাখা হয়েছে ইচ্ছে করে — মালিক, ২ আগস্ট:
                    *"variant option tab ta onk beshi text, agula clean kro"*.
                    বাকি ব্যাখ্যা `?` চিহ্নে, যেখানে দরকার হলে পাওয়া যায়।  */
                title="Colours, flavours, sizes"
                tip="Only if this product comes in more than one. Each colour or size gets its own photo, its own stock and — if you want — its own price."
              >
                {vAttrs.filter((a) => a.values.some((v) => v.isActive)).length === 0 ? (
                  <p className="text-[13px] text-body-soft m-0">
                    No lists yet —{" "}
                    <Link href="/products/variants" className="text-orchid font-semibold hover:underline">
                      build one
                    </Link>
                    .
                  </p>
                ) : (
                  <>
                    {/* ── which list ── */}
                    <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-orchid mb-2">
                      Which list
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {vAttrs
                        .filter((a) => a.values.some((v) => v.isActive))
                        .map((a) => {
                          const on = (vAttrOpen ?? pickedAttrId) === a.id;
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => setVAttrOpen(on ? null : a.id)}
                              className={`text-[13px] font-medium px-3.5 py-2 rounded-full border transition-colors ${
                                on
                                  ? "bg-purple border-purple text-white"
                                  : "bg-white border-lavender-deep text-body hover:border-orchid"
                              }`}
                            >
                              {a.name}
                            </button>
                          );
                        })}
                    </div>

                    {/* ── pick the ones this product comes in ── */}
                    {(() => {
                      const openId = vAttrOpen ?? pickedAttrId;
                      const a = vAttrs.find((x) => x.id === openId);
                      if (!a) return null;
                      return (
                        <div className="mt-4 pt-4 border-t border-lavender-deep flex flex-wrap gap-1.5">
                          {a.values
                            .filter((val) => val.isActive)
                            .map((val) => {
                              const on = variants.some((v) => v.variantValueId === val.id);
                              return (
                                <button
                                  key={val.id}
                                  type="button"
                                  onClick={() =>
                                    setVariants((cur) =>
                                      on
                                        ? cur.filter((v) => v.variantValueId !== val.id)
                                        : [
                                            ...cur,
                                            {
                                              variantValueId: val.id,
                                              label: val.label,
                                              swatch: val.swatch ?? null,
                                              masterImage: val.imageUrl ?? null,
                                              attribute: a.name,
                                              imageUrl: "",
                                              stockQty: "0",
                                              itemId: null,
                                              itemLabel: null,
                                              price: "",
                                              isActive: true,
                                            },
                                          ],
                                    )
                                  }
                                  className={`inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-full border transition-colors ${
                                    on
                                      ? "bg-purple border-purple text-white"
                                      : "bg-white border-lavender-deep text-body hover:border-orchid"
                                  }`}
                                >
                                  {val.swatch && (
                                    <span className="w-[15px] h-[15px] rounded-full border border-white/40" style={{ background: val.swatch }} />
                                  )}
                                  {val.label}
                                </button>
                              );
                            })}
                        </div>
                      );
                    })()}

                    {/* ── the picked ones, each with its own photo / stock / price ── */}
                    {variants.length > 0 && (
                      <div className="mt-5 pt-5 border-t border-lavender-deep">
                        <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-orchid mb-2.5">
                          {variants.length} on this product
                        </div>
                        <div className="flex flex-wrap gap-2.5">
                          {variants.map((v) => {
                            const editing = vOpen === v.variantValueId;
                            const shown = v.imageUrl || v.masterImage;
                            return (
                              <div
                                key={v.variantValueId}
                                className={`rounded-[14px] border transition-colors ${
                                  editing ? "border-orchid bg-orchid-soft/40" : "border-lavender-deep bg-white hover:border-orchid-mid"
                                } ${v.isActive ? "" : "opacity-45"}`}
                                style={{ width: 132 }}
                              >
                                <button
                                  type="button"
                                  onClick={() => setVOpen(editing ? null : v.variantValueId)}
                                  className="w-full p-2.5 text-left"
                                >
                                  <span
                                    className="block w-full h-[62px] rounded-[10px] border border-lavender-deep bg-cover bg-center grid place-items-center text-body-soft"
                                    style={
                                      shown
                                        ? { backgroundImage: `url(${shown})` }
                                        : { background: v.swatch || "#f2edf7" }
                                    }
                                  >
                                    {!shown && !v.swatch && <Icon name="photo" size={16} />}
                                  </span>
                                  <span className="block text-[13px] font-semibold text-purple mt-2 truncate">
                                    {v.label}
                                  </span>
                                  <span className="block text-[11.5px] text-body-soft truncate">
                                    {/*  TRACKED হলে হাতে লেখা সংখ্যাটা পড়াই
                                         হয় না, তাই সেটা দেখানোও হয় না।  */}
                                    {stockMode === "TRACKED"
                                      ? (v.itemLabel ?? (v.itemId ? "item linked" : "no item yet"))
                                      : `${v.stockQty} in stock`}
                                    {v.price.trim() ? ` · ৳${v.price}` : ""}
                                  </span>
                                </button>

                                {editing && (
                                  <div className="border-t border-lavender-deep p-2.5 flex flex-col gap-2">
                                    <label className="text-[12px] font-semibold text-orchid text-center py-1.5 rounded-[8px] bg-white border border-lavender-deep cursor-pointer hover:border-orchid">
                                      <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/avif"
                                        className="hidden"
                                        disabled={vBusy === v.variantValueId}
                                        onChange={async (e) => {
                                          const f = e.target.files?.[0];
                                          e.target.value = "";
                                          if (!f) return;
                                          setVBusy(v.variantValueId);
                                          try {
                                            /*  ⚠️ ১:১ জোর করা হয় না — সেটা
                                                শুধু product photo-র নিয়ম
                                                (মালিকের সংশোধন)। ১ MB-র সীমা
                                                সব ছবিতেই, আর সেটা
                                                `uploadItemImage` রাখে।  */
                                            const url = await uploadItemImage(f, "products", 1600);
                                            setVariants((cur) =>
                                              cur.map((x) =>
                                                x.variantValueId === v.variantValueId ? { ...x, imageUrl: url } : x,
                                              ),
                                            );
                                          } catch {
                                            /* ছবি না উঠলে বাকিটা অক্ষত থাকে */
                                          } finally {
                                            setVBusy(null);
                                          }
                                        }}
                                      />
                                      {vBusy === v.variantValueId
                                        ? "Uploading…"
                                        : v.imageUrl
                                          ? "Change photo"
                                          : "Add photo"}
                                    </label>

                                    {/*
                                      ═══════════════════════════════════════
                                      DEC-PRD-015 — মজুদ কোথা থেকে আসবে।
                                      মালিক, ২ আগস্ট ২০২৬: *"manual-টা
                                      এখনকার মতোই হোক। inventory থেকে আনা
                                      লাগলে Stock & lead time-এ যেভাবে
                                      inventory থেকে ডেকেছি সেভাবে ডাকবে।"*

                                      ⚠️ দুটো ঘর একসাথে দেখানো হয় না।
                                      দেখালে একজন হাতে ২০ লিখতেন আর
                                      Inventory বলত ৩ — আর কোনটা সত্যি
                                      সেটা page-টাই বলতে পারত না।
                                      ═══════════════════════════════════════
                                    */}
                                    {stockMode === "TRACKED" ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setVItemFor(
                                            vItemFor === v.variantValueId ? null : v.variantValueId,
                                          );
                                          setVItemQ("");
                                        }}
                                        className={`text-[12px] text-left px-2 py-1.5 rounded-[8px] border transition-colors ${
                                          v.itemId
                                            ? "bg-white border-lavender-deep text-purple hover:border-orchid"
                                            : "bg-white border-dashed border-orchid-mid text-orchid"
                                        }`}
                                      >
                                        {v.itemLabel ?? (v.itemId ? "Item linked" : "Pick item")}
                                      </button>
                                    ) : (
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          className="ipt text-[13px] w-full"
                                          style={{ minHeight: 32, paddingTop: 2, paddingBottom: 2 }}
                                          type="number"
                                          min={0}
                                          value={v.stockQty}
                                          onChange={(e) =>
                                            setVariants((cur) =>
                                              cur.map((x) =>
                                                x.variantValueId === v.variantValueId ? { ...x, stockQty: e.target.value } : x,
                                              ),
                                            )
                                          }
                                        />
                                        <span className="text-[11px] text-body-soft shrink-0">stock</span>
                                      </div>
                                    )}

                                    {/*
                                      ⚠️ খালি রাখাই স্বাভাবিক। মালিক: *"same
                                      product just color change হলে দাম same
                                      থাকবে, আবার kg change হলে আলাদা হবে।"*
                                      প্রতিটা রঙে একই সংখ্যা লিখে রাখলে একদিন
                                      একটা বদলাতে ভুলে যাওয়া হতো।
                                    */}
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        className="ipt text-[13px] w-full"
                                        style={{ minHeight: 32, paddingTop: 2, paddingBottom: 2 }}
                                        placeholder="same price"
                                        value={v.price}
                                        onChange={(e) =>
                                          setVariants((cur) =>
                                            cur.map((x) =>
                                              x.variantValueId === v.variantValueId
                                                ? { ...x, price: e.target.value.replace(/[^0-9.]/g, "") }
                                                : x,
                                            ),
                                          )
                                        }
                                      />
                                      <span className="text-[11px] text-body-soft shrink-0">৳</span>
                                    </div>

                                    <div className="flex gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setVariants((cur) =>
                                            cur.map((x) =>
                                              x.variantValueId === v.variantValueId ? { ...x, isActive: !x.isActive } : x,
                                            ),
                                          )
                                        }
                                        className={`flex-1 text-[11.5px] font-bold py-1.5 rounded-[8px] ${
                                          v.isActive ? "bg-[#e8f6ef] text-[#0f7d55]" : "bg-[#f0edf4] text-body-soft"
                                        }`}
                                      >
                                        {v.isActive ? "ON" : "OFF"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setVariants((cur) => cur.filter((x) => x.variantValueId !== v.variantValueId));
                                          setVOpen(null);
                                        }}
                                        className="w-[34px] grid place-items-center rounded-[8px] text-body-soft hover:text-[#c0392b] hover:bg-[#fdecee]"
                                      >
                                        <Icon name="trash" size={13} />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/*  DEC-PRD-015 — Item খোঁজার পর্দা, পুরো চওড়ায়।
                             card-এর ভেতরে বসালে item-এর নামটাই পড়া যেত না।  */}
                        {vItemFor && (
                          <div className="mt-3 border border-lavender-deep rounded-[12px] p-3 bg-white">
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <div className="text-[12.5px] text-body-soft">
                                Which stockroom item holds{" "}
                                <b className="font-semibold text-purple">
                                  {variants.find((x) => x.variantValueId === vItemFor)?.label}
                                </b>
                                ?
                              </div>
                              <button
                                type="button"
                                onClick={() => setVItemFor(null)}
                                className="text-[12.5px] text-body-soft hover:text-purple"
                              >
                                Close
                              </button>
                            </div>
                            <input
                              className="ipt h-[40px] mb-2"
                              placeholder="Search by item code or name…"
                              value={vItemQ}
                              onChange={(e) => setVItemQ(e.target.value)}
                              autoFocus
                            />
                            <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto">
                              {vItemHits.length === 0 && (
                                <div className="text-[13px] text-body-soft px-1 py-2">
                                  No item matches “{vItemQ || "…"}”. Make it in{" "}
                                  <Link href="/items/new" className="text-orchid font-medium hover:underline">
                                    Items
                                  </Link>{" "}
                                  first.
                                </div>
                              )}
                              {vItemHits.map((it) => (
                                <button
                                  key={it.id}
                                  type="button"
                                  onClick={() => {
                                    setVariants((cur) =>
                                      cur.map((x) =>
                                        x.variantValueId === vItemFor
                                          ? { ...x, itemId: it.id, itemLabel: `${it.name} · ${it.sku}` }
                                          : x,
                                      ),
                                    );
                                    setVItemFor(null);
                                  }}
                                  className="flex items-center gap-3 border border-lavender-deep rounded-[10px] px-2.5 py-2 hover:border-orchid text-left"
                                >
                                  <span className="flex-1 min-w-0 text-[13px] text-purple font-medium truncate">
                                    {it.name}
                                  </span>
                                  <span className="text-[13px] text-body-soft font-mono">{it.sku}</span>
                                </button>
                              ))}
                            </div>
                            {variants.find((x) => x.variantValueId === vItemFor)?.itemId && (
                              <button
                                type="button"
                                onClick={() => {
                                  setVariants((cur) =>
                                    cur.map((x) =>
                                      x.variantValueId === vItemFor
                                        ? { ...x, itemId: null, itemLabel: null }
                                        : x,
                                    ),
                                  );
                                  setVItemFor(null);
                                }}
                                className="mt-2 text-[12.5px] text-body-soft hover:text-[#c0392b]"
                              >
                                Unlink — use the product&rsquo;s own item
                              </button>
                            )}
                          </div>
                        )}

                        {/*  ⚠️ এক লাইনে, আর শুধু যেটা এই মুহূর্তে সত্যি।
                            আগে দুটো নিয়ম একসাথে লেখা থাকত — মালিক সেটাকেই
                            "onk beshi text" বলেছেন।  */}
                        <p className="text-[12.5px] text-body-soft mt-3 mb-0">
                          Empty price = the product&rsquo;s own.{" "}
                          {stockMode === "TRACKED"
                            ? "Stock comes from each one's Inventory item."
                            : "Stock counts per colour."}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </Card>

              {/*
                ═══════════════════════════════════════════════════════════════
                "SIZES" CARD REMOVED — মালিকের সিদ্ধান্ত, ২ আগস্ট ২০২৬:
                *"ha size ta tahole to dorkar nai eta soraia daw"*

                কেন। উপরের "Colours, flavours, sizes" card একই কাজ করে, আর
                ভালোভাবে করে: তালিকাটা সবার জন্য একটাই (master), প্রতিটা
                মাপের নিজের ছবি আর নিজের মজুদ থাকে। পুরনো card-টা শুধু এই
                product-এ থাকত, ছবি রাখতে পারত না, আর তার "Stock" ঘরটা
                লেখা যেত কিন্তু কোথাও save হতো না — database-এ ওই কলামই নেই।

                ⚠️ কিছু মুছে ফেলা হয়নি। `ProductSize` টেবিল, API আর
                website-এর size row জায়গামতোই আছে, তাই আগে যেসব product-এ
                মাপ বসানো ছিল সেগুলো আগের মতোই চলছে। `buildDto` এখন
                `sizes` পাঠায়ই না — আর না পাঠানো মানে API ওগুলো ছোঁয় না।
                পাঠালে খালি array যেত আর প্রতিবার Publish-এ পুরনো মাপগুলো
                মুছে যেত।
                ═══════════════════════════════════════════════════════════════
              */}

              {/*
                Bundles sit between Sizes and Upgrades because that is the order
                the three appear on the product page, and because it is the
                order that keeps them straight in the head: same thing at a
                different price (size) → a second thing alongside (bundle) →
                the same thing, larger (upgrade).

                Only for a product that already exists. A bundle points at a
                product id, and an unsaved product has none — offering the
                control before Save would collect choices with nowhere to put
                them.
              */}
              <Card
                icon="tag"
                title="Bundles"
                tip="Products a customer can add to this one. Taking even one applies your bundle discount to everything, this product included. The discount itself lives on the Pricing tab."
              >
                {apiProductId ? (
                  <BundleEditor
                    owner={{ productId: apiProductId }}
                    selfProductId={apiProductId}
                    inheritedFrom={catName || undefined}
                  />
                ) : (
                  <>
                    {/*
                      DEC-PRD-017 — একটাই bundle, তার ভেতরে যতগুলো ইচ্ছা
                      product, আর নিচে একটাই ছাড়ের ঘর। মালিকের নিয়ম:
                      ছাড় বসে main product সহ মোট দামের উপর।
                    */}
                    {pendingBundles.length > 0 && (
                      <div className="bg-lavender/50 rounded-[12px] p-3 mb-3">
                        <input
                          className="ipt h-[38px] mb-2.5"
                          placeholder="+ Cake and card"
                          value={pendingLabel}
                          onChange={(e) => setPendingLabel(e.target.value)}
                        />
                        <div className="flex flex-col gap-1.5 mb-2.5">
                          {pendingBundles.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center gap-2.5 bg-white border border-lavender-deep rounded-[10px] px-2.5 py-2"
                            >
                              <span className="flex-1 min-w-0 text-[13px] text-purple font-medium truncate">
                                {p.name}
                              </span>
                              <span className="text-[13px] text-body-soft shrink-0">
                                {formatTaka(p.offerPricePaisa)}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingBundles((cur) => cur.filter((x) => x.id !== p.id))
                                }
                                className="w-[26px] h-[26px] grid place-items-center rounded-[7px] text-body-soft hover:text-[#c0392b] shrink-0"
                              >
                                <Icon name="trash" size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                        {/*  ⚠️ ছাড়ের ঘর এখানে নেই — DEC-PRD-019, মালিকের
                            নির্দেশ: *"variant page a akhono discount button
                            ache ja amder dorkar nai. amra price tab a sob
                            kaj korbo."* এই card-এর কাজ শুধু কোন কোন জিনিস।  */}
                        <p className="text-[12.5px] text-body-soft mt-2 mb-0">
                          Discount &amp; totals live on the{" "}
                          <b className="font-semibold text-purple">Pricing</b> tab.
                        </p>
                      </div>
                    )}

                    <div className="border border-lavender-deep rounded-[12px] p-3">
                      <div className="text-[12.5px] text-body-soft mb-2">
                        Pick the products a customer can add to this one
                      </div>
                      <input
                        className="ipt mb-2 h-[40px]"
                        placeholder="Search product or SKU…"
                        value={bunPq}
                        onChange={(e) => setBunPq(e.target.value)}
                      />
                      <div className="flex flex-col gap-1.5 max-h-[240px] overflow-y-auto">
                        {allProducts
                          .filter((x) => !pendingBundles.some((b) => b.id === x.id))
                          .filter(
                            (x) =>
                              !bunPq ||
                              x.name.toLowerCase().includes(bunPq.toLowerCase()) ||
                              (x.sku ?? "").toLowerCase().includes(bunPq.toLowerCase()),
                          )
                          .slice(0, 40)
                          .map((x) => (
                            <button
                              key={x.id}
                              type="button"
                              onClick={() => setPendingBundles((cur) => [...cur, x])}
                              className="flex items-center gap-3 bg-white border border-lavender-deep rounded-[10px] px-2.5 py-2 hover:border-orchid text-left"
                            >
                              <span className="w-[30px] h-[30px] rounded-[8px] bg-lavender border border-lavender-deep shrink-0" />
                              <span className="flex-1 min-w-0 text-[13px] text-purple font-medium truncate">
                                {x.name}
                              </span>
                              <span className="text-[13px] text-body-soft">
                                {formatTaka(x.offerPricePaisa)}
                              </span>
                            </button>
                          ))}
                      </div>
                    </div>

                  </>
                )}
              </Card>

              {/*
                Craft cards. Almost always left empty here — the story belongs
                to the category and is written once there. This is the escape
                hatch for the one product with a different one.
              */}
              <Card
                icon="sparkle"
                title="Why buy from us"
                tip="The three cards under the price on the product page. Normally written once on the category — fill these in only if this product has its own story."
              >
                {apiProductId ? (
                  <CraftEditor
                    owner={{ productId: apiProductId }}
                    inheritedFrom={catName || undefined}
                  />
                ) : (
                  <p className="text-[13.5px] text-body-soft m-0">
                    Save this product first — a card has to belong to it.
                  </p>
                )}
              </Card>

              <Card
                icon="box"
                title="Upgrade products"
                tip="A bigger version that is its own product. On the page it is a choice, not a link — the price and photo swap in place."
              >
                {(myUpgrades.length > 0 || pendingUp.length > 0) && (
                  <div className="flex flex-col gap-2 mb-3">
                    {[...myUpgrades, ...pendingUp].map((u) => (
                      <div key={u.id} className="flex items-center gap-3 bg-lavender/50 rounded-[11px] px-3 py-2.5">
                        <span className="w-[30px] h-[30px] rounded-[8px] bg-white border border-lavender-deep shrink-0" />
                        <span className="text-[13.5px] text-purple font-medium flex-1 min-w-0 truncate">{u.name}</span>
                        {pendingUp.some((x) => x.id === u.id) && (
                          <span className="text-[10px] font-bold uppercase bg-[#fff8ec] text-[#b45309] border border-[#f0c88a] px-1.5 py-0.5 rounded-full">links on save</span>
                        )}
                        <span className="text-[13px] text-body-soft">{formatTaka(u.offerPricePaisa)}</span>
                        <button
                          type="button"
                          onClick={() => unlinkUpgrade(u)}
                          title="Remove as upgrade (the product stays in your catalog)"
                          className="text-body-soft hover:text-[#c0392b] shrink-0"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { setUpPickerOpen((v) => !v); setUpPq(""); }}
                  className="inline-flex items-center gap-1.5 border border-lavender-deep bg-white text-[13px] px-3.5 py-2 rounded-[10px] hover:border-orchid text-purple font-medium"
                >
                  <Icon name={upPickerOpen ? "check" : "plus"} size={15} /> {upPickerOpen ? "Done" : "Choose an upgrade product"}
                </button>

                {upPickerOpen && (
                  <div className="bg-lavender/60 rounded-[12px] p-3 mt-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-body-soft mb-2">
                      Pick a catalog product that is the bigger version of this one
                    </div>
                    <input
                      className="ipt mb-2 h-[40px]"
                      placeholder="Search product or SKU…"
                      value={upPq}
                      onChange={(e) => setUpPq(e.target.value)}
                    />
                    <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto">
                      {allProducts
                        .filter((x) => x.id !== apiProductId && !x.upgradeOfProductId && !pendingUp.some((u) => u.id === x.id))
                        .filter((x) => !upPq || x.name.toLowerCase().includes(upPq.toLowerCase()) || (x.sku ?? "").toLowerCase().includes(upPq.toLowerCase()))
                        .slice(0, 40)
                        .map((x) => (
                          <button
                            key={x.id}
                            type="button"
                            onClick={() => linkUpgrade(x)}
                            className="flex items-center gap-3 bg-white border border-lavender-deep rounded-[10px] px-2.5 py-2 hover:border-orchid text-left"
                          >
                            <span className="w-[30px] h-[30px] rounded-[8px] bg-lavender border border-lavender-deep shrink-0" />
                            <span className="flex-1 min-w-0 text-[13px] text-purple font-medium truncate">{x.name}</span>
                            <span className="text-[13px] text-body-soft font-mono">{x.sku ?? "—"}</span>
                            <span className="text-[13px] text-body-soft">{formatTaka(x.offerPricePaisa)}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
                {/*  ⚠️ দুটো প্যারাগ্রাফ ছিল, এক লাইন হলো। আর কথাটা এখন
                    সত্যিও — DEC-PRD-020-এর আগে storefront এটা পড়তই না।  */}

              </Card>

              <Card
                icon="tag"
                title="Add-ons"
                tip="Small extras — a card, a ribbon, a vase. Rules on the Add-ons screen decide which group each product gets; pin one here only if this product needs something different."
              >
                {/* auto — from the rules */}
                <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-body-soft mb-2">
                  Automatic (from the rules)
                </div>
                {matchedAddonGroups.length > 0 ? (
                  <div className="flex flex-col gap-2.5 mb-4">
                    {matchedAddonGroups.map((g) => (
                      <div key={g.name} className="border border-lavender-deep rounded-[12px] px-3.5 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <b className="text-[13.5px] text-purple">{g.name}</b>
                          <span className="text-[13px] text-body-soft">· {g.why}</span>
                        </div>
                        {g.addons.length > 0 && (
                          <div className="text-[13px] text-body-soft mt-1">{g.addons.join(" · ")}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-body-soft mb-4">
                    No rule matches —{" "}
                    <Link href="/products/addons" className="text-orchid font-semibold hover:underline">set one up</Link>
                    , or pin a group below.
                  </p>
                )}

                {/* manual — pinned to just this product */}
                <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-body-soft mb-2 pt-3 border-t border-lavender-deep">
                  Pinned to this product only
                </div>
                {manualGroupIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {manualGroupIds.map((gid) => {
                      const g = addonBundle?.groups.find((x) => x.id === gid);
                      if (!g) return null;
                      return (
                        <span key={gid} className="inline-flex items-center gap-1.5 bg-orchid-soft border border-orchid-mid text-purple rounded-full pl-2.5 pr-1.5 py-1 text-[12.5px] font-medium">
                          {g.name}
                          <button type="button" onClick={() => setManualGroupIds((p) => p.filter((x) => x !== gid))} className="hover:text-[#c0392b]">✕</button>
                        </span>
                      );
                    })}
                  </div>
                )}
                {!addonBundle || addonBundle.groups.length === 0 ? (
                  <p className="text-[13px] text-body-soft m-0">
                    No groups yet —{" "}
                    <Link href="/products/addons" className="text-orchid font-semibold hover:underline">create one</Link>
                    .
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setGroupPickerOpen((v) => !v)}
                      className="inline-flex items-center gap-1.5 border border-lavender-deep bg-white text-[13px] px-3.5 py-2 rounded-[10px] hover:border-orchid text-purple font-medium"
                    >
                      <Icon name={groupPickerOpen ? "check" : "plus"} size={15} /> {groupPickerOpen ? "Done" : "Pin a group to this product"}
                    </button>
                    {groupPickerOpen && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {addonBundle.groups
                          .filter((g) => !manualGroupIds.includes(g.id))
                          .map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => setManualGroupIds((p) => [...p, g.id])}
                              className="inline-flex items-center gap-1.5 bg-white border border-lavender-deep rounded-full px-3 py-1.5 text-[12.5px] font-medium text-body hover:border-orchid"
                            >
                              <Icon name="plus" size={13} /> {g.name}
                            </button>
                          ))}
                        {addonBundle.groups.filter((g) => !manualGroupIds.includes(g.id)).length === 0 && (
                          <span className="text-[13px] text-body-soft">Every group is already pinned.</span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </Card>
            </>
          )}

          {/*
            ═══════════════════════════════════════════════════════════════════
            TAGS — DEC-PRD-022, মালিকের প্রশ্ন ২ আগস্ট ২০২৬:
            *"tag module a kaj korle ba update korle product upload page sathe
            sathe update hoy kina?"*

            উত্তর ছিল **না** — চিপগুলো এই ফাইলে হাতে লেখা দুটো array থেকে
            আঁকা হতো (৮টা occasion, ৫টা recipient)। Occasions & Tags-এ নতুন
            tag বা নতুন group বানালে সেটা এখানে কোনোদিন আসত না।

            এখন group ধরে ধরে API থেকেই আঁকা হয়। মালিক যা বানান তাই এখানে,
            সাথে সাথে।
            ═══════════════════════════════════════════════════════════════════
          */}
          {sec === "tags" && (
            <>
              {(() => {
                /*  group ধরে সাজানো। group ছাড়া tag-ও থাকতে পারে (পুরনো
                    তথ্য) — সেগুলো শেষে "Other" নামে, লুকিয়ে না রেখে।  */
                const live = apiTags.filter((t) => t.isActive !== false);
                const byGroup = new Map<string, { name: string; tags: ApiTag[] }>();
                for (const t of live) {
                  const key = t.group?.id ?? "__none";
                  if (!byGroup.has(key)) {
                    byGroup.set(key, { name: t.group?.name ?? "Other tags", tags: [] });
                  }
                  byGroup.get(key)!.tags.push(t);
                }

                if (byGroup.size === 0) {
                  return (
                    <Card icon="hash" title="Tags">
                      <p className="text-[13.5px] text-body-soft m-0">
                        No tags yet. Make them in{" "}
                        <Link
                          href="/tags"
                          className="text-orchid font-semibold hover:underline"
                        >
                          Occasions &amp; Tags
                        </Link>{" "}
                        — whatever you add there appears here straight away.
                      </p>
                    </Card>
                  );
                }

                return [...byGroup.entries()].map(([key, g], i) => (
                  <Card
                    key={key}
                    icon="hash"
                    title={g.name}
                    hint={
                      i === 0
                        ? "The Gift Finder and these pages filter by them."
                        : undefined
                    }
                  >
                    <Chips
                      all={g.tags.map((t) => t.slug)}
                      value={tagSel}
                      onToggle={(v) => toggle(tagSel, v, setTagSel)}
                      /*  দ্বিতীয় group থেকে সোনালি — একটার পর একটা একই রঙের
                          চিপ সারি চোখে আলাদা হয় না।  */
                      gold={i % 2 === 1}
                    />
                  </Card>
                ));
              })()}
            </>
          )}

          {/* STORY */}
          {sec === "story" && (
            <>
              <Card icon="book" title="Nature line" tip="The one-line promise at the top of the product page — “100% Fresh Flowers”.">
                <div className={gridCls}>
                  <Field label="Type" note="Pick a quick option or type your own">
                    <input
                      className="ipt h-[44px]"
                      value={typeText}
                      onChange={(e) => setTypeText(e.target.value)}
                      placeholder="fresh / artificial / live plant / edible / custom…"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {["fresh", "artificial", "live plant", "edible", "handmade"].map(
                        (t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTypeText(t)}
                            className="text-[12px] px-2.5 py-1 rounded-full border border-lavender-deep bg-white hover:border-orchid-mid text-body capitalize"
                          >
                            {t}
                          </button>
                        ),
                      )}
                    </div>
                  </Field>
                  <Field label="Label text">
                    <input
                      className="ipt h-[44px]"
                      value={natureLabel}
                      onChange={(e) => setNatureLabel(e.target.value)}
                      placeholder="100% Fresh Flowers"
                    />
                  </Field>
                </div>
              </Card>
              {/*
                ═══════════════════════════════════════════════════════════════
                DEC-PRD-025 — মালিক, ২ আগস্ট ২০২৬:
                *"আমরা এখানে প্রথমে একটা fake sale account বসাব like 50, 100,
                1000। তারপর real sell হলে সেই সংখ্যার সাথে add হবে — 50
                বসালাম, একটা sell হলো, auto 51। আমাদের stock-এর মতো, এটা তুমি
                ভুলে গেছ। আর এখানে just last month আছে — today, week, month
                and all time দরকার।"*

                ⚠️ তিনি ঠিক বলেছেন, আর অর্ধেকটা আমি সত্যিই ভুলে গিয়েছিলাম।
                গোনাটা চলত (order delivered হলে বাড়ত), কিন্তু সংখ্যাটা
                product page-এ **দেখাতই না** — page-এ যেটা ছিল সেটা আলাদা
                হিসাব, শুধু সত্যিকারের order, আর ১০-এর কম হলে চুপ।
                ═══════════════════════════════════════════════════════════════
              */}
              <Card
                icon="star"
                title="Sales signal"
                tip="Your starting number plus every real sale, over whichever window you pick. Today, this week and this month stop counting on their own; all time only ever goes up."
              >
                {/*
                  ⚠️ এক ঘর, পাশে dropdown — মালিকের নির্দেশ, ২ আগস্ট ২০২৬:
                  *"এভাবে দিছ কেন, এটা মোটেও ভালো লাগছে না। প্রথমে যেভাবে
                  করেছিলা সেটাই সুন্দর — ঘর থাকবে একটা আর পাশের dropdown,
                  ওইটাই সুন্দর।"*

                  চারটে সংখ্যা আলাদা করেই রাখা হয় (তাঁরই আগের সিদ্ধান্ত),
                  কিন্তু পর্দায় একটাই ঘর — dropdown যেটা বলছে, সেটার সংখ্যা।
                  চারটে ঘর একসাথে দেখানো মানে তিনটে সংখ্যা যা এই মুহূর্তে
                  কোথাও যাচ্ছে না, অথচ চোখের সামনে।
                */}
                <div className={pairCls}>
                  <Field
                    label="Starting number"
                    note="Leave it at 0 to show nothing until real sales come in"
                  >
                    <input
                      className="ipt h-[44px]"
                      type="number"
                      min={0}
                      value={
                        salesWindow === "TODAY"
                          ? seedToday
                          : salesWindow === "WEEK"
                            ? seedWeek
                            : salesWindow === "MONTH"
                              ? seedMonth
                              : seedAll
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        if (salesWindow === "TODAY") setSeedToday(v);
                        else if (salesWindow === "WEEK") setSeedWeek(v);
                        else if (salesWindow === "MONTH") setSeedMonth(v);
                        else setSeedAll(v);
                      }}
                      placeholder="0"
                    />
                  </Field>
                  <Field label="Count sales from" note="Each one keeps its own number">
                    <select
                      className="ipt h-[44px]"
                      value={salesWindow}
                      onChange={(e) => setSalesWindow(e.target.value as typeof salesWindow)}
                    >
                      <option value="TODAY">Today</option>
                      <option value="WEEK">This week</option>
                      <option value="MONTH">This month</option>
                      <option value="ALL">All time</option>
                    </select>
                  </Field>
                </div>
                {/*  ⚠️ আগে এখানে দুটো অনুচ্ছেদ ছিল — কী দেখাবে, আর কবে
                    ফুরাবে। মালিক ৩ আগস্ট বলেছেন page টা clean চান, তাই
                    দুটো এক লাইনে। মেয়াদের কথাটা তুলে দেওয়া যায় না —
                    না লিখলে তিনি ভাববেন সংখ্যাটা মুছে গেছে।  */}
                <p className="text-[12.5px] text-body-soft mt-2.5 mb-0">
                  Page shows{" "}
                  <b className="font-semibold text-purple">
                    {(salesWindow === "TODAY"
                      ? seedToday
                      : salesWindow === "WEEK"
                        ? seedWeek
                        : salesWindow === "MONTH"
                          ? seedMonth
                          : seedAll) || "0"}{" "}
                    + real sales{" "}
                    {salesWindow === "TODAY"
                      ? "today"
                      : salesWindow === "WEEK"
                        ? "this week"
                        : salesWindow === "MONTH"
                          ? "this month"
                          : "ever"}
                  </b>
                  {salesWindow === "ALL"
                    ? " · never resets"
                    : salesWindow === "TODAY"
                      ? " · your number stops counting tomorrow"
                      : salesWindow === "WEEK"
                        ? " · your number stops counting after 7 days"
                        : " · your number stops counting after 30 days"}
                  .
                </p>
              </Card>
              {/*
                ═══════════════════════════════════════════════════════════════
                DEC-PRD-026 — মালিক, ২ আগস্ট ২০২৬: *"আমাদের customize
                product-এ কোথাও image upload আর কোথাও text লেখার জায়গা
                product page-এ দিতে হয় — সেটার configure করার জায়গা পেলাম না।"*

                ⚠️ পাননি কারণ ছিলই না। আর storefront-এর seam-এ সোজা
                `perso: null` লেখা ছিল, তাই বাক্সটা কোনো product-এ **কখনো**
                আসেনি — যদিও cart, checkout আর order আগে থেকেই লেখা আর ছবি
                বয়ে নিয়ে যেত।
                ═══════════════════════════════════════════════════════════════
              */}
              <Card
                icon="edit"
                title="Let the customer add something"
                tip="A name on the cake, a photo for the mug. Off on most products — turn a switch on and the box appears on the product page."
              >
                <div className="flex flex-col gap-3">
                  <Sw on={persoText} onToggle={() => setPersoText(!persoText)}>
                    A message or name they type
                  </Sw>
                  {persoText && (
                    <div className="pl-1 grid gap-3 sm:grid-cols-[1fr_120px]">
                      <Field label="What to call the box">
                        <input
                          className="ipt h-[44px]"
                          value={persoTextLabel}
                          onChange={(e) => setPersoTextLabel(e.target.value)}
                          placeholder="Name on the cake"
                        />
                      </Field>
                      <Field label="Max letters" note="Blank = no limit">
                        <input
                          className="ipt h-[44px]"
                          type="number"
                          min={1}
                          value={persoTextMax}
                          onChange={(e) => setPersoTextMax(e.target.value)}
                          placeholder="20"
                        />
                      </Field>
                      <Field label="Small note under it" full>
                        <input
                          className="ipt h-[44px]"
                          value={persoTextHint}
                          onChange={(e) => setPersoTextHint(e.target.value)}
                          placeholder="Written in icing — keep it short"
                        />
                      </Field>
                    </div>
                  )}

                  <Sw on={persoImage} onToggle={() => setPersoImage(!persoImage)}>
                    A photo they upload
                  </Sw>
                  {persoImage && (
                    <div className="pl-1 grid gap-3">
                      <Field label="What to call the box" full>
                        <input
                          className="ipt h-[44px]"
                          value={persoImageLabel}
                          onChange={(e) => setPersoImageLabel(e.target.value)}
                          placeholder="Photo for the mug"
                        />
                      </Field>
                      <Field label="Small note under it" full>
                        <input
                          className="ipt h-[44px]"
                          value={persoImageHint}
                          onChange={(e) => setPersoImageHint(e.target.value)}
                          placeholder="Clear, well-lit, at least 1000 px wide"
                        />
                      </Field>
                    </div>
                  )}

                  {(persoText || persoImage) && (
                    <Field label="Heading above them" full>
                      <input
                        className="ipt h-[44px]"
                        value={persoTitle}
                        onChange={(e) => setPersoTitle(e.target.value)}
                        placeholder="Make it personal"
                      />
                    </Field>
                  )}

                  {!persoText && !persoImage && (
                    <p className="text-[12.5px] text-body-soft m-0">
                      Both off — the product page shows nothing here.
                    </p>
                  )}
                </div>
              </Card>

              {/*
                DEC-PRD-027 — মালিক: *"আমরা কোন কোন product-এ customize করতে
                দিব, যা দিলে পাশে WhatsApp show করবে — তা customize করার
                option... সেটাও কোথাও দেখতে পেলাম না।"*

                ⚠️ বাক্সটা এতদিন **সব** product-এ দেখাত, আর নম্বরটা ছিল
                `wa.me/8801000000000` — আমার বসানো একটা বানানো নম্বর।
              */}
              <Card
                icon="phone"
                title="“Want this customised?” box"
                tip="The green WhatsApp strip under the buy buttons. Only put it on products you will really customise. The number comes from Company settings."
              >
                <div className="flex flex-col gap-3">
                  <Sw on={customiseOn} onToggle={() => setCustomiseOn(!customiseOn)}>
                    Show it on this product
                  </Sw>
                  {customiseOn && (
                    <>
                      <Field label="Heading" full>
                        <input
                          className="ipt h-[44px]"
                          value={customiseTitle}
                          onChange={(e) => setCustomiseTitle(e.target.value)}
                          placeholder="Want this customised?"
                        />
                      </Field>
                      <Field label="Line under it" full>
                        <input
                          className="ipt h-[44px]"
                          value={customiseSub}
                          onChange={(e) => setCustomiseSub(e.target.value)}
                          placeholder="Different colours, sizes or a theme — chat with our florists."
                        />
                      </Field>
                      {/*  ⚠️ নম্বর এখানে লেখা যায় না, আর সেটাই ঠিক — দুই
                          জায়গায় দুটো নম্বর রাখলে একদিন একটা পুরনো হয়ে
                          বসে থাকত।  */}
                      <p className="text-[12.5px] text-body-soft m-0">
                        Number from{" "}
                        <Link
                          href="/settings"
                          className="text-orchid font-semibold hover:underline"
                        >
                          Company settings
                        </Link>
                        {" "}— empty there = words, no button.
                      </p>
                    </>
                  )}
                </div>
              </Card>

              <Card
                icon="check"
                title="Trust badges"
                tip="The three promises under the photo. What the category gives is shown below — leave it alone and every product stays in step. Press “Use these and edit” only when this one product needs something different."
              >
                {/*
                  DEC-PRD-023 — মালিক, ২ আগস্ট ২০২৬: *"trust badge-এ তো আমি
                  কোন icon কিছুই custom করে বানাতে পারছি না, তুমি নিজের মতো
                  করে দিয়ে দিছ।"*

                  ⚠️ এখানে **template নেই আর**। template মানে ছিল আমার হাতে
                  লেখা তিনটে badge, যেগুলো মালিকের কোথাও বদলানোর পথ ছিল না।
                  এখন আসল জায়গা Categories → ওই category → "Product page —
                  badges & what's inside", যেখানে নিজের icon-ও দেওয়া যায়।
                  এই card শুধু ব্যতিক্রমের জন্য।
                */}
                <FromCategory
                  from={storyFrom}
                  count={catTrust.length}
                  hasOwn={trust.length > 0}
                  onCopy={() =>
                    setTrust(
                      catTrust.map((b) => ({
                        /*  DEC-PRD-031 — এক তালিকা, তাই সরাসরি।  */
                        icon: b.icon ?? "shield",
                        iconUrl: b.iconUrl ?? null,
                        label: b.label,
                        sub: b.sub ?? "",
                      })),
                    )
                  }
                  onClear={() => setTrust([])}
                >
                  {catTrust.map((b) => (
                    <div key={b.id} className="flex items-center gap-2 text-[13px]">
                      {b.iconUrl ? (
                        <span
                          className="w-[18px] h-[18px] rounded-[5px] bg-contain bg-center bg-no-repeat shrink-0"
                          style={{ backgroundImage: `url(${b.iconUrl})` }}
                        />
                      ) : (
                        <Icon name={b.icon ?? "check"} size={16} />
                      )}
                      <b className="font-semibold text-purple">{b.label}</b>
                      {b.sub && <span className="text-body-soft">· {b.sub}</span>}
                    </div>
                  ))}
                </FromCategory>
                {iconErr && (
                  <div className="text-[13px] text-[#c0392b] mb-2">{iconErr}</div>
                )}
                <div className="flex flex-col gap-2.5">
                  {trust.map((r, i) => {
                    const setRow = (patch: Partial<TrustRow>) =>
                      setTrust(trust.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                    return (
                      <div
                        key={i}
                        className="border border-lavender-deep rounded-[12px] bg-white"
                      >
                        <div className="flex items-start gap-3 p-3">
                          {/*  ⚠️ icon-টা এখন সত্যিই icon। আগে এখানে একটা
                              `<select>` ছিল যেখানে "truck · nationwide"
                              লেখা থাকত — মালিক: *"icon-এ text আসে কেন,
                              এটা তো image আসবে।"*  */}
                          <button
                            type="button"
                            onClick={() => setIconPick(iconPick === i ? null : i)}
                            title="Change the icon"
                            className="w-[42px] h-[42px] rounded-[11px] border border-lavender-deep grid place-items-center text-orchid shrink-0 hover:border-orchid transition-colors"
                          >
                            {iconBusy === i ? (
                              <Icon name="upload" size={16} />
                            ) : (
                              <ShopIconPreview name={r.icon} url={r.iconUrl} size={22} />
                            )}
                          </button>

                          <div className="min-w-0 flex-1 space-y-2">
                            <input
                              className="ipt font-semibold text-purple"
                              placeholder="2-Hour Delivery"
                              value={r.label}
                              onChange={(e) => setRow({ label: e.target.value })}
                            />
                            <input
                              className="ipt"
                              placeholder="inside Dhaka"
                              value={r.sub}
                              onChange={(e) => setRow({ sub: e.target.value })}
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setTrust(trust.filter((_, j) => j !== i));
                              setIconPick(null);
                            }}
                            className="w-[32px] h-[32px] rounded-[9px] grid place-items-center bg-lavender text-body-soft hover:bg-[#fdecea] hover:text-[#c0392b] transition-colors shrink-0"
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </div>

                        {iconPick === i && (
                          <div className="px-3 pb-3">
                            <div className="rounded-[12px] bg-lavender/40 border border-lavender-deep p-3">
                              {/*  ⚠️ মাপটা আগে, বাছার আগেই — file বেছে ফেলার
                                  পরে লিখলে সেটা আর কাজে লাগে না।  */}
                              <div className="flex items-center gap-2 bg-white border border-lavender-deep rounded-[9px] px-3 py-2 mb-3">
                                <span className="text-orchid shrink-0">
                                  <Icon name="upload" size={14} />
                                </span>
                                <span className="text-[12px] text-body">
                                  <b className="text-purple font-semibold">96 × 96 px</b> ·
                                  square · transparent · max 50 KB · SVG, PNG or WebP
                                </span>
                              </div>

                              <div className="text-[12px] text-body-soft mb-2">
                                Pick a symbol — these take the brand colour automatically.
                              </div>
                              <div
                                className="grid gap-1.5 mb-3"
                                style={{
                                  gridTemplateColumns: "repeat(auto-fill, minmax(38px, 1fr))",
                                }}
                              >
                                {ICON_NAMES.map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    onClick={() => {
                                      /*  নিজের ছবি বসলে built-in নাম মুছে যায়,
                                          আর উল্টোটাও — দুটো একসাথে থাকলে সারি
                                          দেখে বলা যেত না কোনটা দেখাবে।  */
                                      setRow({ icon: n, iconUrl: null });
                                      setIconPick(null);
                                    }}
                                    title={n}
                                    className={
                                      "aspect-square rounded-[10px] grid place-items-center border transition-colors " +
                                      (r.icon === n && !r.iconUrl
                                        ? "border-orchid text-orchid bg-white"
                                        : "border-transparent bg-white text-body hover:border-orchid hover:text-orchid")
                                    }
                                  >
                                    <ShopIconPreview name={n} size={19} />
                                  </button>
                                ))}
                              </div>

                              <div className="flex items-baseline gap-3 flex-wrap border-t border-lavender-deep pt-3">
                                <label className="inline-flex items-center gap-1.5 text-[12.5px] text-purple font-medium cursor-pointer hover:text-purple-deep">
                                  <Icon name="upload" size={14} /> Upload your own
                                  <input
                                    type="file"
                                    accept="image/svg+xml,image/png,image/webp"
                                    className="hidden"
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      e.target.value = "";
                                      if (!file) return;
                                      setIconBusy(i);
                                      setIconErr(null);
                                      try {
                                        const { url } = await uploadImage(file, "icons");
                                        setTrust((prev) =>
                                          prev.map((x, j) =>
                                            j === i ? { ...x, iconUrl: url, icon: "" } : x,
                                          ),
                                        );
                                        setIconPick(null);
                                      } catch (err) {
                                        setIconErr((err as Error).message);
                                      } finally {
                                        setIconBusy(null);
                                      }
                                    }}
                                  />
                                </label>
                                {r.iconUrl && (
                                  <button
                                    type="button"
                                    onClick={() => setRow({ iconUrl: null, icon: "shield" })}
                                    className="text-[12.5px] text-body-soft hover:text-[#c0392b]"
                                  >
                                    Remove my picture
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setTrust([
                      ...trust,
                      { icon: "shield", iconUrl: null, label: "", sub: "" },
                    ])
                  }
                  className={addBtn}
                >
                  <Icon name="plus" size={16} /> Add badge
                </button>
                {/*  ⚠️ "Later you can upload your own icon sets" লেখা ছিল
                    এখানে — DEC-PRD-023-এ সেই "later" এসে গেছে, আর জায়গাটা
                    Categories। প্রতিশ্রুতির লাইনটা তাই তুলে দেওয়া হলো।  */}
              </Card>
              <Card
                icon="book"
                title="What's inside"
                tip="The Item / Quantity table on the product page. The category’s list is shown below — press “Use these and edit” only when this one product needs a different list."
              >
                <FromCategory
                  from={storyFrom}
                  count={catSpec.length}
                  hasOwn={spec.length > 0}
                  onCopy={() => setSpec(catSpec.map((r) => ({ item: r.item, qty: r.qty })))}
                  onClear={() => setSpec([])}
                >
                  {catSpec.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 text-[13px]">
                      <b className="font-semibold text-purple">{r.item}</b>
                      <span className="text-body-soft">{r.qty}</span>
                    </div>
                  ))}
                </FromCategory>
                <div className="grid grid-cols-[1fr_170px_38px] gap-2.5 px-1 mb-1.5 text-[13px] text-body-soft font-medium">
                  <span>Item</span>
                  <span>Quantity</span>
                  <span />
                </div>
                <div className="flex flex-col gap-2.5">
                  {spec.map((r, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_170px_38px] gap-2.5 items-center bg-lavender/50 rounded-[12px] p-2.5"
                    >
                      <input
                        className="ipt h-[40px]"
                        placeholder="Red Rose"
                        value={r.item}
                        onChange={(e) =>
                          setSpec(
                            spec.map((x, j) =>
                              j === i ? { ...x, item: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <input
                        className="ipt h-[40px]"
                        placeholder="24 sticks"
                        value={r.qty}
                        onChange={(e) =>
                          setSpec(
                            spec.map((x, j) =>
                              j === i ? { ...x, qty: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setSpec(spec.filter((_, j) => j !== i))}
                        className={delBtn}
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSpec([...spec, { item: "", qty: "" }])}
                  className={addBtn}
                >
                  <Icon name="plus" size={16} /> Add item
                </button>
              </Card>
              <Card
                icon="book"
                title="FAQ — shows as “Before You Order”"
                tip="This product’s own questions. The category’s are shown too, underneath these — they add up, they do not replace."
              >
                {/*  ⚠️ FAQ-ই একমাত্র যেটা **যোগ হয়** — product-এরগুলো আগে,
                    তারপর category-রগুলো। Badge আর "What's inside" বদলে বসে।
                    পার্থক্যটা লিখে রাখা হলো, কারণ তিনটে card পাশাপাশি
                    থাকলে একই নিয়ম ধরে নেওয়াই স্বাভাবিক।  */}
                {templateBar(loadFaqTpl)}
                <div className="flex flex-col gap-2.5">
                  {faqs.map((r, i) => (
                    <div
                      key={i}
                      className="bg-lavender/50 rounded-[12px] p-3 flex items-start gap-2.5"
                    >
                      <div className="flex flex-col gap-2 flex-1">
                        <input
                          className="ipt h-[40px]"
                          placeholder="Question"
                          value={r.q}
                          onChange={(e) =>
                            setFaqs(
                              faqs.map((x, j) =>
                                j === i ? { ...x, q: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <textarea
                          className="ipt"
                          rows={2}
                          placeholder="Answer"
                          value={r.a}
                          onChange={(e) =>
                            setFaqs(
                              faqs.map((x, j) =>
                                j === i ? { ...x, a: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setFaqs(faqs.filter((_, j) => j !== i))}
                        className={delBtn}
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setFaqs([...faqs, { q: "", a: "" }])}
                  className={addBtn}
                >
                  <Icon name="plus" size={16} /> Add question
                </button>
              </Card>
              <Card
                icon="truck"
                title="When nationwide isn’t available"
                tip="Shown when a shopper has chosen All Bangladesh and this product only travels inside Dhaka."
              >
                <textarea
                  className="ipt"
                  rows={2}
                  value={oz}
                  onChange={(e) => setOz(e.target.value)}
                  placeholder="Available inside Dhaka only."
                />
              </Card>
            </>
          )}

          {/*  SEO-D01 — what Google and WhatsApp see.

               Leaving it blank is a perfectly good answer: the storefront falls
               back to the product name and short description. What it costs is
               control — Google will pick its own line out of the page, and it
               usually picks badly. Marketing → SEO lists every product still
               waiting for one, so nothing has to be remembered here. */}
          {sec === "seo" && (
            <>
              <Card icon="search" title="How this page looks in Google"
                hint="Leave it empty and the storefront falls back to the name and the short description.">
                <div className="grid gap-4">
                  <Field label="Title" note={`${metaTitle.length}/60 — Google cuts off around 60`}>
                    <input
                      className="ipt h-[44px]"
                      value={metaTitle}
                      onChange={(e) => setMetaTitle(e.target.value)}
                      placeholder={name || "Red Rose Bouquet — same-day delivery in Dhaka"}
                    />
                  </Field>
                  <Field label="Description" note={`${metaDescription.length}/160 — the grey lines under the title`}>
                    <textarea
                      className="ipt min-h-[80px] py-2"
                      value={metaDescription}
                      onChange={(e) => setMetaDescription(e.target.value)}
                      placeholder={shortDesc || "Twelve fresh red roses, hand-tied and delivered across Dhaka in two hours."}
                    />
                  </Field>

                  {/* the actual search result, as it will appear */}
                  <div className="rounded-[12px] border border-lavender-deep bg-white p-4">
                    <div className="text-[12px] text-[#4d5156] truncate">
                      {WEB_HOST} › {slugV || "product-address"}
                    </div>
                    <div className="text-[17px] leading-snug mt-0.5" style={{ color: "#1a0dab" }}>
                      {(metaTitle || name || "Product name").slice(0, 60)}
                      {(metaTitle || name || "").length > 60 && "…"}
                    </div>
                    <div className="text-[13px] leading-snug mt-1 text-[#4d5156]">
                      {(metaDescription || shortDesc || "Google will pick a line out of the page itself.").slice(0, 160)}
                      {(metaDescription || shortDesc || "").length > 160 && "…"}
                    </div>
                  </div>
                </div>
              </Card>

              <Card icon="photo" title="When somebody shares the link"
                hint="The picture that shows on WhatsApp, Facebook and Messenger.">
                <div className="grid gap-4">
                  {/*
                    DEC-PRD-024 — মালিক, ২ আগস্ট ২০২৬: *"image-এর কীসের link
                    দেব বুঝলাম না।"*

                    ⚠️ ন্যায্য প্রশ্ন — এখানে শুধু "https://…" লেখা একটা ঘর
                    ছিল, অথচ দোকানের কাছে ছবির URL আসবে কোথা থেকে? এখন
                    সরাসরি upload করা যায়, ঠিক যেভাবে product-এর ছবি হয়।
                    ঘরটা রয়ে গেছে, কারণ কখনো অন্য জায়গার ছবির ঠিকানা
                    বসাতেই হতে পারে।
                  */}
                  <Field
                    label="Share picture"
                    note="Blank uses the first product photo. Best at 1200 × 630."
                  >
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {ogImageUrl && (
                        <span
                          className="w-[92px] h-[48px] rounded-[10px] border border-lavender-deep shrink-0"
                          style={{ background: `url(${ogImageUrl}) center/cover no-repeat` }}
                        />
                      )}
                      <label className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-purple border border-lavender-deep bg-white rounded-[10px] px-3 py-2 hover:border-orchid transition-colors cursor-pointer">
                        <Icon name="upload" size={15} />
                        {ogBusy ? "Uploading…" : ogImageUrl ? "Change picture" : "Upload a picture"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          disabled={ogBusy}
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (!f) return;
                            setOgBusy(true);
                            try {
                              /*  ১ MB-র সীমা সব ছবিতেই — মালিকের নিয়ম।
                                  ১:১ জোর করা হয় না; share card চওড়া।  */
                              const url = await uploadItemImage(f, "products", 1200);
                              setOgImageUrl(url);
                            } catch {
                              /* না উঠলে ঘরটা আগের মতোই থাকে */
                            } finally {
                              setOgBusy(false);
                            }
                          }}
                        />
                      </label>
                      {ogImageUrl && (
                        <button
                          type="button"
                          onClick={() => setOgImageUrl("")}
                          className="text-[13px] text-body-soft hover:text-[#c0392b]"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      className="ipt h-[40px] mt-2"
                      value={ogImageUrl}
                      onChange={(e) => setOgImageUrl(e.target.value)}
                      placeholder="…or paste a picture address"
                    />
                  </Field>
                  <label className="flex items-start gap-2.5 text-[14px] cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={noIndex}
                      onChange={(e) => setNoIndex(e.target.checked)}
                    />
                    <span>
                      <b>Keep this page out of Google</b>
                      <div className="text-[12.5px] text-body-soft">
                        For a one-off corporate listing, or something only meant to be reached by a
                        link you send. It stays on the site — it just will not be found by searching.
                      </div>
                    </span>
                  </label>
                </div>
              </Card>
            </>
          )}

          {/*
            ── STEP FOOTER, added 1 Aug 2026 ───────────────────────────────
            Owner: "there is no next or any icon at the bottom to go to the
            next tab — you have to go back up and use the side menu."

            He is right, and it was worse than an inconvenience: the sidebar
            is `sticky top-[84px]`, so on a long section it scrolls out of
            reach entirely and the only way onward is back to the top. Nine
            sections filled in that way is nine scrolls to nowhere.

            The next button names the section it goes to. "Next →" makes you
            find out by pressing it; "Next: Pricing" lets you decide.
          */}
          <div className="flex items-center gap-3 mt-6 mb-2">
            {secIdx > 0 ? (
              <button
                type="button"
                onClick={() => goSec(secIdx - 1)}
                className="inline-flex items-center gap-2 text-[13.5px] font-medium text-body-soft hover:text-purple border border-lavender-deep bg-white rounded-[12px] px-4 py-3 transition-colors"
              >
                <Icon name="chevronLeft" size={16} />
                {SECTIONS[secIdx - 1][1]}
              </button>
            ) : (
              <span />
            )}

            {secIdx < SECTIONS.length - 1 && (
              <button
                type="button"
                onClick={() => goSec(secIdx + 1)}
                className="ml-auto inline-flex items-center gap-2.5 text-[14px] font-medium text-white bg-purple hover:bg-purple-deep rounded-[12px] px-5 py-3 shadow-soft transition-colors"
              >
                <span className="opacity-70 text-[13px]">Next</span>
                {SECTIONS[secIdx + 1][1]}
                <span className="rotate-180 inline-flex">
                  <Icon name="chevronLeft" size={16} />
                </span>
              </button>
            )}

            {/*  The last section has nowhere to go next, so it offers the
                thing you were always heading towards instead.  */}
            {secIdx === SECTIONS.length - 1 && (
              <button
                type="button"
                onClick={() => void handleSave(true)}
                disabled={saving}
                className="ml-auto inline-flex items-center gap-2 text-[14px] font-medium text-white bg-purple hover:bg-purple-deep disabled:opacity-60 rounded-[12px] px-5 py-3 shadow-soft transition-colors"
              >
                <Icon name="check" size={16} />
                {saving ? "Publishing…" : "Publish"}
              </button>
            )}
          </div>
        </div>

        {/* live preview */}
        <aside className="w-[300px] shrink-0 sticky top-[84px] hidden lg:block">
          <div className="text-[13px] text-body-soft font-medium uppercase tracking-[0.06em] mb-2.5 px-1">
            Live preview
          </div>
          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-lift overflow-hidden">
            <div
              className="relative h-[190px] bg-cover bg-center"
              style={
                previewIsPhoto
                  ? { backgroundImage: `url(${previewBg})` }
                  : { background: previewBg }
              }
            >
              {badge && (
                <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-white/92 text-purple text-[11.5px] font-medium px-2.5 py-1 rounded-full shadow-soft">
                  <Icon name={badge.i} size={13} /> {badge.t}
                </span>
              )}
              {showDisc && (
                <span className="absolute top-3 right-3 bg-rosegold text-white text-[11px] font-medium px-2.5 py-1 rounded-full shadow-soft">
                  {discType === "PCT" ? `${dv || 0}% OFF` : "OFFER"}
                </span>
              )}
              <span className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-white/85 grid place-items-center text-rosegold">
                <Icon name="heart" size={17} />
              </span>
            </div>
            <div className="p-4">
              <div className="text-purple font-medium leading-snug">
                {name || "Product name"}
              </div>
              {shortDesc && (
                <div className="text-[13px] text-body-soft mt-1 leading-snug">
                  {shortDesc}
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-1.5 text-[13px] text-body-soft">
                <span className="text-rosegold flex">
                  <Icon name="star" size={13} />
                  <Icon name="star" size={13} />
                  <Icon name="star" size={13} />
                  <Icon name="star" size={13} />
                  <Icon name="star" size={13} />
                </span>
                {salesLabel && <span>· {salesLabel}</span>}
              </div>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-[22px] font-medium text-purple font-display">
                  {taka(offer || 0)}
                </span>
                {showDisc && (
                  <span className="text-[14px] line-through text-body-soft">
                    {taka(sellN)}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="w-full mt-3.5 bg-purple text-white text-[13.5px] font-medium py-2.5 rounded-[11px]"
              >
                Add to cart
              </button>
            </div>
          </div>

          {/* mini summary */}
          <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft mt-3 p-3.5 text-[12.5px]">
            <div className="flex justify-between py-1.5 border-b border-lavender-deep">
              <span className="text-body-soft">Margin</span>
              <span className={margin < 0 ? "text-[#c0392b]" : "text-purple"}>
                {costN > 0 ? `${taka(margin)} · ${marginPct}%` : "—"}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-lavender-deep">
              <span className="text-body-soft">Stock</span>
              <span>
                {/*  DEC-PRD-014 — variant থাকলে এখানেও যোগফল, নাহলে
                     preview একটা সংখ্যা আর Stock tab আরেকটা দেখাত।  */}
                {stockMode !== "MANUAL"
                  ? "Tracked"
                  : variants.length > 0
                    ? variants.reduce((n, v) => n + (parseInt(v.stockQty, 10) || 0), 0)
                    : stock || "0"}
                {showStock ? "" : " · hidden"}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-lavender-deep">
              <span className="text-body-soft">Zone</span>
              <span>{zone === "DHAKA" ? "Inside Dhaka" : "Nationwide"}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-body-soft">Type</span>
              <span className="capitalize">{ptype.toLowerCase()}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
