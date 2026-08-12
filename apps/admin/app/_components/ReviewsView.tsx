"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import SaveBar, { type SaveState } from "./SaveBar";
import { ModuleCard, ModuleHeader, StatTiles, FilterChips } from "./ModuleShell";
import {
  listReviews, createReview, updateReview, replyReview, deleteReview,
  getGoogleSummary, saveGoogleSummary, uploadImage,
  listCustomers, listProducts,
  type ApiReview, type ReviewStatus, type ApiCustomer, type ApiProduct,
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
   · "Verified" cannot be ticked. It comes from the order history — the
     composer picks a customer and the SERVER checks their delivered orders.
   · The homepage shelf holds FOUR. Featuring a fifth asks which one steps
     down; it never guesses (DEC-WEB-009).

  The section on the site shows NOTHING until something is published here.
*/


const SOURCE_LABEL: Record<string, string> = {
  CUSTOMER: "customer wrote this",
  SHOP: "you added this",
  GOOGLE: "from Google",
};

const FEATURED_CAP = 4;

/* Same page frame as every other admin screen (31 Jul 2026). */
const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

export default function ReviewsView() {
  const [rows, setRows] = useState<ApiReview[]>([]);
  const [tab, setTab] = useState<ReviewStatus | "ALL" | "CUSTOMER" | "GOOGLE" | "SHOP">("ALL");
  const [starFilter, setStarFilter] = useState<number | 0>(0);
  const [productFilter, setProductFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [open, setOpen] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  /** the review that wants a homepage spot while the shelf is full */
  const [swapFor, setSwapFor] = useState<string | null>(null);
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

  const featured = useMemo(() => rows.filter((r) => r.isFeatured), [rows]);
  const productsInRows = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (r.productId && r.product) seen.set(r.productId, r.product.name);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [rows]);

  const shown = useMemo(() => {
    let out = rows;
    if (tab === "CUSTOMER" || tab === "GOOGLE" || tab === "SHOP") out = out.filter((r) => r.source === tab);
    else if (tab !== "ALL") out = out.filter((r) => r.status === tab);
    if (starFilter) out = out.filter((r) => r.rating === starFilter);
    if (productFilter) out = out.filter((r) => r.productId === productFilter);
    return out;
  }, [rows, tab, starFilter, productFilter]);

  const pending = rows.filter((r) => r.status === "PENDING").length;
  const published = rows.filter((r) => r.status === "PUBLISHED");
  const avg = published.length
    ? Math.round((published.reduce((a, r) => a + r.rating, 0) / published.length) * 10) / 10
    : null;
  const verifiedCount = rows.filter((r) => r.verifiedPurchase).length;

  async function patch(id: string, body: Parameters<typeof updateReview>[1]) {
    setSaveState("saving");
    try {
      const u = await updateReview(id, body);
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...u, product: r.product, customer: r.customer } : r)));
      flash("Saved");
    } catch (e) { fail(e, "Could not save"); }
  }

  /** DEC-WEB-009 — the shelf holds 4. A fifth must name who steps down. */
  function requestFeature(r: ApiReview) {
    if (r.isFeatured) { void patch(r.id, { isFeatured: false }); return; }
    if (featured.length >= FEATURED_CAP) { setSwapFor(r.id); return; }
    void patch(r.id, { isFeatured: true });
  }

  async function swap(outId: string) {
    if (!swapFor) return;
    setSaveState("saving");
    try {
      await updateReview(swapFor, { isFeatured: true, swapOutId: outId });
      setSwapFor(null);
      await reload();
      flash("Swapped");
    } catch (e) { fail(e, "Could not swap"); }
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
          action={{ label: "＋ Add a review", onClick: () => setComposerOpen(true) }}
        />
        <StatTiles tone="purple" stats={[
          { label: "On the site", value: published.length },
          { label: "Waiting for you", value: pending },
          { label: "Shop average", value: avg !== null ? <>{avg} <span style={{ color: "#b76e79" }}>★</span></> : "—" },
          { label: "Verified", value: verifiedCount },
        ]} />

      {/* ---- the Google card — a strip, not a wall. NEVER merged with the shop's own average. ---- */}
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
            Copy exactly what your Business Profile says · shown as its own card, never mixed into your shop average
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

      {/* ---- the homepage shelf — four spots, owner-picked (DEC-WEB-009) ---- */}
      <div className="mx-5 mt-4">
        <p className="text-[12.5px] font-medium text-body mb-2">
          Homepage picks <span className="text-body-soft font-normal">· {featured.length} of {FEATURED_CAP} spots</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          {featured.map((r) => (
            <div key={r.id} className="rounded-[13px] border border-lavender-deep bg-gradient-to-br from-[#fdfbff] to-[#f9e9fd]/60 px-3 py-2.5 min-w-0">
              <div className="flex items-center gap-2">
                <Avatar r={r} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium text-purple truncate">{r.authorName}</span>
                  <span className="block text-rosegold text-[10px] tracking-[1px]">{"★".repeat(r.rating)}</span>
                </span>
                <button onClick={() => patch(r.id, { isFeatured: false })} title="Take it off the homepage"
                  className="text-body-soft hover:text-[#c0392b] text-[13px] shrink-0 leading-none">×</button>
              </div>
              <p className="text-[11px] text-body-soft mt-1.5 line-clamp-2">{r.body}</p>
            </div>
          ))}
          {Array.from({ length: Math.max(0, FEATURED_CAP - featured.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="rounded-[13px] border-2 border-dashed border-lavender-deep/70 grid place-items-center py-4 text-[11px] text-body-soft min-h-[68px]">
              empty spot
            </div>
          ))}
        </div>
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

      {/* second row of filters: stars + product */}
      <div className="flex items-center gap-2 px-5 pb-3 flex-wrap">
        {[0, 5, 4, 3, 2, 1].map((n) => (
          <button key={n} onClick={() => setStarFilter(n as number | 0)}
            className={"text-[11.5px] px-2.5 py-1 rounded-full border transition-colors " +
              (starFilter === n
                ? "bg-purple text-white border-purple"
                : "border-lavender-deep text-body-soft hover:border-orchid")}>
            {n === 0 ? "Any stars" : "★".repeat(n)}
          </button>
        ))}
        {productsInRows.length > 0 && (
          <select className="ipt !w-auto h-[30px] !py-0 !text-[11.5px]" value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
            <option value="">Any product</option>
            {productsInRows.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

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
                  <Avatar r={r} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-purple">
                      {r.authorName || "(no name)"}
                      {r.status === "PENDING" && <Badge bg="#FFF4E6" color="#8a5a00">waiting</Badge>}
                      {r.source === "CUSTOMER" && <Badge bg="#E6F1FB" color="#185FA5">🌐 website</Badge>}
                      {r.source === "SHOP" && <Badge bg="#f9e9fd" color="#8c2d84">✍ you added</Badge>}
                      {r.source === "GOOGLE" && <Badge bg="#f7f1fb" color="#5f4b73">G Google</Badge>}
                      {r.verifiedPurchase && <Badge bg="#E8F9EE" color="#0E7A3D">✓ verified</Badge>}
                      {r.isFeatured && r.status === "PUBLISHED" && <Badge bg="#E8F9EE" color="#0E7A3D">on homepage</Badge>}
                      {r.imageUrl && <Badge bg="#f1f0fb" color="#4a4494">📷 photo</Badge>}
                      {r.replyText && <Badge bg="#fdf3e7" color="#8a5a00">↩ replied</Badge>}
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
                        These are the customer&rsquo;s own words on Google, so they cannot be edited here — only hidden, chosen for the homepage, or replied to.
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

                    {/* DEC-WEB-007 — the shop's reply, shown under the review on the site */}
                    <L label="Your reply" hint="Shows under the review on the website · empty removes it">
                      <textarea className="ipt" rows={2} defaultValue={r.replyText ?? ""}
                        placeholder="Thank you! It was a joy to make this one — see you at the next birthday. — Team Radian"
                        onBlur={async (e) => {
                          if (e.target.value === (r.replyText ?? "")) return;
                          setSaveState("saving");
                          try {
                            const u = await replyReview(r.id, e.target.value);
                            setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, replyText: u.replyText, replyAt: u.replyAt } : x)));
                            flash("Reply saved");
                          } catch (er) { fail(er, "Could not save the reply"); }
                        }} />
                    </L>

                    <div className="grid grid-cols-1 md:grid-cols-[170px_1fr] gap-4">
                      <L label="Photo" hint="the customer's photo of the gift · optional">
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
                        <Toggle label={`Homepage spot (${featured.length}/${FEATURED_CAP} used)`} on={r.isFeatured} onClick={() => requestFeature(r)} />
                        <div className="text-[11.5px] text-body-soft">
                          {SOURCE_LABEL[r.source]} · {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          {r.product ? ` · about ${r.product.name}` : ""}
                          {r.verifiedPurchase ? " · verified from the order book" : ""}
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

      {composerOpen && (
        <Composer
          onClose={() => setComposerOpen(false)}
          onCreated={async () => { setComposerOpen(false); await reload(); flash("Review added"); }}
          onError={(e) => fail(e, "Could not create")}
        />
      )}

      {swapFor && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setSwapFor(null)}>
          <div className="bg-white rounded-[18px] shadow-xl w-full max-w-[420px] p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-[17px] text-purple mb-1">The homepage shelf is full</p>
            <p className="text-[12.5px] text-body-soft mb-3">All {FEATURED_CAP} spots are taken. Pick the one that steps down:</p>
            <div className="space-y-2">
              {featured.map((f) => (
                <button key={f.id} onClick={() => swap(f.id)}
                  className="w-full flex items-center gap-2.5 border border-lavender-deep rounded-[12px] px-3 py-2.5 text-left hover:border-orchid hover:bg-lavender/30 transition-colors">
                  <Avatar r={f} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-purple truncate">{f.authorName}</span>
                    <span className="block text-[11px] text-body-soft truncate">{f.body}</span>
                  </span>
                  <span className="text-rosegold text-[10.5px] tracking-[1px] shrink-0">{"★".repeat(f.rating)}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setSwapFor(null)} className="mt-3 text-[13px] text-body-soft hover:text-purple">Never mind</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── the composer dialog (DEC-WEB-009) ─────────────────────────────────────
   Its own surface, on purpose: adding a review no longer happens squeezed
   between existing rows. Pick a customer from the book (their photo comes
   along), say whether it is about the whole shop or one product, then the
   words. Verified is decided by the server from the order history. */
function Composer({ onClose, onCreated, onError }: {
  onClose: () => void;
  onCreated: () => Promise<void>;
  onError: (e: unknown) => void;
}) {
  const [customer, setCustomer] = useState<ApiCustomer | null>(null);
  const [freeName, setFreeName] = useState("");
  const [about, setAbout] = useState<"SHOP" | "PRODUCT">("SHOP");
  const [product, setProduct] = useState<{ id: string; name: string } | null>(null);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [context, setContext] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = body.trim().length >= 5 && (customer || freeName.trim()) && (about === "SHOP" || product);

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await createReview({
        customerId: customer?.id ?? null,
        authorName: customer ? undefined : freeName.trim(),
        productId: about === "PRODUCT" ? product?.id ?? null : null,
        rating,
        body: body.trim(),
        context: context.trim() || null,
        imageUrl,
      });
      await onCreated();
    } catch (e) { onError(e); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-[18px] shadow-xl w-full max-w-[560px] my-6" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b border-lavender-deep flex items-center justify-between">
          <div>
            <p className="font-display text-[18px] text-purple">Add a review</p>
            <p className="text-[12px] text-body-soft">Goes live immediately — it is the shop speaking, labelled &ldquo;you added&rdquo;</p>
          </div>
          <button onClick={onClose} className="text-body-soft hover:text-purple text-[20px] leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <L label="Who said it" hint="pick from your customer book — their photo and Verified badge come along">
            <CustomerPicker value={customer} onPick={setCustomer} />
            {!customer && (
              <input className="ipt mt-2" placeholder="…or just type a name (no account linked)"
                value={freeName} onChange={(e) => setFreeName(e.target.value)} />
            )}
          </L>

          <L label="What is it about">
            <div className="flex gap-2">
              <button onClick={() => { setAbout("SHOP"); setProduct(null); }}
                className={"flex-1 rounded-[11px] border px-3 py-2.5 text-[13px] transition-colors " +
                  (about === "SHOP" ? "border-purple bg-lavender/50 text-purple font-medium" : "border-lavender-deep text-body-soft hover:border-orchid")}>
                The whole shop
              </button>
              <button onClick={() => setAbout("PRODUCT")}
                className={"flex-1 rounded-[11px] border px-3 py-2.5 text-[13px] transition-colors " +
                  (about === "PRODUCT" ? "border-purple bg-lavender/50 text-purple font-medium" : "border-lavender-deep text-body-soft hover:border-orchid")}>
                One product
              </button>
            </div>
            {about === "PRODUCT" && <div className="mt-2"><ProductPicker value={product} onPick={setProduct} /></div>}
          </L>

          <div className="grid grid-cols-[110px_1fr] gap-3">
            <L label="Stars">
              <select className="ipt" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
              </select>
            </L>
            <L label="The line under the name" hint="optional · Anniversary · Midnight delivery">
              <input className="ipt" value={context} onChange={(e) => setContext(e.target.value)} />
            </L>
          </div>

          <L label="What they said">
            <textarea className="ipt" rows={4} value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="The roses arrived at midnight sharp — my wife cried. Thank you, Radian." />
          </L>

          <L label="Photo" hint="optional · the gift as it arrived">
            <label className="relative block w-[170px] aspect-[11/5] rounded-[10px] border-2 border-dashed border-lavender-deep bg-lavender/40 hover:border-orchid cursor-pointer overflow-hidden grid place-items-center">
              {imageUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={imageUrl} alt="" className={"absolute inset-0 w-full h-full object-cover " + (uploading ? "opacity-40" : "")} />
                : <span className="text-body-soft text-[11px]">{uploading ? "Uploading…" : "add a photo"}</span>}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  setUploading(true);
                  try { const { url } = await uploadImage(file, "reviews"); setImageUrl(url); }
                  catch (er) { onError(er); }
                  finally { setUploading(false); }
                }} />
            </label>
            {imageUrl && <button onClick={() => setImageUrl(null)} className="text-[12px] text-body-soft hover:text-[#c0392b] mt-1.5">Remove</button>}
          </L>
        </div>

        <div className="px-5 py-4 border-t border-lavender-deep flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-[13px] text-body-soft hover:text-purple px-3 py-2">Cancel</button>
          <button onClick={save} disabled={!canSave || saving}
            className={"text-[13px] font-medium px-5 py-2.5 rounded-[11px] text-white transition-opacity " +
              (canSave && !saving ? "bg-purple hover:bg-purple-deep" : "bg-purple/40 cursor-not-allowed")}>
            {saving ? "Saving…" : "Add the review"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** search-as-you-type over the customer book; the pick shows photo + phone */
function CustomerPicker({ value, onPick }: { value: ApiCustomer | null; onPick: (c: ApiCustomer | null) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ApiCustomer[]>([]);
  const [openList, setOpenList] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!openList) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await listCustomers(q.trim() ? { search: q.trim() } : undefined);
        setHits(res.items.slice(0, 8));
      } catch { setHits([]); }
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, openList]);

  if (value) {
    return (
      <div className="flex items-center gap-2.5 border border-purple/40 bg-lavender/40 rounded-[12px] px-3 py-2">
        <CircleAvatar name={value.name} imageUrl={value.imageUrl ?? null} size={34} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-purple truncate">{value.name}</span>
          <span className="block text-[11.5px] text-body-soft">{value.phone}</span>
        </span>
        <button onClick={() => onPick(null)} className="text-body-soft hover:text-[#c0392b] text-[13px] shrink-0">change</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input className="ipt" placeholder="Search name or phone…" value={q}
        onFocus={() => setOpenList(true)}
        onChange={(e) => { setQ(e.target.value); setOpenList(true); }} />
      {openList && hits.length > 0 && (
        <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-lavender-deep rounded-[12px] shadow-lg overflow-hidden max-h-[260px] overflow-y-auto">
          {hits.map((c) => (
            <button key={c.id} onClick={() => { onPick(c); setOpenList(false); setQ(""); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-lavender/40 transition-colors">
              <CircleAvatar name={c.name} imageUrl={c.imageUrl ?? null} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium text-purple truncate">{c.name}</span>
                <span className="block text-[11px] text-body-soft">{c.phone}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** same pattern for products */
function ProductPicker({ value, onPick }: { value: { id: string; name: string } | null; onPick: (p: { id: string; name: string } | null) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ApiProduct[]>([]);
  const [openList, setOpenList] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!openList) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await listProducts(q.trim() ? { search: q.trim() } : undefined);
        setHits(res.items.slice(0, 8));
      } catch { setHits([]); }
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, openList]);

  if (value) {
    return (
      <div className="flex items-center gap-2.5 border border-purple/40 bg-lavender/40 rounded-[12px] px-3 py-2">
        <span className="min-w-0 flex-1 text-[13px] font-medium text-purple truncate">{value.name}</span>
        <button onClick={() => onPick(null)} className="text-body-soft hover:text-[#c0392b] text-[13px] shrink-0">change</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input className="ipt" placeholder="Search products…" value={q}
        onFocus={() => setOpenList(true)}
        onChange={(e) => { setQ(e.target.value); setOpenList(true); }} />
      {openList && hits.length > 0 && (
        <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-lavender-deep rounded-[12px] shadow-lg overflow-hidden max-h-[260px] overflow-y-auto">
          {hits.map((p) => (
            <button key={p.id} onClick={() => { onPick({ id: p.id, name: p.name }); setOpenList(false); setQ(""); }}
              className="w-full px-3 py-2 text-left text-[12.5px] text-purple hover:bg-lavender/40 transition-colors truncate block">
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** the face on a row: customer photo first, review photo second, initials last */
function Avatar({ r, size }: { r: ApiReview; size: number }) {
  const src = r.customer?.imageUrl || null;
  if (r.source === "GOOGLE" && !src) {
    return (
      <span className="rounded-full grid place-items-center shrink-0 text-[13px] font-semibold"
        style={{ width: size, height: size, background: "#f7f1fb", color: "#470066" }}>G</span>
    );
  }
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <span className="rounded-full grid place-items-center text-white font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.3, background: "linear-gradient(135deg,#e9a8f5,#cf43ea)" }}>
      {(r.authorName || "?").split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?"}
    </span>
  );
}

function CircleAvatar({ name, imageUrl, size }: { name: string; imageUrl: string | null; size: number }) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <span className="rounded-full grid place-items-center text-white font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.32, background: "linear-gradient(135deg,#e9a8f5,#cf43ea)" }}>
      {(name || "?").split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?"}
    </span>
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
