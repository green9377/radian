"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import SaveBar, { type SaveState } from "./SaveBar";
import ShopIconPreview, { ICON_NAMES, hasClearBackground } from "./ShopIconPreview";
import {
  listTrustBadges, createTrustBadge, updateTrustBadge, deleteTrustBadge, uploadImage,
  type ApiTrustBadge,
} from "../_data/api";

/*
  Storefront · Trust strip — the row of promises under the hero.

  Owner's correction, 30 Jul 2026: the homepage audit filed these as "fixed
  text, no admin needed" and he overruled it. He was right. "2-Hour Delivery"
  and "Freshness Promise" are the shop's largest claims, and "bKash, Nagad and
  cards" stops being true the day a payment method changes.

  Everything is edited in place — there is no modal. A badge is three short
  fields; opening a dialog to change two words is friction with no payoff, and
  the whole point of this row is that it can be corrected in seconds.
*/

const ZONES = [
  { value: "", label: "Every zone" },
  { value: "DHAKA", label: "Dhaka only" },
  { value: "NATIONWIDE", label: "All Bangladesh only" },
];

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
export default function TrustStripView({ embedded }: { embedded?: boolean } = {}) {
  const [rows, setRows] = useState<ApiTrustBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  /* one honest place for "is my change in" — see SaveBar */
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [picking, setPicking] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  /** "" = every zone at once, for finding a badge whose zone you have forgotten */
  const [previewZone, setPreviewZone] = useState("DHAKA");

  /*
    The zone tabs filter BOTH halves of the screen.

    They first only dimmed the rows that did not apply, and the owner was right
    that it reads as broken — a greyed row still asks to be read, and five of
    them is a wall to scan past to reach the two that matter. Showing one zone
    at a time makes the screen answer one question: what does a visitor HERE
    see.

    A badge with no zone is true everywhere, so it appears under every tab. That
    is not a duplicate — it is the same row, editable from either place.
  */
  /*
    ONE TAB, ONE LIST, NO OVERLAP — owner's instruction, twice.

    A zone-less badge is true everywhere, so the first two attempts showed it
    under both zone tabs (once dimmed, once under a heading). Both read as a
    duplicate. It now lives under its own tab and appears in exactly one place,
    which is what a list is for.

    The zone-less option itself is kept — deleting it would mean writing "Secure
    Payment" twice and finding, a year later, that one of them still says a
    payment method the shop dropped.

    The PREVIEW still shows the real, combined result, because that is the one
    thing on this screen that is not a list: it is what a visitor sees.
  */
  const visible =
    previewZone === "GLOBAL"
      ? rows.filter((r) => r.zone === null)
      : rows.filter((r) => r.zone === previewZone);

  /** exactly what the public API returns for this zone */
  const preview =
    previewZone === "GLOBAL"
      ? visible.filter((r) => r.isActive)
      : rows.filter((r) => r.isActive && (r.zone === null || r.zone === previewZone));

  const sharedInPreview = previewZone !== "GLOBAL" ? preview.filter((r) => r.zone === null).length : 0;

  const flash = (m: string) => { setOk(m); setSaveState("saved"); setTimeout(() => setOk(null), 2000); };

  useEffect(() => { void reload(); }, []);
  async function reload() {
    setLoading(true);
    try { setRows(await listTrustBadges()); setErr(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not load"); }
    finally { setLoading(false); }
  }

  /*
    Saved on blur, not on a Save button.

    Deliberate for this screen only: a badge is a couple of words, and a row of
    six with one Save button each is six things to forget. Anything larger — the
    banner editor, a product — keeps its explicit save, because there the cost of
    a half-finished record reaching the site is real.
  */
  async function patch(id: string, body: Partial<ApiTrustBadge>) {
    try {
      setSaveState("saving");
      const updated = await updateTrustBadge(id, body);
      setRows((r) => r.map((x) => (x.id === id ? updated : x)));
      flash("Saved");
      return updated;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save"); setSaveState("error");
      void reload(); // the screen must not keep showing a value the server rejected
    }
  }

  async function add() {
    try {
      const created = await createTrustBadge({
        title: "New promise", subtitle: "", icon: "star",
        // Born into the tab that is open. Created zone-less while the Dhaka tab
        // is showing, it would appear under every tab and quietly claim to be
        // true nationwide — and created with the wrong zone it would vanish the
        // moment it was saved.
        zone: previewZone === "GLOBAL" ? null : previewZone,
        sortOrder: rows.length, isActive: false,
      });
      setRows((r) => [...r, created]);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not create"); }
  }

  async function remove(id: string) {
    if (!confirm("Remove this promise from the website?")) return;
    await deleteTrustBadge(id);
    setRows((r) => r.filter((x) => x.id !== id));
    flash("Removed");
  }

  /**
   * Reorder by rewriting the whole list as 0…n-1, not by swapping two values.
   *
   * The seed gave each zone its own 0,1,2 — sensible per zone, but this is one
   * global list ordered by that number, so several rows shared a position and
   * swapping two identical values moved nothing. The arrows looked broken and
   * were not: the data was ambiguous. Renumbering everything makes the
   * positions unique, so the next press cannot be ambiguous either.
   *
   * Only rows whose number actually changes are written.
   */
  /**
   * Reorder by rewriting the whole list as 0…n-1, not by swapping two values.
   *
   * The seed gave each zone its own 0,1,2 — sensible per zone, but this is one
   * global list ordered by that number, so several rows shared a position and
   * swapping two identical values moved nothing. The arrows looked broken and
   * were not: the data was ambiguous. Renumbering makes every position unique,
   * so the next press cannot be ambiguous either.
   *
   * ⚠️ Swaps neighbours **as displayed**, then renumbers the FULL list. While a
   * zone tab is on, the row above on screen may not be the row above in the
   * data, and swapping by the underlying index would move something the owner
   * cannot see.
   */
  async function move(id: string, dir: -1 | 1) {
    const vi = visible.findIndex((r) => r.id === id);
    const vj = vi + dir;
    if (vi < 0 || vj < 0 || vj >= visible.length) return;

    const order = rows.map((r) => r.id);
    const a = order.indexOf(visible[vi].id);
    const b = order.indexOf(visible[vj].id);
    [order[a], order[b]] = [order[b], order[a]];

    const next = order.map((rid) => rows.find((r) => r.id === rid)!);
    setRows(next.map((r, k) => ({ ...r, sortOrder: k })));

    await Promise.all(
      next
        .map((r, k) => ({ r, k }))
        .filter(({ r, k }) => r.sortOrder !== k)
        .map(({ r, k }) => updateTrustBadge(r.id, { sortOrder: k })),
    );
    flash("Order saved");
  }

  async function pickFile(id: string, file: File | null) {
    if (!file) return;
    setUploadingId(id);
    try {
      const { url } = await uploadImage(file, "icons");
      await patch(id, { iconUrl: url });
      setPicking(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploadingId(null); }
  }

  return (
    <div className={embedded ? "w-full" : WRAP}>
      {!embedded && (
        <>
          <h1 className="font-display text-[22px] text-purple mb-1">Trust strip</h1>
          <p className="text-[13px] text-body-soft mb-5">
            The row of promises under the banner.
          </p>
        </>
      )}

      {!embedded && <SaveBar state={saveState} onSave={() => flash("Saved")} />}

      {err && (
        <div className="flex items-start gap-2 bg-[var(--s-bad)] border border-[var(--l-bad)] rounded-[11px] px-3.5 py-2.5 text-[12px] text-[var(--t-bad)] mb-4">
          <span className="mt-0.5 shrink-0"><Icon name="alert" size={14} /></span><span>{err}</span>
        </div>
      )}
      {ok && <div className="bg-[var(--s-ok)] border border-[var(--l-ok)] rounded-[11px] px-3.5 py-2 text-[12px] text-[var(--t-ok)] mb-4">{ok}</div>}

      {/* A preview, because this screen edits six fragments of one row and the
          only question that matters — does the row look right — cannot be
          answered by looking at the fragments. Switching zone here re-renders
          it exactly as a visitor in that zone would see it. */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-medium text-body-soft uppercase tracking-[0.12em]">
            {previewZone === "GLOBAL" ? "Shown in every zone" : "How it looks in this zone"}
          </span>
          <div className="flex gap-1">
            {[
              { v: "DHAKA", label: "Dhaka" },
              { v: "NATIONWIDE", label: "All Bangladesh" },
              { v: "GLOBAL", label: "Every zone" },
            ].map((z) => (
              <button
                key={z.v}
                onClick={() => setPreviewZone(z.v)}
                className={"text-[12px] px-3.5 py-1.5 rounded-full border transition-colors " +
                  (previewZone === z.v ? "bg-purple text-white border-purple" : "bg-white text-body border-lavender-deep hover:border-orchid")}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-white border border-lavender-deep rounded-[14px] px-5 py-4 overflow-x-auto">
          {preview.length === 0 ? (
            <span className="text-[12.5px] text-body-soft">Nothing is switched on for this zone.</span>
          ) : (
            /*  ⚠️ THE SHOP'S OWN TILE, NOT AN APPROXIMATION — 9 Sep 2026.

                This drew a 30px symbol on white. The shop draws a 24px symbol
                inside a 46px lavender rounded tile, in purple. So an uploaded
                photograph looked passable here and like a smudge on the live
                homepage, and the owner had no way to see it until it was up.
                Every number below is copied from `TrustStrip.tsx`.  */
            <div className="flex gap-7 min-w-max">
              {preview.map((b) => (
                <div key={b.id} className="flex items-center gap-3.5">
                  <span className="w-[46px] h-[46px] rounded-[14px] bg-lavender text-purple grid place-items-center shrink-0">
                    <ShopIconPreview name={b.icon} url={b.iconUrl} size={24} />
                  </span>
                  <div>
                    <div className="text-[15px] text-ink font-semibold leading-snug whitespace-nowrap">{b.title}</div>
                    <div className="text-[12.5px] text-body-soft whitespace-nowrap">{b.subtitle}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {previewZone !== "GLOBAL" && (
          <p className="text-[12px] text-body-soft mt-2">
            {sharedInPreview > 0 && (
              <>
                {sharedInPreview} of these {sharedInPreview === 1 ? "comes" : "come"} from the{" "}
                <button onClick={() => setPreviewZone("GLOBAL")} className="text-purple font-medium underline underline-offset-2">
                  Every zone
                </button>{" "}
                tab.{" "}
              </>
            )}
            {preview.length > 4 && (
              <span className="text-[var(--t-warn)]">
                {preview.length} showing — four fits best.
              </span>
            )}
          </p>
        )}
      </div>

      {loading ? <p className="text-[13px] text-body-soft">Loading…</p> : (
        <div className="space-y-2.5 mb-4">
          {visible.length === 0 && (
            <p className="text-[13px] text-body-soft pb-1">Nothing here yet.</p>
          )}

          {visible.map((b, i) => (
            <div
              key={b.id}
              className={"border rounded-[14px] transition-all " +
                (b.isActive
                  ? "border-lavender-deep bg-white shadow-[0_1px_6px_rgba(80,40,100,0.05)]"
                  : "border-lavender-deep/50 bg-[var(--s-accent)]")}
            >
              {/* Explicit grid columns rather than flex-with-min-width. The
                  first attempt let two inputs, a select and five buttons
                  negotiate their own widths inside one flex row, and they
                  collapsed into each other. */}
              <div className="grid items-center gap-x-3 gap-y-2 p-3.5"
                   style={{ gridTemplateColumns: "52px minmax(0,1fr) 168px auto" }}>

                <button
                  onClick={() => setPicking(picking === b.id ? null : b.id)}
                  className={"row-span-2 w-[52px] h-[52px] rounded-[12px] grid place-items-center transition-colors border " +
                    (picking === b.id
                      ? "bg-orchid-soft text-orchid border-orchid"
                      : "bg-lavender text-orchid border-transparent hover:border-orchid")}
                  title="Change the icon"
                >
                  {uploadingId === b.id
                    ? <span className="text-[10px] text-body-soft">…</span>
                    : <ShopIconPreview name={b.icon} url={b.iconUrl} size={24} />}
                </button>

                <input
                  className="ipt font-medium" defaultValue={b.title} placeholder="2-Hour Delivery"
                  onBlur={(e) => e.target.value !== b.title && patch(b.id, { title: e.target.value })}
                />

                <select
                  className="ipt row-span-2 self-center" value={b.zone ?? ""}
                  onChange={(e) => patch(b.id, { zone: e.target.value || null })}
                >
                  {ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
                </select>

                <div className="row-span-2 flex items-center gap-1 pl-1">
                  <div className="flex flex-col mr-1">
                    <button onClick={() => move(b.id, -1)} disabled={i === 0} className="text-body-soft disabled:opacity-25 hover:text-purple text-[10px] leading-none py-0.5" aria-label="Move up">▲</button>
                    <button onClick={() => move(b.id, 1)} disabled={i === visible.length - 1} className="text-body-soft disabled:opacity-25 hover:text-purple text-[10px] leading-none py-0.5" aria-label="Move down">▼</button>
                  </div>
                  <button
                    onClick={() => patch(b.id, { isActive: !b.isActive })}
                    className={"relative rounded-full shrink-0 transition-colors " + (b.isActive ? "bg-orchid" : "bg-lavender-deep")}
                    style={{ width: 38, height: 22 }}
                    title={b.isActive ? "Showing on the site" : "Hidden"}
                  >
                    <span className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all" style={{ width: 16, height: 16, left: b.isActive ? 19 : 3 }} />
                  </button>
                  <button onClick={() => remove(b.id)} className="text-body-soft hover:text-[var(--t-bad)] p-1.5" aria-label="Remove"><Icon name="trash" size={15} /></button>
                </div>

                <input
                  className="ipt" defaultValue={b.subtitle ?? ""} placeholder="Anywhere inside Dhaka"
                  onBlur={(e) => e.target.value !== (b.subtitle ?? "") && patch(b.id, { subtitle: e.target.value })}
                />
              </div>

              {picking === b.id && (
                <div className="px-3.5 pb-3.5 pt-1">
                  <div className="rounded-[12px] bg-lavender/40 border border-lavender-deep p-3.5">
                    {/* The size sits at the TOP, before anything is chosen.
                        Printed under the upload button it was read after the
                        file had already been picked, which is too late to be
                        of any use. */}
                    {/*  ⚠️ THE SIZE WAS NEVER THE PROBLEM — 9 Sep 2026.

                        The owner uploaded at exactly the size printed here and
                        the row still looked wrong, because the shop draws his
                        file and a built-in at the SAME 24px: what differs is
                        the file. A photograph has its own background and its
                        own colours, and no size fixes that. So this line now
                        says the thing that actually decides the result.  */}
                    <div className="flex items-start gap-2 bg-white border border-lavender-deep rounded-[9px] px-3 py-2 mb-3">
                      <span className="text-orchid shrink-0 mt-0.5"><Icon name="upload" size={14} /></span>
                      <span className="text-[12px] text-body leading-relaxed">
                        <b className="text-purple font-semibold">Square, edge to edge, on a
                        see-through background</b> — SVG or PNG, max 50 KB.
                      </span>
                    </div>
                    <div className="text-[12px] text-body-soft mb-2.5">
                      Pick a symbol
                    </div>
                    <div className="grid gap-1.5 mb-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(38px, 1fr))" }}>
                      {ICON_NAMES.map((n) => (
                        <button
                          key={n}
                          onClick={() => { patch(b.id, { icon: n }); setPicking(null); }}
                          className={"aspect-square rounded-[10px] grid place-items-center border transition-colors " +
                            (b.icon === n
                              ? "border-orchid text-orchid bg-white"
                              : "border-transparent bg-white text-body hover:border-orchid hover:text-orchid")}
                          title={n}
                        >
                          <ShopIconPreview name={n} size={19} />
                        </button>
                      ))}
                    </div>
                    <div className="flex items-baseline gap-3 flex-wrap border-t border-lavender-deep pt-3">
                      <label className="inline-flex items-center gap-1.5 text-[12.5px] text-purple font-medium cursor-pointer hover:text-purple-deep">
                        <Icon name="upload" size={14} /> Upload your own
                        <input type="file" accept="image/svg+xml,image/png,image/webp" className="hidden"
                          onChange={(e) => pickFile(b.id, e.target.files?.[0] ?? null)} />
                      </label>
                      {b.iconUrl && (
                        <button
                          onClick={() => patch(b.id, { iconUrl: null })}
                          className="text-[12px] text-body-soft hover:text-[var(--t-bad)] font-medium"
                        >
                          Remove the upload
                        </button>
                      )}
                    </div>

                    {/*  The verdict, in plain words, the moment it is known —
                        not after it is live on the homepage. The name of the
                        stored file carries what the uploader found in the
                        pixels (`media.ts`). It WARNS; it never changes the
                        picture (owner, 9 Sep 2026).  */}
                    {b.iconUrl && !hasClearBackground(b.iconUrl) && (
                      <p className="mt-2.5 text-[12px] text-[var(--t-warn)] bg-[var(--s-warn)] border border-[var(--l-warn)] rounded-[9px] px-3 py-2">
                        <b>This file has no see-through background.</b>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button onClick={add} className="bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] inline-flex items-center gap-1.5">
        <Icon name="plus" size={15} /> Add a promise
      </button>
    </div>
  );
}
