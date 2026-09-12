"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { Said, useSay } from "./Said";
import {
  listProducts,
  deleteProduct,
  updateProduct,
  createProduct,
  getProduct,
  restoreProduct,
  storefrontUrl,
  formatTaka,
  type ApiProduct,
} from "../_data/api";
/*
  All products — the working catalog table.
  Live from :4000 only — the demo-catalog fallback was removed on the owner's
  order (6 Aug 2026): fake rows on an empty catalog read as "delete is broken".
  Columns earn their place: SKU (staff code), margin (the number that matters),
  units sold, zone, inline publish toggle, and "View on site".
*/

type SortKey = "newest" | "name" | "price" | "margin" | "stock" | "sold";
const marginOf = (p: ApiProduct) => p.offerPricePaisa - p.costPaisa;
const marginPctOf = (p: ApiProduct) =>
  p.offerPricePaisa > 0 ? Math.round((marginOf(p) / p.offerPricePaisa) * 100) : 0;
const statusOf = (p: ApiProduct) =>
  !p.isPublished ? "Draft" : p.stockQty <= 0 ? "oos" : "Active";

function Kpi({ n, l, hue, icon }: { n: string; l: string; hue: string; icon: string }) {
  const HUE: Record<string, string> = {
    purple: "from-[var(--a-solid)] to-[var(--a-solid)]",
    green: "from-[var(--f-ok)] to-[var(--f-ok)]",
    red: "from-[var(--f-bad)] to-[var(--f-bad)]",
    blue: "from-[var(--f-info)] to-[var(--f-info)]",
  };
  return (
    <div className={`rounded-[16px] px-4 py-4 text-white bg-gradient-to-br ${HUE[hue]} shadow-lift relative overflow-hidden`}>
      <span className="absolute -right-4 -bottom-5 opacity-15">
        <Icon name={icon} size={78} />
      </span>
      <span className="opacity-90 relative"><Icon name={icon} size={17} /></span>
      <div className="text-[27px] font-display font-medium leading-none mt-2.5 relative">{n}</div>
      <div className="text-[12px] opacity-90 mt-1.5 relative">{l}</div>
    </div>
  );
}

export default function ProductListView() {
  const say = useSay();
  const [all, setAll] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  /*  6 Aug 2026 — demo fallback REMOVED, owner's order. He emptied the
      catalog, and this screen answered by inventing sixteen fake products
      with a small badge nobody reads — which looks exactly like "delete
      does not work". An empty catalog is a real answer and shows as empty;
      an unreachable API is an error and says so. Fake data is never an
      acceptable third state on a screen that runs a real business.  */
  const [apiDown, setApiDown] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [stat, setStat] = useState("");
  const [zone, setZone] = useState("");
  /*  ৫ আগস্ট, মালিক: "product jeta sorboses upload hobe setai prthome" —
      default ছিল sold-এ সাজানো, নতুন পণ্য (0 বিক্রি) মাঝে হারিয়ে যেত।  */
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "newest", dir: -1 });
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<string | null>(null);
  /*  A double click used to make two copies: the first call had not come back
      yet, so nothing was disabled. One at a time, and the row says so.  */
  const [dupBusy, setDupBusy] = useState<string | null>(null);
  /*  ⚠️ THE DELETED ROW JUST VANISHED (12 Sep 2026). The delete is soft — the
      product is sitting in Trash — but this screen offered no way back and no
      way in, so a mis-click read as "gone forever". The row's name is kept here
      until the next action, and one press puts it back.  */
  const [undo, setUndo] = useState<{ id: string; name: string } | null>(null);
  /** which products a bulk action could not save, and the API's reason */
  const [bulkFails, setBulkFails] = useState<{ name: string; why: string }[]>([]);

  async function load() {
    setLoading(true);
    try {
      const res = await listProducts();
      setAll(res.items);
      setApiDown(false);
    } catch {
      setAll([]);
      setApiDown(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const catOptions = useMemo(() => {
    const s = new Set<string>();
    all.forEach((p) => p.category?.name && s.add(p.category.name));
    return [...s].sort();
  }, [all]);

  const filtered = useMemo(() => {
    const rows = all.filter((p) => {
      const term = q.toLowerCase();
      const okQ =
        !q ||
        p.name.toLowerCase().includes(term) ||
        (p.sku ?? "").toLowerCase().includes(term) ||
        p.slug.toLowerCase().includes(term);
      const okC = !cat || p.category?.name === cat;
      const st = statusOf(p);
      const okS = !stat || st === stat;
      const okZ = !zone || p.zone === zone;
      return okQ && okC && okS && okZ;
    });
    const val = (p: ApiProduct) =>
      sort.k === "newest"
        ? Date.parse(p.createdAt ?? "") || 0
        : sort.k === "name"
          ? p.name.toLowerCase()
          : sort.k === "price"
            ? p.offerPricePaisa
            : sort.k === "margin"
              ? marginPctOf(p)
              : sort.k === "stock"
                ? p.stockQty
                : p.salesCount;
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x === y) return 0;
      return (x > y ? 1 : -1) * sort.dir;
    });
  }, [all, q, cat, stat, zone, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => {
    setPage(1);
  }, [q, cat, stat, zone, pageSize]);

  const stats = useMemo(() => {
    let active = 0, oos = 0, draft = 0;
    for (const p of all) {
      const s = statusOf(p);
      if (s === "Active") active++;
      else if (s === "oos") oos++;
      else draft++;
    }
    return { total: all.length, active, oos, draft };
  }, [all]);

  /** returns the API's refusal, or null when it saved — the bulk bar needs to
      know WHICH rows were refused, not just that something was.
      ⚠️ IT DOES NOT SPEAK (12 Sep 2026). It used to call the banner on every
      refusal as well as returning it, and the banner is one slot: a bulk
      publish over twenty rows wrote it twenty times, each one wiping the last,
      and then the summary landed on top of all of them. Whoever calls this
      decides what is said — the single-row toggle says it, and the bulk bar
      lists every refusal by name underneath its own one-line summary. */
  async function patch(p: ApiProduct, body: Record<string, unknown>): Promise<string | null> {
    try {
      await updateProduct(p.id, body);
    } catch (e) {
      return e instanceof Error ? e.message : `Could not save "${p.name}".`;
    }
    setAll((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...(body as Partial<ApiProduct>) } : x)));
    return null;
  }

  /*
    ⚠️ DUPLICATE USED TO PRODUCE AN EMPTY SHELL (12 Sep 2026).

    It copied nine scalars off the LIST row and called that a duplicate. The
    list endpoint does not carry a product's photos, variants, spec rows, FAQ
    or trust badges at all (see `getProductBySlug` — the editor learned this on
    1 Aug), and the nine it did copy left out the discount and its window, the
    delivery types, tags, brand, unit, Item/supplier, the advance rules,
    personalisation, the customise box, SEO, lead time and the sold-out mode.
    What came back was a name and a price: everything that makes the copy worth
    making had to be typed again.

    Two smaller faults rode along. `categoryId: p.category?.id` was sent with no
    guard, so a row with no category sent `undefined` and the create died on the
    foreign key with a message about nothing the owner could see. And there was
    no busy guard, so a second click while the first call was in flight made a
    second copy.

    So: read the whole product first, then send what the editor would send.
  */
  async function duplicate(row: ApiProduct) {
    if (dupBusy) return;
    setDupBusy(row.id);
    setUndo(null);
    say.clear();
    try {
      /*  The list row is only an id — the product itself has to be read.  */
      const p = await getProduct(row.id);
      if (!p.category?.id) {
        say.bad(
          `"${p.name}" has no category, and a product cannot be created without one. Give it a category first, then duplicate it.`,
        );
        return;
      }
      const tag = Math.floor(Math.random() * 900 + 100);
      /*  Slug and SKU are the two things that must NOT be copied — both are
          unique, and the API refuses the create outright if either is taken.
          The copy is born a draft whatever the original was: it still needs a
          photograph of its own and a price check before anyone may buy it.  */
      const dto: Record<string, unknown> = {
        slug: `${p.slug}-copy-${tag}`,
        sku: p.sku ? `${p.sku}-C${tag}` : null,
        name: `${p.name} (copy)`,
        categoryId: p.category.id,
        brandId: p.brandId ?? null,
        unitId: p.unitId ?? null,
        tagIds: (p.tags ?? []).map((t) => t.id),
        productType: p.productType,
        zone: p.zone,
        natureType: p.natureType,
        natureLabel: p.natureLabel ?? null,
        shortDesc: p.shortDesc ?? null,
        typeText: p.typeText ?? null,
        videoId: p.videoId ?? null,
        nationwideMsg: p.nationwideMsg ?? null,
        costPaisa: p.costPaisa,
        sellingPricePaisa: p.sellingPricePaisa,
        /*  offerPricePaisa is DERIVED by the API — the discount and its window
            are what actually carry the offer across.

            ⚠️ AN OFFER THAT IS ALREADY OVER DOES NOT COME WITH IT (12 Sep
            2026). The copy is deliberately born a draft, days or months after
            the original was made; a sale that ended in August would arrive on
            it dead, showing "Ended 14 Aug" in the editor and nothing on the
            shop. Carrying a window that can never open again is not copying
            an offer, it is copying litter — so the window goes, and the
            discount with it, and the owner sets a live one if he wants one.
            Instants are compared, not date strings (DEC-PRD-042).  */
        ...(p.discountEndsAt && Date.parse(p.discountEndsAt) < Date.now()
          ? {
              discountType: "NONE",
              discountValue: 0,
              discountStartsAt: null,
              discountEndsAt: null,
            }
          : {
              discountType: p.discountType,
              discountValue: p.discountValue,
              discountStartsAt: p.discountStartsAt ?? null,
              discountEndsAt: p.discountEndsAt ?? null,
            }),
        discountOnVariants: p.discountOnVariants,
        variantAxisOrder: p.variantAxisOrder,
        advanceRequired: p.advanceRequired,
        advanceType: p.advanceType ?? undefined,
        advancePercent: p.advancePercent ?? undefined,
        advanceAmountPaisa: p.advanceAmountPaisa ?? undefined,
        stockMode: p.stockMode,
        /*  ⚠️ NOT COPIED (12 Sep 2026). A copy of a bouquet with 12 on hand
            used to claim 12 of its own — twelve arrangements nobody has made,
            sellable the moment the copy is published. A new listing holds
            nothing until somebody counts it in.  */
        stockQty: 0,
        showStock: p.showStock,
        soldOutMode: p.soldOutMode,
        allowOrderAtZero: p.allowOrderAtZero,
        preorderDate: p.preorderDate ?? null,
        leadTimeDays: p.leadTimeDays ?? 0,
        /*  `itemId` IS copied on purpose: two listings drawing on one
            stockroom item is a real pattern (a bouquet sold under two names),
            and the count then comes from Inventory for both — one count, two
            listings, so selling on either draws the same stock down.  */
        itemId: p.itemId ?? null,
        supplierId: p.supplierId ?? null,
        displayQty: p.displayQty ?? null,
        makeMinutes: p.makeMinutes ?? null,
        persoTitle: p.persoTitle ?? null,
        persoText: p.persoText,
        persoTextLabel: p.persoTextLabel ?? null,
        persoTextMax: p.persoTextMax ?? null,
        persoTextHint: p.persoTextHint ?? null,
        persoTextRequired: p.persoTextRequired,
        persoImage: p.persoImage,
        persoImageLabel: p.persoImageLabel ?? null,
        persoImageHint: p.persoImageHint ?? null,
        persoImageRequired: p.persoImageRequired,
        customiseOn: p.customiseOn,
        customiseTitle: p.customiseTitle ?? null,
        customiseSub: p.customiseSub ?? null,
        metaTitle: p.metaTitle ?? null,
        metaDescription: p.metaDescription ?? null,
        ogTitle: p.ogTitle ?? null,
        ogDescription: p.ogDescription ?? null,
        ogImageUrl: p.ogImageUrl ?? null,
        noIndex: p.noIndex,
        /*  DEC-PRD-050 — the two badge MODES, not the computed badges. They
            are the owner's decision about the product ("always a best
            seller"), and a copy that dropped them silently went back to AUTO.  */
        bestSellerMode: p.bestSellerMode ?? "AUTO",
        newArrivalMode: p.newArrivalMode ?? "AUTO",
        /*  D-CAT-01 — the product's own colour, an id from the Variant &
            Option master. It is what "show me the red ones" filters on, so a
            copy without it is invisible to every colour filter.  */
        variantValueId: p.variantValueId ?? null,
        /*  ⚠️ `manualAddOnGroupIds` IS NOT SENT AT ALL when the read did not
            carry the groups (12 Sep 2026). `manualAddOnGroups` is not in the
            detail endpoint's include, so `(p.manualAddOnGroups ?? [])` was
            always `[]` — and an explicit empty array means "this product has
            none", not "I do not know". The copy was born with its pinned
            add-on groups deliberately emptied. Absent leaves the decision to
            the API instead of stating something untrue.  */
        ...(p.manualAddOnGroups
          ? { manualAddOnGroupIds: p.manualAddOnGroups.map((g) => g.id) }
          : {}),
        /*  DEC-DLV-008 — which deliveries it may ride on.  */
        deliveryTypeIds: (p.deliveryTypes ?? []).map((d) => d.typeId),
        supportsExpress: p.supportsExpress,
        supportsSameDay: p.supportsSameDay,
        supportsMidnight: p.supportsMidnight,
        images: (p.images ?? [])
          .filter((i) => /^https?:\/\//i.test(i.url))
          .map((i) => ({ url: i.url })),
        sizes: (p.sizes ?? []).map((z) => ({ label: z.label, sub: z.sub ?? undefined, pricePaisa: z.pricePaisa })),
        specRows: (p.specRows ?? []).map((r) => ({ item: r.item, qty: r.qty })),
        faqs: (p.faqs ?? []).map((f) => ({ question: f.question, answer: f.answer })),
        trustBadges: (p.trustBadges ?? []).map((t) => ({
          icon: t.icon,
          iconUrl: t.iconUrl ?? null,
          label: t.label,
          sub: t.sub ?? undefined,
        })),
        /*  DEC-PRD-045 — a variant is the whole combination, not just its lead
            value, so every value id comes along with it.  */
        variants: (p.variants ?? []).map((v, i) => ({
          variantValueId: v.variantValueId,
          valueIds: (v.values ?? []).map((x) => x.variantValue.id),
          imageUrl: v.imageUrl ?? null,
          stockQty: v.stockQty,
          itemId: v.itemId ?? null,
          pricePaisa: v.pricePaisa ?? null,
          discountType: v.discountType ?? "NONE",
          discountValue: v.discountValue ?? 0,
          sortOrder: i,
          isActive: v.isActive,
        })),
        /*  Never live on creation, whatever the original was.  */
        isPublished: false,
      };
      /*  `upgradeOfProductId` and the variant-group link are deliberately NOT
          copied: both would silently attach the copy to the original's place on
          the storefront — a second upgrade of the same base, or an extra colour
          beside it — which is a business decision, not part of copying a row.  */
      await createProduct(dto);
      await load();
      say.good(`Copied as a draft: "${p.name} (copy)". Open it to give it its own photo and SKU.`);
    } catch (e) {
      say.fromError(e, `Could not duplicate "${row.name}".`);
    } finally {
      setDupBusy(null);
      setMenu(null);
    }
  }

  async function remove(p: ApiProduct) {
    /*  The confirmation names the destination: "delete" in Radian never erases,
        and the owner has to be able to read that before pressing OK.  */
    if (!confirm(`Delete "${p.name}"?\n\nIt is not erased — it moves to Products \u2192 Trash, where it can be restored.`)) return;
    try {
      await deleteProduct(p.id);
    } catch (e) {
      say.fromError(e, `Could not delete "${p.name}".`);
      return;
    }
    setAll((prev) => prev.filter((x) => x.id !== p.id));
    setMenu(null);
    say.clear();
    setUndo({ id: p.id, name: p.name });
  }

  /** put back the product just deleted — the same restore the Trash screen uses */
  async function undoDelete() {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    try {
      await restoreProduct(u.id);
      await load();
      say.good(`"${u.name}" is back in the catalog.`);
    } catch (e) {
      say.fromError(e, `Could not restore "${u.name}" — it is still in Trash.`);
    }
  }

  /*  ⚠️ Publishing is refused for any product without a SKU, without a photo or
      without an offerable delivery type, so on twenty products a refusal is the
      normal case. Every one is attempted, the refusals are listed by name, and
      only the ones that really saved let go of their tick.  */
  async function bulkPublish(v: boolean) {
    const chosen = all.filter((p) => sel.has(p.id));
    if (!chosen.length) return;
    if (!confirm(`${v ? "Publish" : "Unpublish"} ${chosen.length} product(s)?`)) return;
    say.clear();
    setUndo(null);
    const bad: { name: string; why: string }[] = [];
    const okIds: string[] = [];
    for (const p of chosen) {
      const why = await patch(p, { isPublished: v });
      if (why) bad.push({ name: p.name, why });
      else okIds.push(p.id);
    }
    setSel((prev) => {
      const n = new Set(prev);
      okIds.forEach((id) => n.delete(id));
      return n;
    });
    setBulkFails(bad);
    if (bad.length)
      say.bad(`${bad.length} of ${chosen.length} could not be saved — they stay selected, listed below.`);
    else say.good(`${v ? "Published" : "Unpublished"} ${okIds.length} product(s).`);
  }

  /*  6 Aug 2026 — the bulk bar had Publish/Unpublish but no Delete, so
      clearing junk meant one row at a time through each row's own button.
      Same soft delete as the row button: everything lands in Trash,
      recoverable. Failures are counted and said out loud, not swallowed.  */
  async function bulkDelete() {
    const chosen = all.filter((p) => sel.has(p.id));
    if (!chosen.length) return;
    if (!confirm(`Delete ${chosen.length} product(s)?\n\nThey are not erased — they move to Products \u2192 Trash, where they can be restored.`)) return;
    const bad: { name: string; why: string }[] = [];
    const okIds = new Set<string>();
    for (const p of chosen) {
      try {
        await deleteProduct(p.id);
        okIds.add(p.id);
      } catch (e) {
        bad.push({ name: p.name, why: e instanceof Error ? e.message : "The API refused it." });
      }
    }
    /*  Only the ones that were really deleted leave the table and the
        selection — the rest are still there and still ticked.  */
    setAll((prev) => prev.filter((x) => !okIds.has(x.id)));
    setSel((prev) => {
      const n = new Set(prev);
      okIds.forEach((id) => n.delete(id));
      return n;
    });
    setBulkFails(bad);
    if (bad.length) say.bad(`${bad.length} of ${chosen.length} could not be deleted — listed below.`);
    else say.good(`${okIds.size} product(s) moved to Trash.`);
    await load();
  }

  function exportCsv() {
    const head = ["SKU", "Name", "Slug", "Category", "Cost", "Selling", "Offer", "Margin", "Margin %", "Stock", "Sold", "Zone", "Status"];
    const lines = filtered.map((p) =>
      [
        p.sku ?? "",
        p.name,
        p.slug,
        p.category?.name ?? "",
        p.costPaisa / 100,
        p.sellingPricePaisa / 100,
        p.offerPricePaisa / 100,
        marginOf(p) / 100,
        marginPctOf(p),
        p.stockQty,
        p.salesCount,
        p.zone,
        statusOf(p) === "oos" ? "Out of stock" : statusOf(p),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "radian-products.csv";
    a.click();
  }

  const Th = ({ k, children, right }: { k?: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th
      onClick={() => k && setSort((s) => ({ k, dir: s.k === k && s.dir === -1 ? 1 : -1 }))}
      className={`${right ? "text-right" : "text-left"} font-medium px-3 py-3 ${k ? "cursor-pointer select-none hover:text-purple" : ""}`}
    >
      {children}
      {k && sort.k === k && <span className="ml-1 text-orchid">{sort.dir === -1 ? "▾" : "▴"}</span>}
    </th>
  );

  return (
    <div className="px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full">
      <Said say={say} />
      {undo && (
        <div className="flex items-center gap-3 flex-wrap rounded-[12px] border border-lavender-deep bg-lavender/60 px-4 py-3 mb-4 text-[13px] text-body">
          <Icon name="trash" size={16} />
          <span className="flex-1">
            <b className="text-purple">{undo.name}</b> moved to Trash.
          </span>
          <button onClick={undoDelete} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] bg-purple text-white">
            Undo
          </button>
          <Link href="/products/trash" className="text-[12.5px] font-semibold text-orchid hover:text-purple">
            Open Trash
          </Link>
          <button onClick={() => setUndo(null)} aria-label="Dismiss" className="font-bold opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      )}
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
              <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
              Product Management · catalog
            </div>
            {apiDown && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] bg-[var(--s-bad)] text-[var(--t-bad)] border border-[var(--l-bad)] px-2.5 py-1 rounded-full">
                <Icon name="bolt" size={12} /> API unreachable
              </span>
            )}
          </div>
          <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">All Products</h1>
        </div>
        <div className="flex gap-2.5">
          {/*  The way back in. Deletes from this screen are soft, and until now
               the only door to the bin was a sidebar entry two levels down. */}
          <Link href="/products/trash" className="bg-white border border-lavender-deep text-purple hover:border-orchid text-[13.5px] font-medium px-4 py-2.5 rounded-[12px] inline-flex items-center gap-2">
            <Icon name="trash" size={16} /> Trash
          </Link>
          <button onClick={exportCsv} className="bg-white border border-lavender-deep text-purple hover:border-orchid text-[13.5px] font-medium px-4 py-2.5 rounded-[12px] inline-flex items-center gap-2">
            <Icon name="download" size={16} /> Export CSV
          </button>
          <Link href="/products/new" className="bg-purple hover:bg-purple-deep text-white text-[14px] font-medium px-5 py-3 rounded-[12px] inline-flex items-center gap-2 shadow-soft">
            <Icon name="plus" size={18} /> Add product
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3 mb-5">
        <Kpi n={loading ? "…" : String(stats.total)} l="Total products" hue="purple" icon="box" />
        <Kpi n={String(stats.active)} l="Active" hue="green" icon="check" />
        <Kpi n={String(stats.oos)} l="Out of stock" hue="red" icon="bolt" />
        <Kpi n={String(stats.draft)} l="Drafts" hue="blue" icon="edit" />
      </div>

      {/* toolbar */}
      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <div className="relative max-w-[300px] w-full">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft"><Icon name="search" size={18} /></span>
          <input className="ipt ipt-icon h-[44px]" placeholder="Search name, SKU or slug…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="ipt max-w-[185px] h-[44px]" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {catOptions.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="ipt max-w-[155px] h-[44px]" value={stat} onChange={(e) => setStat(e.target.value)}>
          <option value="">All status</option>
          <option value="Active">Active</option>
          <option value="Draft">Draft</option>
          <option value="oos">Out of stock</option>
        </select>
        <select className="ipt max-w-[150px] h-[44px]" value={zone} onChange={(e) => setZone(e.target.value)}>
          <option value="">All zones</option>
          <option value="DHAKA">Inside Dhaka</option>
          <option value="NATIONWIDE">Nationwide</option>
        </select>
        {(q || cat || stat || zone) && (
          <button onClick={() => { setQ(""); setCat(""); setStat(""); setZone(""); }} className="text-[12.5px] font-medium text-orchid hover:text-purple">Clear</button>
        )}
        <span className="text-[13px] text-body-soft ml-auto">
          {loading ? "loading…" : `${filtered.length} product${filtered.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* bulk bar */}
      {sel.size > 0 && (
        <div className="bg-orchid-soft border border-orchid-mid rounded-[12px] px-4 py-2.5 mb-3 flex items-center gap-3 flex-wrap">
          <b className="text-[13px] text-purple">{sel.size} selected</b>
          <button onClick={() => bulkPublish(true)} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] bg-purple text-white">Publish</button>
          <button onClick={() => bulkPublish(false)} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] bg-white border border-lavender-deep text-purple">Unpublish</button>
          <button onClick={() => bulkDelete()} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] bg-white border border-[var(--l-bad)] text-[var(--t-bad)] hover:bg-[var(--s-bad)]">Delete</button>
          <button onClick={() => setSel(new Set())} className="text-[12.5px] font-medium text-orchid ml-auto">Clear</button>
        </div>
      )}

      {bulkFails.length > 0 && (
        <div className="rounded-[12px] border border-[var(--l-bad)] bg-[var(--s-bad)] px-4 py-3 mb-3">
          <div className="flex items-center justify-between gap-3">
            <b className="text-[12.5px] text-[var(--t-bad)]">
              {bulkFails.length} not saved — nothing was changed on these
            </b>
            <button onClick={() => setBulkFails([])} className="text-[12px] font-semibold underline text-[var(--t-bad)]">
              Dismiss
            </button>
          </div>
          <ul className="mt-2 mb-0 pl-4 flex flex-col gap-1">
            {bulkFails.map((f, i) => (
              <li key={i} className="text-[12.5px] text-[var(--t-bad)]"><b>{f.name}</b> — {f.why}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-visible">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
              <th className="px-3 py-3 w-[40px]">
                <span
                  onClick={() => setSel(pageRows.every((p) => sel.has(p.id)) ? new Set() : new Set(pageRows.map((p) => p.id)))}
                  className={`w-[18px] h-[18px] rounded-[5px] border-[1.5px] grid place-items-center cursor-pointer mx-auto ${pageRows.length && pageRows.every((p) => sel.has(p.id)) ? "bg-purple border-purple text-white" : "border-lavender-deep bg-white"}`}
                >
                  {!!pageRows.length && pageRows.every((p) => sel.has(p.id)) && <Icon name="check" size={12} />}
                </span>
              </th>
              {/* serial — মালিক: "20 ta product hole maje giye koto number bujbo kivabe" */}
              <Th k="newest">#</Th>
              <Th k="name">Product · SKU</Th>
              <Th k="price">Price</Th>
              <Th k="margin">Margin</Th>
              <Th k="stock">Stock</Th>
              <Th k="sold">Sold</Th>
              <Th>Zone</Th>
              <Th>Live</Th>
              <th className="px-3 py-3 w-[120px]" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((p, rowIdx) => {
              const st = statusOf(p);
              const m = marginOf(p);
              const pct = marginPctOf(p);
              const noCost = p.costPaisa <= 0;
              const on = sel.has(p.id);
              const serial = (page - 1) * pageSize + rowIdx + 1;
              return (
                <tr key={p.id} className={`border-t border-lavender-deep transition-colors ${on ? "bg-orchid-soft/40" : "hover:bg-lavender/70"} ${st === "Draft" ? "opacity-75" : ""}`}>
                  <td className="px-3 py-3">
                    <span
                      onClick={() => setSel((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                      className={`w-[18px] h-[18px] rounded-[5px] border-[1.5px] grid place-items-center cursor-pointer mx-auto ${on ? "bg-purple border-purple text-white" : "border-lavender-deep bg-white"}`}
                    >
                      {on && <Icon name="check" size={12} />}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[12.5px] text-body-soft tabular-nums">{serial}</td>

                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      {/*
                        The product's photo, or the words "No image".

                        ⚠️ IT USED TO BE A GENERATED COLOUR — a different tint
                        per slug, which looked like a picture at thumbnail size.
                        Owner's verdict, 1 Aug: every row looked the same kind
                        of thing, so a product he had just photographed was
                        indistinguishable from seven that had nothing. A pretty
                        placeholder is worse than an empty one; it hides the
                        very gap it is standing in for.
                      */}
                      {/*  PENDING G1 — "is this ours or a supplier's". The
                          answer rides in on the Item (DEC-SUP-004), so the
                          list only has to draw it.  */}
                      {p.images?.[0]?.url ? (
                        <div
                          className="w-[44px] h-[44px] rounded-[10px] shrink-0 shadow-soft bg-white border border-lavender-deep"
                          style={{
                            background: `url(${p.images[0].url}) center/cover no-repeat`,
                          }}
                        />
                      ) : (
                        <div className="w-[44px] h-[44px] rounded-[10px] shrink-0 border border-dashed border-lavender-deep bg-white grid place-items-center text-[8.5px] leading-[1.1] text-body-soft text-center px-1">
                          No image
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-purple leading-snug flex items-center gap-1.5 flex-wrap">
                          {p.name}
                          {p.productType === "CRAFTED" && <span className="text-[10px] bg-orchid-soft text-[var(--t-orchid)] px-2 py-0.5 rounded-full font-semibold">Crafted</span>}
                          {st === "Draft" && <span className="text-[10px] bg-[var(--s-accent)] text-body-soft px-2 py-0.5 rounded-full font-semibold">Draft</span>}
                          {p.isBestSeller && <span className="text-[10px] bg-[var(--s-warn)] text-[var(--t-warn)] px-2 py-0.5 rounded-full font-semibold">Bestseller</span>}
                          {p.item?.supplier && (
                            <span
                              title={`Supplied by ${p.item.supplier.name}`}
                              className="text-[10px] bg-[var(--s-warn)] text-[var(--t-warn)] border border-[var(--l-warn)] px-2 py-0.5 rounded-full font-semibold"
                            >
                              {p.item.supplier.nickname || p.item.supplier.name}
                            </span>
                          )}
                        </div>
                        <div className="text-[13px] text-body-soft">
                          <span className="font-mono font-semibold text-body">{p.sku ?? "no SKU"}</span> · {p.category?.name ?? "—"}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-3">
                    <b className="text-purple">{formatTaka(p.offerPricePaisa)}</b>
                    {p.offerPricePaisa < p.sellingPricePaisa && (
                      <div className="text-[13px] text-body-soft line-through">{formatTaka(p.sellingPricePaisa)}</div>
                    )}
                  </td>

                  <td className={`px-3 py-3 font-semibold ${noCost ? "text-[var(--t-warn)]" : m < 0 ? "text-[var(--t-bad)]" : pct < 20 ? "text-[var(--t-warn)]" : "text-[var(--t-ok)]"}`}>
                    {noCost ? (
                      <span className="text-[11.5px] bg-[var(--s-warn)] px-2 py-1 rounded-full">no cost</span>
                    ) : (
                      <>
                        {formatTaka(m)}
                        <div className="text-[11.5px]">{pct}%</div>
                      </>
                    )}
                  </td>

                  <td className="px-3 py-3">
                    <span className={p.stockQty <= 0 ? "text-[var(--t-bad)] font-semibold" : ""}>{p.stockQty}</span>
                    {p.stockQty <= 0 && <span className="ml-1.5 text-[10px] bg-[var(--s-bad)] text-[var(--t-bad)] px-1.5 py-0.5 rounded-full font-bold">OUT</span>}
                    {p.stockQty > 0 && p.stockQty <= 5 && <span className="ml-1.5 text-[10px] bg-[var(--s-warn)] text-[var(--t-warn)] px-1.5 py-0.5 rounded-full font-bold">LOW</span>}
                  </td>

                  <td className="px-3 py-3 text-body-soft">{p.salesCount}</td>
                  <td className="px-3 py-3 text-body-soft text-[12.5px]">{p.zone === "DHAKA" ? "Dhaka" : "Nationwide"}</td>

                  <td className="px-3 py-3">
                    <button
                      /*  One row, so the refusal is said here — `patch` no
                          longer says it for everybody.  */
                      onClick={() => {
                        void patch(p, { isPublished: !p.isPublished }).then((why) => {
                          if (why) say.bad(why);
                        });
                      }}
                      title={p.isPublished ? "Published — click to hide" : "Draft — click to publish"}
                      className={`w-[38px] h-[22px] rounded-full relative transition-colors ${p.isPublished ? "bg-[var(--s-ok)]" : "bg-[var(--s-accent)]"}`}
                    >
                      <span className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-all ${p.isPublished ? "left-[18px]" : "left-[2px]"}`} />
                    </button>
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex gap-1.5 justify-end items-center relative">
                      <a
                        href={storefrontUrl(p.slug)}
                        target="_blank"
                        rel="noreferrer"
                        title="View on the live site"
                        className="border border-lavender-deep hover:border-orchid hover:text-purple text-body-soft w-[32px] h-[32px] rounded-[9px] grid place-items-center"
                      >
                        <Icon name="eye" size={16} />
                      </a>
                      <Link
                        href={`/products/${p.slug}`}
                        title="Edit"
                        className="border border-lavender-deep hover:border-orchid hover:text-purple text-body-soft w-[32px] h-[32px] rounded-[9px] grid place-items-center"
                      >
                        <Icon name="edit" size={16} />
                      </Link>
                      {/*  6 Aug 2026 — Delete was only inside the ⋯ menu and
                          the owner reported "there is no delete option". A
                          destructive action hidden behind an unlabeled menu
                          is invisible; now it is its own button. Still soft —
                          it goes to Trash, recoverable.  */}
                      <button
                        onClick={() => remove(p)}
                        title="Delete"
                        className="border border-lavender-deep hover:border-[var(--l-bad)] hover:text-[var(--t-bad)] text-body-soft w-[32px] h-[32px] rounded-[9px] grid place-items-center"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                      <button
                        onClick={() => setMenu(menu === p.id ? null : p.id)}
                        title="More"
                        className="border border-lavender-deep hover:border-orchid hover:text-purple text-body-soft w-[32px] h-[32px] rounded-[9px] grid place-items-center"
                      >
                        ⋯
                      </button>
                      {menu === p.id && (
                        <>
                          {/* click anywhere else closes the menu */}
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setMenu(null)}
                          />
                        <div className="absolute right-0 top-[36px] z-20 bg-white border border-lavender-deep rounded-[12px] shadow-lift py-1.5 w-[168px] text-left">
                          <Link href={`/products/${p.slug}/analysis`} className="w-full text-left px-3.5 py-2 text-[13px] hover:bg-lavender text-body flex items-center gap-2">
                            <Icon name="chart" size={15} /> Analysis
                          </Link>
                          <button
                            onClick={() => duplicate(p)}
                            disabled={!!dupBusy}
                            className="w-full text-left px-3.5 py-2 text-[13px] hover:bg-lavender text-body flex items-center gap-2 disabled:opacity-40"
                          >
                            <Icon name="copy" size={15} /> {dupBusy === p.id ? "Copying…" : "Duplicate"}
                          </button>
                          <a href={storefrontUrl(p.slug)} target="_blank" rel="noreferrer" className="w-full text-left px-3.5 py-2 text-[13px] hover:bg-lavender text-body flex items-center gap-2">
                            <Icon name="eye" size={15} /> Open on site
                          </a>
                          <button onClick={() => remove(p)} className="w-full text-left px-3.5 py-2 text-[13px] hover:bg-[var(--s-bad)] text-[var(--t-bad)] flex items-center gap-2">
                            <Icon name="trash" size={15} /> Delete
                          </button>
                        </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-body-soft py-12 border-t border-lavender-deep">
                  {loading ? "loading…" : "No products match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      <div className="flex items-center gap-3 flex-wrap mt-3.5">
        <span className="text-[13px] text-body-soft">Show</span>
        <select className="ipt" style={{ width: 86 }} value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          <option>20</option>
          <option>50</option>
          <option>100</option>
        </select>
        <span className="text-[13px] text-body-soft">per page</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="border border-lavender-deep bg-white text-purple text-[12.5px] font-medium px-3 py-2 rounded-[9px] disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-[13px] text-body-soft">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="border border-lavender-deep bg-white text-purple text-[12.5px] font-medium px-3 py-2 rounded-[9px] disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      <p className="text-body-soft text-[12px] mt-3.5">
        <b>SKU</b> is the short staff code used on phone orders and packing slips.{" "}
        <b>Margin</b> = customer price − cost. The eye icon opens the product on the
        live storefront. Delete hides a product — it is never erased; it waits in{" "}
        <Link href="/products/trash" className="text-orchid hover:underline">Trash</Link>.
      </p>
    </div>
  );
}
