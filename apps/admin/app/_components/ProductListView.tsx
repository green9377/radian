"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import {
  listProducts,
  deleteProduct,
  updateProduct,
  createProduct,
  storefrontUrl,
  formatTaka,
  type ApiProduct,
} from "../_data/api";
import { DEMO_PRODUCTS } from "../_data/demoProducts";

/*
  All products — the working catalog table.
  Tries :4000 first; falls back to the demo catalog so the screen is never dead.
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
    purple: "from-[#470066] to-[#7d2ea8]",
    green: "from-[#0f7d55] to-[#37a97c]",
    red: "from-[#c0392b] to-[#e0705f]",
    blue: "from-[#3b5bdb] to-[#7793f7]",
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
  const [all, setAll] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
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

  async function load() {
    setLoading(true);
    try {
      const res = await listProducts();
      if (res.items.length === 0) {
        setAll(DEMO_PRODUCTS);
        setDemo(true);
      } else {
        setAll(res.items);
        setDemo(false);
      }
    } catch {
      setAll(DEMO_PRODUCTS);
      setDemo(true);
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

  async function patch(p: ApiProduct, body: Record<string, unknown>) {
    if (!demo) {
      try {
        await updateProduct(p.id, body);
      } catch (e) {
        alert("Could not save: " + (e instanceof Error ? e.message : e));
        return;
      }
    }
    setAll((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...(body as Partial<ApiProduct>) } : x)));
  }

  async function duplicate(p: ApiProduct) {
    const copy: ApiProduct = {
      ...p,
      id: "copy" + Date.now(),
      name: `${p.name} (copy)`,
      slug: `${p.slug}-copy-${Math.floor(Math.random() * 900 + 100)}`,
      sku: p.sku ? `${p.sku}-C` : null,
      isPublished: false,
      salesCount: 0,
    };
    if (!demo) {
      try {
        await createProduct({
          slug: copy.slug,
          sku: copy.sku,
          name: copy.name,
          categoryId: p.category?.id,
          productType: p.productType,
          zone: p.zone,
          natureType: p.natureType,
          costPaisa: p.costPaisa,
          sellingPricePaisa: p.sellingPricePaisa,
          stockQty: p.stockQty,
          isPublished: false,
        });
        await load();
        return;
      } catch (e) {
        alert("Could not duplicate: " + (e instanceof Error ? e.message : e));
        return;
      }
    }
    setAll((prev) => [copy, ...prev]);
    setMenu(null);
  }

  async function remove(p: ApiProduct) {
    if (!confirm(`Delete "${p.name}"? It is hidden, not erased (recoverable).`)) return;
    if (!demo) {
      try {
        await deleteProduct(p.id);
      } catch (e) {
        alert("Delete failed: " + (e instanceof Error ? e.message : e));
        return;
      }
    }
    setAll((prev) => prev.filter((x) => x.id !== p.id));
    setMenu(null);
  }

  async function bulkPublish(v: boolean) {
    const chosen = all.filter((p) => sel.has(p.id));
    if (!chosen.length) return;
    if (!confirm(`${v ? "Publish" : "Unpublish"} ${chosen.length} product(s)?`)) return;
    for (const p of chosen) await patch(p, { isPublished: v });
    setSel(new Set());
  }

  /*  6 Aug 2026 — the bulk bar had Publish/Unpublish but no Delete, so
      clearing junk meant one row at a time through each row's own button.
      Same soft delete as the row button: everything lands in Trash,
      recoverable. Failures are counted and said out loud, not swallowed.  */
  async function bulkDelete() {
    const chosen = all.filter((p) => sel.has(p.id));
    if (!chosen.length) return;
    if (!confirm(`Delete ${chosen.length} product(s)? They go to Trash and can be restored.`)) return;
    let failed = 0;
    if (!demo) {
      for (const p of chosen) {
        try {
          await deleteProduct(p.id);
        } catch {
          failed++;
        }
      }
    }
    const okIds = new Set(chosen.map((p) => p.id));
    setAll((prev) => prev.filter((x) => !okIds.has(x.id)));
    setSel(new Set());
    if (failed > 0) alert(`${failed} of ${chosen.length} could not be deleted — refresh and try again.`);
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
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
              <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
              Product Management · catalog
            </div>
            {demo && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] bg-[#fff8ec] text-[#b45309] border border-[#f0c88a] px-2.5 py-1 rounded-full">
                <Icon name="bolt" size={12} /> Demo data
              </span>
            )}
          </div>
          <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">All Products</h1>
          <p className="text-body-soft text-[13.5px] m-0">
            Search by name or SKU, sort any column, and open a product on the live site.
          </p>
        </div>
        <div className="flex gap-2.5">
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
          <button onClick={() => bulkDelete()} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] bg-white border border-[#e0a1a1] text-[#c0392b] hover:bg-[#fdecea]">Delete</button>
          <button onClick={() => setSel(new Set())} className="text-[12.5px] font-medium text-orchid ml-auto">Clear</button>
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
                          {p.productType === "CRAFTED" && <span className="text-[10px] bg-orchid-soft text-[#a021b8] px-2 py-0.5 rounded-full font-semibold">Crafted</span>}
                          {st === "Draft" && <span className="text-[10px] bg-[#f0edf4] text-body-soft px-2 py-0.5 rounded-full font-semibold">Draft</span>}
                          {p.isBestSeller && <span className="text-[10px] bg-[#fff8ec] text-[#b45309] px-2 py-0.5 rounded-full font-semibold">Bestseller</span>}
                          {p.item?.supplier && (
                            <span
                              title={`Supplied by ${p.item.supplier.name} — they make it, not us`}
                              className="text-[10px] bg-[#fff6e5] text-[#8a5a00] border border-[#f0d9a8] px-2 py-0.5 rounded-full font-semibold"
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

                  <td className={`px-3 py-3 font-semibold ${noCost ? "text-[#b45309]" : m < 0 ? "text-[#c0392b]" : pct < 20 ? "text-[#b45309]" : "text-[#0f7d55]"}`}>
                    {noCost ? (
                      <span className="text-[11.5px] bg-[#fff8ec] px-2 py-1 rounded-full">no cost</span>
                    ) : (
                      <>
                        {formatTaka(m)}
                        <div className="text-[11.5px]">{pct}%</div>
                      </>
                    )}
                  </td>

                  <td className="px-3 py-3">
                    <span className={p.stockQty <= 0 ? "text-[#c0392b] font-semibold" : ""}>{p.stockQty}</span>
                    {p.stockQty <= 0 && <span className="ml-1.5 text-[10px] bg-[#fdecea] text-[#c0392b] px-1.5 py-0.5 rounded-full font-bold">OUT</span>}
                    {p.stockQty > 0 && p.stockQty <= 5 && <span className="ml-1.5 text-[10px] bg-[#fff8ec] text-[#b45309] px-1.5 py-0.5 rounded-full font-bold">LOW</span>}
                  </td>

                  <td className="px-3 py-3 text-body-soft">{p.salesCount}</td>
                  <td className="px-3 py-3 text-body-soft text-[12.5px]">{p.zone === "DHAKA" ? "Dhaka" : "Nationwide"}</td>

                  <td className="px-3 py-3">
                    <button
                      onClick={() => patch(p, { isPublished: !p.isPublished })}
                      title={p.isPublished ? "Published — click to hide" : "Draft — click to publish"}
                      className={`w-[38px] h-[22px] rounded-full relative transition-colors ${p.isPublished ? "bg-[#0f7d55]" : "bg-[#cdbfda]"}`}
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
                        title="Delete — goes to Trash, recoverable"
                        className="border border-lavender-deep hover:border-[#c0392b] hover:text-[#c0392b] text-body-soft w-[32px] h-[32px] rounded-[9px] grid place-items-center"
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
                          <button onClick={() => duplicate(p)} className="w-full text-left px-3.5 py-2 text-[13px] hover:bg-lavender text-body flex items-center gap-2">
                            <Icon name="copy" size={15} /> Duplicate
                          </button>
                          <a href={storefrontUrl(p.slug)} target="_blank" rel="noreferrer" className="w-full text-left px-3.5 py-2 text-[13px] hover:bg-lavender text-body flex items-center gap-2">
                            <Icon name="eye" size={15} /> Open on site
                          </a>
                          <button onClick={() => remove(p)} className="w-full text-left px-3.5 py-2 text-[13px] hover:bg-[#fdecea] text-[#c0392b] flex items-center gap-2">
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
        live storefront. Delete hides a product — it is never erased.
      </p>
    </div>
  );
}
