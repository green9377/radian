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

  return (
    <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-lavender-deep bg-gradient-to-r from-lavender to-white rounded-t-[18px]">
        <div className="min-w-0">
          <div className="font-display text-[17px] text-purple leading-tight truncate">{isNew ? "New category" : name || node?.name}</div>
          <div className="text-[13px] text-body-soft">{isNew ? "Fill in the details and save" : `${productCount} product${productCount === 1 ? "" : "s"} · ${node?.parentId ? "sub-category" : "top-level"}`}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onCancel} className="text-[13px] text-body-soft hover:text-purple px-2">Cancel</button>
          <button onClick={save} disabled={saving || !name.trim()} className="bg-purple hover:bg-purple-deep disabled:opacity-60 text-white text-[13.5px] font-medium px-5 py-2 rounded-[10px] shadow-soft inline-flex items-center gap-1.5">
            <Icon name="check" size={15} /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        <div className="flex items-start gap-2 bg-[#eef7f0] border border-[#cfe8d6] rounded-[11px] px-3.5 py-2.5 text-[12px] text-[#12693f]">
          <span className="mt-0.5 shrink-0"><Icon name="check" size={14} /></span>
          <span>Everything on this page saves, images included. <b>JPG, PNG or WebP · up to 10 MB.</b> Sizes are marked on each box — the shape matters more than the exact pixels, because a wrong shape gets cropped.</span>
        </div>

        {imgError && (
          <div className="flex items-start gap-2 bg-[#fdecea] border border-[#f5c6c2] rounded-[11px] px-3.5 py-2.5 text-[12px] text-[#a3261f]">
            <span className="mt-0.5 shrink-0"><Icon name="alert" size={14} /></span>
            <span>{imgError}</span>
          </div>
        )}

        <Section title="Basics" icon="grid">
          <Field label="Name" required>
            <input className="ipt" placeholder="Category name" value={name} onChange={(e) => onName(e.target.value)} />
          </Field>
          <Field label="Permalink (slug)">
            <input className="ipt" placeholder="your-slug" value={slug} onChange={(e) => { setSlug(categorySlug(e.target.value)); setSlugTouched(true); }} />
            <div className="text-[13px] text-body-soft mt-1.5">
              Preview: <span className="text-orchid">{WEB}{effectiveSlug || "your-slug"}</span>
              <span className="ml-2 text-[#b5642f]">Changing the slug changes the public URL — do it carefully.</span>
            </div>
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Parent category">
              <select className="ipt" value={parentId ?? ""} disabled={hasChildren} onChange={(e) => setParentId(e.target.value || null)}>
                <option value="">— None (top-level) —</option>
                {parentOptions.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
              {hasChildren && <div className="text-[13px] text-body-soft mt-1.5">Has sub-categories, so it stays top-level (2 levels max).</div>}
            </Field>
            <Field label="Sorting">
              <input type="number" className="ipt" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
            </Field>
          </div>
          {/*
            Lives here rather than on the page screen: it describes the KIND of
            thing this category sells, not the layout of its page. Flowers come
            in bouquet sizes and cakes come in weights, and that stays true
            however the page is arranged.
          */}
          <Field label="Size chooser heading">
            <input
              className="ipt"
              placeholder={parentId ? "Leave empty to use the parent category's" : "Bouquet Size"}
              value={sizeLabel}
              onChange={(e) => setSizeLabel(e.target.value)}
            />
            <div className="text-[13px] text-body-soft mt-1.5">
              The words above Standard / Large / Grand on a product page — “Cake Weight”,
              “Box Size”. Empty falls back to {parentId ? "the parent category, then " : ""}a
              plain “Size”.
            </div>
          </Field>
        </Section>

        {/*
          ── What stayed, and what moved out — 31 Jul 2026 ──────────────────
          The owner's instruction: Categories is where categories are MADE,
          and nothing else. Everything that is really the category PAGE — the
          banner heading, its paragraph, its picture, the Google snippet, the
          questions — is edited on Storefront → Category pages, beside the
          section it belongs to.

          The line drawn, so the next person does not move things back:
            HERE  — what the category IS and where it APPEARS (name, slug,
                    parent, order, the card in the menu and on the homepage)
            THERE — what the category PAGE SAYS

          Nothing was duplicated. Both screens write the same Category row;
          only the place you type it changed.
        */}
        <Section title="Card art" icon="photo">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-[560px]">
            {/* square, not 4/3 — the homepage card is 178×178 and always was.
                The old box was drawn wide, so a chosen photo lost its sides. */}
            <Drop label="Category image" hint="800 × 800 · square · the card on the homepage" value={image} busy={busy} onFile={(f) => pick(f, setImage, "categories")} onClear={() => setImage(null)} ratio="aspect-square" />
            <Drop label="Category icon" hint="96 × 96 · a simple symbol, not a photo" value={icon} busy={busy} onFile={(f) => pick(f, setIcon, "icons")} onClear={() => setIcon(null)} ratio="aspect-square" />
          </div>
          <p className="text-[12.5px] text-body-soft mt-3 mb-0">
            These two are how this category appears in the menu and on the
            homepage. The banner picture at the top of its own page is set with
            the rest of that page — <b>Storefront → Category pages</b>.
          </p>
        </Section>


        <Section title="Visibility" icon="eye">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ToggleField label="Active (shoppable)" hint="Off = hidden from customers everywhere" on={isActive} onToggle={() => setIsActive((v) => !v)} />
            <ToggleField label="Show on navbar" hint="Appears in the top menu" on={showOnNavbar} onToggle={() => setShowOnNavbar((v) => !v)} />
            <ToggleField label="Featured" hint="Highlighted on the homepage" on={isFeatured} onToggle={() => setIsFeatured((v) => !v)} />
          </div>
        </Section>

        {/*
          Both of these save on their own, immediately, and neither waits for
          the Save button above — they are lists, not fields on this form, and
          a question typed and then lost to a forgotten Save is the complaint
          the Visit-the-shop screen already collected once.

          Hidden while the category is new: a question needs a category to
          belong to, and there is no id until the first save.
        */}
        {!isNew && node && (
          <>
            {/*
              Bundles, written once for everything in this category — the
              owner's rule of 31 Jul, the same one he chose for craft cards.
              Fifty bouquets do not each need somebody to remember that people
              like chocolates with flowers.

              A product that needs a different list overrides it on its own
              page, and that override REPLACES this one rather than adding to
              it. Said on both screens, because "replaces" is the half people
              discover by accident.
            */}
            <Section title="Bundles" icon="tag">
              <p className="text-[13px] text-body-soft mt-0 mb-3">
                Offered on every product in this category. Set the discount here — the
                price always comes from the product you add, so raising it there raises
                it on every page at once.
              </p>
              <BundleEditor owner={{ categoryId: node.id }} />
            </Section>

            {/*
              Craft cards — written once here for everything in the category.
              A sub-category with none of its own falls back to its parent's,
              so the story for flowers is typed once and not forty-four times.
            */}
            {/*
              DEC-PRD-023 — মালিক, ২ আগস্ট ২০২৬: *"আমি চাই প্রতিটা admin
              panel-এ যেন create করে রাখা যায় আর [product upload-এ] যেন just
              সে data আসে।"*

              Bundles আর "Why buy from us"-এর পাশেই, কারণ তিনটেই একই জিনিস:
              category-তে একবার লেখা, তার সব product-এ দেখা যায়।
            */}
            <Section title="Product page — badges & what's inside" icon="check">
              <p className="text-[13px] text-body-soft mt-0 mb-3">
                Written once here for every product in this category. A product that needs
                something different overrides it on its own page.
              </p>
              <CategoryStoryEditor categoryId={node.id} />
            </Section>

            <Section title="Why buy from us" icon="sparkle">
              <p className="text-[13px] text-body-soft mt-0 mb-3">
                The three cards below the fold on every product page in this category.
                {node.parentId
                  ? " Leave them empty to use the parent category's."
                  : " A sub-category with none of its own will use these."}
              </p>
              <CraftEditor owner={{ categoryId: node.id }} />
            </Section>

            <Section title="This category's page" icon="layers">
              <div className="flex items-start gap-3 bg-lavender/40 border border-lavender-deep rounded-[12px] px-4 py-3.5">
                <span className="mt-0.5 text-purple shrink-0"><Icon name="layers" size={16} /></span>
                <div className="min-w-0">
                  <p className="text-[13px] text-body m-0">
                    The banner and its picture, the wording above each section, which
                    sections show, and this category's questions are all set together
                    on one screen — the same way the homepage is arranged.
                  </p>
                  <a href="/storefront/category-page" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-orchid hover:underline mt-1.5">
                    Open Storefront → Category pages →
                  </a>
                </div>
              </div>
            </Section>
          </>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-lavender-deep mt-2">
          {!isNew ? (
            <button onClick={onDelete} disabled={!canDelete} title={canDelete ? "Delete category" : "Move its products & sub-categories first"} className={"text-[13px] font-medium inline-flex items-center gap-1.5 mt-4 " + (canDelete ? "text-[#c0392b] hover:underline" : "text-body-soft/50 cursor-not-allowed")}>
              <Icon name="trash" size={15} /> Delete category
            </button>
          ) : (<span />)}
          <button onClick={save} disabled={saving || !name.trim()} className="bg-purple hover:bg-purple-deep disabled:opacity-60 text-white text-[13.5px] font-medium px-6 py-2.5 rounded-[11px] shadow-soft mt-4 inline-flex items-center gap-1.5">
            <Icon name="check" size={15} /> {saving ? "Saving…" : "Save category"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, preview, children }: { title: string; icon: string; preview?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-[24px] h-[24px] rounded-[7px] grid place-items-center text-white bg-orchid"><Icon name={icon} size={13} /></span>
        <span className="font-display text-[15px] text-purple">{title}</span>
        {preview && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#fff4e6] text-[#b45309] border border-[#fce4c4]">saves with Media library</span>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/*
  A <div>, not a <label>.

  `Field` wraps the OG image drop, and a <label> passes a click on its caption
  to the first form control inside it — so clicking the words "OG image" opened
  the file dialog. Found on the Collections screen, fixed everywhere it appears.
*/
function Field({ label, required, preview, children }: { label: string; required?: boolean; preview?: boolean; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="text-[12.5px] font-medium text-body flex items-center gap-1.5 mb-1.5">
        {label}
        {required && <span className="text-[#c0392b]">*</span>}
        {preview && <span className="w-1.5 h-1.5 rounded-full bg-[#d98a0f]" title="Saves with Media library" />}
      </span>
      {children}
    </div>
  );
}

function ToggleField({ label, hint, on, onToggle }: { label: string; hint: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="border border-lavender-deep rounded-[12px] px-3.5 py-3 flex items-start justify-between gap-3">
      <div>
        <div className="text-[13px] font-medium text-purple">{label}</div>
        <div className="text-[13px] text-body-soft mt-0.5">{hint}</div>
      </div>
      <button onClick={onToggle} className={"relative rounded-full transition-colors shrink-0 mt-0.5 " + (on ? "bg-orchid" : "bg-lavender-deep")} style={{ width: 38, height: 22 }}>
        <span className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all" style={{ width: 16, height: 16, left: on ? 19 : 3 }} />
      </button>
    </div>
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
