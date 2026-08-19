"use client";

import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "./backdropClose";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import { WRAP, ACCENT, msg, ErrBar, OkBar, DemoBar, ItemThumb, StatusPill } from "./ItemUI";
import {
  loadItemsSafe, updateItem, deleteItem, linkedProductCount, generateItemsFromProducts,
  listInvStock,
  formatTaka, itemStockLabel, ITEM_TYPE_META,
  type ApiItem, type InvStockRow, type ItemType,
} from "../_data/api";

/*
  Master Data · Items — ALL ITEMS.

  Rebuilt against the ERP the owner already uses (sobuj, 21 Jul: "oprojonio jinis fele
  daw... biznify ar all item taw research kore amder ta banaw"). Theirs is:

      [Items | Item Groups]            Sync ⬇ ⚙ [Add Single Item]
      Categories ▾  Available in ▾  Item Type ▾  Brand ▾  Status ▾
      ☐ Serialized ☐ Batched ☐ Saleable ☐ Purchaseable …   [Apply] [Clear]
      Show 25 ▾ entries                                    Search…
      TABLE
      Showing 1 to 25 of 56 entries        Jump to ▾  First ‹ 1 2 3 › Last

  What we took: the filter row, the flag toggles, the page size, the "showing x to y
  of z" footer and paging — a 600-row master is unusable without them.
  What we dropped from OUR old version: the five KPI cards (they are the Overview's
  job) and the two side panels of explanation. This page is a working list now.
  What we do better: filters apply as you click (no Apply button), the colour column
  shows the real swatch, and empty cells read "—" instead of "N/A" sixty times.

  ⚠️ Stock is READ-ONLY and empty by design (DEC-ITM-005) — it comes from Inventory.
*/

// photo · name/code · category · type · brand · colour · size · cost · stock · status · action
const ROW =
  "grid grid-cols-1 md:grid-cols-[46px_minmax(0,1fr)_120px_94px_92px_106px_88px_106px_72px_80px_58px] items-center gap-2";

const TYPES: (ItemType | "ALL")[] = ["ALL", "RAW", "FINISHED", "PACKAGING", "CONSUMABLE", "SERVICE"];
type SortKey = "type" | "name" | "cost" | "category" | "newest";
type Kind = "ALL" | "SINGLE" | "VARIANT";

/* DEC-ITM-020 — a variant is an item the GENERATOR made as part of a family, and the
   only way to know that is that the generator wrote a familyKey on it.

   ⚠️ This used to read `attributeValues.length > 0` and it was wrong (sobuj, 21 Jul:
   "ami single item create krlm but hoye gelo variant"). A single item is SUPPOSED to
   carry labels — "Red Rose" is one item whose colour happens to be red. Labels describe
   an item; they do not say how it was born. */
const isVariant = (i: ApiItem) => !!i.familyKey;
type Flag = "saleable" | "purchasable" | "returnable" | "perishable" | "noCost" | "noPhoto";

const FLAGS: { k: Flag; label: string }[] = [
  { k: "saleable", label: "Saleable" },
  { k: "purchasable", label: "Purchasable" },
  { k: "returnable", label: "Returnable" },
  { k: "perishable", label: "Perishable" },
  { k: "noCost", label: "No cost" },
  { k: "noPhoto", label: "No photo" },
];

/** the colour / size labels sitting on an item */
function labelsOf(i: ApiItem) {
  const vals = i.attributeValues ?? [];
  return {
    colour: vals.find((v) => /colou?r/i.test(v.attribute?.name ?? "")),
    size: vals.find((v) => !/colou?r/i.test(v.attribute?.name ?? "")),
  };
}

export default function ItemListView() {
  const router = useRouter();
  const [items, setItems] = useState<ApiItem[]>([]);
  const [invMap, setInvMap] = useState<Map<string, InvStockRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<ItemType | "ALL">("ALL");
  const [kind, setKind] = useState<Kind>("ALL");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [colour, setColour] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "hidden">("all");
  const [flags, setFlags] = useState<Set<Flag>>(new Set());
  const [sort, setSort] = useState<SortKey>("type");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  async function load() {
    setLoading(true);
    try {
      const r = await loadItemsSafe();
      setItems(r.items);
      setIsDemo(r.isDemo);
      // DEC-ITM-005 addendum, live since 22 Jul night: the Stock column READS
      // Inventory. Fail-soft — no inventory yet → the column keeps its "—".
      try {
        const stock = await listInvStock();
        setInvMap(new Map(stock.map((s) => [s.itemId, s])));
      } catch { setInvMap(null); }
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  /* Overview's "Fix →" links arrive with the filter in the URL (?only=noCost, ?sort=cost).
     Read it once on mount and then leave it alone — the URL sets the STARTING point, it
     does not own the filters, so clicking a chip afterwards is not fought by the address
     bar. Added when the Costs and Recipes boards were removed and Overview had to send
     people to the list instead. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const only = p.get("only");
    if (only && ["saleable", "purchasable", "returnable", "perishable", "noCost", "noPhoto"].includes(only)) {
      setFlags(new Set([only as Flag]));
    }
    const s = p.get("sort");
    if (s && ["type", "name", "cost", "category", "newest"].includes(s)) setSort(s as SortKey);
  }, []);

  // any filter change puts you back on page 1 — otherwise you land on an empty page
  useEffect(() => { setPage(1); }, [query, tab, kind, category, brand, colour, status, flags, pageSize]);

  /* ---------------- filter sources, straight from the loaded rows ---------------- */

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.itemCategory?.name).filter(Boolean) as string[])].sort(),
    [items],
  );
  const brands = useMemo(
    () => [...new Set(items.map((i) => i.brand?.name).filter(Boolean) as string[])].sort(),
    [items],
  );
  const colours = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const i of items) {
      const c = labelsOf(i).colour;
      if (c) m.set(c.label, c.swatch ?? null);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: items.length };
    for (const t of TYPES) if (t !== "ALL") c[t] = items.filter((i) => i.itemType === t).length;
    return c;
  }, [items]);

  /* ---------------- filtering ---------------- */

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = items.filter((i) => {
      if (tab !== "ALL" && i.itemType !== tab) return false;
      if (kind === "SINGLE" && isVariant(i)) return false;
      if (kind === "VARIANT" && !isVariant(i)) return false;
      if (category && i.itemCategory?.name !== category) return false;
      if (brand && i.brand?.name !== brand) return false;
      if (colour && labelsOf(i).colour?.label !== colour) return false;
      if (status === "active" && !i.isActive) return false;
      if (status === "hidden" && i.isActive) return false;
      if (flags.has("saleable") && !i.isSaleable) return false;
      if (flags.has("purchasable") && !i.isPurchasable) return false;
      if (flags.has("returnable") && !i.isReturnable) return false;
      if (flags.has("perishable") && !i.isPerishable) return false;
      if (flags.has("noCost") && i.effectiveCostPaisa > 0) return false;
      if (flags.has("noPhoto") && i.imageUrl) return false;
      if (q) {
        const hay = [
          i.name, i.sku, i.itemCategory?.name ?? "", i.brand?.name ?? "",
          ...(i.attributeValues ?? []).map((v) => v.label),
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const by: Record<SortKey, (a: ApiItem, b: ApiItem) => number> = {
      type: (a, b) => a.itemType.localeCompare(b.itemType) || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      cost: (a, b) => b.effectiveCostPaisa - a.effectiveCostPaisa,
      category: (a, b) =>
        (a.itemCategory?.name ?? "~").localeCompare(b.itemCategory?.name ?? "~") || a.name.localeCompare(b.name),
      newest: (a, b) => b.id.localeCompare(a.id),
    };
    return rows.slice().sort(by[sort]);
  }, [items, tab, kind, query, category, brand, colour, status, flags, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * pageSize, current * pageSize);
  const from = filtered.length === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, filtered.length);

  const anyFilter =
    !!query || tab !== "ALL" || kind !== "ALL" || !!category || !!brand || !!colour || status !== "all" || flags.size > 0;

  /** how many items share each family key — so a variant row can say "1 of 3" */
  const familySize = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) if (i.familyKey) m.set(i.familyKey, (m.get(i.familyKey) ?? 0) + 1);
    return m;
  }, [items]);

  const kindCounts = useMemo(() => ({
    ALL: items.length,
    SINGLE: items.filter((i) => !isVariant(i)).length,
    VARIANT: items.filter(isVariant).length,
  }), [items]);

  function clearAll() {
    setQuery(""); setTab("ALL"); setKind("ALL"); setCategory(""); setBrand(""); setColour("");
    setStatus("all"); setFlags(new Set());
  }
  const toggleFlag = (f: Flag) =>
    setFlags((prev) => { const n = new Set(prev); n.has(f) ? n.delete(f) : n.add(f); return n; });

  /* ---------------- actions ---------------- */

  async function toggleActive(i: ApiItem) {
    setItems((p) => p.map((x) => (x.id === i.id ? { ...x, isActive: !x.isActive } : x)));
    if (isDemo) return;
    try { await updateItem(i.id, { isActive: !i.isActive }); }
    catch (e) { setErr(msg(e, "Could not save.")); await load(); }
  }

  /*
    ITM-R07 — deleting, rewritten 21 Jul.

    The old version used window.confirm() and refused outright whenever a Product pointed
    at the item, which was 71 of the owner's 86 rows. Worse, the refusal looked identical
    to a silent failure: the row stayed, nothing reached the trash, and there was nothing
    to click. Now the block is a DIALOG with the way out in it.
  */
  const [confirming, setConfirming] = useState<{ item: ApiItem; linked: number } | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  async function remove(i: ApiItem) {
    const u = i._count?.usedIn ?? 0;
    if (u) {
      setErr(
        `“${i.name}” is an ingredient in ${u} recipe${u === 1 ? "" : "s"}. ` +
        `Take it out of ${u === 1 ? "that recipe" : "those recipes"} first — removing it here would change their cost without telling anyone.`,
      );
      return;
    }
    setConfirming({ item: i, linked: i._count?.products ?? 0 });
  }

  async function doDelete(detach: boolean) {
    if (!confirming) return;
    const i = confirming.item;
    setDelBusy(true); setErr(null);
    try {
      if (!isDemo) {
        const r = await deleteItem(i.id, detach);
        setOk(
          r.detached
            ? `“${i.name}” moved to the trash — unlinked from ${r.detached} product${r.detached === 1 ? "" : "s"} first.`
            : `“${i.name}” moved to the trash. You can restore it any time.`,
        );
      }
      setItems((p) => p.filter((x) => x.id !== i.id));
      setConfirming(null);
    } catch (e) {
      // the server may still know about links the cached _count missed
      const n = linkedProductCount(e);
      if (n !== null) setConfirming({ item: i, linked: n });
      else { setErr(msg(e, "Could not delete.")); setConfirming(null); await load(); }
    } finally { setDelBusy(false); }
  }

  // house dialog, not window.confirm() (Phase 2 ruling)
  const [genOpen, setGenOpen] = useState(false);

  async function runGenerator() {
    if (isDemo) { setErr("The API is not reachable — the generator writes to the real database."); return; }
    setGenOpen(false);
    setBusy(true); setErr(null); setOk(null);
    try { const r = await generateItemsFromProducts(); setOk(r.message); await load(); }
    catch (e) { setErr(msg(e, "Generator failed.")); }
    finally { setBusy(false); }
  }

  /* ---------------- render ---------------- */

  return (
    <div className={WRAP}>
      {/* header */}
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div>
          <div className="text-[11px] font-bold tracking-[0.1em] uppercase" style={{ color: ACCENT }}>master data · items</div>
          <h1 className="font-display text-[28px] text-purple mt-1 mb-0 leading-tight">All items</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setGenOpen(true)} disabled={busy}
            className="border border-lavender-deep bg-white text-purple text-[13.5px] font-semibold px-4 py-2.5 rounded-[11px] hover:border-orchid inline-flex items-center gap-2 disabled:opacity-50"
            title="Create one item for every product that does not have one yet">
            <Icon name="bolt" size={14} /> From products
          </button>
          <Link href="/items/categories" className="border border-lavender-deep bg-white text-purple text-[13.5px] font-semibold px-4 py-2.5 rounded-[11px] hover:border-orchid">Categories</Link>
          <Link href="/items/new" className="text-white text-[13.5px] font-semibold px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2" style={{ background: ACCENT }}>
            <Icon name="plus" size={15} /> New item
          </Link>
        </div>
      </div>

      {err && <ErrBar text={err} onClose={() => setErr(null)} />}
      {ok && <OkBar text={ok} onClose={() => setOk(null)} />}
      {isDemo && <DemoBar what="a sample Radian shop" onRetry={load} />}

      {/* the generator's confirm — a dialog, not window.confirm() */}
      {genOpen && (
        <div className="fixed inset-0 z-[100] grid place-items-center p-4"
          style={{ background: "rgba(44,15,61,.42)" }}
          {...backdropClose(() => setGenOpen(false))}>
          <div className="bg-white rounded-[18px] shadow-lift w-[460px] max-w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-lavender-deep">
              <div className="text-[15px] font-bold text-purple">Create items from products?</div>
            </div>
            <div className="px-5 py-4">
              <p className="text-[13px] text-body m-0">
                One item is created for every product that does not have one yet. Existing codes
                are carried over — nothing is deleted and no stock is touched.
              </p>
            </div>
            <div className="px-5 py-3.5 flex items-center gap-2 justify-end border-t border-lavender-deep bg-lavender/25">
              <button onClick={() => setGenOpen(false)}
                className="border border-lavender-deep bg-white text-purple text-[13px] font-semibold px-4 py-2.5 rounded-[10px]">
                Cancel
              </button>
              <button onClick={runGenerator}
                className="text-white text-[13px] font-semibold px-5 py-2.5 rounded-[10px]" style={{ background: ACCENT }}>
                Create the items
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ITM-R07 — one dialog, and it always has a way forward in it */}
      {confirming && (
        <div className="fixed inset-0 z-[100] grid place-items-center p-4"
          style={{ background: "rgba(44,15,61,.42)" }}
          {...backdropClose(() => !delBusy && setConfirming(null))}>
          <div className="bg-white rounded-[18px] shadow-lift w-[520px] max-w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center gap-3 border-b border-lavender-deep">
              <ItemThumb item={confirming.item} size={40} />
              <div className="min-w-0">
                <div className="text-[15px] font-bold text-purple truncate">Delete “{confirming.item.name}”?</div>
                <div className="text-[12.5px] font-mono text-body-soft">{confirming.item.sku}</div>
              </div>
            </div>

            <div className="px-5 py-4">
              {confirming.linked > 0 ? (
                <>
                  <div className="rounded-[12px] px-4 py-3 text-[13px] mb-3" style={{ background: "#fbf1e2", color: "#8a5209" }}>
                    <b>{confirming.linked} product{confirming.linked === 1 ? "" : "s"}</b> {confirming.linked === 1 ? "is" : "are"} linked to this item.
                  </div>
                  {/* one sentence, written twice, because stitching "it/them" and
                      "keeps/keep" together inline produced "the product keeps their own
                      name … and simply stop pointing" */}
                  <p className="text-[13px] text-body m-0">
                    {confirming.linked === 1
                      ? "Unlinking does no harm — the product keeps its own name, price and photos, and simply stops pointing at this stockroom row. You can link it again later."
                      : "Unlinking does no harm — the products keep their own names, prices and photos, and simply stop pointing at this stockroom row. You can link them again later."}
                  </p>
                </>
              ) : (
                <p className="text-[13px] text-body m-0">
                  It moves to the trash — hidden, not destroyed. Restore it whenever you like.
                </p>
              )}
            </div>

            <div className="px-5 py-3.5 flex items-center gap-2 justify-end border-t border-lavender-deep bg-lavender/25">
              <button onClick={() => setConfirming(null)} disabled={delBusy}
                className="border border-lavender-deep bg-white text-purple text-[13px] font-semibold px-4 py-2.5 rounded-[10px]">
                Cancel
              </button>
              <button onClick={() => doDelete(confirming.linked > 0)} disabled={delBusy}
                className="text-white text-[13px] font-semibold px-5 py-2.5 rounded-[10px] disabled:opacity-50"
                style={{ background: ACCENT }}>
                {delBusy
                  ? "Working…"
                  : confirming.linked > 0
                    ? `Unlink ${confirming.linked} and delete`
                    : "Move to trash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* overflow-CLIP, not overflow-hidden: `hidden` makes this a scroll container and
          silently kills position:sticky inside it. `clip` rounds the corners the same way
          without creating one — that was why the header would not stay put. */}
      <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft overflow-clip">
        {/* ---- the cards / filters / paging scroll away normally. Only the COLUMN HEAD
             locks (sobuj, 21 Jul: "lock screen start hobe item code column theke, uporer
             baki sob scroll hoye jabe") — see it near the bottom of this card. ---- */}
        <div className="px-4 pt-4 pb-3 border-b border-lavender-deep">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
            {TYPES.map((t) => {
              const on = tab === t;
              const m = t === "ALL" ? null : ITEM_TYPE_META[t];
              const tone = m?.colour ?? ACCENT;
              return (
                <button key={t} onClick={() => setTab(t)}
                  className="rounded-[13px] border-2 px-3 py-2.5 text-left transition-colors"
                  style={on
                    ? { background: tone, borderColor: tone, color: "#fff" }
                    : { background: m?.bg ?? "#f7f1fb", borderColor: "transparent", color: tone }}>
                  <div className="font-display text-[22px] leading-none">{counts[t] ?? 0}</div>
                  <div className="text-[12.5px] font-semibold mt-1 truncate">{t === "ALL" ? "All items" : m!.short}</div>
                </button>
              );
            })}
          </div>

          {/* DEC-ITM-016 — single vs variant, the one split the list had no way to show.
              A single segmented control rather than three loose buttons: the three are one
              choice, so they read better as one object with a sliding selection. */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {/* the capsule sobuj pointed at (their Items | Item Groups switch), in Radian
                purple: one outlined pill, the chosen segment filled solid. */}
            <div className="inline-flex rounded-full overflow-hidden border-2" style={{ borderColor: ACCENT }}>
              {([
                { k: "ALL" as const, label: "All items" },
                { k: "SINGLE" as const, label: "Single" },
                { k: "VARIANT" as const, label: "Variants" },
              ]).map((o, idx) => {
                const on = kind === o.k;
                return (
                  <button key={o.k} onClick={() => setKind(o.k)}
                    className="text-[13.5px] font-semibold px-5 py-2 inline-flex items-center gap-2 transition-colors"
                    style={{
                      background: on ? ACCENT : "#fff",
                      color: on ? "#fff" : ACCENT,
                      borderLeft: idx ? `1px solid ${on ? "rgba(255,255,255,.35)" : "#e2d2ec"}` : undefined,
                    }}>
                    {o.label}
                    <span className="text-[11.5px] font-bold px-1.5 py-[1px] rounded-full"
                      style={on ? { background: "rgba(255,255,255,.22)", color: "#fff" } : { background: "#f2e8f8", color: ACCENT }}>
                      {kindCounts[o.k]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ---- search + dropdown filters ---- */}
        {/* One grid, six equal-ish columns, edge to edge — the row used to stop halfway
            across and leave a dead gap (sobuj: "page ar majei shes, purata fill kre"). */}
        <div className="px-4 py-3 border-b border-lavender-deep grid gap-2 items-center
                        grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]">
          <div className="relative w-full">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-soft pointer-events-none"><Icon name="search" size={15} /></span>
            <input className="ipt ipt-icon w-full" placeholder="Search name or code…"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <select className="ipt w-full" style={{ minHeight: 40 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select className="ipt w-full" style={{ minHeight: 40 }} value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">All brands</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>

          <select className="ipt w-full" style={{ minHeight: 40 }} value={colour} onChange={(e) => setColour(e.target.value)}>
            <option value="">All colours</option>
            {colours.map(([c]) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select className="ipt w-full" style={{ minHeight: 40 }} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
          </select>

          <select className="ipt w-full" style={{ minHeight: 40 }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="type">Sort: by type</option>
            <option value="name">Sort: name A–Z</option>
            <option value="category">Sort: category</option>
            <option value="cost">Sort: most expensive</option>
            <option value="newest">Sort: newest first</option>
          </select>
        </div>

        {/* ---- flag chips ---- */}
        <div className="px-4 py-2.5 border-b border-lavender-deep flex items-center gap-4 flex-wrap bg-lavender/25">
          <span className="th mr-1">Show only</span>
          {/* real tick boxes (sobuj: "only show amn tick box kre daw") — several can be
              on at once, and a checkbox says that out loud where a pill does not. */}
          {FLAGS.map((f) => {
            const on = flags.has(f.k);
            return (
              <label key={f.k} className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={on} onChange={() => toggleFlag(f.k)}
                  className="w-[16px] h-[16px] rounded-[4px] cursor-pointer"
                  style={{ accentColor: ACCENT }} />
                <span className="text-[13px] font-semibold" style={{ color: on ? ACCENT : "#5b4166" }}>{f.label}</span>
              </label>
            );
          })}
          {anyFilter && (
            <button onClick={clearAll} className="text-[12.5px] font-semibold text-[#c0392b] underline ml-1">
              Clear all
            </button>
          )}
          <span className="ml-auto text-[13px] font-semibold text-body">
            {loading ? "Loading…" : `${filtered.length} of ${items.length}`}
          </span>
        </div>

        {/* ---- how many you are looking at. The page NUMBERS live at the foot of the
             table (sobuj, 21 Jul: "numbering ta page ar niche thakbe") — you decide
             which page to go to after you have read the rows, not before. ---- */}
        {filtered.length > 0 && (
          <div className="px-4 py-2.5 border-b border-lavender-deep flex items-center gap-3 flex-wrap">
            <span className="text-[13px] text-body">
              Showing <b className="text-purple">{from}</b>–<b className="text-purple">{to}</b> of{" "}
              <b className="text-purple">{filtered.length}</b>
            </span>
            <label className="text-[13px] text-body-soft inline-flex items-center gap-2">
              Show
              <select className="ipt" style={{ minHeight: 32, width: 74, padding: "2px 8px", fontSize: 13 }}
                value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            {pages > 1 && (
              <span className="ml-auto text-[13px] text-body-soft">
                Page <b className="text-purple">{current}</b> of <b className="text-purple">{pages}</b>
              </span>
            )}
          </div>
        )}

        {/* ---- THE lock line. Everything above scrolls past; this bar rides down the
             page so you never lose which column you are reading. ---- */}
        <div className={ROW + " px-4 py-2.5 th-on-dark hidden md:grid sticky top-0 z-30"}
          style={{ background: ACCENT }}>
          <span /><span>Item / code</span><span>Category</span><span>Type</span><span>Brand</span>
          <span>Colour</span><span>Size</span><span>Cost</span>
          <span title="Live stock from Inventory">Stock</span>
          <span>Status</span><span className="text-right">Action</span>
        </div>

        {/* ---- rows ---- */}
        <div className="divide-y divide-lavender-deep">
          {shown.map((i) => {
            const m = ITEM_TYPE_META[i.itemType];
            const stock = itemStockLabel(i, invMap?.get(i.id) ?? null);
            const { colour: col, size } = labelsOf(i);
            const recipeCount = i._count?.components ?? i.components?.length ?? 0;
            return (
              <div key={i.id} style={{ borderLeft: `4px solid ${i.isActive ? m.colour : "#e5dced"}` }}>
                {/* the WHOLE row opens the item (sobuj, 21 Jul). The two action buttons
                    stop the click from bubbling so they still do their own job. */}
                <div
                  onClick={() => router.push(`/items/${i.id}`)}
                  className={ROW + " px-4 py-2.5 hover:bg-lavender/30 transition-colors cursor-pointer"}
                >
                  <ItemThumb item={i} />

                  <div className="min-w-0">
                    <span className="text-[14px] font-semibold text-purple block truncate">
                      {i.name}
                      {isVariant(i) && (
                        <span className="text-[10.5px] font-bold ml-2 px-1.5 py-0.5 rounded-full align-middle"
                          style={{ background: "#f9e9fd", color: "#8b21c9" }}
                          title="Made together with the other members of its family">
                          1 OF {familySize.get(i.familyKey!) ?? 1}
                        </span>
                      )}
                    </span>
                    <div className="text-[12px] text-body-soft mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="font-mono tracking-tight">{i.sku}</span>
                      {recipeCount > 0 && (
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                          style={{ background: "#f9e9fd", color: "#8b21c9" }}>
                          <Icon name="layers" size={9} /> {recipeCount}
                        </span>
                      )}
                      {i.isPerishable && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-[#fdecea] text-[#c0392b]">perishable</span>}
                      {i.effectiveCostPaisa <= 0 && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-[#fbf1e2] text-[#8a6d1f]">no cost</span>}
                    </div>
                  </div>

                  <span className="text-[13px] text-body truncate">
                    {i.itemCategory?.name ?? <span className="text-body-soft">—</span>}
                  </span>

                  <span className="text-[12px] font-bold px-2 py-1 rounded-full justify-self-start"
                    style={{ background: m.bg, color: m.colour }}>{m.short}</span>

                  <span className="text-[13px] text-body truncate">{i.brand?.name ?? <span className="text-body-soft">—</span>}</span>

                  <span className="text-[13px] truncate">
                    {col ? (
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <span className="w-[15px] h-[15px] rounded-full border border-lavender-deep shrink-0"
                          style={{ background: col.swatch ?? "repeating-linear-gradient(45deg,#f3eef7,#f3eef7 4px,#e6dcee 4px,#e6dcee 8px)" }} />
                        <span className="text-body truncate">{col.label}</span>
                      </span>
                    ) : <span className="text-body-soft">—</span>}
                  </span>

                  <span className="text-[13px] truncate">
                    {size
                      ? <span className="text-body font-medium bg-lavender/70 rounded-full px-2 py-0.5">{size.label}</span>
                      : <span className="text-body-soft">—</span>}
                  </span>

                  <span className="text-[13.5px] font-semibold text-body">
                    {i.effectiveCostPaisa > 0 ? formatTaka(i.effectiveCostPaisa) : <span className="text-body-soft font-normal">—</span>}
                    <span className="block text-[11px] font-normal text-body-soft">
                      {i.costMode === "AUTO" ? "auto from recipe" : `per ${i.unit?.name?.toLowerCase() ?? "unit"}`}
                    </span>
                  </span>

                  <span className={"text-[13px] " + (stock.tone === "info" ? "text-orchid font-semibold" : "text-body-soft")} title={stock.hint}>
                    {stock.text}
                  </span>

                  <span onClick={(e) => e.stopPropagation()}>
                    <StatusPill active={i.isActive} onClick={() => toggleActive(i)} />
                  </span>

                  <span className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <Link href={`/items/${i.id}`} className="text-body-soft hover:text-purple px-1 py-1" title="Edit"><Icon name="edit" size={15} /></Link>
                    <button onClick={() => remove(i)} className="text-body-soft hover:text-[#c0392b] px-1 py-1" title="Delete"><Icon name="trash" size={15} /></button>
                  </span>
                </div>
              </div>
            );
          })}

          {!loading && shown.length === 0 && (
            <div className="text-center py-14 px-4">
              <div className="w-[48px] h-[48px] rounded-[14px] grid place-items-center text-white mx-auto mb-3" style={{ background: ACCENT }}>
                <Icon name="box" size={23} />
              </div>
              <div className="text-[15px] text-purple font-semibold">
                {anyFilter ? "Nothing matches those filters" : "No items yet"}
              </div>
              <p className="text-[13px] text-body-soft m-0 mt-1">
                {anyFilter ? "Loosen a filter and try again." : "Start with the things you buy — rose stems, ribbon, boxes."}
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                {anyFilter ? (
                  <button onClick={clearAll} className="text-white text-[13px] font-semibold px-4 py-2 rounded-[10px]" style={{ background: ACCENT }}>
                    Clear all filters
                  </button>
                ) : (
                  <>
                    <Link href="/items/new" className="inline-flex items-center gap-2 text-white text-[13px] font-semibold px-4 py-2 rounded-[10px]" style={{ background: ACCENT }}>
                      <Icon name="plus" size={14} /> New item
                    </Link>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ---- page numbers, at the foot (sobuj, 21 Jul: "numbering ta page ar niche
             thakbe"). Not sticky on purpose — you reach it by finishing the rows. ---- */}
        {pages > 1 && (
          <div className="px-4 py-3 border-t border-lavender-deep bg-lavender/25 flex items-center gap-3 flex-wrap">
            <span className="text-[13px] text-body">
              Showing <b className="text-purple">{from}</b>–<b className="text-purple">{to}</b> of{" "}
              <b className="text-purple">{filtered.length}</b>
            </span>
            <div className="ml-auto flex items-center gap-1">
              <PageBtn label="First" onClick={() => setPage(1)} disabled={current === 1} />
              <PageBtn label="‹" onClick={() => setPage(current - 1)} disabled={current === 1} />
              {Array.from({ length: pages }, (_, k) => k + 1)
                .filter((n) => n === 1 || n === pages || Math.abs(n - current) <= 1)
                .map((n, idx, arr) => (
                  <span key={n} className="flex items-center gap-1">
                    {idx > 0 && arr[idx - 1] !== n - 1 && <span className="text-body-soft px-1">…</span>}
                    <button onClick={() => setPage(n)}
                      className="text-[13px] font-semibold min-w-[32px] h-[32px] rounded-[8px] border"
                      style={n === current
                        ? { background: ACCENT, borderColor: ACCENT, color: "#fff" }
                        : { background: "#fff", borderColor: "#efe4f7", color: "#470066" }}>
                      {n}
                    </button>
                  </span>
                ))}
              <PageBtn label="›" onClick={() => setPage(current + 1)} disabled={current === pages} />
              <PageBtn label="Last" onClick={() => setPage(pages)} disabled={current === pages} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PageBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="text-[13px] font-semibold px-2.5 h-[32px] rounded-[8px] border border-lavender-deep bg-white text-purple disabled:opacity-35 hover:border-orchid disabled:hover:border-lavender-deep">
      {label}
    </button>
  );
}
