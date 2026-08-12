"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import SaveBar, { type SaveState } from "./SaveBar";
import { ModuleCard, ModuleHeader, StatTiles, FilterChips } from "./ModuleShell";
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
  const [tab, setTab] = useState<ReviewStatus | "ALL" | "CUSTOMER" | "GOOGLE" | "SHOP">("ALL");
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

  async function reload() {
    setLoading(true);
    try {
      const [r, gs] = await Promise.all([listReviews(), getGoogleSummary()]);
      setRows(r); setG(gs); setErr(null);
    } catch (e) { fail(e, "Could not load"); }
    finally { setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, []);

  const shown = useMemo(() => {
    if (tab === "ALL") return rows;
    if (tab === "CUSTOMER" || tab === "GOOGLE" || tab === "SHOP") return rows.filter((r) => r.source === tab);
    return rows.filter((r) => r.status === tab);
  }, [rows, tab]);
  const pending = rows.filter((r) => r.status === "PENDING").length;
  const published = rows.filter((r) => r.status === "PUBLISHED");
  const avg = published.length
    ? Math.round((published.reduce((a, r) => a + r.rating, 0) / published.length) * 10) / 10
    : null;
  const withPhoto = rows.filter((r) => r.imageUrl).length;

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
      <SaveBar state={saveState} onSave={() => flash("Saved")} />

      {err && (
        <div className="flex items-start gap-2 bg-[#fdecea] border border-[#f5c6c2] rounded-[11px] px-3.5 py-2.5 text-[12px] text-[#a3261f] mb-4">
          <span className="mt-0.5 shrink-0"><Icon name="alert" size={14} /></span><span>{err}</span>
        </div>
      )}
      {ok && <div className="bg-[#eef7f0] border border-[#cfe8d6] rounded-[11px] px-3.5 py-2 text-[12px] text-[#12693f] mb-4">{ok}</div>}

      <ModuleCard>
        <ModuleHeader
          tone="purple"
          icon="star"
          title="Reviews"
          blurb="Nothing shows on the website until you publish it"
          chips={pending > 0 ? [{ label: `⏳ ${pending} waiting`, bg: "#FBEAF0", color: "#6b2138" }] : []}
          action={{ label: "Add your own", onClick: add }}
        />
        <StatTiles tone="purple" stats={[
          { label: "On the site", value: published.length },
          { label: "Waiting for you", value: pending },
          { label: "Shop average", value: avg !== null ? <>{avg} <span style={{ color: "#b76e79" }}>★</span></> : "—" },
          { label: "With photo", value: withPhoto },
        ]} />

      {/* ---- the Google card — a strip, not a wall ---- */}
      <div className="flex items-center gap-3 mx-5 mt-4 px-3.5 py-3 border border-lavender-deep rounded-[14px] bg-[#fdfbff] flex-wrap">
        <span className="w-[38px] h-[38px] rounded-[11px] bg-lavender grid place-items-center font-display text-[18px] text-purple shrink-0">G</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-body">
            Google card —{" "}
            {g.googleRating
              ? <b className="text-[#0E7A3D]">showing: {g.googleRating.toFixed(1)} ★{g.googleReviewCount ? ` from ${g.googleReviewCount} reviews` : ""}</b>
              : <b className="text-[#8a6414]">hidden — the stars box is empty</b>}
          </span>
          <span className="block text-[11.5px] text-body-soft">
            Copy exactly what your Business Profile says · Google&rsquo;s words can be hidden or featured, never edited
          </span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <input type="number" step="0.1" min="0" max="5" className="ipt !w-[86px] h-[38px]" defaultValue={g.googleRating ?? ""} placeholder="e.g. 4.9"
            onBlur={async (e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v === g.googleRating) return; setSaveState("saving"); try { setG(await saveGoogleSummary({ googleRating: v })); flash("Saved"); } catch (er) { fail(er, "Could not save"); } }} />
          <input type="number" className="ipt !w-[86px] h-[38px]" defaultValue={g.googleReviewCount ?? ""} placeholder="e.g. 127"
            onBlur={async (e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v === g.googleReviewCount) return; setSaveState("saving"); try { setG(await saveGoogleSummary({ googleReviewCount: v })); flash("Saved"); } catch (er) { fail(er, "Could not save"); } }} />
          <input className="ipt !w-[170px] h-[38px]" defaultValue={g.googleProfileUrl ?? ""} placeholder="https://g.page/…"
            onBlur={async (e) => { if (e.target.value === (g.googleProfileUrl ?? "")) return; setSaveState("saving"); try { setG(await saveGoogleSummary({ googleProfileUrl: e.target.value })); flash("Saved"); } catch (er) { fail(er, "Could not save"); } }} />
        </span>
      </div>

      <FilterChips
        value={tab}
        onChange={setTab}
        options={[
          { v: "ALL" as const, label: "All", count: rows.length },
          { v: "PENDING" as const, label: "⏳ Waiting", count: pending, tint: { bg: "#FBEAF0", color: "#6b2138" } },
          { v: "PUBLISHED" as const, label: "On the site" },
          { v: "CUSTOMER" as const, label: "🌐 Website" },
          { v: "GOOGLE" as const, label: "G Google" },
          { v: "SHOP" as const, label: "✍ Added by you" },
        ]}
      />

      {loading ? <p className="text-[13px] text-body-soft px-5 pb-4">Loading…</p> : shown.length === 0 ? (
        <p className="text-[13px] text-body-soft px-5 pb-5">
          {tab === "PENDING" ? "Nothing waiting." : "Nothing here yet — the reviews section is hidden on the website until you publish one."}
        </p>
      ) : (
        <div className="border-t border-lavender-deep">
          {shown.map((r) => {
            const expanded = open === r.id;
            const locked = r.source === "GOOGLE";
            const account = r.customer
              ? `${r.customer.phone} (${r.customer.name})`
              : r.customerPhone ?? null;
            return (
              <div key={r.id}
                className={"border-b border-lavender-deep/50 last:border-b-0 " +
                  (r.status === "PENDING" ? "bg-[#fffdf6] border-l-4 border-l-[#E8A23D]" : "")}>
                <button onClick={() => setOpen(expanded ? null : r.id)}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-lavender/25 transition-colors">
                  {/* photo when they attached one; initials circle otherwise */}
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt="" className="w-[44px] h-[44px] rounded-[12px] object-cover shrink-0" />
                  ) : (
                    <span className="w-[44px] h-[44px] rounded-full grid place-items-center text-white text-[13px] font-semibold shrink-0"
                      style={{ background: r.source === "GOOGLE" ? "#f7f1fb" : "linear-gradient(135deg,#e9a8f5,#cf43ea)", color: r.source === "GOOGLE" ? "#470066" : "#fff" }}>
                      {r.source === "GOOGLE" ? "G" : (r.authorName || "?").split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?"}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-purple">
                      {r.authorName || "(no name)"}
                      {r.status === "PENDING" && <Badge bg="#FFF4E6" color="#8a5a00">waiting</Badge>}
                      {r.source === "CUSTOMER" && <Badge bg="#E6F1FB" color="#185FA5">🌐 website</Badge>}
                      {r.source === "SHOP" && <Badge bg="#f9e9fd" color="#8c2d84">✍ you added</Badge>}
                      {r.source === "GOOGLE" && <Badge bg="#f7f1fb" color="#5f4b73">G Google</Badge>}
                      {r.verifiedPurchase && <Badge bg="#E8F9EE" color="#0E7A3D">✓ verified</Badge>}
                      {r.isFeatured && r.status === "PUBLISHED" && <Badge bg="#E8F9EE" color="#0E7A3D">on homepage</Badge>}
                    </span>
                    <span className="block text-[12px] text-body-soft truncate">{r.body || "(empty)"}</span>
                    <span className="block text-[11px] text-body-soft mt-0.5">
                      {account ? `${account} · ` : ""}
                      {r.product ? <>about <b className="text-purple">{r.product.name}</b></> : "about the shop"}
                      {" · "}{new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </span>
                  <span className="text-rosegold text-[12px] tracking-[1px] shrink-0">{"★".repeat(r.rating)}</span>
                  {r.status === "PENDING" && (
                    <span className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => patch(r.id, { status: "PUBLISHED" })}
                        className="text-[11.5px] font-medium px-3 py-1.5 rounded-full text-white" style={{ background: "#0E7A3D" }}>
                        ✓ Publish
                      </button>
                      <button onClick={() => patch(r.id, { status: "REJECTED" })}
                        className="text-[11.5px] font-medium px-3 py-1.5 rounded-full border" style={{ borderColor: "#f3c9c3", color: "#c0392b" }}>
                        Reject
                      </button>
                    </span>
                  )}
                  <span className={"text-body-soft text-[11px] transition-transform shrink-0 " + (expanded ? "rotate-90" : "")}>▶</span>
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

      {/* The advice he was given on 30 Jul, kept where the temptation is. */}
      <p className="text-[12px] text-body-soft px-5 py-4 max-w-[62ch]">
        Best done by asking a real customer on WhatsApp and typing what they reply. Invented testimonials break Facebook&rsquo;s and Google&rsquo;s advertising rules, and readers can usually tell.
      </p>
      </ModuleCard>
    </div>
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
