"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import SaveBar, { type SaveState } from "./SaveBar";
import { ModuleCard, ModuleHeader, StatTiles } from "./ModuleShell";
import RichText from "./RichText";
import {
  listJournalPosts, createJournalPost, updateJournalPost, deleteJournalPost, uploadImage,
  type ApiJournalPost,
} from "../_data/api";

/*
  Storefront · Journal — v2 (12 Aug 2026), in the Reviews rail pattern.

  WHAT WAS WRONG WITH v1, found on the owner's screen:
   · "Write an article" CREATED a row on click, titled "New article". The
     second click collided with the first one's derived slug and the whole
     page wore a red "already used" bar. Same disease the review composer
     had: creating before the owner has typed anything. The dialog now
     creates ON SAVE, and the server uniquifies derived slugs anyway.
   · Everything edited inline in an expanding row — title, cover, slug and
     a rich-text editor all at once. Now: cards with two actions (Edit /
     Publish), and one dialog that holds the whole article.
   · The dialog closes ONLY from × / Cancel — never from a click or a
     text-selection drag that ends on the overlay.

  STILL TRUE: a post is born UNPUBLISHED; the homepage section stays hidden
  until something is published, and shows the newest three.
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

const SECTIONS = [
  {
    id: "all", label: "All articles", blurb: "Everything you have written", icon: "grid",
    tint: "var(--t-accent)", edge: "var(--l-accent)", chip: "var(--s-accent)",
    ink: "var(--t-accent)", sub: "var(--t-accent)", strong: "var(--t-accent)",
    fill: "linear-gradient(100deg,var(--a-solid),var(--o-solid))", glow: "rgba(71,0,102,.30)", soft: "var(--o-solid)",
  },
  {
    id: "published", label: "Published", blurb: "Live on the website", icon: "eye",
    tint: "var(--t-ok)", edge: "var(--l-ok)", chip: "var(--s-ok)",
    ink: "var(--t-ok)", sub: "var(--t-ok)", strong: "var(--t-ok)",
    fill: "linear-gradient(100deg,var(--f-ok),var(--f-ok))", glow: "rgba(14,122,61,.25)", soft: "var(--t-ok)",
  },
  {
    id: "drafts", label: "Drafts", blurb: "Only you can see these", icon: "clock",
    tint: "var(--t-warn)", edge: "var(--l-warn)", chip: "var(--s-warn)",
    ink: "var(--t-warn)", sub: "var(--t-warn)", strong: "var(--t-warn)",
    fill: "linear-gradient(100deg,var(--f-warn),var(--f-warn))", glow: "rgba(138,90,0,.25)", soft: "var(--t-warn)",
  },
  {
    id: "homepage", label: "On the homepage", blurb: "The newest three", icon: "star",
    tint: "var(--t-orchid)", edge: "var(--l-orchid)", chip: "var(--s-orchid)",
    ink: "var(--t-orchid)", sub: "var(--t-gold)", strong: "var(--t-gold)",
    fill: "linear-gradient(100deg,var(--t-gold),var(--t-gold))", glow: "rgba(153,53,86,.28)", soft: "var(--t-orchid)",
  },
] as const;
type SecId = (typeof SECTIONS)[number]["id"];

export default function JournalView() {
  const [rows, setRows] = useState<ApiJournalPost[]>([]);
  const [sec, setSec] = useState<SecId>("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  /** null = closed · "new" = composing · ApiJournalPost = editing */
  const [editFor, setEditFor] = useState<ApiJournalPost | "new" | null>(null);

  const flash = (m: string) => { setOk(m); setSaveState("saved"); setTimeout(() => setOk(null), 2000); };
  const fail = (e: unknown, what: string) => { setErr(e instanceof Error ? e.message : what); setSaveState("error"); };

  useEffect(() => { void reload(); }, []);
  async function reload() {
    setLoading(true);
    try { setRows(await listJournalPosts()); setErr(null); }
    catch (e) { fail(e, "Could not load"); }
    finally { setLoading(false); }
  }

  async function patch(id: string, body: Parameters<typeof updateJournalPost>[1]) {
    setSaveState("saving");
    try {
      const u = await updateJournalPost(id, body);
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...u } : r)));
      flash("Saved");
    } catch (e) { fail(e, "Could not save"); }
  }

  const published = useMemo(() => rows.filter((r) => r.isPublished), [rows]);
  /** the newest three published — what the homepage section actually shows */
  const homepageIds = useMemo(() => new Set(
    [...published]
      .sort((a, b) => Date.parse(b.publishedAt ?? "0") - Date.parse(a.publishedAt ?? "0"))
      .slice(0, 3)
      .map((r) => r.id),
  ), [published]);

  const counts = useMemo<Record<SecId, number>>(() => ({
    all: rows.length,
    published: published.length,
    drafts: rows.length - published.length,
    homepage: homepageIds.size,
  }), [rows, published, homepageIds]);

  const shown = useMemo(() => {
    if (sec === "published") return rows.filter((r) => r.isPublished);
    if (sec === "drafts") return rows.filter((r) => !r.isPublished);
    if (sec === "homepage") return rows.filter((r) => homepageIds.has(r.id));
    return rows;
  }, [rows, sec, homepageIds]);

  const active = SECTIONS.find((s) => s.id === sec)!;

  return (
    <div className={WRAP}>
      <SaveBar state={saveState} onSave={() => flash("Saved")} />

      {err && (
        <div className="flex items-start gap-2 bg-[var(--s-bad)] border border-[var(--l-bad)] rounded-[11px] px-3.5 py-2.5 text-[12px] text-[var(--t-bad)] mb-4">
          <span className="mt-0.5 shrink-0"><Icon name="alert" size={14} /></span><span>{err}</span>
        </div>
      )}
      {ok && <div className="bg-[var(--s-ok)] border border-[var(--l-ok)] rounded-[11px] px-3.5 py-2 text-[12px] text-[var(--t-ok)] mb-4">{ok}</div>}

      <ModuleCard>
        <ModuleHeader
          tone="orchid"
          icon="book"
          title="Journal"
          blurb={counts.published === 0
            ? "Nothing published yet"
            : "Newest three show on the homepage"}
          chips={counts.drafts > 0
            ? [{ label: `${counts.drafts} draft${counts.drafts > 1 ? "s" : ""}`, bg: "var(--s-accent)", color: "var(--t-orchid)" }]
            : []}
          action={{ label: "＋ Write an article", onClick: () => setEditFor("new") }}
        />
        <StatTiles tone="orchid" stats={[
          { label: "Published", value: counts.published },
          { label: "Drafts", value: counts.drafts },
          { label: "On the homepage", value: counts.homepage },
          { label: "Total articles", value: counts.all },
        ]} />

        <div className="grid grid-cols-1 md:grid-cols-[236px_minmax(0,1fr)] gap-5 items-start mx-5 mt-5 mb-5">
          {/* ---- the colourful section rail ---- */}
          <nav className="hidden md:grid gap-2 md:sticky md:top-[16px] self-start md:max-h-[calc(100vh-32px)] md:overflow-y-auto">
            {SECTIONS.map((s) => {
              const on = sec === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSec(s.id)}
                  className="w-full min-w-0 overflow-hidden flex items-center gap-3 px-3.5 py-3 rounded-[14px] text-left transition-all"
                  style={on
                    ? { background: s.fill, border: "1px solid transparent", boxShadow: `0 5px 16px ${s.glow}` }
                    : { background: s.tint, border: `1px solid ${s.edge}` }}
                >
                  <span className="w-[34px] h-[34px] rounded-[11px] grid place-items-center shrink-0"
                    style={{ background: on ? "rgba(255,255,255,.22)" : s.chip, color: on ? "#fff" : s.strong }}>
                    <Icon name={s.icon} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium truncate"
                      style={{ color: on ? "#fff" : s.ink }}>{s.label}</span>
                    <span className="block text-[11px] truncate"
                      style={{ color: on ? s.soft : s.sub }}>{s.blurb}</span>
                  </span>
                  <span className="text-[11px] font-medium shrink-0 rounded-full grid place-items-center px-2 h-[20px]"
                    style={on
                      ? { background: "rgba(255,255,255,.25)", color: "#fff" }
                      : { background: s.strong, color: "#fff" }}>
                    {s.id === "homepage" ? `${counts.homepage}/3` : counts[s.id]}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* ---- the open section ---- */}
          <div className="flex-1 min-w-0">
            <div className="md:hidden mb-4">
              <select className="ipt h-[44px]" value={sec} onChange={(e) => setSec(e.target.value as SecId)}>
                {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-[30px] h-[30px] rounded-[10px] grid place-items-center"
                style={{ background: active.tint, color: active.strong }}>
                <Icon name={active.icon} size={16} />
              </span>
              <div>
                <p className="text-[15px] font-medium leading-tight" style={{ color: active.ink }}>{active.label}</p>
                <p className="text-[11.5px] text-body-soft leading-tight">{active.blurb}</p>
              </div>
            </div>

            <div className="space-y-3">
              {loading ? <p className="text-[13px] text-body-soft">Loading…</p> : shown.length === 0 ? (
                <p className="text-[13px] text-body-soft">
                  {sec === "drafts" ? "No drafts."
                    : sec === "homepage" ? "Nothing on the homepage yet."
                    : "Nothing written yet."}
                </p>
              ) : shown.map((r) => (
                <div key={r.id}
                  className={"rounded-[16px] border px-4 py-3.5 " +
                    (r.isPublished ? "border-lavender-deep bg-white" : "border-[var(--l-warn)] bg-[var(--s-warn)]")}>
                  <div className="flex items-center gap-3">
                    <span className="w-[64px] h-[44px] rounded-[10px] bg-lavender shrink-0 overflow-hidden grid place-items-center">
                      {r.coverUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={r.coverUrl} alt="" className="w-full h-full object-cover" />
                        : <span className="text-[9px] text-body-soft">no cover</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium text-purple">
                        {r.title}
                        {r.isPublished
                          ? <Badge bg="var(--s-ok)" color="var(--t-ok)">live</Badge>
                          : <Badge bg="var(--s-warn)" color="var(--t-warn)">draft</Badge>}
                        {homepageIds.has(r.id) && <Badge bg="var(--s-orchid)" color="var(--t-gold)">on homepage</Badge>}
                      </span>
                      <span className="block text-[11.5px] text-body-soft">
                        {r.words ? `${r.words} words` : "empty"}
                        {r.readMinutes ? ` · ${r.readMinutes} min read` : ""}
                        {r.author ? ` · by ${r.author}` : ""}
                        {r.publishedAt ? ` · ${new Date(r.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                      </span>
                      {r.excerpt && <span className="block text-[12px] text-body-soft mt-0.5 truncate">{r.excerpt}</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <ActionBtn onClick={() => setEditFor(r)}>Edit</ActionBtn>
                    {r.isPublished
                      ? <ActionBtn onClick={() => patch(r.id, { isPublished: false })}>Unpublish</ActionBtn>
                      : <ActionBtn solid onClick={() => patch(r.id, { isPublished: true })}>✓ Publish</ActionBtn>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ModuleCard>

      {editFor && (
        <ArticleDialog
          post={editFor === "new" ? null : editFor}
          onClose={() => setEditFor(null)}
          onSaved={async () => { setEditFor(null); await reload(); flash("Saved"); }}
          onError={(e) => fail(e, "Could not save")}
        />
      )}
    </div>
  );
}

/* ─── the article dialog — creates ON SAVE, never on open ─────────────────── */
function ArticleDialog({ post, onClose, onSaved, onError }: {
  post: ApiJournalPost | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (e: unknown) => void;
}) {
  const [title, setTitle] = useState(post?.title ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [author, setAuthor] = useState(post?.author ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [coverUrl, setCoverUrl] = useState<string | null>(post?.coverUrl ?? null);
  const [bodyHtml, setBodyHtml] = useState(post?.bodyHtml ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = title.trim().length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (post) {
        await updateJournalPost(post.id, {
          title: title.trim(),
          excerpt: excerpt.trim() || null,
          author: author.trim() || null,
          slug: slug.trim(),
          coverUrl,
          bodyHtml,
        });
      } else {
        /*  no slug sent — the server derives it from the title and makes it
            unique itself, so "already used" can never greet a new article  */
        await createJournalPost({
          title: title.trim(),
          excerpt: excerpt.trim() || null,
          author: author.trim() || null,
          coverUrl,
          bodyHtml,
          isPublished: false,
        });
      }
      await onSaved();
    } catch (e) { onError(e); setSaving(false); }
  }

  async function remove() {
    if (!post) return;
    if (!confirm("Remove this article?")) return;
    try { await deleteJournalPost(post.id); await onSaved(); }
    catch (e) { onError(e); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4 overflow-y-auto">
      <div className="bg-white rounded-[18px] shadow-xl w-full max-w-[860px] my-6">
        <div className="px-5 pt-5 pb-3 border-b border-lavender-deep flex items-center justify-between">
          <div>
            <p className="font-display text-[18px] text-purple">{post ? "Edit article" : "Write an article"}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-body-soft hover:text-purple text-[20px] leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <L label="Title">
            <input className="ipt" value={title} autoFocus placeholder="10 anniversary flowers, year by year"
              onChange={(e) => setTitle(e.target.value)} />
          </L>
          <L label="The line on the card" hint="one sentence">
            <input className="ipt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          </L>

          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
            <L label="Cover picture" hint="800 × 480 · wide">
              <label className="relative block w-full aspect-[5/3] rounded-[10px] border-2 border-dashed border-lavender-deep bg-lavender/40 hover:border-orchid cursor-pointer overflow-hidden grid place-items-center">
                {coverUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={coverUrl} alt="" className={"absolute inset-0 w-full h-full object-cover " + (uploading ? "opacity-40" : "")} />
                  : <span className="text-body-soft text-[11px]">{uploading ? "Uploading…" : "add a cover"}</span>}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]; if (!file) return;
                    setUploading(true);
                    try { const { url } = await uploadImage(file, "brand"); setCoverUrl(url); }
                    catch (er) { onError(er); }
                    finally { setUploading(false); }
                  }} />
              </label>
              {coverUrl && <button onClick={() => setCoverUrl(null)} className="text-[12px] text-body-soft hover:text-[var(--t-bad)] mt-1.5">Remove cover</button>}
            </L>
            <div className="space-y-4">
              <L label="Written by"><input className="ipt" value={author} placeholder="Radian"
                onChange={(e) => setAuthor(e.target.value)} /></L>
              {post && (
                <L label="Web address" hint="changing this breaks links already shared">
                  <input className="ipt" value={slug} onChange={(e) => setSlug(e.target.value)} />
                </L>
              )}
            </div>
          </div>

          <L label="The article">
            <RichText value={bodyHtml} onChange={setBodyHtml} />
          </L>
        </div>

        <div className="px-5 py-4 border-t border-lavender-deep flex items-center justify-between gap-2">
          {post
            ? <button onClick={remove} className="text-[12.5px] text-body-soft hover:text-[var(--t-bad)]">Remove this article</button>
            : <span />}
          <span className="flex items-center gap-2">
            <button onClick={onClose} className="text-[13px] text-body-soft hover:text-purple px-3 py-2">Cancel</button>
            <button onClick={save} disabled={!canSave}
              className={"text-[13px] font-medium px-5 py-2.5 rounded-[11px] text-white transition-opacity " +
                (canSave ? "bg-purple hover:bg-purple-deep" : "bg-purple/40 cursor-not-allowed")}>
              {saving ? "Saving…" : post ? "Save" : "Save draft"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── bits ────────────────────────────────────────────────────────────────── */
function ActionBtn({ children, onClick, solid }: {
  children: React.ReactNode; onClick: () => void; solid?: boolean;
}) {
  if (solid) {
    return (
      <button onClick={onClick} className="text-[12px] font-medium px-3.5 py-1.5 rounded-full text-white" style={{ background: "var(--s-ok)" }}>
        {children}
      </button>
    );
  }
  return (
    <button onClick={onClick}
      className="text-[12px] font-medium px-3.5 py-1.5 rounded-full border border-lavender-deep text-body hover:border-orchid hover:text-purple transition-colors">
      {children}
    </button>
  );
}

function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full ml-1.5 align-middle"
      style={{ background: bg, color }}>
      {children}
    </span>
  );
}

function L({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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
