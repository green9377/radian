"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import CategoryEditor from "./CategoryEditor";
import {
  listCategoriesSafe,
  createCategory,
  updateCategory,
  deleteCategory,
  seedSampleCategories,
  type ApiCategoryNode,
  type CategoryWrite,
} from "../_data/api";

/*
  Classification · Categories — two-pane category manager.
  LEFT: the parent → sub tree (select to edit, expand, quick reorder, product
  count, active toggle, live storefront preview underneath).
  RIGHT: the full CMS/SEO editor (CategoryEditor).

  Demo rule (refined): demo + orange badge ONLY when the API (:4000) is
  unreachable. Empty-but-reachable DB is REAL — empty state + "Load samples".
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

type Node = ApiCategoryNode;
interface TreeParent extends Node {
  kids: Node[];
}
const byOrder = (a: Node, b: Node) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
const pc = (n: Node) => n._count?.products ?? 0;
const rnd = () => Math.random().toString(36).slice(2, 9);
function buildTree(rows: Node[]): TreeParent[] {
  return rows
    .filter((r) => !r.parentId)
    .slice()
    .sort(byOrder)
    .map((p) => ({ ...p, kids: rows.filter((r) => r.parentId === p.id).slice().sort(byOrder) }));
}

export default function CategoriesView() {
  const [rows, setRows] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [newParentId, setNewParentId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { items, isDemo } = await listCategoriesSafe();
      setRows(items);
      setIsDemo(isDemo);
      setExpanded((prev) => (prev.size ? prev : new Set(items.filter((r) => !r.parentId).map((r) => r.id))));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const tree = useMemo(() => buildTree(rows), [rows]);
  const parents = useMemo(() => rows.filter((r) => !r.parentId).slice().sort(byOrder), [rows]);
  const selNode = selected && selected !== "new" ? rows.find((r) => r.id === selected) ?? null : null;
  const childCount = (id: string) => rows.filter((r) => r.parentId === id).length;

  const stats = useMemo(() => {
    const tops = rows.filter((r) => !r.parentId);
    const subs = rows.filter((r) => r.parentId);
    const classified = rows.reduce((s, r) => s + pc(r), 0);
    const empty = tree.reduce(
      (s, p) => s + (pc(p) === 0 && p.kids.length === 0 ? 1 : 0) + p.kids.filter((k) => pc(k) === 0).length,
      0,
    );
    const inactive = rows.filter((r) => !r.isActive).length;
    return { total: rows.length, tops: tops.length, subs: subs.length, classified, empty, inactive };
  }, [rows, tree]);

  /* ---------- mutations ---------- */
  async function toggleActive(node: Node) {
    const next = !node.isActive;
    setRows((p) => p.map((r) => (r.id === node.id ? { ...r, isActive: next } : r)));
    if (isDemo) return;
    try {
      await updateCategory(node.id, { isActive: next });
    } catch {
      setRows((p) => p.map((r) => (r.id === node.id ? { ...r, isActive: node.isActive } : r)));
      setErr("Could not update visibility.");
    }
  }
  async function move(node: Node, siblings: Node[], dir: "up" | "down") {
    const idx = siblings.findIndex((s) => s.id === node.id);
    const k = dir === "up" ? idx - 1 : idx + 1;
    if (k < 0 || k >= siblings.length) return;
    const other = siblings[k];
    const a = node.sortOrder;
    const b = other.sortOrder === a ? a + (dir === "up" ? -1 : 1) : other.sortOrder;
    setRows((p) => p.map((r) => (r.id === node.id ? { ...r, sortOrder: b } : r.id === other.id ? { ...r, sortOrder: a } : r)));
    if (isDemo) return;
    try {
      await Promise.all([updateCategory(node.id, { sortOrder: b }), updateCategory(other.id, { sortOrder: a })]);
    } catch {
      await load();
    }
  }

  async function saveCategory(body: CategoryWrite & { name: string; slug: string }) {
    setErr(null);
    if (selected === "new") {
      if (rows.some((r) => r.slug === body.slug)) {
        setErr(`“${body.name}” (slug ${body.slug}) already exists.`);
        return;
      }
      if (isDemo) {
        const id = "demo-" + rnd();
        setRows((p) => [...p, { id, sortOrder: 0, isActive: true, ...body, parentId: body.parentId ?? null, _count: { products: 0 } }]);
        setSelected(id);
        return;
      }
      try {
        const created = await createCategory(body);
        await load();
        setSelected(created.id);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not create the category.");
      }
      return;
    }
    if (!selNode) return;
    setRows((p) => p.map((r) => (r.id === selNode.id ? { ...r, ...body } : r)));
    if (isDemo) return;
    try {
      await updateCategory(selNode.id, body);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
      await load();
    }
  }

  async function removeSelected() {
    if (!selNode) return;
    if (pc(selNode) > 0 || childCount(selNode.id) > 0) return;
    if (!confirm(`Delete “${selNode.name}”? This can be restored later.`)) return;
    const id = selNode.id;
    setSelected(null);
    setRows((p) => p.filter((r) => r.id !== id));
    if (isDemo) return;
    try {
      await deleteCategory(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete.");
      await load();
    }
  }

  async function loadSamples() {
    setBusy(true);
    setErr(null);
    try {
      await seedSampleCategories();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load samples.");
    } finally {
      setBusy(false);
    }
  }

  const parentTotal = (p: TreeParent) => pc(p) + p.kids.reduce((s, k) => s + pc(k), 0);
  const isEmpty = !loading && rows.length === 0;

  function startNew(parentId: string | null) {
    setNewParentId(parentId);
    setSelected("new");
  }

  return (
    <div className={WRAP}>
      {/* header */}
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
            <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
            Classification · categories
          </div>
          <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">Categories</h1>
          <p className="text-body-soft text-[13.5px] m-0 max-w-[720px]">
            The category tree behind every product and the storefront menu. Pick one on the left to edit its page,
            images and SEO on the right.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/products/list" className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] hover:border-orchid">
            All products
          </Link>
          <button onClick={() => startNew(null)} className="bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-1.5">
            <Icon name="plus" size={16} /> Add category
          </button>
        </div>
      </div>

      {err && (
        <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-4 text-[13px] flex items-center justify-between gap-3">
          <span>{err}</span>
          <button className="underline shrink-0" onClick={() => setErr(null)}>Dismiss</button>
        </div>
      )}
      {isDemo && (
        <div className="flex items-center gap-3 bg-[#fff4e6] border border-[#fce4c4] text-[#b45309] rounded-[12px] px-4 py-2.5 mb-4 text-[12.5px] flex-wrap">
          <span className="text-[10px] font-bold tracking-[0.06em] uppercase bg-[#b45309] text-white px-2 py-1 rounded-full shrink-0">Demo data</span>
          <span className="flex-1 min-w-[220px]">
            The API (:4000) is not reachable — showing a sample taxonomy. Start the API and
            <button className="underline font-medium mx-1" onClick={load}>retry</button>
            for your real categories.
          </span>
        </div>
      )}
      {loading && <div className="text-[13px] text-body-soft mb-4">Loading categories…</div>}

      {/* stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3 mb-6">
        {[
          { l: "Categories", v: String(stats.total), c: "#7a2ea8", bg: "#f5eafb", icon: "grid" },
          { l: "Top-level", v: String(stats.tops), c: "#8b3fb0", bg: "#f3e8fb", icon: "layers" },
          { l: "Sub-categories", v: String(stats.subs), c: "#3182c9", bg: "#e9f2fc", icon: "hash" },
          { l: "Products classified", v: String(stats.classified), c: "#12a172", bg: "#e6f7ef", icon: "box" },
          { l: "Empty categories", v: String(stats.empty), c: stats.empty ? "#d98a0f" : "#12a172", bg: "#fbf1e2", icon: "bolt" },
          { l: "Hidden", v: String(stats.inactive), c: stats.inactive ? "#b5642f" : "#12a172", bg: "#f6ece3", icon: "eye" },
        ].map((k, i) => (
          <div key={i} className="rounded-[14px] px-3.5 py-3 shadow-soft border border-white/60" style={{ background: k.bg }}>
            <span className="w-[24px] h-[24px] rounded-[7px] flex items-center justify-center text-white" style={{ background: k.c }}>
              <Icon name={k.icon} size={13} />
            </span>
            <div className="font-display text-[23px] leading-none mt-2.5" style={{ color: k.c }}>{k.v}</div>
            <div className="text-[11px] font-medium text-body mt-1.5">{k.l}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(360px,1fr)_1.6fr] gap-6 items-start">
        {/* ---------------- LEFT: tree list, wrapped in a card ----------------
             6 Aug 2026 — the tree used to float as loose cards while the right
             pane had a bold pinned header, so the two sides looked unbalanced.
             Now the left is its own card with a rose-gold header — a second
             colour that reads clearly against the editor's purple.  */}
        <div className="xl:sticky xl:top-4 self-start">
          {/*  DARK GLASS TREE — owner's chosen design (6 Aug 2026, "design B":
              dark left panel, light editor right). Rich plum panel, glass rows,
              purple/orchid accents, rose-gold header. Colours are inline
              because the admin's Tailwind tokens are all light-theme.  */}
          <div className="rounded-2xl overflow-hidden xl:max-h-[calc(100vh-2rem)] flex flex-col shadow-[0_10px_30px_rgba(30,15,45,0.35)] ring-1 ring-white/5" style={{ background: "#211c33" }}>
            {/* rose-gold + purple header */}
            <div className="relative px-5 py-4 shrink-0 overflow-hidden border-b" style={{ background: "linear-gradient(120deg,rgba(183,110,121,0.30),rgba(138,43,176,0.16))", borderColor: "rgba(199,144,152,0.35)" }}>
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: "rgba(255,255,255,0.10)", color: "#F0D9DD" }}><Icon name="layers" size={18} /></span>
                  <div className="min-w-0">
                    <div className="font-display font-bold text-[18px] text-white leading-tight">Category tree</div>
                    <div className="text-[12px]" style={{ color: "rgba(240,217,221,0.75)" }}>{stats.tops} top-level · {stats.subs} sub</div>
                  </div>
                </div>
                <button onClick={() => startNew(null)} className="text-[12.5px] font-bold px-3 py-2 rounded-xl inline-flex items-center gap-1.5 shrink-0 transition-colors hover:bg-white/10" style={{ border: "1px solid #C79098", color: "#F0D9DD" }}>
                  <Icon name="plus" size={15} /> Add
                </button>
              </div>
            </div>

            {/* scrollable body — everything lives inside so the card stays pinned */}
            <div className="p-3 space-y-2.5 overflow-y-auto scrollbar-none flex-1">
          {isEmpty && !isDemo && (
            <div className="rounded-[14px] border border-dashed p-6 text-center" style={{ borderColor: "rgba(255,255,255,0.16)" }}>
              <div className="font-display text-[17px] text-white mb-1">No categories yet</div>
              <p className="text-[13px] mb-4" style={{ color: "rgba(237,233,245,0.7)" }}>Add your first with the button above.</p>
              <button onClick={loadSamples} disabled={busy} className="text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] inline-flex items-center gap-2 disabled:opacity-60" style={{ background: "#8A2BB0" }}>
                <Icon name="download" size={16} /> {busy ? "Loading samples…" : "Load samples"}
              </button>
            </div>
          )}

          {tree.map((p, pi) => {
            const open = expanded.has(p.id);
            const total = parentTotal(p);
            const on = selected === p.id;
            return (
              <div key={p.id} className="rounded-[14px] overflow-hidden transition-all"
                   style={{ background: on ? "rgba(169,63,201,0.14)" : "rgba(255,255,255,0.05)", border: on ? "1px solid rgba(169,63,201,0.6)" : "0.5px solid rgba(255,255,255,0.10)" }}>
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5 px-3 py-3 cursor-pointer transition-colors hover:bg-white/[0.04]" onClick={() => setSelected(p.id)}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded((s) => {
                        const n = new Set(s);
                        if (n.has(p.id)) n.delete(p.id);
                        else n.add(p.id);
                        return n;
                      });
                    }}
                    className="w-[28px] h-[28px] rounded-[9px] grid place-items-center shrink-0 transition-colors text-white"
                    style={{ background: open ? "#A93FC9" : "rgba(255,255,255,0.10)" }}
                    title={open ? "Collapse" : "Expand"}
                  >
                    <span className={"transition-transform " + (open ? "rotate-0" : "-rotate-90")}><Icon name="chevronDown" size={15} /></span>
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[15px] font-semibold truncate" style={{ color: p.isActive ? "#ffffff" : "rgba(237,233,245,0.55)" }}>{p.name}</span>
                      {total > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(169,63,201,0.25)", color: "#E6C7F0" }}>{total}</span>}
                      {!p.isActive && <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full" style={{ background: "rgba(226,150,66,0.22)", color: "#F0C48A" }}>Hidden</span>}
                    </div>
                    <div className="text-[12px] mt-0.5" style={{ color: "rgba(237,233,245,0.5)" }}>{p.kids.length} sub{p.kids.length === 1 ? "" : "s"}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col" style={{ color: "rgba(237,233,245,0.5)" }}>
                      <button onClick={() => move(p, tree, "up")} disabled={pi === 0} className="hover:text-white disabled:opacity-20 leading-none py-0.5" title="Move up"><span className="rotate-180 inline-block"><Icon name="chevronDown" size={13} /></span></button>
                      <button onClick={() => move(p, tree, "down")} disabled={pi === tree.length - 1} className="hover:text-white disabled:opacity-20 leading-none py-0.5" title="Move down"><Icon name="chevronDown" size={13} /></button>
                    </div>
                    <Switch on={p.isActive} onClick={() => toggleActive(p)} dark />
                  </div>
                </div>

                {open && (
                  <div className="px-2.5 pt-2 pb-2.5 space-y-1.5 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                    {p.kids.map((c, ci) => {
                      const onC = selected === c.id;
                      return (
                        <div key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-[11px] pl-3 pr-2 py-2 cursor-pointer transition-all"
                             style={{ background: onC ? "rgba(169,63,201,0.18)" : "rgba(255,255,255,0.04)", border: onC ? "1px solid rgba(169,63,201,0.55)" : "0.5px solid rgba(255,255,255,0.07)" }}
                             onClick={() => setSelected(c.id)}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.isActive ? "#A93FC9" : "rgba(255,255,255,0.25)" }} />
                            <span className="text-[13.5px] truncate font-medium" style={{ color: c.isActive ? "#EDE9F5" : "rgba(237,233,245,0.5)" }}>{c.name}</span>
                            {pc(c) > 0 && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(169,63,201,0.25)", color: "#E6C7F0" }}>{pc(c)}</span>}
                            {!c.isActive && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full" style={{ background: "rgba(226,150,66,0.22)", color: "#F0C48A" }}>Hidden</span>}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-col" style={{ color: "rgba(237,233,245,0.5)" }}>
                              <button onClick={() => move(c, p.kids, "up")} disabled={ci === 0} className="hover:text-white disabled:opacity-20 leading-none py-0.5" title="Move up"><span className="rotate-180 inline-block"><Icon name="chevronDown" size={12} /></span></button>
                              <button onClick={() => move(c, p.kids, "down")} disabled={ci === p.kids.length - 1} className="hover:text-white disabled:opacity-20 leading-none py-0.5" title="Move down"><Icon name="chevronDown" size={12} /></button>
                            </div>
                            <Switch on={c.isActive} onClick={() => toggleActive(c)} small dark />
                          </div>
                        </div>
                      );
                    })}
                    <button onClick={() => startNew(p.id)} className="inline-flex items-center gap-1.5 text-[12px] font-bold px-2 py-1.5 hover:brightness-125" style={{ color: "#C79098" }}>
                      <Icon name="plus" size={13} /> Add sub-category
                    </button>
                  </div>
                )}
              </div>
            );
          })}
            {/* storefront preview lives INSIDE the scroll, so the whole card
                stays pinned no matter how long the tree is */}
            {!isEmpty && <StorePreview tree={tree} />}
            </div>
          </div>
        </div>

        {/* ---------------- RIGHT: editor zone (soft lavender) ---------------- */}
        <div className="xl:rounded-[22px] xl:p-3.5" style={{ background: "#f5eefb" }}>
          {selected === "new" || selNode ? (
            <CategoryEditor
              key={selected}
              node={selNode}
              initialParentId={selected === "new" ? newParentId : null}
              parents={parents}
              hasChildren={!!selNode && childCount(selNode.id) > 0}
              productCount={selNode ? pc(selNode) : 0}
              canDelete={!!selNode && pc(selNode) === 0 && childCount(selNode.id) === 0}
              onSave={saveCategory}
              onDelete={removeSelected}
              onCancel={() => setSelected(null)}
            />
          ) : (
            <div className="bg-white border border-dashed border-lavender-deep rounded-[18px] shadow-soft p-10 text-center">
              <span className="w-[46px] h-[46px] rounded-[13px] grid place-items-center text-white bg-orchid mx-auto mb-3"><Icon name="grid" size={22} /></span>
              <div className="font-display text-[18px] text-purple mb-1">Select a category to edit</div>
              <p className="text-body-soft text-[13px] max-w-[420px] mx-auto mb-4">Click any category on the left to edit its name, page content, images, SEO and visibility — or start a new one.</p>
              <button onClick={() => startNew(null)} className="bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2"><Icon name="plus" size={16} /> Add category</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- small pieces ---------------- */
function Switch({ on, onClick, small, dark }: { on: boolean; onClick: () => void; small?: boolean; dark?: boolean }) {
  const w = small ? 32 : 36;
  const h = small ? 19 : 21;
  const k = small ? 13 : 15;
  return (
    <button
      onClick={onClick}
      className="relative rounded-full transition-colors shrink-0"
      style={{ width: w, height: h, background: on ? "#A93FC9" : dark ? "rgba(255,255,255,0.16)" : "#d8c6ee" }}
      title={on ? "Active — visible to customers" : "Hidden from customers"}
    >
      <span className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all" style={{ width: k, height: k, left: on ? w - k - 3 : 3 }} />
    </button>
  );
}

function StorePreview({ tree }: { tree: TreeParent[] }) {
  const active = tree.filter((p) => p.isActive);
  const [hi, setHi] = useState<string | null>(null);
  const sel = active.find((p) => p.id === hi) ?? active[0] ?? null;
  const kids = (sel?.kids ?? []).filter((k) => k.isActive);
  return (
    <div className="rounded-[16px] overflow-hidden mt-1" style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.10)" }}>
      <div className="px-4 py-2.5 flex items-center gap-2 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <span className="w-[24px] h-[24px] rounded-[7px] grid place-items-center" style={{ background: "rgba(169,63,201,0.30)", color: "#E6C7F0" }}><Icon name="eye" size={13} /></span>
        <div>
          <div className="font-display text-[14px] text-white leading-tight">Storefront preview</div>
          <div className="text-[12px]" style={{ color: "rgba(237,233,245,0.55)" }}>Hidden categories are excluded</div>
        </div>
      </div>
      {active.length === 0 ? (
        <div className="p-5 text-center text-[13px]" style={{ color: "rgba(237,233,245,0.55)" }}>No visible categories yet.</div>
      ) : (
        <div className="grid grid-cols-[118px_1fr] min-h-[160px]">
          <div className="py-1.5 border-r" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            {active.map((p) => {
              const onp = sel?.id === p.id;
              return (
                <button key={p.id} onMouseEnter={() => setHi(p.id)} className="w-full text-left px-3 py-1.5 text-[12.5px] truncate transition-colors"
                        style={onp ? { background: "rgba(169,63,201,0.20)", color: "#fff", fontWeight: 600 } : { color: "rgba(237,233,245,0.8)" }}>{p.name}</button>
              );
            })}
          </div>
          <div className="p-3.5">
            {sel && (
              <>
                <div className="font-display text-[14px] text-white mb-2">{sel.name}</div>
                {kids.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {kids.map((k) => (
                      <span key={k.id} className="text-[12px] px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)", color: "#EDE9F5", border: "0.5px solid rgba(255,255,255,0.12)" }}>{k.name}</span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[13px]" style={{ color: "rgba(237,233,245,0.55)" }}>Direct link — no sub-categories.</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
