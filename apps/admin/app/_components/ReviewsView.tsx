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
  Storefront · Reviews — v4 (12 Aug 2026, owner's redesign notes).

  WHAT CHANGED AND WHY:

   · Every dialog closes ONLY from its × or Cancel. The overlay has no click
     handler at all. The first build closed on overlay click, and selecting
     text with the mouse — press inside, release outside — fired that click
     and threw away everything typed. The owner hit this twice.
   · A review card shows the words and four small actions. REPLY opens only
     a reply box; EDIT opens a dialog with the full form. The old build
     expanded everything at once, which read as chaos.
   · Filters are cards with counts (All / Waiting / On the site / Hidden /
     Website / Google), not a strip of chips. Hidden gets its own card so
     rejected rows stop muddying "All".

  THE OLD RULES STILL HOLD (they are the point of this screen):
   · SOURCE never changes after creation.
   · A GOOGLE review cannot be edited — only hidden, featured, replied to.
   · Verified comes from the order history, never from a form.
   · The homepage shelf holds FOUR; a fifth must name who steps down.
*/

const FEATURED_CAP = 4;
const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

type Tab = "ALL" | "PENDING" | "PUBLISHED" | "REJECTED" | "CUSTOMER" | "GOOGLE";

export default function ReviewsView() {
  const [rows, setRows] = useState<ApiReview[]>([]);
  const [tab, setTab] = useState<Tab>("ALL");
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
  const counts = useMemo(() => ({
    all: rows.length,
    pending: rows.filter((r) => r.status === "PENDING").length,
    published: rows.filter((r) => r.status === "PUBLISHED").length,
    hidden: rows.filter((r) => r.status === "REJECTED").length,
    website: rows.filter((r) => r.source === "CUSTOMER").length,
    google: rows.filter((r) => r.source === "GOOGLE").length,
  }), [rows]);
  const productsInRows = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (r.productId && r.product) seen.set(r.productId, r.product.name);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [rows]);

  const shown = useMemo(() => {
    let out = rows;
    if (tab === "CUSTOMER" || tab === "GOOGLE") out = out.filter((r) => r.source === tab);
    else if (tab !== "ALL") out = out.filter((r) => r.status === tab);
    if (starFilter) out = out.filter((r) => r.rating === starFilter);
    if (productFilter) out = out.filter((r) => r.productId === productFilter);
    return out;
  }, [rows, tab, starFilter, productFilter]);

  const avg = counts.published
    ? Math.round((rows.filter((r) => r.status === "PUBLISHED").reduce((a, r) => a + r.rating, 0) / counts.published) * 10) / 10
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
          chips={counts.pending > 0 ? [{ label: `⏳ ${counts.pending} waiting`, bg: "#FBEAF0", color: "#6b2138" }] : []}
          action={{ label: "＋ Add a review", onClick: () => setComposerOpen(true) }}
        />
        <StatTiles tone="purple" stats={[
          { label: "On the site", value: counts.published },
          { label: "Waiting for you", value: counts.pending },
          { label: "Shop average", value: avg !== null ? <>{avg} <span style={{ color: "#b76e79" }}>★</span></> : "—" },
          { label: "Verified", value: rows.filter((r) => r.verifiedPurchase).length },
        ]} />

        {/* ---- Google strip — its own card, never mixed into the shop average ---- */}
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
              Copy exactly what your Business Profile says · shown as its own card on the site
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

        {/* ---- Homepage shelf — four spots (DEC-WEB-009) ---- */}
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

        {/*  Tabs sitting side by side inside one card — the owner's note,
            12 Aug: "all / waiting — pase tab kre card akare diye sajaw".
            The active tab wears its own tint; the rest stay quiet.  */}
        <div className="mx-5 mt-5">
          <div className="inline-flex flex-wrap items-center gap-1 bg-white border border-lavender-deep rounded-[14px] p-1.5">
            <FilterTab active={tab === "ALL"} onClick={() => setTab("ALL")} n={counts.all} label="All" bg="#f3edfb" ink="#4a3f96" />
            <FilterTab active={tab === "PENDING"} onClick={() => setTab("PENDING")} n={counts.pending} label="Waiting" bg="#FFF4E6" ink="#8a5a00" />
            <FilterTab active={tab === "PUBLISHED"} onClick={() => setTab("PUBLISHED")} n={counts.published} label="On the site" bg="#E8F9EE" ink="#0E7A3D" />
            <FilterTab active={tab === "REJECTED"} onClick={() => setTab("REJECTED")} n={counts.hidden} label="Hidden" bg="#f4f2f7" ink="#5f5a70" />
            <FilterTab active={tab === "CUSTOMER"} onClick={() => setTab("CUSTOMER")} n={counts.website} label="Website" bg="#E6F1FB" ink="#185FA5" />
            <FilterTab active={tab === "GOOGLE"} onClick={() => setTab("GOOGLE")} n={counts.google} label="Google" bg="#f7f1fb" ink="#5f4b73" />
          </div>
        </div>

        {/* stars + product, one quiet row */}
        <div className="flex items-center gap-2 mx-5 mt-3 flex-wrap">
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

        {/* ---- the review cards ---- */}
        <div className="mx-5 mt-4 mb-2 space-y-3">
          {loading ? <p className="text-[13px] text-body-soft pb-4">Loading…</p> : shown.length === 0 ? (
            <p className="text-[13px] text-body-soft pb-4">
              {tab === "PENDING" ? "Nothing waiting." : "Nothing here — the reviews section stays hidden on the website until you publish one."}
            </p>
          ) : shown.map((r) => {
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

                {/* ---- the four small actions ---- */}
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

                {/* ---- reply box — the ONLY thing Reply opens ---- */}
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
          })}
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

/* ─── one tab in the filter bar ───────────────────────────────────────────── */
function FilterTab({ active, onClick, n, label, bg, ink }: {
  active: boolean; onClick: () => void; n: number; label: string; bg: string; ink: string;
}) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12.5px] transition-all"
      style={active
        ? { background: bg, color: ink, fontWeight: 600, boxShadow: `inset 0 0 0 1.5px ${ink}` }
        : { color: "#8d86a0" }}>
      {label}
      <span className="text-[11px] font-semibold px-1.5 py-px rounded-full leading-[1.4]"
        style={active ? { background: "#ffffff", color: ink } : { background: bg, color: ink }}>
        {n}
      </span>
    </button>
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
        ? {} // nothing editable — the dialog is read-only for Google
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
