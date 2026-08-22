"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "./Icon";
import {
  WRAP, ACCENT, msg, ErrBar, OkBar, ItemThumb, QuickSelect, Modal, Field,
} from "./ItemUI";
import {
  getItem, createItem, updateItem, deleteItem, listItems, loadItemFormRefs, generateItemVariants,
  itemUsage, getItemTimeline,
  createItemCategory, createItemAttribute, addItemAttrValue, getItemSettings,
  createBrand, createSupplier, listSupplierTypes, createUnit,
  listItemTypes, createItemType, FALLBACK_ITEM_TYPES, floorPrice,
  uploadItemImage, itemTint, itemInitials,
  formatTaka, itemStockLabel, getInvItemStock,
  listSuppliers,
  ITEM_TYPE_META,
  type InvItemStock, type ApiSupplier,
  type ApiItem, type ApiUnit, type ApiItemCategory, type ApiBrand, type ApiItemAttribute,
  type ApiItemEvent, type ApiItemTypeRow, type ItemType,
} from "../_data/api";

/*
  Master Data · Items — CREATE / EDIT, on its own page (sobuj, 21 Jul).

  Layout follows the house editor pattern (§2 UI convention):
    left  = vertical section nav
    mid   = the sections
    right = a live "how this reads" preview + the rules that apply

  The recipe builder only appears once the item exists and is FINISHED — a recipe line
  is a server-side row (ITM-R03 cycle check, ITM-R06 cost roll-up), so it cannot be
  edited before there is an item to hang it on. On create we say so plainly instead of
  faking it.
*/

/* DEC-ITM-011 phase 3 — "Recipe" is GONE from this page (owner's ruling, 21 Jul:
   "recipe amder item a dorkar nai, ta lagbe amder Assembly te"). The ItemComponent
   table and the cost roll-up stay exactly as they are; only the editing surface moves
   to the Assembly module, where combining many items into one thing is the whole job.
   Deciding what a rose IS should not require thinking about what it goes into. */
type Section = "basics" | "photo" | "classify" | "behaviour" | "price" | "stock" | "connect";

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "basics", label: "Basics", icon: "edit" },
  // classify sits BEFORE photo (owner, 20 Aug): pick the variants first, then the
  // Photo tab knows exactly how many pictures it has to ask for.
  { key: "classify", label: "Category & labels", icon: "grid" },
  { key: "photo", label: "Photo", icon: "photo" },
  { key: "behaviour", label: "How it is used", icon: "shield" },
  { key: "price", label: "Price & cost", icon: "cash" },
  { key: "stock", label: "Stock & alerts", icon: "box" },
  { key: "connect", label: "Sell online", icon: "link" },
];

type MarginMode = "none" | "percent" | "flat";

type Draft = {
  name: string;
  sku: string;
  itemType: ItemType;      // the behaviour the rules read (DEC-ITM-017)
  itemTypeId: string;      // the label the owner picked — may be one he invented
  unitId: string;
  itemCategoryId: string;
  brandId: string;
  supplierId: string; // DEC-SUP-004 — primary/usual supplier
  imageUrl: string | null;
  description: string;
  isSaleable: boolean;
  isOnline: boolean;   // DEC-ITM-024 — may also reach the website
  isPurchasable: boolean;
  isReturnable: boolean;
  isPerishable: boolean;
  isStockTracked: boolean;
  shelfLifeDays: string;
  reorderLevel: string;
  weightGram: string;
  costTaka: string;        // the PURCHASE rate — what we pay
  sellTaka: string;        // DEC-ITM-022 — a FIXED counter price; blank = automatic
  markupPercent: string;   // DEC-ITM-023 — this item's own profit %; blank = shop default
  marginMode: MarginMode;  // DEC-ITM-018 — how the floor is worked out
  marginPercent: string;
  marginTaka: string;
  vatPercent: string;      // DEC-ITM-019
  maxDiscountPercent: string;
  attributeValueIds: string[];
  isActive: boolean;
};

const EMPTY: Draft = {
  name: "", sku: "", itemType: "RAW", itemTypeId: "", unitId: "", itemCategoryId: "", brandId: "", supplierId: "",
  imageUrl: null, description: "",
  isSaleable: true, isOnline: true, isPurchasable: true, isReturnable: true, isPerishable: false,
  isStockTracked: true, shelfLifeDays: "", reorderLevel: "", weightGram: "",
  costTaka: "", sellTaka: "", markupPercent: "", marginMode: "none", marginPercent: "", marginTaka: "",
  vatPercent: "", maxDiscountPercent: "",
  attributeValueIds: [], isActive: true,
};

/** DEC-ITM-013 — sensible starting flags per type; the same rule the API applies */
/*  DEC-ITM-025 — everything here is for selling; picking a type only decides
    whether it is also BOUGHT and whether it is counted.  */
function flagsForType(t: ItemType) {
  return {
    isSaleable: true,
    isPurchasable: t !== "SERVICE",
    isStockTracked: t !== "SERVICE",
  };
}

export default function ItemEditor({ itemId }: { itemId?: string }) {
  const router = useRouter();
  const isNew = !itemId;

  /*
    `?name=` — arriving from the product editor's "New item" button, 1 Aug
    2026. The product being sold and the thing in the stockroom usually share
    a name, and typing it twice is how the two drift apart on the first
    letter. Only a starting value; the owner edits it freely.
  */
  const params = useSearchParams();
  const prefillName = isNew ? (params.get("name") ?? "") : "";

  const [draft, setDraft] = useState<Draft>(
    prefillName ? { ...EMPTY, name: prefillName } : EMPTY,
  );
  const [item, setItem] = useState<ApiItem | null>(null);
  // live stock from Inventory (DEC-ITM-005 addendum) — fail-soft: null keeps "—"
  const [invStock, setInvStock] = useState<InvItemStock | null>(null);
  useEffect(() => {
    if (!item?.id) return;
    getInvItemStock(item.id).then(setInvStock).catch(() => setInvStock(null));
  }, [item?.id]);
  const [units, setUnits] = useState<ApiUnit[]>([]);
  const [groups, setGroups] = useState<ApiItemCategory[]>([]);
  const [brands, setBrands] = useState<ApiBrand[]>([]);
  // DEC-SUP-004 — supplier picker source; fail-soft: empty list hides nothing else
  const [suppliers, setSuppliers] = useState<ApiSupplier[]>([]);
  const [attrs, setAttrs] = useState<ApiItemAttribute[]>([]);
  const [allItems, setAllItems] = useState<ApiItem[]>([]);
  // DEC-ITM-017 — the owner's own type vocabulary; falls back to the five built-ins
  const [types, setTypes] = useState<ApiItemTypeRow[]>(FALLBACK_ITEM_TYPES);

  const [section, setSection] = useState<Section>("basics");
  /** DEC-ITM-023 — the shop default profit %, so the screen shows the same figure the server will use */
  const [shopMarkupBp, setShopMarkupBp] = useState<number | null>(null);
  useEffect(() => { getItemSettings().then((s) => setShopMarkupBp(s.defaultMarkupBp)).catch(() => setShopMarkupBp(null)); }, []);
  // create-category dialog (name + optional parent) — opened from the picker's create row
  const [catDlg, setCatDlg] = useState<{ name: string; parentId: string } | null>(null);
  const [catBusy, setCatBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [skuTouched, setSkuTouched] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  /* DEC-ITM-016 — on a NEW item you choose up front: one thing, or a family.
     "Rose" + Colour[Red, Yellow, White] ⇒ three real, independent items. */
  /* On a NEW item the mode starts as null: you answer "single or variants?" on a
     step of its own before the form appears. It used to be a toggle at the top of a
     long form, which is easy to scroll past and then get wrong (sobuj, 21 Jul:
     "onek time vitore gele confuse jabe ba miss kore felbe"). */
  const [mode, setMode] = useState<"single" | "variants" | null>(null);
  const [vGroups, setVGroups] = useState<Record<string, string[]>>({}); // attributeId → valueIds
  const [vBusy, setVBusy] = useState(false);
  /* DEC-ITM-012 — a photo per variant, keyed by the sorted combination. The family
     photo (draft.imageUrl) is the fallback, so you can set one picture for the whole
     Rose family and override just the red one. */
  const [vImages, setVImages] = useState<Record<string, string | null>>({});
  const comboKey = (ids: string[]) => [...ids].sort().join("|");

  /* ---------------- load ---------------- */

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const refs = await loadItemFormRefs();
        setUnits(refs.units); setGroups(refs.groups); setBrands(refs.brands); setAttrs(refs.attributes);
        listSuppliers().then(setSuppliers).catch(() => setSuppliers([]));
        listItems().then(setAllItems).catch(() => setAllItems([]));
        // if /item-types is not up yet the form still renders on the five built-ins
        listItemTypes().then((t) => t.length && setTypes(t)).catch(() => { /* fallback */ });

        if (itemId) {
          const it = await getItem(itemId);
          setItem(it);
          setDraft({
            name: it.name, sku: it.sku, itemType: it.itemType, itemTypeId: it.itemTypeId ?? "",
            unitId: it.unitId, itemCategoryId: it.itemCategoryId ?? "", brandId: it.brandId ?? "",
            supplierId: it.supplierId ?? "",
            imageUrl: it.imageUrl ?? null, description: it.description ?? "",
            isSaleable: it.isSaleable, isOnline: it.isOnline ?? true, isPurchasable: it.isPurchasable,
            isReturnable: it.isReturnable, isPerishable: it.isPerishable,
            isStockTracked: it.isStockTracked,
            shelfLifeDays: it.shelfLifeDays?.toString() ?? "",
            reorderLevel: it.reorderLevel?.toString() ?? "",
            weightGram: it.weightGram?.toString() ?? "",
            costTaka: ((it.standardCostPaisa ?? 0) / 100).toString(),
            sellTaka: it.sellingPricePaisa != null ? (it.sellingPricePaisa / 100).toString() : "",
            markupPercent: it.markupBp != null ? (it.markupBp / 100).toString() : "",
            // DEC-ITM-018 — the two margin columns are mutually exclusive, so whichever
            // one carries a value also tells us which mode the form should open in
            marginMode: it.minMarginBp ? "percent" : it.minMarginPaisa ? "flat" : "none",
            marginPercent: it.minMarginBp ? (it.minMarginBp / 100).toString() : "",
            marginTaka: it.minMarginPaisa ? (it.minMarginPaisa / 100).toString() : "",
            vatPercent: it.vatRateBp ? (it.vatRateBp / 100).toString() : "",
            maxDiscountPercent: it.maxDiscountBp ? (it.maxDiscountBp / 100).toString() : "",
            attributeValueIds: (it.attributeValues ?? []).map((a) => a.id),
            isActive: it.isActive,
          });
          setSkuTouched(true);
        } else {
          // default to the first LIVE unit — hidden ones are not offered (19 Aug)
          setDraft((d) => ({ ...d, unitId: refs.units.find((u) => u.isActive)?.id ?? "" }));
        }
      } catch (e) {
        setErr(msg(e, "Could not load this item."));
      } finally { setLoading(false); }
    })();
  }, [itemId]);

  /* ---------------- derived ---------------- */

  const meta = ITEM_TYPE_META[draft.itemType];
  // two-step category (owner, 20 Aug): pick the main category, THEN its sub-categories appear
  const selCat = groups.find((g) => g.id === draft.itemCategoryId) ?? null;
  const rootCatId = selCat ? (selCat.parentId ?? selCat.id) : "";
  const subCats = groups.filter((g) => g.parentId === rootCatId);
  // Colour panel first, then the size types A–Z — sizes read as one group (owner, 20 Aug)
  const orderedAttrs = useMemo(() => {
    const isColour = (n: string) => /colou?r/i.test(n);
    return attrs.slice().sort((a, b) =>
      Number(isColour(b.name)) - Number(isColour(a.name)) || a.name.localeCompare(b.name));
  }, [attrs]);
  const autoSku = useMemo(
    () => draft.name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40),
    [draft.name],
  );
  const effectiveSku = skuTouched && draft.sku ? draft.sku : autoSku;
  const canSave = draft.name.trim().length > 0 && !!draft.unitId;
  const lines = item?.components ?? [];
  const stock = itemStockLabel(
    { isStockTracked: draft.isStockTracked, assemblyMode: item?.assemblyMode ?? "NONE" },
    invStock && invStock.mode !== "NA"
      ? { totalQtyMilli: invStock.totalQtyMilli, canBuild: invStock.canBuild }
      : null,
  );

  /* DEC-ITM-018 — the floor, recomputed as you type. Same formula the server uses, so
     the number on screen is the number that gets saved. */
  const costPaisa = Math.max(0, Math.round((parseFloat(draft.costTaka) || 0) * 100));
  const sellPaisa = draft.sellTaka.trim() === "" ? null : Math.max(0, Math.round((parseFloat(draft.sellTaka) || 0) * 100));
  /*  DEC-ITM-023 — the same three lines the server runs, so the screen and the till
      never disagree: markup = the item's own percent or the shop default, suggestion =
      cost + markup (nothing to suggest without a cost), price = fixed one if set.  */
  const markupBp =
    draft.markupPercent.trim() === ""
      ? (shopMarkupBp ?? 2000)
      : Math.max(0, Math.round((parseFloat(draft.markupPercent) || 0) * 100));
  const suggestedPaisa = costPaisa > 0 ? Math.round(costPaisa * (1 + markupBp / 10_000)) : null;
  const priceNowPaisa = sellPaisa ?? suggestedPaisa;
  /*  cost stops being typed once the item has been bought — the average owns it then
      (a recipe-driven item never types it at all)  */
  const costIsAuto = item?.costMode === "AUTO" || (!!item && (item.effectiveCostPaisa ?? 0) > 0);
  const marginBp = draft.marginMode === "percent"
    ? Math.max(0, Math.round((parseFloat(draft.marginPercent) || 0) * 100)) : 0;
  const marginPaisa = draft.marginMode === "flat"
    ? Math.max(0, Math.round((parseFloat(draft.marginTaka) || 0) * 100)) : 0;
  const floorPaisa = floorPrice(costPaisa, marginBp || null, marginPaisa || null);
  const vatBp = Math.max(0, Math.round((parseFloat(draft.vatPercent) || 0) * 100));
  const discountBp = Math.max(0, Math.round((parseFloat(draft.maxDiscountPercent) || 0) * 100));

  /** the row the owner picked; falls back to whichever built-in matches the behaviour */
  const typeRow = types.find((t) => t.id === draft.itemTypeId)
    ?? types.find((t) => t.behaviour === draft.itemType && t.isSystem)
    ?? types[0];

  /* ---------------- save ---------------- */

  function payload() {
    return {
      name: draft.name.trim(),
      sku: effectiveSku || undefined,
      itemType: draft.itemType,
      itemTypeId: draft.itemTypeId || null, // DEC-ITM-017 — its behaviour wins server-side
      unitId: draft.unitId,
      itemCategoryId: draft.itemCategoryId || null,
      brandId: draft.brandId || null,
      supplierId: draft.supplierId || null, // DEC-SUP-004
      imageUrl: draft.imageUrl,
      description: draft.description.trim() || null,
      isSaleable: draft.isSaleable,
      isOnline: draft.isOnline, // DEC-ITM-024
      isPurchasable: draft.isPurchasable,
      isReturnable: draft.isReturnable,
      isPerishable: draft.isPerishable,
      isStockTracked: draft.isStockTracked,
      shelfLifeDays: draft.shelfLifeDays === "" ? null : Math.max(0, Math.round(Number(draft.shelfLifeDays) || 0)),
      reorderLevel: draft.reorderLevel === "" ? null : Math.max(0, Math.round(Number(draft.reorderLevel) || 0)),
      weightGram: draft.weightGram === "" ? null : Math.max(0, Math.round(Number(draft.weightGram) || 0)),
      standardCostPaisa: costPaisa,
      sellingPricePaisa: sellPaisa, // DEC-ITM-022 — null = follow cost + markup
      markupBp: draft.markupPercent.trim() === "" ? null : markupBp, // DEC-ITM-023
      // DEC-ITM-018 — send both, always: clearing a rule has to be expressible, and the
      // server treats null as "no rule" while undefined would mean "leave it alone".
      minMarginBp: marginBp || null,
      minMarginPaisa: marginPaisa || null,
      vatRateBp: vatBp || null,
      maxDiscountBp: discountBp || null,
      attributeValueIds: draft.attributeValueIds,
      isActive: draft.isActive,
    };
  }

  async function save(andClose = true) {
    if (!canSave) {
      setErr(!draft.name.trim() ? "Give the item a name first." : "Pick a unit — cost and stock mean nothing without one.");
      return;
    }
    setSaving(true); setErr(null); setOk(null);
    try {
      if (isNew) {
        const created = await createItem(payload() as Parameters<typeof createItem>[0]);
        if (andClose) { router.push("/items/list"); return; }
        router.replace(`/items/${created.id}`);
      } else {
        const updated = await updateItem(itemId!, payload());
        setItem((prev) => (prev ? { ...prev, ...updated } : updated));
        setOk("Saved.");
        if (andClose) router.push("/items/list");
      }
    } catch (e) { setErr(msg(e, "Could not save this item.")); }
    finally { setSaving(false); }
  }

  /*  Made a category on its own screen, came back, and the picker still did not
      have it — the owner had to reload the page (20 Aug). Every time this window
      gets focus again the reference lists are re-read.  */
  useEffect(() => {
    const refresh = () => {
      loadItemFormRefs()
        .then((r) => { setUnits(r.units); setGroups(r.groups); setBrands(r.brands); setAttrs(r.attributes); })
        .catch(() => { /* keep what we have */ });
      listSuppliers().then(setSuppliers).catch(() => { /* keep */ });
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  /** re-pull the dropdown sources after something was created inline */
  async function reloadRefs() {
    try {
      const refs = await loadItemFormRefs();
      setUnits(refs.units); setGroups(refs.groups); setBrands(refs.brands); setAttrs(refs.attributes);
    } catch { /* keep what we have */ }
  }

  /* ---------------- variant family (DEC-ITM-016) ---------------- */

  /** the exact list that will be created — shown before anything is written */
  const variantPreview = useMemo(() => {
    const groups = Object.values(vGroups).filter((g) => g.length > 0);
    if (!draft.name.trim() || groups.length === 0) return [];
    const labelOf = new Map<string, string>();
    for (const a of attrs) for (const v of a.values) labelOf.set(v.id, v.label);
    let combos: string[][] = [[]];
    for (const g of groups) combos = combos.flatMap((c) => g.map((v) => [...c, v]));
    const prefix = (skuTouched && draft.sku ? draft.sku : autoSku) || "ITEM";
    return combos.slice(0, 60).map((combo) => {
      const labels = combo.map((id) => labelOf.get(id) ?? "?");
      return {
        valueIds: combo,
        name: `${draft.name.trim()} — ${labels.join(" / ")}`,
        sku: `${prefix}-${labels.map((l) => l.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")).join("-")}`,
      };
    });
  }, [vGroups, attrs, draft.name, draft.sku, skuTouched, autoSku]);

  async function createVariants() {
    if (!draft.name.trim()) { setErr("Give the family a base name first — e.g. “Rose”."); return; }
    if (!draft.unitId) { setErr("Pick a unit."); return; }
    const valueIdGroups = Object.values(vGroups).filter((g) => g.length > 0);
    if (valueIdGroups.length === 0) { setErr("Tick at least one colour or size."); return; }
    setVBusy(true); setErr(null);
    try {
      const r = await generateItemVariants({
        baseName: draft.name.trim(),
        itemType: draft.itemType,
        unitId: draft.unitId,
        itemCategoryId: draft.itemCategoryId || null,
        brandId: draft.brandId || null,
        valueIdGroups,
        standardCostPaisa: Math.max(0, Math.round((parseFloat(draft.costTaka) || 0) * 100)),
        isPerishable: draft.isPerishable,
        weightGram: draft.weightGram === "" ? null : Math.max(0, Math.round(Number(draft.weightGram) || 0)),
        skuPrefix: skuTouched && draft.sku ? draft.sku : undefined,
        imageUrl: draft.imageUrl,
        variantImages: variantPreview
          .filter((v) => vImages[comboKey(v.valueIds)])
          .map((v) => ({ valueIds: v.valueIds, imageUrl: vImages[comboKey(v.valueIds)]! })),
      });
      if (r.created.length === 0) { setErr(r.message); return; }
      router.push("/items/list");
    } catch (e) { setErr(msg(e, "Could not create the variants.")); }
    finally { setVBusy(false); }
  }

  /* ---------------- cost mode ----------------
     The recipe EDITORS (add line / change quantity / set assembly mode) were removed
     with the Recipe tab — they move to the Assembly module (owner's ruling, 21 Jul).
     Switching between manual and rolled-up cost stays here, because that is a property
     of the item's price, not of the recipe. */

  async function reloadItem() {
    if (!itemId) return;
    try { setItem(await getItem(itemId)); } catch { /* keep what we have */ }
  }
  /**
   * ITM-R07 from inside the item — same rules as the list: a recipe dependency
   * blocks, a product link is offered as an unlink. House dialog, never
   * window.confirm() (Phase 2 ruling).
   */
  const [delOpen, setDelOpen] = useState(false);

  function removeThis() {
    if (!item) return;
    const used = item._count?.usedIn ?? 0;
    if (used) {
      setErr(
        `“${item.name}” is an ingredient in ${used} recipe${used === 1 ? "" : "s"}. ` +
        `Take it out of ${used === 1 ? "that recipe" : "those recipes"} first.`,
      );
      return;
    }
    setDelOpen(true);
  }

  async function doDelete() {
    if (!item) return;
    const linked = item._count?.products ?? 0;
    setSaving(true); setErr(null);
    try { await deleteItem(item.id, linked > 0); router.push("/items/list"); }
    catch (e) { setErr(msg(e, "Could not delete this item.")); setSaving(false); setDelOpen(false); }
  }

  async function setCostMode(m: "AUTO" | "MANUAL") {
    try { await updateItem(itemId!, { costMode: m }); await reloadItem(); }
    catch (e) { setErr(msg(e, "Could not change the cost mode.")); }
  }

  if (loading) return <div className={WRAP}><div className="text-[13px] text-body-soft">Loading…</div></div>;

  /* ---------------- step 1 of a new item: which kind? ----------------
     A full step, not a toggle buried in a form. You cannot start typing until this is
     answered, so you cannot fill in a whole form and then find out it made the wrong
     thing (sobuj, 21 Jul). */
  if (isNew && mode === null) {
    return (
      <div className={WRAP}>
        <div className="flex items-center gap-3 mb-6">
          <Link href="/items/list" className="w-[34px] h-[34px] rounded-[10px] border border-lavender-deep bg-white grid place-items-center text-purple hover:border-orchid">
            <Icon name="chevronLeft" size={16} />
          </Link>
          <div>
            <div className="text-[11px] font-bold tracking-[0.1em] uppercase" style={{ color: ACCENT }}>master data · new item</div>
            <h1 className="font-display text-[28px] text-purple mt-1 mb-0 leading-tight">What are you adding?</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-[860px]">
          {([
            {
              k: "single" as const, icon: "box", title: "One single item",
              lead: "A thing on its own",
              examples: ["Kraft Wrapping Paper", "Teddy Bear — Brown 12in", "Gift Wrapping Service"],
              note: "One name, one code, one cost.",
            },
            {
              k: "variants" as const, icon: "sparkle", title: "An item with variants",
              lead: "The same thing in several colours or sizes",
              examples: ["Rose → Red · Yellow · White", "Gift Box → Small · Medium · Large"],
              note: "One form creates several items — each gets its own code, cost and photo.",
            },
          ]).map((o) => (
            <button key={o.k} onClick={() => setMode(o.k)}
              className="text-left rounded-[18px] border-2 bg-white p-6 hover:shadow-lift transition-all"
              style={{ borderColor: "#efe4f7" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = ACCENT)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#efe4f7")}
            >
              <span className="w-[48px] h-[48px] rounded-[14px] grid place-items-center text-white mb-4" style={{ background: ACCENT }}>
                <Icon name={o.icon} size={23} />
              </span>
              <div className="font-display text-[21px] text-purple leading-tight">{o.title}</div>
              <div className="text-[13.5px] text-body-soft mt-1">{o.lead}</div>

              <div className="mt-4 flex flex-col gap-1.5">
                {o.examples.map((x) => (
                  <span key={x} className="text-[13px] text-body bg-lavender/60 rounded-[9px] px-3 py-1.5">{x}</span>
                ))}
              </div>

              <div className="text-[12.5px] text-body-soft mt-4 pt-3.5 border-t border-lavender-deep">{o.note}</div>

              <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold mt-4" style={{ color: ACCENT }}>
                Continue <Icon name="chevronDown" size={14} />
              </span>
            </button>
          ))}
        </div>

      </div>
    );
  }

  /* ---------------- render ---------------- */

  return (
    <div className={WRAP}>
      {/* header */}
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/items/list" className="w-[34px] h-[34px] rounded-[10px] border border-lavender-deep bg-white grid place-items-center text-purple hover:border-orchid">
            <Icon name="chevronLeft" size={16} />
          </Link>
          <div>
            <div className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: ACCENT }}>
              {isNew ? "master data · new item" : "master data · item"}
            </div>
            <h1 className="font-display text-[25px] text-purple mt-1 mb-0 leading-tight">
              {draft.name.trim() || (isNew ? (mode === "variants" ? "New item group" : "New item") : "Untitled item")}
            </h1>
            {isNew && (
              <button onClick={() => setMode(null)}
                className="text-[12.5px] font-semibold mt-1 inline-flex items-center gap-1.5 px-2 py-1 rounded-full"
                style={{ background: "#f9e9fd", color: "#8b21c9" }}
                title="Change what you are adding">
                <Icon name={mode === "variants" ? "sparkle" : "box"} size={11} />
                {mode === "variants" ? "With variants" : "Single item"}
                <span className="underline opacity-80">change</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Delete was only on the list row, so from inside an item the only way to get
              rid of it was to go back and find it again. Same rules as the list: a
              recipe dependency blocks, a product link is offered as an unlink. */}
          {!isNew && (
            <button onClick={removeThis} disabled={saving}
              className="text-[13.5px] font-semibold px-4 py-2.5 rounded-[11px] border inline-flex items-center gap-2 disabled:opacity-50"
              style={{ background: "#fff", borderColor: "#f0d4d0", color: "#c0392b" }}>
              <Icon name="trash" size={14} /> Delete
            </button>
          )}
          <Link href="/items/list" className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] hover:border-orchid">Cancel</Link>
          {isNew && mode === "variants" ? (
            <button onClick={createVariants} disabled={vBusy || variantPreview.length === 0}
              className="text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2 disabled:opacity-50"
              style={{ background: ACCENT }}>
              <Icon name="sparkle" size={15} />
              {vBusy ? "Creating…" : `Create ${variantPreview.length || ""} item${variantPreview.length === 1 ? "" : "s"}`}
            </button>
          ) : (
            <button onClick={() => save(true)} disabled={saving || !canSave}
              className="text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2 disabled:opacity-50"
              style={{ background: ACCENT }}>
              <Icon name="check" size={15} /> {saving ? "Saving…" : isNew ? "Create item" : "Save"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[186px_minmax(0,1fr)_290px] gap-5 items-start">
        {/* ---- section nav ---- */}
        <nav className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-2 lg:sticky lg:top-5">
          {SECTIONS.map((s) => {
            const on = section === s.key;
            const variantMode = isNew && mode === "variants";
            // a service has no stock to count, and a family is not connected to one Product
            const disabled =
              (s.key === "stock" && draft.itemType === "SERVICE") ||
              (s.key === "connect" && variantMode);
            return (
              <button key={s.key} onClick={() => !disabled && setSection(s.key)} disabled={disabled}
                className="w-full text-left text-[13.5px] font-semibold px-3 py-2.5 rounded-[10px] flex items-center gap-2.5 mb-0.5 disabled:opacity-35"
                style={on ? { background: ACCENT, color: "#fff" } : { color: "#5b4166" }}>
                <Icon name={s.icon} size={14} />
                {s.key === "photo" && variantMode ? "Photos" : s.label}
              </button>
            );
          })}
        </nav>

        {/* ---- sections ---- */}
        <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft p-5">
          {section === "basics" && (
            <Sect title="Basics">
              <Row label="Name" required hint="The name your staff uses in the stockroom.">
                <input className="ipt w-full" placeholder="e.g. Red Rose (fresh cut)" value={draft.name} onChange={(e) => set("name", e.target.value)} />
              </Row>

              {/* DEC-ITM-017 — the owner's own list, plus a "+ New type" that opens a
                  small dialog. He can name it anything; he just has to say which of the
                  five it behaves like, because that is what the stock and cost rules read. */}
              <Row label="Type" required hint="Pick a type, or add your own with “+ New type”. Rename or delete types on Items → Item types.">
                <div className="flex gap-1.5 flex-wrap items-center">
                  {types.filter((t) => t.isActive !== false).map((t) => {
                    const tone = t.colour ?? ITEM_TYPE_META[t.behaviour].colour;
                    const on = typeRow?.id === t.id;
                    return (
                      /* a custom type stands on its own name — no "·Raw" tail, the
                         internal rule-behaviour is not the owner's business here */
                      <button key={t.id} type="button"
                        onClick={() => setDraft((d) => ({
                          ...d, itemTypeId: t.id, itemType: t.behaviour, ...flagsForType(t.behaviour),
                        }))}
                        title={t.isSystem ? ITEM_TYPE_META[t.behaviour].blurb : undefined}
                        className="text-[13px] font-semibold px-3.5 py-2 rounded-[10px] border-2 transition-colors"
                        style={on
                          ? { background: tone, borderColor: tone, color: "#fff" }
                          : { background: "#fff", borderColor: "#e8dcf0", color: tone }}>
                        {t.name}
                      </button>
                    );
                  })}
                  <NewTypeButton
                    existing={types}
                    onCreate={async (name, behaviour, colour) => {
                      try {
                        const created = await createItemType({ name, behaviour, colour });
                        setTypes((p) => [...p, created]);
                        setDraft((d) => ({ ...d, itemTypeId: created.id, itemType: behaviour, ...flagsForType(behaviour) }));
                      } catch (e) { setErr(msg(e, "Could not create that type.")); }
                    }}
                  />
                </div>
              </Row>

              <Pair>
                <Row label="Unit" required hint="How you count it — stem, kg, piece. Type a new one to create it here.">
                  <QuickSelect
                    value={draft.unitId}
                    placeholder={units.length === 0 ? "No units yet — type one" : "Pick a unit"}
                    allowClear={false}
                    createLabel="Create unit"
                    onChange={(id) => set("unitId", id)}
                    /* hidden units are not offered for NEW picks, but an item already on
                       one keeps it visible — records never lose their unit (19 Aug) */
                    options={units
                      .filter((u) => u.isActive || u.id === draft.unitId)
                      .map((u) => ({ id: u.id, label: u.name, hint: u.shortCode }))}
                    onCreate={async (label) => {
                      try {
                        /*  the short code is derived server-side from the name when it
                            is not given, so one typed word is enough here  */
                        const created = await createUnit({
                          name: label.trim(),
                          shortCode: label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "unit",
                        });
                        setUnits((p) => [...p, created]);
                        return created.id;
                      } catch (e) { setErr(msg(e, "Could not create that unit.")); return null; }
                    }}
                  />
                </Row>

                <Row label="SKU" required hint="One code used everywhere — orders, packing slips, stock. Auto-built from the name unless you type your own.">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <input className="ipt w-full font-mono" placeholder={autoSku || "auto"} value={skuTouched ? draft.sku : autoSku}
                      onChange={(e) => { setSkuTouched(true); set("sku", e.target.value.toUpperCase()); }} />
                    <button type="button" onClick={() => { setSkuTouched(false); set("sku", ""); }}
                      className="border border-lavender-deep bg-white text-purple text-[12.5px] font-semibold px-3 rounded-[10px] hover:border-orchid shrink-0">
                      Auto
                    </button>
                  </div>
                </Row>
              </Pair>

              <Row label="Note" hint="Anything the team should know.">
                <textarea className="ipt w-full" rows={2} placeholder="Optional" value={draft.description} onChange={(e) => set("description", e.target.value)} />
              </Row>

              {/* variant mode: one button, no paragraph. Where to go next is the only
                  thing that needs saying, and a button says it better than a sentence. */}
              {isNew && mode === "variants" && (
                <button type="button" onClick={() => setSection("classify")}
                  className="text-white text-[13px] font-semibold px-4 py-2.5 rounded-[10px] inline-flex items-center gap-2 self-start"
                  style={{ background: ACCENT }}>
                  Next: pick the variants <Icon name="chevronDown" size={13} />
                </button>
              )}
            </Sect>
          )}

          {/* One drop zone, one line of text. The three explanatory paragraphs that used
              to sit beside it said things you learn once and then never need again
              (sobuj, 21 Jul: "photo ar ase pashe ato text purai jogra khichuri lagche"). */}
          {section === "photo" && (
            <Sect
              title={isNew && mode === "variants" ? "Photos" : "Photo"}
              hint={isNew && mode === "variants"
                ? "One photo per variant. The group photo is the fallback for any variant you leave blank."
                : "The stockroom shot — one clear photo on a plain background. The marketing gallery belongs to the Product, not here. Saved at 256px so the list stays fast."}
            >
              {isNew && mode === "variants" ? (
                variantPreview.length === 0 ? (
                  /* variants first — then this tab knows how many pictures to ask for */
                  <button type="button" onClick={() => setSection("classify")}
                    className="text-white text-[13px] font-semibold px-4 py-2.5 rounded-[10px] inline-flex items-center gap-2 self-start"
                    style={{ background: ACCENT }}>
                    Pick the variants first <Icon name="chevronDown" size={13} />
                  </button>
                ) : (
                  <>
                    <Row label="Group photo — the fallback">
                      <PhotoDrop
                        item={{ sku: effectiveSku, name: draft.name, imageUrl: draft.imageUrl }}
                        onImage={(u) => set("imageUrl", u)}
                        onErr={setErr}
                      />
                    </Row>
                    <div className="rounded-[16px] border overflow-hidden" style={{ borderColor: "#d9c7e6" }}>
                      <div className="px-4 py-3 flex items-center gap-2.5" style={{ background: ACCENT }}>
                        <span className="text-[13.5px] font-bold text-white">
                          {variantPreview.length} photo{variantPreview.length === 1 ? "" : "s"} — one per variant
                        </span>
                      </div>
                      <div className="max-h-[340px] overflow-y-auto divide-y divide-lavender-deep">
                        {variantPreview.map((v) => {
                          const k = comboKey(v.valueIds);
                          return (
                            <div key={v.sku} className="px-3.5 py-2.5 grid grid-cols-[46px_minmax(0,1fr)_auto] gap-3 items-center">
                              <VariantPhoto
                                name={v.name}
                                url={vImages[k] ?? draft.imageUrl}
                                own={!!vImages[k]}
                                onPick={(u) => setVImages((p) => ({ ...p, [k]: u }))}
                                onErr={setErr}
                              />
                              <div className="min-w-0">
                                <div className="text-[13.5px] font-semibold text-purple truncate">{v.name}</div>
                                <div className="font-mono text-[12px] text-body-soft truncate">{v.sku}</div>
                              </div>
                              <span className="text-[12px] font-semibold shrink-0"
                                style={{ color: vImages[k] ? "#0e7a3d" : "#8b7a95" }}>
                                {vImages[k] ? "own photo" : "uses group photo"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )
              ) : (
                <PhotoDrop
                  item={{ sku: effectiveSku, name: draft.name, imageUrl: draft.imageUrl }}
                  onImage={(u) => set("imageUrl", u)}
                  onErr={setErr}
                />
              )}
            </Sect>
          )}

          {section === "classify" && (
            <Sect title="Category & labels" hint="Where it sits in the stockroom, and which colour or size it is.">
              <Pair>
              {/* main first, sub only after — the flat "Parent › Child" list read as a mess (owner, 20 Aug) */}
              <Row label="Item category" hint="Your stockroom tree, e.g. Fresh Flowers → Roses. Pick the main category; its sub-categories appear next.">
                <QuickSelect
                  value={rootCatId}
                  placeholder="— no category —"
                  onChange={(id) => set("itemCategoryId", id)}
                  createLabel="Create category"
                  options={groups
                    .filter((g) => !g.parentId)
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((g) => ({ id: g.id, label: g.name }))}
                  onCreate={async (label) => {
                    setCatDlg({ name: label, parentId: "" });
                    return null;
                  }}
                />
              </Row>

              {rootCatId && (
                <Row label="Sub-category">
                  <QuickSelect
                    value={selCat && selCat.parentId ? selCat.id : ""}
                    placeholder={subCats.length ? "— whole category —" : "— none yet, type to create —"}
                    onChange={(id) => set("itemCategoryId", id || rootCatId)}
                    createLabel="Create sub-category"
                    options={subCats
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((g) => ({ id: g.id, label: g.name }))}
                    onCreate={async (label) => {
                      setCatDlg({ name: label, parentId: rootCatId });
                      return null;
                    }}
                  />
                </Row>
              )}

              <Row label="Brand" hint="Mostly gifts carry a brand; flowers usually don't.">
                <QuickSelect
                  value={draft.brandId}
                  placeholder="— none —"
                  onChange={(id) => set("brandId", id)}
                  createLabel="Create brand"
                  options={brands.map((b) => ({ id: b.id, label: b.name }))}
                  /*  made here, not on another screen: leaving a half-filled form to go
                      and create a brand is how the form gets abandoned (owner, 20 Aug) */
                  onCreate={async (label) => {
                    try {
                      const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
                      const created = await createBrand({ name: label.trim(), slug: slug || `brand-${Date.now()}` });
                      setBrands((p) => [...p, created]);
                      return created.id;
                    } catch (e) { setErr(msg(e, "Could not create that brand.")); return null; }
                  }}
                />
              </Row>

              {/* DEC-SUP-004 — whose product this is. For fulfillment-vendor items
                  (cake) this labels the vendor on the website; for stocked items it
                  is the usual reorder source. */}
              <Row label="Supplier" hint="Who supplies this item.">
                <QuickSelect
                  value={draft.supplierId}
                  placeholder="— none —"
                  onChange={(id) => set("supplierId", id)}
                  createLabel="Create supplier"
                  options={suppliers.map((s) => ({ id: s.id, label: s.nickname ? `${s.name} (${s.nickname})` : s.name }))}
                  onCreate={async (label) => {
                    try {
                      const types = await listSupplierTypes();
                      const t = types.find((x) => x.name === "Product Supplier") ?? types[0];
                      if (!t) { setErr("No supplier types exist yet — open Suppliers → Settings once."); return null; }
                      const created = await createSupplier({ name: label.trim(), typeId: t.id });
                      setSuppliers((p) => [...p, created]);
                      return created.id;
                    } catch (e) { setErr(msg(e, "Could not create that supplier.")); return null; }
                  }}
                />
              </Row>
              </Pair>

              {isNew && mode === "variants" ? (
                /*
                  VARIANT MODE — the same panel language as single mode, but MULTI-select,
                  because here every tick becomes an item. Colour shows real swatches;
                  everything else shows pills, so an attribute the owner invents later
                  ("Stem Length", "Fabric") gets a proper panel for free.

                  Order matters and is now enforced: PICK THE VARIANTS FIRST, and the
                  per-variant photo tiles only appear once there is something to photograph
                  (sobuj, 21 Jul). Before that there is exactly one photo option — the group
                  photo on the Photo tab — and nothing else to distract.
                */
                <>
                  {attrs.length === 0 ? (
                    <Row label="Which variants?"><AttrStarter onDone={reloadRefs} onErr={setErr} /></Row>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-[12.5px] font-bold text-purple">Which variants?</span>
                        <Info text="Every value you tick becomes a real item of its own — its own code, its own cost, its own stock. Two attributes multiply: 3 colours × 2 sizes = 6 items." />
                        {variantPreview.length > 0 && (
                          <button type="button" onClick={() => { setVGroups({}); setVImages({}); }}
                            className="ml-auto text-[12px] font-semibold underline text-body-soft">clear all</button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {orderedAttrs.map((a) => {
                          const picked = vGroups[a.id] ?? [];
                          const isColour = /colou?r/i.test(a.name);
                          /* read the CURRENT list out of the updater, not out of the
                             render closure: two clicks landing in the same frame would
                             otherwise both start from the same stale array and the second
                             would silently undo the first. */
                          const toggle = (id: string) => setVGroups((g) => {
                            const cur = g[a.id] ?? [];
                            return { ...g, [a.id]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
                          });
                          return (
                            <div key={a.id} className="rounded-[14px] border overflow-hidden"
                              style={{ borderColor: picked.length ? "#d9c0ea" : "#e8dcf0" }}>
                              <div className="px-3.5 py-2.5 flex items-center gap-2 border-b"
                                style={{ background: picked.length ? "#f5eafb" : "#faf6fd", borderColor: "#e8dcf0" }}>
                                <Icon name={isColour ? "sparkle" : "grid"} size={13} />
                                <span className="text-[13px] font-bold text-purple">{isColour ? a.name : `Size — ${a.name}`}</span>
                                <span className="ml-auto text-[12px] font-semibold"
                                  style={{ color: picked.length ? ACCENT : "#8b7a95" }}>
                                  {picked.length ? `${picked.length} picked` : "none"}
                                </span>
                              </div>

                              <div className="p-3">
                                {isColour ? (
                                  <div className="flex flex-wrap gap-2">
                                    {a.values.map((v) => {
                                      const on = picked.includes(v.id);
                                      return (
                                        <button key={v.id} type="button" onClick={() => toggle(v.id)} title={v.label}
                                          className="w-[34px] h-[34px] rounded-full grid place-items-center transition-transform hover:scale-105"
                                          style={{
                                            background: v.swatch ?? "#e8dcf0",
                                            boxShadow: on
                                              ? `0 0 0 2px #fff, 0 0 0 4px ${ACCENT}`
                                              : "inset 0 0 0 1px rgba(0,0,0,.10)",
                                          }}>
                                          {on && <Icon name="check" size={15} style={{ color: isPale(v.swatch) ? "#2c0f3d" : "#fff" }} />}
                                        </button>
                                      );
                                    })}
                                    <InlineValueAdd attrId={a.id} attrName={a.name} onDone={reloadRefs} onErr={setErr} />
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {a.values.map((v) => {
                                      const on = picked.includes(v.id);
                                      return (
                                        <button key={v.id} type="button" onClick={() => toggle(v.id)}
                                          className="text-[13px] font-semibold px-3 py-1.5 rounded-[9px] border-2 transition-colors"
                                          style={on
                                            ? { background: ACCENT, borderColor: ACCENT, color: "#fff" }
                                            : { background: "#fff", borderColor: "#e8dcf0", color: "#5b4166" }}>
                                          {v.label}
                                        </button>
                                      );
                                    })}
                                    <InlineValueAdd attrId={a.id} attrName={a.name} onDone={reloadRefs} onErr={setErr} />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* STEP TWO — appears only once step one produced something.
                          Photos are NOT here: the Photos tab asks for them, one per
                          variant, after this list exists (owner, 20 Aug). */}
                      {variantPreview.length > 0 && (
                        <div className="rounded-[16px] border overflow-hidden" style={{ borderColor: "#d9c0ea" }}>
                          <div className="px-4 py-3 flex items-center gap-2.5" style={{ background: ACCENT }}>
                            <span className="w-[24px] h-[24px] rounded-full grid place-items-center text-[12px] font-bold"
                              style={{ background: "rgba(255,255,255,.2)", color: "#fff" }}>
                              {variantPreview.length}
                            </span>
                            <span className="text-[13.5px] font-bold text-white">
                              item{variantPreview.length === 1 ? "" : "s"} will be created
                            </span>
                          </div>

                          <div className="max-h-[300px] overflow-y-auto divide-y divide-lavender-deep">
                            {variantPreview.map((v) => (
                              <div key={v.sku} className="px-3.5 py-2.5 min-w-0">
                                <div className="text-[13.5px] font-semibold text-purple truncate">{v.name}</div>
                                <div className="font-mono text-[12px] text-body-soft truncate">{v.sku}</div>
                              </div>
                            ))}
                          </div>

                          <div className="px-4 py-2.5 border-t border-lavender-deep">
                            <button type="button" onClick={() => setSection("photo")}
                              className="text-white text-[13px] font-semibold px-4 py-2 rounded-[10px] inline-flex items-center gap-2"
                              style={{ background: ACCENT }}>
                              Next: photos <Icon name="chevronDown" size={13} />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
              /* Each label type gets its OWN bordered panel with a header, instead of a
                 flat run of chips under a grey caption. Colours show a real round swatch
                 at readable size; sizes show the value. One pick per type — a rose is one
                 colour, not three (sobuj, 21 Jul: "standard way te rakho"). */
              <>
                {attrs.length === 0 ? (
                  <Row label="Colour & size"><AttrStarter onDone={reloadRefs} onErr={setErr} /></Row>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {orderedAttrs.map((a) => {
                      const isColour = /colou?r/i.test(a.name);
                      const chosen = a.values.find((v) => draft.attributeValueIds.includes(v.id));
                      /* same rule as the variant panel: derive from the live draft inside
                         the updater so two quick clicks cannot cancel each other out */
                      const pick = (id: string) =>
                        setDraft((d) => {
                          const others = d.attributeValueIds.filter((x) => !a.values.some((v) => v.id === x));
                          const already = d.attributeValueIds.includes(id);
                          return { ...d, attributeValueIds: already ? others : [...others, id] };
                        });
                      return (
                        <div key={a.id} className="rounded-[14px] border overflow-hidden" style={{ borderColor: "#e8dcf0" }}>
                          <div className="px-3.5 py-2.5 flex items-center gap-2 border-b" style={{ background: "#faf6fd", borderColor: "#e8dcf0" }}>
                            <Icon name={isColour ? "sparkle" : "grid"} size={13} />
                            <span className="text-[13px] font-bold text-purple">{isColour ? a.name : `Size — ${a.name}`}</span>
                            <span className="ml-auto text-[12px]" style={{ color: chosen ? ACCENT : "#8b7a95" }}>
                              {chosen?.label ?? "not set"}
                            </span>
                          </div>

                          <div className="p-3">
                            {isColour ? (
                              <div className="flex flex-wrap gap-2">
                                {a.values.map((v) => {
                                  const on = chosen?.id === v.id;
                                  return (
                                    <button key={v.id} type="button" onClick={() => pick(v.id)} title={v.label}
                                      className="w-[34px] h-[34px] rounded-full grid place-items-center transition-transform hover:scale-105"
                                      style={{
                                        background: v.swatch ?? "#e8dcf0",
                                        boxShadow: on
                                          ? `0 0 0 2px #fff, 0 0 0 4px ${ACCENT}`
                                          : "inset 0 0 0 1px rgba(0,0,0,.10)",
                                      }}>
                                      {on && (
                                        <Icon name="check" size={15}
                                          /* dark tick on pale swatches, white on dark ones */
                                          style={{ color: isPale(v.swatch) ? "#2c0f3d" : "#fff" }} />
                                      )}
                                    </button>
                                  );
                                })}
                                <InlineValueAdd attrId={a.id} attrName={a.name} onDone={reloadRefs} onErr={setErr} />
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {a.values.map((v) => {
                                  const on = chosen?.id === v.id;
                                  return (
                                    <button key={v.id} type="button" onClick={() => pick(v.id)}
                                      className="text-[13px] font-semibold px-3 py-1.5 rounded-[9px] border-2 transition-colors"
                                      style={on
                                        ? { background: ACCENT, borderColor: ACCENT, color: "#fff" }
                                        : { background: "#fff", borderColor: "#e8dcf0", color: "#5b4166" }}>
                                      {v.label}
                                    </button>
                                  );
                                })}
                                <InlineValueAdd attrId={a.id} attrName={a.name} onDone={reloadRefs} onErr={setErr} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
              )}
            </Sect>
          )}

          {/* Was "What it can do" — five identical chips in a row, so you could not tell
              what any of them meant or whether it was on. Now each is a labelled switch
              row with its consequence spelled out in six words (sobuj, 21 Jul: "buja onk
              ar jonno muskil hoye jabe"). */}
          {/* Returnable / perishable / discount ceiling left this form (owner, 20 Aug):
              an item is a list entry — those rules will be asked where they are used
              (Returns, Inventory expiry, Orders/POS). The columns stay in the schema. */}
          {section === "behaviour" && (
            <Sect title="How it is used" hint="Set what this item can be used for.">
              {/*  ITM-R13 — a service is sold and never bought; the switches would
                   only be two ways to break it, so they are locked and say why.  */}
              {draft.itemType === "SERVICE" ? (
                <Note tone="purple">
                  A service is always on sale and never bought — it goes to the counter as
                  soon as it has a price.
                </Note>
              ) : (
                <div className="rounded-[14px] border overflow-hidden divide-y" style={{ borderColor: "#e8dcf0", borderTopColor: "#e8dcf0" }}>
                  <SwitchRow on={draft.isPurchasable} onClick={() => set("isPurchasable", !draft.isPurchasable)}
                    icon="download" tone="#0e8f74"
                    title="We buy it" sub="Can go on a purchase order" />
                  <SwitchRow on={draft.isSaleable} onClick={() => set("isSaleable", !draft.isSaleable)}
                    icon="cash" tone="#8b21c9"
                    title="We sell it" sub="Sold at the counter, and may sit behind a product" />
                </div>
              )}

              <Pair>
                <Row label="Weight (grams)" hint="Couriers charge by weight — needed for shipping quotes.">
                  <input className="ipt w-full" inputMode="numeric" placeholder="e.g. 250" value={draft.weightGram} onChange={(e) => set("weightGram", e.target.value)} />
                </Row>
              </Pair>
            </Sect>
          )}

          {/* DEC-ITM-018 — Item owns the BUY side and the FLOOR, not the selling price.
              Two prices in two modules drift apart the first time someone edits one of
              them; the floor is a rule, and a rule can safely live in two places because
              it is checked, not copied. */}
          {section === "price" && (
            <Sect title="Price & cost">
              {/*  DEC-ITM-023 (owner, 20 Aug) — the cost is NOT typed once the item has
                   been bought: it is the average of what was actually paid, and every
                   receive moves it. Typing over it would put a wish next to a fact.  */}
              <Pair>
                <Row
                  label={`Cost per ${units.find((u) => u.id === draft.unitId)?.name?.toLowerCase() ?? "unit"}`}
                  hint="The average of what you have actually paid. Purchases keep it up to date."
                >
                  {costIsAuto ? (
                    <div className="ipt w-full flex items-center justify-between" style={{ background: "#faf6fd" }}>
                      <b className="text-body">{formatTaka(costPaisa)}</b>
                      <span className="text-[12px] text-body-soft">
                        {item?.costMode === "AUTO" ? "from its recipe" : "average of your purchases"}
                      </span>
                    </div>
                  ) : (
                    <TakaInput value={draft.costTaka} onChange={(v) => set("costTaka", v)} placeholder="0.00" />
                  )}
                </Row>
                <Row label="VAT" hint="The default VAT rate for this item.">
                  <PercentInput value={draft.vatPercent} onChange={(v) => set("vatPercent", v)} placeholder="0" />
                </Row>
              </Pair>
              {!costIsAuto && (
                <p className="text-[12px] text-body-soft m-0 -mt-2">
                  Starting cost — from the first purchase onward this becomes the average and stops being typed.
                </p>
              )}

              {/*  DEC-ITM-022/023 — everything marked "We sell it" is sellable at the
                   counter, services included. The price follows the cost by default;
                   fixing it by hand is the exception, and it says so.  */}
              {(draft.isSaleable || draft.itemType === "SERVICE") && (
                <div className="rounded-[14px] border overflow-hidden" style={{ borderColor: "#e8dcf0" }}>
                  <div className="px-4 py-2.5 flex items-center gap-2 border-b" style={{ background: "#faf6fd", borderColor: "#e8dcf0" }}>
                    <Icon name="cash" size={13} />
                    <span className="text-[13px] font-bold text-purple">Counter price</span>
                    <Info text="What the till charges. It follows the cost automatically; a website product may price differently." />
                    <div className="ml-auto inline-flex rounded-full overflow-hidden border" style={{ borderColor: "#d9c7e6" }}>
                      {([
                        { k: false, label: "Automatic" },
                        { k: true, label: "Fixed price" },
                      ]).map((o, i) => (
                        <button key={String(o.k)} type="button"
                          onClick={() => set("sellTaka", o.k ? String((suggestedPaisa ?? 0) / 100) : "")}
                          className="text-[12.5px] font-bold px-3.5 py-1"
                          style={{
                            background: (draft.sellTaka.trim() !== "") === o.k ? ACCENT : "#fff",
                            color: (draft.sellTaka.trim() !== "") === o.k ? "#fff" : "#6b5077",
                            borderLeft: i ? "1px solid #e8dcf0" : undefined,
                          }}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-4">
                    {draft.sellTaka.trim() === "" ? (
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[13px] text-body">
                          {formatTaka(costPaisa)} <span className="text-body-soft">cost</span> +{" "}
                          <span className="inline-flex items-center gap-1.5 align-middle">
                            <span className="w-[86px] inline-block">
                              <PercentInput
                                value={draft.markupPercent}
                                onChange={(v) => set("markupPercent", v)}
                                placeholder={String((shopMarkupBp ?? 2000) / 100)}
                              />
                            </span>
                            <span className="text-body-soft">profit</span>
                          </span>
                        </span>
                        <span className="text-body-soft">→</span>
                        <b className="font-display text-[22px] leading-none" style={{ color: "#0e7a3d" }}>
                          {suggestedPaisa === null ? "—" : formatTaka(suggestedPaisa)}
                        </b>
                        {suggestedPaisa === null && (
                          <span className="text-[12.5px] text-body-soft">
                            no cost yet — buy it once, or switch to a fixed price
                          </span>
                        )}
                        {draft.markupPercent.trim() === "" && (
                          <span className="text-[12px] text-body-soft">
                            shop default {(shopMarkupBp ?? 2000) / 100}%
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="max-w-[220px]">
                        <TakaInput value={draft.sellTaka} onChange={(v) => set("sellTaka", v)} placeholder="0.00" />
                      </div>
                    )}
                    {sellPaisa !== null && floorPaisa !== null && sellPaisa < floorPaisa && (
                      <p className="text-[12px] text-[#c0392b] m-0 mt-2">
                        Below the floor — {formatTaka(floorPaisa)} is the least this may sell for.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {item?.costMode === "AUTO" && (
                <Note tone="green">
                  On <b>automatic cost</b> — {formatTaka(item.computedCostPaisa ?? 0)}, added up from its recipe in Assembly.
                  <button type="button" onClick={() => setCostMode("MANUAL")} className="underline ml-2 font-semibold">switch to manual</button>
                </Note>
              )}

              {/* the minimum-profit rule the owner asked for */}
              <div className="rounded-[14px] border overflow-hidden" style={{ borderColor: "#e8dcf0" }}>
                <div className="px-4 py-2.5 flex items-center gap-2 border-b" style={{ background: "#faf6fd", borderColor: "#e8dcf0" }}>
                  <Icon name="shield" size={13} />
                  <span className="text-[13px] font-bold text-purple">Minimum profit</span>
                  <Info text="The lowest this may ever be sold for. The till refuses to go under it, however the price was worked out." />
                  <div className="ml-auto inline-flex rounded-full overflow-hidden border" style={{ borderColor: "#d9c7e6" }}>
                    {([
                      { k: "none" as const, label: "Off" },
                      { k: "percent" as const, label: "%" },
                      { k: "flat" as const, label: "৳" },
                    ]).map((o, i) => (
                      <button key={o.k} type="button" onClick={() => set("marginMode", o.k)}
                        className="text-[12.5px] font-bold px-3.5 py-1"
                        style={{
                          background: draft.marginMode === o.k ? ACCENT : "#fff",
                          color: draft.marginMode === o.k ? "#fff" : "#6b5077",
                          borderLeft: i ? "1px solid #e8dcf0" : undefined,
                        }}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4">
                  {draft.marginMode === "none" ? (
                    <p className="text-[13px] text-body-soft m-0">
                      No floor set — the counter and the website may price this freely.
                    </p>
                  ) : (
                    <>
                      <div className="max-w-[220px]">
                        {draft.marginMode === "percent" ? (
                          <PercentInput value={draft.marginPercent} onChange={(v) => set("marginPercent", v)} placeholder="e.g. 25" />
                        ) : (
                          <TakaInput value={draft.marginTaka} onChange={(v) => set("marginTaka", v)} placeholder="e.g. 50" />
                        )}
                      </div>

                      {/* the sum, spelled out — a rule you cannot see the effect of is a rule nobody trusts */}
                      <div className="mt-3.5 rounded-[12px] px-4 py-3 flex items-center gap-3 flex-wrap"
                        style={{ background: "linear-gradient(120deg,#f3fbf6,#e6f6ee)" }}>
                        <span className="text-[13px] text-body">
                          {formatTaka(costPaisa)}
                          <span className="text-body-soft"> cost</span>
                          {" + "}
                          {draft.marginMode === "percent"
                            ? `${draft.marginPercent || 0}%`
                            : formatTaka(marginPaisa)}
                          <span className="text-body-soft"> profit</span>
                        </span>
                        <span className="text-body-soft">→</span>
                        <span className="font-display text-[22px] leading-none" style={{ color: "#0e7a3d" }}>
                          {floorPaisa === null ? "—" : formatTaka(floorPaisa)}
                        </span>
                        <span className="text-[12.5px] font-semibold" style={{ color: "#0e7a3d" }}>
                          lowest you may sell it for
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

            </Sect>
          )}

          {/* Inventory settings — the SETTINGS, never a quantity. DEC-ITM-005 stands:
              the count itself belongs to Inventory and is only ever read from there. */}
          {section === "stock" && (
            <Sect title="Stock & alerts">
              <div className="rounded-[14px] border overflow-hidden divide-y" style={{ borderColor: "#e8dcf0" }}>
                <SwitchRow on={draft.isStockTracked} onClick={() => set("isStockTracked", !draft.isStockTracked)}
                  icon="box" tone="#2563a8"
                  title="Track inventory" sub="Count it in and out, and warn when it runs low" />
              </div>

              {draft.isStockTracked ? (
                <Pair>
                  <Row label="Low stock point" hint="Shows on the low-stock list at this count.">
                    <div className="relative">
                      <input className="ipt w-full" inputMode="numeric" placeholder="e.g. 20"
                        value={draft.reorderLevel} onChange={(e) => set("reorderLevel", e.target.value)} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-body-soft pointer-events-none">
                        {units.find((u) => u.id === draft.unitId)?.shortCode ?? "unit"}
                      </span>
                    </div>
                  </Row>
                  <Row label="Current stock" hint="Read-only — live from Inventory.">
                    <div className="ipt w-full flex items-center text-body-soft" style={{ background: "#faf6fd" }}>
                      {stock.text}
                    </div>
                  </Row>
                </Pair>
              ) : (
                <Note tone="grey">Not counted. Services and one-off items usually sit here.</Note>
              )}
            </Sect>
          )}

          {/* DEC-ITM-010 phase 3 — the answer to "can I connect this to the Product
              module?". The link is one SKU: the Product borrows this item's code, and
              once Inventory exists the stock the website shows is this item's stock. */}
          {/*  DEC-ITM-022 — this tab used to repeat the "We sell it" switch, so the
               same fact had two switches and the owner could not tell them apart.
               "We sell it" (How it is used) = the counter; a Product = the website.  */}
          {section === "connect" && (
            <Sect title="Sell online">
              {/*  DEC-ITM-024 — its own switch, not the counter's. Off = it never
                   appears on the product page; the till is untouched either way.  */}
              <div className="rounded-[14px] border overflow-hidden divide-y" style={{ borderColor: "#e8dcf0" }}>
                <SwitchRow on={draft.isOnline && draft.isSaleable}
                  onClick={() => draft.isSaleable && set("isOnline", !draft.isOnline)}
                  icon="link" tone="#8b21c9"
                  title="Sell online" sub="Off keeps it off the product page — the counter still sells it" />
              </div>

              {!draft.isSaleable ? (
                <Note tone="grey">
                  Switch on <b>We sell it</b> under &ldquo;How it is used&rdquo; first — the website sells
                  what the shop sells.
                </Note>
              ) : !draft.isOnline ? (
                <Note tone="grey">
                  Counter only. It will not appear when a product page looks for an item.
                  {(item?._count?.products ?? 0) > 0 && (
                    <> {item!._count!.products} product{item!._count!.products === 1 ? "" : "s"} already
                    point at it — they keep working until someone saves them again.</>
                  )}
                </Note>
              ) : isNew ? (
                <Note tone="purple">
                  Create the item first. The connect button appears here straight after — a Product has to point at a
                  saved item's SKU.
                </Note>
              ) : (item?._count?.products ?? 0) > 0 ? (
                <Note tone="green">
                  Connected to <b>{item!._count!.products}</b> product{item!._count!.products === 1 ? "" : "s"}.
                  They share the code <b className="font-mono">{item!.sku}</b>, so stock and cost are read from this
                  item — there is no second number to keep in step.
                  <Link href="/products" className="underline ml-2 font-semibold">open products</Link>
                </Note>
              ) : (
                <div className="rounded-[16px] border p-5" style={{ borderColor: "#e8dcf0", background: "linear-gradient(140deg,#faf6fd,#f4ebfa)" }}>
                  <div className="font-display text-[17px] text-purple">Not on the website yet</div>
                  <p className="text-[13px] text-body m-0 mt-1.5 max-w-[440px]">
                    Creating a product from this item copies the code <b className="font-mono">{item?.sku}</b> across.
                    From then on the product page shows this item&apos;s stock and cost — one item, one code, one
                    number in both places.
                  </p>
                  <Link href={`/products/new?itemId=${itemId}`}
                    className="inline-flex items-center gap-2 mt-4 text-white text-[13.5px] font-semibold px-5 py-2.5 rounded-[11px] shadow-soft"
                    style={{ background: ACCENT }}>
                    <Icon name="plus" size={15} /> Create the product page
                  </Link>
                </div>
              )}
            </Sect>
          )}
        </div>

        {/* ---- live preview ---- */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-5">
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
            <div className="px-4 py-2.5 th border-b border-lavender-deep bg-lavender/30">
              How it will look
            </div>
            <div className="p-4">
              <div className="flex items-center gap-3">
                <ItemThumb item={{ sku: effectiveSku || "NEW", name: draft.name || "?", imageUrl: draft.imageUrl }} size={46} />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-purple truncate">{draft.name || "Untitled item"}</div>
                  <div className="text-[13px] text-body-soft font-mono">{effectiveSku || "auto"}</div>
                </div>
              </div>
              <dl className="mt-3.5 text-[12.5px] grid grid-cols-[92px_minmax(0,1fr)] gap-y-1.5">
                <dt className="text-body-soft">Type</dt>
                <dd className="m-0 font-semibold" style={{ color: typeRow?.colour ?? meta.colour }}>{typeRow?.name ?? meta.label}</dd>
                <dt className="text-body-soft">Category</dt>
                <dd className="m-0 text-body">{groups.find((g) => g.id === draft.itemCategoryId)?.name ?? "—"}</dd>
                <dt className="text-body-soft">Unit</dt>
                <dd className="m-0 text-body">{units.find((u) => u.id === draft.unitId)?.name ?? "—"}</dd>
                <dt className="text-body-soft">Purchase</dt>
                <dd className="m-0 text-body">
                  {item?.costMode === "AUTO"
                    ? <span className="text-[#0e7a3d]">{formatTaka(item.computedCostPaisa ?? 0)} <span className="text-[11px]">auto</span></span>
                    : formatTaka(costPaisa)}
                </dd>
                {/* DEC-ITM-018 — the floor is the number that actually constrains selling,
                    so it belongs in the summary the owner glances at. */}
                {draft.isSaleable && (<><dt className="text-body-soft">Counter price</dt>
                  <dd className="m-0 font-semibold text-body">
                    {priceNowPaisa === null ? "not set" : formatTaka(priceNowPaisa)}
                    {priceNowPaisa !== null && (
                      <span className="text-[11px] font-normal text-body-soft ml-1.5">
                        {sellPaisa === null ? "auto" : "fixed"}
                      </span>
                    )}
                  </dd></>)}
                <dt className="text-body-soft">Sell above</dt>
                <dd className="m-0 font-semibold" style={{ color: floorPaisa === null ? "#8b7a95" : "#0e7a3d" }}>
                  {floorPaisa === null ? "no floor" : formatTaka(floorPaisa)}
                </dd>
                {vatBp > 0 && (<><dt className="text-body-soft">VAT</dt>
                  <dd className="m-0 text-body">{(vatBp / 100).toString()}%</dd></>)}
                <dt className="text-body-soft">Stock</dt>
                <dd className="m-0 text-body-soft" title={stock.hint}>{stock.text}</dd>
                <dt className="text-body-soft">Weight</dt>
                <dd className="m-0 text-body">{draft.weightGram ? `${draft.weightGram} g` : "—"}</dd>
              </dl>
              <div className="flex gap-1.5 flex-wrap mt-3">
                {draft.isPurchasable && <Pill text="bought" />}
                {draft.isSaleable && <Pill text="sold" />}
                {!draft.isStockTracked && <Pill text="not stocked" tone="#2563a8" bg="#e8f0fa" />}
              </div>
            </div>
          </div>

          {!isNew && item && <UsagePanel itemId={item.id} item={item} />}
          {!isNew && item && <HistoryPanel itemId={item.id} />}
        </div>
      </div>

      {/* ---- create category (name + optional parent) ---- */}
      {catDlg && (
        <Modal title="New item category" onClose={() => setCatDlg(null)}
          canSave={!!catDlg.name.trim()} busy={catBusy} saveLabel="Create"
          onSave={async () => {
            setCatBusy(true);
            try {
              const created = await createItemCategory({ name: catDlg.name.trim(), parentId: catDlg.parentId || null });
              setGroups((p) => [...p, created]);
              set("itemCategoryId", created.id);
              setCatDlg(null);
            } catch (e) { setErr(msg(e, "Could not create that category.")); }
            finally { setCatBusy(false); }
          }}>
          <Field label="Name" required>
            <input className="ipt w-full" autoFocus value={catDlg.name}
              onChange={(e) => setCatDlg({ ...catDlg, name: e.target.value })} />
          </Field>
          <Field label="Sits under">
            <select className="ipt w-full" value={catDlg.parentId}
              onChange={(e) => setCatDlg({ ...catDlg, parentId: e.target.value })}>
              <option value="">Root — a top-level category</option>
              {groups.filter((g) => !g.parentId).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </Field>
        </Modal>
      )}

      {/* ---- delete confirm (house dialog) ---- */}
      {delOpen && item && (
        <div className="fixed inset-0 z-[100] grid place-items-center p-4" style={{ background: "rgba(44,15,61,.42)" }}>
          <div className="bg-white rounded-[18px] shadow-lift w-[460px] max-w-full overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-3 border-b border-lavender-deep">
              <ItemThumb item={item} size={40} />
              <div className="min-w-0">
                <div className="text-[15px] font-bold text-purple truncate">Delete “{item.name}”?</div>
                <div className="text-[12.5px] font-mono text-body-soft">{item.sku}</div>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-[13px] text-body m-0">
                {(item._count?.products ?? 0) > 0
                  ? `${item._count!.products} linked product${item._count!.products === 1 ? " keeps" : "s keep"} name, price and photos — only the link is removed. The item moves to the trash and can be restored.`
                  : "It moves to the trash — hidden, not destroyed. Restore it whenever you like."}
              </p>
            </div>
            <div className="px-5 py-3.5 flex items-center gap-2 justify-end border-t border-lavender-deep bg-lavender/25">
              <button onClick={() => setDelOpen(false)} disabled={saving}
                className="border border-lavender-deep bg-white text-purple text-[13px] font-semibold px-4 py-2.5 rounded-[10px]">
                Cancel
              </button>
              <button onClick={doDelete} disabled={saving}
                className="text-white text-[13px] font-semibold px-5 py-2.5 rounded-[10px] disabled:opacity-50"
                style={{ background: ACCENT }}>
                {saving ? "Working…" : (item._count?.products ?? 0) > 0 ? `Unlink ${item._count!.products} and delete` : "Move to trash"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* The recipe BUILDER used to live here. It moved out with the Recipe tab — combining
   many items into one thing is the Assembly module's whole job, and ItemComponent /
   the cost roll-up are untouched, so nothing was lost by removing the surface. */

/* ============================================================ small bits */

/*
  ⚠️ THE RULE FOR THIS FILE (sobuj, 21 Jul: "field box ar niche ato text je atay pura
  page k onk beshi elomelo kre dicche"):

  A hint is NEVER a paragraph under the field. It is a small ⓘ beside the label that
  reveals on hover. Six fields each with two lines of grey prose is not "helpful" — it
  doubles the height of the form and buries the actual inputs. The explanation is still
  there for anyone who wants it; it just is not shouting at everyone all the time.
*/

export function Sect({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="font-display text-[20px] text-purple m-0">{title}</h2>
        {hint && <Info text={hint} />}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

/**
 * The ⓘ.
 *
 * ⚠️ IT USED TO BE PURE CSS, AND IT GOT SWALLOWED (owner, 22 Aug 2026: "icon
 * click krle text gula vitor duke jay"). An absolutely-positioned bubble is
 * clipped by any ancestor with `overflow-hidden` — which is every rounded card
 * in this panel — so the explanation opened INSIDE the card and was cut in
 * half. The same trap as `overflow-hidden` killing `position: sticky`, noted
 * in RADIAN_PENDING; `position: fixed` does not escape it either, because a
 * card with a hover transform becomes the containing block.
 *
 * So the bubble is rendered into `document.body` through a portal and placed
 * from the icon's own screen position. Nothing can clip it now.
 *
 * It opens on hover AND on click/tap — on a phone there is no hover, so the
 * old one was unreachable there.
 */
export function Info({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ top: number; left: number; below: boolean } | null>(null);

  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    // above by default; below when there is not room up there
    const below = r.top < 110;
    setBox({
      top: below ? r.bottom + 8 : r.top - 8,
      left: Math.min(Math.max(r.left + r.width / 2, 130), window.innerWidth - 130),
      below,
    });
  };

  useEffect(() => {
    if (!box) return;
    const close = () => setBox(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [box]);

  return (
    <>
      <span
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label={text}
        className="w-[16px] h-[16px] rounded-full grid place-items-center text-[10px] font-bold cursor-help shrink-0 select-none align-middle inline-grid"
        style={{ background: "#efe4f7", color: "#7a5b8c" }}
        onMouseEnter={place}
        onMouseLeave={() => setBox(null)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); box ? setBox(null) : place(); }}
        onFocus={place}
        onBlur={() => setBox(null)}
        onKeyDown={(e) => { if (e.key === "Escape") setBox(null); }}
      >
        i
      </span>
      {box &&
        createPortal(
          <span
            className="pointer-events-none fixed z-[9999] w-[248px] rounded-[10px] px-3 py-2 text-[12px] leading-snug text-white"
            style={{
              top: box.top,
              left: box.left,
              transform: `translate(-50%, ${box.below ? "0" : "-100%"})`,
              background: "#2c0f3d",
              boxShadow: "0 8px 26px rgba(44,15,61,.34)",
            }}
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  );
}

export function Row({
  label, hint, required, children, wide,
}: { label: string; hint?: string; required?: boolean; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-2" : undefined}>
      <label className="flex items-center gap-1.5 text-[12.5px] font-bold text-purple mb-1.5">
        {label}
        {required && <span className="text-[#c0392b]">*</span>}
        {hint && <Info text={hint} />}
      </label>
      {children}
    </div>
  );
}

/** two fields side by side — the old form put everything in one tall column */
export function Pair({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;
}

function Pill({ text, tone = "#470066", bg = "#f7f1fb" }: { text: string; tone?: string; bg?: string }) {
  return <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: bg, color: tone }}>{text}</span>;
}

/**
 * One behaviour, one row: icon · what it is · what it means · a real switch.
 * Replaces the row of identical chips, where nothing told you what a flag did or
 * whether it was on.
 */
export function SwitchRow({
  on, onClick, icon, tone, title, sub,
}: { on: boolean; onClick: () => void; icon: string; tone: string; title: string; sub: string }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full text-left px-4 py-3 grid grid-cols-[34px_minmax(0,1fr)_44px] items-center gap-3 hover:bg-lavender/25 transition-colors"
      style={{ borderColor: "#e8dcf0" }}>
      <span className="w-[32px] h-[32px] rounded-[10px] grid place-items-center transition-colors"
        style={{ background: on ? tone : "#f0e8f6", color: on ? "#fff" : "#a08fb0" }}>
        <Icon name={icon} size={15} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-bold" style={{ color: on ? "#2c0f3d" : "#7a6b85" }}>{title}</span>
        <span className="block text-[12.5px] text-body-soft truncate">{sub}</span>
      </span>
      <span className="w-[40px] h-[22px] rounded-full relative justify-self-end transition-colors"
        style={{ background: on ? tone : "#d6cbdf" }}>
        <span className="absolute top-[3px] w-[16px] h-[16px] bg-white rounded-full transition-all"
          style={{ left: on ? 21 : 3 }} />
      </span>
    </button>
  );
}

/** the one place a coloured explanation box is allowed — and it is one line, not three */
export function Note({ tone, children }: { tone: "green" | "grey" | "purple" | "amber"; children: React.ReactNode }) {
  const T = {
    green: { bg: "#e8f7ef", fg: "#0e7a3d" },
    grey: { bg: "#f5f2f7", fg: "#6b5077" },
    purple: { bg: "#f7f1fb", fg: "#470066" },
    amber: { bg: "#fbf1e2", fg: "#8a5209" },
  }[tone];
  return (
    <div className="rounded-[12px] px-4 py-3 text-[13px]" style={{ background: T.bg, color: T.fg }}>
      {children}
    </div>
  );
}

/** money in, money out — the ৳ sits inside the box so the number is what you read */
export function TakaInput({
  value, onChange, placeholder, disabled,
}: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-semibold pointer-events-none" style={{ color: "#8b7a95" }}>৳</span>
      <input className="ipt ipt-icon w-full" inputMode="decimal" placeholder={placeholder}
        value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function PercentInput({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <input className="ipt w-full" inputMode="decimal" placeholder={placeholder}
        value={value} onChange={(e) => onChange(e.target.value)} style={{ paddingRight: 34 }} />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13.5px] font-semibold pointer-events-none" style={{ color: "#8b7a95" }}>%</span>
    </div>
  );
}

/** a pale swatch needs a dark tick and vice versa, or the tick vanishes on white */
function isPale(hex?: string | null) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return true;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

/* ------------------------------------------------------------- photo drop zone */

/**
 * Drag-and-drop OR click, in one box, with the preview inside it. The old layout put a
 * small tile on the left and three paragraphs on the right; this is the same function
 * in a quarter of the height.
 */
export function PhotoDrop({
  item, onImage, onErr,
}: {
  item: { sku: string; name: string; imageUrl: string | null };
  onImage: (url: string | null) => void;
  onErr: (m: string) => void;
}) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function take(file?: File | null) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { onErr("That file is not an image."); return; }
    setBusy(true);
    try { onImage(await uploadItemImage(file, "items")); }
    catch (e) { onErr(msg(e, "Could not read that image.")); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex items-start gap-4 flex-wrap">
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}
        className="relative w-[300px] max-w-full h-[190px] rounded-[16px] border-2 border-dashed grid place-items-center cursor-pointer transition-colors overflow-hidden"
        style={{
          borderColor: over ? ACCENT : "#ddcfe8",
          background: over ? "#f7f1fb" : "#fcfaFd",
        }}
      >
        <input type="file" accept="image/*" className="hidden"
          onChange={(e) => { take(e.target.files?.[0]); e.currentTarget.value = ""; }} />

        {item.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imageUrl} alt="" className="absolute inset-0 w-full h-full object-contain p-3" />
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[12px] font-semibold px-3 py-1 rounded-full"
              style={{ background: "rgba(44,15,61,.82)", color: "#fff" }}>
              click to replace
            </span>
          </>
        ) : (
          <span className="text-center px-6">
            <span className="w-[42px] h-[42px] rounded-[13px] grid place-items-center mx-auto mb-2.5"
              style={{ background: "#f0e4f8", color: ACCENT }}>
              <Icon name="photo" size={20} />
            </span>
            <span className="block text-[13.5px] font-bold text-purple">
              {busy ? "Reading…" : "Drop a photo here"}
            </span>
            <span className="block text-[12.5px] text-body-soft mt-0.5">or click to browse · JPG or PNG</span>
          </span>
        )}
      </label>

      {item.imageUrl && (
        <div className="flex flex-col gap-2">
          <ItemThumb item={item} size={54} />
          <button type="button" onClick={() => onImage(null)}
            className="text-[12.5px] font-semibold text-[#c0392b] underline">
            remove
          </button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------- new item type (DEC-ITM-017) */

/**
 * "+ New type" — the owner's model (20 Aug): a new type is either ITS OWN KIND (two
 * plain questions decide how the system treats it) or it WORKS LIKE an existing one.
 * Either way the answer is stored as one of the five rule-behaviours (DEC-ITM-017),
 * because that is what the stock, cost and recipe rules read.
 */
export function TypeKindFields({
  kind, setKind, counted, setCounted, recipe, setRecipe, behaviour, setBehaviour,
}: {
  kind: "own" | "like"; setKind: (k: "own" | "like") => void;
  counted: boolean; setCounted: (v: boolean) => void;
  recipe: boolean; setRecipe: (v: boolean) => void;
  behaviour: ItemType; setBehaviour: (b: ItemType) => void;
}) {
  return (
    <Field label="What kind is it?" required>
      <div className="inline-flex rounded-full overflow-hidden border-2 mb-3" style={{ borderColor: ACCENT }}>
        {([
          { k: "own" as const, label: "Its own kind" },
          { k: "like" as const, label: "Works like an existing type" },
        ]).map((o, i) => (
          <button key={o.k} type="button" onClick={() => setKind(o.k)}
            className="text-[12.5px] font-semibold px-4 py-1.5"
            style={{
              background: kind === o.k ? ACCENT : "#fff",
              color: kind === o.k ? "#fff" : ACCENT,
              borderLeft: i ? "1px solid #e2d2ec" : undefined,
            }}>
            {o.label}
          </button>
        ))}
      </div>

      {kind === "own" ? (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2.5 text-[13px] text-body cursor-pointer">
            <input type="checkbox" checked={counted} onChange={(e) => setCounted(e.target.checked)}
              className="w-4 h-4" style={{ accentColor: ACCENT }} />
            Counted in stock — it sits on a shelf and runs out
          </label>
          <label className={"flex items-center gap-2.5 text-[13px] cursor-pointer " + (counted ? "text-body" : "text-body-soft")}>
            <input type="checkbox" checked={counted && recipe} disabled={!counted}
              onChange={(e) => setRecipe(e.target.checked)}
              className="w-4 h-4" style={{ accentColor: ACCENT }} />
            Built from a recipe — assembled out of other items
          </label>
        </div>
      ) : (
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(ITEM_TYPE_META) as ItemType[]).map((t) => {
            const m = ITEM_TYPE_META[t];
            const on = behaviour === t;
            return (
              <button key={t} type="button" onClick={() => setBehaviour(t)} title={m.blurb}
                className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] border-2"
                style={on
                  ? { background: m.colour, borderColor: m.colour, color: "#fff" }
                  : { background: "#fff", borderColor: "#e8dcf0", color: m.colour }}>
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </Field>
  );
}

/** "its own kind" answers → the rule-behaviour the server stores */
export function deriveBehaviour(counted: boolean, recipe: boolean): ItemType {
  if (!counted) return "SERVICE";
  return recipe ? "FINISHED" : "RAW";
}

function NewTypeButton({
  existing, onCreate,
}: {
  existing: ApiItemTypeRow[];
  onCreate: (name: string, behaviour: ItemType, colour: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"own" | "like">("own");
  const [counted, setCounted] = useState(true);
  const [recipe, setRecipe] = useState(false);
  const [behaviour, setBehaviour] = useState<ItemType>("RAW");
  const [busy, setBusy] = useState(false);

  const dup = existing.some((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());
  const finalBehaviour = kind === "own" ? deriveBehaviour(counted, recipe) : behaviour;

  if (!open) {
    return (
      <button type="button"
        onClick={() => { setName(""); setKind("own"); setCounted(true); setRecipe(false); setBehaviour("RAW"); setOpen(true); }}
        className="text-[13px] font-semibold px-3.5 py-2 rounded-[10px] border-2 border-dashed inline-flex items-center gap-1.5"
        style={{ borderColor: "#d9c7e6", color: ACCENT }}>
        <Icon name="plus" size={13} /> New type
      </button>
    );
  }

  return (
    <Modal title="New item type" onClose={() => setOpen(false)}
      canSave={!!name.trim() && !dup} busy={busy} saveLabel="Add type"
      onSave={async () => {
        setBusy(true);
        await onCreate(name.trim(), finalBehaviour, ITEM_TYPE_META[finalBehaviour].colour);
        setBusy(false); setOpen(false);
      }}>
      <Field label="Name" required>
        <input className="ipt w-full" autoFocus placeholder="Dry Flower, Imported Chocolate…"
          value={name} onChange={(e) => setName(e.target.value)} />
        {name.trim() && dup && (
          <p className="text-[12px] text-[#c0392b] m-0 mt-1">&ldquo;{name.trim()}&rdquo; already exists.</p>
        )}
      </Field>
      <TypeKindFields
        kind={kind} setKind={setKind}
        counted={counted} setCounted={setCounted}
        recipe={recipe} setRecipe={setRecipe}
        behaviour={behaviour} setBehaviour={setBehaviour}
      />
    </Modal>
  );
}


/* ============================================================ where-used (ITM-R07) */

/**
 * "Change this rose and 7 recipes move." Shown on the item itself, because the moment
 * someone edits a cost is exactly the moment they need to know what else it touches —
 * and it is the same list that blocks a delete.
 */
function UsagePanel({ itemId, item }: { itemId: string; item: ApiItem }) {
  const [products, setProducts] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [recipes, setRecipes] = useState<{ id: string; name: string; sku: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    itemUsage(itemId)
      .then((u) => { if (alive) { setProducts(u.products); setRecipes(u.usedInRecipes); } })
      .catch(() => { /* panel just stays empty */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [itemId]);

  const total = products.length + recipes.length;

  return (
    <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
      <div className="px-4 py-2.5 border-b border-lavender-deep bg-lavender/30 flex items-center gap-2">
        <span className="text-[12.5px] font-semibold text-purple">Where it is used</span>
        {total > 0 && <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-white text-purple">{total}</span>}
      </div>
      <div className="p-4 text-[12.5px]">
        {loading && <span className="text-body-soft">Checking…</span>}

        {!loading && total === 0 && (
          <>
            <span className="text-body">Nothing points at this item yet.</span>
            <p className="text-[13px] text-body-soft m-0 mt-1.5">
              {item.itemType === "FINISHED"
                ? "Link a product to it, or add it to a recipe."
                : "Add it to a recipe to start using it."}
            </p>
          </>
        )}

        {!loading && recipes.length > 0 && (
          <div className="mb-3">
            <div className="th mb-1.5">
              Ingredient in {recipes.length} recipe{recipes.length === 1 ? "" : "s"}
            </div>
            <div className="flex flex-col gap-1">
              {recipes.map((r) => (
                <Link key={r.id} href={`/items/${r.id}`} className="text-purple hover:text-orchid truncate">{r.name}</Link>
              ))}
            </div>
          </div>
        )}

        {!loading && products.length > 0 && (
          <div>
            <div className="th mb-1.5">
              Behind {products.length} product{products.length === 1 ? "" : "s"}
            </div>
            <div className="flex flex-col gap-1">
              {products.map((p) => (
                <span key={p.id} className="text-body truncate">{p.name}</span>
              ))}
            </div>
          </div>
        )}

        {!loading && total > 0 && (
          <p className="text-[13px] text-body-soft m-0 mt-3 pt-3 border-t border-lavender-deep">
            Changing the cost here moves every recipe above. And while this list is not empty the item cannot be
            deleted — nothing breaks silently.
          </p>
        )}
      </div>
    </div>
  );
}

/* ============================================================ history */

/** who changed what, newest first — the human-readable half of "audit everywhere" */
function HistoryPanel({ itemId }: { itemId: string }) {
  const [events, setEvents] = useState<ApiItemEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let alive = true;
    getItemTimeline(itemId)
      .then((e) => { if (alive) setEvents(e); })
      .catch(() => { /* panel just stays empty */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [itemId]);

  const shown = all ? events : events.slice(0, 6);

  return (
    <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
      <div className="px-4 py-2.5 border-b border-lavender-deep bg-lavender/30 text-[12.5px] font-semibold text-purple">
        History
      </div>
      <div className="p-4 text-[12.5px]">
        {loading && <span className="text-body-soft">Loading…</span>}
        {!loading && events.length === 0 && <span className="text-body-soft">Nothing recorded yet.</span>}

        <div className="flex flex-col gap-2.5">
          {shown.map((e) => (
            <div key={e.id} className="grid grid-cols-[8px_minmax(0,1fr)] gap-2.5">
              <span className="w-[8px] h-[8px] rounded-full mt-1.5" style={{ background: ACCENT }} />
              <div className="min-w-0">
                <div className="text-body leading-snug">{e.label}</div>
                <div className="text-[13px] text-body-soft">
                  {e.actorName} · {new Date(e.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {events.length > 6 && (
          <button onClick={() => setAll((v) => !v)} className="text-[12px] underline text-purple mt-3">
            {all ? "show less" : `show all ${events.length}`}
          </button>
        )}
      </div>
    </div>
  );
}


/* ============================================================ inline creation
   Biznify's "Select or Create" lesson, applied to the label master: you should never
   have to leave a half-filled form to go and set something up elsewhere.
   ========================================================================== */

/** shown when NO label types exist yet — one button, and you are moving again */
function AttrStarter({ onDone, onErr }: { onDone: () => Promise<void> | void; onErr: (m: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function one(name: string) {
    setBusy(name);
    try { await createItemAttribute(name); await onDone(); }
    catch (e) { onErr(msg(e, "Could not create that.")); }
    finally { setBusy(null); }
  }

  return (
    <div className="rounded-[12px] border px-4 py-3.5" style={{ background: "#f7f1fb", borderColor: "#efe4f7" }}>
      <div className="text-[13px] font-semibold mb-1" style={{ color: "#470066" }}>No labels yet</div>
      <p className="text-[13px] text-body m-0 mb-2.5 leading-relaxed">
        Labels are how you tell a red rose from a white one. Create them right here — you do not have to leave this page.
      </p>
      <div className="flex gap-1.5 flex-wrap">
        {["Colour", "Size"].map((n) => (
          <button key={n} type="button" onClick={() => one(n)} disabled={!!busy}
            className="text-[12.5px] font-medium px-3 py-1.5 rounded-[9px] border bg-white disabled:opacity-60"
            style={{ borderColor: "#efe4f7", color: ACCENT }}>
            {busy === n ? "…" : `just ${n}`}
          </button>
        ))}
      </div>
    </div>
  );
}

const QUICK_SWATCHES = ["#c62828", "#fafafa", "#f9c623", "#e87ba4", "#ef7028", "#7a2ea8", "#2563a8", "#0e8f74"];

/** a "+" chip that turns into a small "name + optional colour" form, in place */
function InlineValueAdd({
  attrId, attrName, onDone, onErr,
}: { attrId: string; attrName: string; onDone: () => Promise<void> | void; onErr: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [swatch, setSwatch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isColour = /colou?r/i.test(attrName);

  async function add() {
    const v = label.trim();
    if (!v) return;
    setBusy(true);
    try {
      await addItemAttrValue(attrId, { label: v, swatch });
      setLabel(""); setSwatch(null); setOpen(false);
      await onDone();
    } catch (e) { onErr(msg(e, "Could not add that.")); }
    finally { setBusy(false); }
  }

  /*  The old "+ new" was a 12px dashed chip hiding at the end of a row of swatches
      (owner, 20 Aug: "system ta sundor na"). A door you have to hunt for is not a
      door, so it is a proper labelled button now, and it opens a proper little
      form — name, a swatch grid you can actually hit, a hex box, Add.  */
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="text-[12.5px] font-semibold px-3.5 py-2 rounded-[10px] border-2 border-dashed inline-flex items-center gap-1.5"
        style={{ borderColor: "#d9c7e6", color: ACCENT }}>
        <Icon name="plus" size={13} /> New {attrName.toLowerCase()}
      </button>
    );
  }

  return (
    <div className="w-full rounded-[14px] border-2 p-3.5 mt-1" style={{ borderColor: "#d9c7e6", background: "#faf6fd" }}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-[12.5px] font-bold text-purple">New {attrName.toLowerCase()}</span>
        <button type="button" onClick={() => setOpen(false)}
          className="ml-auto text-body-soft hover:text-purple text-[18px] leading-none px-1">×</button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input autoFocus className="ipt" style={{ minHeight: 38, width: 190 }}
          placeholder={isColour ? "e.g. Baby Pink" : `e.g. ${attrName === "Size" ? "Large" : "New " + attrName.toLowerCase()}`}
          value={label} onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === "Escape") setOpen(false); }} />

        {isColour && (
          <>
            <span className="flex items-center gap-1.5 flex-wrap">
              {QUICK_SWATCHES.map((c) => (
                <button key={c} type="button" onClick={() => setSwatch(swatch === c ? null : c)} title={c}
                  className="w-[26px] h-[26px] rounded-full border-2 shrink-0 transition-transform hover:scale-110"
                  style={{ background: c, borderColor: swatch === c ? "#2c0f3d" : "#e3d7ec" }} />
              ))}
            </span>
            <input className="ipt font-mono" style={{ minHeight: 38, width: 110 }}
              placeholder="#e0203c" value={swatch ?? ""}
              onChange={(e) => setSwatch(e.target.value.trim() || null)} />
          </>
        )}

        <button type="button" onClick={add} disabled={busy || !label.trim()}
          className="text-white text-[13px] font-semibold px-4 py-2.5 rounded-[10px] disabled:opacity-50"
          style={{ background: ACCENT }}>
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}


/* ---------------------------------------------------------------- variant photo */

/**
 * A tile in the variant list. It shows the GROUP photo until this variant is given one
 * of its own, and marks the difference with a purple ring — so you can see at a glance
 * which ones you have already handled, without reading anything.
 */
export function VariantPhoto({
  name, url, own, onPick, onErr,
}: {
  name: string;
  url: string | null;
  own: boolean;
  onPick: (u: string | null) => void;
  onErr: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function take(file?: File | null) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { onErr("That file is not an image."); return; }
    setBusy(true);
    try { onPick(await uploadItemImage(file, "items")); }
    catch (e) { onErr(msg(e, "Could not read that image.")); }
    finally { setBusy(false); }
  }

  return (
    <span className="relative shrink-0">
      <label
        className="w-[44px] h-[44px] rounded-[11px] overflow-hidden cursor-pointer grid place-items-center text-[10.5px] font-bold"
        style={{
          background: url ? "#fff" : "#f0e8f6",
          color: "#a08fb0",
          boxShadow: own ? `0 0 0 2px #fff, 0 0 0 3px ${ACCENT}` : "inset 0 0 0 1px #e2d2ec",
        }}
        title={own ? "Has its own photo — click to replace" : "Click to give this one its own photo"}
      >
        {url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={url} alt="" className="w-full h-full object-cover" style={{ opacity: own ? 1 : 0.55 }} />
          : (busy ? "…" : <Icon name="photo" size={16} />)}
        <input type="file" accept="image/*" className="hidden"
          onChange={(e) => { take(e.target.files?.[0]); e.currentTarget.value = ""; }} />
      </label>
      {own ? (
        <button type="button" onClick={() => onPick(null)} title="Use the group photo instead"
          className="absolute -top-1.5 -right-1.5 w-[17px] h-[17px] rounded-full text-white text-[11px] leading-none grid place-items-center"
          style={{ background: ACCENT }}>×</button>
      ) : (
        /* a visible door — the owner could not tell the tile was clickable (20 Aug) */
        <span className="absolute -bottom-1 -right-1 w-[17px] h-[17px] rounded-full grid place-items-center text-white pointer-events-none"
          style={{ background: ACCENT }}>
          <Icon name="plus" size={10} />
        </span>
      )}
    </span>
  );
}
