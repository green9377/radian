"use client";

import { useEffect, useState } from "react";
import {
  listCategoryTree, listJournalPosts, listGiftFinderSteps, listShopProducts, uploadImage,
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
      <F label="What goes in this grid" hint="the badge is earned under Products → Badge rules; nothing typed in can put a product here">
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
        <p className="text-[11.5px] text-body-soft mt-1.5 m-0">{MODES.find((m) => m.v === mode)?.hint}</p>
      </F>

      {mode === "MANUAL" && <ProductPicker picked={(c.products as string[] | undefined) ?? []} onChange={(p) => save({ products: p })} />}

      <F
        label="Category tabs"
        hint={chosen
          ? "your own choice and order — click a category to add or remove it, use the arrows to order"
          : "following the categories featured on the homepage (Contents tab) — click one to start choosing yourself"}
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

      <F label="When there is nothing to show" hint="the words in the grid's place — for a zone with no best sellers yet">
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
    <F label="Your list" hint="click a product to add it — the order here is the order on the page; a tab shows the picks from its own category">
      {picked.length === 0 ? (
        <p className="text-[11.5px] text-[#8a6414] m-0 mb-2">
          Nothing picked yet, so the grid is still filling itself automatically.
        </p>
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
    <F label="How many cards at most" hint="0 = every category ticked under Contents">
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
      <F label="Which articles" hint={picked.length ? "your picks, in this order" : "the newest ones — click an article to choose yourself"}>
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

function GiftFinderSettings({ c, save }: { c: Cfg; save: Save }) {
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
      <F label="The purple panel on the left" hint="the words beside the steps — the reference's 'It's better when it's personal'">
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
            <span className="text-[11px] text-body-soft block mb-1">Picture in the panel · a cut-out (transparent PNG) sits best on the purple · empty = no picture</span>
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
      <F label="The question above each step, and the small line under it" hint="the choices themselves are the tags and budget cards">
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
          <div><span className="text-[11px] text-body-soft block mb-1">Side caption (right column) · empty = no column</span><TextBox value={String(c.sideCaption ?? "")} placeholder="Small gestures, big happiness" onCommit={(v) => save({ sideCaption: v })} /></div>
        </div>
      </F>
    </div>
  );
}

/* ═══════════════════ Delivery band ═══════════════════ */

function DeliverySettings({ c, save }: { c: Cfg; save: Save }) {
  return (
    <div className="space-y-4">
      <F label="Cards under each tab" hint="the tabs themselves are the delivery methods ticked under Contents">
        <NumberBox value={Number(c.perTab ?? 4)} min={2} max={8} onCommit={(n) => save({ perTab: n })} />
      </F>
      <ViewAllFields c={c} save={save} />
    </div>
  );
}

/* ═══════════════════ shared pieces ═══════════════════ */

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
