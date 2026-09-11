"use client";

import { useEffect, useState } from "react";
import {
  listCategoryTree, listJournalPosts, listGiftFinderSteps, listShopProducts, uploadImage, listFaqs,
  type ApiPageSection, type ApiCategoryNode, type ApiJournalPost, type ApiShopCard,
} from "../_data/api";

/*
  Storefront · Homepage layout — the settings a BUILT-IN section has of its own
  (4 Sep 2026).

  The homepage audit of 4 Sep listed what a section decided for itself in
  code: the Best Sellers tabs (five slugs from the July mock that matched no
  live category), its rule (a popularity sort padded with newest products),
  how many cards, what the button said, how many articles, the gift finder's
  questions. Every one of those is a decision the owner should be making, and
  now makes here — on the same row of the same list that switches the section
  on and off, opened by the gear.

  The API sanitises everything sent from here and answers with the settings
  in force, so the row on screen always shows what the shop is actually doing.
*/

type Cfg = Record<string, unknown>;
type Save = (partial: Cfg) => Promise<void>;

const MODES: { v: string; label: string; hint: string }[] = [
  { v: "AUTO", label: "Automatic", hint: "only products that have earned the Best seller badge" },
  { v: "MANUAL", label: "I'll choose", hint: "your own list, in your order" },
  { v: "AUTO_FILL", label: "Automatic, topped up", hint: "badge holders first, then the rest by real sales" },
];

export default function SectionSettings({ row, onSave }: { row: ApiPageSection; onSave: Save }) {
  const c = row.config;
  if (row.key === "bestsellers") return <BestSellerSettings c={c} save={onSave} />;
  if (row.key === "categories") return <CategorySettings c={c} save={onSave} />;
  if (row.key === "blog") return <BlogSettings c={c} save={onSave} />;
  if (row.key === "giftfinder") return <GiftFinderSettings c={c} save={onSave} />;
  if (row.key === "delivery") return <DeliverySettings c={c} save={onSave} />;
  if (row.key === "about") return <AboutSettings c={c} save={onSave} />;
  if (row.key === "faq") return <FaqSettings c={c} save={onSave} />;
  return null;
}

/* ═══════════════════ Best Sellers ═══════════════════ */

function BestSellerSettings({ c, save }: { c: Cfg; save: Save }) {
  const [cats, setCats] = useState<ApiCategoryNode[]>([]);
  useEffect(() => {
    listCategoryTree().then((t) => setCats(t.filter((x) => !x.parentId && x.isActive))).catch(() => setCats([]));
  }, []);

  const mode = String(c.mode ?? "AUTO");
  const chosen = Array.isArray(c.categories) ? (c.categories as string[]) : null;
  const featured = cats.filter((x) => x.isFeatured).map((x) => x.slug);
  const tabs = chosen ?? featured;
  const nameOf = (slug: string) => cats.find((x) => x.slug === slug)?.name ?? slug;

  const writeTabs = (next: string[]) => save({ categories: next });
  const toggleTab = (slug: string) => writeTabs(tabs.includes(slug) ? tabs.filter((s) => s !== slug) : [...tabs, slug]);
  const moveTab = (i: number, dir: -1 | 1) => {
    const next = [...tabs];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    return writeTabs(next);
  };

  return (
    <div className="space-y-4">
      <F label="What goes in this grid">
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.v}
              onClick={() => mode !== m.v && save({ mode: m.v })}
              title={m.hint}
              className={"text-[12.5px] font-semibold px-3.5 py-2 rounded-full border transition-colors " +
                (mode === m.v ? "bg-purple text-white border-purple shadow-sm" : "bg-white text-body border-lavender-deep hover:border-orchid")}
            >
              {m.label}
            </button>
          ))}
        </div>
      </F>

      {mode === "MANUAL" && <ProductPicker picked={(c.products as string[] | undefined) ?? []} onChange={(p) => save({ products: p })} />}

      <F
        label="Category tabs"
        hint={chosen ? "your own choice and order" : "following the homepage categories"}
      >
        {tabs.length > 0 && (
          <div className="rounded-[12px] border border-lavender-deep bg-white overflow-hidden mb-2 max-w-[520px]">
            {tabs.map((slug, i) => (
              <div key={slug} className="flex items-center gap-2.5 px-3 py-2 border-b border-[#efe6f5] last:border-b-0">
                <span className="w-[20px] text-[12px] text-body-soft tabular-nums">{i + 1}</span>
                <span className="flex-1 min-w-0 text-[13px] text-purple truncate">{nameOf(slug)}</span>
                <Arrow onClick={() => moveTab(i, -1)} disabled={i === 0} title="Move up">↑</Arrow>
                <Arrow onClick={() => moveTab(i, 1)} disabled={i === tabs.length - 1} title="Move down">↓</Arrow>
                <Arrow onClick={() => toggleTab(slug)} title="Take it out" danger>✕</Arrow>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {cats.filter((x) => !tabs.includes(x.slug)).map((x) => (
            <button
              key={x.id}
              onClick={() => toggleTab(x.slug)}
              className="text-[12.5px] px-3 py-1.5 rounded-full border bg-white text-body border-lavender-deep hover:border-orchid transition-colors"
            >
              {x.name}{x.isFeatured ? " ·" : ""}
            </button>
          ))}
          {chosen && (
            <button onClick={() => save({ categories: null })} className="text-[12px] text-body-soft hover:text-purple px-2 py-1.5">
              Use the featured categories again
            </button>
          )}
        </div>
      </F>

      <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-3 max-w-[520px]">
        <F label="Cards per tab">
          <NumberBox value={Number(c.perTab ?? 8)} min={2} max={12} onCommit={(n) => save({ perTab: n })} />
        </F>
        <F label={'Label of the "All" tab'}>
          <TextBox value={String(c.allLabel ?? "")} onCommit={(v) => save({ allLabel: v })} />
        </F>
      </div>

      <ViewAllFields c={c} save={save} />

      <F label="When there is nothing to show">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-[720px]">
          <TextBox value={String(c.emptyTitle ?? "")} placeholder="Nothing here yet" onCommit={(v) => save({ emptyTitle: v })} />
          <TextBox value={String(c.emptyText ?? "")} placeholder="More gifts for your area are coming soon." onCommit={(v) => save({ emptyText: v })} />
        </div>
      </F>
    </div>
  );
}

/** hand-picking products — the same shape as the category pages' rails */
function ProductPicker({ picked, onChange }: { picked: string[]; onChange: (next: string[]) => void }) {
  const [q, setQ] = useState("");
  const [pool, setPool] = useState<ApiShopCard[]>([]);
  const [known, setKnown] = useState<Record<string, string>>({});

  useEffect(() => {
    let dead = false;
    const t = setTimeout(() => {
      listShopProducts({ search: q, limit: 60 })
        .then((r) => {
          if (dead) return;
          setPool(r.items);
          setKnown((k) => ({ ...k, ...Object.fromEntries(r.items.map((i) => [i.slug, i.name])) }));
        })
        .catch(() => { if (!dead) setPool([]); });
    }, 250);
    return () => { dead = true; clearTimeout(t); };
  }, [q]);

  const move = (i: number, dir: -1 | 1) => {
    const next = [...picked];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <F label="Your list">
      {picked.length === 0 ? (
        <p className="text-[11.5px] text-[#8a6414] m-0 mb-2">Nothing picked — filling automatically.</p>
      ) : (
        <div className="rounded-[12px] border border-lavender-deep bg-white overflow-hidden mb-2 max-w-[520px]">
          {picked.map((s, i) => (
            <div key={s} className="flex items-center gap-2.5 px-3 py-2 border-b border-[#efe6f5] last:border-b-0">
              <span className="w-[20px] text-[12px] text-body-soft tabular-nums">{i + 1}</span>
              <span className="flex-1 min-w-0 text-[13px] text-purple truncate">{known[s] ?? s}</span>
              <Arrow onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</Arrow>
              <Arrow onClick={() => move(i, 1)} disabled={i === picked.length - 1} title="Move down">↓</Arrow>
              <Arrow onClick={() => onChange(picked.filter((x) => x !== s))} title="Take it out" danger>✕</Arrow>
            </div>
          ))}
        </div>
      )}
      <input className="ipt mb-2 max-w-[520px]" placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex flex-wrap gap-1.5 max-h-[190px] overflow-y-auto">
        {pool.filter((p) => !picked.includes(p.slug)).map((p) => (
          <button
            key={p.slug}
            onClick={() => picked.length < 40 && onChange([...picked, p.slug])}
            className="text-[12.5px] px-3 py-1.5 rounded-full border bg-white text-body border-lavender-deep hover:border-orchid transition-colors"
          >
            {p.name}{p.best ? " ★" : ""} <span className="text-body-soft">৳{Math.round(p.pricePaisa / 100).toLocaleString("en-BD")}</span>
          </button>
        ))}
      </div>
    </F>
  );
}

/* ═══════════════════ Shop by Category ═══════════════════ */

function CategorySettings({ c, save }: { c: Cfg; save: Save }) {
  return (
    <F label="How many cards at most" hint="0 = all">
      <NumberBox value={Number(c.limit ?? 0)} min={0} max={24} onCommit={(n) => save({ limit: n })} />
    </F>
  );
}

/* ═══════════════════ Latest Articles ═══════════════════ */

function BlogSettings({ c, save }: { c: Cfg; save: Save }) {
  const [posts, setPosts] = useState<ApiJournalPost[]>([]);
  useEffect(() => {
    listJournalPosts({ published: "true" }).then((p) => setPosts(p.filter((x) => x.isPublished))).catch(() => setPosts([]));
  }, []);
  const picked = Array.isArray(c.slugs) ? (c.slugs as string[]) : [];
  const nameOf = (s: string) => posts.find((p) => p.slug === s)?.title ?? s;
  const move = (i: number, dir: -1 | 1) => {
    const next = [...picked];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    return save({ slugs: next });
  };

  return (
    <div className="space-y-4">
      <F label="How many articles">
        <NumberBox value={Number(c.count ?? 3)} min={1} max={6} onCommit={(n) => save({ count: n })} />
      </F>
      <F label="Which articles" hint={picked.length ? "your picks, in this order" : "the newest ones"}>
        {picked.length > 0 && (
          <div className="rounded-[12px] border border-lavender-deep bg-white overflow-hidden mb-2 max-w-[520px]">
            {picked.map((s, i) => (
              <div key={s} className="flex items-center gap-2.5 px-3 py-2 border-b border-[#efe6f5] last:border-b-0">
                <span className="w-[20px] text-[12px] text-body-soft tabular-nums">{i + 1}</span>
                <span className="flex-1 min-w-0 text-[13px] text-purple truncate">{nameOf(s)}</span>
                <Arrow onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</Arrow>
                <Arrow onClick={() => move(i, 1)} disabled={i === picked.length - 1} title="Move down">↓</Arrow>
                <Arrow onClick={() => save({ slugs: picked.filter((x) => x !== s) })} title="Take it out" danger>✕</Arrow>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 max-h-[190px] overflow-y-auto">
          {posts.filter((p) => !picked.includes(p.slug)).map((p) => (
            <button
              key={p.id}
              onClick={() => picked.length < 6 && save({ slugs: [...picked, p.slug] })}
              className="text-[12.5px] px-3 py-1.5 rounded-full border bg-white text-body border-lavender-deep hover:border-orchid transition-colors"
            >
              {p.title}
            </button>
          ))}
        </div>
      </F>
    </div>
  );
}

/* ═══════════════════ Gift Finder ═══════════════════ */

export function GiftFinderSettings({ c, save }: { c: Cfg; save: Save }) {
  const [steps, setSteps] = useState<{ param: string; title: string }[]>([]);
  useEffect(() => { listGiftFinderSteps().then(setSteps).catch(() => setSteps([])); }, []);
  const questions = (c.questions as Record<string, string> | undefined) ?? {};
  const hints = (c.hints as Record<string, string> | undefined) ?? {};
  const [uploading, setUploading] = useState(false);
  const panelImage = String(c.panelImageUrl ?? "");

  async function pickImage(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(file, "banners");
      await save({ panelImageUrl: url });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <F label="The purple panel on the left">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-[720px]">
          <div>
            <span className="text-[11px] text-body-soft block mb-1">Title</span>
            <TextBox value={String(c.panelTitle ?? "")} placeholder="It's better when it's personal" onCommit={(v) => save({ panelTitle: v })} />
          </div>
          <div>
            <span className="text-[11px] text-body-soft block mb-1">Handwritten line at the bottom</span>
            <TextBox value={String(c.panelScript ?? "")} placeholder="Thoughtful Gifts, Happier People" onCommit={(v) => save({ panelScript: v })} />
          </div>
          <div className="md:col-span-2">
            <span className="text-[11px] text-body-soft block mb-1">Text</span>
            <TextBox value={String(c.panelText ?? "")} placeholder="Tell us a bit about your gifting moment…" onCommit={(v) => save({ panelText: v })} />
          </div>
          <div className="md:col-span-2">
            <span className="text-[11px] text-body-soft block mb-1">Picture in the panel</span>
            <div className="flex items-center gap-3">
              <label className="relative block w-[120px] aspect-square rounded-[12px] border-2 border-dashed border-lavender-deep bg-lavender/40 hover:border-orchid cursor-pointer overflow-hidden grid place-items-center">
                {panelImage
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={panelImage} alt="" className={"absolute inset-0 w-full h-full object-contain " + (uploading ? "opacity-40" : "")} />
                  : <span className="text-body-soft text-[11px] text-center px-2">{uploading ? "Uploading…" : "Click to upload"}</span>}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(e) => pickImage(e.target.files?.[0] ?? null)} />
              </label>
              {panelImage && !uploading && <button onClick={() => save({ panelImageUrl: "" })} className="text-[13px] text-body-soft hover:text-[#c0392b]">Remove</button>}
            </div>
          </div>
        </div>
      </F>
      <F label="The question above each step, and the small line under it">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-[720px]">
          {steps.map((s) => (
            <div key={s.param} className="space-y-1.5">
              <span className="text-[11px] text-body-soft block">{s.title}</span>
              <TextBox
                value={questions[s.param] ?? ""}
                placeholder={s.title}
                onCommit={(v) => save({ questions: { ...questions, [s.param]: v } })}
              />
              <TextBox
                value={hints[s.param] ?? ""}
                placeholder="Small line under the question"
                onCommit={(v) => save({ hints: { ...hints, [s.param]: v } })}
              />
            </div>
          ))}
        </div>
      </F>
      <F label="Buttons and the side caption">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-[720px]">
          <div><span className="text-[11px] text-body-soft block mb-1">Next</span><TextBox value={String(c.nextLabel ?? "")} placeholder="Next Step →" onCommit={(v) => save({ nextLabel: v })} /></div>
          <div><span className="text-[11px] text-body-soft block mb-1">Last step</span><TextBox value={String(c.doneLabel ?? "")} placeholder="Show My Gifts →" onCommit={(v) => save({ doneLabel: v })} /></div>
          <div><span className="text-[11px] text-body-soft block mb-1">Skip · empty = no skip</span><TextBox value={String(c.skipLabel ?? "")} placeholder="Skip for now" onCommit={(v) => save({ skipLabel: v })} /></div>
          <div><span className="text-[11px] text-body-soft block mb-1">Side caption · empty = none</span><TextBox value={String(c.sideCaption ?? "")} placeholder="Small gestures, big happiness" onCommit={(v) => save({ sideCaption: v })} /></div>
        </div>
      </F>
    </div>
  );
}

/* ═══════════════════ Delivery band ═══════════════════ */

function DeliverySettings({ c, save }: { c: Cfg; save: Save }) {
  return (
    <div className="space-y-4">
      <F label="Cards under each tab">
        <NumberBox value={Number(c.perTab ?? 4)} min={2} max={8} onCommit={(n) => save({ perTab: n })} />
      </F>
      <ViewAllFields c={c} save={save} />
    </div>
  );
}

/* ═══════════════════ About Radian ═══════════════════ */

type IconRow = { icon: string; title: string; sub: string };
const ABOUT_ICONS = ["flower", "gift", "truck", "pin", "heart", "star", "shield", "leaf", "cake", "clock", "medal", "box", "globe", "check", "phone", "chat"];

/** a list of icon + two-line rows — the chips under the story and the cards beside the picture */
function IconRows({ rows, max, onChange, placeholderTitle, placeholderSub }: {
  rows: IconRow[]; max: number; onChange: (next: IconRow[]) => void; placeholderTitle: string; placeholderSub: string;
}) {
  const set = (i: number, patch: Partial<IconRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2 max-w-[720px]">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[120px_1fr_1fr_auto] gap-2 items-center">
          <select className="ipt" value={r.icon} onChange={(e) => set(i, { icon: e.target.value })}>
            <option value="">No icon</option>
            {ABOUT_ICONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <TextBox value={r.title} placeholder={placeholderTitle} onCommit={(v) => set(i, { title: v })} />
          <TextBox value={r.sub} placeholder={placeholderSub} onCommit={(v) => set(i, { sub: v })} />
          <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-[13px] text-body-soft hover:text-[#c0392b] px-1" title="Remove">✕</button>
        </div>
      ))}
      {rows.length < max && (
        <button type="button" onClick={() => onChange([...rows, { icon: "", title: "", sub: "" }])} className="text-[13px] font-semibold text-purple hover:text-orchid">+ Add one</button>
      )}
    </div>
  );
}

export function AboutSettings({ c, save, variant = "card" }: { c: Cfg; save: Save; variant?: "card" | "article" }) {
  const [uploading, setUploading] = useState(false);
  const image = String(c.imageUrl ?? "");
  const features = (c.features as IconRow[] | undefined) ?? [];
  const stats = (c.stats as IconRow[] | undefined) ?? [];

  async function pickImage(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(file, "banners");
      await save({ imageUrl: url });
    } finally {
      setUploading(false);
    }
  }

  if (variant === "article") {
    return (
      <div className="space-y-4">
        <F label="The words" hint="blank line = new paragraph">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-[720px]">
            <div><span className="text-[11px] text-body-soft block mb-1">Small line above</span><TextBox value={String(c.eyebrow ?? "")} placeholder="Fresh flowers in Dhaka" onCommit={(v) => save({ eyebrow: v })} /></div>
            <div><span className="text-[11px] text-body-soft block mb-1">Heading</span><TextBox value={String(c.title ?? "")} placeholder="Fresh Flower Delivery in Dhaka" onCommit={(v) => save({ title: v })} /></div>
            <div className="md:col-span-2">
              <span className="text-[11px] text-body-soft block mb-1">Text</span>
              <TextArea value={String(c.body ?? "")} placeholder="Looking for fresh flowers in Dhaka? …" onCommit={(v) => save({ body: v })} />
            </div>
          </div>
        </F>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <F label="The words" hint="blank line = new paragraph">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-[720px]">
          <div><span className="text-[11px] text-body-soft block mb-1">Small line above</span><TextBox value={String(c.eyebrow ?? "")} placeholder="About Radian" onCommit={(v) => save({ eyebrow: v })} /></div>
          <div><span className="text-[11px] text-body-soft block mb-1">Heading</span><TextBox value={String(c.title ?? "")} placeholder="Radian Flower & Gift Shop — Bringing Smiles Across Bangladesh" onCommit={(v) => save({ title: v })} /></div>
          <div className="md:col-span-2">
            <span className="text-[11px] text-body-soft block mb-1">Story</span>
            <TextArea value={String(c.body ?? "")} placeholder="Looking for the best flower shop in Bangladesh? …" onCommit={(v) => save({ body: v })} />
          </div>
        </div>
      </F>
      <F label="The highlighted line">
        <div className="grid grid-cols-[120px_1fr_2fr] gap-2 max-w-[720px]">
          <select className="ipt" value={String(c.highlightIcon ?? "truck")} onChange={(e) => save({ highlightIcon: e.target.value })}>
            <option value="">No icon</option>
            {ABOUT_ICONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <TextBox value={String(c.highlightBold ?? "")} placeholder="same-day online flower delivery" onCommit={(v) => save({ highlightBold: v })} />
          <TextBox value={String(c.highlightText ?? "")} placeholder="in Dhaka and reliable nationwide shipping…" onCommit={(v) => save({ highlightText: v })} />
        </div>
      </F>
      <F label="The four points under the story" hint="icon · bold line · small line">
        <IconRows rows={features} max={6} onChange={(next) => save({ features: next })} placeholderTitle="Fresh &" placeholderSub="Premium Flowers" />
      </F>
      <F label="The button">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-[720px]">
          <TextBox value={String(c.ctaText ?? "")} placeholder="Read more about Radian" onCommit={(v) => save({ ctaText: v })} />
          <TextBox value={String(c.ctaHref ?? "")} placeholder="/about" onCommit={(v) => save({ ctaHref: v })} />
        </div>
      </F>
      <F label="The picture" hint="upright, 4:5">
        <div className="flex items-center gap-3">
          <label className="relative block w-[120px] aspect-[4/5] rounded-[12px] border-2 border-dashed border-lavender-deep bg-lavender/40 hover:border-orchid cursor-pointer overflow-hidden grid place-items-center">
            {image
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={image} alt="" className={"absolute inset-0 w-full h-full object-cover " + (uploading ? "opacity-40" : "")} />
              : <span className="text-body-soft text-[11px] text-center px-2">{uploading ? "Uploading…" : "Click to upload"}</span>}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(e) => pickImage(e.target.files?.[0] ?? null)} />
          </label>
          {image && !uploading && <button onClick={() => save({ imageUrl: "" })} className="text-[13px] text-body-soft hover:text-[#c0392b]">Remove</button>}
        </div>
      </F>
      <F label="Beside the picture">
        <div className="space-y-3 max-w-[720px]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><span className="text-[11px] text-body-soft block mb-1">Handwritten line</span><TextBox value={String(c.scriptLine ?? "")} placeholder="Flowers Make Better Days" onCommit={(v) => save({ scriptLine: v })} /></div>
            <div><span className="text-[11px] text-body-soft block mb-1">Caption at the bottom</span><TextBox value={String(c.sideCaption ?? "")} placeholder="A small gift, a brighter tomorrow" onCommit={(v) => save({ sideCaption: v })} /></div>
          </div>
          <IconRows rows={stats} max={4} onChange={(next) => save({ stats: next })} placeholderTitle="10K+" placeholderSub="Happy Customers" />
        </div>
      </F>
    </div>
  );
}

/* ═══════════════════ Questions people ask ═══════════════════ */

function FaqSettings({ c, save }: { c: Cfg; save: Save }) {
  const [groups, setGroups] = useState<string[]>([]);
  useEffect(() => {
    listFaqs().then((rows) => setGroups(Array.from(new Set(rows.map((r) => r.groupName))))).catch(() => setGroups([]));
  }, []);
  return (
    <div className="space-y-4">
      <F label="Which questions">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-3 max-w-[720px]">
          <select className="ipt" value={String(c.group ?? "")} onChange={(e) => save({ group: e.target.value })}>
            <option value="">Every group</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <NumberBox value={Number(c.count ?? 7)} min={2} max={12} onCommit={(n) => save({ count: n })} />
        </div>
      </F>
      <F label="Line at the very bottom" hint="empty = no line">
        <div className="max-w-[720px]">
          <TextBox value={String(c.footerLine ?? "")} placeholder="Thoughtful gifts. Happier people." onCommit={(v) => save({ footerLine: v })} />
        </div>
      </F>
      <F label="The link under the list" hint="empty = no link">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-[720px]">
          <TextBox value={String(c.linkText ?? "")} placeholder="See every question" onCommit={(v) => save({ linkText: v })} />
          <TextBox value={String(c.linkHref ?? "")} placeholder="/faq" onCommit={(v) => save({ linkHref: v })} />
        </div>
      </F>
    </div>
  );
}

/* ═══════════════════ shared pieces ═══════════════════ */

function TextArea({ value, placeholder, onCommit }: { value: string; placeholder?: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <textarea
      className="ipt min-h-[140px]"
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== value) onCommit(v); }}
    />
  );
}

function ViewAllFields({ c, save }: { c: Cfg; save: Save }) {
  const show = c.showViewAll !== false;
  return (
    <F label="The button under the cards">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex p-[3px] rounded-full bg-lavender/70">
          {[
            { on: true, label: "Show", fill: "linear-gradient(135deg,#12795a,#3ec294)" },
            { on: false, label: "Hide", fill: "linear-gradient(135deg,#8a6414,#d9a441)" },
          ].map((o) => (
            <button
              key={o.label}
              onClick={() => show !== o.on && save({ showViewAll: o.on })}
              className={"text-[11.5px] font-semibold px-3.5 py-[6px] rounded-full transition-all " +
                (show === o.on ? "text-white shadow-sm" : "text-body-soft hover:text-purple")}
              style={show === o.on ? { background: o.fill } : undefined}
            >
              {o.label}
            </button>
          ))}
        </div>
        {show && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-w-[260px] max-w-[520px]">
            <TextBox value={String(c.viewAllText ?? "")} placeholder="View All Products" onCommit={(v) => save({ viewAllText: v })} />
            <TextBox value={String(c.viewAllHref ?? "")} placeholder="/products" onCommit={(v) => save({ viewAllHref: v })} />
          </div>
        )}
      </div>
    </F>
  );
}

function Arrow({ children, onClick, disabled, title, danger }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={"w-[28px] h-[28px] rounded-[8px] grid place-items-center bg-lavender transition-colors text-[13px] disabled:opacity-30 " +
        (danger ? "text-body-soft hover:bg-[#fdecea] hover:text-[#c0392b]" : "text-purple hover:bg-purple hover:text-white disabled:hover:bg-lavender disabled:hover:text-purple")}
    >
      {children}
    </button>
  );
}

/** commits on blur or Enter, and only when the value actually changed */
function TextBox({ value, placeholder, onCommit }: { value: string; placeholder?: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) onCommit(v); };
  return (
    <input
      className="ipt"
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

function NumberBox({ value, min, max, onCommit }: { value: number; min: number; max: number; onCommit: (n: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const n = Math.min(max, Math.max(min, Math.round(Number(v) || min)));
    setV(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <input
      type="number" min={min} max={max}
      className="ipt w-[110px]"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[12.5px] font-medium text-body block mb-1.5">
        {label}
        {hint && <span className="block text-[11px] text-body-soft font-normal mt-0.5">{hint}</span>}
      </span>
      {children}
    </div>
  );
}
