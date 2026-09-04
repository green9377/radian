"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { type SaveState } from "./SaveBar";
import SectionSettings from "./SectionSettings";
import {
  listPageSections, updatePageSection, reorderPageSections, updatePageSectionSettings,
  addPageBlock, editPageBlock, removePageBlock,
  listCollections, listBanners,
  type ApiPageSection, type BlockType, type ApiCollection, type ApiBanner,
} from "../_data/api";

/*
  Storefront · Homepage layout — which parts show, in what order, plus sections
  the owner adds himself.

  DRAG TO REORDER, arrows removed. The arrows worked and were unpleasant:
  moving a section from the bottom to the top meant eleven clicks, each with a
  round trip. The owner said so. Dragging is one gesture and one save.

  Built with the browser's own drag events rather than a library — the list is
  twelve rows of fixed height, which is the case HTML5 drag-and-drop handles
  well, and a dependency here would be carried by every admin page.

  ⚠️ Locked rows are not draggable AND the server refuses to move them. The
  hero carries the page's only <h1>; the bottom three sit in the design's fixed
  order with the footer.
*/

const ZONES = [
  { v: "", label: "Both zones" },
  { v: "DHAKA", label: "Dhaka only" },
  { v: "NATIONWIDE", label: "All Bangladesh only" },
];

const BLOCKS: { v: BlockType; label: string; hint: string }[] = [
  { v: "PRODUCT_ROW", label: "A row of products", hint: "Best sellers, new arrivals, 2-hour…" },
  { v: "COLLECTION_ROW", label: "Collection cards", hint: "Like the budget cards — pick which" },
  { v: "BANNER_STRIP", label: "A banner strip", hint: "One of your banners, full width" },
];

const PRODUCT_RULES = [
  { v: "bestseller", label: "Best sellers (earned badge only)" },
  { v: "new", label: "New arrivals" },
  { v: "express", label: "Express delivery" },
  { v: "midnight", label: "Midnight delivery" },
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
  Which icon a section wears. Cosmetic, but not decoration: eleven identical
  rows are read line by line, eleven distinct ones are recognised at a glance,
  and the owner opens this screen to find ONE of them.
*/
const SECTION_ICON: Record<string, string> = {
  hero: "photo", trust: "shield", categories: "grid", occasions: "tag",
  bestsellers: "star", promo: "bolt", delivery: "truck", budget: "cash",
  giftfinder: "sparkle", reviews: "heart", blog: "book", store: "pin",
};

/*
  A colour per section, from the brand family only — purple, orchid, rose gold,
  lavender-deep. Not a rainbow: eleven identical grey rows are read one at a
  time, eleven tinted ones are recognised, and every tone here is one the
  storefront already uses. A colour that is not in the brand would make the
  admin louder than the shop it manages.
*/
const SECTION_TINT: Record<string, string> = {
  hero: "linear-gradient(135deg,#7B2D8E,#C155D8)",
  trust: "linear-gradient(135deg,#5C2A96,#9B6BE0)",
  categories: "linear-gradient(135deg,#A32C9B,#DE68C9)",
  occasions: "linear-gradient(135deg,#8E2D6B,#D45BA0)",
  bestsellers: "linear-gradient(135deg,#B26A2F,#E0A25C)",
  promo: "linear-gradient(135deg,#B76E79,#E0A0A8)",
  delivery: "linear-gradient(135deg,#4A1259,#7B2D8E)",
  budget: "linear-gradient(135deg,#6E3AA8,#A87BE0)",
  giftfinder: "linear-gradient(135deg,#9B3FC4,#CE86E8)",
  reviews: "linear-gradient(135deg,#A83A6E,#DD84AC)",
  blog: "linear-gradient(135deg,#5B3E9E,#9986DD)",
  store: "linear-gradient(135deg,#7B2D8E,#B76E79)",
};
const tintOf = (key: string) => SECTION_TINT[key] ?? "linear-gradient(135deg,#7B2D8E,#C155D8)";

export default function PageLayoutView({ embedded, onEditSection }: { embedded?: boolean; onEditSection?: (key: string) => void } = {}) {
  const [rows, setRows] = useState<ApiPageSection[]>([]);
  const [collections, setCollections] = useState<ApiCollection[]>([]);
  const [banners, setBanners] = useState<ApiBanner[]>([]);
  /*
    ⚠️ ONE PAGE, ONE SCREEN — owner, 31 Jul 2026.

    "Go into the homepage and you can only change the layout; the section
    titles are somewhere else, the banners somewhere else again. Anyone would
    get lost."

    He is right, and it was the tidy answer rather than the useful one: things
    were filed by WHAT THEY ARE (banners with banners, wording with wording)
    instead of by WHERE THEY APPEAR. So the everyday work of a section — its
    wording, and the handful of items it shows — now happens inside the section
    itself.

    The dedicated screens stay. Making a new banner, with its dates, its two
    call-to-action buttons and its floating cards, is a real editor and does
    not belong inside a list row. Everyday work here, deep work there, and a
    link between them so nobody has to remember where "there" is.
  */
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const flash = (m: string) => { setOk(m); setSaveState("saved"); setTimeout(() => setOk(null), 2000); };
  const fail = (e: unknown, what: string) => { setErr(e instanceof Error ? e.message : what); setSaveState("error"); };

  useEffect(() => { void reload(); }, []);
  async function reload() {
    setLoading(true);
    try {
      const [s, c, b] = await Promise.all([listPageSections(), listCollections(), listBanners()]);
      setRows(s); setCollections(c); setBanners(b); setErr(null);
    } catch (e) { fail(e, "Could not load"); }
    finally { setLoading(false); }
  }

  async function patch(key: string, body: { isActive?: boolean; zone?: string | null }) {
    setSaveState("saving"); setErr(null);
    try {
      await updatePageSection({ key, ...body });
      setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...body } : r)));
      flash("Saved");
    } catch (e) { fail(e, "Could not save"); void reload(); }
  }

  async function patchBlock(key: string, body: { title?: string; subtitle?: string | null; config?: Record<string, unknown> }) {
    setSaveState("saving"); setErr(null);
    try {
      await editPageBlock(key, body);
      setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...body, config: body.config ?? r.config } : r)));
      flash("Saved");
    } catch (e) { fail(e, "Could not save"); void reload(); }
  }

  /*  A built-in section's own settings (4 Sep 2026) — the Best Sellers tabs
      and rule, how many articles… The API sanitises the partial and answers
      with the full settings in force, which is what the row then shows.  */
  async function saveSettings(key: string, partial: Record<string, unknown>) {
    setSaveState("saving"); setErr(null);
    try {
      const config = await updatePageSectionSettings(key, partial);
      setRows((rs) => rs.map((r) => (r.key === key ? { ...r, config } : r)));
      flash("Saved");
    } catch (e) { fail(e, "Could not save"); void reload(); }
  }

  async function removeBlock(key: string) {
    if (!confirm("Remove this section from the page?")) return;
    await removePageBlock(key);
    setRows((rs) => rs.filter((x) => x.key !== key));
    flash("Removed");
  }

  /** commit the order the list is currently showing */
  async function commitOrder(next: ApiPageSection[]) {
    setRows(next);
    setSaveState("saving"); setErr(null);
    try {
      setRows(await reorderPageSections(next.map((r) => r.key)));
      flash("Order saved");
    } catch (e) { fail(e, "Could not reorder"); void reload(); }
  }

  /** move the dragged row to where it was dropped, without disturbing the rest */
  function drop(targetKey: string) {
    if (!dragKey || dragKey === targetKey) return setDragKey(null);
    const from = rows.findIndex((r) => r.key === dragKey);
    const to = rows.findIndex((r) => r.key === targetKey);
    if (from < 0 || to < 0 || !rows[to].movable) return setDragKey(null);
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDragKey(null); setOverKey(null);
    void commitOrder(next);
  }

  return (
    <div className={embedded ? "w-full" : WRAP}>
      {!embedded && <h1 className="font-display text-[22px] text-purple mb-4">Homepage layout</h1>}

      {err && (
        <div className="flex items-start gap-2 bg-[#fdecea] border border-[#f5c6c2] rounded-[11px] px-3.5 py-2.5 text-[12px] text-[#a3261f] mb-3">
          <span className="mt-0.5 shrink-0"><Icon name="alert" size={14} /></span><span>{err}</span>
        </div>
      )}

      {/*
        ONE CARD, ONE HEADER — 31 Jul, third pass.

        Before this the screen stacked: a paragraph, a full-width green save
        bar, a second header with its own Add button, then white rows. Four
        bands of chrome before the first section. The owner's words: the text
        under the banner and the placement of the two buttons both looked wrong,
        and they were the same fault.

        Now the list is a single card whose header carries the title, the state
        and the one action. The save state is a chip inside that header rather
        than a strip across the page, because "Saved" is a reassurance, not an
        announcement.
      */}
      {/*
        A TINTED BODY WITH WHITE ROWS, not white on white — owner, 31 Jul:
        "the field is all white, make it a shade deeper".

        The rows are the objects; the card is the surface they sit on. When
        both were white the only thing separating eleven sections was a hairline,
        which is why the list read as a wall of paper.
      */}
      <div className="rounded-[18px] border border-lavender-deep overflow-hidden bg-[#f6f0fa] shadow-[0_2px_14px_rgba(80,40,100,0.06)]">
        <div
          className="px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: "linear-gradient(120deg,#f7f0fb 0%,#f4e9fa 55%,#fbf2f4 100%)" }}
        >
          <div className="min-w-0">
            <div className="font-display text-[16px] text-purple flex items-center gap-2.5">
              Sections
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white text-purple border border-lavender-deep">
                {rows.length}
              </span>
              {ok ? (
                <span className="text-[11.5px] font-semibold text-[#12693f] inline-flex items-center gap-1">
                  <Icon name="check" size={12} /> {ok}
                </span>
              ) : saveState === "saving" ? (
                <span className="text-[11.5px] text-body-soft">Saving…</span>
              ) : null}
            </div>
            <div className="text-[12px] text-body-soft">Drag to reorder · pencil opens the tab that edits it</div>
          </div>
        </div>

        {/*
          The column header, PINNED — owner's request, 31 Jul.

          Eleven rows is longer than a screen, and by row eight the two
          controls on the right are unlabelled boxes: nobody remembers which
          dropdown was the zone. It sticks to the top of the viewport while the
          card is in view, so the names stay with the columns they name.

          The widths below are shared with every row — change one, change both,
          or the header stops pointing at what it labels.
        */}
        <div
          className="sticky top-0 z-10 px-5 py-2.5 flex items-center gap-3.5 text-white text-[11px] font-semibold uppercase tracking-[0.12em]"
          style={{ background: "linear-gradient(120deg,#4a1259 0%,#7B2D8E 55%,#A73BBE 100%)" }}
        >
          <span className="w-[15px] shrink-0" />
          <span className="w-[40px] shrink-0" />
          <span className="flex-1 min-w-0">Section</span>
          <span className="w-[190px] shrink-0 hidden lg:block">Zone</span>
          <span className="w-[158px] shrink-0">Status</span>
          <span className="w-[86px] shrink-0 text-right">Edit</span>
        </div>

      {loading ? <p className="text-[13px] text-body-soft px-5 py-4">Loading…</p> : (
        <div className="divide-y divide-[#e5d8ef]">
          {rows.map((r, i) => {
            const isOver = overKey === r.key && dragKey !== r.key;
            return (
              <div
                key={r.key}
                draggable={r.movable}
                onDragStart={() => setDragKey(r.key)}
                onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                onDragOver={(e) => { if (r.movable) { e.preventDefault(); setOverKey(r.key); } }}
                onDrop={() => drop(r.key)}
                className={"relative transition-colors " +
                  (dragKey === r.key ? "opacity-40 " : "") +
                  (isOver ? "bg-orchid-soft " : "") +
                  (r.isActive ? "bg-white hover:bg-[#fdfaff]" : "bg-[#efe7f5] hover:bg-[#ece2f3]")}
              >
                {/* the section's colour, down the left edge — the row's identity
                    at a glance, and it greys out the moment it is hidden */}
                <span
                  aria-hidden
                  className="absolute left-0 top-0 bottom-0 w-[4px]"
                  style={{ background: r.isActive ? tintOf(r.key) : "#ddd3e6" }}
                />
                <div className="px-4 py-3 pl-5 flex items-center gap-3.5">
                  {/* the handle is the affordance — without it nobody discovers
                      that a row can be dragged at all */}
                  <span className={"w-[15px] text-[15px] leading-none select-none shrink-0 " + (r.movable ? "text-body-soft cursor-grab active:cursor-grabbing" : "text-transparent")}>⠿</span>

                  <span
                    className="w-[40px] h-[40px] rounded-[13px] grid place-items-center shrink-0 text-white transition-all"
                    style={{
                      background: r.isActive ? tintOf(r.key) : "#cfc4da",
                      boxShadow: r.isActive ? "0 3px 10px rgba(80,40,100,0.18)" : "none",
                    }}
                  >
                    <Icon name={r.blockType ? "layers" : (SECTION_ICON[r.key] ?? "grid")} size={18} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium text-purple flex items-center gap-2">
                      {r.label}
                      {!r.movable && <span title={r.lockedReason ?? ""}><Icon name="lock" size={12} /></span>}
                      {r.blockType && <span className="text-[10.5px] text-orchid bg-orchid-soft rounded-full px-2 py-0.5">added by you</span>}
                    </div>
                    <div className="text-[12px] text-body-soft truncate">
                      {r.movable ? r.hint : <span className="text-[#8a6414]">{r.lockedReason}</span>}
                    </div>
                  </div>

                  {/*
                    ⚠️ THE CAPS LABELS ARE GONE, on the owner's judgement.
                    "ZONE" and "STATUS" above every control turned eleven rows
                    into thirty-three lines of text, and neither word earns a
                    line: a dropdown that says "Both zones" has already said
                    what it is, and Live/Hidden explains itself.
                  */}
                  <div className="w-[190px] shrink-0 hidden lg:flex items-center gap-2.5">
                    <span className="text-body-soft" title="Which zone this section shows in">
                      <Icon name="globe" size={14} />
                    </span>
                    <select
                      className="text-[12.5px] text-purple bg-lavender/60 border border-transparent hover:border-lavender-deep rounded-[10px] px-2.5 py-[7px] cursor-pointer disabled:opacity-50 disabled:cursor-default transition-colors"
                      value={r.zone ?? ""}
                      disabled={!r.movable}
                      onChange={(e) => patch(r.key, { zone: e.target.value || null })}
                    >
                      {ZONES.map((z) => <option key={z.v} value={z.v}>{z.label}</option>)}
                    </select>
                  </div>

                  {/*
                    Two states side by side, the one in force filled in.
                    A single pill whose label was its CURRENT state and whose
                    press produced the OTHER one had to be read twice before
                    every click — the owner said so, and he was right.
                  */}
                  <div className="w-[158px] shrink-0">
                    {r.movable ? (
                      <div className="inline-flex p-[3px] rounded-full bg-lavender/70">
                        {[
                          { on: true, label: "Live", fill: "linear-gradient(135deg,#12795a,#3ec294)" },
                          { on: false, label: "Hidden", fill: "linear-gradient(135deg,#8a6414,#d9a441)" },
                        ].map((o) => (
                          <button
                            key={o.label}
                            onClick={() => r.isActive !== o.on && patch(r.key, { isActive: o.on })}
                            className={"text-[11.5px] font-semibold px-3.5 py-[6px] rounded-full transition-all " +
                              (r.isActive === o.on ? "text-white shadow-sm" : "text-body-soft hover:text-purple")}
                            style={r.isActive === o.on ? { background: o.fill } : undefined}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-3.5 py-[7px] rounded-full text-purple bg-lavender/70"
                        title={r.lockedReason ?? ""}
                      >
                        <Icon name="lock" size={12} /> Always on
                      </span>
                    )}
                  </div>

                  <div className="w-[86px] shrink-0 flex items-center justify-end gap-1.5">
                    {/*
                      The gear: what a built-in section decides for itself —
                      the Best Sellers tabs and rule, how many articles, the
                      gift finder's questions. Opens in the row, because there
                      is no other screen these belong to (4 Sep 2026).
                    */}
                    {r.hasSettings && (
                      <button
                        onClick={() => setOpen(open === r.key ? null : r.key)}
                        title="Settings of this section"
                        className={"w-[36px] h-[36px] rounded-[11px] grid place-items-center transition-colors " +
                          (open === r.key ? "bg-purple text-white" : "bg-lavender text-purple hover:bg-purple hover:text-white")}
                      >
                        <Icon name="gear" size={15} />
                      </button>
                    )}
                    {/*
                      The pencil goes where the work is: a banner section opens
                      the Banners tab, a trust strip the Trust tab. Before this
                      it opened a form inside the row, which is the arrangement
                      the owner rejected — the pencil now MOVES you rather than
                      unfolding on top of you.
                    */}
                    <button
                      onClick={() => (r.blockType ? setOpen(open === r.key ? null : r.key) : onEditSection?.(r.key))}
                      title="Edit this section"
                      className="w-[36px] h-[36px] rounded-[11px] grid place-items-center bg-lavender text-purple hover:bg-purple hover:text-white transition-colors"
                    >
                      <Icon name="edit" size={15} />
                    </button>

                  </div>
                </div>

                {open === r.key && !r.blockType && r.hasSettings && (
                  <div className="px-4 pb-4 pt-3 border-t border-lavender-deep">
                    <SectionSettings row={r} onSave={(partial) => saveSettings(r.key, partial)} />
                  </div>
                )}

                {open === r.key && r.blockType && (
                  <div className="px-4 pb-4 pt-1 border-t border-lavender-deep space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <F label="Heading"><input className="ipt" defaultValue={r.title ?? ""} placeholder="Fresh this week"
                        onBlur={(e) => e.target.value !== (r.title ?? "") && patchBlock(r.key, { title: e.target.value })} /></F>
                      <F label="Line underneath"><input className="ipt" defaultValue={r.subtitle ?? ""}
                        onBlur={(e) => e.target.value !== (r.subtitle ?? "") && patchBlock(r.key, { subtitle: e.target.value })} /></F>
                    </div>

                    {r.blockType === "PRODUCT_ROW" && (
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3">
                        <F label="Which products">
                          <select className="ipt" value={String(r.config.rule ?? "bestseller")}
                            onChange={(e) => patchBlock(r.key, { config: { ...r.config, rule: e.target.value } })}>
                            {PRODUCT_RULES.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
                          </select>
                        </F>
                        <F label="How many">
                          <input type="number" min={2} max={12} className="ipt" defaultValue={Number(r.config.count ?? 8)}
                            onBlur={(e) => patchBlock(r.key, { config: { ...r.config, count: Number(e.target.value) || 8 } })} />
                        </F>
                      </div>
                    )}

                    {r.blockType === "COLLECTION_ROW" && (
                      <F label="Which collections" hint="click to add or remove — the order you click is the order they show">
                        <div className="flex flex-wrap gap-1.5">
                          {collections.map((c) => {
                            const chosen = ((r.config.slugs as string[] | undefined) ?? []).includes(c.slug);
                            return (
                              <button key={c.id}
                                onClick={() => {
                                  const cur = ((r.config.slugs as string[] | undefined) ?? []);
                                  const next = chosen ? cur.filter((s) => s !== c.slug) : [...cur, c.slug];
                                  patchBlock(r.key, { config: { ...r.config, slugs: next } });
                                }}
                                className={"text-[12.5px] px-3 py-1.5 rounded-full border transition-colors " +
                                  (chosen ? "bg-purple text-white border-purple" : "bg-white text-body border-lavender-deep hover:border-orchid")}>
                                {c.name}
                              </button>
                            );
                          })}
                        </div>
                      </F>
                    )}

                    {r.blockType && (
                      <button onClick={() => removeBlock(r.key)} className="text-[12.5px] text-body-soft hover:text-[#c0392b] inline-flex items-center gap-1.5">
                        <Icon name="trash" size={13} /> Remove this section
                      </button>
                    )}

                    {r.blockType === "BANNER_STRIP" && (
                      <F label="Which banner" hint="only banners that are switched on and in season will show">
                        <select className="ipt" value={String(r.config.bannerId ?? "")}
                          onChange={(e) => patchBlock(r.key, { config: { ...r.config, bannerId: e.target.value || null } })}>
                          <option value="">— choose one —</option>
                          {banners.map((b) => (
                            <option key={b.id} value={b.id}>{b.titleMain || "Untitled"} {b.titleAccent ?? ""}</option>
                          ))}
                        </select>
                      </F>
                    )}

                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/*
        ⚠️ ADD SECTION LIVES AT THE FOOT OF THE LIST — owner, 31 Jul, after
        trying it in the header.

        Twice moved, so the reasoning is worth keeping: a new section is added
        at the END of the page, so the button that adds one belongs at the END
        of the list. In the header it sat above eleven rows it had nothing to
        do with, and the panel it opened had to appear somewhere else again.
        Button and consequence, in the same place, at the point the list runs out.
      */}
      <div className="border-t border-[#e5d8ef]">
        {adding ? (
          <div className="bg-lavender/30 p-4">
            <p className="text-[12.5px] text-body-soft mb-3">
              Pick a shape. It is added at the bottom, switched off — fill it in, then drag it where you want and switch it on.
            </p>
            <div className="flex flex-wrap gap-2">
              {BLOCKS.map((b) => (
                <button key={b.v}
                  onClick={async () => {
                    try { await addPageBlock(b.v); setAdding(false); await reload(); flash("Added at the bottom"); }
                    catch (e) { fail(e, "Could not add"); }
                  }}
                  className="text-left border border-lavender-deep rounded-[12px] px-4 py-3 hover:border-orchid transition-colors w-[220px]">
                  <div className="text-[13.5px] font-medium text-purple">{b.label}</div>
                  <div className="text-[12px] text-body-soft">{b.hint}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setAdding(false)} className="text-[12.5px] text-body-soft hover:text-purple mt-3">Cancel</button>
          </div>
        ) : (
          <div className="px-5 py-4">
            <button onClick={() => setAdding(true)}
              className="text-white text-[13px] font-semibold px-4 py-2.5 rounded-[11px] inline-flex items-center gap-1.5 shadow-[0_3px_12px_rgba(80,40,100,0.22)] hover:opacity-95 transition-opacity"
              style={{ background: "linear-gradient(135deg,#7B2D8E,#C155D8)" }}>
              <Icon name="plus" size={15} /> Add section
            </button>
          </div>
        )}
      </div>
      </div>


      {/*
        The tally, at the bottom where a tally belongs. Three numbers, all
        counted from the list above — nothing stored, nothing that can disagree
        with what is on screen.
      */}
      {!loading && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-[640px]">
          {[
            { n: rows.length, l: "sections on this page", icon: "layers", grad: "linear-gradient(135deg,#4A1259,#7B2D8E)" },
            { n: rows.filter((r) => r.isActive).length, l: "showing to customers", icon: "eye", grad: "linear-gradient(135deg,#7B2D8E,#C155D8)" },
            { n: rows.filter((r) => !r.isActive).length, l: "hidden for now", icon: "moon", grad: "linear-gradient(135deg,#B76E79,#E0A0A8)" },
          ].map((x) => (
            <div key={x.l} className="rounded-[16px] px-4 py-3.5 text-white flex items-center gap-3.5" style={{ background: x.grad }}>
              <span className="w-[38px] h-[38px] rounded-[12px] grid place-items-center bg-white/20 shrink-0">
                <Icon name={x.icon} size={17} />
              </span>
              <div className="min-w-0">
                <div className="font-display text-[22px] leading-none">{x.n}</div>
                <div className="text-[11.5px] opacity-90 mt-1 truncate">{x.l}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Said plainly so the shapes are not mistaken for a limitation nobody
          decided on. It is the same boundary as the banner template. */}
      <p className="text-[12px] text-body-soft mt-4 max-w-[64ch]">
        Sections come in ready-made shapes rather than a blank canvas, so an added section always matches the rest of the site. Need a shape that is not here — say what it should look like and it gets built.
      </p>
    </div>
  );
}

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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
