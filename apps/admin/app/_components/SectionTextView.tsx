"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import SaveBar, { type SaveState } from "./SaveBar";
import {
  listSectionText, saveSectionText, clearSectionOverride, type ApiSectionText,
} from "../_data/api";

/*
  Storefront · Section headings.

  Owner's request, 30 Jul 2026, after annotating five screenshots with the same
  arrow pointing at the same three lines. Every section of the storefront has a
  small coloured line, a big title and a sentence under it, and none of them
  were his.

  ONE SCREEN FOR ALL OF THEM. The alternative — three fields tucked into each
  section's own editor — means hunting through nine screens to change a tone of
  voice, and no way to see whether the page reads consistently.

  The zone override is deliberately out of the way. Most headings are the same
  everywhere; showing two sets of boxes for every section by default would
  double the screen to serve the exception.
*/

const ZONES = [
  { v: "DHAKA", label: "Dhaka" },
  { v: "NATIONWIDE", label: "All Bangladesh" },
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
  `embedded` — rendered as a tab inside a page's own screen (31 Jul 2026).
  `only` narrows the list to that page's keys, so the Homepage tab shows the
  homepage's wording and nothing else. Same component, same rows; the page
  furniture and the other pages' groups are simply not drawn.
*/
export default function SectionTextView({ embedded, only }: { embedded?: boolean; only?: string } = {}) {
  const [rows, setRows] = useState<ApiSectionText[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  /* one honest place for "is my change in" — see SaveBar */
  const [saveState, setSaveState] = useState<SaveState>("saved");
  /** one section open at a time — an accordion, not a set of independent toggles */
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [openOverride, setOpenOverride] = useState<string | null>(null);

  const flash = (m: string) => { setOk(m); setSaveState("saved"); setTimeout(() => setOk(null), 2000); };

  useEffect(() => { void reload(); }, []);
  async function reload() {
    setLoading(true);
    try { setRows(await listSectionText()); setErr(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not load"); }
    finally { setLoading(false); }
  }

  /** the default row for each key — the one every zone falls back to */
  const defaults = useMemo(() => rows.filter((r) => r.zone === ""), [rows]);
  const overrideOf = (key: string, zone: string) => rows.find((r) => r.key === key && r.zone === zone);

  const groups = useMemo(() => {
    const m = new Map<string, ApiSectionText[]>();
    for (const r of defaults) {
      if (only && !r.key.startsWith(`${only}.`)) continue;
      if (!m.has(r.page)) m.set(r.page, []);
      m.get(r.page)!.push(r);
    }
    return [...m.entries()];
  }, [defaults, only]);

  async function save(key: string, zone: string, field: "eyebrow" | "title" | "subtitle", value: string) {
    try {
      setSaveState("saving");
      const updated = await saveSectionText(key, zone, { [field]: value });
      setRows((rs) => {
        const i = rs.findIndex((r) => r.key === key && r.zone === zone);
        const merged = { ...(rs[i] ?? { key, page: "", label: "", zone }), ...updated } as ApiSectionText;
        return i >= 0 ? rs.map((r, k) => (k === i ? merged : r)) : [...rs, merged];
      });
      flash("Saved");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save"); setSaveState("error");
      void reload();
    }
  }

  async function dropOverride(key: string, zone: string) {
    if (!confirm(`Remove the ${zone === "DHAKA" ? "Dhaka" : "All Bangladesh"} wording? That zone goes back to the default.`)) return;
    await clearSectionOverride(key, zone);
    setRows((rs) => rs.filter((r) => !(r.key === key && r.zone === zone)));
    flash("Back to the default");
  }

  return (
    <div className={embedded ? "w-full" : WRAP}>
      {!embedded && (
        <h1 className="font-display text-[22px] text-purple mb-5">Section headings</h1>
      )}

      {!embedded && <SaveBar state={saveState} onSave={() => flash("Saved")} />}

      {err && (
        <div className="flex items-start gap-2 bg-[var(--s-bad)] border border-[var(--l-bad)] rounded-[11px] px-3.5 py-2.5 text-[12px] text-[var(--t-bad)] mb-4">
          <span className="mt-0.5 shrink-0"><Icon name="alert" size={14} /></span><span>{err}</span>
        </div>
      )}
      {ok && <div className="bg-[var(--s-ok)] border border-[var(--l-ok)] rounded-[11px] px-3.5 py-2 text-[12px] text-[var(--t-ok)] mb-4">{ok}</div>}

      {loading ? <p className="text-[13px] text-body-soft">Loading…</p> : groups.map(([page, items]) => (
        <div key={page} className="mb-7">
          <p className="text-[11.5px] font-medium text-body-soft uppercase tracking-[0.12em] mb-2.5">{page}</p>

          <div className="space-y-1.5">
            {items.map((r) => {
              const overrides = ZONES.map((z) => overrideOf(r.key, z.v)).filter(Boolean) as ApiSectionText[];
              const open = openOverride === r.key;
              const expanded = openRow === r.key;
              return (
                <div key={r.key} className="border border-lavender-deep rounded-[14px] bg-white overflow-hidden">
                  {/*
                    Collapsed by default — the owner's call, and correct: this
                    screen will hold every section of every page, and thirty
                    sections × three boxes open at once is a page nobody scrolls
                    to the bottom of.

                    The row shows the TITLE, not the key, because that is what
                    the owner is scanning for. Clicking the header while a box
                    has focus fires its blur first, so collapsing saves.
                  */}
                  <button
                    onClick={() => setOpenRow(expanded ? null : r.key)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-lavender/30 transition-colors"
                  >
                    <span className={"text-body-soft text-[11px] transition-transform shrink-0 " + (expanded ? "rotate-90" : "")}>▶</span>
                    <span className="text-[14px] font-medium text-purple shrink-0">{r.label}</span>
                    <span className="text-[12.5px] text-body-soft truncate flex-1 min-w-0">
                      {r.title || <span className="italic">no title</span>}
                    </span>
                    {overrides.length > 0 && (
                      <span className="text-[11px] text-orchid bg-orchid-soft rounded-full px-2.5 py-0.5 shrink-0">
                        {overrides.length} zone wording{overrides.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </button>

                  {expanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-lavender-deep">
                  <Fields row={r} zone="" onSave={(f, v) => save(r.key, "", f, v)} />

                  <button
                    onClick={() => setOpenOverride(open ? null : r.key)}
                    className="text-[12.5px] text-body-soft hover:text-purple mt-3 inline-flex items-center gap-1.5"
                  >
                    <span className="text-[13px] leading-none">{open ? "−" : "+"}</span>
                    Different wording per zone
                  </button>

                  {open && (
                    <div className="mt-3 pt-3 border-t border-lavender-deep space-y-4">
                      {/* Spelled out because "leave it empty" reads as "it will
                          be blank on the site" — it means the opposite here. */}
                      <p className="text-[12px] text-body-soft">A zone left empty uses the wording above.</p>
                      {ZONES.map((z) => {
                        const ov = overrideOf(r.key, z.v);
                        return (
                          <div key={z.v}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[12px] font-medium text-body">{z.label}</span>
                              {ov && (
                                <button onClick={() => dropOverride(r.key, z.v)} className="text-[11.5px] text-body-soft hover:text-[var(--t-bad)]">
                                  Use the default instead
                                </button>
                              )}
                            </div>
                            <Fields
                              row={ov ?? { ...r, zone: z.v, eyebrow: null, title: null, subtitle: null }}
                              zone={z.v}
                              placeholderFrom={r}
                              onSave={(f, v) => save(r.key, z.v, f, v)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * `defaultValue` + save on blur, not a controlled value.
 *
 * Controlled inputs would re-render the whole list on every keystroke, and the
 * caret jumps to the end of the box whenever a save resolves mid-typing.
 * `key` includes the zone so switching rows still resets the boxes.
 */
function Fields({
  row, zone, placeholderFrom, onSave,
}: {
  row: ApiSectionText;
  zone: string;
  /** in an override, the default's words are the placeholder — so it is obvious
   *  what the zone will say if the box is left alone */
  placeholderFrom?: ApiSectionText;
  onSave: (field: "eyebrow" | "title" | "subtitle", value: string) => void;
}) {
  const ph = placeholderFrom;
  const blur = (f: "eyebrow" | "title" | "subtitle", el: HTMLInputElement | HTMLTextAreaElement) => {
    if (el.value !== (row[f] ?? "")) onSave(f, el.value);
  };
  return (
    <div className="space-y-2">
      <input
        key={`${row.key}-${zone}-e`} className="ipt text-[12.5px]"
        defaultValue={row.eyebrow ?? ""}
        placeholder={ph?.eyebrow ?? "Small line above the title"}
        onBlur={(e) => blur("eyebrow", e.target)}
      />
      <input
        key={`${row.key}-${zone}-t`} className="ipt"
        defaultValue={row.title ?? ""}
        placeholder={ph?.title ?? "The big title"}
        onBlur={(e) => blur("title", e.target)}
      />
      <textarea
        key={`${row.key}-${zone}-s`} className="ipt" rows={2}
        defaultValue={row.subtitle ?? ""}
        placeholder={ph?.subtitle ?? "One line underneath (optional)"}
        onBlur={(e) => blur("subtitle", e.target)}
      />
    </div>
  );
}
