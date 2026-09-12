"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import SaveBar, { type SaveState } from "./SaveBar";
import {
  listCollections, createCollection, updateCollection, deleteCollection, uploadImage,
  type ApiCollection, type CollectionMode,
} from "../_data/api";

/*
  Storefront · Collections — the "Gifts for Every Budget" cards, and any other
  named shelf the shop wants ("Valentine's", "Corporate").

  TWO KINDS, ONE SCREEN. A shopper sees no difference; only how membership is
  decided differs. Owner's decision, 30 Jul:

    By price  — anything inside the window belongs, automatically. Chosen for
                the budget cards so a new product is never missing from
                "Under ৳1,000" because somebody forgot to tag it.
    By hand   — "Premium" is not a price window. No rule decides what is
                luxurious.

  ⚠️ The window compares the price the CUSTOMER PAYS, after discount. Said on
  the screen, not just here — it is the kind of rule that looks obvious until a
  discount ends and a product leaves a shelf on its own.

  Picking products for a hand-made collection is not on this screen yet: it
  belongs with the collection PAGE, which is the next page of the audit.
*/

const ZONES = [
  { v: "", label: "Every zone" },
  { v: "DHAKA", label: "Dhaka only" },
  { v: "NATIONWIDE", label: "All Bangladesh only" },
];

/** paisa ↔ taka at the edge of the screen, so nothing inside deals in both */
const toTaka = (p: number | null) => (p === null || p === undefined ? "" : String(Math.round(p / 100)));
const toPaisa = (t: string) => (t.trim() === "" ? null : Math.round(Number(t) * 100));

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
export default function CollectionsView({ embedded }: { embedded?: boolean } = {}) {
  const [rows, setRows] = useState<ApiCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  /* one honest place for "is my change in" — see SaveBar */
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [open, setOpen] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const flash = (m: string) => { setOk(m); setSaveState("saved"); setTimeout(() => setOk(null), 2000); };

  useEffect(() => { void reload(); }, []);
  async function reload() {
    setLoading(true);
    try { setRows(await listCollections()); setErr(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not load"); }
    finally { setLoading(false); }
  }

  async function patch(id: string, body: Partial<ApiCollection>) {
    try {
      setSaveState("saving");
      const updated = await updateCollection(id, body);
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...updated } : r)));
      flash("Saved");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save"); setSaveState("error");
      void reload();
    }
  }

  async function add() {
    try {
      const created = await createCollection({
        name: "New collection", mode: "MANUAL",
        sortOrder: rows.length, isActive: false, isFeatured: false,
      });
      setRows((r) => [...r, created]);
      setOpen(created.id);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not create"); }
  }

  async function remove(id: string) {
    if (!confirm("Remove this collection? Its card stops showing on the website.")) return;
    await deleteCollection(id);
    setRows((r) => r.filter((x) => x.id !== id));
    flash("Removed");
  }

  async function move(id: string, dir: -1 | 1) {
    const i = rows.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next.map((r, k) => ({ ...r, sortOrder: k })));
    await Promise.all(
      next.map((r, k) => ({ r, k })).filter(({ r, k }) => r.sortOrder !== k)
        .map(({ r, k }) => updateCollection(r.id, { sortOrder: k })),
    );
    flash("Order saved");
  }

  async function pickImage(id: string, file: File | null) {
    if (!file) return;
    setUploadingId(id);
    try {
      const { url } = await uploadImage(file, "collections");
      await patch(id, { imageUrl: url });
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploadingId(null); }
  }

  return (
    <div className={embedded ? "w-full" : WRAP}>
      {!embedded && (
        <>
          <h1 className="font-display text-[22px] text-purple m-0 mb-5">Collections</h1>
        </>
      )}

      {!embedded && <SaveBar state={saveState} onSave={() => flash("Saved")} />}

      {err && (
        <div className="flex items-start gap-2 bg-[var(--s-bad)] border border-[var(--l-bad)] rounded-[11px] px-3.5 py-2.5 text-[12px] text-[var(--t-bad)] mb-4">
          <span className="mt-0.5 shrink-0"><Icon name="alert" size={14} /></span><span>{err}</span>
        </div>
      )}
      {ok && <div className="bg-[var(--s-ok)] border border-[var(--l-ok)] rounded-[11px] px-3.5 py-2 text-[12px] text-[var(--t-ok)] mb-4">{ok}</div>}

      {loading ? <p className="text-[13px] text-body-soft">Loading…</p> : (
        <div className="space-y-1.5 mb-4">
          {rows.map((c, i) => {
            const expanded = open === c.id;
            return (
              <div key={c.id} className={"border rounded-[14px] overflow-hidden " + (c.isActive ? "border-lavender-deep bg-white" : "border-lavender-deep/50 bg-lavender/25")}>
                <div className="flex items-center gap-2 pr-3">
                  <button onClick={() => setOpen(expanded ? null : c.id)} className="flex items-center gap-3 px-4 py-3.5 text-left flex-1 min-w-0 hover:bg-lavender/30 transition-colors">
                    <span className={"text-body-soft text-[11px] transition-transform shrink-0 " + (expanded ? "rotate-90" : "")}>▶</span>
                    <span className="w-9 h-9 rounded-[9px] bg-lavender shrink-0 overflow-hidden grid place-items-center">
                      {c.imageUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={c.imageUrl} alt="" className="w-full h-full object-cover" />
                        : <span className="text-[9px] text-body-soft">art</span>}
                    </span>
                    <span className="text-[14px] font-medium text-purple truncate">{c.name}</span>
                    <span className="text-[12px] text-body-soft truncate">
                      {c.mode === "PRICE_RANGE" ? priceLabel(c) : `${c._count?.products ?? 0} chosen by hand`}
                    </span>
                    {c.isFeatured && <span className="text-[11px] text-orchid bg-orchid-soft rounded-full px-2.5 py-0.5 shrink-0">on the homepage</span>}
                  </button>
                  <div className="flex flex-col shrink-0">
                    <button onClick={() => move(c.id, -1)} disabled={i === 0} className="text-body-soft disabled:opacity-25 hover:text-purple text-[10px] leading-none py-0.5">▲</button>
                    <button onClick={() => move(c.id, 1)} disabled={i === rows.length - 1} className="text-body-soft disabled:opacity-25 hover:text-purple text-[10px] leading-none py-0.5">▼</button>
                  </div>
                  <button
                    onClick={() => patch(c.id, { isActive: !c.isActive })}
                    className={"relative rounded-full shrink-0 " + (c.isActive ? "bg-orchid" : "bg-lavender-deep")}
                    style={{ width: 38, height: 22 }} title={c.isActive ? "Showing" : "Hidden"}
                  >
                    <span className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all" style={{ width: 16, height: 16, left: c.isActive ? 19 : 3 }} />
                  </button>
                </div>

                {expanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-lavender-deep space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <L label="Small line above"><input className="ipt" defaultValue={c.kicker ?? ""} placeholder="Sweet & simple" onBlur={(e) => e.target.value !== (c.kicker ?? "") && patch(c.id, { kicker: e.target.value })} /></L>
                      <L label="Name"><input className="ipt" defaultValue={c.name} placeholder="Under ৳1,000" onBlur={(e) => e.target.value !== c.name && patch(c.id, { name: e.target.value })} /></L>
                      <L label="Line underneath"><input className="ipt" defaultValue={c.subtitle ?? ""} placeholder="Little gestures, big smiles" onBlur={(e) => e.target.value !== (c.subtitle ?? "") && patch(c.id, { subtitle: e.target.value })} /></L>
                    </div>

                    <L label="Which products go in">
                      <div className="flex gap-2 flex-wrap">
                        {(["PRICE_RANGE", "MANUAL"] as CollectionMode[]).map((m) => (
                          <button
                            key={m}
                            onClick={() => patch(c.id, { mode: m })}
                            className={"text-[12.5px] px-3.5 py-2 rounded-[10px] border transition-colors " +
                              (c.mode === m ? "bg-purple text-white border-purple" : "bg-white text-body border-lavender-deep hover:border-orchid")}
                          >
                            {m === "PRICE_RANGE" ? "By price — automatic" : "By hand — I choose"}
                          </button>
                        ))}
                      </div>
                    </L>

                    {c.mode === "PRICE_RANGE" && (
                      <div>
                        <div className="grid grid-cols-2 gap-3 max-w-[400px]">
                          <L label="From ৳"><input type="number" className="ipt" defaultValue={toTaka(c.minPaisa)} placeholder="any" onBlur={(e) => patch(c.id, { minPaisa: toPaisa(e.target.value) })} /></L>
                          <L label="Up to ৳"><input type="number" className="ipt" defaultValue={toTaka(c.maxPaisa)} placeholder="any" onBlur={(e) => patch(c.id, { maxPaisa: toPaisa(e.target.value) })} /></L>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <L label="Card picture" hint="800 × 900 · keep the lower third clear">
                        <label className="relative block w-full aspect-[1/1.14] max-w-[150px] rounded-[12px] border-2 border-dashed border-lavender-deep bg-lavender/40 hover:border-orchid cursor-pointer overflow-hidden grid place-items-center">
                          {c.imageUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={c.imageUrl} alt="" className={"absolute inset-0 w-full h-full object-cover " + (uploadingId === c.id ? "opacity-40" : "")} />
                            : <span className="text-body-soft text-[11.5px] flex flex-col items-center gap-1"><Icon name="upload" size={18} /> Drag &amp; drop</span>}
                          {uploadingId === c.id && <span className="absolute inset-x-0 bottom-0 bg-purple/85 text-white text-[11px] py-1 text-center">Uploading…</span>}
                          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(e) => pickImage(c.id, e.target.files?.[0] ?? null)} />
                        </label>
                        {c.imageUrl && <button onClick={() => patch(c.id, { imageUrl: null })} className="text-[12.5px] text-body-soft hover:text-[var(--t-bad)] mt-1.5">Remove</button>}
                      </L>

                      <div className="space-y-3">
                        <L label="Show in">
                          <select className="ipt" value={c.zone ?? ""} onChange={(e) => patch(c.id, { zone: e.target.value || null })}>
                            {ZONES.map((z) => <option key={z.v} value={z.v}>{z.label}</option>)}
                          </select>
                        </L>
                        <Toggle label="Put this card on the homepage" on={c.isFeatured} onClick={() => patch(c.id, { isFeatured: !c.isFeatured })} />
                        <Toggle label="Rose-gold treatment (the top tier)" on={c.accent} onClick={() => patch(c.id, { accent: !c.accent })} />
                        <div className="text-[11.5px] text-body-soft">
                          Web address: <code className="text-purple">/collections/{c.slug}</code>
                        </div>
                        <button onClick={() => remove(c.id)} className="text-[13px] text-body-soft hover:text-[var(--t-bad)]">Remove this collection</button>
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
        <Icon name="plus" size={15} /> Add a collection
      </button>
    </div>
  );
}

function priceLabel(c: ApiCollection) {
  const lo = c.minPaisa !== null ? `৳${Math.round(c.minPaisa / 100).toLocaleString()}` : null;
  const hi = c.maxPaisa !== null ? `৳${Math.round(c.maxPaisa / 100).toLocaleString()}` : null;
  if (lo && hi) return `${lo} – ${hi}`;
  if (hi) return `up to ${hi}`;
  if (lo) return `${lo} and up`;
  return "any price";
}

/*
  A <div>, not a <label>.

  It was a <label>, and that is a real bug when the field it wraps is a file
  drop: clicking a <label> activates the first form control inside it, so
  clicking the words "Card picture" — or the size hint under them — opened the
  file dialog. The owner found it immediately.

  The cost is losing click-the-caption-to-focus on ordinary text fields. Worth
  it: that is a convenience, this was a surprise.
*/
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
