"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PRODUCTS } from "../_data/products";
import { getProductDetail } from "../_data/productDetails";
import { Info } from "./ItemEditor";
/*  DEC-ITM-012 — the warehouse mugshot, drawn by the one component every
    other item list uses. Owner, 23 Aug: *"inventory connect krte gle jen
    avabe na. image show o baki sob jaygay jevabe ase sevabe jen ase"* — an
    item picker that shows no photo is a different screen from every other
    place items are listed, and the eye has to start again.  */
import { ItemThumb } from "./ItemUI";
import Icon from "./Icon";
import BundleEditor from "./BundleEditor";
import CraftEditor from "./CraftEditor";
/*  One thumbnail component, so a product is never listed as a grey square
    while its photo sits in the database (owner, 24 Aug 2026).  */
import ProductThumb from "./ProductThumb";
import ShopIconPreview, { ICON_NAMES } from "./ShopIconPreview";
import {
  createProduct,
  updateProduct,
  getProductBySlug,
  listCategories,
  listTags,
  listBrands,
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
  /*  DEC-PRD-030 — the category's badges and "What's inside" must show on
      this screen too, otherwise the owner thinks nothing is set.  */
  listCategoryBadges,
  listCategorySpecs,
  /*  DEC-PRD-046 — the category's named "What's inside" lists.  */
  listCategorySpecLists,
  type ApiCategorySpecList,
  /*  23 Aug 2026 — the FAQ was the one that showed nothing here, so the owner
      read it as broken. It always reached the website; this screen never
      said so.  */
  listCategoryFaqs,
  type ApiCategoryTrustBadge,
  type ApiCategorySpec,
  type ApiCategoryFaq,
  listItems,
  getInvItemStock,
  listNatures, createNature, updateNature, deleteNature, type ApiNature,
  listSuppliers,
  type ApiItem,
  type ApiSupplier,
  type InvItemStock,
  type ApiCategory,
  type ApiBrand,
  type ApiTag,
  type ApiProduct,
  type ApiVariantAttribute,
  type AddOnBundle,
  WEB_HOST,
  storefrontUrl,
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
  ⚠️ There used to be a hand-written list here called `TRUST_ICONS` — eight
  entries like "bolt · 2-hour", "truck · nationwide", in a `<select>`.
  DEC-PRD-031, owner, 3 Aug 2026: *"why does text show for the icon — it
  should be an image"*.

  He was right, and it wasn't only cosmetic. The category picker ran off a
  different list (`ICON_NAMES`, 20 entries), and the two were translated
  between via `startsWith()`. Any name missing from this shorter list —
  "clock", "medal", "globe" — would silently fall through to the wrong icon
  when copied over.

  Now both screens use **the same list, the same picker, the same upload**.
  No translation, so no mistranslation.
*/
/*
  ⚠️ The hand-written OCCASIONS and RECIPIENTS lists were removed from
  here — DEC-PRD-022, 2 Aug 2026. That was the reason a new tag created in
  Occasions & Tags never showed up on this screen. Now the chips are drawn
  from `/tags`, grouped — whatever the owner creates shows up here.
*/

/*
  ⚠️ PRICING SITS LAST, AND THAT IS THE OWNER'S CALL — 2 Aug 2026:
  *"ami chai price tab sheshe thakuk and sekhanei price ar sob calculation
  hok. ata bujte and dekhte valo lagbe."*

  Why this is genuinely good: price is no longer a single number — colour/size
  variants carry their own price (DEC-PRD-012), and a bundle's discount
  applies to the total including the main product (DEC-PRD-018). If pricing
  came first, the owner would type a number that the next two tabs then
  override, making him decide the same thing twice. With it last, all the
  facts are already in hand and it's set once, correctly.
*/
/*  ── Order matters (owner, 8 Aug 2026) ──────────────────────────────────
    Variants sits right after Basics because everything below it now asks
    "…and for each variant?" — the photo tab, the stock tab and the pricing
    tab each carry a per-variant section. Deciding which variants exist is
    therefore the second thing you do, not the fifth.  */
const SECTIONS = [
  ["basics", "Basics", "tag"],
  ["variants", "Variants & options", "layers"],
  ["stock", "Stock & lead time", "box"],
  ["media", "Photos & video", "photo"],
  ["delivery", "Delivery", "truck"],
  ["tags", "Tags", "hash"],
  ["story", "Product story", "book"],
  // SEO-D01 — written here while adding the product, or later in bulk from
  // Marketing → SEO. Same six columns; whichever is convenient that day.
  ["seo", "Search & sharing", "search"],
  ["price", "Pricing", "cash"],
] as const;
type SecId = (typeof SECTIONS)[number][0];

/*  DEC-PRD-030 — if `iconUrl` is set, that's what renders, not `icon`.  */
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
 * ⚠️ The owner said the same thing twice — 1 Aug ("clean and bold, so looking
 * at it makes you want to work") and 3 Aug ("too much text... it shouldn't
 * feel boring or cluttered while working"). After the explanation was moved
 * inside a chip on the Basics tab, that became his preference, and the other
 * two tabs were lagging behind.
 *
 * Why this is genuinely good: an always-visible explanation gets read once,
 * then becomes furniture — it costs a glance every time and only pays back
 * the first time. Inside the `?` it costs nothing until the moment it's
 * needed, and is right there when it is.
 */
/*  The house ⓘ (CLAUDE.md §17). This used to be a `?` carrying a native
    `title`, which meant a half-second wait, an OS-styled box, and nothing at
    all on a phone. `Info` is the same one every other master screen uses: it
    opens on hover AND on tap, and it is drawn outside the card so no rounded
    corner can clip it.  */

/* ═══════════ Product story — the chip rail, the groups, the phone ═══════════
   Owner's pick, 22 Aug 2026 ("B + D together"). Five groups behind a bold chip
   rail, and the customer's page standing beside them, wired both ways.        */


/* ═══════════ Variants tab — the same chip rail as Product story ═══════════
   Five cards doing five different jobs sat in one column; only the first is
   about variants at all. Grouped 22 Aug 2026, in the language the owner
   approved.                                                                */

type VarG = "options" | "bundles" | "upgrades" | "addons";

const VAR_GROUPS: { id: VarG; label: string }[] = [
  { id: "options", label: "Colours & sizes" },
  { id: "bundles", label: "Bundles" },
  { id: "upgrades", label: "Upgrades" },
  { id: "addons", label: "Add-ons" },
];

function VarChips({
  value, onChange, filled, hasVariants,
}: {
  value: VarG;
  onChange: (g: VarG) => void;
  filled: Record<VarG, boolean>;
  /*  A product answering "One version" on Basics has no colours to pick, but
      it still sells bundles, upgrades and add-ons. So the chip goes, the tab
      stays.  */
  hasVariants: boolean;
}) {
  return (
    <div className="flex gap-2 flex-wrap mb-4">
      {VAR_GROUPS.filter((g) => g.id !== "options" || hasVariants).map((g) => {
        const on = value === g.id;
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => onChange(g.id)}
            className={
              "text-[13.5px] font-bold px-4 py-2.5 rounded-[11px] border transition-all inline-flex items-center gap-2 " +
              (on ? "text-white" : "bg-white hover:bg-lavender/60")
            }
            style={on
              ? { background: "#3b1152", borderColor: "#3b1152", boxShadow: "0 4px 14px rgba(59,17,82,.3)" }
              : { borderColor: "var(--color-lavender-deep)", color: "var(--color-purple)" }}
          >
            {g.label}
            {filled[g.id] && (
              <span className="w-[6px] h-[6px] rounded-full" style={{ background: on ? "#e9a8f5" : "#12a172" }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

function VarGroup({ id, open, children }: { id: VarG; open: VarG; children: React.ReactNode }) {
  if (id !== open) return null;
  return <>{children}</>;
}

type StoryG = "nature" | "signal" | "perso" | "trust" | "why" | "inside";

const STORY_GROUPS: { id: StoryG; label: string }[] = [
  { id: "nature", label: "Nature" },
  { id: "signal", label: "Sales signal" },
  { id: "perso", label: "Personalise" },
  { id: "trust", label: "Trust" },
  /*  Moved here from the Variants tab, 23 Aug 2026 — owner: *"why buy from us
      ata product upload page a jay nai."* It is page copy, and it belongs
      beside the other page copy. Why it was unreachable: see the note on
      `visibleSections`.  */
  { id: "why", label: "Why buy from us" },
  { id: "inside", label: "Inside & FAQ" },
];

function StoryChips({
  value, onChange, filled,
}: {
  value: StoryG;
  onChange: (g: StoryG) => void;
  /** a soft dot marks a group that already holds something */
  filled: Record<StoryG, boolean>;
}) {
  return (
    <div className="flex gap-2 flex-wrap mb-4">
      {STORY_GROUPS.map((g) => {
        const on = value === g.id;
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => onChange(g.id)}
            className={
              "text-[13.5px] font-bold px-4 py-2.5 rounded-[11px] border transition-all inline-flex items-center gap-2 " +
              (on ? "text-white" : "bg-white hover:bg-lavender/60")
            }
            style={on
              ? { background: "#3b1152", borderColor: "#3b1152", boxShadow: "0 4px 14px rgba(59,17,82,.3)" }
              : { borderColor: "var(--color-lavender-deep)", color: "var(--color-purple)" }}
          >
            {g.label}
            {filled[g.id] && (
              <span className="w-[6px] h-[6px] rounded-full" style={{ background: on ? "#e9a8f5" : "#12a172" }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

function StoryGroup({ id, open, children }: { id: StoryG; open: StoryG; children: React.ReactNode }) {
  if (id !== open) return null;
  return <>{children}</>;
}

/**
 * One tappable part of the phone.
 *
 * It began as a story-tab device and became the whole form's map (22 Aug
 * 2026): whatever part of the customer's page you press, the editor opens the
 * section that owns it. So it no longer knows about story groups — the caller
 * says where to go.
 */
function Hot({
  on, onPick, children,
}: { on: boolean; onPick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={
        "w-full text-left rounded-[10px] px-2 py-1.5 border transition-colors " +
        (on ? "border-purple bg-lavender" : "border-transparent hover:border-orchid-mid hover:bg-orchid-soft/50")
      }
      style={{ borderStyle: "dashed" }}
    >
      {children}
    </button>
  );
}


/* ═══════════ DEC-PRD-044 · the nature chips, kept from here ═══════════
   The owner asked for the thing every other small master in this panel got
   (DEC-GBL-004, the wastage reasons): the list is managed from the chips
   themselves, not from a page nobody would find. Press one to use it, hover
   to rename or remove it, and the last chip adds a new kind.               */

function NatureChips({
  rows, setRows, active, onPick,
}: {
  rows: ApiNature[];
  setRows: (r: ApiNature[]) => void;
  active: string;
  onPick: (n: ApiNature) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const startEdit = (n: ApiNature) => {
    setEditing(n.id);
    setAdding(false);
    setDraftName(n.name);
    setDraftLabel(n.label);
  };
  const startAdd = () => {
    setEditing(null);
    setAdding(true);
    setDraftName("");
    setDraftLabel("");
  };
  const close = () => { setEditing(null); setAdding(false); setErr(null); };

  async function save() {
    const name = draftName.trim();
    const label = draftLabel.trim();
    if (!name || !label) { setErr("A kind needs a name and the line the customer reads."); return; }
    try {
      if (adding) {
        const created = await createNature({ name, label, sortOrder: rows.length });
        setRows([...rows, created]);
      } else if (editing) {
        const saved = await updateNature(editing, { name, label });
        setRows(rows.map((r) => (r.id === editing ? saved : r)));
      }
      close();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save that.");
    }
  }

  async function remove(n: ApiNature) {
    if (!confirm(`Remove “${n.name}” from the list? Products already using it keep their line.`)) return;
    try {
      await deleteNature(n.id);
      setRows(rows.filter((r) => r.id !== n.id));
      close();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove that.");
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-lavender-deep">
      {err && (
        <div className="mb-3 rounded-[10px] border border-[#e0a1a1] bg-[#fdecea] px-3 py-2 text-[12.5px] font-semibold text-[#c0392b]">
          {err}
        </div>
      )}

      {/*  ⚠️ NOT tiny circles hovering over the corner (owner, 23 Aug 2026:
           "edit and delete button valo hoy nai"). Two 20px badges pinned at
           -top-2 -right-2 sat ON the chip, clipped against its neighbour and
           were a coin-toss to hit.

           The pencil lives INSIDE the chip now, behind a hairline, and it only
           appears on the chip under the cursor. Removing moved out of the row
           entirely — it is a red button in the panel below, where there is room
           to say what it does and no chance of hitting it by accident.  */}
      <div className="flex flex-wrap gap-2">
        {rows.map((n) => {
          const on = active.trim().toLowerCase() === n.name.trim().toLowerCase();
          const being = editing === n.id;
          return (
            /*  ⚠️ CHOSEN AND BEING-EDITED MUST NOT LOOK THE SAME (owner, 23 Aug
                2026: "aksathe 2 ta job select hoy?"). Both wore the same solid
                purple, so opening the pencil on Edible made it look picked
                while Fresh flower was the one actually on the product.

                Chosen  = filled purple with a tick — this is the product's kind.
                Editing = white with a purple ring — this one is open below.
                One is an answer, the other is a workbench.  */
            <span key={n.id}
              className="group/nat inline-flex items-stretch rounded-[11px] border-2 overflow-hidden transition-all"
              style={on
                ? { borderColor: "#6d3a9c", background: "#6d3a9c", boxShadow: "0 3px 10px #6d3a9c55" }
                : being
                  ? { borderColor: "#6d3a9c", background: "#fff", boxShadow: "0 0 0 3px #f3ebf8" }
                  : { borderColor: "var(--color-lavender-deep)", background: "#fff" }}>
              <button
                type="button"
                onClick={() => onPick(n)}
                title={n.label}
                className={"text-[13px] font-bold pl-3.5 pr-3 py-2 inline-flex items-center gap-1.5 " +
                  (on ? "text-white" : "text-purple hover:bg-lavender/50")}
              >
                {on && <Icon name="check" size={13} />}
                {n.name}
              </button>
              <button
                type="button"
                onClick={() => startEdit(n)}
                title={`Rename “${n.name}” or change its line`}
                /*  The pencil stays visible on the chip that is open, so the
                    way back out is where the way in was.  */
                className={"px-2.5 grid place-items-center border-l transition-opacity " +
                  (being ? "opacity-100" : "opacity-0 group-hover/nat:opacity-100 focus:opacity-100 ") +
                  (on ? "text-white/80 hover:text-white" : being ? "text-purple" : "text-body-soft hover:text-purple")}
                style={{ borderColor: on ? "rgba(255,255,255,.28)" : "var(--color-lavender-deep)" }}
              >
                <Icon name="edit" size={13} />
              </button>
            </span>
          );
        })}

        <button type="button" onClick={startAdd}
          className="text-[13px] font-bold px-3.5 py-2 rounded-[11px] border-2 border-dashed inline-flex items-center gap-1.5 hover:bg-lavender/50"
          style={{ borderColor: "var(--color-lavender-deep)", color: "var(--color-purple)" }}>
          <Icon name="plus" size={14} /> Add a kind
        </button>
      </div>

      {(adding || editing) && (
        <div className="mt-3 rounded-[12px] border border-lavender-deep bg-lavender/40 p-3.5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[12px] font-bold text-purple mb-1.5">Kind</div>
              <input className="ipt h-[40px]" value={draftName} autoFocus
                onChange={(e) => setDraftName(e.target.value)} placeholder="Fresh flower" />
            </div>
            <div>
              <div className="text-[12px] font-bold text-purple mb-1.5 flex items-center gap-1.5">
                Line the customer reads
              </div>
              <input className="ipt h-[40px]" value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)} placeholder="100% Fresh Flowers" />
            </div>
          </div>
          <div className="flex gap-2 mt-3.5 flex-wrap items-center">
            <button type="button" onClick={() => void save()}
              className="bg-purple hover:bg-purple-deep text-white text-[13.5px] font-bold px-5 py-2.5 rounded-[11px]">
              {adding ? "Add it" : "Save"}
            </button>
            <button type="button" onClick={close}
              className="border-2 border-lavender-deep bg-white text-purple text-[13.5px] font-bold px-5 py-2.5 rounded-[11px] hover:border-orchid">
              Cancel
            </button>
            {editing && (
              <button type="button" onClick={() => void remove(rows.find((r) => r.id === editing)!)}
                className="ml-auto border-2 bg-white text-[13.5px] font-bold px-5 py-2.5 rounded-[11px] inline-flex items-center gap-2 hover:bg-[#fdecea]"
                style={{ borderColor: "#f0c8c2", color: "#b42318" }}>
                <Icon name="trash" size={15} /> Remove this kind
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Tip({ why }: { why: string }) {
  return (
    <span className="ml-2 align-middle inline-flex">
      <Info text={why} />
    </span>
  );
}

/*
  ═══════════════════════════════════════════════════════════════════════════
  DEC-PRD-030 — the "coming from category" box.

  Owner, 3 Aug 2026: *"ami catagory page a giye whats inside and trust
  budge a add krlm... tahole product story tab a ata auto show krbe pore
  ami chaile nijer moto kre edit o krte parbo right?"*

  ⚠️ Two states, and keeping the difference clear is this component's
  whole job:

    product has nothing of its own → show the category's rows greyed out,
                                      plus a button
    product has its own            → the category's rows no longer show;
                                      instead, one line: "this is overriding
                                      the category's", with a way back

  ⚠️ The greyed-out rows are **never saved anywhere**. They're only a
  mirror — whatever the website is showing right now. They get copied only
  when the button is pressed.
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
  /** the category's name, e.g. "Demo Gifts" */
  from: string;
  /** how many rows the category has */
  count: number;
  /** whether the product has set its own */
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
  /**
   * ⚠️ NO LONGER A VISIBLE LINE (owner, 22 Aug 2026: "add product page a joto
   * barti ajebaje text ache sob remove kro"). Twenty cards each carrying a
   * grey sentence under its heading is most of what made this page tiring —
   * and it is the exact thing the house rule strikes out (CLAUDE.md §17).
   *
   * The prop stays so twenty call sites did not have to be rewritten, but the
   * words now go where every other explanation goes: behind the ⓘ.
   */
  hint?: string;
  /** the same words, behind the ⓘ */
  tip?: string;
  children: React.ReactNode;
}) {
  const why = tip ?? hint;
  return (
    <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-6 mb-5">
      <div className="flex gap-3 items-center mb-3.5">
        {icon && (
          <span className="w-9 h-9 rounded-[11px] bg-orchid-soft text-purple grid place-items-center shrink-0">
            <Icon name={icon} size={19} />
          </span>
        )}
        <h3 className="font-display font-bold text-[17.5px] text-purple m-0 leading-tight tracking-[-0.01em]">
          {title}
          {why && <Tip why={why} />}
        </h3>
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
    /*  BOLD and clear (CLAUDE.md §16, owner 22 Aug 2026). The live half wore
        white on lavender, which read as "slightly lighter" rather than "this
        one is on". It carries the brand purple now, with a shadow, exactly
        like the Chips / Image cards switch he approved.  */
    <div className="inline-flex self-start w-fit rounded-[12px] p-[4px] gap-[4px] flex-wrap"
      style={{ background: "#f3ebf8", border: "1px solid #6d3a9c33" }}>
      {options.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            disabled={o.disabled}
            onClick={() => onChange(o.v)}
            className={
              "text-[13px] px-4 py-2 rounded-[9px] font-bold transition-all " +
              (o.disabled ? "opacity-40 cursor-not-allowed" : on ? "text-white" : "hover:bg-white/70")
            }
            style={on && !o.disabled
              ? { background: "#6d3a9c", boxShadow: "0 3px 10px #6d3a9c55" }
              : { color: "#470066" }}
          >
            {o.label}
          </button>
        );
      })}
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
      <span className="font-semibold text-purple">{children}</span>
    </button>
  );
}

function Chips({
  all,
  value,
  onToggle,
  gold,
  labels,
}: {
  all: string[];
  value: string[];
  onToggle: (v: string) => void;
  gold?: boolean;
  /*  8 Aug 2026 (owner: "new tag add krlm but product page-e update hoy nai")
      — the chip used to print the SLUG prettified. Rename a tag in Occasions
      & Tags and the picker here kept showing the old slug-derived words, so
      renames looked like they never landed. The slug stays the stable value;
      the NAME is what people read.  */
  labels?: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {all.map((c) => {
        const on = value.includes(c);
        /*  Bold, with a tick, and a shadow when it is on (CLAUDE.md §16). It
            used to be a medium-weight pill that only changed colour, so a
            picked tag and an unpicked one read almost the same from a step
            back — on a row of twelve, that is the whole point of the row.  */
        const ink = gold ? "#b76e79" : "#6d3a9c";
        return (
          <button
            key={c}
            type="button"
            onClick={() => onToggle(c)}
            className={
              "text-[13px] px-3.5 py-2 rounded-full border-2 font-bold capitalize transition-all inline-flex items-center gap-1.5 " +
              (on ? "text-white" : "bg-white hover:bg-lavender/50")
            }
            style={on
              ? { background: ink, borderColor: ink, boxShadow: `0 3px 10px ${ink}55` }
              : { borderColor: "var(--color-lavender-deep)", color: "var(--color-purple)" }}
          >
            {on && <Icon name="check" size={13} />}
            {labels?.[c] ?? c.replace(/-/g, " ")}
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
  /** the line that used to sit UNDER the box — now the ⓘ beside the label */
  note?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={"flex flex-col gap-2 " + (full ? "col-span-full" : "")}>
      {label && (
        <label className="text-[13.5px] font-semibold text-body tracking-[0.01em] flex items-center gap-1.5">
          {label}
          {note && <Info text={note} />}
        </label>
      )}
      {children}
      {/*  A field with no label still needs somewhere for its note to live.  */}
      {note && !label && (
        <span className="self-start"><Info text={note} /></span>
      )}
    </div>
  );
}

/**
 * A number box that says what it is measuring, inside the box.
 *
 * ⚠️ WHY THIS EXISTS — owner, 1 Aug 2026: *"there's no way to tell the day
 * field from the time field, which one is day and which is time"*. He was
 * looking at two identical empty rectangles, one wanting minutes and one
 * wanting days. The only thing telling
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
 * *"the whole tab is too much text, doesn't look good at all... after
 * clicking, the right side turns messy"*. Two separate faults, both mine:
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
  /**
   * The result of what was typed — "Ready today", "Page shows Out of stock".
   *
   * ⚠️ IT NO LONGER SITS UNDER THE LABEL (owner, 23 Aug 2026: "ai page a
   * ojotha onk text ache, agula remove kro or icon ar maje guchiye daw").
   * Four rows on the Stock tab each carried one, and each was saying what the
   * control beside it already said: a switch reading Off with "The page never
   * mentions it" under it, a 0 DAYS box with "Ready today" under it. The
   * control is the answer; the sentence was an echo.
   *
   * It is kept, behind the ⓘ, because on a row that is NOT at its default —
   * "Page shows Pre-order · back on 30 Sep" — it says something the control
   * cannot fit.
   */
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
          {/*  Only when the row has no chip. A `Where` chip already carries its
               own ⓘ, and two dots side by side is the clutter this was meant
               to remove, not add.  */}
          {hint && !chip && <HintDot>{hint}</HintDot>}
        </div>
      </div>
      {/*  FIXED, never `flex-wrap`. See the note above — this is why the right
          side stopped moving about.  */}
      <div className="w-[230px] shrink-0 flex justify-end">{children}</div>
    </div>
  );
}

/**
 * A ⓘ whose content is a NODE, not a string — the row hints carry markup
 * ("Page shows *Out of stock*"). `Info` takes text only, so this is the same
 * dot with a hover bubble that can hold an element.
 */
function HintDot({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-flex group align-middle">
      <span
        className="w-[16px] h-[16px] rounded-full grid place-items-center text-[10px] font-bold cursor-help shrink-0"
        style={{ background: "#efe4f7", color: "#7a5b8c" }}
      >
        i
      </span>
      <span
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+7px)] z-[60] w-[230px]
                   rounded-[10px] px-3 py-2 text-[12px] leading-snug text-white opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "#2c0f3d", boxShadow: "0 6px 20px rgba(44,15,61,.28)" }}
      >
        {children}
      </span>
    </span>
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

/* ── the offer window, in Dhaka time — DEC-PRD-042 ─────────────────────────
   A shop day is a Dhaka day. If these conversions used the browser's own
   zone, the same offer would start at a different moment depending on which
   laptop saved it, and an owner travelling abroad would quietly move every
   sale he touched. Both directions are pinned to +06:00.

   `discountStartsAt`/`EndsAt` travel as instants (ISO with the offset);
   `<input type="datetime-local">` speaks "YYYY-MM-DDTHH:mm" with no zone.
   These two functions are the only bridge between them.                    */
const BD_OFFSET_MIN = 6 * 60;

export function toDhakaLocal(iso?: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t + BD_OFFSET_MIN * 60_000).toISOString().slice(0, 16);
}

/** "" → null. A date with no time takes `fallbackTime` (start 00:00, end 23:59). */
export function fromDhakaLocal(local: string, fallbackTime: string): string | null {
  if (!local) return null;
  const [d, tm] = local.split("T");
  if (!d) return null;
  return `${d}T${(tm && tm.length >= 4 ? tm : fallbackTime)}:00+06:00`;
}

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
 * DEC-PRD-012 — one variant on screen.
 *
 * The master's name/colour/image are carried along **only for rendering**;
 * saving sends only `variantValueId` and this product's own three fields.
 * Nothing from the master is copied and kept here — otherwise changing
 * "Red"'s colour would leave the old one sitting in the product.
 */
/** DEC-PRD-045 — one value inside a combination */
interface VariantPart {
  valueId: string;
  label: string;
  swatch: string | null;
  imageUrl: string | null;
  attributeId: string;
  attribute: string;
}

interface VariantRow {
  /*  DEC-PRD-045 — a row is a COMBINATION now ("Medium × Red"), so the id of
      one value no longer identifies it. `key` is the sorted value ids joined
      with "|" — the same string the server files the row under — and it is
      what every other tab keys its per-variant section on.  */
  key: string;
  /** every value in this combination, in list order (Size first, then Colour) */
  parts: VariantPart[];
  /** the lead value — the first axis. The server files the row under it. */
  variantValueId: string;
  /** "Medium · Red" — one name for the whole combination */
  label: string;
  swatch: string | null;
  /** the master's image — shown when this product hasn't set its own */
  masterImage: string | null;
  /** "Size · Colour" — which lists this row is made of */
  attribute: string;
  /** this product's own image for this colour */
  imageUrl: string;
  stockQty: string;
  /**
   * DEC-PRD-015 — this colour's own stockroom Item. `null` = has none of
   * its own, in which case the product's Item is used.
   */
  itemId: string | null;
  /** the chosen Item's name/code — display only, not sent on save */
  itemLabel: string | null;
  /** DEC-ITM-012 — the linked item's mugshot and code, so a linked row is
   *  drawn the same way every other item list draws it. Display only. */
  itemImage: string | null;
  itemSku: string | null;
  /** empty = the product's base price */
  price: string;
  /*  DEC-PRD-032 — this variant's own discount, in the product's own shape.
      The value is what the owner types: percent as 10, flat as taka.  */
  discType: "NONE" | "FLAT" | "PERCENT";
  discValue: string;
  isActive: boolean;
}

/*  DEC-PRD-045 — the key the server files a combination under: the value ids,
    sorted, joined with "|". Sorted so that Red+Medium and Medium+Red are one
    and the same thing, whichever order the screen happened to build them in. */
function comboKeyOf(valueIds: string[]): string {
  return [...valueIds].sort().join("|");
}

/*  Build a variant row out of its parts. Everything the row shows — its one
    name, its swatch, its fallback photo — is derived here, in one place, so
    a one-list product and a two-list product cannot drift apart.  */
function rowFromParts(parts: VariantPart[], rest: Omit<VariantRow, "key" | "parts" | "variantValueId" | "label" | "swatch" | "masterImage" | "attribute">): VariantRow {
  return {
    key: comboKeyOf(parts.map((p) => p.valueId)),
    parts,
    variantValueId: parts[0]?.valueId ?? "",
    label: parts.map((p) => p.label).join(" · "),
    /*  the first part that actually has a colour — on "Medium × Red" that is
        Red, and a size has no swatch to offer.  */
    swatch: parts.find((p) => p.swatch)?.swatch ?? null,
    masterImage: parts.find((p) => p.imageUrl)?.imageUrl ?? null,
    attribute: parts.map((p) => p.attribute).join(" · "),
    ...rest,
  };
}

/** what the customer ends up paying for one variant, in paisa */
function variantPays(v: VariantRow): number {
  const base = Math.round((parseFloat(v.price) || 0) * 100);
  const n = parseFloat(v.discValue) || 0;
  if (v.discType === "PERCENT") return Math.max(0, Math.round(base * (1 - n / 100)));
  if (v.discType === "FLAT") return Math.max(0, base - Math.round(n * 100));
  return base;
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
 * cleaned twice and still read as a wall: *"still way too much text"*.
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
  why?: string;
  children: React.ReactNode;
}) {
  const style = {
    live: "bg-[#e8f6ee] text-[#12693f] border-[#bfe3cd]",
    partial: "bg-[#fff6e5] text-[#8a5a00] border-[#f0d9a8]",
    staff: "bg-lavender text-purple border-lavender-deep",
    off: "bg-[#f4f4f6] text-[#6b6b76] border-[#dedee4]",
  }[kind];
  /*  The chip carried a native `title` and a grey "?" — half a second of
      waiting, an OS-styled box, and nothing at all on a phone. It is the house
      ⓘ now, like everywhere else (22 Aug 2026).  */
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-[3px] rounded-full border ${style}`}>
      {children}
      {why ? <Info text={why} /> : null}
    </span>
  );
}

/**
 * DEC-PRD-032, 6 Aug — owner: "the whole product upload page has no sign
 * for which fields are mandatory and which aren't." This red star is that
 * sign — it sits right next to the exact fields whose absence makes
 * `assertPublishReady` (backend) block publishing, so it's understood before
 * save is even attempted.
 */
function Req() {
  /*  Owner's call, 6 Aug 2026: the `*` symbol, not a "Required" word badge —
      cleaner. Slightly larger than body text so it can't be missed, with the
      meaning spelled out in the page header and in this tooltip.  */
  return (
    <span
      className="text-[#c0392b] font-bold ml-0.5 text-[15px] leading-none"
      title="Publishing is blocked until this is filled in"
    >
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
  /** DEC-PRD-032 — the red star: if this is left empty, the product cannot publish */
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
/*  ⚠️ `DHAKA_SPEEDS` and `NATION_SPEEDS` used to be written here — five
    names, in code. If the owner created a new delivery type in the
    delivery module, it would never show up on this screen, because the
    code knew nothing beyond those five. And "Standard courier (1–3 days)" /
    "Express courier (next day)" never existed in the delivery module at
    all — they were only ever written here.

    Now the names come from `/delivery/types`. Owner's instruction,
    1 Aug 2026: *"whatever gets edited or changed in the delivery module
    should automatically work across the whole system."*  */

/*  CAT_REP / tplFor deleted with DEC-PRD-037 (9 Aug 2026). They mapped eight
    hard-coded category names to demo product slugs so a section could be
    "loaded from a template" — i.e. filled with mock text. Category → FAQ is
    the real source now.  */

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
  /*  Basics' "does it come in more than one?" (owner, 8 Aug 2026). Not a
      column of its own — an existing product answers it by having variants,
      and a new one starts at No.

      ⚠️ DECLARED HERE, above `visibleSections`, and it must stay above it.
      Put below, the filter reads it before initialisation and the whole
      editor goes white with "Cannot access before initialization" — the
      third time this file has been bitten by exactly that (see the variant
      item picker, 2 Aug).  */
  const [hasVariants, setHasVariants] = useState(false);

  /*  ⚠️ THE VARIANTS TAB IS ALWAYS THERE NOW (23 Aug 2026).
      Owner: *"why buy from us ata product upload page a jay nai."*

      It was hidden whenever Basics said "One version" — and four cards were
      hidden with it, only one of which is about variants at all: Bundles,
      Upgrades, Add-ons and "Why buy from us". So a plain product could not be
      given a bundle, an upgrade, an add-on or its own why-buy cards, and
      nothing on screen said why. "Why buy from us" has moved to Product story
      where it belongs; the other three stay here, and the "Colours & sizes"
      chip is the only thing that hides.  */
  const visibleSections = SECTIONS;
  const secIdx = visibleSections.findIndex(([id]) => id === sec);
  const goSec = (i: number) => {
    setSec(visibleSections[i][0]);
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

  // Pricing
  const [cost, setCost] = useState("");
  const [sell, setSell] = useState(src ? String(src.pricePaisa / 100) : "");
  const [discType, setDiscType] = useState<"NONE" | "FLAT" | "PCT">("NONE");
  /**
   * DEC-PRD-028 — the discount's start and end. `yyyy-mm-dd`, empty = no
   * limit.
   *
   * ⚠️ This is `<input type="date">`'s own native shape, and it's kept that
   * way deliberately — converting to `Date` lets the browser's timezone
   * creep in and can shift the date by a day (this exact bug showed up in
   * preorderDate).
   */
  const [discStart, setDiscStart] = useState("");
  const [discEnd, setDiscEnd] = useState("");
  /*  DEC-PRD-062 — ON: the product's discount and window run on every
      variant and the rows carry no discount box of their own. OFF: each
      priced variant sets its own (the old rule).  */
  const [discOnVariants, setDiscOnVariants] = useState(true);
  const [discVal, setDiscVal] = useState("");
  const [advReq, setAdvReq] = useState(!!src?.prepaidOnly);
  const [advType, setAdvType] = useState<"FULL" | "PARTIAL">("FULL");
  /*  3 Aug audit — the two columns and the storefront's "Bestseller" shelf
      already existed; admin just never had a switch to set them. Nobody
      could ever turn it on.  */
  /*  DEC-PRD-050 — READ-ONLY. What the shop's own rule decided today; the
      form shows it and never sends it back.  */
  const [isBest, setIsBest] = useState(false);
  const [isNew, setIsNew] = useState(false);
  /*  … and the owner's override, which is what the form does send.  */
  const [bestMode, setBestMode] = useState<"AUTO" | "ALWAYS" | "NEVER">("AUTO");
  const [newMode, setNewMode] = useState<"AUTO" | "ALWAYS" | "NEVER">("AUTO");
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
  /*  6 Aug 2026 fix — "A vendor does" looked dead. The Seg's value used to be
      DERIVED (`supplierId ? "VENDOR" : "OURS"`), and picking VENDOR set
      supplierId to the first vendor — or null when the vendor list is empty,
      which snapped the control straight back to "We do". With zero vendors
      set up (the common state on a fresh system) the button simply did not
      respond. Now the choice is its own state: VENDOR is selectable even
      with no vendors, and shows the "no vendors yet — add one" path instead
      of ignoring the click.  */
  const [providerMode, setProviderMode] = useState<"OURS" | "VENDOR">("OURS");
  /** the number shown on the website. "" = show the real one */
  const [displayQty, setDisplayQty] = useState("");
  /** minutes to make one — what the daily-capacity module counts in */
  const [makeMinutes, setMakeMinutes] = useState("");
  /** DEC-PDP-09 — what happens the moment the count reaches zero */
  const [soldOutMode, setSoldOutMode] = useState<"STOCK_OUT" | "PRE_ORDER">(
    "STOCK_OUT",
  );
  /*  "Allow order when stock is 0" — the owner's business switch (4 Sep
      2026). One rule for hand-counted and Inventory-connected stock: on, a
      normal order is still taken at zero; off, the page shows Out of stock
      (or Pre-order, per "When it runs out" — unchanged). Preparing still
      refuses to take stock that is not there.  */
  const [allowOrderAtZero, setAllowOrderAtZero] = useState(false);
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
        // DEC-ITM-013/024 — only saleable, active, online items may sit behind a product
        .then((r) => setItemHits(r.filter((i) => i.isSaleable && i.isActive && (i.isOnline ?? true)).slice(0, 8)))
        .catch(() => setItemHits([]))
        .finally(() => setItemBusy(false));
    }, 300);
    return () => clearTimeout(id);
  }, [itemQ, linkedItem]);

  /**
   * DEC-PRD-015 — which variant an Item is currently being searched for.
   * `null` = for none. The search field couldn't be placed inside the
   * card — the card is 132px wide, and an item's name wouldn't even be
   * readable there.
   */
  const [vItemFor, setVItemFor] = useState<string | null>(null);
  const [vItemQ, setVItemQ] = useState("");
  /*  The whole Item, not three of its fields — the photo and the vendor badge
      have to come along, so this list looks like every other item list.  */
  const [vItemHits, setVItemHits] = useState<ApiItem[]>([]);

  /*  DEC-PRD-015 — searching an Item for a variant. The exact same call
      (`listItems`) as the product's own search, so the two places never
      return different results.  */
  useEffect(() => {
    if (!vItemFor) return;
    let stale = false;
    const t = setTimeout(() => {
      listItems(vItemQ.trim() ? { search: vItemQ.trim() } : undefined)
        // DEC-ITM-013/024 — same gate as the product's own item search
        .then((r) => !stale && setVItemHits(r.filter((i) => i.isSaleable && i.isActive && (i.isOnline ?? true)).slice(0, 30)))
        .catch(() => !stale && setVItemHits([]));
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [vItemQ, vItemFor]);

  /*  The live figure. Read, never typed — that is the whole point of TRACKED.  */
  /*  DEC-PRD-044 — the kinds. Failing quietly is right here: the two boxes
      still work by hand, so a slow master must not stop somebody writing a
      product.  */
  useEffect(() => {
    let alive = true;
    listNatures()
      .then((r) => alive && setNatures(r.filter((n) => n.isActive)))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

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
   * DEC-PRD-012 — this product's variants, each with its own image / stock /
   * price. Empty = this product has no variants, and that whole section of
   * the page doesn't show.
   */
  const [variants, setVariants] = useState<VariantRow[]>([]);
  /*  `vOpen` removed 8 Aug 2026 — there is no expanding variant card any
      more. Photo, stock and price each live on their own tab, so nothing
      needs opening.  */
  const [vBusy, setVBusy] = useState<string | null>(null);

  /*  ── DEC-PRD-045 · which lists, and which values in each ────────────────
      Owner, 23 Aug 2026: a bouquet in three sizes, every size in three
      colours. Two lists at once, and nine things to sell.

      `variants` stays the truth about what is SOLD; this holds what was
      TICKED, which is what the pairs are built from. They are rewritten
      together in `applyPicks`, never by an effect — an effect would have to
      know whether the product had finished loading, and getting that wrong
      empties a saved product on open.  */
  const [axisPicks, setAxisPicks] = useState<Record<string, string[]>>({});
  /*  DEC-PRD-063 — the order the lists show on the page, for THIS product.
      A list joins the end when it gets its first tick; ↑ ↓ on the chip move
      it. Nothing is fixed in advance (owner, 6 Sep 2026).  */
  const [axisOrder, setAxisOrder] = useState<string[]>([]);
  /** which list's values are showing. `null` = the first one that has picks */
  const [vAttrOpen, setVAttrOpen] = useState<string | null>(null);

  /** DEC-DLV-008 — the deliveries this product can go by, as ids */
  const [delivTypeIds, setDelivTypeIds] = useState<string[]>([]);
  /** the list of names coming from the delivery module */
  const [delivTypes, setDelivTypes] = useState<ApiDeliveryType[]>([]);

  /*
    ⚠️ Two modules call the same place by two different names, and that was
    only caught by looking at the live screen — picking Nationwide showed
    "no delivery available", even though "Nationwide Courier" was sitting
    right there in the table.

        Product.zone        →  DHAKA | NATIONWIDE
        DeliveryZone (enum) →  DHAKA | BANGLADESH | COUNTER

    Both are correct in their own place: Product asks "how far does this
    item travel", Delivery asks "which part of the country". But matching
    the two needs a translation, and that translation needs to live in
    exactly one place — otherwise someone will write another `===` next
    time.
  */
  const deliveryZoneOf = (z: "DHAKA" | "NATIONWIDE") =>
    z === "NATIONWIDE" ? "BANGLADESH" : "DHAKA";

  // Tags
  /**
   * DEC-PRD-022 — the tags set on this product, by slug. **One list only.**
   *
   * ⚠️ There used to be two — `occ` and `rec` — and the chips were drawn
   * from two hand-written arrays in this file. Two problems at once:
   *
   *   1. If the owner created a new tag or new group in Occasions & Tags,
   *      it would **never show up** on this screen — it wasn't in the
   *      hand-written list.
   *   2. When a product was opened, every slug got set in both lists, so
   *      un-ticking a tag would leave it sitting in the other list and it
   *      would come back.
   *
   * Now the chips are drawn from `apiTags`, grouped, and the selection lives
   * in one single list — so neither problem exists anymore.
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
  /** DEC-PRD-044 — the kinds, kept from the chips under the Nature card */
  const [natures, setNatures] = useState<ApiNature[]>([]);
  /** which part of the story is open — the chip rail and the phone share it */
  const [storyGroup, setStoryGroup] = useState<StoryG>("nature");
  /** the same idea on the Variants tab, whose five cards do five jobs */
  const [varGroup, setVarGroup] = useState<VarG>("options");
  /*  With no colours to pick, "Colours & sizes" is not offered, so the tab
      opens on Bundles instead of a chip that is not there.  */
  const varOpen: VarG = !hasVariants && varGroup === "options" ? "bundles" : varGroup;
  /*  Every part of the phone is a door into the section that owns it, and —
      when that section is the story — into the right group as well.  */
  const goto = (section: SecId, group?: StoryG) => {
    setSec(section);
    if (group) setStoryGroup(group);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const [salesLabel, setSalesLabel] = useState(src?.meta ?? "");
  /**
   * DEC-PRD-025 — each window's own starting number. The owner's own
   * question is the reason this exists: *"I set today's sale to 10, same
   * for week and month — so what happens when today/week/month ends?"* With
   * only one field, "10 today" and "200 this month" could never both be
   * said at once.
   */
  const [salesWindow, setSalesWindow] = useState<"TODAY" | "WEEK" | "MONTH" | "ALL">("MONTH");
  const [seedToday, setSeedToday] = useState("");
  const [seedWeek, setSeedWeek] = useState("");
  const [seedMonth, setSeedMonth] = useState("");
  const [seedAll, setSeedAll] = useState("");

  /**
   * DEC-PRD-026 — whether the customer can add their own text or photo to
   * this product. Both off = that whole section is absent from the product
   * page.
   */
  const [persoTitle, setPersoTitle] = useState("");
  const [persoText, setPersoText] = useState(false);
  const [persoTextLabel, setPersoTextLabel] = useState("");
  const [persoTextMax, setPersoTextMax] = useState("");
  const [persoTextHint, setPersoTextHint] = useState("");
  /*  DEC-PRD-048 — the page printed "required" with nothing behind it; now it
      is a switch, per box, and both the buttons and the server obey it.  */
  const [persoTextRequired, setPersoTextRequired] = useState(false);
  const [persoImage, setPersoImage] = useState(false);
  const [persoImageLabel, setPersoImageLabel] = useState("");
  const [persoImageHint, setPersoImageHint] = useState("");
  const [persoImageRequired, setPersoImageRequired] = useState(false);

  /** DEC-PRD-027 — the "Want this customised?" green box */
  const [customiseOn, setCustomiseOn] = useState(false);
  const [customiseTitle, setCustomiseTitle] = useState("");
  const [customiseSub, setCustomiseSub] = useState("");
  const [trust, setTrust] = useState<TrustRow[]>(
    /*  DEC-PRD-031 — the mock detail's icon name is also one of ICON_NAMES.  */
    detail?.trust.map((t) => ({
      icon: t.icon,
      iconUrl: null,
      label: t.label,
      sub: t.sub,
    })) ?? [],
  );
  /*  DEC-PRD-031 — which row's icon is being picked, and which one is
      uploading. By row index, because a product's badges have no id of
      their own — until save they're only a list on this screen.  */
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
    DEC-PRD-030 — whatever comes from the category should be visible on
    this screen too.

    Owner's question, 3 Aug 2026: *"ami catagory page a giye whats inside
    and trust budge a add krlm... tahole product story tab a ata auto show
    krbe pore ami chaile nijer moto kre edit o krte parbo right?"*

    ⚠️ The answer used to be half yes. It reached the website, but the two
    fields on this screen stayed **empty** — there was no way to see, by
    looking, that anything was set.

    ⚠️ These are **never saved** on the product. Display only. They get
    copied only when the owner presses "Use these and edit" — and from that
    point the product keeps its own copy, which doesn't change even if the
    category changes later. This is DEC-PRD-023's "replace" rule, just now
    visible on screen.
    ═══════════════════════════════════════════════════════════════════════
  */
  const [catTrust, setCatTrust] = useState<ApiCategoryTrustBadge[]>([]);
  const [catSpec, setCatSpec] = useState<ApiCategorySpec[]>([]);
  /*  The FAQ that the category already puts on this product's page. It ADDS
      to the product's own rather than replacing it, so it has its own state
      and its own wording — the other two are a choice, this one is a fact.  */
  const [catFaq, setCatFaq] = useState<ApiCategoryFaq[]>([]);
  /*  DEC-PRD-046 — every named "What's inside" list the category offers, so
      the product can press the one it wants. Pressing COPIES the rows: the
      owner's rule, 23 Aug 2026 — *"template je product a use hobe seta kokhono
      change hbe na"*.  */
  const [catLists, setCatLists] = useState<ApiCategorySpecList[]>([]);
  /** which category it came from — top if not a sub-category, kept as its own name */
  const [storyFrom, setStoryFrom] = useState("");
  /*  The id behind `storyFrom` — the sub-category, or its parent when the
      sub has nothing. CraftEditor needs it to show the cards it inherits,
      not just to claim they exist.  */
  const [storyFromId, setStoryFromId] = useState<string | null>(null);
  const [oz, setOz] = useState(detail?.ozReason ?? "");

  /* ⇄ SWAPPED: save/load via :4000 API */
  const router = useRouter();
  const [apiProductId, setApiProductId] = useState<string | null>(null);
  const [loadedCatId, setLoadedCatId] = useState<string | null>(null);
  const [apiCats, setApiCats] = useState<ApiCategory[]>([]);
  const [apiTags, setApiTags] = useState<ApiTag[]>([]);
  const [apiBrands, setApiBrands] = useState<ApiBrand[]>([]);
  const [brandId, setBrandId] = useState<string>("");
  // apiUnits state removed 19 Aug — the selling-unit dropdown went on 6 Aug (owner),
  // so the unit list was fetched on every open and never read.
  const [unitId, setUnitId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  /*  SEO-D01 — the six columns. Blank is fine: the storefront falls back to
      the product name and short description, so nothing is broken by leaving
      them empty. They can also be filled later, in bulk, from Marketing → SEO. */
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [ogImageUrl, setOgImageUrl] = useState("");
  /** DEC-PRD-024 — whether the share image is uploading */
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
   * Bundles already chosen on a new product. Owner, 2 Aug 2026: *"there's
   * still no option to select anything for bundles, or to give a
   * discount"* — he was on a **new** product.
   *
   * ⚠️ A bundle row points at a product id, and an unsaved product has no
   * id. So this used to just say "Save this product first" — true, but a
   * closed door. The upgrade card had already solved exactly this problem:
   * pick now, link happens at the moment of save. Bundle now does the same.
   */
  const [pendingBundles, setPendingBundles] = useState<ApiProduct[]>([]);
  const [pendingLabel, setPendingLabel] = useState("");
  const [pendingDiscType, setPendingDiscType] = useState<"NONE" | "FLAT" | "PERCENT">("NONE");
  const [pendingDiscValue, setPendingDiscValue] = useState("");
  const [bunPq, setBunPq] = useState("");

  /**
   * DEC-PRD-019 — a saved product's bundle list, for showing on the
   * Pricing tab. Owner, 2 Aug 2026: *"price tab akhono variant tab bundle ar
   * baki product tene anche na... discount dile bundle product soho dekhabe
   * koto discount koto amdr profit."*
   *
   * ⚠️ Fetched fresh every time the Pricing tab is opened — because the
   * owner might have just added something on a previous tab, and sitting
   * on the old list at that point would make the math wrong.
   */
  const [bundleList, setBundleList] = useState<ApiBundleList | null>(null);
  // add-on groups manually pinned to this product (besides the auto rules)
  const [manualGroupIds, setManualGroupIds] = useState<string[]>([]);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  // masters loaded from the API so the editor reflects the new systems
  const [vAttrs, setVAttrs] = useState<ApiVariantAttribute[]>([]);

  /*  Whichever template already has a value picked — that's the one that
      opens when the product is opened, so the owner doesn't have to hunt
      for which set "Red" was in.  */
  const pickedAttrId =
    vAttrs.find((a) =>
      a.values.some((v) => (variantValueId ? v.id === variantValueId : v.label === variantLabel && !!variantLabel)),
    )?.id ?? null;

  /*  ── DEC-PRD-045 · the lists in play, in the master's own order ─────────
      Size before Colour on every screen, because that is the order the master
      keeps them in. Left to the order they were clicked, the same product
      would read "Red · Medium" one day and "Medium · Red" the next.  */
  const liveAttrs = vAttrs
    .filter((a) => a.isActive !== false && a.values.some((v) => v.isActive))
    .slice()
    .sort((x, y) => x.sortOrder - y.sortOrder || x.name.localeCompare(y.name));

  /*  Every combination of what is ticked. Three sizes and three colours make
      nine rows; one list of three makes three, which is the shape this screen
      always had.

      A row that already exists keeps everything typed into it — its price,
      its photo, its item — because it is found again by its key. So
      un-ticking a colour by mistake and ticking it back costs nothing.  */
  /** the lists with ticks, in the product's own order (then the global one) */
  function orderedAxes(picks: Record<string, string[]>, order: string[] = axisOrder) {
    const rank = (id: string) => {
      const i = order.indexOf(id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return liveAttrs
      .filter((a) => (picks[a.id] ?? []).length > 0)
      .slice()
      .sort((x, y) => rank(x.id) - rank(y.id));
  }

  function rebuildPairs(picks: Record<string, string[]>, cur: VariantRow[], order: string[] = axisOrder): VariantRow[] {
    const axes = orderedAxes(picks, order);
    if (axes.length === 0) return [];

    let combos: VariantPart[][] = [[]];
    for (const a of axes) {
      const chosen = a.values
        .filter((v) => v.isActive && (picks[a.id] ?? []).includes(v.id))
        .slice()
        .sort((p, q) => p.sortOrder - q.sortOrder || p.label.localeCompare(q.label));
      combos = combos.flatMap((c) =>
        chosen.map((v) => [
          ...c,
          {
            valueId: v.id,
            label: v.label,
            swatch: v.swatch ?? null,
            imageUrl: v.imageUrl ?? null,
            attributeId: a.id,
            attribute: a.name,
          },
        ]),
      );
    }

    const byKey = new Map(cur.map((r) => [r.key, r]));
    const BLANK = {
      imageUrl: "",
      stockQty: "0",
      itemId: null,
      itemLabel: null,
      itemImage: null,
      itemSku: null,
      price: "",
      discType: "NONE" as const,
      discValue: "",
      isActive: true,
    };
    return combos.map((parts) => {
      const old = byKey.get(comboKeyOf(parts.map((p) => p.valueId)));
      return rowFromParts(
        parts,
        old
          ? {
              imageUrl: old.imageUrl,
              stockQty: old.stockQty,
              itemId: old.itemId,
              itemLabel: old.itemLabel,
              itemImage: old.itemImage,
              itemSku: old.itemSku,
              price: old.price,
              discType: old.discType,
              discValue: old.discValue,
              isActive: old.isActive,
            }
          : BLANK,
      );
    });
  }

  /** tick or untick one value, and rebuild what is on sale in the same breath */
  function applyPicks(next: Record<string, string[]>) {
    setAxisPicks(next);
    // a list joins the order on its first tick and leaves it on its last
    const live = Object.keys(next).filter((id) => (next[id] ?? []).length > 0);
    const order = [...axisOrder.filter((id) => live.includes(id)), ...live.filter((id) => !axisOrder.includes(id))];
    setAxisOrder(order);
    setVariants((cur) => rebuildPairs(next, cur, order));
  }
  function moveAxis(id: string, dir: -1 | 1) {
    const cur = orderedAxes(axisPicks).map((a) => a.id);
    const i = cur.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cur.length) return;
    [cur[i], cur[j]] = [cur[j], cur[i]];
    setAxisOrder(cur);
    setVariants((v) => rebuildPairs(axisPicks, v, cur));
  }
  const [addonBundle, setAddonBundle] = useState<AddOnBundle | null>(null);
  const [allProducts, setAllProducts] = useState<ApiProduct[]>([]);

  /*
    DEC-PRD-019 — the bundle list is fetched fresh every time the Pricing
    tab is opened.

    ⚠️ Fetching once on mount alone wasn't enough: the owner adds something
    on the Variants tab and goes straight to Pricing, and sitting on the old
    list at that point means the numbers are wrong. A small extra request,
    and in return the number is always true.

    ⚠️ This hook must sit **below** the `apiProductId` declaration. Placed
    above, I made the exact same mistake twice (2 Aug, also in the variant
    item picker) — reading before the declaration throws "Cannot access
    before initialization" and takes the whole screen down with it.
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

  /*  ── The reference lists — Tags, Categories, Brands, Variants, Delivery… ──
      These are MASTERS the owner edits on other screens. Pulled apart from the
      product load below so they can be refreshed on their own, whenever this
      tab comes back into focus.

      DEC-PRD-022 fix, extended 8 Aug 2026 (owner: "new tag add krlm but product
      upload page-e tag update hoy nai"). Drawing the chips from the API was only
      half the cure: the fetch ran once on mount, so a tag created while this
      page sat open — or restored from Next's back-nav router cache without a
      remount — never showed. Now `refetchMasters` also fires on window focus /
      tab-visible, so returning here after making a tag picks it up with no
      manual reload. The product's own fields are NOT re-pulled here — that would
      clobber unsaved edits.  */
  const refetchMasters = useCallback(() => {
    listCategories()
      .then((cs) => setApiCats(cs as ApiCategory[]))
      .catch(() => {});
    listTags().then(setApiTags).catch(() => {});
    listBrands().then(setApiBrands).catch(() => {});
    getVariantAttributes().then(setVAttrs).catch(() => {});
    getAddOns().then(setAddonBundle).catch(() => {});
    listProducts().then((r) => setAllProducts(r.items)).catch(() => {});
    /*  6 Aug 2026 fix — this used to load EVERY supplier (flower wholesalers,
        packaging vendors, everyone in Suppliers), not just the ones marked
        as a fulfillment vendor (SupplierType.isFulfillment). So "Which
        vendor" here could list a plain material supplier as if picking them
        meant Radian stops holding stock and they make the order — which
        isn't what that supplier is set up for. Filtered to fulfillment-type
        suppliers only, same rule Suppliers → Vendors itself uses.  */
    // DEC-SUP-010 — dual-role suppliers count as vendors here too
    listSuppliers().then((rows) => setVendors(rows.filter((v) => v.type?.isFulfillment || v.dualRole))).catch(() => {});
    /*  DEC-DLV-008 — names come from the delivery module, fetched fresh.
        ⚠️ `rateCount > 0` — a name with no price set in any zone is not
        shown here. If it were, the owner could tick it, it would save, and
        checkout would never show that delivery — a tick that does nothing.
        The moment a price is set, the name comes back here.  */
    listDeliveryTypes()
      .then((r) => setDelivTypes(r.filter((t) => t.isActive && (t.rateCount ?? 1) > 0)))
      .catch(() => {});
  }, []);

  //  Refresh the reference lists when this tab regains focus or becomes visible
  //  again — that is when the owner has most likely just added a tag/category
  //  on another screen and expects to see it here.
  useEffect(() => {
    refetchMasters();
    const onFocus = () => refetchMasters();
    const onVisible = () => {
      if (document.visibilityState === "visible") refetchMasters();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetchMasters]);

  useEffect(() => {
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
          /*  3 Aug audit — only the switch itself came back, not the type.
              Save "PARTIAL 30%" and reopening showed FULL, and the next
              save silently wrote FULL over it. All four fields now
              restore.  */
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
          setBestMode(p.bestSellerMode ?? "AUTO"); // DEC-PRD-050
          setNewMode(p.newArrivalMode ?? "AUTO");

          // stock & lead time
          if (p.stockMode) setStockMode(p.stockMode);
          if (p.itemId) setItemId(p.itemId);
          if (p.item) setLinkedItem(p.item);
          setSupplierId(p.supplierId ?? null);
          setProviderMode(p.supplierId ? "VENDOR" : "OURS");
          setDisplayQty(p.displayQty != null ? String(p.displayQty) : "");
          setMakeMinutes(p.makeMinutes != null ? String(p.makeMinutes) : "");
          setStock(String(p.stockQty ?? 0));
          setShowStock(!!p.showStock);
          setSoldOutMode(p.soldOutMode ?? "STOCK_OUT");
          setAllowOrderAtZero(!!p.allowOrderAtZero);
          /*  `datetime` → `yyyy-mm-dd` for <input type="date">. Sliced rather
              than passed through `Date`, which would drag the browser's
              timezone in and can move the date by a day. */
          setPreorderDate(p.preorderDate ? p.preorderDate.slice(0, 10) : "");
          /*  DEC-PRD-028 — `slice(0,10)`, not `new Date()`: if the browser's
              timezone creeps in, the date can shift by a day.  */
          /*  DEC-PRD-042 — datetime-local wants "YYYY-MM-DDTHH:mm" in DHAKA
              time. The API stores an instant; converting with the browser's
              own clock would show a Dubai laptop the wrong hour.  */
          setDiscStart(toDhakaLocal(p.discountStartsAt));
          setDiscEnd(toDhakaLocal(p.discountEndsAt));
          setDiscOnVariants(p.discountOnVariants !== false);
          setLead(String(p.leadTimeDays ?? 0));

          // delivery
          if (p.zone) setZone(p.zone);
          /*  DEC-DLV-008 — by id, not by name. If the owner renames "Same
              Day" → "Same-day" in the delivery module, this link doesn't
              break.  */
          setDelivTypeIds((p.deliveryTypes ?? []).map((d) => d.typeId));
          setVariants(
            (p.variants ?? []).map((v) => {
              /*  DEC-PRD-045 — rebuild the combination from its values, in
                  the master's own order so Size always reads before Colour.
                  A row saved before that decision has no `values`, and then
                  its one lead value stands in — so an old product opens
                  exactly as it always did.  */
              const parts: VariantPart[] = ((v.values ?? []).length
                ? (v.values ?? []).map((pv) => pv.variantValue)
                : v.variantValue
                  ? [{ ...v.variantValue, sortOrder: 0 }]
                  : []
              )
                .slice()
                .sort(
                  (a, b) =>
                    (a.attribute?.sortOrder ?? 0) - (b.attribute?.sortOrder ?? 0) ||
                    (a.attribute?.name ?? "").localeCompare(b.attribute?.name ?? "") ||
                    (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
                )
                .map((val) => ({
                  valueId: val.id,
                  label: val.label,
                  swatch: val.swatch ?? null,
                  imageUrl: val.imageUrl ?? null,
                  attributeId: val.attribute?.id ?? "",
                  attribute: val.attribute?.name ?? "",
                }));
              return rowFromParts(parts, {
              imageUrl: v.imageUrl ?? "",
              stockQty: String(v.stockQty ?? 0),
              itemId: v.itemId ?? null,
              itemLabel: v.item ? `${v.item.name} · ${v.item.sku}` : null,
              itemImage: v.item?.imageUrl ?? null,
              itemSku: v.item?.sku ?? null,
              price: v.pricePaisa != null ? String(v.pricePaisa / 100) : "",
              discType: (v.discountType ?? "NONE") as VariantRow["discType"],
              /*  PERCENT is basis points on the server (1000 = 10%); the owner sees 10.  */
              discValue:
                v.discountType === "PERCENT"
                  ? String((v.discountValue ?? 0) / 100)
                  : v.discountType === "FLAT"
                    ? String((v.discountValue ?? 0) / 100)
                    : "",
              isActive: v.isActive,
              });
            }),
          );
          /*  DEC-PRD-045 — what was ticked, read back out of what was saved.
              Without this the chips would open empty on a saved product and
              the first click would wipe the grid.  */
          const picks: Record<string, string[]> = {};
          for (const v of p.variants ?? []) {
            const vals = (v.values ?? []).length
              ? (v.values ?? []).map((pv) => pv.variantValue)
              : v.variantValue
                ? [v.variantValue]
                : [];
            for (const val of vals) {
              const attrId = val.attribute?.id;
              if (!attrId) continue;
              if (!picks[attrId]) picks[attrId] = [];
              if (!picks[attrId].includes(val.id)) picks[attrId].push(val.id);
            }
          }
          setAxisPicks(picks);
          /*  DEC-PRD-063 — the saved order, else the order the rows carry  */
          setAxisOrder(
            (p.variantAxisOrder ?? []).length
              ? (p.variantAxisOrder as string[])
              : Object.keys(picks),
          );
          //  an existing product answers the Basics question by what it has
          setHasVariants((p.variants ?? []).length > 0);

          // variant & add-ons
          if (p.variantValueId) setVariantValueId(p.variantValueId);
          if (p.variantLabel) setVariantLabel(p.variantLabel);
          if (p.variantSwatch) setVariantSwatch(p.variantSwatch);
          if (p.manualAddOnGroups) setManualGroupIds(p.manualAddOnGroups.map((g) => g.id));

          /*
            ── TAGS ─────────────────────────────────────────────────────────
            ⚠️ There was a real bug here (caught 2 Aug 2026): **every** tag
            was being set into both lists —

                const slugs = p.tags.map((t) => t.slug);
                setOcc(slugs); setRec(slugs);

            Result: `buildDto` sent `[...occ, ...rec]`, meaning every tag
            twice and in both lists. So un-ticking "Birthday" did remove it
            from `occ`, but it stayed sitting in `rec` — meaning **no tag
            could ever be removed**. The owner would untick, press Publish,
            and the tag would come right back.

            Now each slug goes only into the list it actually belongs to.
            One that isn't in any list (if the owner later creates another
            group) isn't silently dropped — it's kept in `extraTags` and
            sent back on save, otherwise opening this screen once would
            wipe out another group's tag.
          */
          if (p.tags) setTagSel(p.tags.map((t) => t.slug));

          /*  DEC-PRD-025/026/027 — restoring the new fields. ⚠️ The number
              comes from `salesSeed`, not from `salesCount` — otherwise
              editing a product that had already sold would overwrite the
              owner's starting number.  */
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
          setPersoTextRequired(!!p.persoTextRequired);
          setPersoImage(!!p.persoImage);
          setPersoImageLabel(p.persoImageLabel ?? "");
          setPersoImageHint(p.persoImageHint ?? "");
          setPersoImageRequired(!!p.persoImageRequired);
          setCustomiseOn(!!p.customiseOn);
          setCustomiseTitle(p.customiseTitle ?? "");
          setCustomiseSub(p.customiseSub ?? "");

          // story
          /*  3 Aug audit — this used to read from natureType (the enum),
              not the owner's own text (typeText). Type "Handmade" and save,
              reopen and it showed "fresh", and the next save wrote that
              back. The owner's text comes first; the enum is only a
              fallback.  */
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
                /*  DEC-PRD-031 — the name is the name, as-is. There used to
                    be a translation here, and that's exactly what turned
                    "bolt" into "truck".  */
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
    DEC-PRD-030 — pulling badges and What's inside from the current
    category (or its parent, if it has none of its own).

    ⚠️ The exact same order as the shop's `pickList(product, category,
    parent)`. A different order here would mean admin shows one thing and
    the website another — that was the original problem with this whole
    feature, no point reinventing it.

    ⚠️ Must sit **after** `resolveCategoryId()`. Placed above, it throws
    "Cannot access 'resolveCategoryId' before initialization" — this
    mistake happened twice on 2 Aug, half an hour lost each time.
  */
  useEffect(() => {
    const own = subCatId || topCatId;
    if (!own) {
      setCatTrust([]);
      setCatSpec([]);
      setCatFaq([]);
      setCatLists([]);
      setStoryFrom("");
      setStoryFromId(null);
      return;
    }
    const nameOf = (id: string) => apiCats.find((c) => c.id === id)?.name ?? "";
    let alive = true;
    (async () => {
      /*  ── FAQ climbs and ADDS UP, so it is fetched apart from the ladder ──
          The sub-category's questions AND the parent's both reach the page
          (the server does the same in `categoryFaqs`), so there is no
          "nearest non-empty" to work out here — take both, nearer first, and
          drop a question written twice.  */
      const faqRows = await Promise.all([
        listCategoryFaqs(own).catch(() => [] as ApiCategoryFaq[]),
        subCatId && topCatId
          ? listCategoryFaqs(topCatId).catch(() => [] as ApiCategoryFaq[])
          : Promise.resolve([] as ApiCategoryFaq[]),
      ]);
      if (alive) {
        const seen = new Set<string>();
        setCatFaq(
          faqRows.flat().filter((f) => {
            if (!f.isActive) return false;
            const k = f.question.trim().toLowerCase();
            if (!k || seen.has(k)) return false;
            seen.add(k);
            return true;
          }),
        );
      }

      const [t1, l1] = await Promise.all([
        listCategoryBadges(own).catch(() => []),
        listCategorySpecLists(own).catch(() => [] as ApiCategorySpecList[]),
      ]);
      if (!alive) return;
      const live = <T extends { isActive: boolean }>(xs: T[]) => xs.filter((x) => x.isActive);
      let trustRows = live(t1);
      let lists = live(l1);
      let from = own;
      /*  if the sub-category has nothing, fall back to its parent — an
          empty list means "nothing was said," not "there is nothing."  */
      if (subCatId && topCatId && trustRows.length === 0 && lists.length === 0) {
        const [t2, l2] = await Promise.all([
          listCategoryBadges(topCatId).catch(() => []),
          listCategorySpecLists(topCatId).catch(() => [] as ApiCategorySpecList[]),
        ]);
        if (!alive) return;
        trustRows = live(t2);
        lists = live(l2);
        from = topCatId;
      }
      setCatTrust(trustRows);
      setCatLists(lists);
      /*  DEC-PRD-046 — what a product with no list of its own actually shows:
          the FIRST list, the same one the website falls back to. Two lists
          concatenated would print a bouquet and a basket in one table.  */
      setCatSpec(live(lists[0]?.rows ?? []));
      setStoryFrom(nameOf(from));
      setStoryFromId(from);
    })();
    return () => {
      alive = false;
    };
  }, [subCatId, topCatId, apiCats]);

  function buildDto(publish: boolean): Record<string, unknown> {
    const toPaisa = (v: string) => Math.round(parseFloat(v || "0") * 100);
    /*  DEC-PRD-022 — one list only, so there's nothing left to merge here.
        A slug that matches no tag is dropped — the owner deleted it in the
        Tags module, so it shouldn't stay on the product either.  */
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
      /*  DEC-PRD-028 — `null` if empty, otherwise ISO taken at the start/end
          of the day. ⚠️ `23:59:59` on the end date — otherwise "until 10
          Aug" would mean the discount ends at 12:01 AM on the 10th, losing
          the whole day.  */
      /*  ⚠️ `new Date("2026-08-12T00:00:00")` reads the STAFF LAPTOP's zone.
          A shop day is a Dhaka day, so the offset is written explicitly —
          otherwise the same offer starts at different moments depending on
          who saved it (DEC-PRD-042).  */
      discountStartsAt: fromDhakaLocal(discStart, "00:00"),
      discountEndsAt: fromDhakaLocal(discEnd, "23:59"),
      discountOnVariants: discOnVariants,
      variantAxisOrder: orderedAxes(axisPicks).map((a) => a.id),
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
      allowOrderAtZero,
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
      /*  ⚠️ `salesCount` is no longer written from this screen — DEC-PRD-025.
          That's now entirely the Sales module's: it increments when an
          order is delivered, and sorting and the card's "N sold" read that.
          The owner's typed number lives in the four seed fields. Both used
          to be written from this one field, so a single edit would wipe
          out the real count.  */
      /*  DEC-PRD-025 — each window has its own field. ⚠️ `salesCount`
          increases on a sale, the seed does not — the page's math reads the
          seed, otherwise a week's figures would double-count old sales.  */
      salesSeedToday: parseInt(seedToday) || 0,
      salesSeedWeek: parseInt(seedWeek) || 0,
      salesSeedMonth: parseInt(seedMonth) || 0,
      salesSeedAll: parseInt(seedAll) || 0,
      salesWindow,
      /*  DEC-PRD-026 — empty text becomes `null`, so no empty string lands
          in the API; the storefront then falls back to its own default
          wording.  */
      persoTitle: persoTitle.trim() || null,
      persoText,
      persoTextLabel: persoTextLabel.trim() || null,
      persoTextMax: parseInt(persoTextMax) || null,
      persoTextHint: persoTextHint.trim() || null,
      persoTextRequired,
      persoImage,
      persoImageLabel: persoImageLabel.trim() || null,
      persoImageHint: persoImageHint.trim() || null,
      persoImageRequired,
      /*  DEC-PRD-027 */
      customiseOn,
      customiseTitle: customiseTitle.trim() || null,
      customiseSub: customiseSub.trim() || null,
      /*  DEC-DLV-008 — this is now the real answer.  */
      deliveryTypeIds: delivTypeIds,
      /*  DEC-PRD-012 — sending an empty array is correct: if the owner
          removed all of them, the product simply has no variants.  */
      variants: variants.map((v, i) => ({
        /*  DEC-PRD-045 — the lead value stays, because the server files the
            row under it; `valueIds` is the combination itself.  */
        variantValueId: v.variantValueId,
        valueIds: v.parts.map((p) => p.valueId),
        imageUrl: v.imageUrl.trim() || null,
        stockQty: parseInt(v.stockQty || "0") || 0,
        /*  DEC-PRD-015 — if it exists in Inventory, this id is the source
            of stock.  */
        itemId: v.itemId,
        /*  an empty field = the product's base price, not zero taka.  */
        pricePaisa: v.price.trim() === "" ? null : Math.round(parseFloat(v.price) * 100),
        /*  DEC-PRD-032 — only meaningful beside a regular price of its own,
            which is why the field is hidden without one. PERCENT goes as
            basis points (10 → 1000), FLAT as paisa — the product's own
            convention, so one rule reads both.  */
        discountType: v.price.trim() === "" ? "NONE" : v.discType,
        discountValue:
          v.price.trim() === "" || v.discType === "NONE"
            ? 0
            : Math.round((parseFloat(v.discValue) || 0) * 100),
        sortOrder: i,
        isActive: v.isActive,
      })),
      /*  ⚠️ The three old columns are still being written, and this is a
          temporary bridge. The storefront still reads `supportsExpress`
          etc. (to change in step 4), so they're derived from the selection
          here — otherwise the fast-delivery markers on the website would
          vanish the moment a product is saved.

          Matched by name, which is fragile — but it's one-directional,
          temporary, and gets removed entirely at step 4. Until then it's
          two fields holding the same truth, which is a debt.  */
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
      /*  DEC-PRD-050 — the override, never the badge. `isBestSeller` is the
          server's own answer; sending it back would let a form claim a sales
          record the shop does not have.  */
      bestSellerMode: bestMode,
      newArrivalMode: newMode,
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
      /*  ⚠️ `sizes` is deliberately absent — the owner removed the card
          (2 Aug 2026). Not sending it means the API leaves the old sizes
          exactly as they are; sending an empty array would wipe them out
          on every Publish.  */
      specRows: spec
        .filter((s) => s.item.trim())
        .map((s) => ({ item: s.item.trim(), qty: s.qty.trim() })),
      faqs: faqs
        .filter((f) => f.q.trim())
        .map((f) => ({ question: f.q.trim(), answer: f.a.trim() })),
      trustBadges: trust
        .filter((t) => t.label.trim())
        .map((t) => ({
          /*  DEC-PRD-031 — the picker and the storefront now use the same
              name, so there's nothing left to strip out.  */
          icon: t.icon,
          /*  DEC-PRD-030 — so an uploaded icon copied from the category
              isn't lost.  */
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
    setSavedMsg(null);
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
        /*  6 Aug 2026 — owner's request: staying on this page after Save/
            Publish instead of being bounced to the Overview list every
            time. An edit is often several small saves in a row (add a
            photo, save, add a price, save); a full-page redirect after
            each one meant re-finding the same product from a 500+ row
            list each time. `status` kept in sync here so the read-only
            indicator above never lies about what was just saved.  */
        setStatus(publish ? "ACTIVE" : "DRAFT");
        setSavedMsg(publish ? "Published." : "Saved as draft.");
      } else {
        dto.specRows = spec.filter((s) => s.item).map((s) => ({ item: s.item, qty: s.qty }));
        dto.faqs = faqs.filter((f) => f.q).map((f) => ({ question: f.q, answer: f.a }));
        dto.trustBadges = trust
          .filter((t) => t.label)
          .map((t) => ({ icon: t.icon.split(" ")[0] || "star", label: t.label, sub: t.sub || undefined }));
        const created = await createProduct(dto);
        // now that we have an id, link any upgrades chosen before saving
        /*  DEC-PRD-013 — the bundles are linked the moment the product is
            saved. ⚠️ A failure isn't hidden — but it also doesn't break the
            whole save; the product is already created by then, and losing
            that is worse than one bundle not being linked.  */
        /*  DEC-PRD-017 — one bundle, holding every one of the products, and
            one discount. Owner's rule: the discount applies to the total
            including the main product. ⚠️ A failure doesn't break the whole
            save — the product is already created, and losing that is worse
            than one bundle not being linked.  */
        if (pendingBundles.length > 0) {
          await createBundle({
            productId: created.id,
            addsProductIds: pendingBundles.map((p) => p.id),
            label: pendingLabel.trim() || null,
            discountType: pendingDiscType,
            /*  FLAT = paisa · PERCENT = basis points — the exact same math
                as BundleEditor; if the two places disagreed, 10% would
                someday become 0.1%.  */
            discountValue:
              pendingDiscType === "NONE" ? 0 : Math.round((Number(pendingDiscValue) || 0) * 100),
          }).catch(() => {});
        }
        for (const u of pendingUp) {
          await updateProduct(u.id, { upgradeOfProductId: created.id }).catch(() => {});
        }
        /*  A brand-new product has no edit URL yet — this is the one case
            that still has to navigate, since apiProductId/slug only exist
            after the first save. It goes to the new product's OWN edit
            page, not the Overview list, so the owner lands back on the
            same product to keep adding photos/variants/etc. — never on
            somebody else's row in a 500-product list.  */
        router.push(`/products/${created.slug}`);
        return;
      }
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
      /*  DEC-PRD-022 — one list. Occasion rules match by slug, and the
          selection now lives in `tagSel`, so that's what's checked.  */
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
    DEC-PRD-028 — whether the discount is currently running, said in one
    line.

    ⚠️ Compared by day, not by hour: an end date of "10 Aug" means the 10th
    itself is included — that's how the owner reads it, and the server
    honours the discount through the end of that day too.

    ⚠️ Must sit **before** `offer`. Moved below, it throws "Cannot access
    'discLive' before initialization" — this mistake happened twice on
    2 Aug.
  */
  /*  DEC-PRD-042 — compares INSTANTS now, not "YYYY-MM-DD" strings. The old
      string compare could not see a time at all, so an offer that ended at
      9 PM read "Running" until midnight — the admin disagreeing with the
      shop is precisely what this line exists to prevent.  */
  const discLive = (() => {
    const now = Date.now();
    const s = discStart ? Date.parse(fromDhakaLocal(discStart, "00:00") ?? "") : NaN;
    const e = discEnd ? Date.parse(fromDhakaLocal(discEnd, "23:59") ?? "") : NaN;
    const show = (ms: number) =>
      new Date(ms).toLocaleString("en-GB", {
        day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
        hour12: true, timeZone: "Asia/Dhaka",
      });
    if (!Number.isNaN(s) && s > now) return { on: false, text: `Starts ${show(s)}` };
    if (!Number.isNaN(e) && e < now) return { on: false, text: `Ended ${show(e)}` };
    if (!Number.isNaN(e)) return { on: true, text: `Running · ends ${show(e)}` };
    return { on: true, text: "Running · no end date" };
  })();

  /*
    ⚠️ Once the dates have run out, the discount no longer applies on this
    screen either — the server's `paidPaisa()` runs the exact same rule. It
    used to apply anyway, so admin would show ৳2,160 while the shop charged
    ৳2,400. One rule, one answer in both places.
  */
  const offer =
    discType === "NONE" || !discLive.on
      ? sellN
      : discType === "FLAT"
        ? Math.max(0, sellN - dv)
        : Math.max(0, Math.round(sellN * (1 - dv / 100)));

  /** DEC-PRD-062 — the product's discount applied to some other base (a variant's price), in paisa */
  const productDiscountOn = (basePaisa: number) =>
    discType === "NONE" || !discLive.on
      ? basePaisa
      : discType === "FLAT"
        ? Math.max(0, basePaisa - Math.round(dv * 100))
        : Math.max(0, Math.round(basePaisa * (1 - dv / 100)));

  /*  DEC-PRD-035 — "does the product price still do anything?" It does not,
      once every variant carries its own. Both facts are needed in two places
      (the Pricing note and the live preview), so they are worked out once.  */
  const allVariantsPriced = variants.length > 0 && variants.every((v) => v.price.trim() !== "");
  const cheapestVariantPaisa = allVariantsPriced
    ? Math.min(
        ...variants.map((v) =>
          discOnVariants ? productDiscountOn(Math.round((parseFloat(v.price) || 0) * 100)) : variantPays(v),
        ),
      )
    : 0;

  const showDisc = offer < sellN && sellN > 0;
  const saved = Math.max(0, sellN - offer);
  const margin = offer - costN;
  const marginPct = offer > 0 ? Math.round((margin / offer) * 100) : 0;
  const leadN = parseInt(lead || "0");

  /*
    ═══════════════════════════════════════════════════════════════════════
    BUNDLE — the Pricing tab's math. DEC-PRD-019, owner, 2 Aug 2026.

    ⚠️ Two states, one calculation. On a saved product, the list and prices
    come from the server (`bundleList`); on a new product, they're still
    sitting on this screen (`pendingBundles`). Both get brought into one
    shape and run through the same calculation — otherwise a "new" and an
    "existing" product would show two different numbers.

    ⚠️ Everything in taka (not paisa), because every other number on this
    screen is in taka — `sellN`, `costN`, `offer`. Paisa slipping into one
    field would someday show a number 100x wrong.
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
        /*  cost isn't known on a new product's screen — what comes from
            the list carries only the selling price. After save, the
            server sends the real cost. Assuming zero would show profit as
            **higher** than it is, so the profit line simply isn't shown
            then (see `bunCostKnown` below).  */
        cost: 0,
      }));
  const bunCostKnown = !!apiProductId;
  const bunDiscType = apiProductId ? (bundleList?.discountType ?? "NONE") : pendingDiscType;
  const bunDiscVal = apiProductId
    ? (bundleList?.discountValue ?? 0) / 100
    : parseFloat(pendingDiscValue || "0");

  const bunItemsTotal = bunItems.reduce((n, i) => n + i.price, 0);
  const bunItemsCost = bunItems.reduce((n, i) => n + i.cost, 0);
  /*  ⚠️ `offer` as the base — the price after the product's own discount is
      applied. The two discounts stack, and that's honest: the customer
      gets the first one regardless.  */
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

  /** Changing the Pricing tab's discount — the list stays untouched, only the discount is written */
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
  /*  The live preview's small badge. After DEC-DLV-008 this also comes
      from the picked names — there used to be a separate list called
      `deliv`, standing on three hardcoded words.  */
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
    ⚠️ The Trust badge and "What's inside" loaders have been removed —
    DEC-PRD-023. They used to build rows from hand-written presets in this
    file, and the owner had no screen to change them. The real source is
    now Categories → "Product page — badges & what's inside".

    The FAQ loader stays: writing a product's own questions needs a
    starting point, and the category's FAQ gets appended below anyway —
    nothing gets buried.
  */
  /*  `loadFaqTpl` / `templateBar` deleted with DEC-PRD-037 (9 Aug 2026) —
      they filled a real product's FAQ from the mock catalogue. Category → FAQ
      is where category-wide questions are written now, and the storefront
      already shows those under the product's own.  */

  /*  What each tab still owes before this product can go live.
      The list mirrors `assertPublishReady` on the API (products.service.ts) —
      the same six gates, read here so the owner sees them BEFORE pressing
      Publish instead of after. Sections that hold no gate stay blank rather
      than showing a tick they did not earn.  */
  const sectionState: Partial<Record<SecId, "todo" | "done">> = {
    basics: name.trim() && topCatId && skuV.trim() ? "done" : "todo",
    media: photos.length > 0 ? "done" : "todo",
    delivery: delivTypeIds.length > 0 ? "done" : "todo",
    price: Number(sell) > 0 ? "done" : "todo",
  };
  /*  A green dot on a chip means that group already holds something, so an
      untouched group is visible without opening it. "Why buy" cannot be read
      from here — its rows live in CraftEditor against the API — so it never
      claims a dot rather than claiming a false one.  */
  /*  Craft points climb their own ladder on the server (product → category →
      parent), and the sub-category almost never has any, so naming the sub
      here would point at the wrong screen. Prefer whichever category the
      other inherited things resolved to, falling back to the top one.

      ⚠️ DECLARED HERE, below the state it reads. Put it up beside `varOpen`
      and the editor goes white with "used before its declaration" — the
      fourth time this file has been bitten by that.  */
  const craftFrom: { id: string | null; name: string } = storyFromId
    ? { id: storyFromId, name: storyFrom }
    : { id: topCatId || null, name: catName };

  const varFilled: Record<VarG, boolean> = {
    options: variants.length > 0,
    bundles: (bundleList?.items.length ?? 0) > 0,
    upgrades: myUpgrades.length > 0,
    addons: manualGroupIds.length > 0 || matchedAddonGroups.length > 0,
  };

  /*  Which story groups hold anything — the chip shows a soft dot when full,
      so an empty group is visible without opening it.  */
  const storyFilled: Record<StoryG, boolean> = {
    nature: !!natureLabel.trim(),
    signal: !!(seedToday || seedWeek || seedMonth || seedAll),
    perso: persoText || persoImage || customiseOn,
    trust: trust.some((t) => t.label.trim()),
    /*  "Why buy" cannot be read from here — its rows live in CraftEditor
        against the API — so it never claims a dot rather than a false one.  */
    why: false,
    inside: spec.some((r) => r.item.trim()) || faqs.some((f) => f.q.trim()),
  };

  /*  The named gates, so the Publish button can say what it is waiting for
      rather than refusing and explaining afterwards.  */
  const publishMissing = [
    !name.trim() && "a name",
    !topCatId && "a category",
    !skuV.trim() && "a SKU",
    Number(sell) > 0 ? null : "a price",
    photos.length === 0 && "a photo",
    delivTypeIds.length === 0 && "a delivery type",
  ].filter((x): x is string => typeof x === "string");

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
          {/*  "New product — fill in and publish" said nothing the big title
               above did not (owner, 22 Aug 2026). Only the star legend stays:
               three words that decode a mark used all over the form.
               8 Aug 2026 — the live URL used to sit here as a long raw
               address; the owner moved it onto the Live Preview card
               instead (the preview's product name is the link now).  */}
          <p className="text-body-soft text-[12.5px] m-0">
            <span className="text-[#c0392b] font-bold">*</span> required to publish
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={saving}
          className="border-2 border-lavender-deep bg-white text-[14px] px-5 py-3 rounded-[12px] font-bold hover:border-orchid text-purple disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save draft"}
        </button>
        {/*  Bold and clear (CLAUDE.md §16). It also says what it is waiting
             for: the API refuses a publish that is missing any of six things,
             and the owner used to learn which one only by pressing and
             reading the refusal. The ⓘ names them all; the rail shows which
             tab they live on.  */}
        <button
          type="button"
          onClick={() => handleSave(true)}
          disabled={saving || publishMissing.length > 0}
          title={publishMissing.length ? `Still needs ${publishMissing.join(", ")}` : "Put it on the website"}
          className="bg-purple hover:bg-purple-deep text-white text-[14px] px-6 py-3 rounded-[12px] font-bold inline-flex items-center gap-2 shadow-soft disabled:opacity-40"
        >
          <Icon name="check" size={17} /> {saving ? "Saving…" : "Publish"}
        </button>
        {publishMissing.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#8a5a00] shrink-0">
            <span className="w-[7px] h-[7px] rounded-full" style={{ background: "#f0a323" }} />
            {publishMissing.length} to go
            <Info text={`Publishing needs ${publishMissing.join(", ")}. The amber dots on the left show which section each one is in.`} />
          </span>
        )}
      </div>

      {saveErr && (
        <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-4 text-[13px]">
          {saveErr}
        </div>
      )}
      {savedMsg && (
        <div className="bg-[#eaf7ef] border border-[#a8d9bc] text-[#0f7d55] rounded-[12px] px-4 py-3 mb-4 text-[13px] font-medium flex items-center gap-2">
          {/*  The lecture that followed every save is gone (owner, 22 Aug
               2026). It appeared on EVERY save and told him where he already
               was.  */}
          <Icon name="check" size={15} /> {savedMsg}
          {slugV && (
            <a
              href={storefrontUrl(slugV)}
              target="_blank"
              rel="noreferrer"
              className="font-bold underline ml-1"
            >
              View it on the website ↗
            </a>
          )}
        </div>
      )}

      <div className="flex gap-6 items-start">
        {/*  ── section nav — the house chooser panel (owner, 22 Aug 2026) ──
             Deep purple, like Occasions & Tags, Brands and Variants. The
             chosen section is the only light thing on it, which says "you are
             here" without a border.

             AND IT NOW ANSWERS THE QUESTION THE FORM KEPT RAISING. Six things
             must be filled in before a product can publish, they are spread
             over four tabs, and until now the only way to find out which one
             was missing was to press Publish and read the refusal. The rail
             carries a small amber dot on any section still holding something
             back, and a tick when that section is done — so the answer is on
             screen the whole time, in the place the eye already goes.  */}
        <nav className="w-[208px] shrink-0 sticky top-[84px] hidden md:block rounded-[18px] shadow-soft overflow-hidden"
          style={{ background: "linear-gradient(168deg,#3b1152,#2a0b3d)" }}>
          <div className="px-4 pt-4 pb-2.5 flex items-center gap-2">
            <span className="w-[26px] h-[26px] rounded-[8px] grid place-items-center text-white shrink-0" style={{ background: "rgba(255,255,255,.14)" }}>
              <Icon name="layers" size={14} />
            </span>
            <span className="text-[12px] font-bold tracking-[0.08em] uppercase text-white/70">Sections</span>
          </div>

          <div className="px-3 pb-3.5 space-y-1">
            {visibleSections.map(([id, label, icon]) => {
              const on = sec === id;
              const state = sectionState[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSec(id)}
                  className={
                    "w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-[12px] text-[13.5px] text-left transition-colors " +
                    (on ? "bg-white shadow-soft" : "hover:bg-white/10")
                  }
                >
                  <span className="w-[28px] h-[28px] rounded-[9px] grid place-items-center shrink-0"
                    style={on ? { background: "#6d3a9c", color: "#fff" } : { background: "rgba(255,255,255,.13)", color: "#fff" }}>
                    <Icon name={icon} size={15} />
                  </span>
                  <span className={"flex-1 min-w-0 truncate font-medium " + (on ? "text-purple" : "text-white")}>
                    {label}
                  </span>
                  {state === "todo" && (
                    <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: "#f0a323" }}
                      title="Something here is still needed before this can be published" />
                  )}
                  {state === "done" && (
                    <span className="shrink-0" style={{ color: on ? "#12a172" : "#7fd8b4" }} title="Ready to publish">
                      <Icon name="check" size={13} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
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
              {visibleSections.map(([id, label]) => (
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
              >
                <div className="flex flex-col gap-8">
                  <Field
                    label={
                      <L
                        required
                        chip={
                          <Where
                            kind="live"
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
                        {WEB_HOST}/p/
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
                        required
                        chip={
                          <Where
                            kind="staff"
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
                {/*  Status line removed 6 Aug 2026 (owner): it only mirrored
                    the publish/draft state that the top Save/Publish buttons
                    already set — no function here, just clutter.  */}
                {/*  ⚠️ NOT `pairCls` — one control, one column. This card held
                    two things and used the two-column grid; when the badges
                    moved out (DEC-PRD-050) the grid stayed, and a grid with
                    one child in it is a card with a hole on the right. A
                    single field does not need a column to be empty beside
                    it.  */}
                <div>
                  <Field
                    label={
                      <L
                        chip={
                          <Where
                            kind="partial"
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
                  {/*  Selling unit dropdown removed 6 Aug 2026 (owner): a flower/
                      gift shop sells per-piece/per-bouquet, so the "/ kg", "/
                      piece" suffix was never useful. It touches nothing but the
                      storefront price suffix — no finance/order/POS effect. The
                      `unitId` field stays in the schema (harmless, always empty
                      now) so nothing downstream breaks.  */}
                </div>
              </Card>

              {/*
                ── DEC-PRD-050 · the badges get their own card ────────────────

                Owner, 24 Aug 2026: *"basic page a best selling je 2 ta tab
                diso ai section ta thik kro — maje onk faka, dan paser niche."*

                He is describing a real hole. The two badge switches were
                dropped into the right-hand column of "How it is sold", which
                is a two-column grid: Product type is one short control, the
                badges were two stacked ones. So the left column ended half a
                card tall with a void under it, and New arrival hung on its
                own in the bottom-right corner.

                Splitting them fixes the shape AND the filing. A badge is not
                a selling rule — it changes no price, no advance, no
                cancellation. It is how the product is DRESSED on a card, and
                that deserves its own heading rather than a spare column in
                somebody else's.

                Both cards are now honest grids: one control on its own row
                above, two matching controls side by side here. Nothing hangs.

                WHAT THESE DO. They were on/off switches (DEC-PRD-032), which
                made "Best seller" only as true as the last person who
                remembered to untick it. The shop works it out from real
                delivered sales now — top slice of this product's own category
                over the last 90 days — and what is left here is the OVERRIDE.
                Auto is the answer almost always; Always is a hero product on
                its launch day, before it has sales; Never is something that
                would win on volume and mean nothing.

                The numbers live on Products → Badge rules, one place for the
                whole shop (house rule 15) — and the link below is there
                because a screen that obeys rules set elsewhere should say
                where elsewhere is.
              */}
              <Card
                icon="star"
                title="How it is shown"
              >
                <div className={pairCls}>
                  <Field
                    label={
                      <>
                        Best seller{" "}
                      </>
                    }
                  >
                    <Seg
                      value={bestMode}
                      onChange={setBestMode}
                      options={[
                        { v: "AUTO", label: "Auto" },
                        { v: "ALWAYS", label: "Always" },
                        { v: "NEVER", label: "Never" },
                      ]}
                    />
                    {/*  On Auto, the truthful thing to show is what the rule
                         has actually decided today — not a switch position
                         that decides nothing.  */}
                    {bestMode === "AUTO" && (
                      <span
                        className="text-[12px] font-semibold mt-1.5"
                        style={{ color: isBest ? "#8A5A00" : "#8b7a99" }}
                      >
                        {isBest ? "★ Earning the badge right now" : "Not in the top slice today"}
                      </span>
                    )}
                  </Field>
                  <Field
                    label={
                      <>
                        New arrival{" "}
                      </>
                    }
                  >
                    <Seg
                      value={newMode}
                      onChange={setNewMode}
                      options={[
                        { v: "AUTO", label: "Auto" },
                        { v: "ALWAYS", label: "Always" },
                        { v: "NEVER", label: "Never" },
                      ]}
                    />
                    {newMode === "AUTO" && (
                      <span
                        className="text-[12px] font-semibold mt-1.5"
                        style={{ color: isNew ? "#8b3fb0" : "#8b7a99" }}
                      >
                        {isNew ? "Wearing the New tag right now" : "No longer new"}
                      </span>
                    )}
                  </Field>
                </div>
                <a
                  href="/products/badges"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 mt-5 text-[12.5px] font-bold text-purple hover:text-orchid"
                >
                  Badge rules for the whole shop ↗
                </a>
              </Card>

              {/*
                ═══════════════════════════════════════════════════════════
                DOES IT COME IN MORE THAN ONE — owner, 8 Aug 2026:
                *"decide on Basics whether this has variants; if not, the
                variant option must not appear on the next tab."*

                One question, asked once, at the top. Off hides the whole
                Variants tab — and with it the per-variant rows in Photos,
                Stock and Pricing — so a plain product never walks past a
                single field it does not need.
                ═══════════════════════════════════════════════════════════
              */}
              <Card
                icon="layers"
                title="Does it come in more than one?"
              >
                <Seg
                  value={hasVariants ? "YES" : "NO"}
                  onChange={(v) => {
                    if (v === "YES") {
                      setHasVariants(true);
                      return;
                    }
                    /*  ⚠️ Never silently. Each variant carries a photo, a
                        price and a count somebody typed — losing that to a
                        mis-click would be found out days later.  */
                    if (
                      variants.length > 0 &&
                      !window.confirm(
                        `${variants.length} variant${variants.length > 1 ? "s" : ""} will be removed from this product, along with their photos, prices and stock. Continue?`,
                      )
                    ) {
                      return;
                    }
                    setVariants([]);
                    setAxisPicks({});
                    setAxisOrder([]);
                    setHasVariants(false);
                  }}
                  options={[
                    { v: "NO", label: "One version" },
                    { v: "YES", label: "Has variants" },
                  ]}
                />
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
              >
                <div className={pairCls}>
                  <Field
                    label={
                      <L
                        chip={
                          <Where
                            kind="staff"
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
                          >
                            On the page
                          </Where>
                        }
                      >
                        Selling price
                      </L>
                    }
                  >
                    {/*  DEC-PRD-035 rev (owner, 9 Aug 2026): *"the moment a variant
                        carries a price the main price box disables; clear it and it
                        enables again."* Disabled exactly when EVERY variant prices
                        itself — with one variant blank the box stays live,
                        because that variant genuinely sells at this price.  */}
                    <input
                      className={`ipt h-[52px] text-[17px] font-medium ${
                        allVariantsPriced ? "opacity-50 cursor-not-allowed bg-[#f4f1f7]" : ""
                      }`}
                      type="number"
                      value={sell}
                      onChange={(e) => setSell(e.target.value)}
                      placeholder="2450"
                      disabled={allVariantsPriced}
                    />
                    {/*
                      DEC-PRD-035 — owner, 9 Aug 2026: *"if two variants carry
                      different prices, what is the main price box even for?"*

                      A fair question, and the honest answer is: almost none.
                      Nothing sells at it once every variant prices itself —
                      yet it was still the number on the category card, so a
                      shopper saw ৳4,400 in a list and ৳450 on the page. Stock
                      already solved this by deferring to the variants; price
                      now says the same thing out loud.
                    */}
                    {allVariantsPriced && (
                      <p className="text-[12.5px] text-body-soft mt-2 mb-0">
                        The shop shows{" "}
                        <b className="font-medium text-purple">from {taka(cheapestVariantPaisa / 100)}</b>{" "}
                        until a customer picks.
                      </p>
                    )}
                  </Field>
                </div>

                <div className="mt-7">
                  <Field
                    label={
                      <L
                        chip={
                          <Where
                            kind="live"
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
                      DEC-PRD-028 — owner, 3 Aug 2026: *"if we run an offer
                      like a discount on a specific product, there's no place
                      to give its timing — a start date and end date. Which
                      the frontend and admin panel should both show and honour
                      at the same time."*

                      ⚠️ Previously, once a discount was set it ran
                      **forever**. A three-day offer meant remembering the
                      date and manually removing it on the fourth day.
                      Nobody remembers.

                      ⚠️ The two date fields sit **inside** the discount, not
                      in a separate card — the dates are part of the
                      discount, not a separate decision.
                      ═══════════════════════════════════════════════════════
                    */}
                    {discType !== "NONE" && (
                      <div className="mt-3 flex items-end gap-3 flex-wrap">
                        {/*  DEC-PRD-042 — date AND time. These were date-only,
                            and the gate threw any time away, so "ends at 9 PM"
                            could not be expressed at all. Leave the time at
                            00:00 / 23:59 and it behaves exactly as before.  */}
                        <Field label="Starts" note="Blank = right away">
                          <input
                            className="ipt h-[44px]"
                            style={{ width: 215 }}
                            type="datetime-local"
                            value={discStart}
                            onChange={(e) => setDiscStart(e.target.value)}
                          />
                        </Field>
                        <Field label="Ends" note="Blank = until you stop it">
                          <input
                            className="ipt h-[44px]"
                            style={{ width: 215 }}
                            type="datetime-local"
                            value={discEnd}
                            onChange={(e) => setDiscEnd(e.target.value)}
                          />
                        </Field>
                        {/*  ⚠️ The status is spelled out, because looking at
                            two dates and working out "is this running right
                            now?" in your head is exactly the mistake that
                            leaves someone thinking the price is discounted
                            when it isn't.  */}
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

                {/*  DEC-PRD-062 — owner, 6 Sep 2026: "if the same discount
                    applies to all variants, switch it on; if I want it
                    customised, switch it off and set them one by one."  */}
                {variants.length > 0 && (
                  <div className="mt-4 rounded-[14px] border border-lavender-deep bg-white px-4 py-3">
                    <Sw on={discOnVariants} onToggle={() => setDiscOnVariants((v) => !v)}>
                      This discount applies to every variant
                    </Sw>
                    <span className="block mt-1.5 pl-[56px] text-[12px] text-body-soft">
                      {discOnVariants
                        ? "It runs on each variant's price."
                        : "Each variant sets its own discount below."}
                    </span>
                  </div>
                )}

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
                WHAT THE CUSTOMER ACTUALLY PAYS — DEC-PRD-019, 2 Aug 2026

                Owner: *"ami chai price tab sheshe thakuk and sekhanei price ar
                sob calculation hok."*

                ⚠️ This card **decides nothing** — it just shows, in one
                place, what's already been set in the fields above and on the
                later tabs. Price is no longer a single number: colour/size
                variants carry their own price, and a bundle's discount
                applies to the total including the main product. Spread
                across three places, the owner would never see the full
                picture.
                ═══════════════════════════════════════════════════════════════
              */}
              <Card
                icon="cash"
                title="What the customer pays"
              >
                <div className="flex flex-col gap-2 text-[13.5px]">
                  <div className="flex items-center justify-between gap-3 py-1.5 border-b border-lavender-deep">
                    <span className="text-body-soft">This product</span>
                    <b className="font-semibold text-purple">{taka(offer)}</b>
                  </div>

                  {/*  colour/size prices — leaving one blank means the
                      product's own price applies, so only the ones with a
                      genuinely different number are shown here.  */}
                  {variants.filter((v) => v.price.trim()).length > 0 && (
                    <div className="py-1.5 border-b border-lavender-deep">
                      <div className="text-body-soft mb-1">
                        With a different price of its own
                      </div>
                      {variants
                        .filter((v) => v.price.trim())
                        .map((v) => (
                          <div
                            key={v.key}
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
                    BUNDLE — DEC-PRD-019, owner, 2 Aug 2026:
                    *"price tab akhono variant tab bundle ar baki product tene
                    anche na. se oikhaner info tene anbe... discount dile
                    bundle product soho dekhabe koto discount koto amdr
                    profit."*

                    ⚠️ The discount field now lives **here**, not on the
                    Bundles card. Its result shows right below where the
                    number is typed — splitting it across two screens meant
                    the owner would never see the whole picture at once.
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
                          /*  ⚠️ width in inline style — `.ipt` itself sets
                              `width:100%` and loads after Tailwind, so a
                              `w-[100px]` utility would be silently dropped.  */
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
                        {/*  ⚠️ Profit is shown only when the cost is
                            genuinely known. On a new product's screen, the
                            bundle items' costs aren't available, and
                            assuming zero would show profit as higher than
                            it is — and that number would end up deciding
                            the price.  */}
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

              {/*  Each variant's own price, beside the product's — owner,
                  8 Aug 2026. DEC-PRD-031: a variant that prices itself is
                  final; the product's discount above never touches it. So
                  its own offer field lives here, not up there.  */}
              {hasVariants && (
                <Card
                  icon="cash"
                  title="Price for each one"
                >
                  {variants.length === 0 ? (
                    <p className="text-[13px] text-body-soft m-0">
                      Nothing picked yet — choose them in{" "}
                      <button
                        type="button"
                        onClick={() => setSec("variants")}
                        className="text-orchid font-semibold hover:underline"
                      >
                        Variants &amp; options
                      </button>
                      .
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {variants.map((v) => (
                        <div
                          key={v.key}
                          className="flex items-center gap-3 border border-lavender-deep rounded-[12px] bg-white px-3 py-2.5 flex-wrap"
                        >
                          <span className="flex items-center gap-2 min-w-[130px]">
                            {v.swatch && (
                              <span
                                className="w-[15px] h-[15px] rounded-full border border-lavender-deep shrink-0"
                                style={{ background: v.swatch }}
                              />
                            )}
                            <b className="text-[13.5px] font-medium text-purple truncate">{v.label}</b>
                          </span>

                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-[12.5px] text-body-soft">৳</span>
                            <input
                              className="ipt text-[13.5px]"
                              style={{ width: 108, minHeight: 38 }}
                              placeholder="same price"
                              value={v.price}
                              onChange={(e) =>
                                setVariants((cur) =>
                                  cur.map((x) =>
                                    x.key === v.key
                                      ? { ...x, price: e.target.value.replace(/[^0-9.]/g, "") }
                                      : x,
                                  ),
                                )
                              }
                            />
                          </span>

                          {/*  DEC-PRD-032 — the same discount shape as the product
                              above: % or Flat, not a "final price" box (owner,
                              9 Aug 2026). A discount needs a price of its own to
                              come off, so it only appears once there is one.  */}
                          {v.price.trim() && discOnVariants ? (
                            /*  DEC-PRD-062 — the product's discount runs here  */
                            <span className="text-[12.5px] text-body-soft">
                              product discount applies{discLive.on ? "" : " (not running now)"} ·
                              customer pays{" "}
                              <b className="font-medium text-purple">
                                {taka(productDiscountOn(Math.round((parseFloat(v.price) || 0) * 100)) / 100)}
                              </b>
                            </span>
                          ) : v.price.trim() ? (
                            <>
                              <select
                                className="ipt text-[13px]"
                                style={{ width: 92, minHeight: 38 }}
                                value={v.discType}
                                onChange={(e) =>
                                  setVariants((cur) =>
                                    cur.map((x) =>
                                      x.key === v.key
                                        ? { ...x, discType: e.target.value as VariantRow["discType"] }
                                        : x,
                                    ),
                                  )
                                }
                              >
                                <option value="NONE">No offer</option>
                                <option value="PERCENT">% off</option>
                                <option value="FLAT">৳ off</option>
                              </select>

                              {v.discType !== "NONE" && (
                                <input
                                  className="ipt text-[13.5px]"
                                  style={{ width: 84, minHeight: 38 }}
                                  placeholder={v.discType === "PERCENT" ? "10" : "200"}
                                  value={v.discValue}
                                  onChange={(e) =>
                                    setVariants((cur) =>
                                      cur.map((x) =>
                                        x.key === v.key
                                          ? { ...x, discValue: e.target.value.replace(/[^0-9.]/g, "") }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                              )}

                              {/*  ⚠️ The answer, not the arithmetic. Owner reads
                                  what the customer will pay; he should not have
                                  to work out 10% of 1,500 himself.
                                  ⚠️ `variantPays` is PAISA, `taka()` takes TAKA —
                                  unconverted this printed ৳45,000 for a ৳450
                                  price (owner, 9 Aug 2026).  */}
                              {v.discType !== "NONE" && (
                                <span className="text-[12.5px] font-medium text-[#0f7d55]">
                                  customer pays {taka(variantPays(v) / 100)}
                                </span>
                              )}
                            </>
                          ) : (
                            /*  DEC-PRD-035 (owner, 9 Aug 2026) — his question was
                                exactly right: "if I discount the product, do the
                                variants get it?" They do, whenever they have no
                                price of their own — and that is also why no
                                discount box appears here. Saying so beats a blank
                                row that looks like a missing feature.  */
                            <span className="text-[12.5px] text-body-soft">
                              follows the product{discLive.on ? " — discount and all" : ""} ·
                              customer pays{" "}
                              <b className="font-medium text-purple">{taka(offer)}</b>
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}
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
                  value={providerMode}
                  onChange={(v) => {
                    setProviderMode(v as "OURS" | "VENDOR");
                    if (v === "OURS") setSupplierId(null);
                    else setSupplierId(vendors[0]?.id ?? null);
                  }}
                  options={[
                    { v: "OURS", label: "We do" },
                    { v: "VENDOR", label: "A vendor does" },
                  ]}
                />

                {providerMode === "VENDOR" && (
                  <div className="mt-5">
                    <Field
                      label={
                        <L
                          chip={
                            <Where
                              kind="staff"
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
                        value={supplierId ?? ""}
                        onChange={(e) => setSupplierId(e.target.value || null)}
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
              {providerMode === "OURS" && (
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
                    DEC-PRD-014 — owner, 2 Aug 2026: *"if there are variants,
                    the variants' own stock should run the show, and the
                    product's field should just show the total."*

                    ⚠️ The field isn't hidden, it's **locked**. Hiding it
                    would make the owner think this product's stock isn't
                    being counted anywhere. Showing the number and labelling
                    "where it comes from" makes it clear at a glance — and
                    there's no chance of two different numbers being typed
                    in two places.
                    ═══════════════════════════════════════════════════════════
                  */}
                  {stockMode === "MANUAL" && variants.length > 0 && (
                    <Field label={<L>How many you have</L>}>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="inline-flex items-center h-[46px] px-4 rounded-[12px] bg-lavender/60 border border-lavender-deep text-[15px] font-semibold text-purple">
                          {variants.reduce((n, v) => n + (parseInt(v.stockQty, 10) || 0), 0)} pcs
                        </span>
                        <span className="text-[13px] text-body-soft">
                          Total of the counts below.
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
                              {/*  DEC-ITM-012 — the same mugshot every other
                                  item list draws. One picker, one look.  */}
                              <ItemThumb item={{ sku: it.sku, name: it.name, imageUrl: it.imageUrl }} size={34} />
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
                      <div className="mt-3">
                      </div>
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
                    Owner, 4 Sep 2026 — one switch, both stock modes. Shown for a
                    hand-counted product and an Inventory-connected one alike;
                    not for a vendor's (nothing of theirs sits in our warehouse,
                    so there is no zero of ours to allow past).
                  */}
                  {!supplierId && (
                    <Row
                      label="Allow order when stock is 0"
                      chip={
                        <Where
                          kind="live"
                        >
                          Live
                        </Where>
                      }
                      hint={
                        allowOrderAtZero ? (
                          <span className="text-[#8a5a00]">
                            Orders keep coming at 0 — the page never says Out of stock
                          </span>
                        ) : (
                          "At 0 the page closes the order (or offers Pre-order)"
                        )
                      }
                    >
                      <Sw
                        on={allowOrderAtZero}
                        onToggle={() => setAllowOrderAtZero(!allowOrderAtZero)}
                      >
                        {allowOrderAtZero ? "On" : "Off"}
                      </Sw>
                    </Row>
                  )}

                  {/*
                    DEC-PDP-09 — "if stock is 0, an order can't be placed.
                    Either a stock-out message shows, or a pre-order does."

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

              {/*  Each variant's count, beside the product's — owner, 8 Aug
                  2026. Per-variant, either a number you type OR a stockroom
                  Item that counts it for you (DEC-PRD-032). Never both: two
                  numbers that disagree is worse than one that is wrong.  */}
              {hasVariants && (
                <Card
                  icon="box"
                  title="How many of each"
                >
                  {variants.length === 0 ? (
                    <p className="text-[13px] text-body-soft m-0">
                      Nothing picked yet — choose them in{" "}
                      <button
                        type="button"
                        onClick={() => setSec("variants")}
                        className="text-orchid font-semibold hover:underline"
                      >
                        Variants &amp; options
                      </button>
                      .
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {variants.map((v) => (
                        <div
                          key={v.key}
                          className="flex items-center gap-3 border border-lavender-deep rounded-[12px] bg-white px-3 py-2.5 flex-wrap"
                        >
                          <span className="flex items-center gap-2 min-w-[130px]">
                            {v.swatch && (
                              <span
                                className="w-[15px] h-[15px] rounded-full border border-lavender-deep shrink-0"
                                style={{ background: v.swatch }}
                              />
                            )}
                            <b className="text-[13.5px] font-medium text-purple truncate">{v.label}</b>
                          </span>

                          {v.itemId ? (
                            <>
                              {/*  DEC-ITM-012 — the linked item wearing its own
                                  face, exactly as it appears in Inventory. A
                                  line of text alone made this the one item list
                                  in the admin with nothing to recognise.  */}
                              <ItemThumb
                                item={{ sku: v.itemSku ?? "", name: v.itemLabel ?? "item", imageUrl: v.itemImage }}
                                size={30}
                              />
                              <span className="text-[13px] text-body-soft flex-1 min-w-0 truncate">
                                Counted in Inventory · {v.itemLabel ?? "item linked"}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setVariants((cur) =>
                                    cur.map((x) =>
                                      x.key === v.key
                                        ? { ...x, itemId: null, itemLabel: null, itemImage: null, itemSku: null }
                                        : x,
                                    ),
                                  )
                                }
                                className="text-[12.5px] text-body-soft hover:text-[#c0392b]"
                              >
                                Unlink
                              </button>
                            </>
                          ) : (
                            <>
                              <input
                                className="ipt text-[13.5px]"
                                style={{ width: 96, minHeight: 38 }}
                                type="number"
                                min={0}
                                value={v.stockQty}
                                onChange={(e) =>
                                  setVariants((cur) =>
                                    cur.map((x) =>
                                      x.key === v.key
                                        ? { ...x, stockQty: e.target.value }
                                        : x,
                                    ),
                                  )
                                }
                              />
                              <span className="text-[12.5px] text-body-soft">in stock</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setVItemFor(vItemFor === v.key ? null : v.key);
                                  setVItemQ("");
                                }}
                                className="ml-auto text-[12.5px] px-2.5 py-1.5 rounded-[9px] border border-dashed border-orchid-mid text-orchid bg-white hover:bg-orchid-soft/40"
                              >
                                Count from Inventory…
                              </button>
                            </>
                          )}
                        </div>
                      ))}

                      {/*  DEC-PRD-015 — the Item search, at full width. Inside a
                          row an item's name would not even be readable.  */}
                      {vItemFor && (
                        <div className="rounded-[14px] border-2 border-plum bg-white overflow-hidden shadow-[0_0_0_3px_#f3ebf8]">
                          <div className="flex items-center gap-3 px-3.5 py-3 bg-[linear-gradient(135deg,#f6f0fa,#fff)] border-b border-lavender-deep">
                            <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center text-white bg-plum shrink-0">
                              <Icon name="box" size={14} />
                            </span>
                            <div className="text-[13.5px] font-bold text-purple flex-1 min-w-0 truncate">
                              Which stockroom item holds{" "}
                              {variants.find((x) => x.key === vItemFor)?.label}?
                            </div>
                            <button
                              type="button"
                              onClick={() => setVItemFor(null)}
                              className="text-[12.5px] font-bold text-body-soft hover:text-purple shrink-0"
                            >
                              Close
                            </button>
                          </div>

                          <div className="p-3">
                            <div className="flex items-center gap-2.5 flex-wrap mb-2.5">
                              <input
                                className="ipt h-[44px] flex-1 min-w-[200px]"
                                placeholder="Search by item code or name…"
                                value={vItemQ}
                                onChange={(e) => setVItemQ(e.target.value)}
                                autoFocus
                              />
                              {/*  The same door the product's own search has —
                                  the item that is missing gets made without
                                  losing the place here.  */}
                              <Link
                                href={`/items/new?name=${encodeURIComponent(name)}`}
                                className="inline-flex items-center gap-2 text-[13px] font-bold text-purple border-2 border-lavender-deep bg-white rounded-[11px] px-3.5 h-[44px] hover:border-orchid transition-colors whitespace-nowrap"
                              >
                                <Icon name="plus" size={14} /> New item
                              </Link>
                            </div>

                            <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto">
                              {vItemHits.length === 0 && (
                                <div className="text-[13px] text-body-soft px-1 py-2">
                                  No item matches “{vItemQ || "…"}”. Make it in{" "}
                                  <Link href="/items/new" className="text-orchid font-bold hover:underline">
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
                                        x.key === vItemFor
                                          ? {
                                              ...x,
                                              itemId: it.id,
                                              itemLabel: `${it.name} · ${it.sku}`,
                                              itemImage: it.imageUrl ?? null,
                                              itemSku: it.sku,
                                            }
                                          : x,
                                      ),
                                    );
                                    setVItemFor(null);
                                  }}
                                  className="flex items-center gap-3 border border-lavender-deep rounded-[12px] px-2.5 py-2 hover:border-orchid hover:bg-lavender/50 transition-colors text-left"
                                >
                                  <ItemThumb item={{ sku: it.sku, name: it.name, imageUrl: it.imageUrl }} size={34} />
                                  <span className="flex-1 min-w-0">
                                    <span className="block text-[13.5px] font-bold text-purple truncate">
                                      {it.name}
                                    </span>
                                    <span className="block text-[12px] text-body-soft font-mono">
                                      {it.sku}
                                    </span>
                                  </span>
                                  {it.supplier && (
                                    <span className="text-[11px] font-bold px-2 py-[3px] rounded-full border bg-[#fff6e5] text-[#8a5a00] border-[#f0d9a8] shrink-0">
                                      {it.supplier.nickname || it.supplier.name}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              )}

              {/*
                ── TWO CLOCKS, AND THEY ARE NOT THE SAME CLOCK ───────────────
                Owner, 1 Aug 2026: *"there's no way to tell the day field
                from the time field, which one is day and which is time"*.

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
                    Owner, 1 Aug 2026: *"instead of a + icon there should be
                    something like 3 image slots, that'll make it easier to
                    understand"*.

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

                <span className="flex items-center gap-1.5 text-[13px] text-body-soft mt-3">
                  {photos.length}/{MAX_PHOTOS}
                  <Info text={`Square photos, 1:1. Any size goes up — each is stored under ${TARGET_MB} MB. Drag to reorder; the first one is the main image.`} />
                </span>
              </Card>

              {/*  Each variant's own photo, beside the product's — owner,
                  8 Aug 2026. It used to hide inside a 132px card on the
                  Variants tab; photographs belong with photographs.  */}
              {hasVariants && (
                <Card
                  icon="photo"
                  title="A photo for each one"
                >
                  {variants.length === 0 ? (
                    <p className="text-[13px] text-body-soft m-0">
                      Nothing picked yet — choose them in{" "}
                      <button
                        type="button"
                        onClick={() => setSec("variants")}
                        className="text-orchid font-semibold hover:underline"
                      >
                        Variants &amp; options
                      </button>
                      .
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {variants.map((v) => {
                        const shown = v.imageUrl || v.masterImage;
                        return (
                          <div key={v.key} style={{ width: 116 }}>
                            <label className="block cursor-pointer">
                              <span
                                className="block w-full h-[92px] rounded-[12px] border border-lavender-deep bg-cover bg-center grid place-items-center text-body-soft hover:border-orchid transition-colors"
                                style={
                                  shown
                                    ? { backgroundImage: `url(${shown})` }
                                    : { background: v.swatch || "#f6f2fa" }
                                }
                              >
                                {vBusy === v.key ? (
                                  <span className="text-[11px] font-semibold">Uploading…</span>
                                ) : (
                                  !shown && <Icon name="plus" size={18} />
                                )}
                              </span>
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/avif"
                                className="hidden"
                                disabled={vBusy === v.key}
                                onChange={async (e) => {
                                  const f = e.target.files?.[0];
                                  e.target.value = "";
                                  if (!f) return;
                                  setVBusy(v.key);
                                  try {
                                    /*  ⚠️ 1:1 isn't forced here — that's a rule
                                        only for product photos (owner). The 1 MB
                                        limit applies to every image.  */
                                    const url = await uploadItemImage(f, "products", 1600);
                                    setVariants((cur) =>
                                      cur.map((x) =>
                                        x.key === v.key ? { ...x, imageUrl: url } : x,
                                      ),
                                    );
                                  } catch {
                                    /* the upload failing leaves everything else intact */
                                  } finally {
                                    setVBusy(null);
                                  }
                                }}
                              />
                            </label>
                            <div className="text-[12.5px] font-medium text-purple mt-1.5 truncate">
                              {v.label}
                            </div>
                            {v.imageUrl && (
                              <button
                                type="button"
                                onClick={() =>
                                  setVariants((cur) =>
                                    cur.map((x) =>
                                      x.key === v.key ? { ...x, imageUrl: "" } : x,
                                    ),
                                  )
                                }
                                className="text-[11.5px] text-body-soft hover:text-[#c0392b]"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              )}

              <Card
                icon="photo"
                title="Video"
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
              >
                {/*
                  DEC-DLV-011 (rev 2, owner's words verbatim) — "inside dhaka ja
                  thake thakbe. national ja thakar thakbe. kon product jodi
                  just inside hoy tahole ta select krbe, kon product jodi 2
                  tai kaj kre tahole 2 tai select krbe."

                  So one card, two boxes — each delivery in its own box, no
                  mixing. Inside Dhaka is always ticked (Bangladesh means
                  including Dhaka — there's no such state as "outside only").
                  Ticking Outside sets zone=NATIONWIDE in the DB, and opens
                  that box's courier chips. The names come from the delivery
                  module (DEC-DLV-008) — nothing here is hardcoded.
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
                        /*  Bold, and it says which state it is in (CLAUDE.md
                            §16). A ticked speed carries the colour, a tick and
                            a shadow; an unticked one stays quiet.  */
                        className={
                          "text-[13.5px] px-4 py-2.5 rounded-[11px] border-2 font-bold transition-all inline-flex items-center gap-1.5 " +
                          (on ? "text-white" : "bg-white text-purple hover:border-orchid-mid")
                        }
                        style={on
                          ? { background: "#6d3a9c", borderColor: "#6d3a9c", boxShadow: "0 3px 10px #6d3a9c55" }
                          : { borderColor: "var(--color-lavender-deep)" }}
                      >
                        {on && <Icon name="check" size={14} />}
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
                      {/*  ── box 1 · Inside Dhaka — always sells ──
                           A zone is the biggest decision on this tab, so it
                           gets a real head: a coloured icon tile, the name at
                           heading size, and the count of speeds picked. The
                           grey words that used to sit beside it ("always on")
                           are the ⓘ now.  */}
                      <div className="rounded-[16px] border-2 p-4"
                        style={{ borderColor: "#6d3a9c", background: "linear-gradient(135deg,#f6f0fa,#fff)" }}>
                        <div className="flex items-center gap-2.5 mb-3.5">
                          <span className="w-[34px] h-[34px] rounded-[11px] grid place-items-center text-white shrink-0"
                            style={{ background: "#6d3a9c", boxShadow: "0 3px 10px #6d3a9c55" }}>
                            <Icon name="check" size={17} />
                          </span>
                          <span className="font-display font-bold text-[17px] text-purple">Inside Dhaka</span>
                          <span className="ml-auto text-[12.5px] font-bold" style={{ color: "#6d3a9c" }}>
                            {dhakaTypes.filter((t) => delivTypeIds.includes(t.id)).length}/{dhakaTypes.length}
                          </span>
                        </div>
                        {dhakaTypes.length ? (
                          <div className="flex flex-wrap gap-2">{dhakaTypes.map(chip)}</div>
                        ) : (
                          emptyNote
                        )}
                      </div>

                      {/* ── box 2 · Outside Dhaka — optional ── */}
                      <div
                        className="rounded-[16px] border-2 p-4 transition-colors"
                        style={outsideOn
                          ? { borderColor: "#b76e79", background: "linear-gradient(135deg,#fbeef0,#fff)" }
                          : { borderColor: "var(--color-lavender-deep)", borderStyle: "dashed", background: "#fcfaff" }}
                      >
                        <div className="flex items-center gap-2.5 mb-3.5">
                          <button
                            type="button"
                            onClick={() => {
                              const next = outsideOn ? "DHAKA" : "NATIONWIDE";
                              setZone(next);
                              /*  Un-ticking Outside only drops the courier box's
                                  selection — the Dhaka speeds stay ticked.  */
                              if (next === "DHAKA")
                                setDelivTypeIds((ids) =>
                                  ids.filter((id) =>
                                    delivTypes.some((t) => t.id === id && t.zone === "DHAKA"),
                                  ),
                                );
                            }}
                            className="w-[34px] h-[34px] rounded-[11px] grid place-items-center shrink-0 transition-colors"
                            style={outsideOn
                              ? { background: "#b76e79", color: "#fff", boxShadow: "0 3px 10px #b76e7955" }
                              : { background: "#fff", color: "#b3a8bb", border: "2px solid var(--color-lavender-deep)" }}
                            title={outsideOn ? "Ticked — a courier can carry it" : "Tick if a courier can carry it"}
                          >
                            <Icon name={outsideOn ? "check" : "plus"} size={17} />
                          </button>
                          <span className="font-display font-bold text-[17px]"
                            style={{ color: outsideOn ? "#8a4350" : "var(--color-purple)" }}>
                            All Bangladesh
                          </span>
                          {outsideOn && (
                            <span className="ml-auto text-[12.5px] font-bold" style={{ color: "#8a4350" }}>
                              {courierTypes.filter((t) => delivTypeIds.includes(t.id)).length}/{courierTypes.length}
                            </span>
                          )}
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
                  ⚠️ If nothing is ticked, the product still publishes on
                  its scheduled day — it doesn't get blocked. This needs to
                  be spelled out, because leaving it empty and publishing
                  anyway is the easiest mistake to make, and its effect only
                  shows up at checkout, much later.
                */}
                {/*
                  ⚠️ Not a silent disappearance. If a price is removed for a
                  previously-ticked name, it drops off the list above — but
                  the tick stays on the product. Without saying so, the
                  owner would think everything is fine.
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

                {/*  ── WHEN THE MAKING TIME BEATS THE SPEED (owner, 23 Aug 2026) ──
                     His question: *"pre order hobe ba delivery date 5 day dilam,
                     tarpor abar delivery option a giye same day, 3 hours agulao
                     dilam — tahole bepar ta kivabe kaj korbe?"*

                     Checkout already answers it correctly: a method with no
                     date picker is shut while the basket needs days, and the
                     shopper is told why. Nothing can be sold in 3 hours that
                     takes 5 days to make.

                     But the ADMIN never said so. He could tick 3 Hours and Same
                     day on a 5-day product and reasonably believe he was
                     offering them. A tick that can never fire is a promise the
                     screen is making to him, not to the customer.  */}
                {(() => {
                  const waitDays = Math.max(0, Number(lead) || 0);
                  const preorder = soldOutMode === "PRE_ORDER";
                  if (!waitDays && !preorder) return null;
                  /*  A "fast" type is one the shopper cannot pick a date on —
                      exactly the test methodState() uses at checkout.  */
                  const dead = delivTypes.filter(
                    (t) =>
                      delivTypeIds.includes(t.id) &&
                      t.kind !== "COURIER" &&
                      (t.timing === "FROM_CONFIRM" || t.timing === "TODAY_SLOT"),
                  );
                  if (!dead.length) return null;
                  return (
                    <div className="rounded-[12px] px-4 py-3 mt-4 flex items-start gap-2.5"
                      style={{ background: "#fff6e5", border: "1px solid #f0d9a8" }}>
                      <Icon name="clock" size={15} className="shrink-0 mt-[2px]" style={{ color: "#8a5a00" }} />
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold" style={{ color: "#8a5a00" }}>
                          {dead.map((t) => t.name).join(" · ")} will not be offered
                        </div>
                        <div className="text-[12.5px] mt-0.5" style={{ color: "#8a5a00", opacity: 0.85 }}>
                          {preorder
                            ? "This is a pre-order, so nothing can go out the same day."
                            : `This takes ${waitDays} day${waitDays === 1 ? "" : "s"} to make, so nothing can go out the same day.`}
                          {" "}Schedule it and courier still work.
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/*  What the customer will actually be offered, in one line.
                     Empty is a real state and it is worth flagging in amber:
                     the product still publishes, but only on a scheduled day,
                     and that only shows up at checkout much later.  */}
                <div className="rounded-[12px] px-4 py-3 mt-4 flex items-center gap-2.5 flex-wrap"
                  style={delivTypeIds.length === 0
                    ? { background: "#fff6e5", border: "1px solid #f0d9a8" }
                    : { background: "var(--color-lavender)" }}>
                  {delivTypeIds.length === 0 ? (
                    <>
                      <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: "#f0a323" }} />
                      <span className="text-[13px] font-bold" style={{ color: "#8a5a00" }}>Scheduled day only</span>
                    </>
                  ) : (
                    <>
                      <Icon name="truck" size={15} className="text-purple shrink-0" />
                      <span className="text-[13px] font-bold text-purple">
                        {delivTypes.filter((t) => delivTypeIds.includes(t.id)).map((t) => t.name).join(" · ")}
                      </span>
                    </>
                  )}
                </div>
              </Card>
            </>
          )}

          {/*  ── VARIANTS, grouped 22 Aug 2026 ──────────────────────────────
               Five cards in one column — options, bundles, why-buy, upgrades,
               add-ons — and only the first is about variants at all. The same
               chip rail Product story uses: one job on screen at a time, and
               a green dot on the groups that already hold something.  */}
          {sec === "variants" && (
            <>
              <VarChips value={varOpen} onChange={setVarGroup} filled={varFilled} hasVariants={hasVariants} />
              {/*
                ⚠️ There used to be a purple box here that explained all
                four of Variant / Size / Upgrade / Add-ons in four lines —
                the owner took one look and said *"what kind of design is
                this"*. He was right: four definitions were being taught at
                once, when people came here to do one task.

                Each definition now lives in its own card's `?`, where it's
                available the moment it's needed — and takes up no room
                before that.
              */}
              {/*
                ═══════════════════════════════════════════════════════════════
                DEC-PRD-012 — one product, many variants. Owner, 1 Aug 2026:

                *"if a product has no variants, then I won't choose anything
                there. when it does have multiple variants, I'll show that —
                and that'll be on one product page. each one will have its
                own image and stock."*

                ⚠️ Previously only **one** value could be picked here,
                because in the old design the product itself WAS one colour,
                and three colours meant three separate products. A screen to
                merge that old design was never built, so the swatch never
                actually showed up in practice — the owner caught exactly
                that.
                ═══════════════════════════════════════════════════════════════
              */}
              <VarGroup id="options" open={varOpen}>
              <Card
                icon="sparkle"
                /*  ⚠️ Kept deliberately short — owner, 2 Aug:
                    *"variant option tab ta onk beshi text, agula clean kro"*.
                    The rest of the explanation lives in the `?`, available
                    when needed.  */
                title="Colours, flavours, sizes"
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
                    {/*  ── which lists ─────────────────────────────────────
                        DEC-PRD-045 — more than one may be on at once. Before
                        23 Aug this was a one-of-many chooser, and that is
                        exactly what made Size × Colour impossible.  */}
                    <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-orchid mb-2">
                      Which lists
                    </div>
                    {/*  DEC-PRD-063 — the ticked lists first, in the order the
                        page will show them (↑ ↓ to change it), then the rest  */}
                    <div className="flex flex-wrap gap-2">
                      {[...orderedAxes(axisPicks), ...liveAttrs.filter((a) => (axisPicks[a.id] ?? []).length === 0)].map((a, idx, arr) => {
                        const picked = (axisPicks[a.id] ?? []).length;
                        const on = picked > 0;
                        const onCount = arr.filter((x) => (axisPicks[x.id] ?? []).length > 0).length;
                        const open = (vAttrOpen ?? liveAttrs.find((x) => (axisPicks[x.id] ?? []).length > 0)?.id ?? null) === a.id;
                        return (
                          <span key={a.id} className="inline-flex items-stretch gap-1">
                          {on && onCount > 1 && (
                            <span className="inline-flex flex-col justify-center gap-0.5">
                              <button type="button" title="Show this list earlier" disabled={idx === 0}
                                onClick={() => moveAxis(a.id, -1)}
                                className="w-6 h-[18px] rounded-[6px] grid place-items-center bg-lavender text-purple text-[10px] font-bold hover:bg-purple hover:text-white disabled:opacity-30 disabled:hover:bg-lavender disabled:hover:text-purple">↑</button>
                              <button type="button" title="Show this list later" disabled={idx === onCount - 1}
                                onClick={() => moveAxis(a.id, 1)}
                                className="w-6 h-[18px] rounded-[6px] grid place-items-center bg-lavender text-purple text-[10px] font-bold hover:bg-purple hover:text-white disabled:opacity-30 disabled:hover:bg-lavender disabled:hover:text-purple">↓</button>
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setVAttrOpen(a.id)}
                            className={`inline-flex items-center gap-2 text-[13.5px] font-bold px-4 py-2.5 rounded-[12px] border-2 transition-all ${
                              open
                                ? "bg-purple border-purple text-white shadow-[0_4px_14px_rgba(71,0,102,.3)]"
                                : on
                                  ? "bg-orchid-soft border-orchid-mid text-purple"
                                  : "bg-white border-lavender-deep text-purple hover:border-orchid"
                            }`}
                          >
                            {a.name}
                            {on && (
                              <span
                                className={`inline-grid place-items-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[11.5px] font-extrabold ${
                                  open ? "bg-white/25 text-white" : "bg-white text-purple"
                                }`}
                              >
                                {picked}
                              </span>
                            )}
                          </button>
                          </span>
                        );
                      })}
                    </div>

                    {/* ── the open list's values ── */}
                    {(() => {
                      const openId =
                        vAttrOpen ??
                        liveAttrs.find((x) => (axisPicks[x.id] ?? []).length > 0)?.id ??
                        null;
                      const a = liveAttrs.find((x) => x.id === openId);
                      if (!a) return null;
                      const mine = axisPicks[a.id] ?? [];
                      return (
                        <div className="mt-4 pt-4 border-t border-lavender-deep">
                          <div className="flex items-center gap-2 mb-2.5">
                            <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-orchid">
                              {a.name} — which ones
                            </div>
                            {mine.length > 0 && (
                              <button
                                type="button"
                                onClick={() => applyPicks({ ...axisPicks, [a.id]: [] })}
                                className="ml-auto text-[12.5px] font-bold text-body-soft hover:text-[#c0392b]"
                              >
                                Clear {a.name}
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {a.values
                              .filter((val) => val.isActive)
                              .map((val) => {
                                const on = mine.includes(val.id);
                                return (
                                  <button
                                    key={val.id}
                                    type="button"
                                    onClick={() =>
                                      applyPicks({
                                        ...axisPicks,
                                        [a.id]: on
                                          ? mine.filter((x) => x !== val.id)
                                          : [...mine, val.id],
                                      })
                                    }
                                    className={`inline-flex items-center gap-2 text-[13.5px] font-bold px-3.5 py-2 rounded-full border-2 transition-all ${
                                      on
                                        ? "bg-purple border-purple text-white shadow-[0_3px_10px_rgba(71,0,102,.25)]"
                                        : "bg-white border-lavender-deep text-body hover:border-orchid"
                                    }`}
                                  >
                                    {val.swatch && (
                                      <span
                                        className="w-[15px] h-[15px] rounded-full border border-white/50"
                                        style={{ background: val.swatch }}
                                      />
                                    )}
                                    {val.label}
                                    {on && <Icon name="check" size={12} />}
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      );
                    })()}

                    {/*  ── the things to sell ───────────────────────────────
                        Owner, 23 Aug 2026, on the dropdown he had asked for
                        the same morning: *"jehetu stock ar jonno stock a tab
                        kaj kra jay abr price ar jonno price tab o kaj kra
                        jay tahole ai tab agular r dokar nai. just akhane
                        koyta product holo tai dekha gele hbe."*

                        He is right, and it is the 8 August rule again: one
                        tab, one kind of work. Price is typed on Pricing,
                        stock on Stock, the photo on Photos. A second box for
                        the same number is two doors onto one room — and the
                        day they disagree, nobody knows which was meant.

                        So this list ANSWERS ONE QUESTION: what did the ticks
                        add up to. One line per thing a customer can order,
                        with its price and count shown as they stand, and the
                        one switch that lives nowhere else — whether it sells
                        at all.  */}
                    {variants.length > 0 && (
                      <div className="mt-5 pt-5 border-t border-lavender-deep">
                        <div className="flex items-center gap-2 mb-2.5">
                          <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-orchid">
                            {variants.length} to sell
                          </div>
                          {variants.length > 1 && (
                            <span className="ml-auto text-[12px] font-bold text-body-soft">
                              {variants.filter((v) => v.isActive).length} live
                            </span>
                          )}
                        </div>

                        <div className="flex flex-col gap-2">
                          {variants.map((v) => {
                            const counted = v.itemId
                              ? v.itemLabel ?? "Counted in Inventory"
                              : `${parseInt(v.stockQty, 10) || 0} in stock`;
                            return (
                              <div
                                key={v.key}
                                className={`flex items-center gap-3 flex-wrap rounded-[14px] border-2 border-lavender-deep px-3 py-2.5 ${
                                  v.isActive ? "bg-white" : "bg-[#faf8fb]"
                                }`}
                              >
                                {/*  Its own photo first, then the master value's,
                                    then the stockroom item's mugshot — never a
                                    blank square while a picture of the thing
                                    exists somewhere.  */}
                                <span
                                  className="w-[38px] h-[38px] rounded-[10px] border border-lavender-deep bg-lavender shrink-0 bg-cover bg-center grid place-items-center text-body-soft"
                                  style={
                                    v.imageUrl || v.masterImage || v.itemImage
                                      ? { backgroundImage: `url(${v.imageUrl || v.masterImage || v.itemImage})` }
                                      : undefined
                                  }
                                >
                                  {!v.imageUrl && !v.masterImage && !v.itemImage && (
                                    <Icon name="photo" size={14} />
                                  )}
                                </span>
                                {v.swatch && (
                                  <span
                                    className="w-[14px] h-[14px] rounded-full border border-lavender-deep shrink-0"
                                    style={{ background: v.swatch }}
                                  />
                                )}
                                <b
                                  className={`text-[14px] font-bold truncate flex-1 min-w-0 ${
                                    v.isActive ? "text-purple" : "text-body-soft"
                                  }`}
                                >
                                  {v.label}
                                </b>

                                <span className="text-[13px] font-bold text-purple whitespace-nowrap">
                                  {v.price.trim() ? `৳${v.price}` : "base price"}
                                </span>
                                <span className="text-[12.5px] text-body-soft whitespace-nowrap hidden sm:inline">
                                  {counted}
                                </span>

                                {/*  Off keeps the row and its numbers but takes
                                    it off the website — the honest way to pause
                                    one pair without losing what was typed. It is
                                    the only thing on this screen that belongs to
                                    the pair and to no other tab.  */}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setVariants((cur) =>
                                      cur.map((x) =>
                                        x.key === v.key ? { ...x, isActive: !x.isActive } : x,
                                      ),
                                    )
                                  }
                                  className={`text-[11px] font-extrabold px-2.5 py-1.5 rounded-full ${
                                    v.isActive
                                      ? "bg-[#e8f6ef] text-[#0f7d55]"
                                      : "bg-[#eae6ef] text-body-soft"
                                  }`}
                                >
                                  {v.isActive ? "ON" : "OFF"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Card>
              </VarGroup>

              {/*
                ═══════════════════════════════════════════════════════════════
                "SIZES" CARD REMOVED — owner's decision, 2 Aug 2026:
                *"ha size ta tahole to dorkar nai eta soraia daw"*

                Why. The "Colours, flavours, sizes" card above does the same
                job, and does it better: one shared list for everyone
                (master), each size with its own image and its own stock.
                The old card only lived on this one product, couldn't hold a
                photo, and its "Stock" field could be typed into but was
                never saved anywhere — that column doesn't even exist in the
                database.

                ⚠️ Nothing was deleted. The `ProductSize` table, the API, and
                the website's size row are all still exactly where they
                were, so any product that already had sizes set keeps
                working as before. `buildDto` now simply never sends
                `sizes` — and not sending it means the API doesn't touch
                them. Sending an empty array would have wiped out the old
                sizes on every Publish.
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
              <VarGroup id="bundles" open={varOpen}>
              <Card
                icon="tag"
                title="Bundles"
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
                      DEC-PRD-017 — one bundle, holding as many products as
                      needed, with one discount field below. Owner's rule:
                      the discount applies to the total including the main
                      product.
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
                              <ProductThumb slug={p.slug} imageUrl={p.images?.[0]?.url} size={30} />
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
                        {/*  ⚠️ No discount field here — DEC-PRD-019, owner's
                            instruction: *"variant page a akhono discount button
                            ache ja amder dorkar nai. amra price tab a sob
                            kaj korbo."* This card's job is only which items.  */}
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
                              <ProductThumb slug={x.slug} imageUrl={x.images?.[0]?.url} size={30} />
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
              </VarGroup>

              <VarGroup id="upgrades" open={varOpen}>
              <Card
                icon="box"
                title="Upgrade products"
              >
                {(myUpgrades.length > 0 || pendingUp.length > 0) && (
                  <div className="flex flex-col gap-2 mb-3">
                    {[...myUpgrades, ...pendingUp].map((u) => (
                      <div key={u.id} className="flex items-center gap-3 bg-lavender/50 rounded-[11px] px-3 py-2.5">
                        <ProductThumb slug={u.slug} imageUrl={u.images?.[0]?.url} size={30} />
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
                            <ProductThumb slug={x.slug} imageUrl={x.images?.[0]?.url} size={30} />
                            <span className="flex-1 min-w-0 text-[13px] text-purple font-medium truncate">{x.name}</span>
                            <span className="text-[13px] text-body-soft font-mono">{x.sku ?? "—"}</span>
                            <span className="text-[13px] text-body-soft">{formatTaka(x.offerPricePaisa)}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
                {/*  ⚠️ There used to be two paragraphs, now it's one line.
                    And the line is actually true now too — before
                    DEC-PRD-020 the storefront never even read this.  */}

              </Card>
              </VarGroup>

              <VarGroup id="addons" open={varOpen}>
              <Card
                icon="tag"
                title="Add-ons"
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
              </VarGroup>
            </>
          )}

          {/*
            ═══════════════════════════════════════════════════════════════════
            TAGS — DEC-PRD-022, owner's question, 2 Aug 2026:
            *"tag module a kaj korle ba update korle product upload page sathe
            sathe update hoy kina?"*

            The answer was **no** — the chips were drawn from two
            hand-written arrays in this file (8 occasions, 5 recipients). A
            new tag or new group created in Occasions & Tags would never
            show up here.

            Now they're drawn straight from the API, grouped. Whatever the
            owner creates shows up here, immediately.
            ═══════════════════════════════════════════════════════════════════
          */}
          {sec === "tags" && (
            <>
              {(() => {
                /*  sorted by group. A tag without a group can still exist
                    (older data) — those go last, under "Other", not
                    hidden.  */
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

                /*  ── One card, one row per group (22 Aug 2026) ──
                    Every group used to get a card of its own, so four groups
                    meant four headings, four boxes and a page of scrolling to
                    tick six words. They are rows now: the group name on the
                    left, its chips on the right, a count that fills in as you
                    tick. The whole tab fits on one screen.  */
                return (
                  <Card icon="hash" title="Tags"
>
                    <div className="divide-y divide-lavender-deep -my-1">
                      {[...byGroup.entries()].map(([key, g]) => {
                        const picked = g.tags.filter((t) => tagSel.includes(t.slug)).length;
                        return (
                          <div key={key} className="grid grid-cols-1 md:grid-cols-[168px_1fr] gap-3 md:gap-4 py-4 items-start">
                            <div className="flex items-center gap-2 md:pt-1">
                              <span className="w-[28px] h-[28px] rounded-[9px] grid place-items-center shrink-0"
                                style={picked
                                  ? { background: "#6d3a9c", color: "#fff" }
                                  : { background: "#f3ebf8", color: "#6d3a9c" }}>
                                <Icon name="hash" size={14} />
                              </span>
                              <span className="text-[14px] font-bold text-purple truncate">{g.name}</span>
                              {picked > 0 && (
                                <span className="text-[11.5px] font-bold px-2 py-[2px] rounded-full tabular-nums"
                                  style={{ background: "#f3ebf8", color: "#6d3a9c" }}>{picked}</span>
                              )}
                            </div>
                            <Chips
                              all={g.tags.map((t) => t.slug)}
                              labels={Object.fromEntries(g.tags.map((t) => [t.slug, t.name]))}
                              value={tagSel}
                              onToggle={(v) => toggle(tagSel, v, setTagSel)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })()}
            </>
          )}

          {/*  ── STORY, rebuilt 22 Aug 2026 (owner picked "B + D together") ──
               Eight cards in one column was the longest, greyest screen in the
               panel. Two things fix it, and they turn out to help each other:

                 B — the eight fall into FIVE groups behind a bold chip rail,
                     so one idea is on screen at a time.
                 D — the customer's page stands beside them and lights up the
                     part being edited.

               And they are wired BOTH ways: press a chip and that part of the
               phone lights; press a part of the phone and its chip opens. The
               owner stops having to guess which box feeds which line.  */}
          {sec === "story" && (
            <>
              <StoryChips value={storyGroup} onChange={setStoryGroup} filled={storyFilled} />
              <StoryGroup id="nature" open={storyGroup}>
              {/*  DEC-PRD-044 — the five kinds were hardcoded here and the line
                   beside them was free text, so picking "fresh" filled nothing
                   and "100% Fresh Flowers" was retyped, slightly differently,
                   on every product. They are a master now: press one and BOTH
                   boxes fill. The line stays editable — one bouquet in the
                   fresh list may want "Cut This Morning".  */}
              <Card icon="book" title="Nature line">
                <div className={gridCls}>
                  <Field label="Type">
                    <input
                      className="ipt h-[44px]"
                      value={typeText}
                      onChange={(e) => setTypeText(e.target.value)}
                      placeholder="fresh / artificial / live plant / edible / custom…"
                    />
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
                <NatureChips
                  rows={natures}
                  setRows={setNatures}
                  active={typeText}
                  onPick={(n) => {
                    setTypeText(n.name);
                    setNatureLabel(n.label);
                  }}
                />
              </Card>
              </StoryGroup>
              {/*
                ═══════════════════════════════════════════════════════════════
                DEC-PRD-025 — owner, 2 Aug 2026:
                *"we should first set a fake sale count here, like 50, 100,
                1000. then when a real sale happens, it should add to that
                number — I set 50, one sale happened, it auto becomes 51.
                like our stock, you forgot this. and right now there's only
                last month — we need today, week, month and all time."*

                ⚠️ He was right, and I really had forgotten half of it. The
                counting was working (it went up when an order was
                delivered), but the number **never showed** on the product
                page — what was on the page was a separate calculation,
                counting only genuine orders, and staying silent below 10.
                ═══════════════════════════════════════════════════════════════
              */}
              <StoryGroup id="signal" open={storyGroup}>
              <Card
                icon="star"
                title="Sales signal"
              >
                {/*
                  ⚠️ One field, a dropdown beside it — owner's instruction,
                  2 Aug 2026: *"why did you do it this way, it doesn't look
                  good at all. the way it was done at first was nice — one
                  field and the dropdown beside it, that was the nice one."*

                  The four numbers are still kept separate (his own earlier
                  decision), but the screen shows only one field — whichever
                  the dropdown points to. Showing all four fields at once
                  means three numbers sitting in front of you that aren't
                  going anywhere at that moment.
                */}
                <div className={pairCls}>
                  <Field
                    label="Starting number"
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
                {/*  ⚠️ There used to be two paragraphs here — what shows,
                    and when it expires. The owner said on 3 Aug that he
                    wants the page clean, so the two became one line. The
                    expiry line can't be dropped — without it he'd think
                    the number had disappeared.  */}
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
              </StoryGroup>
              {/*
                ═══════════════════════════════════════════════════════════════
                DEC-PRD-026 — owner, 2 Aug 2026: *"for our customizable
                products, some need an image upload and some need a text
                field on the product page — I couldn't find a place to
                configure that."*

                ⚠️ He couldn't find it because it didn't exist. The
                storefront's seam had `perso: null` hardcoded straight in,
                so the box **never** appeared on any product — even though
                cart, checkout and order were already carrying the text and
                image along.
                ═══════════════════════════════════════════════════════════════
              */}
              <StoryGroup id="perso" open={storyGroup}>
              <Card
                icon="edit"
                title="Let the customer add something"
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
                      {/*  DEC-PRD-048 — the product page used to print the word
                          "required" beside this whole section, with nothing
                          behind it: the buttons worked and the order went
                          through empty. It is a real switch now, and the
                          buttons AND the server both hold to it.  */}
                      <div className="sm:col-span-2">
                        <Sw
                          on={persoTextRequired}
                          onToggle={() => setPersoTextRequired(!persoTextRequired)}
                        >
                          They must fill it in
                        </Sw>
                      </div>
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
                      {/*  DEC-PRD-048 — see the note on the message box.  */}
                      <Sw
                        on={persoImageRequired}
                        onToggle={() => setPersoImageRequired(!persoImageRequired)}
                      >
                        They must upload one
                      </Sw>
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
                DEC-PRD-027 — owner: *"which products we allow customizing
                on, which shows a WhatsApp button beside it — the option to
                configure that... I couldn't find that anywhere either."*

                ⚠️ Until now the box showed on **every** product, and the
                number was `wa.me/8801000000000` — a made-up number I had
                put in.
              */}
              <Card
                icon="phone"
                title="“Want this customised?” box"
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
                      {/*  ⚠️ The number can't be typed here, and that's
                          correct — keeping two numbers in two places would
                          someday leave one sitting stale.  */}
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
              </StoryGroup>

              <StoryGroup id="trust" open={storyGroup}>
              <Card
                icon="check"
                title="Trust badges"
              >
                {/*
                  DEC-PRD-023 — owner, 2 Aug 2026: *"for trust badges, I
                  can't custom-make any icon myself, you've just put in
                  whatever you thought was right."*

                  ⚠️ There is **no template here anymore**. The template used
                  to mean three badges I'd hand-written, which the owner had
                  no way to change. The real place now is Categories → that
                  category → "Product page — badges & what's inside", where
                  a custom icon can be set too. This card exists only for
                  the exception.
                */}
                <FromCategory
                  from={storyFrom}
                  count={catTrust.length}
                  hasOwn={trust.length > 0}
                  onCopy={() =>
                    setTrust(
                      catTrust.map((b) => ({
                        /*  DEC-PRD-031 — one list, so it's a direct pass-through.  */
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
                          {/*  ⚠️ The icon is now genuinely an icon. There
                              used to be a `<select>` here showing text like
                              "truck · nationwide" — owner: *"why does text
                              show for the icon — it should be an
                              image."*  */}
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
                              {/*  ⚠️ Said before the picker — after a file is
                                  chosen it is too late to be useful. And it is
                                  no longer about the SIZE: the shop draws an
                                  upload and a built-in at the same size, and
                                  what differs is the file (9 Sep 2026).  */}
                              <div className="flex items-start gap-2 bg-white border border-lavender-deep rounded-[9px] px-3 py-2 mb-3">
                                <span className="text-orchid shrink-0 mt-0.5">
                                  <Icon name="upload" size={14} />
                                </span>
                                <span className="text-[12px] text-body leading-relaxed">
                                  <b className="text-purple font-semibold">Square, edge to
                                  edge, on a see-through background</b> — SVG or PNG, max 50 KB.
                                </span>
                              </div>

                              <div className="text-[12px] text-body-soft mb-2">
                                Pick a symbol
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
                                      /*  Setting a custom image clears the
                                          built-in name, and vice versa —
                                          with both set at once, there'd be
                                          no way to tell from the row which
                                          one would actually show.  */
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
                {/*  ⚠️ "Later you can upload your own icon sets" used to be
                    written here — that "later" has now arrived, in
                    DEC-PRD-023, and it lives in Categories. So the promise
                    line was removed.  */}
              </Card>
              </StoryGroup>
              {/*
                Craft cards — page copy, so they sit beside the other page
                copy (moved off the Variants tab, 23 Aug 2026). Almost always
                left empty: the story belongs to the category and is written
                once there. This is the escape hatch for the one product with
                a different one.
              */}
              <StoryGroup id="why" open={storyGroup}>
              <Card
                icon="sparkle"
                title="Why buy from us"
              >
                {/*  DEC-WEB-011 — an unsaved product used to show the words
                    "Save this product first" and nothing else, so there was no
                    way to see whether the category's cards were reaching it.
                    With no id CraftEditor goes read-only and shows what the
                    page will carry.  */}
                <CraftEditor
                  owner={apiProductId ? { productId: apiProductId } : {}}
                  inheritedFrom={craftFrom.name || undefined}
                  inheritedFromId={craftFrom.id ?? undefined}
                />
              </Card>
              </StoryGroup>

              <StoryGroup id="inside" open={storyGroup}>
              <Card
                icon="book"
                title="What's inside"
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

                {/*  ── DEC-PRD-046 · the category's ready-made lists ─────────
                    Owner, 23 Aug 2026: *"onk time dekha jay akta category te
                    4-5 ta thakle subida hoy... template show krbe, jeta mon
                    chaibe seta select krbe."*

                    ⚠️ Pressing one COPIES it. His rule, in his words:
                    *"template je product a use hobe seta kokhono change hbe
                    na"* — so this is a starting point, never a live link. The
                    first list is what a product showing nothing of its own
                    already displays; the others are here to be taken.  */}
                {catLists.length > 1 && (
                  <div className="mb-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-orchid">
                        Ready-made lists · from {storyFrom || "the category"}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {catLists.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() =>
                            setSpec(
                              (t.rows ?? [])
                                .filter((r) => r.isActive)
                                .map((r) => ({ item: r.item, qty: r.qty })),
                            )
                          }
                          className="inline-flex items-center gap-2 text-[13.5px] font-bold px-4 py-2.5 rounded-[12px] border-2 border-lavender-deep bg-white text-purple hover:border-orchid transition-colors"
                        >
                          {t.name.trim() || "Untitled list"}
                          <span className="inline-grid place-items-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[11.5px] font-extrabold bg-orchid-soft text-purple">
                            {(t.rows ?? []).filter((r) => r.isActive).length}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
              >
                {/*  ⚠️ FAQ is the only one that **adds up** — the product's
                    own first, then the category's. Badges and "What's
                    inside" replace instead. Writing the distinction down
                    here, since with three cards side by side it's natural
                    to assume they all follow the same rule.  */}
                {/*  DEC-PRD-037 — the "Template · Load" bar is gone (owner,
                    9 Aug 2026). It loaded questions and answers out of the
                    MOCK catalogue, and its dropdown still listed eight
                    category names that do not exist in this shop. Invented
                    answers on a real product page, with no screen anywhere to
                    author real ones. Category → FAQ is that screen now, and
                    those answers already appear under these.  */}
                {/*  ── DEC-PRD-047 · the category's questions, taken and edited ──
                    Owner, 23 Aug 2026: *"faq select ar kon option nai. select
                    krte gele abr category page a niye jay. just nirdisto
                    product a FAQ change hote pare but ta krar kon option nai.
                    new add and edit and delete option thaka uchit, ar jonno
                    category te newa dorkar nai. abr akhane change krle
                    category te change hbe amn o na."*

                    So the panel is the same one badges and "What's inside"
                    use: press once, the questions land below as this
                    product's own, and every one can be reworded or thrown
                    away without touching the category.

                    ⚠️ THE RULE CHANGED WITH IT. FAQ used to ADD UP — the
                    product's own and then the category's, both on the page.
                    That cannot survive copying: take three questions, change
                    one word, and the page prints all three twice. So the
                    product's own now REPLACE the category's, exactly as the
                    other two do, and this screen is back to one rule instead
                    of two.  */}
                <FromCategory
                  from={storyFrom}
                  count={catFaq.length}
                  hasOwn={faqs.length > 0}
                  onCopy={() => setFaqs(catFaq.map((f) => ({ q: f.question, a: f.answer })))}
                  onClear={() => setFaqs([])}
                >
                  {catFaq.map((f) => (
                    <div key={f.id} className="text-[13px]">
                      <b className="font-semibold text-purple block">{f.question}</b>
                      <span className="text-body-soft line-clamp-2">{f.answer}</span>
                    </div>
                  ))}
                </FromCategory>
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
              >
                <textarea
                  className="ipt"
                  rows={2}
                  value={oz}
                  onChange={(e) => setOz(e.target.value)}
                  placeholder="Available inside Dhaka only."
                />
              </Card>
              </StoryGroup>
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
>
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
>
                <div className="grid gap-4">
                  {/*
                    DEC-PRD-024 — owner, 2 Aug 2026: *"I didn't understand
                    what link I'm supposed to give for the image."*

                    ⚠️ A fair question — there used to be just a field
                    saying "https://…", but where would the shop even get an
                    image URL from? Now it can be uploaded directly, the
                    same way a product's photo is. The field still remains,
                    because sometimes an image address from elsewhere does
                    need to be pasted in.
                  */}
                  <Field
                    label="Share picture"
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
                              /*  1 MB limit applies to every image — the
                                  owner's rule. 1:1 isn't forced here; the
                                  share card is wide.  */
                              const url = await uploadItemImage(f, "products", 1200);
                              setOgImageUrl(url);
                            } catch {
                              /* if the upload fails, the field stays as it was */
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
                    <span className="inline-flex items-center gap-1.5">
                      <b>Keep this page out of Google</b>
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
                {visibleSections[secIdx - 1][1]}
              </button>
            ) : (
              <span />
            )}

            {secIdx < visibleSections.length - 1 && (
              <button
                type="button"
                onClick={() => goSec(secIdx + 1)}
                className="ml-auto inline-flex items-center gap-2.5 text-[14px] font-medium text-white bg-purple hover:bg-purple-deep rounded-[12px] px-5 py-3 shadow-soft transition-colors"
              >
                <span className="opacity-70 text-[13px]">Next</span>
                {visibleSections[secIdx + 1][1]}
                <span className="rotate-180 inline-flex">
                  <Icon name="chevronLeft" size={16} />
                </span>
              </button>
            )}

            {/*  The last section has nowhere to go next, so it offers the
                thing you were always heading towards instead.  */}
            {secIdx === visibleSections.length - 1 && (
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

        {/*  ── ONE preview, on every tab (owner, 22 Aug 2026) ──────────────
             There were briefly two: the old "Live preview" card and the phone
             built for the story tab. His verdict — *"2 ta jinis aksathe
             moteo valo lagche na"* — and he is right, so they became one.

             It is also the MAP of the form now. Every part of the page is a
             door: press the photo and Photos opens, press the price and
             Pricing opens, press the trust badges and the story tab opens on
             Trust. The owner stops hunting for which box feeds which line —
             he presses the line.  */}
        <aside className="w-[320px] shrink-0 sticky top-[84px] hidden lg:block">
          <div className="text-[11px] text-purple/55 font-bold uppercase tracking-[0.07em] mb-2 px-1">
            What the customer sees
          </div>
          <div className="bg-white rounded-[26px] overflow-hidden"
            style={{ border: "9px solid #2a0b3d", boxShadow: "0 10px 30px rgba(42,11,61,.22)" }}>
            <button
              type="button"
              onClick={() => goto("media")}
              title="Edit the photos"
              className="relative h-[180px] w-full bg-cover bg-center block"
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
            </button>
            <div className="p-4">
              <Hot on={sec === "story" && storyGroup === "nature"} onPick={() => goto("story", "nature")}>
                {natureLabel ? (
                  <span className="text-[10.5px] font-bold px-2 py-[3px] rounded-full" style={{ background: "#f6ecfb", color: "#7a2ea8" }}>
                    {natureLabel}
                  </span>
                ) : (
                  <span className="text-[11.5px] text-body-soft">No nature line</span>
                )}
              </Hot>
              {/*  8 Aug 2026 (owner) — the preview's name IS the link to the
                  live page. One click from "what it looks like" to "what it
                  actually is". Only once the product exists on the API.  */}
              {apiProductId && slugV ? (
                <a
                  href={storefrontUrl(slugV)}
                  target="_blank"
                  rel="noreferrer"
                  title="Open this product on the website"
                  className="block text-purple font-medium leading-snug hover:text-orchid hover:underline"
                >
                  {name || "Product name"} <span className="text-orchid">↗</span>
                </a>
              ) : (
                <div className="text-purple font-medium leading-snug">
                  {name || "Product name"}
                </div>
              )}
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
              {/*  DEC-PRD-035 — the preview mirrors the shop: every variant
                  priced → "from" the cheapest, and no struck price.  */}
              <div className="flex items-baseline gap-2 mt-3">
                {allVariantsPriced ? (
                  <span className="text-[22px] font-medium text-purple font-display">
                    <span className="text-[13px] font-normal text-body-soft mr-1">from</span>
                    {taka(cheapestVariantPaisa / 100)}
                  </span>
                ) : (
                  <>
                    <span className="text-[22px] font-medium text-purple font-display">
                      {taka(offer || 0)}
                    </span>
                    {showDisc && (
                      <span className="text-[14px] line-through text-body-soft">
                        {taka(sellN)}
                      </span>
                    )}
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => goto("price")}
                title="Edit the price"
                className="w-full mt-3.5 bg-purple text-white text-[13.5px] font-bold py-2.5 rounded-[11px]"
              >
                Add to cart
              </button>

              <div className="mt-3 pt-3 border-t border-lavender-deep space-y-1">
                <Hot on={sec === "story" && storyGroup === "perso"} onPick={() => goto("story", "perso")}>
                  <span className="text-[12px] font-semibold text-body">
                    {persoText || persoImage
                      ? persoTextLabel || persoImageLabel || "Add your own"
                      : "No personalisation"}
                  </span>
                </Hot>

                {/*  ⚠️ THE PREVIEW HAS TO COUNT WHAT THE CATEGORY GIVES (23 Aug
                    2026). It used to read the product's OWN rows only, so a
                    product inheriting three badges and three spec rows was
                    described as "No trust badges · nothing listed" — on the
                    one panel that claims to be what the customer sees. The
                    page was right; the preview was lying about it.  */}
                <Hot on={sec === "story" && storyGroup === "trust"} onPick={() => goto("story", "trust")}>
                  {(() => {
                    const shown = trust.some((t) => t.label.trim())
                      ? trust.filter((t) => t.label.trim()).map((t) => t.label)
                      : catTrust.map((t) => t.label).filter((l) => l.trim());
                    return shown.length > 0 ? (
                      <span className="flex gap-1 flex-wrap">
                        {shown.slice(0, 3).map((label, i) => (
                          <span key={i} className="text-[10.5px] font-semibold px-2 py-[3px] rounded-full" style={{ background: "#fbeef0", color: "#8a4350" }}>{label}</span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-[11.5px] text-body-soft">No trust badges</span>
                    );
                  })()}
                </Hot>

                <Hot on={sec === "story" && storyGroup === "inside"} onPick={() => goto("story", "inside")}>
                  <span className="block text-[12px] font-semibold text-body">What&apos;s inside</span>
                  <span className="block text-[11.5px] text-body-soft truncate">
                    {(() => {
                      /*  The product's own list replaces the category's; the
                          category's applies when the product has none — the
                          same ladder the website walks.  */
                      const rows = spec.some((r) => r.item.trim())
                        ? spec.filter((r) => r.item.trim()).map((r) => r.item)
                        : catSpec.map((r) => r.item).filter((x) => x.trim());
                      /*  DEC-PRD-047 — FAQ replaces now, like everything else
                          here, so it is one count or the other, never both.  */
                      const own = faqs.filter((f) => f.q.trim()).length;
                      const qs = own > 0 ? own : catFaq.length;
                      return (
                        <>
                          {rows.length > 0 ? rows.slice(0, 4).join(" · ") : "nothing listed"}
                          {qs > 0 && ` · ${qs} question(s)`}
                        </>
                      );
                    })()}
                  </span>
                </Hot>

                <Hot on={sec === "delivery"} onPick={() => goto("delivery")}>
                  <span className="flex items-center gap-1.5">
                    <Icon name="truck" size={13} className="text-body-soft shrink-0" />
                    <span className="text-[11.5px] text-body-soft truncate">
                      {delivTypeIds.length
                        ? delivTypes.filter((t) => delivTypeIds.includes(t.id)).map((t) => t.name).join(" · ")
                        : "Scheduled day only"}
                    </span>
                  </span>
                </Hot>

                <Hot on={sec === "tags"} onPick={() => goto("tags")}>
                  <span className="text-[11.5px] text-body-soft">
                    {tagSel.length > 0 ? `${tagSel.length} tag(s)` : "No tags"}
                  </span>
                </Hot>
              </div>
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
                {/*  DEC-PRD-014 — if there are variants, this shows the
                     total too, otherwise the preview showed one number
                     and the Stock tab showed another.  */}
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
