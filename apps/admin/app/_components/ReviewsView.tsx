"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import SaveBar, { type SaveState } from "./SaveBar";
import { ModuleCard, ModuleHeader, StatTiles } from "./ModuleShell";
import {
  listReviews, createReview, updateReview, replyReview, deleteReview,
  getGoogleSummary, saveGoogleSummary, uploadImage,
  listCustomers, listProducts,
  type ApiReview, type ApiCustomer, type ApiProduct,
} from "../_data/api";

/*
  Storefront · Reviews — v5 (12 Aug 2026).

  THE SHAPE: the owner pointed at CustomerEditor's side rail — "ami dicho
  dekho, pase amn tab kre design kre pura page ta sajaw" — so this page now
  wears exactly that anatomy: a colourful section rail on the left (icon
  tile, label, blurb, count; the open one fills with its gradient), and one
  section's content on the right. The Google card and the homepage shelf are
  sections of their own instead of strips stacked above the list.

  STILL TRUE FROM v4:
   · Dialogs close ONLY from × / Cancel — the overlay has no click handler,
     so a text-selection drag can never throw typed work away.
   · Reply opens only a reply box; Edit opens a dialog; Remove lives inside
     the dialog.

  AND THE OLD RULES (the point of the screen):
   · SOURCE never changes · Google reviews are never edited · Verified comes
     from the order history · the homepage shelf holds FOUR.
*/

const FEATURED_CAP = 4;
const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

/*  Same visual language as CustomerEditor's SECTIONS — tint/edge/chip for
    the resting card, gradient fill + glow for the open one.  */
const SECTIONS = [
  {
    id: "all", label: "All reviews", blurb: "Everything, newest first", icon: "grid",
    tint: "#f3e8f9", edge: "#e6d3f2", chip: "#e6d3f2",
    ink: "#3b0b52", sub: "#816894", strong: "#470066",
    fill: "linear-gradient(100deg,#470066,#7a1e86)", glow: "rgba(71,0,102,.30)", soft: "#e9a8f5",
  },
  {
    id: "waiting", label: "Waiting", blurb: "Approve or reject", icon: "clock",
    tint: "#fdf4e5", edge: "#f0deb9", chip: "#f0deb9",
    ink: "#6b4a08", sub: "#a5854a", strong: "#8a5a00",
    fill: "linear-gradient(100deg,#8a5a00,#b8821e)", glow: "rgba(138,90,0,.25)", soft: "#f0d9a4",
  },
  {
    id: "onsite", label: "On the site", blurb: "Live on the website", icon: "eye",
    tint: "#e9f7ee", edge: "#c9e8d4", chip: "#c9e8d4",
    ink: "#124f2e", sub: "#5c8f74", strong: "#0E7A3D",
    fill: "linear-gradient(100deg,#0E7A3D,#2f9c5c)", glow: "rgba(14,122,61,.25)", soft: "#a9e3c1",
  },
  {
    id: "hidden", label: "Hidden", blurb: "Taken off the site", icon: "box",
    tint: "#f3eff8", edge: "#e4dcee", chip: "#e4dcee",
    ink: "#453556", sub: "#8b7c9c", strong: "#5f4b73",
    fill: "linear-gradient(100deg,#5f4b73,#7f6b93)", glow: "rgba(95,75,115,.24)", soft: "#ded4ec",
  },
  {
    id: "website", label: "Website", blurb: "Customers wrote these", icon: "user",
    tint: "#e9f2fb", edge: "#c8ddf1", chip: "#c8ddf1",
    ink: "#123f68", sub: "#5b82a8", strong: "#185FA5",
    fill: "linear-gradient(100deg,#185FA5,#3f83c4)", glow: "rgba(24,95,165,.25)", soft: "#a9cdec",
  },
  {
    id: "google", label: "Google", blurb: "Card, feature and reply", icon: "search",
    tint: "#f9e9fd", edge: "#eecffa", chip: "#eecffa",
    ink: "#5e1a5c", sub: "#96639a", strong: "#8c2d84",
    fill: "linear-gradient(100deg,#8c2d84,#b444ad)", glow: "rgba(140,45,132,.26)", soft: "#f0c4ec",
  },
  {
    id: "featured", label: "Homepage picks", blurb: "Four front-page spots", icon: "star",
    tint: "#fbeaf0", edge: "#f2cddb", chip: "#f2cddb",
    ink: "#6b2138", sub: "#a06a7c", strong: "#993556",
    fill: "linear-gradient(100deg,#993556,#c25476)", glow: "rgba(153,53,86,.28)", soft: "#f4c0d1",
  },
] as const;
type SecId = (typeof SECTIONS)[number]["id"];

export default function ReviewsView() {
  const [rows, setRows] = useState<ApiReview[]>([]);
  const [sec, setSec] = useState<SecId>("all");
  const [starFilter, setStarFilter] = useState(0);
  const [productFilter, setProductFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<ApiReview | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
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
  const counts = useMemo<Record<SecId, number>>(() => ({
    all: rows.length,
    waiting: rows.filter((r) => r.status === "PENDING").length,
    onsite: rows.filter((r) => r.status === "PUBLISHED").length,
    hidden: rows.filter((r) => r.status === "REJECTED").length,
    website: rows.filter((r) => r.source === "CUSTOMER").length,
    google: rows.filter((r) => r.source === "GOOGLE").length,
    featured: rows.filter((r) => r.isFeatured).length,
  }), [rows]);
  const productsInRows = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (r.productId && r.product) seen.set(r.productId, r.product.name);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [rows]);

  const shown = useMemo(() => {
    let out = rows;
    if (sec === "waiting") out = out.filter((r) => r.status === "PENDING");
    else if (sec === "onsite") out = out.filter((r) => r.status === "PUBLISHED");
    else if (sec === "hidden") out = out.filter((r) => r.status === "REJECTED");
    else if (sec === "website") out = out.filter((r) => r.source === "CUSTOMER");
    else if (sec === "google") out = out.filter((r) => r.source === "GOOGLE");
    if (starFilter) out = out.filter((r) => r.rating === starFilter);
    if (productFilter) out = out.filter((r) => r.productId === productFilter);
    return out;
  }, [rows, sec, starFilter, productFilter]);

  const avg = counts.onsite
    ? Math.round((rows.filter((r) => r.status === "PUBLISHED").reduce((a, r) => a + r.rating, 0) / counts.onsite) * 10) / 10
    : null;

  async function patch(id: string, body: Parameters<typeof updateReview>[1]) {
    setSaveState("saving");
    try {
      const u = await updateReview(id, body);
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...u, product: r.product, customer: r.customer } : r)));
      flash("Saved");
      return true;
    } catch (e) { fail(e, "Could not save"); return false; }
  }

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

  const active = SECTIONS.find((s) => s.id === sec)!;
  const listSection = sec !== "featured";

  function renderCard(r: ApiReview) {
    const locked = r.source === "GOOGLE";
    const account = r.customer ? `${r.customer.phone} (${r.customer.name})` : r.customerPhone ?? null;
    const replying = replyFor === r.id;
    return (
      <div key={r.id}
        className={"rounded-[16px] border px-4 py-3.5 bg-white " +
          (r.status === "PENDING" ? "border-[#f0d5a8] bg-[#fffdf6]" : "border-lavender-deep")}>
        <div className="flex items-center gap-3">
          <Avatar r={r} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium text-purple">
              {r.authorName || "(no name)"}
              {r.status === "PENDING" && <Badge bg="#FFF4E6" color="#8a5a00">waiting</Badge>}
              {r.status === "REJECTED" && <Badge bg="#f4f2f7" color="#5f5a70">hidden</Badge>}
              {r.source === "CUSTOMER" && <Badge bg="#E6F1FB" color="#185FA5">website</Badge>}
              {r.source === "SHOP" && <Badge bg="#f9e9fd" color="#8c2d84">you added</Badge>}
              {r.source === "GOOGLE" && <Badge bg="#f7f1fb" color="#5f4b73">Google</Badge>}
              {r.verifiedPurchase && <Badge bg="#E8F9EE" color="#0E7A3D">✓ verified</Badge>}
              {r.isFeatured && <Badge bg="#E8F9EE" color="#0E7A3D">on homepage</Badge>}
              {r.imageUrl && <Badge bg="#f1f0fb" color="#4a4494">📷 photo</Badge>}
            </span>
            <span className="block text-[11.5px] text-body-soft">
              {account ? `${account} · ` : ""}
              {r.product ? <>about <b className="text-purple">{r.product.name}</b></> : "about the shop"}
              {" · "}{new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          </span>
          <span className="text-rosegold text-[12.5px] tracking-[1px] shrink-0">{"★".repeat(r.rating)}</span>
        </div>

        <p className="text-[13.5px] text-body mt-2.5 mb-0 leading-[1.55]">{r.body || <span className="text-body-soft">(no words)</span>}</p>

        {r.replyText && !replying && (
          <div className="mt-2.5 border-l-[3px] border-orchid bg-lavender/35 px-3 py-2">
            <p className="text-[10.5px] font-semibold tracking-[0.1em] uppercase text-orchid mb-0.5">Your reply</p>
            <p className="text-[12.5px] text-body mb-0">{r.replyText}</p>
          </div>
        )}

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {r.status === "PENDING" ? (
            <>
              <ActionBtn solid onClick={() => patch(r.id, { status: "PUBLISHED" })}>✓ Publish</ActionBtn>
              <ActionBtn danger onClick={() => patch(r.id, { status: "REJECTED" })}>Reject</ActionBtn>
              <ActionBtn onClick={() => setEditFor(r)}>Edit</ActionBtn>
            </>
          ) : (
            <>
              <ActionBtn onClick={() => setReplyFor(replying ? null : r.id)}>↩ Reply</ActionBtn>
              <ActionBtn onClick={() => setEditFor(r)}>{locked ? "View" : "Edit"}</ActionBtn>
              <ActionBtn active={r.isFeatured} onClick={() => requestFeature(r)}>★ Homepage</ActionBtn>
              {r.status === "PUBLISHED"
                ? <ActionBtn onClick={() => patch(r.id, { status: "REJECTED" })}>Hide</ActionBtn>
                : <ActionBtn onClick={() => patch(r.id, { status: "PUBLISHED" })}>Show again</ActionBtn>}
            </>
          )}
        </div>

        {replying && (
          <ReplyBox
            initial={r.replyText ?? ""}
            onCancel={() => setReplyFor(null)}
            onSave={async (text) => {
              setSaveState("saving");
              try {
                const u = await replyReview(r.id, text);
                setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, replyText: u.replyText, replyAt: u.replyAt } : x)));
                setReplyFor(null);
                flash("Reply saved");
              } catch (er) { fail(er, "Could not save the reply"); }
            }}
          />
        )}
      </div>
    );
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
          chips={counts.waiting > 0 ? [{ label: `⏳ ${counts.waiting} waiting`, bg: "#FBEAF0", color: "#6b2138" }] : []}
          action={{ label: "＋ Add a review", onClick: () => setComposerOpen(true) }}
        />
        <StatTiles tone="purple" stats={[
          { label: "On the site", value: counts.onsite },
          { label: "Waiting for you", value: counts.waiting },
          { label: "Shop average", value: avg !== null ? <>{avg} <span style={{ color: "#b76e79" }}>★</span></> : "—" },
          { label: "Verified", value: rows.filter((r) => r.verifiedPurchase).length },
        ]} />

        <div className="grid grid-cols-1 md:grid-cols-[236px_minmax(0,1fr)] gap-5 items-start mx-5 mt-5 mb-5">
          {/* ---- the colourful section rail ---- */}
          <nav className="hidden md:grid gap-2 md:sticky md:top-[16px] self-start md:max-h-[calc(100vh-32px)] md:overflow-y-auto">
            {SECTIONS.map((s) => {
              const on = sec === s.id;
              const n = counts[s.id];
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
                    {s.id === "featured" ? `${n}/${FEATURED_CAP}` : n}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* ---- the open section ---- */}
          <div className="flex-1 min-w-0">
            {/* mobile section picker */}
            <div className="md:hidden mb-4">
              <select className="ipt h-[44px]" value={sec} onChange={(e) => setSec(e.target.value as SecId)}>
                {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>

            {/* section headline in the section's own ink */}
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

            {sec === "google" && (
              <div className="flex items-center gap-3 px-3.5 py-3 mb-3 border border-lavender-deep rounded-[14px] bg-[#fdfbff] flex-wrap">
                <span className="w-[38px] h-[38px] rounded-[11px] bg-lavender grid place-items-center font-display text-[18px] text-purple shrink-0">G</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-body">
                    Google card —{" "}
                    {g.googleRating
                      ? <b className="text-[#0E7A3D]">showing: {g.googleRating.toFixed(1)} ★{g.googleReviewCount ? ` from ${g.googleReviewCount} reviews` : ""}</b>
                      : <b className="text-[#8a6414]">hidden — the stars box is empty</b>}
                  </span>
                  <span className="block text-[11.5px] text-body-soft">
                    Copy exactly what your Business Profile says · its own card on the site, never mixed into your shop average
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
            )}

            {sec === "featured" ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {featured.map((r) => (
                    <div key={r.id} className="rounded-[14px] border border-lavender-deep bg-gradient-to-br from-[#fdfbff] to-[#f9e9fd]/60 px-3.5 py-3 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <Avatar r={r} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-purple truncate">{r.authorName}</span>
                          <span className="block text-rosegold text-[10.5px] tracking-[1px]">{"★".repeat(r.rating)}</span>
                        </span>
                        <button onClick={() => patch(r.id, { isFeatured: false })} title="Take it off the homepage"
                          className="text-body-soft hover:text-[#c0392b] text-[14px] shrink-0 leading-none">×</button>
                      </div>
                      <p className="text-[12px] text-body-soft mt-2 line-clamp-3">{r.body}</p>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, FEATURED_CAP - featured.length) }).map((_, i) => (
                    <div key={`empty-${i}`} className="rounded-[14px] border-2 border-dashed border-lavender-deep/70 grid place-items-center py-6 text-[11.5px] text-body-soft min-h-[90px]">
                      empty spot
                    </div>
                  ))}
                </div>
                <p className="text-[12px] text-body-soft mt-3">
                  Pick from any review with its <b className="text-purple">★ Homepage</b> button. When all four spots are taken, featuring a fifth will ask which one steps down.
                </p>
              </>
            ) : (
              <>
                {/* stars + product, one quiet row */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {[0, 5, 4, 3, 2, 1].map((n) => (
                    <button key={n} onClick={() => setStarFilter(n)}
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

                <div className="space-y-3">
                  {loading ? <p className="text-[13px] text-body-soft">Loading…</p> : shown.length === 0 ? (
                    <p className="text-[13px] text-body-soft">
                      {sec === "waiting" ? "Nothing waiting — all caught up."
                        : sec === "hidden" ? "Nothing hidden."
                        : sec === "google" ? "No Google reviews brought in yet."
                        : "Nothing here — the reviews section stays hidden on the website until you publish one."}
                    </p>
                  ) : shown.map(renderCard)}
                </div>
              </>
            )}
          </div>
        </div>

        <p className="text-[12px] text-body-soft px-5 pb-4 max-w-[62ch]">
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

      {editFor && (
        <EditDialog
          review={editFor}
          onClose={() => setEditFor(null)}
          onSaved={async () => { setEditFor(null); await reload(); flash("Saved"); }}
          onError={(e) => fail(e, "Could not save")}
        />
      )}

      {/*  the overlay has NO click handler — a text-selection drag that ends
          outside the card must never throw the owner's work away  */}
      {swapFor && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
          <div className="bg-white rounded-[18px] shadow-xl w-full max-w-[420px] p-5">
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

/* ─── small action button ─────────────────────────────────────────────────── */
function ActionBtn({ children, onClick, solid, danger, active }: {
  children: React.ReactNode; onClick: () => void; solid?: boolean; danger?: boolean; active?: boolean;
}) {
  if (solid) {
    return (
      <button onClick={onClick} className="text-[12px] font-medium px-3.5 py-1.5 rounded-full text-white" style={{ background: "#0E7A3D" }}>
        {children}
      </button>
    );
  }
  if (danger) {
    return (
      <button onClick={onClick} className="text-[12px] font-medium px-3.5 py-1.5 rounded-full border" style={{ borderColor: "#f3c9c3", color: "#c0392b" }}>
        {children}
      </button>
    );
  }
  return (
    <button onClick={onClick}
      className={"text-[12px] font-medium px-3.5 py-1.5 rounded-full border transition-colors " +
        (active ? "bg-purple text-white border-purple" : "border-lavender-deep text-body hover:border-orchid hover:text-purple")}>
      {children}
    </button>
  );
}

/* ─── reply box — Reply opens this and nothing else (owner, 12 Aug) ───────── */
function ReplyBox({ initial, onSave, onCancel }: {
  initial: string; onSave: (text: string) => Promise<void>; onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3 border-l-[3px] border-orchid bg-lavender/35 px-3.5 py-3">
      <p className="text-[10.5px] font-semibold tracking-[0.1em] uppercase text-orchid mb-1.5">
        Your reply · shows under the review on the site · empty removes it
      </p>
      <textarea className="ipt" rows={2} value={text} autoFocus
        placeholder="Thank you! It was a joy to make this one. - Team Radian"
        onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2 mt-2">
        <button disabled={busy}
          onClick={async () => { setBusy(true); try { await onSave(text); } finally { setBusy(false); } }}
          className="text-[12.5px] font-medium px-4 py-1.5 rounded-full bg-purple hover:bg-purple-deep text-white disabled:opacity-50">
          {busy ? "Saving…" : "Save reply"}
        </button>
        <button onClick={onCancel} className="text-[12.5px] px-3 py-1.5 text-body-soft hover:text-purple">Cancel</button>
      </div>
    </div>
  );
}

/* ─── shared dialog frame — closes ONLY from × / Cancel, never the overlay ── */
function Dialog({ title, sub, onClose, children, footer }: {
  title: string; sub?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4 overflow-y-auto">
      <div className="bg-white rounded-[18px] shadow-xl w-full max-w-[560px] my-6">
        <div className="px-5 pt-5 pb-3 border-b border-lavender-deep flex items-center justify-between">
          <div>
            <p className="font-display text-[18px] text-purple">{title}</p>
            {sub && <p className="text-[12px] text-body-soft">{sub}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-body-soft hover:text-purple text-[20px] leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
        <div className="px-5 py-4 border-t border-lavender-deep flex items-center justify-between gap-2">{footer}</div>
      </div>
    </div>
  );
}

/* ─── the composer (create) ───────────────────────────────────────────────── */
function Composer({ onClose, onCreated, onError }: {
  onClose: () => void; onCreated: () => Promise<void>; onError: (e: unknown) => void;
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
    <Dialog
      title="Add a review"
      sub="Goes live immediately — it is the shop speaking, labelled &ldquo;you added&rdquo;"
      onClose={onClose}
      footer={
        <>
          <span />
          <span className="flex items-center gap-2">
            <button onClick={onClose} className="text-[13px] text-body-soft hover:text-purple px-3 py-2">Cancel</button>
            <button onClick={save} disabled={!canSave || saving}
              className={"text-[13px] font-medium px-5 py-2.5 rounded-[11px] text-white transition-opacity " +
                (canSave && !saving ? "bg-purple hover:bg-purple-deep" : "bg-purple/40 cursor-not-allowed")}>
              {saving ? "Saving…" : "Add the review"}
            </button>
          </span>
        </>
      }>
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

      <PhotoField imageUrl={imageUrl} uploading={uploading} onPick={async (file) => {
        setUploading(true);
        try { const { url } = await uploadImage(file, "reviews"); setImageUrl(url); }
        catch (er) { onError(er); }
        finally { setUploading(false); }
      }} onRemove={() => setImageUrl(null)} />
    </Dialog>
  );
}

/* ─── the edit dialog — full form, same shape as the composer ─────────────── */
function EditDialog({ review, onClose, onSaved, onError }: {
  review: ApiReview; onClose: () => void; onSaved: () => Promise<void>; onError: (e: unknown) => void;
}) {
  const locked = review.source === "GOOGLE";
  const [name, setName] = useState(review.authorName);
  const [rating, setRating] = useState(review.rating);
  const [body, setBody] = useState(review.body);
  const [context, setContext] = useState(review.context ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(review.imageUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await updateReview(review.id, locked
        ? {}
        : {
            authorName: name.trim() || "A customer",
            rating,
            body: body.trim(),
            context: context.trim() || null,
            imageUrl,
          });
      await onSaved();
    } catch (e) { onError(e); setSaving(false); }
  }

  async function removeReview() {
    if (!confirm("Remove this review for good?")) return;
    try { await deleteReview(review.id); await onSaved(); }
    catch (e) { onError(e); }
  }

  return (
    <Dialog
      title={locked ? "A Google review" : "Edit review"}
      sub={locked
        ? "Their words on Google — not ours to rewrite. Hide, feature or reply from the card."
        : review.customer ? `linked to ${review.customer.name} (${review.customer.phone})` : undefined}
      onClose={onClose}
      footer={
        <>
          <button onClick={removeReview} className="text-[12.5px] text-body-soft hover:text-[#c0392b]">Remove this review</button>
          <span className="flex items-center gap-2">
            <button onClick={onClose} className="text-[13px] text-body-soft hover:text-purple px-3 py-2">Cancel</button>
            {!locked && (
              <button onClick={save} disabled={saving}
                className="text-[13px] font-medium px-5 py-2.5 rounded-[11px] text-white bg-purple hover:bg-purple-deep disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </span>
        </>
      }>
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <L label="Name">
          <input className="ipt" value={name} disabled={locked} onChange={(e) => setName(e.target.value)} />
        </L>
        <L label="Stars">
          <select className="ipt" value={rating} disabled={locked} onChange={(e) => setRating(Number(e.target.value))}>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
          </select>
        </L>
      </div>
      <L label="What they said">
        <textarea className="ipt" rows={4} value={body} disabled={locked} onChange={(e) => setBody(e.target.value)} />
      </L>
      <L label="The line under the name" hint="optional · Anniversary · Midnight delivery">
        <input className="ipt" value={context} disabled={locked} onChange={(e) => setContext(e.target.value)} />
      </L>
      {!locked && (
        <PhotoField imageUrl={imageUrl} uploading={uploading} onPick={async (file) => {
          setUploading(true);
          try { const { url } = await uploadImage(file, "reviews"); setImageUrl(url); }
          catch (er) { onError(er); }
          finally { setUploading(false); }
        }} onRemove={() => setImageUrl(null)} />
      )}
    </Dialog>
  );
}

/* ─── photo picker used by both dialogs ───────────────────────────────────── */
function PhotoField({ imageUrl, uploading, onPick, onRemove }: {
  imageUrl: string | null; uploading: boolean; onPick: (f: File) => void; onRemove: () => void;
}) {
  return (
    <L label="Photo" hint="optional · the gift as it arrived">
      <label className="relative block w-[170px] aspect-[11/5] rounded-[10px] border-2 border-dashed border-lavender-deep bg-lavender/40 hover:border-orchid cursor-pointer overflow-hidden grid place-items-center">
        {imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={imageUrl} alt="" className={"absolute inset-0 w-full h-full object-cover " + (uploading ? "opacity-40" : "")} />
          : <span className="text-body-soft text-[11px]">{uploading ? "Uploading…" : "add a photo"}</span>}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }} />
      </label>
      {imageUrl && <button onClick={onRemove} className="text-[12px] text-body-soft hover:text-[#c0392b] mt-1.5">Remove photo</button>}
    </L>
  );
}

/* ─── pickers ─────────────────────────────────────────────────────────────── */
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

/* ─── avatars & bits ──────────────────────────────────────────────────────── */
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
