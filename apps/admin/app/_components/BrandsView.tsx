"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import {
  loadBrandsSafe, createBrand, updateBrand, deleteBrand,
  brandSlug, brandUrl, genBg, initials,
  uploadImage, uploadItemImage,
  type ApiBrand, type BrandWrite,
} from "../_data/api";

/*
  Master Data · Brands — LIVE flat manager.

    LEFT  : every brand as a selectable row (logo, name, product count,
            featured star, sort, active switch) + inline "add brand".
    RIGHT : the selected brand — logo upload, name, slug, description, the
            featured/visible switches, a compact SEO block, and a storefront
            "Shop by Brand" preview.

  Brand is FLAT (no parent-child, unlike Category) and Product ↔ Brand is a
  single optional FK (unlike Tag's m2m). Demo fallback ONLY when the API is
  unreachable; an empty-but-reachable DB is REAL (offers "Load samples").
  DEC-PRD-008.
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";
const rnd = () => Math.random().toString(36).slice(2, 9);

// rosegold-forward accent — premium, and distinct from Category (purple) & Tags (orchid)
const ACCENT = "#b76e79";
const ACCENT_BG = "#f8eef0";

function LogoThumb({ b, size }: { b: ApiBrand; size: number }) {
  const r = Math.round(size * 0.28);
  if (b.logoUrl) {
    return (
      <span
        className="shrink-0 border border-lavender-deep bg-white block"
        style={{ width: size, height: size, borderRadius: r, backgroundImage: `url(${b.logoUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}
      />
    );
  }
  return (
    <span
      className="shrink-0 grid place-items-center font-display font-semibold text-white"
      style={{ width: size, height: size, borderRadius: r, background: genBg(b.slug || b.name), color: ACCENT, fontSize: size * 0.34 }}
    >
      <span style={{ color: "#7a3f49" }}>{initials(b.name)}</span>
    </span>
  );
}

export default function BrandsView() {
  const [brands, setBrands] = useState<ApiBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");

  const sorted = useMemo(
    () => brands.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [brands],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((b) => b.name.toLowerCase().includes(q)) : sorted;
  }, [sorted, query]);
  const selected = brands.find((b) => b.id === selectedId) ?? null;
  const editorRef = useRef<HTMLDivElement>(null);
  function openEditor(b: ApiBrand) {
    setSelectedId(b.id);
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  const stats = useMemo(() => {
    const featured = brands.filter((b) => b.isFeatured).length;
    const empty = brands.filter((b) => (b._count?.products ?? 0) === 0).length;
    const hidden = brands.filter((b) => !b.isActive).length;
    return { total: brands.length, featured, empty, hidden };
  }, [brands]);

  async function load() {
    setLoading(true);
    try {
      const { items, isDemo } = await loadBrandsSafe();
      setBrands(items);
      setIsDemo(isDemo);
      setSelectedId((cur) => (cur && items.some((b) => b.id === cur) ? cur : items.slice().sort((a, b) => a.sortOrder - b.sortOrder)[0]?.id ?? ""));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  /* ---- optimistic state + persist ---- */
  function patchLocal(id: string, patch: Partial<ApiBrand>) {
    setBrands((p) => p.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  async function persist(id: string, write: BrandWrite, optimistic: Partial<ApiBrand>) {
    patchLocal(id, optimistic);
    if (isDemo) return;
    try { const updated = await updateBrand(id, write); patchLocal(id, updated); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not save — try again."); await load(); }
  }

  async function addBrand() {
    const name = draft.trim();
    if (!name) return;
    const slug = brandSlug(name);
    if (brands.some((b) => b.slug === slug)) { setErr(`A brand called “${name}” already exists.`); return; }
    setErr(null); setDraft("");
    if (isDemo) {
      const id = "brand-" + rnd();
      const b: ApiBrand = { id, slug, name, logoUrl: null, description: null, metaTitle: null, metaDescription: null, isFeatured: false, sortOrder: brands.length, isActive: true, _count: { products: 0 } };
      setBrands((p) => [...p, b]); setSelectedId(id); return;
    }
    try { const b = await createBrand({ slug, name, sortOrder: brands.length, isActive: true }); await load(); setSelectedId(b.id); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not create the brand."); }
  }

  const toggleActive = (b: ApiBrand) => persist(b.id, { isActive: !b.isActive }, { isActive: !b.isActive });
  const toggleFeatured = (b: ApiBrand) => persist(b.id, { isFeatured: !b.isFeatured }, { isFeatured: !b.isFeatured });

  async function move(b: ApiBrand, dir: "up" | "down") {
    const i = sorted.findIndex((x) => x.id === b.id);
    const k = dir === "up" ? i - 1 : i + 1;
    if (k < 0 || k >= sorted.length) return;
    const other = sorted[k];
    const a = b.sortOrder, bb = other.sortOrder === a ? a + (dir === "up" ? -1 : 1) : other.sortOrder;
    setBrands((p) => p.map((x) => (x.id === b.id ? { ...x, sortOrder: bb } : x.id === other.id ? { ...x, sortOrder: a } : x)));
    if (isDemo) return;
    try { await Promise.all([updateBrand(b.id, { sortOrder: bb }), updateBrand(other.id, { sortOrder: a })]); } catch { await load(); }
  }

  async function remove(b: ApiBrand) {
    const n = b._count?.products ?? 0;
    const msg = n > 0
      ? `“${b.name}” is used by ${n} product${n === 1 ? "" : "s"}. Deleting it will remove the brand from ${n === 1 ? "that product" : "those products"} (they stay live, just un-branded). Continue?`
      : `Delete the “${b.name}” brand?`;
    if (!confirm(msg)) return;
    setBrands((p) => p.filter((x) => x.id !== b.id));
    if (selectedId === b.id) setSelectedId("");
    if (isDemo) return;
    try { await deleteBrand(b.id); } catch (e) { setErr(e instanceof Error ? e.message : "Could not delete."); await load(); }
  }

  async function onEditorSave(id: string, write: BrandWrite) {
    // slug clash guard (backend also enforces)
    if (write.slug && brands.some((b) => b.id !== id && b.slug === write.slug)) { setErr(`Slug “${write.slug}” is already used by another brand.`); return; }
    setErr(null);
    patchLocal(id, write as Partial<ApiBrand>);
    if (isDemo) return;
    try { const updated = await updateBrand(id, write); patchLocal(id, updated); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not save the brand."); await load(); }
  }


  const emptyReal = !loading && !isDemo && brands.length === 0;

  return (
    <div className={WRAP}>
      {/* header */}
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: ACCENT }}>
            <span className="w-[9px] h-[9px] -rotate-45" style={{ borderRadius: "50% 50% 50% 0", background: `linear-gradient(150deg,${ACCENT},#cf43ea)` }} />
            Master data · brands
          </div>
          <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">Brands</h1>
          <p className="text-body-soft text-[13.5px] m-0 max-w-[720px]">
            The makers behind your gifts — Ferrero Rocher, Cadbury, your own house label. Add a logo, feature the best on
            the homepage, and attach a brand to any product. Flowers usually have none; that’s fine — brand is optional.
          </p>
        </div>
        <Link href="/tags" className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] hover:border-orchid shrink-0">Occasions &amp; Tags</Link>
      </div>

      {err && (
        <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-4 text-[13px] flex items-center justify-between gap-3">
          <span>{err}</span><button className="underline shrink-0" onClick={() => setErr(null)}>Dismiss</button>
        </div>
      )}
      {isDemo && (
        <div className="flex items-center gap-3 bg-[#fff4e6] border border-[#fce4c4] text-[#b45309] rounded-[12px] px-4 py-2.5 mb-4 text-[12.5px] flex-wrap">
          <span className="text-[10px] font-bold tracking-[0.06em] uppercase bg-[#b45309] text-white px-2 py-1 rounded-full shrink-0">Demo data</span>
          <span className="flex-1 min-w-[220px]">
            The API (:4000) is not reachable — showing sample brands. Start the API and
            <button className="underline font-medium mx-1" onClick={load}>retry</button>
            for your real data. (Edits here are not saved.)
          </span>
        </div>
      )}
      {loading && <div className="text-[13px] text-body-soft mb-4">Loading brands…</div>}

      {/* stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { l: "Total brands", v: String(stats.total), c: "#7a2ea8", bg: "#f5eafb", icon: "tag" },
          { l: "Featured", v: String(stats.featured), c: ACCENT, bg: ACCENT_BG, icon: "star" },
          { l: "Empty (0 products)", v: String(stats.empty), c: stats.empty ? "#d98a0f" : "#12a172", bg: "#fbf1e2", icon: "bolt" },
          { l: "Hidden", v: String(stats.hidden), c: stats.hidden ? "#b5642f" : "#12a172", bg: "#f6ece3", icon: "eye" },
        ].map((k, i) => (
          <div key={i} className="rounded-[14px] px-3.5 py-3 shadow-soft border border-white/60" style={{ background: k.bg }}>
            <span className="w-[24px] h-[24px] rounded-[7px] flex items-center justify-center text-white" style={{ background: k.c }}><Icon name={k.icon} size={13} /></span>
            <div className="font-display text-[23px] leading-none mt-2.5" style={{ color: k.c }}>{k.v}</div>
            <div className="text-[11px] font-medium text-body mt-1.5">{k.l}</div>
          </div>
        ))}
      </div>


      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6 items-start">
        {/* -------- LEFT: brand list -------- */}
        <div className="xl:sticky xl:top-4 self-start space-y-2.5">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-soft pointer-events-none"><Icon name="search" size={15} /></span>
            <input className="ipt ipt-icon w-full" placeholder="Search brands…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            {filtered.map((b, i) => {
              const on = b.id === selectedId;
              const count = b._count?.products ?? 0;
              return (
                <div key={b.id} className={"grid grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-[12px] border px-2.5 py-2.5 cursor-pointer transition-colors " + (on ? "ring-2 bg-white" : b.isActive ? "border-lavender-deep bg-white hover:bg-lavender/40" : "border-[#f0dcc4] bg-[#fbf5ef] hover:bg-[#f7efe7]")} style={on ? { borderColor: ACCENT, boxShadow: `0 0 0 2px ${ACCENT_BG}` } : undefined} onClick={() => setSelectedId(b.id)}>
                  <LogoThumb b={b} size={38} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-[14px] text-purple truncate">{b.name}</span>
                      {b.isFeatured && <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5" style={{ background: ACCENT_BG, color: ACCENT }}><Icon name="star" size={9} /> Featured</span>}
                      {!b.isActive && <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full bg-[#fbe4cd] text-[#b45309]">Hidden</span>}
                    </div>
                    <div className="text-[13px] text-body-soft truncate">/{b.slug} · {count} product{count === 1 ? "" : "s"}</div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col">
                      <button onClick={() => move(b, "up")} disabled={i === 0 || !!query} className="text-body-soft hover:text-purple disabled:opacity-25 leading-none" title="Move up"><span className="rotate-180 inline-block"><Icon name="chevronDown" size={13} /></span></button>
                      <button onClick={() => move(b, "down")} disabled={i === filtered.length - 1 || !!query} className="text-body-soft hover:text-purple disabled:opacity-25 leading-none" title="Move down"><Icon name="chevronDown" size={13} /></button>
                    </div>
                    <button onClick={() => openEditor(b)} className="w-[28px] h-[28px] rounded-[8px] grid place-items-center text-purple hover:bg-lavender" title="Edit brand"><Icon name="edit" size={14} /></button>
                    <button onClick={() => remove(b)} className="w-[28px] h-[28px] rounded-[8px] grid place-items-center text-[#b42318] hover:bg-[#fbecec]" title="Delete brand"><Icon name="trash" size={14} /></button>
                  </div>
                </div>
              );
            })}
            {!loading && filtered.length === 0 && (
              <div className="text-[13px] text-body-soft text-center py-6 border border-dashed border-lavender-deep rounded-[12px]">
                {query ? "No brands match your search." : "No brands yet — add your first below."}
              </div>
            )}
          </div>

          {/* add brand */}
          <div className="grid grid-cols-[1fr_auto] items-center gap-2 pt-1">
            <input className="ipt" style={{ minHeight: 38 }} placeholder="New brand…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addBrand(); }} />
            <button onClick={addBrand} disabled={!draft.trim()} className="text-white h-[38px] px-3 rounded-[10px] inline-flex items-center gap-1 text-[13px] font-medium shrink-0 disabled:opacity-50" style={{ background: ACCENT }}><Icon name="plus" size={15} /> Add</button>
          </div>
        </div>

        {/* -------- RIGHT: selected brand -------- */}
        <div ref={editorRef}>
          {selected ? (
            <BrandEditor
              key={selected.id}
              brand={selected}
              onSave={onEditorSave}
              onToggleFeatured={() => toggleFeatured(selected)}
              onToggleActive={() => toggleActive(selected)}
              onDelete={() => remove(selected)}
            />
          ) : (
            <div className="bg-white border border-dashed border-lavender-deep rounded-[18px] shadow-soft p-10 text-center">
              <div className="font-display text-[18px] text-purple mb-1">{loading ? "Loading…" : "Pick a brand"}</div>
              <p className="text-body-soft text-[13px]">{loading ? "" : "Choose a brand on the left to edit its logo, story and SEO."}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= right pane: one brand ================= */
function BrandEditor({
  brand, onSave, onToggleFeatured, onToggleActive, onDelete,
}: {
  brand: ApiBrand;
  onSave: (id: string, write: BrandWrite) => void;
  onToggleFeatured: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(brand.name);
  const [slug, setSlug] = useState(brand.slug);
  const [slugTouched, setSlugTouched] = useState(true); // existing brand → keep its slug unless edited
  const [logoUrl, setLogoUrl] = useState<string | null>(brand.logoUrl ?? null);
  const [description, setDescription] = useState(brand.description ?? "");
  const [metaTitle, setMetaTitle] = useState(brand.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(brand.metaDescription ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState(false);

  const count = brand._count?.products ?? 0;

  const dirty =
    name !== brand.name ||
    slug !== brand.slug ||
    (logoUrl ?? null) !== (brand.logoUrl ?? null) ||
    description !== (brand.description ?? "") ||
    metaTitle !== (brand.metaTitle ?? "") ||
    metaDescription !== (brand.metaDescription ?? "");

  function onName(v: string) {
    setName(v);
    if (!slugTouched) setSlug(brandSlug(v));
  }
  /* The logo is UPLOADED, and only the address it lands at is kept.
     It used to be read in the browser and stored as a base64 string inside the
     brand row: the preview appeared instantly, the save quietly failed on
     anything but a small file, and the logo vanished on refresh. */
  async function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setImgErr("Please choose an image file (JPG, PNG, WEBP or SVG)."); return; }
    setImgErr(null); setImgBusy(true);
    try {
      // SVG must go up untouched — the canvas shrink would flatten it to JPEG
      // and lose the transparent background that makes a logo usable.
      const url = file.type === "image/svg+xml"
        ? (await uploadImage(file, "brand")).url
        : await uploadItemImage(file, "brand", 600);
      setLogoUrl(url);
    } catch (err) {
      setImgErr(err instanceof Error ? err.message : "Could not upload that logo.");
    } finally { setImgBusy(false); }
  }
  function save() {
    const s = brandSlug(slug) || brandSlug(name);
    onSave(brand.id, { name: name.trim(), slug: s, logoUrl, description: description.trim() || null, metaTitle: metaTitle.trim() || null, metaDescription: metaDescription.trim() || null });
    setSlug(s);
  }

  const previewBrand: ApiBrand = { ...brand, name, slug, logoUrl, description };

  return (
    <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft overflow-hidden">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml" className="hidden" disabled={imgBusy} onChange={onLogoFile} />

      {/* header strip */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-4 border-b border-lavender-deep" style={{ background: ACCENT_BG }}>
        <LogoThumb b={previewBrand} size={44} />
        <div className="min-w-0">
          <div className="font-display text-[19px] leading-tight truncate" style={{ color: "#7a3f49" }}>{name || "Untitled brand"}</div>
          <div className="text-[13px] text-body-soft mt-0.5">{count} product{count === 1 ? "" : "s"} · {brand.isActive ? "visible" : "hidden"} on the storefront</div>
        </div>
        <button onClick={onDelete} className="w-[34px] h-[34px] rounded-[9px] grid place-items-center text-[#b42318] bg-white/70 hover:bg-white shrink-0" title="Delete brand"><Icon name="trash" size={15} /></button>
      </div>

      <div className="p-5 space-y-5">
        {/* logo + basics */}
        <div className="grid grid-cols-1 sm:grid-cols-[132px_1fr] gap-5">
          <div>
            <div className="text-[11px] font-bold tracking-[0.06em] uppercase text-body-soft mb-1.5">Logo</div>
            <button onClick={() => fileRef.current?.click()} className="w-[128px] h-[128px] rounded-[16px] border border-lavender-deep grid place-items-center overflow-hidden relative group bg-white" title={logoUrl ? "Click to replace" : "Click to upload a logo"} style={logoUrl ? { backgroundImage: `url(${logoUrl})`, backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center" } : { background: genBg(slug || name) }}>
              {!logoUrl && <span className="font-display text-[34px]" style={{ color: "#7a3f49" }}>{initials(name || "?")}</span>}
              <span className={`absolute inset-0 grid place-items-center text-white transition ${imgBusy ? "bg-black/45 opacity-100" : "bg-black/0 group-hover:bg-black/30 opacity-0 group-hover:opacity-100"}`}>
                {imgBusy ? <span className="text-[12px] font-semibold">Uploading…</span> : <Icon name="upload" size={22} />}
              </span>
            </button>
            {logoUrl && <button onClick={() => setLogoUrl(null)} className="text-[11.5px] text-[#b42318] hover:underline mt-1.5 inline-flex items-center gap-1"><Icon name="trash" size={12} /> Remove</button>}
            {imgErr && <div className="text-[11px] text-[#b42318] mt-1">{imgErr}</div>}
            <p className="text-[13px] text-body-soft mt-1.5 leading-snug">PNG or SVG on a transparent background looks best. Up to 10 MB.</p>
          </div>

          <div className="space-y-3.5">
            <label className="block">
              <span className="text-[11px] font-bold tracking-[0.06em] uppercase text-body-soft">Brand name</span>
              <input className="ipt w-full mt-1" value={name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Ferrero Rocher" />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold tracking-[0.06em] uppercase text-body-soft">Page address (slug)</span>
              <input className="ipt w-full mt-1" value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} placeholder="ferrero-rocher" />
              <span className="text-[13px] text-body-soft mt-1 inline-block">Customers reach it at <span className="font-mono text-purple">/brands/{brandSlug(slug) || "…"}</span></span>
            </label>
            <label className="block">
              <span className="text-[11px] font-bold tracking-[0.06em] uppercase text-body-soft">Short description</span>
              <textarea className="ipt w-full mt-1" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One or two lines shown on the brand’s page. Optional." />
            </label>
          </div>
        </div>

        {/* switches */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SwitchRow icon="star" tint={ACCENT} bg={ACCENT_BG} title="Featured brand" sub="Show in the homepage “Shop by Brand” strip" on={brand.isFeatured} onToggle={onToggleFeatured} />
          <SwitchRow icon="eye" tint="#7a2ea8" bg="#f5eafb" title="Visible on storefront" sub={brand.isActive ? "Customers can see and filter by it" : "Hidden — not shown to customers"} on={brand.isActive} onToggle={onToggleActive} />
        </div>

        {/* SEO */}
        <div className="rounded-[14px] border border-lavender-deep overflow-hidden">
          <div className="px-4 py-2.5 bg-lavender/40 border-b border-lavender-deep flex items-center gap-2">
            <Icon name="chart" size={14} className="text-purple" />
            <span className="text-[12.5px] font-semibold text-purple">Search &amp; social (SEO)</span>
            <span className="text-[13px] text-body-soft">— optional, helps Google find the brand page</span>
          </div>
          <div className="p-4 space-y-3.5">
            <label className="block">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold tracking-[0.06em] uppercase text-body-soft">Meta title</span>
                <span className={"text-[11px] " + (metaTitle.length > 60 ? "text-[#b45309]" : "text-body-soft")}>{metaTitle.length}/60</span>
              </div>
              <input className="ipt w-full mt-1" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder={`Buy ${name || "brand"} gifts in Bangladesh — Radian`} />
            </label>
            <label className="block">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold tracking-[0.06em] uppercase text-body-soft">Meta description</span>
                <span className={"text-[11px] " + (metaDescription.length > 160 ? "text-[#b45309]" : "text-body-soft")}>{metaDescription.length}/160</span>
              </div>
              <textarea className="ipt w-full mt-1" rows={2} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} placeholder="A sentence describing this brand’s gifts, for search results." />
            </label>
            <p className="text-[13px] text-body-soft">Social shares use the logo + meta title — no separate image needed.</p>
          </div>
        </div>

        {/* actions */}
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <button onClick={save} disabled={!dirty || !name.trim()} className="text-white text-[13.5px] font-semibold px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2 disabled:opacity-50" style={{ background: ACCENT }}>
            <Icon name="check" size={16} /> {dirty ? "Save changes" : "Saved"}
          </button>
          <a href={brandUrl(brandSlug(slug) || brand.slug)} target="_blank" rel="noreferrer" className="text-[13px] text-purple font-medium inline-flex items-center gap-1.5 hover:text-orchid"><Icon name="eye" size={15} /> View on site</a>
        </div>
      </div>

      {/* storefront preview */}
      <div className="border-t border-lavender-deep bg-lavender/30 px-5 py-4">
        <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.06em] uppercase text-purple mb-3"><Icon name="eye" size={13} /> How customers see it</div>
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-center">
          {/* shop-by-brand tile */}
          <div className="bg-white rounded-[16px] shadow-soft border border-white/60 p-4 w-[160px] text-center">
            <div className="w-[72px] h-[72px] mx-auto rounded-[14px] grid place-items-center overflow-hidden" style={logoUrl ? { backgroundImage: `url(${logoUrl})`, backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center", background: "#fff" } : { background: genBg(slug || name) }}>
              {!logoUrl && <span className="font-display text-[24px]" style={{ color: "#7a3f49" }}>{initials(name || "?")}</span>}
            </div>
            <div className="text-[13px] font-semibold text-purple mt-2.5 truncate">{name || "Brand"}</div>
            <div className="text-[13px] text-body-soft">{count} product{count === 1 ? "" : "s"}</div>
          </div>
          {/* brand page header */}
          <div className="bg-white rounded-[16px] shadow-soft border border-white/60 p-4">
            <div className="flex items-center gap-3">
              <LogoThumb b={previewBrand} size={40} />
              <div className="min-w-0">
                <div className="font-display text-[17px] text-purple truncate">{name || "Brand"}</div>
                <div className="text-[13px] text-body-soft line-clamp-2">{description || "Brand description appears here."}</div>
              </div>
            </div>
            {!brand.isActive && <div className="text-[11.5px] text-[#b45309] mt-2 inline-flex items-center gap-1"><Icon name="eye" size={12} /> Hidden — this page is not shown to customers right now.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SwitchRow({ icon, tint, bg, title, sub, on, onToggle }: { icon: string; tint: string; bg: string; title: string; sub: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[12px] border border-lavender-deep px-3.5 py-3">
      <span className="w-[32px] h-[32px] rounded-[9px] grid place-items-center text-white shrink-0" style={{ background: on ? tint : "#c9b7d6" }}><Icon name={icon} size={16} /></span>
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-purple">{title}</div>
        <div className="text-[13px] text-body-soft leading-snug">{sub}</div>
      </div>
      <Switch on={on} tint={tint} onClick={onToggle} />
    </div>
  );
}

function Switch({ on, tint, onClick }: { on: boolean; tint?: string; onClick: () => void }) {
  const w = 36, h = 21, k = 15;
  return (
    <button onClick={onClick} className="relative rounded-full transition-colors shrink-0" style={{ width: w, height: h, background: on ? (tint ?? "#cf43ea") : "#d9c9e6" }} title={on ? "On" : "Off"}>
      <span className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all" style={{ width: k, height: k, left: on ? w - k - 3 : 3 }} />
    </button>
  );
}
