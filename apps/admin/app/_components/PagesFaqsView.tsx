"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import { ModuleCard, ModuleHeader, StatTiles } from "./ModuleShell";
import SaveBar, { type SaveState } from "./SaveBar";
import RichText from "./RichText";
import {
  listContentPages, createContentPage, updateContentPage, deleteContentPage,
  listFaqs, saveFaq, deleteFaq,
  type ApiContentPage, type ApiFaqEntry,
} from "../_data/api";

/*
  Storefront · Pages & FAQs — v2 (12 Aug 2026), in the Reviews/Journal rail.

  WHAT CHANGED:
   · "+ New page" and "+ New question" used to CREATE a row the moment they
     were clicked — an "Untitled page" / "New question…" landed in the list
     before the owner typed a word. Both are dialogs now that create ON
     SAVE, like the review composer and the article dialog.
   · The starter chips for the storefront's own routes (/terms, /privacy…)
     open the dialog PRE-FILLED instead of creating instantly.
   · Cards with Edit + Publish; the full form (slug, intro, body, footer
     switch) lives in a dialog that closes only from × / Cancel.

  STILL TRUE: slug IS the storefront address; publishing on a known slug
  replaces the built-in text. bKash and SSLCommerz want Terms + Refund live
  before approving a merchant account. FAQ group = the section heading on
  /faq, sortOrder = the order.
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

const KNOWN_SLUGS = [
  { slug: "terms", title: "Terms of Service" },
  { slug: "privacy-policy", title: "Privacy Policy" },
  { slug: "refund-policy", title: "Refund & Return Policy" },
  { slug: "about", title: "About Radian" },
  { slug: "contact", title: "Contact Us" },
  { slug: "delivery-info", title: "Delivery Information" },
];

const SECTIONS = [
  {
    id: "pages", label: "All pages", blurb: "Terms, privacy, refund and more", icon: "grid",
    tint: "var(--t-accent)", edge: "var(--l-accent)", chip: "var(--s-accent)",
    ink: "var(--t-accent)", sub: "var(--t-accent)", strong: "var(--t-accent)",
    fill: "linear-gradient(100deg,var(--a-solid),var(--o-solid))", glow: "rgba(71,0,102,.30)", soft: "var(--o-solid)",
  },
  {
    id: "live", label: "Live", blurb: "On the storefront now", icon: "eye",
    tint: "var(--f-ok)", edge: "var(--l-ok)", chip: "var(--s-ok)",
    ink: "var(--t-ok)", sub: "var(--t-ok)", strong: "var(--t-ok)",
    fill: "linear-gradient(100deg,var(--f-ok),var(--f-ok))", glow: "rgba(14,122,61,.25)", soft: "var(--t-ok)",
  },
  {
    id: "drafts", label: "Drafts", blurb: "Built-in text still showing", icon: "clock",
    tint: "var(--t-warn)", edge: "var(--l-warn)", chip: "var(--s-warn)",
    ink: "var(--t-warn)", sub: "var(--t-warn)", strong: "var(--t-warn)",
    fill: "linear-gradient(100deg,var(--f-warn),var(--f-warn))", glow: "rgba(138,90,0,.25)", soft: "var(--t-warn)",
  },
  {
    id: "faqs", label: "FAQ", blurb: "The questions on /faq", icon: "hash",
    tint: "var(--f-info)", edge: "var(--l-info)", chip: "var(--s-info)",
    ink: "var(--t-info)", sub: "var(--t-info)", strong: "var(--t-info)",
    fill: "linear-gradient(100deg,var(--f-info),var(--f-info))", glow: "rgba(24,95,165,.25)", soft: "var(--f-info)",
  },
] as const;
type SecId = (typeof SECTIONS)[number]["id"];

export default function PagesFaqsView() {
  const [sec, setSec] = useState<SecId>("pages");
  const [pages, setPages] = useState<ApiContentPage[]>([]);
  const [faqs, setFaqs] = useState<ApiFaqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  /** page dialog: null closed · {} new · seeded new (starter) · existing page */
  const [pageDialog, setPageDialog] = useState<{ page: ApiContentPage | null; seed?: { slug: string; title: string } } | null>(null);
  const [faqDialog, setFaqDialog] = useState<{ faq: ApiFaqEntry | null } | null>(null);

  const flash = (m: string) => { setOk(m); setSaveState("saved"); setTimeout(() => setOk(null), 2000); };
  const fail = (e: unknown, what: string) => { setErr(e instanceof Error ? e.message : what); setSaveState("error"); };

  useEffect(() => { void reload(); }, []);
  async function reload() {
    setLoading(true);
    try {
      const [p, f] = await Promise.all([listContentPages(), listFaqs()]);
      setPages(p); setFaqs(f); setErr(null);
    } catch (e) { fail(e, "Could not load"); }
    finally { setLoading(false); }
  }

  async function patchPage(id: string, body: Parameters<typeof updateContentPage>[1]) {
    setSaveState("saving");
    try {
      const u = await updateContentPage(id, body);
      setPages((r) => r.map((x) => (x.id === id ? u : x)));
      flash("Saved");
    } catch (e) { fail(e, "Could not save"); }
  }
  async function patchFaq(f: ApiFaqEntry, body: Partial<ApiFaqEntry>) {
    setSaveState("saving");
    try {
      const u = await saveFaq({ ...f, ...body });
      setFaqs((r) => r.map((x) => (x.id === f.id ? u : x)));
      flash("Saved");
    } catch (e) { fail(e, "Could not save"); }
  }

  const missingKnown = KNOWN_SLUGS.filter((k) => !pages.some((p) => p.slug === k.slug));

  const counts = useMemo<Record<SecId, number>>(() => ({
    pages: pages.length,
    live: pages.filter((x) => x.isPublished).length,
    drafts: pages.filter((x) => !x.isPublished).length,
    faqs: faqs.length,
  }), [pages, faqs]);

  const shownPages = useMemo(() => {
    if (sec === "live") return pages.filter((p) => p.isPublished);
    if (sec === "drafts") return pages.filter((p) => !p.isPublished);
    return pages;
  }, [pages, sec]);

  const active = SECTIONS.find((s) => s.id === sec)!;

  return (
    <div className={WRAP}>
      <SaveBar state={saveState} />
      {err && (
        <div className="flex items-start gap-2 bg-[var(--s-bad)] border border-[var(--l-bad)] rounded-[11px] px-3.5 py-2.5 text-[12px] text-[var(--t-bad)] mb-4">
          <span className="mt-0.5 shrink-0"><Icon name="alert" size={14} /></span><span>{err}</span>
        </div>
      )}
      {ok && <div className="bg-[var(--s-ok)] border border-[var(--l-ok)] rounded-[11px] px-3.5 py-2 text-[12px] text-[var(--t-ok)] mb-4">{ok}</div>}

      <ModuleCard>
        <ModuleHeader
          tone="rose"
          icon="shield"
          title="Pages & FAQs"
          blurb="Terms, refund, privacy and the FAQ page"
          chips={counts.drafts > 0
            ? [{ label: `${counts.drafts} unpublished`, bg: "var(--s-orchid)", color: "var(--t-orchid)" }]
            : []}
          action={sec === "faqs"
            ? { label: "＋ New question", onClick: () => setFaqDialog({ faq: null }) }
            : { label: "＋ New page", onClick: () => setPageDialog({ page: null }) }}
        />
        <StatTiles tone="rose" stats={[
          { label: "Pages live", value: counts.live },
          { label: "Unpublished", value: counts.drafts },
          { label: "FAQs", value: counts.faqs },
          { label: "In the footer", value: pages.filter((x) => x.showInFooter).length },
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
                    {counts[s.id]}
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

            {sec !== "faqs" ? (
              <>
                {/*  the storefront's own routes still on built-in text —
                    each chip opens the dialog pre-filled, creates nothing  */}
                {sec === "pages" && missingKnown.length > 0 && (
                  <div className="mb-3 rounded-[14px] border border-[var(--l-warn)] bg-[var(--s-warn)] px-3.5 py-3">
                    <p className="text-[12.5px] font-medium text-[var(--t-warn)] mb-2">
                      Storefront pages still on built-in text — create to take over:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {missingKnown.map((k) => (
                        <button key={k.slug}
                          onClick={() => setPageDialog({ page: null, seed: k })}
                          className="rounded-full border border-[var(--l-warn)] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[var(--t-warn)] hover:border-[var(--l-warn)] transition-colors">
                          ＋ {k.title} <span className="font-normal opacity-60">(/{k.slug})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-3">
                  {loading ? <p className="text-[13px] text-body-soft">Loading…</p> : shownPages.length === 0 ? (
                    <p className="text-[13px] text-body-soft">
                      {sec === "drafts" ? "No drafts — everything is live."
                        : sec === "live" ? "Nothing live yet — the storefront shows its built-in text."
                        : "No pages yet — the storefront shows its built-in text until you create one."}
                    </p>
                  ) : shownPages.map((p) => (
                    <div key={p.id}
                      className={"rounded-[16px] border px-4 py-3.5 " +
                        (p.isPublished ? "border-lavender-deep bg-white" : "border-[var(--l-warn)] bg-[var(--s-warn)]")}>
                      <div className="flex items-center gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-medium text-purple">
                            {p.title}
                            {p.isPublished
                              ? <Badge bg="var(--s-ok)" color="var(--t-ok)">live</Badge>
                              : <Badge bg="var(--s-warn)" color="var(--t-warn)">draft</Badge>}
                            {p.showInFooter && <Badge bg="var(--s-info)" color="var(--t-info)">in footer</Badge>}
                          </span>
                          <span className="block text-[11.5px] text-body-soft">/{p.slug}</span>
                          {p.excerpt && <span className="block text-[12px] text-body-soft mt-0.5 truncate">{p.excerpt}</span>}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <ActionBtn onClick={() => setPageDialog({ page: p })}>Edit</ActionBtn>
                        {p.isPublished
                          ? <ActionBtn onClick={() => patchPage(p.id, { isPublished: false })}>Unpublish</ActionBtn>
                          : <ActionBtn solid onClick={() => patchPage(p.id, { isPublished: true })}>✓ Publish</ActionBtn>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                {loading ? <p className="text-[13px] text-body-soft">Loading…</p> : faqs.length === 0 ? (
                  <p className="text-[13px] text-body-soft">
                    No questions yet — the /faq page shows its built-in list until the first one is published.
                  </p>
                ) : faqs.map((f) => (
                  <div key={f.id}
                    className={"rounded-[16px] border px-4 py-3.5 " +
                      (f.isPublished ? "border-lavender-deep bg-white" : "border-[var(--l-warn)] bg-[var(--s-warn)]")}>
                    <span className="block text-[14px] font-medium text-purple">
                      {f.question}
                      {f.isPublished
                        ? <Badge bg="var(--s-ok)" color="var(--t-ok)">live</Badge>
                        : <Badge bg="var(--s-warn)" color="var(--t-warn)">draft</Badge>}
                      <Badge bg="var(--s-info)" color="var(--t-info)">{f.groupName}</Badge>
                    </span>
                    <span className="block text-[11.5px] text-body-soft">order {f.sortOrder}</span>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <ActionBtn onClick={() => setFaqDialog({ faq: f })}>Edit</ActionBtn>
                      {f.isPublished
                        ? <ActionBtn onClick={() => patchFaq(f, { isPublished: false })}>Unpublish</ActionBtn>
                        : <ActionBtn solid onClick={() => patchFaq(f, { isPublished: true })}>✓ Publish</ActionBtn>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ModuleCard>

      {pageDialog && (
        <PageDialog
          page={pageDialog.page}
          seed={pageDialog.seed}
          onClose={() => setPageDialog(null)}
          onSaved={async () => { setPageDialog(null); await reload(); flash("Saved"); }}
          onError={(e) => fail(e, "Could not save")}
        />
      )}
      {faqDialog && (
        <FaqDialog
          faq={faqDialog.faq}
          onClose={() => setFaqDialog(null)}
          onSaved={async () => { setFaqDialog(null); await reload(); flash("Saved"); }}
          onError={(e) => fail(e, "Could not save")}
        />
      )}
    </div>
  );
}

/* ─── the page dialog — creates ON SAVE (owner's rule, 12 Aug) ────────────── */
function PageDialog({ page, seed, onClose, onSaved, onError }: {
  page: ApiContentPage | null;
  seed?: { slug: string; title: string };
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (e: unknown) => void;
}) {
  const [title, setTitle] = useState(page?.title ?? seed?.title ?? "");
  const [slug, setSlug] = useState(page?.slug ?? seed?.slug ?? "");
  const [excerpt, setExcerpt] = useState(page?.excerpt ?? "");
  const [bodyHtml, setBodyHtml] = useState(page?.bodyHtml ?? "");
  const [showInFooter, setShowInFooter] = useState(page?.showInFooter ?? true);
  const [saving, setSaving] = useState(false);

  const canSave = title.trim().length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const s = slug.trim().toLowerCase().replace(/^\/+/, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
      if (page) {
        await updateContentPage(page.id, {
          title: title.trim(),
          slug: s || page.slug,
          excerpt: excerpt.trim() || null,
          bodyHtml,
          showInFooter,
        });
      } else {
        await createContentPage({
          title: title.trim(),
          slug: s || title.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""),
          kind: "INFO",
          excerpt: excerpt.trim() || null,
          bodyHtml,
          isPublished: false,
          showInFooter,
        });
      }
      await onSaved();
    } catch (e) { onError(e); setSaving(false); }
  }

  async function remove() {
    if (!page) return;
    if (!confirm("Delete this page? The storefront route falls back to the built-in text.")) return;
    try { await deleteContentPage(page.id); await onSaved(); }
    catch (e) { onError(e); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4 overflow-y-auto">
      <div className="bg-white rounded-[18px] shadow-xl w-full max-w-[860px] my-6">
        <div className="px-5 pt-5 pb-3 border-b border-lavender-deep flex items-center justify-between">
          <div>
            <p className="font-display text-[18px] text-purple">{page ? "Edit page" : "New page"}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-body-soft hover:text-purple text-[20px] leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <L label="Title">
              <input className="ipt" value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />
            </L>
            <L label="Web address" hint={`the storefront serves it at /${slug || "…"}`}>
              <input className="ipt" value={slug} placeholder="privacy-policy" onChange={(e) => setSlug(e.target.value)} />
            </L>
          </div>

          <L label="Intro line" hint="optional · shows above the body">
            <input className="ipt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          </L>

          <L label="Body" hint="headings, bold, lists, links and pictures">
            <RichText value={bodyHtml} onChange={setBodyHtml} />
          </L>

          <label className="flex items-center gap-2.5 text-[13px] text-purple cursor-pointer w-fit">
            <input type="checkbox" className="h-4 w-4 accent-[var(--t-accent)]" checked={showInFooter}
              onChange={(e) => setShowInFooter(e.target.checked)} />
            Show a link to this page in the footer
          </label>
        </div>

        <div className="px-5 py-4 border-t border-lavender-deep flex items-center justify-between gap-2">
          {page
            ? <button onClick={remove} className="text-[12.5px] text-body-soft hover:text-[var(--t-bad)]">Delete this page</button>
            : <span />}
          <span className="flex items-center gap-2">
            <button onClick={onClose} className="text-[13px] text-body-soft hover:text-purple px-3 py-2">Cancel</button>
            <button onClick={save} disabled={!canSave}
              className={"text-[13px] font-medium px-5 py-2.5 rounded-[11px] text-white transition-opacity " +
                (canSave ? "bg-purple hover:bg-purple-deep" : "bg-purple/40 cursor-not-allowed")}>
              {saving ? "Saving…" : page ? "Save" : "Save draft"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── the FAQ dialog — creates ON SAVE ────────────────────────────────────── */
function FaqDialog({ faq, onClose, onSaved, onError }: {
  faq: ApiFaqEntry | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (e: unknown) => void;
}) {
  const [question, setQuestion] = useState(faq?.question ?? "");
  const [groupName, setGroupName] = useState(faq?.groupName ?? "General");
  const [sortOrder, setSortOrder] = useState(faq?.sortOrder ?? 0);
  const [answerHtml, setAnswerHtml] = useState(faq?.answerHtml ?? "");
  const [saving, setSaving] = useState(false);

  const canSave = question.trim().length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      await saveFaq({
        ...(faq ?? {}),
        question: question.trim(),
        groupName: groupName.trim() || "General",
        sortOrder,
        answerHtml,
        isPublished: faq?.isPublished ?? false,
      });
      await onSaved();
    } catch (e) { onError(e); setSaving(false); }
  }

  async function remove() {
    if (!faq) return;
    if (!confirm("Delete this question?")) return;
    try { await deleteFaq(faq.id); await onSaved(); }
    catch (e) { onError(e); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4 overflow-y-auto">
      <div className="bg-white rounded-[18px] shadow-xl w-full max-w-[720px] my-6">
        <div className="px-5 pt-5 pb-3 border-b border-lavender-deep flex items-center justify-between">
          <div>
            <p className="font-display text-[18px] text-purple">{faq ? "Edit question" : "New question"}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-body-soft hover:text-purple text-[20px] leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <L label="Question">
            <input className="ipt" value={question} autoFocus placeholder="Do you deliver at midnight?"
              onChange={(e) => setQuestion(e.target.value)} />
          </L>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <L label="Group" hint="the section heading on /faq">
              <input className="ipt" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
            </L>
            <L label="Order" hint="lower first">
              <input type="number" className="ipt" value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
            </L>
          </div>
          <L label="Answer">
            <RichText value={answerHtml} onChange={setAnswerHtml} />
          </L>
        </div>

        <div className="px-5 py-4 border-t border-lavender-deep flex items-center justify-between gap-2">
          {faq
            ? <button onClick={remove} className="text-[12.5px] text-body-soft hover:text-[var(--t-bad)]">Delete this question</button>
            : <span />}
          <span className="flex items-center gap-2">
            <button onClick={onClose} className="text-[13px] text-body-soft hover:text-purple px-3 py-2">Cancel</button>
            <button onClick={save} disabled={!canSave}
              className={"text-[13px] font-medium px-5 py-2.5 rounded-[11px] text-white transition-opacity " +
                (canSave ? "bg-purple hover:bg-purple-deep" : "bg-purple/40 cursor-not-allowed")}>
              {saving ? "Saving…" : faq ? "Save" : "Save draft"}
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
