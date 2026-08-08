"use client";

import { useState } from "react";
import Icon from "./Icon";
import BundleEditor from "./BundleEditor";
import CraftEditor from "./CraftEditor";
import CategoryStoryEditor from "./CategoryStoryEditor";
import {
  categorySlug,
  uploadImage,
  WEB_BASE,
  type ApiCategoryNode,
  type CategoryWrite,
} from "../_data/api";

/*
  Classification · Category editor (right pane).

  ⚠️ NARROWED ON 31 Jul 2026, on the owner's instruction: "Categories is where
  categories are made." It was a full CMS screen — banner copy, SEO, questions,
  page sections — and half of it was really the category PAGE wearing a
  category's clothes.

  Persists now: name, slug, parentId, sortOrder, isActive, showOnNavbar,
  isFeatured, and the two pieces of card art (image + icon) that decide how
  this category looks in the MENU and on the HOMEPAGE.

  Everything the category PAGE says — banner heading, paragraph, banner
  picture, Google snippet, questions — is on Storefront → Category pages,
  beside the section it belongs to. Same database row, one place to type it.

  IMAGES ARE REAL NOW. Until today `pick()` called `URL.createObjectURL()` and
  `sendUrl()` stripped the resulting `blob:` value before saving, so a picture
  appeared, survived until refresh, then disappeared. The upload goes to
  ImageKit via the API (`/media/upload`); the browser never sees the key.

  `real()` and `sendUrl()` are kept as they were, because old rows may still
  hold a leftover blob: string from before today, and one of those must never
  be written back to the database.
*/

/* live domain follows the deploy — demo shows demo, radianbd.com shows itself */
const WEB = `${WEB_BASE}/category/`;
const real = (v?: string | null) => (v && !v.startsWith("blob:") ? v : null);
const sendUrl = (v: string | null) => (v && !v.startsWith("blob:") ? v : undefined);

export default function CategoryEditor({
  node,
  initialParentId = null,
  parents,
  hasChildren,
  productCount,
  canDelete,
  onSave,
  onDelete,
  onCancel,
}: {
  node: ApiCategoryNode | null; // null = new
  initialParentId?: string | null;
  parents: ApiCategoryNode[];
  hasChildren: boolean;
  productCount: number;
  canDelete: boolean;
  onSave: (body: CategoryWrite & { name: string; slug: string }) => Promise<void> | void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const isNew = !node;
  const [name, setName] = useState(node?.name ?? "");
  const [slug, setSlug] = useState(node?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!node);
  const [parentId, setParentId] = useState<string | null>(node?.parentId ?? initialParentId ?? null);
  const [sortOrder, setSortOrder] = useState<number>(node?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState<boolean>(node?.isActive ?? true);

  const [showOnNavbar, setShowOnNavbar] = useState<boolean>(node?.showOnNavbar ?? true);
  const [isFeatured, setIsFeatured] = useState<boolean>(node?.isFeatured ?? false);
  const [sizeLabel, setSizeLabel] = useState(node?.sizeLabel ?? "");

  const [image, setImage] = useState<string | null>(real(node?.imageUrl));
  const [icon, setIcon] = useState<string | null>(real(node?.iconUrl));

  const [saving, setSaving] = useState(false);

  const parentOptions = parents.filter((p) => p.id !== node?.id);
  const effectiveSlug = slug || categorySlug(name);

  function onName(v: string) {
    setName(v);
    if (!slugTouched) setSlug(categorySlug(v));
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);

  /**
   * Show the local file immediately, then replace it with the stored URL.
   *
   * The instant preview is not decoration — an upload over a Bangladeshi mobile
   * connection takes seconds, and a box that stays empty that long reads as
   * "it didn't work" and gets clicked again.
   *
   * On failure the preview is rolled back to what was there before. Leaving a
   * blob: preview sitting in a box that failed to save is exactly the illusion
   * this whole change exists to remove.
   */
  async function pick(file: File | null, set: (v: string | null) => void, folder: "categories" | "icons") {
    if (!file) return;
    const previous = null as string | null;
    const preview = URL.createObjectURL(file);
    set(preview);
    setImgError(null);
    setBusy(preview);
    try {
      const { url } = await uploadImage(file, folder);
      set(url);
    } catch (e) {
      set(previous);
      setImgError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      URL.revokeObjectURL(preview);
      setBusy(null);
    }
  }
  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        slug: effectiveSlug,
        parentId,
        sortOrder: Number(sortOrder) || 0,
        isActive,
        showOnNavbar,
        isFeatured,
        imageUrl: sendUrl(image),
        iconUrl: sendUrl(icon),
        /*  Owned here, not on the page screen: it is a property of the KIND of
            thing this category sells, not of how its page is laid out.  */
        sizeLabel: sizeLabel.trim() || null,
        /*
          ⚠️ THE PAGE'S OWN FIELDS ARE NOT SENT FROM HERE, and that is the
          point of the split rather than an omission.

          They are edited on Storefront → Category pages now. If this form kept
          posting them, it would post whatever it read when it opened — so
          writing a banner heading there and then saving anything here would
          quietly put the old one back. Two screens may write one row; only one
          may own a field.
        */
      });
    } finally {
      setSaving(false);
    }
  }

  const subtitle = isNew
    ? "Fill in the details and save"
    : `${productCount} product${productCount === 1 ? "" : "s"} · ${node?.parentId ? "sub-category" : "top-level"}`;

  return (
    <div className="max-w-[860px]">
      {/*  Sticky hero header — bold, brand gradient, save always in reach.
          Redesigned 6 Aug 2026 (owner: the page read as cluttered/"hibijibi").

          ⚠️ The OUTER div is a solid-lavender STICKY BACKDROP (matches the
          editor zone bg in CategoriesView). The rounded purple hero sits
          inside it. Without the backdrop, scrolling content peeked through
          the hero's rounded corners and the gap below it; the backdrop is a
          solid wall the content slides cleanly under. `top-0` + `pt-3` puts
          the visible hero at 12px, aligned with the left tree card's top-3.  */}
      <div className="sticky top-0 z-20 pt-3 pb-3 -mx-3.5 px-3.5" style={{ background: "#f5eefb" }}>
        <div className="relative rounded-2xl overflow-hidden shadow-[0_8px_24px_rgba(120,40,140,0.22)]"
             style={{ background: "linear-gradient(135deg,#5b1670,#a021b8 55%,#c46aad)" }}>
          <div className="absolute -right-8 -top-16 w-48 h-48 rounded-full bg-white opacity-[0.10]" />
          <div className="relative flex items-center justify-between gap-3 px-6 py-5">
            <div className="min-w-0">
              <div className="text-white/75 text-[11px] font-bold tracking-[0.12em] uppercase">
                {isNew ? "New category" : "Editing category"}
              </div>
              <h2 className="font-display font-bold text-[24px] text-white leading-tight truncate mt-0.5">
                {isNew ? "New category" : name || node?.name}
              </h2>
              <div className="text-white/80 text-[12.5px] mt-0.5">{subtitle}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={onCancel} className="text-[13px] text-white/85 hover:text-white font-medium px-3 py-2 rounded-xl hover:bg-white/10 transition-colors">Cancel</button>
              <button onClick={save} disabled={saving || !name.trim()}
                      className="bg-white text-purple hover:bg-white/90 disabled:opacity-50 text-[14px] font-bold px-5 py-2.5 rounded-xl shadow-md inline-flex items-center gap-1.5 transition-transform active:scale-95">
                <Icon name="check" size={16} /> {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {imgError && (
          <div className="flex items-start gap-2 bg-[#fdecea] border border-[#f5c6c2] rounded-xl px-4 py-3 text-[13px] text-[#a3261f]">
            <span className="mt-0.5 shrink-0"><Icon name="alert" size={15} /></span>
            <span>{imgError}</span>
          </div>
        )}

        {/* ── BASICS ── */}
        <Card title="Basics" icon="grid">
          <Field label="Name" required>
            <input className="ipt" placeholder="e.g. Fresh Flowers" value={name} onChange={(e) => onName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Parent">
              <select className="ipt" value={parentId ?? ""} disabled={hasChildren} onChange={(e) => setParentId(e.target.value || null)}>
                <option value="">— None (top-level) —</option>
                {parentOptions.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </Field>
            <Field label="Sort order">
              <input type="number" className="ipt" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Web address">
            <input className="ipt" placeholder="fresh-flowers" value={slug} onChange={(e) => { setSlug(categorySlug(e.target.value)); setSlugTouched(true); }} />
            <Hint><span className="text-orchid">{WEB}{effectiveSlug || "your-slug"}</span></Hint>
          </Field>
          <Field label="Size chooser heading">
            <input className="ipt" placeholder={parentId ? "Leave empty to use the parent's" : "Bouquet Size"} value={sizeLabel} onChange={(e) => setSizeLabel(e.target.value)} />
            <Hint>The word above the size options on a product page — “Cake Weight”, “Box Size”.</Hint>
          </Field>
        </Card>

        {/* ── CARD ART ── */}
        <Card title="Card art" icon="photo">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-[500px]">
            <Drop label="Image" hint="800 × 800 · square" value={image} busy={busy} onFile={(f) => pick(f, setImage, "categories")} onClear={() => setImage(null)} ratio="aspect-square" />
            <Drop label="Icon" hint="96 × 96 · a symbol" value={icon} busy={busy} onFile={(f) => pick(f, setIcon, "icons")} onClear={() => setIcon(null)} ratio="aspect-square" />
          </div>
        </Card>

        {/* ── VISIBILITY ── */}
        <Card title="Visibility" icon="eye">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ToggleField label="Active" hint="Off = hidden" on={isActive} onToggle={() => setIsActive((v) => !v)} />
            <ToggleField label="In menu" hint="Top nav" on={showOnNavbar} onToggle={() => setShowOnNavbar((v) => !v)} />
            <ToggleField label="Featured" hint="Homepage" on={isFeatured} onToggle={() => setIsFeatured((v) => !v)} />
          </div>
        </Card>

        {/*  Category-wide defaults — set once here, they appear on every product
            in this category; a product can override each on its own page. Hidden
            until the category exists, since each needs a category id.  */}
        {!isNew && node && (
          <>
            <div className="flex items-center gap-3 pt-2">
              <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-body-soft whitespace-nowrap">Applies to every product here</span>
              <span className="h-px flex-1 bg-[#ece5f2]" />
            </div>

            <Card title="Bundles" icon="tag">
              <BundleEditor owner={{ categoryId: node.id }} />
            </Card>

            <Card title="Badges & what's inside" icon="check">
              <CategoryStoryEditor categoryId={node.id} />
            </Card>

            <Card title="Why buy from us" icon="sparkle">
              <CraftEditor owner={{ categoryId: node.id }} />
            </Card>

            <Card title="This category's page" sub="Banner, wording and questions — set together on one screen" icon="layers">
              <a href="/storefront/category-page" className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-orchid hover:underline">
                Open Storefront → Category pages →
              </a>
            </Card>
          </>
        )}

        {/* footer actions */}
        <div className="flex items-center justify-between gap-3 pt-2">
          {!isNew ? (
            <button onClick={onDelete} disabled={!canDelete}
                    title={canDelete ? "Delete category" : "Move its products & sub-categories first"}
                    className={"text-[13px] font-semibold inline-flex items-center gap-1.5 px-3 py-2 rounded-xl " + (canDelete ? "text-[#c0392b] hover:bg-[#fdecea]" : "text-body-soft/40 cursor-not-allowed")}>
              <Icon name="trash" size={15} /> Delete category
            </button>
          ) : (<span />)}
          <button onClick={save} disabled={saving || !name.trim()}
                  className="bg-purple hover:bg-purple-deep disabled:opacity-50 text-white text-[14px] font-bold px-7 py-3 rounded-xl shadow-[0_6px_18px_rgba(120,40,140,0.28)] inline-flex items-center gap-2 transition-transform active:scale-95">
            <Icon name="check" size={16} /> {saving ? "Saving…" : "Save category"}
          </button>
        </div>
      </div>
    </div>
  );
}

/*  A clean white section card — bold header row (gradient icon chip + title +
    one-line subtitle), generous padding. One shape for every section, so the
    page reads as a stack of calm cards instead of a wall of text.  */
function Card({ title, sub, icon, children }: { title: string; sub?: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#efe7f5] rounded-2xl shadow-[0_1px_3px_rgba(80,40,100,0.05)] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#f3eef8] bg-[#faf7fc]">
        <span className="w-9 h-9 rounded-xl grid place-items-center text-white shrink-0 shadow-[0_2px_8px_rgba(160,33,184,0.25)]"
              style={{ background: "linear-gradient(135deg,#a021b8,#d98cb3)" }}>
          <Icon name={icon} size={16} />
        </span>
        <div className="min-w-0">
          <div className="font-display font-bold text-[16px] text-purple leading-tight">{title}</div>
          {sub && <div className="text-[12px] text-body-soft leading-snug mt-0.5">{sub}</div>}
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

/* A <div>, not a <label> — a <label> forwards a caption click to the first
   control inside, which opened the file dialog when it wrapped a Drop. */
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="text-[12px] font-bold text-body flex items-center gap-1 mb-1.5 uppercase tracking-[0.03em]">
        {label}
        {required && <span className="text-[#c0392b]">*</span>}
      </span>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] text-body-soft mt-1.5 leading-relaxed">{children}</div>;
}

function ToggleField({ label, hint, on, onToggle }: { label: string; hint: string; on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
            className={"text-left rounded-xl px-4 py-3.5 border-2 transition-all " +
              (on ? "border-orchid bg-[#fdf4fb]" : "border-[#ece5f2] bg-white hover:border-lavender-deep")}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[14px] font-bold text-purple">{label}</div>
        <span className={"relative rounded-full transition-colors shrink-0 " + (on ? "bg-orchid" : "bg-lavender-deep")} style={{ width: 44, height: 26 }}>
          <span className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all" style={{ width: 20, height: 20, left: on ? 44 - 20 - 3 : 3 }} />
        </span>
      </div>
      <div className="text-[12px] text-body-soft mt-1">{hint}</div>
    </button>
  );
}

/*
  `hint` is the pixel size, shown on the box itself.

  ImageKit resizes on delivery, so the exact number is forgiving — the SHAPE is
  not. A wide photo dropped into a square card gets its sides cut off, and
  nobody discovers that until a bouquet is missing half its flowers on the
  homepage. So each box is drawn at the shape it will actually be displayed in,
  and says the size out loud.
*/
function Drop({ label, hint, value, busy, onFile, onClear, ratio }: { label: string; hint?: string; value: string | null; busy?: string | null; onFile: (f: File | null) => void; onClear: () => void; ratio: string }) {
  const uploading = !!value && value === busy;
  return (
    <div>
      {label && (
        <div className="mb-1.5">
          <div className="text-[12.5px] font-medium text-body">{label}</div>
          {hint && <div className="text-[11px] text-body-soft mt-0.5">{hint}</div>}
        </div>
      )}
      <label className={"relative block w-full " + ratio + " rounded-[12px] border-2 border-dashed border-lavender-deep bg-lavender/40 hover:border-orchid cursor-pointer overflow-hidden grid place-items-center"}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className={"absolute inset-0 w-full h-full object-cover transition-opacity " + (uploading ? "opacity-40" : "")} />
        ) : (
          <span className="text-body-soft flex flex-col items-center gap-1 text-[11.5px]"><Icon name="upload" size={20} /> Drag &amp; drop or click</span>
        )}
        {/* the file is on screen before it is stored — say which, or the owner
            navigates away mid-upload and loses it without ever being told */}
        {uploading && (
          <span className="absolute inset-x-0 bottom-0 bg-purple/85 text-white text-[11px] py-1 text-center">Uploading…</span>
        )}
        <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </label>
      {value && !uploading && <button onClick={onClear} className="text-[13px] text-body-soft hover:text-[#c0392b] mt-1.5">Remove</button>}
    </div>
  );
}
