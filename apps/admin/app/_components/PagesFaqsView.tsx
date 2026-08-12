"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { ModuleCard, ModuleHeader, StatTiles, FilterChips } from "./ModuleShell";
import SaveBar, { type SaveState } from "./SaveBar";
import RichText from "./RichText";
import {
  listContentPages, createContentPage, updateContentPage, deleteContentPage,
  listFaqs, saveFaq, deleteFaq,
  type ApiContentPage, type ApiFaqEntry,
} from "../_data/api";

/*
  Storefront · Pages & FAQs — the words the shop stands behind.

  storefront-এর /terms, /privacy-policy, /refund-policy আর /faq ৪ আগস্ট থেকে
  Content module পড়ে (মালিকের নিয়ম: কিছুই static নয়)। টেবিল আর API আগেই
  ছিল; **লেখার পর্দাটাই ছিল না** — মালিক জিজ্ঞেস করলেন "admin-এর কোথা থেকে
  দেখব?", আর উত্তরটা ছিল "কোথাও না"। এই সেই পর্দা।

  ⚠️ PAGE-এর slug-ই তার ঠিকানা: slug `terms` মানে দোকানের /terms। ওই তিনটে
  slug-এ পাতা publish করা মাত্র storefront-এর হাতে-লেখা fallback সরে দাঁড়ায়।
  bKash আর SSLCommerz-এর merchant review Terms + Refund Policy পাতা LIVE
  দেখতে চায় — টাকা নেওয়ার অনুমতি এই পর্দার লেখার উপর দাঁড়িয়ে।

  ⚠️ FAQ group-এর নামই storefront-এর section-heading, sortOrder-ই ক্রম।
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

/*  দোকানের যে ঠিকানাগুলো এই module থেকে আঁকে — নতুন পাতার জন্য এক-click
    শুরু। slug এর বাইরে কিছু লিখলে সেটাও চলবে (footer-এ link আসবে), শুধু
    storefront-এ নিজস্ব route থাকবে না।  */
const KNOWN_SLUGS = [
  { slug: "terms", title: "Terms of Service" },
  { slug: "privacy-policy", title: "Privacy Policy" },
  { slug: "refund-policy", title: "Refund & Return Policy" },
  /*  ৪ আগস্ট — মালিকের নিয়মে এই তিনটাও override-যোগ্য হলো  */
  { slug: "about", title: "About Radian" },
  { slug: "contact", title: "Contact Us" },
  { slug: "delivery-info", title: "Delivery Information" },
];

type Tab = "pages" | "faqs";

export default function PagesFaqsView() {
  const [tab, setTab] = useState<Tab>("pages");

  const [pages, setPages] = useState<ApiContentPage[]>([]);
  const [faqs, setFaqs] = useState<ApiFaqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [open, setOpen] = useState<string | null>(null);

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

  /* ---- pages ---- */
  async function addPage(slug?: string, title?: string) {
    setSaveState("saving");
    try {
      const created = await createContentPage({
        slug: slug ?? `page-${Date.now().toString(36)}`,
        title: title ?? "Untitled page",
        kind: "INFO",
        isPublished: false,
        showInFooter: true,
      });
      await reload(); setOpen(created.id); flash("Page created — write it, then publish");
    } catch (e) { fail(e, "Could not create the page"); }
  }
  async function patchPage(id: string, body: Parameters<typeof updateContentPage>[1]) {
    setSaveState("saving");
    try {
      const u = await updateContentPage(id, body);
      setPages((r) => r.map((x) => (x.id === id ? u : x)));
      flash("Saved");
    } catch (e) { fail(e, "Could not save"); }
  }
  async function removePage(id: string) {
    if (!window.confirm("Delete this page? The storefront route falls back to the built-in text.")) return;
    setSaveState("saving");
    try { await deleteContentPage(id); await reload(); flash("Deleted"); }
    catch (e) { fail(e, "Could not delete"); }
  }

  /* ---- faqs ---- */
  async function addFaq() {
    setSaveState("saving");
    try {
      const created = await saveFaq({ groupName: "General", question: "New question…", answerHtml: "", isPublished: false });
      await reload(); setOpen(created.id); flash("Question added — write the answer, then publish");
    } catch (e) { fail(e, "Could not add"); }
  }
  async function patchFaq(f: ApiFaqEntry, body: Partial<ApiFaqEntry>) {
    setSaveState("saving");
    try {
      const u = await saveFaq({ ...f, ...body });
      setFaqs((r) => r.map((x) => (x.id === f.id ? u : x)));
      flash("Saved");
    } catch (e) { fail(e, "Could not save"); }
  }
  async function removeFaqRow(id: string) {
    if (!window.confirm("Delete this question?")) return;
    setSaveState("saving");
    try { await deleteFaq(id); await reload(); flash("Deleted"); }
    catch (e) { fail(e, "Could not delete"); }
  }

  const missingKnown = KNOWN_SLUGS.filter((k) => !pages.some((p) => p.slug === k.slug));

  const input =
    "w-full rounded-xl border border-[color:var(--line)] bg-white px-3.5 py-2.5 text-[13.5px] outline-none focus:border-[color:var(--brand)]";
  const chk = "h-4 w-4 accent-[color:var(--brand)]";

  return (
    <div className={WRAP}>
      <SaveBar state={saveState} />
      {err && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12.5px] text-red-800">{err}</p>}
      {ok && <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[12.5px] text-emerald-800">{ok}</p>}

      <ModuleCard>
        <ModuleHeader
          tone="rose"
          icon="shield"
          title="Pages & FAQs"
          blurb="Terms, refund, privacy and the FAQ page — the storefront renders exactly what is published here"
          chips={pages.filter((x) => !x.isPublished).length > 0
            ? [{ label: `${pages.filter((x) => !x.isPublished).length} unpublished`, bg: "#FBEAF0", color: "#6b2138" }]
            : []}
        />
        <StatTiles tone="rose" stats={[
          { label: "Pages live", value: pages.filter((x) => x.isPublished).length },
          { label: "Unpublished", value: pages.filter((x) => !x.isPublished).length },
          { label: "FAQs", value: faqs.length },
          { label: "In the footer", value: pages.filter((x) => x.showInFooter).length },
        ]} />
        <div className="px-5 pt-4 pb-5">
        <p className="mb-4 max-w-[720px] text-[12px] text-[color:var(--muted)]">
          bKash and SSLCommerz ask to see the Terms and Refund pages live before approving a merchant account.
        </p>

      {/* tabs */}
      <div className="mb-6 flex gap-2">
        {(["pages", "faqs"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-5 py-2 text-[13px] font-semibold transition ${
              tab === t
                ? "bg-[color:var(--brand)] text-white"
                : "border border-[color:var(--line)] bg-white text-[color:var(--ink)]"
            }`}
          >
            {t === "pages" ? `Pages (${pages.length})` : `FAQs (${faqs.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[13px] text-[color:var(--muted)]">Loading…</p>
      ) : tab === "pages" ? (
        <>
          {/* one-click starters for the routes the storefront actually serves */}
          {missingKnown.length > 0 && (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 text-[13px] font-semibold text-amber-900">
                Storefront pages still on built-in text — create to take over:
              </p>
              <div className="flex flex-wrap gap-2">
                {missingKnown.map((k) => (
                  <button
                    key={k.slug}
                    onClick={() => void addPage(k.slug, k.title)}
                    className="rounded-full border border-amber-300 bg-white px-4 py-1.5 text-[12.5px] font-semibold text-amber-900"
                  >
                    + {k.title} <span className="font-normal opacity-60">(/{k.slug})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => void addPage()}
            className="mb-5 rounded-xl bg-[color:var(--brand)] px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            + New page
          </button>

          <div className="space-y-3">
            {pages.map((p) => (
              <div key={p.id} className="rounded-2xl border border-[color:var(--line)] bg-white">
                <button
                  onClick={() => setOpen(open === p.id ? null : p.id)}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left"
                >
                  <span className="flex-1">
                    <span className="block text-[14px] font-semibold text-[color:var(--ink)]">{p.title}</span>
                    <span className="block text-[12px] text-[color:var(--muted)]">
                      /{p.slug} · {p.isPublished ? "Published" : "Draft"}
                      {p.showInFooter ? " · in footer" : ""}
                    </span>
                  </span>
                  <Icon name={open === p.id ? "chevronUp" : "chevronDown"} className="h-4 w-4 text-[color:var(--muted)]" />
                </button>

                {open === p.id && (
                  <div className="border-t border-[color:var(--line)] p-5 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-[12px] font-semibold text-[color:var(--muted)]">Title</span>
                        <input className={input} defaultValue={p.title}
                          onBlur={(e) => e.target.value !== p.title && void patchPage(p.id, { title: e.target.value })} />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[12px] font-semibold text-[color:var(--muted)]">
                          Slug · the storefront address (/{p.slug})
                        </span>
                        <input className={input} defaultValue={p.slug}
                          onBlur={(e) => e.target.value !== p.slug && void patchPage(p.id, { slug: e.target.value.trim() })} />
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-[12px] font-semibold text-[color:var(--muted)]">
                        Intro line · shows above the body
                      </span>
                      <input className={input} defaultValue={p.excerpt ?? ""}
                        onBlur={(e) => e.target.value !== (p.excerpt ?? "") && void patchPage(p.id, { excerpt: e.target.value })} />
                    </label>

                    <div>
                      <span className="mb-1 block text-[12px] font-semibold text-[color:var(--muted)]">Body</span>
                      <RichText
                        value={p.bodyHtml ?? ""}
                        onChange={(html) => void patchPage(p.id, { bodyHtml: html })}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-5 pt-1">
                      <label className="flex items-center gap-2 text-[13px]">
                        <input type="checkbox" className={chk} checked={p.isPublished}
                          onChange={(e) => void patchPage(p.id, { isPublished: e.target.checked })} />
                        Published — live on the storefront
                      </label>
                      <label className="flex items-center gap-2 text-[13px]">
                        <input type="checkbox" className={chk} checked={p.showInFooter}
                          onChange={(e) => void patchPage(p.id, { showInFooter: e.target.checked })} />
                        Show in footer
                      </label>
                      <button onClick={() => void removePage(p.id)}
                        className="ml-auto text-[12.5px] font-semibold text-red-600">
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {pages.length === 0 && (
              <p className="text-[13px] text-[color:var(--muted)]">
                No pages yet — the storefront shows its built-in text until you create one.
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <button
            onClick={() => void addFaq()}
            className="mb-5 rounded-xl bg-[color:var(--brand)] px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            + New question
          </button>

          <div className="space-y-3">
            {faqs.map((f) => (
              <div key={f.id} className="rounded-2xl border border-[color:var(--line)] bg-white">
                <button
                  onClick={() => setOpen(open === f.id ? null : f.id)}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left"
                >
                  <span className="flex-1">
                    <span className="block text-[14px] font-semibold text-[color:var(--ink)]">{f.question}</span>
                    <span className="block text-[12px] text-[color:var(--muted)]">
                      {f.groupName} · order {f.sortOrder} · {f.isPublished ? "Published" : "Draft"}
                    </span>
                  </span>
                  <Icon name={open === f.id ? "chevronUp" : "chevronDown"} className="h-4 w-4 text-[color:var(--muted)]" />
                </button>

                {open === f.id && (
                  <div className="border-t border-[color:var(--line)] p-5 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-[12px] font-semibold text-[color:var(--muted)]">Question</span>
                        <input className={input} defaultValue={f.question}
                          onBlur={(e) => e.target.value !== f.question && void patchFaq(f, { question: e.target.value })} />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[12px] font-semibold text-[color:var(--muted)]">
                          Group · the section heading on /faq
                        </span>
                        <input className={input} defaultValue={f.groupName}
                          onBlur={(e) => e.target.value !== f.groupName && void patchFaq(f, { groupName: e.target.value })} />
                      </label>
                    </div>

                    <div>
                      <span className="mb-1 block text-[12px] font-semibold text-[color:var(--muted)]">Answer</span>
                      <RichText
                        value={f.answerHtml ?? ""}
                        onChange={(html) => void patchFaq(f, { answerHtml: html })}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-5 pt-1">
                      <label className="flex items-center gap-2 text-[13px]">
                        <input type="checkbox" className={chk} checked={f.isPublished}
                          onChange={(e) => void patchFaq(f, { isPublished: e.target.checked })} />
                        Published
                      </label>
                      <label className="flex items-center gap-2 text-[13px]">
                        <span className="text-[12px] text-[color:var(--muted)]">Order</span>
                        <input type="number" className={`${input} w-24`} defaultValue={f.sortOrder}
                          onBlur={(e) => Number(e.target.value) !== f.sortOrder && void patchFaq(f, { sortOrder: Number(e.target.value) || 0 })} />
                      </label>
                      <button onClick={() => void removeFaqRow(f.id)}
                        className="ml-auto text-[12.5px] font-semibold text-red-600">
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {faqs.length === 0 && (
              <p className="text-[13px] text-[color:var(--muted)]">
                No questions yet — the /faq page shows its built-in list until the first one is published.
              </p>
            )}
          </div>
        </>
      )}
        </div>
      </ModuleCard>
    </div>
  );
}
