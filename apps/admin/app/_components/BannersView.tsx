"use client";

import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "./backdropClose";
import Icon from "./Icon";
import CommaListInput from "./CommaListInput";
import {
  listBanners, createBanner, updateBanner, deleteBanner,
  getStorefrontSettings, setStorefrontSettings, uploadImage,
  type ApiBanner, type BannerPlacement,
} from "../_data/api";

/*
  Storefront · Banners — the homepage slider, the seasonal promo strip and the
  thin purple announcement line.

  Owner's decision, 30 Jul 2026: he manages these himself. Eid, Valentine's and
  Mother's Day each move the hero, and routing that through a developer every
  season guarantees a stale homepage.

  THE TEMPLATE IS FIXED, THE CONTENT IS NOT — the one boundary he agreed to
  after asking for "everything dynamic". Every word, picture, colour, link,
  date and position is his; the arrangement of the elements is not. A
  free-form canvas breaks an approved design in front of customers, and that
  failure is public.

  WHY THE FIELDS CHANGE BY PLACEMENT: an announcement line is one sentence, a
  hero is fourteen fields. Showing all fourteen for an announcement would leave
  eleven empty boxes and no clue which ones matter.
*/

const PLACEMENTS: { key: BannerPlacement; label: string; hint: string }[] = [
  { key: "HERO", label: "Homepage slider", hint: "The big picture at the top" },
  { key: "PROMO", label: "Promo strip", hint: "The seasonal band lower down" },
  { key: "ANNOUNCEMENT", label: "Announcement line", hint: "The thin line above the menu" },
];

/* null is a real, meaningful value here — "show this in every zone" — so it
   cannot be represented by an empty string that also means "not chosen yet". */
const ZONES: { value: string; label: string }[] = [
  { value: "", label: "Every zone" },
  { value: "DHAKA", label: "Dhaka only" },
  { value: "NATIONWIDE", label: "All Bangladesh only" },
];

const ICONS = ["bolt", "heart", "truck", "gift", "clock", "star", "shield", "pin"];

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

/*
  `embedded` — the same editor, rendered INSIDE the section it belongs to.

  Owner, 31 Jul 2026: everything a homepage section needs must be reachable
  without leaving the homepage. Rather than build a second, weaker editor in
  the list row, the real one is reused with its page furniture switched off:
  no h1, no page padding, no tab bar it does not need. One editor, two places
  it can appear, and no chance of the two drifting apart.
*/
export default function BannersView({ embedded, only }: { embedded?: boolean; only?: BannerPlacement } = {}) {
  const [rows, setRows] = useState<ApiBanner[]>([]);
  const [rotate, setRotate] = useState(6);
  /*  The announcement line when no announcement is live: describe the
      delivery service from the masters (true), or draw no bar (false).
      A live announcement always shows, whatever this says (4 Sep 2026).  */
  const [annAuto, setAnnAuto] = useState(true);
  const [tab, setTab] = useState<BannerPlacement>(only ?? "HERO");
  const [editing, setEditing] = useState<ApiBanner | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const flash = (m: string) => { setOk(m); setTimeout(() => setOk(null), 2500); };

  async function reload() {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([listBanners(), getStorefrontSettings()]);
      setRows(b);
      setRotate(s.heroRotateSeconds);
      setAnnAuto(s.announcementAuto ?? true);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load banners");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void reload(); }, []);

  const shown = useMemo(
    () => rows.filter((r) => r.placement === tab).sort((a, b) => a.sortOrder - b.sortOrder),
    [rows, tab],
  );

  async function addNew() {
    try {
      const created = await createBanner({
        placement: tab,
        titleMain: tab === "ANNOUNCEMENT" ? "New announcement" : "New banner",
        isActive: false, // never goes live the instant it is created, half-filled
        sortOrder: shown.length,
      });
      setRows((r) => [...r, created]);
      setEditing(created);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create");
    }
  }

  async function patch(id: string, body: Partial<ApiBanner>) {
    const updated = await updateBanner(id, body);
    setRows((r) => r.map((x) => (x.id === id ? updated : x)));
    return updated;
  }

  async function remove(id: string) {
    if (!confirm("Hide this banner? It can be brought back.")) return;
    await deleteBanner(id);
    setRows((r) => r.filter((x) => x.id !== id));
    setEditing(null);
    flash("Banner removed");
  }

  /** Swap sortOrder with the neighbour — two writes, no reindexing of the list. */
  async function move(id: string, dir: -1 | 1) {
    const i = shown.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= shown.length) return;
    const a = shown[i], b = shown[j];
    await Promise.all([
      patch(a.id, { sortOrder: b.sortOrder }),
      patch(b.id, { sortOrder: a.sortOrder }),
    ]);
  }

  return (
    <div className={embedded ? "w-full" : WRAP}>
      {!embedded && (
        <>
          <h1 className="font-display text-[22px] text-purple mb-1">Banners</h1>
        </>
      )}

      {err && (
        <div className="flex items-start gap-2 bg-[var(--s-bad)] border border-[var(--l-bad)] rounded-[11px] px-3.5 py-2.5 text-[12px] text-[var(--t-bad)] mb-4">
          <span className="mt-0.5 shrink-0"><Icon name="alert" size={14} /></span><span>{err}</span>
        </div>
      )}
      {ok && (
        <div className="bg-[var(--s-ok)] border border-[var(--l-ok)] rounded-[11px] px-3.5 py-2.5 text-[12px] text-[var(--t-ok)] mb-4">{ok}</div>
      )}

      <div className={"flex gap-2 mb-5 flex-wrap " + (only ? "hidden" : "")}>
        {PLACEMENTS.map((p) => (
          <button
            key={p.key}
            onClick={() => { setTab(p.key); setEditing(null); }}
            className={"px-4 py-2 rounded-full text-[13px] font-semibold border transition-all " +
              (tab === p.key
                ? "text-white border-transparent shadow-[0_3px_12px_rgba(80,40,100,0.2)]"
                : "bg-white text-body border-lavender-deep hover:border-orchid")}
            style={tab === p.key ? { background: "linear-gradient(135deg,var(--a-solid),var(--a-solid))" } : undefined}
          >
            {p.label}
          </button>
        ))}
      </div>

      {!embedded && <p className="text-[12.5px] text-body-soft mb-4">{PLACEMENTS.find((p) => p.key === tab)?.hint}</p>}

      {/* Rotation speed belongs to the slider, not to any one slide, so it sits
          above the list rather than inside an editor. */}
      {tab === "HERO" && (
        /* one setting, one line. It was a full-width bordered form for a
           single number between 2 and 30, which made it look like the most
           important control on the screen instead of the smallest. */
        <div className="flex items-center gap-2 mb-4 text-[12.5px] text-body-soft">
          <Icon name="clock" size={14} />
          <span>Each slide stays</span>
          <input
            type="number" min={2} max={30} value={rotate}
            onChange={(e) => setRotate(Number(e.target.value))}
            onBlur={async () => { const s = await setStorefrontSettings({ heroRotateSeconds: rotate }); setRotate(s.heroRotateSeconds); flash("Saved"); }}
            className="w-[58px] text-[13px] font-semibold text-purple text-center bg-white border border-lavender-deep rounded-[9px] py-[5px]"
          />
          <span>seconds</span>
        </div>
      )}

      {tab === "ANNOUNCEMENT" && (
        /* the same one-line shape as the slider's rotation: a setting that
           belongs to the line, not to any one announcement */
        <div className="flex items-center gap-2.5 mb-4 text-[12.5px] text-body-soft flex-wrap">
          <Icon name="megaphone" size={14} />
          <span>When no announcement is live</span>
          <div className="inline-flex p-[3px] rounded-full bg-lavender/70">
            {[
              { on: true, label: "Describe the delivery service", fill: "linear-gradient(135deg,var(--f-ok),var(--f-ok))" },
              { on: false, label: "Show nothing", fill: "linear-gradient(135deg,var(--f-warn),var(--f-warn))" },
            ].map((o) => (
              <button
                key={o.label}
                onClick={async () => {
                  if (annAuto === o.on) return;
                  const s = await setStorefrontSettings({ announcementAuto: o.on });
                  setAnnAuto(s.announcementAuto);
                  flash("Saved");
                }}
                className={"text-[11.5px] font-semibold px-3.5 py-[6px] rounded-full transition-all " +
                  (annAuto === o.on ? "text-white shadow-sm" : "text-body-soft hover:text-purple")}
                style={annAuto === o.on ? { background: o.fill } : undefined}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-[13px] text-body-soft">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-[13px] text-body-soft mb-4">Nothing here yet.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {shown.map((b, i) => (
            <div key={b.id} className={"relative rounded-[14px] p-3 pl-4 flex items-center gap-3.5 border transition-all " +
              (b.isActive
                ? "bg-white border-lavender-deep shadow-[0_1px_6px_rgba(80,40,100,0.05)]"
                : "bg-[var(--s-accent)] border-lavender-deep/50")}>
              {/* the same left edge the layout rows wear — colour when it is
                  showing, grey when it is not */}
              <span aria-hidden className="absolute left-0 top-3 bottom-3 w-[4px] rounded-full"
                style={{ background: b.isActive ? "linear-gradient(135deg,var(--a-solid),var(--a-solid))" : "var(--s-accent)" }} />

              <div className="w-[86px] h-[56px] rounded-[11px] bg-lavender shrink-0 overflow-hidden grid place-items-center">
                {b.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={b.imageUrl} alt="" className="w-full h-full object-cover" />
                  : <Icon name="photo" size={18} />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-medium text-purple truncate">
                  {b.titleMain || "Untitled"} <span className="text-orchid">{b.titleAccent}</span>
                </div>
                {/* the facts as chips, not a sentence of dot-separated fragments */}
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  <span className="text-[11px] font-semibold px-2 py-[3px] rounded-full bg-lavender/70 text-purple">
                    {ZONES.find((z) => z.value === (b.zone ?? ""))?.label}
                  </span>
                  {(b.liveFrom || b.liveTo) && (
                    <span className="text-[11px] px-2 py-[3px] rounded-full bg-lavender/70 text-body-soft">
                      {fmt(b.liveFrom)} → {fmt(b.liveTo)}
                    </span>
                  )}
                  {b.isActive && !isLiveNow(b) && (
                    <span className="text-[11px] font-semibold px-2 py-[3px] rounded-full bg-[var(--s-warn)] text-[var(--t-warn)]">
                      scheduled — not showing yet
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col shrink-0">
                <button onClick={() => move(b.id, -1)} disabled={i === 0} className="text-body-soft disabled:opacity-25 leading-none text-[11px]" aria-label="Move up">▲</button>
                <button onClick={() => move(b.id, 1)} disabled={i === shown.length - 1} className="text-body-soft disabled:opacity-25 leading-none text-[11px]" aria-label="Move down">▼</button>
              </div>

              {/* Live / Hidden, the same two-button control as the layout tab */}
              <div className="inline-flex p-[3px] rounded-full bg-lavender/70 shrink-0">
                {[
                  { on: true, label: "Live", fill: "linear-gradient(135deg,var(--f-ok),var(--f-ok))" },
                  { on: false, label: "Hidden", fill: "linear-gradient(135deg,var(--f-warn),var(--f-warn))" },
                ].map((o) => (
                  <button key={o.label}
                    onClick={() => b.isActive !== o.on && patch(b.id, { isActive: o.on })}
                    className={"text-[11.5px] font-semibold px-3 py-[5px] rounded-full transition-all " +
                      (b.isActive === o.on ? "text-white shadow-sm" : "text-body-soft hover:text-purple")}
                    style={b.isActive === o.on ? { background: o.fill } : undefined}>
                    {o.label}
                  </button>
                ))}
              </div>

              <button onClick={() => setEditing(b)} title="Edit this banner"
                className="w-[36px] h-[36px] rounded-[11px] grid place-items-center bg-lavender text-purple hover:bg-purple hover:text-white transition-colors shrink-0">
                <Icon name="edit" size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button onClick={addNew}
        className="text-white text-[13px] font-semibold px-4 py-2.5 rounded-[11px] inline-flex items-center gap-1.5 shadow-[0_3px_12px_rgba(80,40,100,0.22)] hover:opacity-95 transition-opacity"
        style={{ background: "linear-gradient(135deg,var(--a-solid),var(--a-solid))" }}>
        <Icon name="plus" size={15} /> Add a banner
      </button>

      {editing && (
        <Editor
          banner={editing}
          onClose={() => setEditing(null)}
          onSave={async (body) => { const u = await patch(editing.id, body); setEditing(u); flash("Saved"); }}
          onDelete={() => remove(editing.id)}
          onError={(m) => setErr(m)}
        />
      )}
    </div>
  );
}

function fmt(v: string | null) {
  return v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "…";
}

/** Mirrors the rule the public API applies, so the list can say "scheduled, not
 *  showing yet" instead of leaving the owner to wonder why nothing changed. */
function isLiveNow(b: ApiBanner) {
  const now = Date.now();
  if (b.liveFrom && new Date(b.liveFrom).getTime() > now) return false;
  if (b.liveTo && new Date(b.liveTo).getTime() < now) return false;
  return true;
}

function Editor({
  banner, onClose, onSave, onDelete, onError,
}: {
  banner: ApiBanner;
  onClose: () => void;
  onSave: (b: Partial<ApiBanner>) => Promise<void>;
  onDelete: () => void;
  onError: (m: string) => void;
}) {
  const [f, setF] = useState<ApiBanner>(banner);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  /*  Hero pictures lose their background on the way in (owner, 4 Sep 2026):
      the reference shows the flowers on the banner's own backdrop. A
      transparent PNG passes through unchanged; a plain photo is cut by the
      stack's bgremove service. Off = keep the photo as it is.  */
  const [cutBg, setCutBg] = useState(true);
  useEffect(() => setF(banner), [banner.id]);

  const set = <K extends keyof ApiBanner>(k: K, v: ApiBanner[K]) => setF((p) => ({ ...p, [k]: v }));
  const isAnn = f.placement === "ANNOUNCEMENT";
  const isHero = f.placement === "HERO";

  async function pickImage(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const removeBg = isHero && cutBg;
      const { url, bgRemoved } = await uploadImage(file, "banners", { removeBg });
      set("imageUrl", url);
      if (removeBg && bgRemoved === false) onError("The background could not be removed — the picture was kept as it is.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 grid place-items-center z-50 p-4" {...backdropClose(onClose)}>
      <div className="bg-white rounded-[16px] w-full max-w-[720px] max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-lavender-deep flex items-center justify-between sticky top-0 bg-white">
          <span className="font-display text-[16px] text-purple">Edit banner</span>
          <button onClick={onClose} className="text-body-soft text-[20px] leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {isAnn ? (
            <>
              {/* The announcement line is one sentence in two weights, so it
                  reuses titleMain/titleAccent rather than inventing new columns
                  that mean the same thing in a different place. */}
              <L label="Bold part">
                <input className="ipt" value={f.titleMain ?? ""} onChange={(e) => set("titleMain", e.target.value)} placeholder="⚡ 2-Hour Delivery" />
              </L>
              <L label="The rest of the line">
                <input className="ipt" value={f.titleAccent ?? ""} onChange={(e) => set("titleAccent", e.target.value)} placeholder="inside Dhaka · Same Day before 6 PM" />
              </L>
              <L label="Goes to" hint="optional">
                <input className="ipt" value={f.cta1Href ?? ""} onChange={(e) => set("cta1Href", e.target.value)} placeholder="/collections/eid" />
              </L>
            </>
          ) : (
            <>
              <L label="Small line above the headline"><input className="ipt" value={f.eyebrow ?? ""} onChange={(e) => set("eyebrow", e.target.value)} placeholder="Limited season" /></L>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <L label="Headline — plain part"><input className="ipt" value={f.titleMain ?? ""} onChange={(e) => set("titleMain", e.target.value)} placeholder="Send love to" /></L>
                <L label="Headline — coloured part"><input className="ipt" value={f.titleAccent ?? ""} onChange={(e) => set("titleAccent", e.target.value)} placeholder="all 64 districts" /></L>
              </div>
              <L label="Description"><textarea className="ipt" rows={2} value={f.lead ?? ""} onChange={(e) => set("lead", e.target.value)} /></L>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <L label="Button 1 — text"><input className="ipt" value={f.cta1Label ?? ""} onChange={(e) => set("cta1Label", e.target.value)} /></L>
                <L label="Button 1 — goes to"><input className="ipt" value={f.cta1Href ?? ""} onChange={(e) => set("cta1Href", e.target.value)} placeholder="/products" /></L>
                <L label="Button 2 — text"><input className="ipt" value={f.cta2Label ?? ""} onChange={(e) => set("cta2Label", e.target.value)} /></L>
                <L label="Button 2 — goes to"><input className="ipt" value={f.cta2Href ?? ""} onChange={(e) => set("cta2Href", e.target.value)} /></L>
              </div>

              {isHero && (
                <>
                  <L label="Three short trust lines" hint="comma separated">
                    {/*  CommaListInput, not a raw input — the raw one re-parsed
                        and rewrote the box on every keystroke, so a comma or a
                        space could never survive being typed (owner, 9 Aug 2026).  */}
                    {/*  key = this banner. The box keeps its own text now
                        (CommaListInput), so switching to another banner must
                        REMOUNT it — otherwise banner 2 would open showing
                        banner 1's words.  */}
                    <CommaListInput
                      key={f.id}
                      value={f.proof}
                      onChange={(next) => set("proof", next)}
                      placeholder="3 Hours Delivery · Inside Dhaka, Fresh & Premium · Hand-arranged today"
                    />
                  </L>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <FloatCard n={1} f={f} set={set} />
                    <FloatCard n={2} f={f} set={set} />
                  </div>
                </>
              )}

              {/* The placements want different shapes, and the box is drawn in
                  whichever one applies — the hero's picture fills the right
                  half of the banner from the bottom, the promo's runs across
                  the strip. Same reasoning as the category screen. */}
              <L
                label="Picture"
                hint={isHero ? undefined : "1600 × 600"}
              >
                {isHero && (
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[12.5px] font-medium text-body">Remove background</span>
                    {/* bold, coloured switch — house rule 16 */}
                    <span className="inline-flex rounded-full bg-lavender p-0.5">
                      {([true, false] as const).map((v) => (
                        <button
                          key={String(v)}
                          type="button"
                          onClick={() => setCutBg(v)}
                          className={"px-3 py-1 rounded-full text-[12px] font-semibold transition-all " + (cutBg === v ? "text-white shadow-sm" : "text-body-soft hover:text-purple")}
                          style={cutBg === v ? { background: v ? "linear-gradient(135deg,var(--a-solid),var(--a-solid))" : "var(--s-accent)" } : undefined}
                        >
                          {v ? "Auto" : "Keep"}
                        </button>
                      ))}
                    </span>
                  </div>
                )}
                <PictureDrop
                  url={f.imageUrl}
                  uploading={uploading}
                  busyText={isHero && cutBg ? "Cutting the background… (up to a minute)" : "Uploading…"}
                  shape={isHero ? "aspect-[994/1040] max-w-[230px]" : "aspect-[8/3] max-w-[420px]"}
                  onPick={pickImage}
                  onClear={() => set("imageUrl", null)}
                />
              </L>
            </>
          )}

          <div className="border-t border-lavender-deep pt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <L label="Show in">
              <select className="ipt" value={f.zone ?? ""} onChange={(e) => set("zone", e.target.value || null)}>
                {ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
            </L>
            <L label="From" hint="empty = now">
              <input type="date" className="ipt" value={dateVal(f.liveFrom)} onChange={(e) => set("liveFrom", e.target.value || null)} />
            </L>
            <L label="Until" hint="empty = never">
              <input type="date" className="ipt" value={dateVal(f.liveTo)} onChange={(e) => set("liveTo", e.target.value || null)} />
            </L>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={async () => { setSaving(true); try { await onSave(f); } finally { setSaving(false); } }}
              disabled={saving || uploading}
              className="bg-purple hover:bg-purple-deep disabled:opacity-60 text-white text-[13.5px] font-medium px-6 py-2.5 rounded-[11px] inline-flex items-center gap-1.5"
            >
              <Icon name="check" size={15} /> {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={onDelete} className="text-[13px] text-body-soft hover:text-[var(--t-bad)]">Remove this banner</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** <input type="date"> only accepts yyyy-mm-dd; the API returns full ISO. */
const dateVal = (v: string | null) => (v ? v.slice(0, 10) : "");

function PictureDrop({ url, uploading, shape, onPick, onClear, busyText = "Uploading…" }: {
  url: string | null; uploading: boolean; shape: string; onPick: (f: File | null) => void; onClear: () => void; busyText?: string;
}) {
  return (
    <>
      <label className={"relative block w-full rounded-[12px] border-2 border-dashed border-lavender-deep bg-lavender/40 hover:border-orchid cursor-pointer overflow-hidden grid place-items-center " + shape}>
        {url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={url} alt="" className={"absolute inset-0 w-full h-full object-cover " + (uploading ? "opacity-40" : "")} />
          : <span className="text-body-soft text-[11.5px] flex flex-col items-center gap-1"><Icon name="upload" size={20} /> Drag &amp; drop or click</span>}
        {uploading && <span className="absolute inset-x-0 bottom-0 bg-purple/85 text-white text-[11px] py-1 text-center">{busyText}</span>}
        <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      </label>
      {url && !uploading && <button onClick={onClear} className="text-[13px] text-body-soft hover:text-[var(--t-bad)] mt-1.5">Remove</button>}
    </>
  );
}

function FloatCard({ n, f, set }: { n: 1 | 2; f: ApiBanner; set: <K extends keyof ApiBanner>(k: K, v: ApiBanner[K]) => void }) {
  const ik = `float${n}Icon` as const, tk = `float${n}Title` as const, sk = `float${n}Sub` as const, vk = `float${n}Show` as const;
  const on = f[vk] !== false;
  return (
    <div className="border border-lavender-deep rounded-[12px] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-body">Floating card {n} {n === 1 ? "· top right" : "· bottom left"}</span>
        {/* bold, coloured switch — house rule 16 */}
        <span className="inline-flex rounded-full bg-lavender p-0.5">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => set(vk, v)}
              className={"px-3 py-1 rounded-full text-[12px] font-semibold transition-all " + (on === v ? "text-white shadow-sm" : "text-body-soft hover:text-purple")}
              style={on === v ? { background: v ? "linear-gradient(135deg,var(--a-solid),var(--a-solid))" : "var(--s-accent)" } : undefined}
            >
              {v ? "Shown" : "Hidden"}
            </button>
          ))}
        </span>
      </div>
      <select className="ipt" value={f[ik] ?? ""} onChange={(e) => set(ik, e.target.value || null)}>
        <option value="">No icon</option>
        {ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
      </select>
      <input className="ipt" value={f[tk] ?? ""} onChange={(e) => set(tk, e.target.value)} placeholder="Ordered 2:14 PM" />
      <input className="ipt" value={f[sk] ?? ""} onChange={(e) => set(sk, e.target.value)} placeholder="Delivered 3:58 PM · Gulshan" />
    </div>
  );
}

/** A <div>, not a <label> — a <label> wrapping the picture drop opens the file
 *  dialog when the caption or the size hint is clicked. See CollectionsView. */
function L({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="text-[12.5px] font-medium text-body block mb-1.5">
        {label}
        {hint && <span className="block text-[11px] text-body-soft font-normal mt-0.5">{hint}</span>}
      </span>
      {children}
    </div>
  );
}
