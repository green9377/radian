"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import SaveBar, { type SaveState } from "./SaveBar";
import ShopIconPreview, { ICON_NAMES } from "./ShopIconPreview";
import { AboutSettings, GiftFinderSettings } from "./SectionSettings";
import {
  listCategorySections, updateCategorySection, resetCategorySection,
  addCategoryBlock, editCategoryBlock, removeCategoryBlock,
  listCategoriesSafe, listSectionText, saveSectionText, listTagGroups,
  listCollections, listBanners, uploadImage, updateCategory,
  listCategoryFaqs, addCategoryFaq, updateCategoryFaq, removeCategoryFaq,
  listShopProducts, listAllTags,
  type ApiCategoryFaq, type ApiShopCard, type ApiTagNode,
  type ApiCategorySection, type ApiCategoryNode, type ApiSectionText, type ApiTagGroup,
  type ApiCollection, type ApiBanner, type BlockType,
} from "../_data/api";

/*
  Storefront · Category pages — the same screen as Homepage layout, pointed at
  the second page of the shop.

  WHY IT LOOKS LIKE THE HOMEPAGE ONE. The owner said the category page felt
  scattered: its switches were buried inside the category editor, its wording
  was on a third screen, and its tiles were nowhere. One page of the shop, one
  screen, top to bottom — the arrangement he already knows.

  TWO DIFFERENCES FROM THE HOMEPAGE, BOTH DELIBERATE:

  1. NO DRAGGING. The order is fixed for every category page (D-CAT-04).
     Fourteen sections in any order is an unbounded number of layouts, none
     ever tested, and a bad one costs sales quietly. Said once at the top
     rather than fourteen times in the list.

  2. A CATEGORY PICKER. "All categories" is the setting every category
     follows; picking one shows what that one does differently. A category
     created next month inherits today's decisions with nobody setting it up.
*/

/** what feeds each section, in the owner's words — the question he actually asks */
const SOURCE: Record<string, { where: string; note: string }> = {
  banner:          { where: "Categories → this category", note: "Heading, description and the photo beside it" },
  subCategoryRail: { where: "Categories → sub-categories", note: "Empty ones hide themselves — or pick them yourself below" },
  bestsellers:     { where: "Products → Best seller", note: "Then by what actually sells — or pick them yourself below" },
  attributeGrid:   { where: "Tags → Style", note: "Needs a tag group called Style" },
  occasionGrid:    { where: "Tags → Occasions", note: "From the tags on this category's products" },
  readyToday:      { where: "Products → 2-hour / same day", note: "Only what can leave today — or pick them yourself below" },
  colourGrid:      { where: "Products → Variant & Option", note: "Only colours this category actually has" },
  budgetRail:      { where: "Storefront → Collections", note: "The price bands, in their order" },
  productGrid:     { where: "Products", note: "Published products in this category" },
  comboRail:       { where: "Other categories", note: "Or pick them yourself below" },
  deliveryBand:    { where: "Delivery → Methods", note: "Cut-off times and fees" },
  crossSellRail:   { where: "Other categories", note: "Or pick them yourself below" },
  giftFinder:      { where: "Tags + Collections", note: "The homepage wizard, searching this category only" },
  faq:             { where: "Categories → Questions", note: "Each category writes its own" },
};

/** the blocks whose tiles can be chosen by hand instead of filled automatically */
const TILE_BLOCKS = new Set(["attributeGrid", "occasionGrid"]);

/*
  ── Automatic, or the owner's own list — the three rows he asked for, 2 Aug ──

  D-CAT-02 gave the TAG tiles two modes. These three had none: they were the
  shop's own data arriving in the shop's own order, and the screen said so
  politely while offering nothing. The owner's point stands — what to put in
  front of a customer this week is a judgement, and the sales counter does not
  always make it.

  ⚠️ ONE CATEGORY AT A TIME, AND THIS IS NOT A LIMITATION — IT IS THE RULE.
  A product and a sub-category belong to ONE category. A list picked under
  "All categories" could not mean anything on the other thirteen pages, so the
  mode is offered only once a category is chosen, and the row says why.

  `field` differs because the storefront already reads `slugs` for category
  tiles and `products` for product rows; one name for two different kinds of
  thing would be worse than two honest ones.
*/
const PICKABLE: Record<
  string,
  { field: "slugs" | "products" | "tags"; kind: "sub" | "product" | "tag"; cap: number; readyOnly?: boolean; noun: string }
> = {
  subCategoryRail: { field: "slugs", kind: "sub", cap: 12, noun: "sub-categories" },
  bestsellers: { field: "products", kind: "product", cap: 8, noun: "products" },
  readyToday: { field: "products", kind: "product", cap: 4, readyOnly: true, noun: "products" },
  /*
    ⚠️ THESE TWO ALREADY SAID "I'll choose" AND THEN OFFERED NOTHING TO CHOOSE
    FROM — 31 Jul to 2 Aug. Pressing it switched the mode on, the list stayed
    empty, and the page went on filling itself automatically while the screen
    claimed otherwise. D-CAT-02 promised this; only half of it was built.

    A tag is not owned by a category, so unlike the three above, these can be
    picked for every category at once.
  */
  attributeGrid: { field: "tags", kind: "tag", cap: 8, noun: "tiles" },
  occasionGrid: { field: "tags", kind: "tag", cap: 8, noun: "tiles" },
};

/** the three shapes an added section can take — the homepage's set, unchanged */
const BLOCKS: { v: BlockType; label: string; hint: string }[] = [
  { v: "PRODUCT_ROW", label: "A row of products", hint: "From this category only" },
  { v: "COLLECTION_ROW", label: "Collection cards", hint: "Like the budget cards" },
  { v: "BANNER_STRIP", label: "A banner strip", hint: "One of your banners" },
];

const PRODUCT_RULES = [
  { v: "bestseller", label: "Best sellers" },
  { v: "new", label: "New arrivals" },
  { v: "express", label: "2-hour delivery" },
  { v: "midnight", label: "Midnight delivery" },
];

/*
  Same page frame as every other admin screen (31 Jul 2026).

  The storefront screens were built at a fixed `max-w-[860px]`–`[1100px]`, which
  on the owner's monitor left the whole module pinned to the left with a third
  of the screen empty, while Products, Categories and the rest filled the width.
  One admin, one frame.

  `WRAP` is the same string those screens use — full width, padding that grows
  with the viewport. Individual columns still cap their own width where reading
  comfort needs it; the PAGE no longer does.
*/
const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

/* an icon and a brand colour per section — the same idea, and the same
   palette, as the homepage layout list. Eleven grey rows are read one at a
   time; eleven tinted ones are recognised. */
const SECTION_ICON: Record<string, string> = {
  banner: "photo", subCategoryRail: "grid", bestsellers: "star", attributeGrid: "tag",
  occasionGrid: "gift", readyToday: "truck", colourGrid: "sparkle", budgetRail: "cash",
  productGrid: "box", comboRail: "bag", deliveryBand: "clock", crossSellRail: "globe",
  giftFinder: "search", faq: "book",
};
const SECTION_TINT: Record<string, string> = {
  banner: "linear-gradient(135deg,#7B2D8E,#C155D8)",
  subCategoryRail: "linear-gradient(135deg,#A32C9B,#DE68C9)",
  bestsellers: "linear-gradient(135deg,#B26A2F,#E0A25C)",
  attributeGrid: "linear-gradient(135deg,#5C2A96,#9B6BE0)",
  occasionGrid: "linear-gradient(135deg,#8E2D6B,#D45BA0)",
  readyToday: "linear-gradient(135deg,#4A1259,#7B2D8E)",
  colourGrid: "linear-gradient(135deg,#9B3FC4,#CE86E8)",
  budgetRail: "linear-gradient(135deg,#6E3AA8,#A87BE0)",
  productGrid: "linear-gradient(135deg,#7B2D8E,#B76E79)",
  comboRail: "linear-gradient(135deg,#B76E79,#E0A0A8)",
  deliveryBand: "linear-gradient(135deg,#4A1259,#6E3AA8)",
  crossSellRail: "linear-gradient(135deg,#A83A6E,#DD84AC)",
  giftFinder: "linear-gradient(135deg,#5B3E9E,#9986DD)",
  faq: "linear-gradient(135deg,#7B2D8E,#C155D8)",
};
const tintOf = (k: string) => SECTION_TINT[k] ?? "linear-gradient(135deg,#7B2D8E,#C155D8)";

export default function CategoryPageView() {
  const [cats, setCats] = useState<ApiCategoryNode[]>([]);
  /* the whole tree, not just the parents — the sub-category picker needs the
     children, and `cats` above is the chooser at the top of the page */
  const [allCats, setAllCats] = useState<ApiCategoryNode[]>([]);
  const [slug, setSlug] = useState<string>("");
  const [rows, setRows] = useState<ApiCategorySection[]>([]);
  const [copy, setCopy] = useState<ApiSectionText[]>([]);
  const [groups, setGroups] = useState<ApiTagGroup[]>([]);
  /** every tag, so the two tile rows can be picked by hand (D-CAT-02) */
  const [allTags, setAllTags] = useState<ApiTagNode[]>([]);
  const [collections, setCollections] = useState<ApiCollection[]>([]);
  const [banners, setBanners] = useState<ApiBanner[]>([]);
  const [adding, setAdding] = useState(false);
  const [newBlock, setNewBlock] = useState<BlockType>("PRODUCT_ROW");
  const [newAfter, setNewAfter] = useState("bestsellers");
  const [uploading, setUploading] = useState<string | null>(null);
  /* the banner and the questions belong to the category row itself, not to a
     PageSection — they are edited here because this is where the owner is
     looking at the page, not because the data moved */
  const [faqs, setFaqs] = useState<ApiCategoryFaq[]>([]);
  const [faqQ, setFaqQ] = useState("");
  const [faqA, setFaqA] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [open, setOpen] = useState<string | null>(null);
  /*
    ⚠️ ADVANCED IS FOLDED AWAY BY DEFAULT — owner, 31 Jul: "I did not want the
    UI this complicated."

    He was right. Opening a section showed three text boxes, a twenty-icon
    picker, a picture uploader and a tile-mode switch all at once, so the one
    thing anyone actually opens it for — the heading — was a fifth of the
    screen. The rare controls are still one click away; they are simply no
    longer in the way of the common one.
  */
  const [advanced, setAdvanced] = useState<string | null>(null);

  /*
    What there is to pick from: this category's products, as the SHOP sees
    them. Published, in this category or one of its children, priced the way
    the card will price them — so nothing can be chosen that the page would
    then decline to draw.
  */
  const [pool, setPool] = useState<ApiShopCard[]>([]);
  const [poolQ, setPoolQ] = useState("");
  const [poolBusy, setPoolBusy] = useState(false);
  /* slug → name, kept across searches: a product picked yesterday must still
     have a name on screen when today's search does not return it */
  const [known, setKnown] = useState<Record<string, string>>({});

  const flash = (m: string) => { setOk(m); setSaveState("saved"); setTimeout(() => setOk(null), 2000); };
  const fail = (e: unknown, what: string) => { setErr(e instanceof Error ? e.message : what); setSaveState("error"); };

  useEffect(() => { void boot(); }, []);
  async function boot() {
    try {
      const [c, t, col, ban, tg] = await Promise.all([
        listCategoriesSafe(),
        listTagGroups().catch(() => []),
        listCollections().catch(() => []),
        listBanners().catch(() => []),
        listAllTags().catch(() => [] as ApiTagNode[]),
      ]);
      setAllCats(c.items);
      setCats(c.items.filter((x) => !x.parentId));
      setGroups(t);
      setAllTags(tg);
      setCollections(col);
      setBanners(ban);
    } catch (e) { fail(e, "Could not load categories"); }
  }

  useEffect(() => {
    const cat = cats.find((c) => c.slug === slug);
    if (!cat) return setFaqs([]);
    listCategoryFaqs(cat.id).then(setFaqs).catch(() => setFaqs([]));
  }, [slug, cats]);

  /* one search per keystroke would be one request per keystroke — the pause is
     short enough to feel immediate and long enough to send one */
  useEffect(() => {
    if (!slug) { setPool([]); return; }
    let dead = false;
    setPoolBusy(true);
    const t = setTimeout(() => {
      listShopProducts({ category: slug, search: poolQ, limit: 60 })
        .then((r) => {
          if (dead) return;
          setPool(r.items);
          setKnown((k) => ({ ...k, ...Object.fromEntries(r.items.map((i) => [i.slug, i.name])) }));
        })
        .catch(() => { if (!dead) setPool([]); })
        .finally(() => { if (!dead) setPoolBusy(false); });
    }, 250);
    return () => { dead = true; clearTimeout(t); };
  }, [slug, poolQ]);

  useEffect(() => { void reload(); }, [slug]);
  async function reload() {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([listCategorySections(slug || undefined), listSectionText()]);
      setRows(s);
      setCopy(t.filter((r) => r.key.startsWith("category.")));
      setErr(null);
    } catch (e) { fail(e, "Could not load"); }
    finally { setLoading(false); }
  }

  async function patch(key: string, body: { isActive?: boolean; config?: Record<string, unknown> }) {
    setSaveState("saving"); setErr(null);
    try {
      await updateCategorySection({ slug: slug || undefined, key, ...body });
      setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...body, overridden: Boolean(slug) } : r)));
      flash("Saved");
    } catch (e) { fail(e, "Could not save"); void reload(); }
  }

  async function follow(key: string) {
    if (!slug) return;
    setSaveState("saving");
    try { await resetCategorySection(slug, key); await reload(); flash("Following the default again"); }
    catch (e) { fail(e, "Could not reset"); }
  }

  /*
    Wording. Written once for all categories, or for one category on its own —
    the storefront looks for `category.<slug>.<key>` before `category.<key>`,
    the same default-and-override shape as the switches above it.
  */
  const copyKey = (key: string) => (slug ? `category.${slug}.${key}` : `category.${key}`);
  const copyFor = (key: string) =>
    copy.find((r) => r.key === copyKey(key) && r.zone === "") ??
    (slug ? copy.find((r) => r.key === `category.${key}` && r.zone === "") : undefined);

  async function saveCopy(key: string, field: "eyebrow" | "title" | "subtitle", value: string) {
    setSaveState("saving"); setErr(null);
    try {
      const saved = await saveSectionText(copyKey(key), "", { [field]: value });
      setCopy((cur) => [...cur.filter((r) => !(r.key === saved.key && r.zone === saved.zone)), saved]);
      flash("Saved");
    } catch (e) { fail(e, "Could not save the wording"); }
  }

  /* an added section: its own heading lives on the row, not in SectionText —
     it has no manifest key, so there is nothing for a default to hang from */
  async function patchBlock(key: string, body: { title?: string; subtitle?: string | null; config?: Record<string, unknown> }) {
    setSaveState("saving"); setErr(null);
    try {
      await editCategoryBlock(key, { slug: slug || undefined, ...body });
      setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...body, config: body.config ?? r.config } : r)));
      flash("Saved");
    } catch (e) { fail(e, "Could not save"); void reload(); }
  }

  async function addBlock() {
    setSaveState("saving"); setAdding(false);
    try {
      await addCategoryBlock({ slug: slug || undefined, blockType: newBlock, after: newAfter });
      await reload();
      flash("Added — switch it on when it is ready");
    } catch (e) { fail(e, "Could not add"); }
  }

  async function dropBlock(key: string) {
    if (!confirm("Remove this section?")) return;
    try { await removeCategoryBlock(key, slug || undefined); await reload(); flash("Removed"); }
    catch (e) { fail(e, "Could not remove"); }
  }

  /* a picture for a section — uploaded through the API, same as every other
     image on this admin. The browser never sees the storage key. */
  async function pickImage(key: string, field: "bgImageUrl" | "iconUrl", file: File | null, config: Record<string, unknown>) {
    if (!file) return;
    setUploading(key);
    try {
      const { url } = await uploadImage(file, "categories");
      await patch(key, { config: { ...config, [field]: url } });
    } catch (e) { fail(e, "Upload failed"); }
    finally { setUploading(null); }
  }

  /* Saving something that lives on the CATEGORY (its banner, its SEO) rather
     than on a PageSection. Same screen, different owner — said out loud here
     so the next person does not go looking for a page_sections row. */
  async function saveCategory(body: Record<string, unknown>) {
    const cat = cats.find((c) => c.slug === slug);
    if (!cat) return;
    setSaveState("saving"); setErr(null);
    try {
      await updateCategory(cat.id, body);
      setCats((cs) => cs.map((c) => (c.id === cat.id ? { ...c, ...body } : c)));
      flash("Saved");
    } catch (e) { fail(e, "Could not save"); }
  }

  /*  The banner is the homepage hero's shape now (5 Sep 2026): the picture
      sits on the band's own ground, so a plain photo loses its backdrop on
      the way in — the same bgremove service the hero uses. `Keep` skips it. */
  const [cutBg, setCutBg] = useState(true);
  async function pickBanner(file: File | null) {
    if (!file) return;
    setUploading("banner");
    try {
      const { url, bgRemoved } = await uploadImage(file, "categories", { removeBg: cutBg });
      if (cutBg && bgRemoved === false) fail(new Error("The background could not be removed right now — the picture was kept as it is."), "Upload");
      await saveCategory({ bannerUrl: url });
    } catch (e) { fail(e, "Upload failed"); }
    finally { setUploading(null); }
  }

  async function addFaq() {
    const cat = cats.find((c) => c.slug === slug);
    if (!cat || !faqQ.trim() || !faqA.trim()) return;
    try {
      const row = await addCategoryFaq(cat.id, { question: faqQ.trim(), answer: faqA.trim() });
      setFaqs((f) => [...f, row]); setFaqQ(""); setFaqA(""); flash("Saved");
    } catch (e) { fail(e, "Could not save the question"); }
  }

  /* ── hand-picking: read, write, reorder ────────────────────────────────
     The list is stored on the section's own config, next to `mode`, exactly
     like the tag tiles. No new table, no new endpoint — the same row the
     on/off switch above it already writes. */
  const pickedOf = (r: ApiCategorySection) => {
    const spec = PICKABLE[r.key];
    const v = spec ? r.config[spec.field] : undefined;
    return Array.isArray(v) ? (v as string[]) : [];
  };
  const writePicked = (r: ApiCategorySection, next: string[]) =>
    patch(r.key, { config: { ...r.config, mode: "MANUAL", [PICKABLE[r.key].field]: next } });

  const togglePick = (r: ApiCategorySection, s: string) => {
    const cur = pickedOf(r);
    if (cur.includes(s)) return writePicked(r, cur.filter((x) => x !== s));
    if (cur.length >= PICKABLE[r.key].cap) return;
    return writePicked(r, [...cur, s]);
  };
  /* ↑ ↓ rather than dragging: the same choice as the section list above, and
     a two-item swap is the one reorder that cannot go wrong halfway */
  const movePick = (r: ApiCategorySection, i: number, dir: -1 | 1) => {
    const cur = [...pickedOf(r)];
    const j = i + dir;
    if (j < 0 || j >= cur.length) return;
    [cur[i], cur[j]] = [cur[j], cur[i]];
    return writePicked(r, cur);
  };

  const chosen = cats.find((c) => c.slug === slug);
  /* what each row can be built from — sub-categories of this category, or its
     products; "Ready to send now" is offered only what can leave today */
  /** which tag group a tile row is drawing from — the same default the API uses */
  const groupSlugOf = (r: ApiCategorySection) =>
    String(r.config.tagGroup ?? (r.key === "occasionGrid" ? "occasions" : "style"));

  const optionsFor = (r: ApiCategorySection): { slug: string; name: string; note?: string }[] => {
    const spec = PICKABLE[r.key];
    if (!spec) return [];
    if (spec.kind === "tag") {
      const g = groups.find((x) => x.slug === groupSlugOf(r));
      if (!g) return [];
      return allTags
        .filter((t) => t.groupId === g.id && t.isActive)
        .map((t) => ({ slug: t.slug, name: t.name }));
    }
    if (!chosen) return [];
    if (spec.kind === "sub") {
      return allCats
        .filter((c) => c.parentId === chosen.id)
        .map((c) => ({ slug: c.slug, name: c.name }));
    }
    return pool
      .filter((p) => !spec.readyOnly || p.exp || p.sd)
      .map((p) => ({
        slug: p.slug,
        name: p.name,
        note: `৳${Math.round(p.pricePaisa / 100).toLocaleString("en-BD")}`,
      }));
  };

  /* the section the panel is editing — the rail's selection, first row until
     one is picked (owner, 12 Aug: the same rail as Reviews/Journal/Pages) */
  const sel = rows.find((x) => x.key === open) ?? rows[0] ?? null;

  return (
    <div className={WRAP}>
      {/* the same band the homepage screen wears — one module, two pages */}
      <div
        className="rounded-[18px] px-6 py-5 mb-4 text-white relative overflow-hidden"
        style={{ background: "linear-gradient(120deg,#4a1259 0%,#7B2D8E 48%,#B44BC9 100%)" }}
      >
        <span
          aria-hidden
          className="absolute -right-8 -top-12 w-[190px] h-[190px] rounded-[50%_50%_50%_0] -rotate-45 opacity-[0.13]"
          style={{ background: "linear-gradient(150deg,#ffffff,#f0c9ff)" }}
        />
        <div className="relative">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-[#e9c9f5] mb-1">Storefront</div>
          <h1 className="font-display text-[24px] font-medium m-0 leading-tight">Category pages</h1>
          <p className="text-[12.5px] text-[#e6d3ee] mt-1.5 mb-0">
            {slug === ""
              ? "Settings every category page follows, including ones you make later"
              : `What ${chosen?.name ?? slug} does differently`}
          </p>
        </div>
      </div>

      {/* who am I editing */}
      <div className="mb-4">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => { setSlug(""); setOpen(null); }}
            className={"text-[13px] font-semibold px-4 py-2 rounded-full border transition-all " +
              (slug === "" ? "text-white border-transparent shadow-[0_3px_12px_rgba(80,40,100,0.2)]" : "bg-white text-body border-lavender-deep hover:border-orchid")}
            style={slug === "" ? { background: "linear-gradient(135deg,#7B2D8E,#C155D8)" } : undefined}
          >
            All categories
          </button>
          {cats.map((c) => (
            <button
              key={c.id}
              onClick={() => { setSlug(c.slug); setOpen(null); }}
              className={"text-[13px] font-semibold px-4 py-2 rounded-full border transition-all " +
                (slug === c.slug ? "text-white border-transparent shadow-[0_3px_12px_rgba(80,40,100,0.2)]" : "bg-white text-body border-lavender-deep hover:border-orchid")}
              style={slug === c.slug ? { background: "linear-gradient(135deg,#7B2D8E,#C155D8)" } : undefined}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="text-[12px] text-body-soft mt-2">
          {slug === ""
            ? "Applies to every category page, including ones you make later."
            : `Changes here affect ${chosen?.name ?? slug} only.`}
        </div>
      </div>

      {err && (
        <div className="flex items-start gap-2 bg-[#fdecea] border border-[#f5c6c2] rounded-[11px] px-3.5 py-2.5 text-[12px] text-[#a3261f] mb-4">
          <span className="mt-0.5 shrink-0"><Icon name="alert" size={14} /></span><span>{err}</span>
        </div>
      )}
      {ok && <div className="bg-[#eef7f0] border border-[#cfe8d6] rounded-[11px] px-3.5 py-2 text-[12px] text-[#12693f] mb-4">{ok}</div>}

      {/*  The rail + panel — the same anatomy as Reviews, Journal and Pages
          (owner, 12 Aug), pointed at the fourteen sections of this page.
          The order stays fixed on every category page (D-CAT-04): the rail
          SHOWS that order, the panel edits one section at a time.  */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] gap-5 items-start mb-4">
        <nav className="hidden md:grid gap-1.5 md:sticky md:top-[16px] self-start md:max-h-[calc(100vh-32px)] md:overflow-y-auto">
          {rows.map((r, i) => {
            const on = sel?.key === r.key;
            return (
              /*  the search box is shared by the rows that have one, so it is
                  cleared on the way in — otherwise yesterday's word silently
                  narrows the next row's list  */
              <button key={r.key} type="button"
                onClick={() => { setPoolQ(""); setOpen(r.key); }}
                className="w-full min-w-0 overflow-hidden flex items-center gap-2.5 px-3 py-2.5 rounded-[13px] text-left transition-all"
                style={on
                  ? { background: tintOf(r.key), border: "1px solid transparent", boxShadow: "0 5px 16px rgba(80,40,100,.25)" }
                  : { background: "#fff", border: "1px solid #e6d8f0" }}>
                <span className="w-[18px] shrink-0 text-[11px] tabular-nums"
                  style={{ color: on ? "rgba(255,255,255,.75)" : "#a394b5" }}>{i + 1}</span>
                <span className="w-[30px] h-[30px] rounded-[10px] grid place-items-center shrink-0"
                  style={on
                    ? { background: "rgba(255,255,255,.22)", color: "#fff" }
                    : { background: r.isActive ? tintOf(r.key) : "#cfc4da", color: "#fff" }}>
                  {r.blockType
                    ? <ShopIconPreview name={(r.config.icon as string) ?? null} url={(r.config.iconUrl as string) ?? null} size={15} />
                    : <Icon name={SECTION_ICON[r.key] ?? "grid"} size={15} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium truncate" style={{ color: on ? "#fff" : "#3b2a4d" }}>{r.label}</span>
                  <span className="block text-[10.5px] truncate" style={{ color: on ? "rgba(255,255,255,.75)" : "#a394b5" }}>
                    {!r.canSwitchOff ? "always on" : r.isActive ? "live" : "hidden"}
                    {r.blockType ? " · added by you" : r.overridden ? " · just this one" : ""}
                  </span>
                </span>
                {r.canSwitchOff && (
                  <span aria-hidden className="w-[8px] h-[8px] rounded-full shrink-0"
                    style={{ background: on ? "#fff" : r.isActive ? "#2fa06a" : "#d9a441" }} />
                )}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          <div className="md:hidden mb-4">
            <select className="ipt h-[44px]" value={sel?.key ?? ""} onChange={(e) => { setPoolQ(""); setOpen(e.target.value); }}>
              {rows.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>

          {loading ? <p className="text-[13px] text-body-soft">Loading…</p> : !sel ? null : (() => {
            const r = sel;
            const c = copyFor(r.key);
            return (
              <div className="rounded-[18px] border border-lavender-deep overflow-hidden bg-white shadow-[0_2px_14px_rgba(80,40,100,0.06)]">
                {/* the section's own header: who it is, and Live / Hidden */}
                <div className="px-4 py-3.5 flex items-center gap-3.5 flex-wrap"
                  style={{ background: "linear-gradient(120deg,#f7f0fb 0%,#f4e9fa 55%,#fbf2f4 100%)" }}>
                  <span className="w-[40px] h-[40px] rounded-[13px] grid place-items-center shrink-0 text-white"
                    style={{ background: r.isActive ? tintOf(r.key) : "#cfc4da" }}>
                    {r.blockType
                      ? <ShopIconPreview name={(r.config.icon as string) ?? null} url={(r.config.iconUrl as string) ?? null} size={18} />
                      : <Icon name={SECTION_ICON[r.key] ?? "grid"} size={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium text-purple flex items-center gap-2">
                      {r.label}
                      {r.blockType && <span className="text-[10.5px] text-orchid bg-orchid-soft rounded-full px-2 py-0.5">added by you</span>}
                      {r.overridden && !r.blockType && <span className="text-[10.5px] text-orchid bg-orchid-soft rounded-full px-2 py-0.5">just this one</span>}
                    </div>
                    <div className="text-[12px] text-body-soft truncate">
                      {r.canSwitchOff ? r.hint : <span className="text-[#8a6414]">{r.lockedReason}</span>}
                      {SOURCE[r.key]?.where && <span className="text-body-soft/70"> · from {SOURCE[r.key].where}</span>}
                    </div>
                  </div>
                  {r.canSwitchOff ? (
                    <div className="inline-flex p-[3px] rounded-full bg-lavender/70 shrink-0">
                      {[
                        { on: true, label: "Live", fill: "linear-gradient(135deg,#12795a,#3ec294)" },
                        { on: false, label: "Hidden", fill: "linear-gradient(135deg,#8a6414,#d9a441)" },
                      ].map((o) => (
                        <button key={o.label}
                          onClick={() => r.isActive !== o.on && patch(r.key, { isActive: o.on })}
                          className={"text-[11.5px] font-semibold px-3.5 py-[6px] rounded-full transition-all " +
                            (r.isActive === o.on ? "text-white shadow-sm" : "text-body-soft hover:text-purple")}
                          style={r.isActive === o.on ? { background: o.fill } : undefined}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-3.5 py-[7px] rounded-full text-purple bg-lavender/70 shrink-0"
                      title={r.lockedReason ?? ""}>
                      <Icon name="lock" size={12} /> Always on
                    </span>
                  )}
                </div>

                  <div className="px-4 pb-4 pt-3 border-t border-lavender-deep space-y-3">
                    {r.blockType ? (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <F label="Heading">
                            <input className="ipt" defaultValue={r.title ?? ""} placeholder="Fresh this week"
                              onBlur={(e) => e.target.value !== (r.title ?? "") && patchBlock(r.key, { title: e.target.value })} />
                          </F>
                          <F label="Line underneath">
                            <input className="ipt" defaultValue={r.subtitle ?? ""}
                              onBlur={(e) => e.target.value !== (r.subtitle ?? "") && patchBlock(r.key, { subtitle: e.target.value })} />
                          </F>
                        </div>

                        {r.blockType === "PRODUCT_ROW" && (
                          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3">
                            <F label="Which products" hint="always from this category — a row of chocolates on the flowers page is a row nobody asked for">
                              <select className="ipt" value={String(r.config.rule ?? "bestseller")}
                                onChange={(e) => patchBlock(r.key, { config: { ...r.config, rule: e.target.value } })}>
                                {PRODUCT_RULES.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
                              </select>
                            </F>
                            <F label="How many">
                              <input type="number" min={2} max={12} className="ipt" defaultValue={Number(r.config.count ?? 8)}
                                onBlur={(e) => patchBlock(r.key, { config: { ...r.config, count: Number(e.target.value) || 8 } })} />
                            </F>
                          </div>
                        )}

                        {r.blockType === "COLLECTION_ROW" && (
                          <F label="Which collections" hint="the order you click is the order they show">
                            <div className="flex flex-wrap gap-1.5">
                              {collections.map((cl) => {
                                const picked = ((r.config.slugs as string[] | undefined) ?? []).includes(cl.slug);
                                return (
                                  <button key={cl.id}
                                    onClick={() => {
                                      const cur = ((r.config.slugs as string[] | undefined) ?? []);
                                      patchBlock(r.key, { config: { ...r.config, slugs: picked ? cur.filter((x) => x !== cl.slug) : [...cur, cl.slug] } });
                                    }}
                                    className={"text-[12.5px] px-3 py-1.5 rounded-full border transition-colors " +
                                      (picked ? "bg-purple text-white border-purple" : "bg-white text-body border-lavender-deep hover:border-orchid")}>
                                    {cl.name}
                                  </button>
                                );
                              })}
                            </div>
                          </F>
                        )}

                        {r.blockType === "BANNER_STRIP" && (
                          <F label="Which banner" hint="a banner that is switched off, or out of season, shows nothing at all">
                            <select className="ipt" value={String(r.config.bannerId ?? "")}
                              onChange={(e) => patchBlock(r.key, { config: { ...r.config, bannerId: e.target.value || null } })}>
                              <option value="">— none —</option>
                              {banners.map((b) => <option key={b.id} value={b.id}>{b.titleMain || b.eyebrow || b.id}</option>)}
                            </select>
                          </F>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11.5px] text-body-soft">
                            Sits after <b>{rows.find((x) => x.key === r.after)?.label ?? r.after}</b>
                          </span>
                          <button onClick={() => dropBlock(r.key)} className="text-[12px] text-[#c0392b] hover:underline inline-flex items-center gap-1.5">
                            <Icon name="trash" size={13} /> Remove this section
                          </button>
                        </div>
                      </>
                    ) : r.key === "banner" ? (
                      /*
                        THE BANNER IS EDITED HERE, 31 Jul 2026.

                        It was in the category editor, and the owner's verdict
                        was that Categories should be where categories are made
                        and nothing else. He is right: the heading, the
                        paragraph and the picture are the top of THIS page, and
                        this is the screen for this page.

                        The fields still belong to the Category row — one home
                        for the data, one place to edit it. Nothing was copied.
                      */
                      !chosen ? (
                        <p className="text-[12.5px] text-body-soft m-0">
                          The banner is different on every category — pick one above to write it.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          <F label="Banner heading" hint={`blank uses the category name (${chosen.name})`}>
                            <input className="ipt" defaultValue={chosen.bannerHeading ?? ""} placeholder="Send a little get-well warmth"
                              onBlur={(e) => e.target.value !== (chosen.bannerHeading ?? "") && saveCategory({ bannerHeading: e.target.value })} />
                          </F>
                          <F label="Paragraph underneath">
                            <textarea className="ipt" rows={2} defaultValue={chosen.description ?? ""}
                              placeholder="Gentle, calming arrangements to say you're thinking of them."
                              onBlur={(e) => e.target.value !== (chosen.description ?? "") && saveCategory({ description: e.target.value })} />
                          </F>

                          <F label="Banner picture" hint="the right half of the banner, like the homepage hero · with Auto the background is cut out so the subject sits on the banner itself">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-[12px] text-body">Remove background</span>
                              <span className="inline-flex rounded-full bg-lavender p-0.5">
                                {([true, false] as const).map((v) => (
                                  <button key={String(v)} type="button" onClick={() => setCutBg(v)}
                                    className={"px-3 py-1 rounded-full text-[12px] font-semibold transition-all " + (cutBg === v ? "text-white shadow-sm" : "text-body-soft hover:text-purple")}
                                    style={cutBg === v ? { background: v ? "linear-gradient(135deg,#7B2D8E,#C155D8)" : "#8d7d98" } : undefined}>
                                    {v ? "Auto" : "Keep"}
                                  </button>
                                ))}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              {chosen.bannerUrl ? (
                                <>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={chosen.bannerUrl} alt="" className="w-[132px] h-[88px] object-cover rounded-[10px] border border-lavender-deep" />
                                  <button onClick={() => saveCategory({ bannerUrl: null })} className="text-[12px] text-body-soft hover:text-[#c0392b]">Remove</button>
                                </>
                              ) : (
                                <label className="text-[12.5px] text-purple border border-dashed border-lavender-deep rounded-[10px] px-4 py-3 cursor-pointer hover:border-orchid">
                                  {uploading === "banner" ? "Uploading…" : "Choose a picture"}
                                  <input type="file" accept="image/*" className="hidden" onChange={(e) => pickBanner(e.target.files?.[0] ?? null)} />
                                </label>
                              )}
                            </div>
                          </F>

                          <div className="pt-2 border-t border-lavender-deep/60">
                            <div className="text-[12px] font-medium text-body mb-2">How this page looks in Google and on WhatsApp</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <F label="Title in search results" hint="blank uses the category name">
                                <input className="ipt" defaultValue={chosen.metaTitle ?? ""}
                                  onBlur={(e) => e.target.value !== (chosen.metaTitle ?? "") && saveCategory({ metaTitle: e.target.value })} />
                              </F>
                              <F label="Snippet under it">
                                <input className="ipt" defaultValue={chosen.metaDescription ?? ""}
                                  onBlur={(e) => e.target.value !== (chosen.metaDescription ?? "") && saveCategory({ metaDescription: e.target.value })} />
                              </F>
                            </div>
                          </div>
                        </div>
                      )
                    ) : r.key === "giftFinder" ? (
                      <div className="space-y-2">
                        {!chosen && (
                          <p className="text-[12.5px] text-body-soft m-0 mb-2">
                            The same wizard as the homepage, searching this category only — these words are the default for every category; pick one above to give it its own.
                          </p>
                        )}
                        <GiftFinderSettings c={r.config} save={async (partial) => patch(r.key, { config: { ...r.config, ...partial } })} />
                      </div>
                    ) : r.key === "story" ? (
                      <div className="space-y-2">
                        {!chosen && (
                          <p className="text-[12.5px] text-body-soft m-0 mb-2">
                            This is the default story for every category — pick a category above to write its own.
                          </p>
                        )}
                        <AboutSettings variant="article" c={r.config} save={async (partial) => patch(r.key, { config: { ...r.config, ...partial } })} />
                      </div>
                    ) : r.key === "faq" ? (
                      !chosen ? (
                        <p className="text-[12.5px] text-body-soft m-0">
                          Every category answers its own questions — pick one above to write them.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          <p className="text-[12.5px] text-body-soft m-0">
                            Answer what people actually ask on WhatsApp. Google reads these.
                          </p>
                          {/*
                            ⚠️ EDITABLE IN PLACE — owner, 31 Jul: a question
                            could be added and deleted but not corrected, so a
                            typo meant deleting the answer and typing it again.
                            Both boxes save when you click away, the same way
                            every other text on this screen does.
                          */}
                          {faqs.map((f) => (
                            <div key={f.id} className="border border-lavender-deep rounded-[12px] px-3.5 py-3 bg-white flex items-start gap-3">
                              <div className="min-w-0 flex-1 space-y-2">
                                <input
                                  className="ipt font-semibold text-purple"
                                  defaultValue={f.question}
                                  onBlur={async (e) => {
                                    const v = e.target.value.trim();
                                    if (!v || v === f.question) return;
                                    setFaqs((x) => x.map((y) => (y.id === f.id ? { ...y, question: v } : y)));
                                    await updateCategoryFaq(f.id, { question: v }).then(() => flash("Saved")).catch(() => fail(null, "Could not save"));
                                  }}
                                />
                                <textarea
                                  className="ipt"
                                  rows={2}
                                  defaultValue={f.answer}
                                  onBlur={async (e) => {
                                    const v = e.target.value.trim();
                                    if (!v || v === f.answer) return;
                                    setFaqs((x) => x.map((y) => (y.id === f.id ? { ...y, answer: v } : y)));
                                    await updateCategoryFaq(f.id, { answer: v }).then(() => flash("Saved")).catch(() => fail(null, "Could not save"));
                                  }}
                                />
                              </div>
                              <div className="flex flex-col gap-1.5 shrink-0">
                                <button
                                  title={f.isActive ? "Showing on the page" : "Hidden"}
                                  onClick={async () => {
                                    setFaqs((x) => x.map((y) => (y.id === f.id ? { ...y, isActive: !y.isActive } : y)));
                                    await updateCategoryFaq(f.id, { isActive: !f.isActive }).catch(() => {});
                                  }}
                                  className={"rounded-[9px] w-[32px] h-[32px] grid place-items-center transition-colors " +
                                    (f.isActive ? "bg-lavender text-purple hover:bg-purple hover:text-white" : "bg-[#f0e8f6] text-body-soft")}>
                                  <Icon name="eye" size={14} />
                                </button>
                                <button
                                  onClick={async () => { if (confirm("Remove this question?")) { setFaqs((x) => x.filter((y) => y.id !== f.id)); await removeCategoryFaq(f.id).catch(() => {}); } }}
                                  className="rounded-[9px] w-[32px] h-[32px] grid place-items-center bg-lavender text-body-soft hover:bg-[#fdecea] hover:text-[#c0392b] transition-colors">
                                  <Icon name="trash" size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                          <div className="border border-dashed border-lavender-deep rounded-[11px] px-3.5 py-3 space-y-2">
                            <input className="ipt" placeholder="How long will the flowers stay fresh?" value={faqQ} onChange={(e) => setFaqQ(e.target.value)} />
                            <textarea className="ipt" rows={2} placeholder="Answer, in your own words" value={faqA} onChange={(e) => setFaqA(e.target.value)} />
                            <button onClick={addFaq} disabled={!faqQ.trim() || !faqA.trim()}
                              className="bg-purple hover:bg-purple-deep text-white text-[12.5px] font-semibold px-3.5 py-2 rounded-[9px] disabled:opacity-40 inline-flex items-center gap-1.5">
                              <Icon name="plus" size={14} /> Add question
                            </button>
                          </div>
                        </div>
                      )
                    ) : (
                      <>
                        {/*
                          ⚠️ WHAT THE SECTION SHOWS, SAID OUT LOUD.

                          The owner opened Shop by type, Gift Finder and the
                          rest, found two text boxes, and concluded the contents
                          could not be chosen at all. Half true: some of these
                          sections HAVE no list to choose from — they are the
                          shop's own data arriving in order — and the screen
                          never said so. A section that explains where its
                          contents come from is not the same as one that hides
                          the control.
                        */}
                        {SOURCE[r.key] && !TILE_BLOCKS.has(r.key) && (
                          <div className="rounded-[12px] bg-white border border-lavender-deep px-4 py-3">
                            <div className="text-[12px] font-semibold text-purple mb-0.5">What this section shows</div>
                            <div className="text-[12.5px] text-body-soft">
                              {SOURCE[r.key].note} — <b className="text-purple">{SOURCE[r.key].where}</b>.
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <F label="Small line above">
                            <input className="ipt" defaultValue={c?.eyebrow ?? ""} placeholder="Shop by colour"
                              onBlur={(e) => e.target.value !== (c?.eyebrow ?? "") && saveCopy(r.key, "eyebrow", e.target.value)} />
                          </F>
                          <F label="Heading">
                            <input className="ipt" defaultValue={c?.title ?? ""} placeholder="Pick Their Favourite Shade"
                              onBlur={(e) => e.target.value !== (c?.title ?? "") && saveCopy(r.key, "title", e.target.value)} />
                          </F>
                        </div>
                        <F label="Line underneath" hint="leave blank to show nothing">
                          <input className="ipt" defaultValue={c?.subtitle ?? ""}
                            onBlur={(e) => e.target.value !== (c?.subtitle ?? "") && saveCopy(r.key, "subtitle", e.target.value)} />
                        </F>
                        {slug !== "" && (
                          <p className="text-[11.5px] text-body-soft m-0">
                            Typed here, this wording is used on <b>{chosen?.name}</b> only.
                            Leave it as it is and the page keeps the wording set under
                            <b> All categories</b>.
                          </p>
                        )}
                      </>
                    )}

                    {!r.blockType && (
                      <button
                        onClick={() => setAdvanced(advanced === r.key ? null : r.key)}
                        className="text-[12px] text-body-soft hover:text-purple inline-flex items-center gap-1.5"
                      >
                        {advanced === r.key ? "Hide" : "More options"}
                        <span className="text-[10px]">{advanced === r.key ? "▲" : "▼"}</span>
                        {advanced !== r.key && (
                          <span className="text-[11.5px] text-body-soft/70">· icon, picture</span>
                        )}
                      </button>
                    )}

                    {/*
                      Automatic, or your own list — Shop by type, Most ordered,
                      Ready to send now (owner, 2 Aug).

                      The chosen list sits ABOVE the things to choose from, and
                      is numbered, because the order is half of what is being
                      decided here: the first card is the one most people see.
                    */}
                    {PICKABLE[r.key] && !r.blockType && (() => {
                      const spec = PICKABLE[r.key];
                      const picked = pickedOf(r);
                      const manual = String(r.config.mode ?? "AUTO") === "MANUAL";
                      const nameFor = (s: string) =>
                        spec.kind === "sub"
                          ? (allCats.find((c) => c.slug === s)?.name ?? s)
                          : spec.kind === "tag"
                            ? (allTags.find((t) => t.slug === s)?.name ?? s)
                            : (known[s] ?? s);
                      const options = optionsFor(r).filter((o) => !picked.includes(o.slug));

                      return (
                        <div className="pt-2 border-t border-lavender-deep/60">
                          {/* which tag group the tiles are drawn from — the row
                              has to know that before "automatic" means anything */}
                          {spec.kind === "tag" && (
                            <F label="Which tags" hint="the group these tiles come from">
                              <select className="ipt text-[12.5px]" style={{ maxWidth: 220 }}
                                value={groupSlugOf(r)}
                                onChange={(e) => patch(r.key, { config: { ...r.config, tagGroup: e.target.value } })}>
                                {groups.map((g) => <option key={g.id} value={g.slug}>{g.name}</option>)}
                              </select>
                            </F>
                          )}
                          {slug === "" && spec.kind !== "tag" ? (
                            <div className="rounded-[12px] bg-[#fdf7ea] border border-[#eddfbc] px-4 py-3 text-[12.5px] text-[#8a6414]">
                              <b className="block mb-0.5">Pick a category above to choose these by hand.</b>
                              A {spec.kind === "sub" ? "sub-category" : "product"} belongs to one
                              category, so a list chosen here could not mean anything on the other
                              pages. Every category fills this row automatically until you choose.
                            </div>
                          ) : (
                            <>
                              <F
                                label="What goes in this row"
                                hint={spec.kind === "tag"
                                  ? "automatic shows the tags your products already carry, most used first"
                                  : "automatic follows the shop's own order and needs no upkeep"}
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  {(["AUTO", "MANUAL"] as const).map((m) => (
                                    <button
                                      key={m}
                                      onClick={() => patch(r.key, { config: { ...r.config, mode: m } })}
                                      className={"text-[12.5px] px-3.5 py-2 rounded-full border transition-colors " +
                                        ((manual ? "MANUAL" : "AUTO") === m
                                          ? "bg-purple text-white border-purple"
                                          : "bg-white text-body border-lavender-deep hover:border-orchid")}>
                                      {m === "AUTO" ? "Automatic" : "I'll choose"}
                                    </button>
                                  ))}
                                  {manual && (
                                    <span className="text-[11.5px] text-body-soft">
                                      {picked.length} of {spec.cap} chosen
                                    </span>
                                  )}
                                </div>
                              </F>

                              {manual && (
                                <div className="mt-3 space-y-3">
                                  {picked.length === 0 ? (
                                    <p className="text-[11.5px] text-[#8a6414] m-0">
                                      Nothing picked yet, so the row is still filling itself
                                      automatically — a heading with no cards under it is not
                                      what half-finished should look like.
                                    </p>
                                  ) : (
                                    <div className="rounded-[12px] border border-lavender-deep bg-white overflow-hidden">
                                      {picked.map((s, idx) => (
                                        <div key={s}
                                          className="flex items-center gap-2.5 px-3 py-2 border-b border-[#efe6f5] last:border-b-0">
                                          <span className="w-[20px] text-[12px] text-body-soft tabular-nums">{idx + 1}</span>
                                          <span className="flex-1 min-w-0 text-[13px] text-purple truncate">{nameFor(s)}</span>
                                          <button onClick={() => movePick(r, idx, -1)} disabled={idx === 0}
                                            title="Move up"
                                            className="w-[28px] h-[28px] rounded-[8px] grid place-items-center bg-lavender text-purple hover:bg-purple hover:text-white disabled:opacity-30 disabled:hover:bg-lavender disabled:hover:text-purple transition-colors text-[13px]">↑</button>
                                          <button onClick={() => movePick(r, idx, 1)} disabled={idx === picked.length - 1}
                                            title="Move down"
                                            className="w-[28px] h-[28px] rounded-[8px] grid place-items-center bg-lavender text-purple hover:bg-purple hover:text-white disabled:opacity-30 disabled:hover:bg-lavender disabled:hover:text-purple transition-colors text-[13px]">↓</button>
                                          <button onClick={() => togglePick(r, s)} title="Take it out"
                                            className="w-[28px] h-[28px] rounded-[8px] grid place-items-center bg-lavender text-body-soft hover:bg-[#fdecea] hover:text-[#c0392b] transition-colors text-[13px]">✕</button>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {spec.kind === "product" && (
                                    <input className="ipt" placeholder="Search this category…"
                                      value={poolQ} onChange={(e) => setPoolQ(e.target.value)} />
                                  )}

                                  <div className="flex flex-wrap gap-1.5 max-h-[190px] overflow-y-auto">
                                    {options.map((o) => (
                                      <button key={o.slug}
                                        onClick={() => togglePick(r, o.slug)}
                                        disabled={picked.length >= spec.cap}
                                        className="text-[12.5px] px-3 py-1.5 rounded-full border bg-white text-body border-lavender-deep hover:border-orchid disabled:opacity-40 transition-colors">
                                        {o.name}
                                        {o.note && <span className="text-body-soft ml-1.5">{o.note}</span>}
                                      </button>
                                    ))}
                                    {options.length === 0 && (
                                      <p className="text-[12px] text-body-soft m-0">
                                        {spec.kind === "product" && poolBusy
                                          ? "Looking…"
                                          : spec.readyOnly && picked.length === 0
                                            ? "Nothing here can leave today — only 2-hour and same-day products can go in this row."
                                            : spec.kind === "tag" && optionsFor(r).length === 0
                                              ? `No tags in this group yet — make them under Tags, then come back.`
                                              : `No more ${spec.noun} to add.`}
                                      </p>
                                    )}
                                  </div>

                                  <p className="text-[11.5px] text-body-soft m-0">
                                    Anything you choose that later goes out of stock, out of
                                    this category or out of the delivery zone simply leaves the
                                    row. Nothing is put in its place — these are your choices,
                                    not a quota.
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/*
                      Decoration. Offered on every section, built-in or added.

                      ⚠️ NOT AN IMAGE FOR THE CARDS. The pictures inside a
                      section — a tag's card, a category's tile, a product's
                      photo — belong to the thing they show and are edited
                      there. A second image here would be a second source for
                      the same card art, and the two would drift.
                    */}
                    {(advanced === r.key || r.blockType) && (
                    <div className="pt-2 border-t border-lavender-deep/60 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-start">
                      <F label="Icon above the heading" hint="leave all unpicked for none">
                        <div className="flex flex-wrap gap-1">
                          <button
                            onClick={() => (r.blockType ? patchBlock(r.key, { config: { ...r.config, icon: null, iconUrl: null } }) : patch(r.key, { config: { ...r.config, icon: null, iconUrl: null } }))}
                            className={"text-[11.5px] px-2.5 py-1.5 rounded-[9px] border " +
                              (!r.config.icon && !r.config.iconUrl ? "bg-purple text-white border-purple" : "bg-white text-body-soft border-lavender-deep")}>
                            none
                          </button>
                          {ICON_NAMES.map((n) => {
                            const on = r.config.icon === n && !r.config.iconUrl;
                            return (
                              <button key={n} title={n}
                                onClick={() => (r.blockType ? patchBlock(r.key, { config: { ...r.config, icon: n, iconUrl: null } }) : patch(r.key, { config: { ...r.config, icon: n, iconUrl: null } }))}
                                className={"w-[30px] h-[30px] grid place-items-center rounded-[9px] border " +
                                  (on ? "bg-purple text-white border-purple" : "bg-white text-purple border-lavender-deep hover:border-orchid")}>
                                <ShopIconPreview name={n} size={15} />
                              </button>
                            );
                          })}
                        </div>
                      </F>

                      <F label="Picture behind this section" hint="1600 × 700 · optional">
                        <div className="flex items-center gap-2">
                          {r.config.bgImageUrl ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={String(r.config.bgImageUrl)} alt="" className="w-[92px] h-[40px] object-cover rounded-[8px] border border-lavender-deep" />
                              <button
                                onClick={() => (r.blockType ? patchBlock(r.key, { config: { ...r.config, bgImageUrl: null } }) : patch(r.key, { config: { ...r.config, bgImageUrl: null } }))}
                                className="text-[12px] text-body-soft hover:text-[#c0392b]">Remove</button>
                            </>
                          ) : (
                            <label className="text-[12px] text-purple border border-dashed border-lavender-deep rounded-[9px] px-3 py-2 cursor-pointer hover:border-orchid">
                              {uploading === r.key ? "Uploading…" : "Choose a picture"}
                              <input type="file" accept="image/*" className="hidden"
                                onChange={(e) => pickImage(r.key, "bgImageUrl", e.target.files?.[0] ?? null, r.config)} />
                            </label>
                          )}
                        </div>
                      </F>
                    </div>
                    )}

                    {r.overridden && slug !== "" && !r.blockType && (
                      <button onClick={() => follow(r.key)} className="text-[12px] text-body-soft hover:text-purple underline">
                        Follow the shop-wide default again
                      </button>
                    )}
                  </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/*
        Adding a section. Three shapes, not a free canvas — the boundary the
        owner accepted for the homepage, for the same reason: an arbitrary
        layout breaks an approved design in front of customers.

        It has to say WHERE it goes, because the fourteen cannot be reordered
        (D-CAT-04) and a block with nowhere to be would land at the bottom of
        the page by accident.
      */}
      <div className="bg-white border border-lavender-deep rounded-[13px] px-4 py-3.5 mb-4">
        {!adding ? (
          <button onClick={() => setAdding(true)}
            className="text-white text-[13px] font-semibold px-4 py-2.5 rounded-[11px] inline-flex items-center gap-1.5 shadow-[0_3px_12px_rgba(80,40,100,0.22)] hover:opacity-95 transition-opacity"
            style={{ background: "linear-gradient(135deg,#7B2D8E,#C155D8)" }}>
            <Icon name="plus" size={15} /> Add a section
            <span className="text-[12px] font-normal opacity-80 ml-1">
              {slug ? `to ${chosen?.name}` : "to every category page"}
            </span>
          </button>
        ) : (
          <div className="space-y-3">
            <div className="text-[13px] font-medium text-purple">A new section {slug ? `on ${chosen?.name}` : "on every category page"}</div>
            <div className="flex flex-wrap gap-1.5">
              {BLOCKS.map((b) => (
                <button key={b.v} onClick={() => setNewBlock(b.v)} title={b.hint}
                  className={"text-[12.5px] font-semibold px-3.5 py-2 rounded-full border transition-all " +
                    (newBlock === b.v ? "text-white border-transparent shadow-[0_3px_12px_rgba(80,40,100,0.2)]" : "bg-white text-body border-lavender-deep hover:border-orchid")}
                  style={newBlock === b.v ? { background: "linear-gradient(135deg,#7B2D8E,#C155D8)" } : undefined}>
                  {b.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <F label="Put it after">
                <select className="ipt text-[12.5px]" style={{ minWidth: 220 }} value={newAfter} onChange={(e) => setNewAfter(e.target.value)}>
                  {rows.filter((x) => !x.blockType).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </F>
              <button onClick={addBlock} className="bg-purple hover:bg-purple-deep text-white text-[13px] font-semibold px-4 py-2.5 rounded-[10px]">Add</button>
              <button onClick={() => setAdding(false)} className="text-[12.5px] text-body-soft px-2">Cancel</button>
            </div>
            <p className="text-[11.5px] text-body-soft m-0">
              It arrives switched off, so nothing appears on the site while you set it up.
            </p>
          </div>
        )}
      </div>

      <div className="bg-lavender/40 border border-lavender-deep rounded-[13px] px-4 py-3.5 text-[12.5px] text-body-soft">
        <b className="text-purple">A section you switch on can still be empty.</b>{" "}
        Most of these fill themselves from the products in the category — no red
        flowers, no colour row. That is deliberate: an empty row under a heading
        reads as a fault, so the page leaves it out rather than showing a gap.
      </div>
    </div>
  );
}

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-medium text-body mb-1">{label}</div>
      {children}
      {hint && <div className="text-[11.5px] text-body-soft mt-1">{hint}</div>}
    </div>
  );
}
