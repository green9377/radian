"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import SaveBar, { type SaveState } from "./SaveBar";
import {
  listReviews, createReview, updateReview, deleteReview,
  getGoogleSummary, saveGoogleSummary, uploadImage,
  type ApiReview, type ReviewStatus,
} from "../_data/api";

/*
  Storefront · Reviews.

  Three sources, deliberately redundant (owner, 30 Jul): Google can go quiet
  and the homepage still has words on it.

  ⚠️ WHAT THE SCREEN WILL NOT LET HIM DO, and why it says so out loud:

   · A review's SOURCE cannot be changed. "The shop wrote this" and "a customer
     wrote this" are different claims, and one relabelled as the other is the
     thing that costs an ad account.
   · A GOOGLE review cannot be edited at all — only hidden or featured. Those
     words belong to the person who left them.
   · "Verified" cannot be ticked. It comes from the order history.

  The section on the site shows NOTHING until something is published here. The
  four quotes that used to be on the homepage were invented, and were not
  carried into the database — see the reviews migration for why.
*/

const TABS: { v: ReviewStatus | "ALL"; label: string }[] = [
  { v: "PENDING", label: "Waiting for you" },
  { v: "PUBLISHED", label: "On the site" },
  { v: "ALL", label: "Everything" },
];

const SOURCE_LABEL: Record<string, string> = {
  CUSTOMER: "customer wrote this",
  SHOP: "you added this",
  GOOGLE: "from Google",
};

/*
  Same page frame as every other admin screen (31 Jul 2026).

  The storefront screens were built at a fixed `max-w-[860px]`–`[1100px]`, which
  on the owner's monitor left the whole module pinned to the left with a third
  of the screen empty, while Products, Categories and the rest filled the width.
  One admin, one frame.

  `WRAP` is the same string those screens use — full width, padding that grows
  with the viewport. Individual columns still cap their own width where reading
  comfort needs it; the PAGE no longer does.
*/
const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

export default function ReviewsView() {
  const [rows, setRows] = useState<ApiReview[]>([]);
  const [tab, setTab] = useState<ReviewStatus | "ALL">("PUBLISHED");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [open, setOpen] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [g, setG] = useState<{ googleRating: number | null; googleReviewCount: number | null; googleProfileUrl: string | null }>({
    googleRating: null, googleReviewCount: null, googleProfileUrl: null,
  });

  const flash = (m: string) => { setOk(m); setSaveState("saved"); setTimeout(() => setOk(null), 2000); };
  const fail = (e: unknown, what: string) => { setErr(e instanceof Error ? e.message : what); setSaveState("error"); };

  useEffect(() => { void reload(); }, []);
  async function reload() {
    setLoading(true);
    try {
      const [r, gs] = await Promise.all([listReviews(), getGoogleSummary()]);
      setRows(r); setG(gs); setErr(null);
    } catch (e) { fail(e, "Could not load"); }
    finally { setLoading(false); }
  }

  const shown = useMemo(() => (tab === "ALL" ? rows : rows.filter((r) => r.status === tab)), [rows, tab]);
  const pending = rows.filter((r) => r.status === "PENDING").length;

  async function patch(id: string, body: Parameters<typeof updateReview>[1]) {
    setSaveState("saving");
    try {
      const u = await updateReview(id, body);
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...u } : r)));
      flash("Saved");
    } catch (e) { fail(e, "Could not save"); }
  }

  async function add() {
    try {
      const r = await createReview({ authorName: "", body: "", rating: 5, sortOrder: rows.length });
      setRows((rs) => [r, ...rs]);
      setTab("PUBLISHED");
      setOpen(r.id);
    } catch (e) { fail(e, "Could not create"); }
  }

  return (
    <div className={WRAP}>
      <h1 className="font-display text-[22px] text-purple mb-1">Reviews</h1>
      <p className="text-[13px] text-body-soft mb-5">
        What customers say. Nothing appears on the website until you publish it.
      </p>

      <SaveBar state={saveState} onSave={() => flash("Saved")} />

      {err && (
        <div className="flex items-start gap-2 bg-[#fdecea] border border-[#f5c6c2] rounded-[11px] px-3.5 py-2.5 text-[12px] text-[#a3261f] mb-4">
          <span className="mt-0.5 shrink-0"><Icon name="alert" size={14} /></span><span>{err}</span>
        </div>
      )}
      {ok && <div className="bg-[#eef7f0] border border-[#cfe8d6] rounded-[11px] px-3.5 py-2 text-[12px] text-[#12693f] mb-4">{ok}</div>}

      {/* ---- the Google summary card ---- */}
      <div className="border border-lavender-deep rounded-[14px] bg-white p-4 mb-6">
        <p className="text-[11.5px] font-medium text-body-soft uppercase tracking-[0.12em] mb-1">The Google card</p>
        {/* Spelled out because a typed-in rating is an invented one unless he
            copies it, and the number is the most quoted thing on the page. */}
        <p className="text-[12px] text-body-soft mb-3">
          Open your Google Business Profile and copy exactly what it says. Leave these empty and the card is hidden — better than a number nobody can stand behind.
          Once the profile is verified and connected, these fill themselves.
        </p>
        {/* Says whether the card is on the site right now. The first version
            left the owner to work that out from two empty boxes, and he could
            not — reasonably, since the placeholders looked like values. */}
        <div className={"text-[12px] rounded-[10px] px-3.5 py-2 mb-3 " +
          (g.googleRating ? "bg-[#eef7f0] text-[#12693f]" : "bg-[#fff8e6] text-[#8a6414]")}>
          {g.googleRating
            ? `Showing on the website: ${g.googleRating.toFixed(1)} stars${g.googleReviewCount ? ` from ${g.googleReviewCount} reviews` : ""}.`
            : "Not showing — the stars box is still empty. The faint numbers below are examples, not what you have entered."}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[110px_130px_1fr] gap-3">
          <L label="Stars" hint="required for the card">
            {/* "e.g." prefixes so a grey placeholder cannot be mistaken for a
                saved value — which is exactly what happened. */}
            <input type="number" step="0.1" min="0" max="5" className="ipt" defaultValue={g.googleRating ?? ""} placeholder="e.g. 4.9"
              onBlur={async (e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v === g.googleRating) return; setSaveState("saving"); try { setG(await saveGoogleSummary({ googleRating: v })); flash("Saved"); } catch (er) { fail(er, "Could not save"); } }} />
          </L>
          <L label="How many" hint="optional">
            <input type="number" className="ipt" defaultValue={g.googleReviewCount ?? ""} placeholder="e.g. 127"
              onBlur={async (e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v === g.googleReviewCount) return; setSaveState("saving"); try { setG(await saveGoogleSummary({ googleReviewCount: v })); flash("Saved"); } catch (er) { fail(er, "Could not save"); } }} />
          </L>
          <L label="Link to your profile">
            <input className="ipt" defaultValue={g.googleProfileUrl ?? ""} placeholder="https://g.page/…"
              onBlur={async (e) => { if (e.target.value === (g.googleProfileUrl ?? "")) return; setSaveState("saving"); try { setG(await saveGoogleSummary({ googleProfileUrl: e.target.value })); flash("Saved"); } catch (er) { fail(er, "Could not save"); } }} />
          </L>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)}
            className={"text-[12.5px] px-3.5 py-1.5 rounded-full border transition-colors inline-flex items-center gap-2 " +
              (tab === t.v ? "bg-purple text-white border-purple" : "bg-white text-body border-lavender-deep hover:border-orchid")}>
            {t.label}
            {t.v === "PENDING" && pending > 0 && (
              <span className={"rounded-full px-1.5 text-[11px] " + (tab === t.v ? "bg-white/25" : "bg-[#fdecea] text-[#a3261f]")}>{pending}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? <p className="text-[13px] text-body-soft">Loading…</p> : shown.length === 0 ? (
        <p className="text-[13px] text-body-soft mb-4">
          {tab === "PENDING" ? "Nothing waiting." : "Nothing here yet — the reviews section is hidden on the website until you publish one."}
        </p>
      ) : (
        <div className="space-y-1.5 mb-4">
          {shown.map((r) => {
            const expanded = open === r.id;
            const locked = r.source === "GOOGLE";
            return (
              <div key={r.id} className={"border rounded-[14px] overflow-hidden " +
                (r.status === "PENDING" ? "border-[#f5e2b8] bg-[#fffdf6]" : r.isFeatured ? "border-lavender-deep bg-white" : "border-lavender-deep/60 bg-lavender/20")}>
                <button onClick={() => setOpen(expanded ? null : r.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-lavender/30 transition-colors">
                  <span className={"text-body-soft text-[11px] transition-transform shrink-0 " + (expanded ? "rotate-90" : "")}>▶</span>
                  <span className="text-rosegold text-[12px] tracking-[1px] shrink-0">{"★".repeat(r.rating)}</span>
                  <span className="text-[14px] font-medium text-purple shrink-0">{r.authorName || "(no name)"}</span>
                  <span className="text-[12.5px] text-body-soft truncate flex-1 min-w-0">{r.body || "(empty)"}</span>
                  <span className="text-[11px] text-body-soft shrink-0">{SOURCE_LABEL[r.source]}</span>
                  {r.verifiedPurchase && <span className="text-[10.5px] text-orchid bg-orchid-soft rounded-full px-2 py-0.5 shrink-0">verified</span>}
                  {r.isFeatured && r.status === "PUBLISHED" && <span className="text-[10.5px] text-[#12693f] bg-[#eef7f0] rounded-full px-2 py-0.5 shrink-0">on homepage</span>}
                </button>

                {expanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-lavender-deep space-y-3">
                    {locked && (
                      <p className="text-[12px] text-body-soft bg-lavender/40 border border-lavender-deep rounded-[10px] px-3.5 py-2.5">
                        These are the customer&rsquo;s own words on Google, so they cannot be edited here — only hidden, or chosen for the homepage.
                      </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_110px] gap-3">
                      <L label="Name">
                        <input className="ipt" defaultValue={r.authorName} disabled={locked} placeholder="Tanvir A."
                          onBlur={(e) => e.target.value !== r.authorName && patch(r.id, { authorName: e.target.value })} />
                      </L>
                      <L label="Stars">
                        <select className="ipt" value={r.rating} disabled={locked} onChange={(e) => patch(r.id, { rating: Number(e.target.value) })}>
                          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
                        </select>
                      </L>
                    </div>
                    <L label="What they said">
                      <textarea className="ipt" rows={3} defaultValue={r.body} disabled={locked}
                        onBlur={(e) => e.target.value !== r.body && patch(r.id, { body: e.target.value })} />
                    </L>
                    <L label="The line under the name" hint="Anniversary · Midnight delivery">
                      <input className="ipt" defaultValue={r.context ?? ""} disabled={locked}
                        onBlur={(e) => e.target.value !== (r.context ?? "") && patch(r.id, { context: e.target.value })} />
                    </L>

                    <div className="grid grid-cols-1 md:grid-cols-[170px_1fr] gap-4">
                      <L label="Photo" hint="660 × 300 · optional">
                        <label className="relative block w-full aspect-[11/5] rounded-[10px] border-2 border-dashed border-lavender-deep bg-lavender/40 hover:border-orchid cursor-pointer overflow-hidden grid place-items-center">
                          {r.imageUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={r.imageUrl} alt="" className={"absolute inset-0 w-full h-full object-cover " + (uploadingId === r.id ? "opacity-40" : "")} />
                            : <span className="text-body-soft text-[11px]">{uploadingId === r.id ? "Uploading…" : "add a photo"}</span>}
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0]; if (!file) return;
                              setUploadingId(r.id);
                              try { const { url } = await uploadImage(file, "reviews"); await patch(r.id, { imageUrl: url }); }
                              catch (er) { fail(er, "Upload failed"); }
                              finally { setUploadingId(null); }
                            }} />
                        </label>
                        {r.imageUrl && <button onClick={() => patch(r.id, { imageUrl: null })} className="text-[12px] text-body-soft hover:text-[#c0392b] mt-1.5">Remove</button>}
                      </L>

                      <div className="space-y-2.5">
                        {r.status === "PENDING" ? (
                          <div className="flex gap-2">
                            <button onClick={() => patch(r.id, { status: "PUBLISHED" })}
                              className="bg-purple hover:bg-purple-deep text-white text-[13px] font-medium px-4 py-2 rounded-[10px]">
                              Publish it
                            </button>
                            <button onClick={() => patch(r.id, { status: "REJECTED" })}
                              className="border border-lavender-deep text-body text-[13px] px-4 py-2 rounded-[10px] hover:border-[#c0392b] hover:text-[#c0392b]">
                              Reject
                            </button>
                          </div>
                        ) : (
                          <Toggle label="Showing on the website" on={r.status === "PUBLISHED"}
                            onClick={() => patch(r.id, { status: r.status === "PUBLISHED" ? "REJECTED" : "PUBLISHED" })} />
                        )}
                        <Toggle label="Put it on the homepage" on={r.isFeatured} onClick={() => patch(r.id, { isFeatured: !r.isFeatured })} />
                        <div className="text-[11.5px] text-body-soft">
                          {SOURCE_LABEL[r.source]} · {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          {r.product ? ` · about ${r.product.name}` : ""}
                        </div>
                        <button onClick={async () => { if (!confirm("Remove this review?")) return; await deleteReview(r.id); setRows((rs) => rs.filter((x) => x.id !== r.id)); flash("Removed"); }}
                          className="text-[13px] text-body-soft hover:text-[#c0392b]">Remove this review</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button onClick={add} className="bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] inline-flex items-center gap-1.5">
        <Icon name="plus" size={15} /> Add a review yourself
      </button>
      {/* The advice he was given on 30 Jul, kept where the temptation is. */}
      <p className="text-[12px] text-body-soft mt-2 max-w-[62ch]">
        Best done by asking a real customer on WhatsApp and typing what they reply. Invented testimonials break Facebook&rsquo;s and Google&rsquo;s advertising rules, and readers can usually tell.
      </p>
    </div>
  );
}

function L({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  // a <div>, not a <label> — see the note in CollectionsView about picture drops
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

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-lavender-deep rounded-[11px] px-3.5 py-2.5">
      <span className="text-[13px] text-purple">{label}</span>
      <button onClick={onClick} className={"relative rounded-full shrink-0 " + (on ? "bg-orchid" : "bg-lavender-deep")} style={{ width: 38, height: 22 }}>
        <span className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all" style={{ width: 16, height: 16, left: on ? 19 : 3 }} />
      </button>
    </div>
  );
}
