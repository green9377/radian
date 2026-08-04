"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import SaveBar, { type SaveState } from "./SaveBar";
import RichText from "./RichText";
import {
  listJournalPosts, createJournalPost, updateJournalPost, deleteJournalPost, uploadImage,
  type ApiJournalPost,
} from "../_data/api";

/*
  Storefront · Journal — the articles behind "Latest Articles".

  The table and the service have existed since the Marketing pass; there was no
  controller, no module and no screen, so nothing was reachable. This is the
  screen.

  ⚠️ A post is created UNPUBLISHED and the homepage shows nothing until one is
  published. The three sample articles on the site ("10 Anniversary Flowers by
  Year") were written by whoever built the page — they are not the shop's, and
  they are deliberately not seeded here. An empty journal hides the section
  rather than advertising reading that does not exist.
*/

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

export default function JournalView() {
  const [rows, setRows] = useState<ApiJournalPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [open, setOpen] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const flash = (m: string) => { setOk(m); setSaveState("saved"); setTimeout(() => setOk(null), 2000); };
  const fail = (e: unknown, what: string) => { setErr(e instanceof Error ? e.message : what); setSaveState("error"); };

  useEffect(() => { void reload(); }, []);
  async function reload() {
    setLoading(true);
    try { setRows(await listJournalPosts()); setErr(null); }
    catch (e) { fail(e, "Could not load"); }
    finally { setLoading(false); }
  }

  async function patch(id: string, body: Parameters<typeof updateJournalPost>[1]) {
    setSaveState("saving");
    try {
      const u = await updateJournalPost(id, body);
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...u } : r)));
      flash("Saved");
    } catch (e) { fail(e, "Could not save"); }
  }

  async function add() {
    try {
      const p = await createJournalPost({ title: "New article", isPublished: false });
      setRows((rs) => [p, ...rs]);
      setOpen(p.id);
    } catch (e) { fail(e, "Could not create"); }
  }

  const live = rows.filter((r) => r.isPublished).length;

  return (
    <div className={WRAP}>
      <h1 className="font-display text-[22px] text-purple mb-1">Journal</h1>
      <p className="text-[13px] text-body-soft mb-5">
        The articles behind &ldquo;Latest Articles&rdquo; on the homepage, and the /journal page.
      </p>

      <SaveBar state={saveState} onSave={() => flash("Saved")} />

      {err && (
        <div className="flex items-start gap-2 bg-[#fdecea] border border-[#f5c6c2] rounded-[11px] px-3.5 py-2.5 text-[12px] text-[#a3261f] mb-4">
          <span className="mt-0.5 shrink-0"><Icon name="alert" size={14} /></span><span>{err}</span>
        </div>
      )}
      {ok && <div className="bg-[#eef7f0] border border-[#cfe8d6] rounded-[11px] px-3.5 py-2 text-[12px] text-[#12693f] mb-4">{ok}</div>}

      {/* The homepage shows three. Saying so here saves the question of why the
          fourth one is not appearing. */}
      <div className={"text-[12px] rounded-[10px] px-3.5 py-2 mb-4 " +
        (live === 0 ? "bg-[#fff8e6] text-[#8a6414]" : "bg-[#eef7f0] text-[#12693f]")}>
        {live === 0
          ? "Nothing published yet — the Latest Articles section is hidden on the website."
          : `${live} published. The homepage shows the newest three; /journal shows them all.`}
      </div>

      {loading ? <p className="text-[13px] text-body-soft">Loading…</p> : (
        <div className="space-y-1.5 mb-4">
          {rows.map((r) => {
            const expanded = open === r.id;
            return (
              <div key={r.id} className={"border rounded-[14px] overflow-hidden " +
                (r.isPublished ? "border-lavender-deep bg-white" : "border-lavender-deep/50 bg-lavender/25")}>
                <div className="flex items-center gap-2 pr-3">
                  <button onClick={() => setOpen(expanded ? null : r.id)} className="flex items-center gap-3 px-4 py-3 text-left flex-1 min-w-0 hover:bg-lavender/30 transition-colors">
                    <span className={"text-body-soft text-[11px] transition-transform shrink-0 " + (expanded ? "rotate-90" : "")}>▶</span>
                    <span className="w-11 h-8 rounded-[7px] bg-lavender shrink-0 overflow-hidden grid place-items-center">
                      {r.coverUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={r.coverUrl} alt="" className="w-full h-full object-cover" />
                        : <span className="text-[9px] text-body-soft">cover</span>}
                    </span>
                    <span className="text-[14px] font-medium text-purple truncate">{r.title}</span>
                    <span className="text-[11.5px] text-body-soft shrink-0">
                      {r.words ? `${r.words} words` : "empty"}
                      {r.readMinutes ? ` · ${r.readMinutes} min` : ""}
                    </span>
                  </button>
                  <button
                    onClick={() => patch(r.id, { isPublished: !r.isPublished })}
                    className={"relative rounded-full shrink-0 " + (r.isPublished ? "bg-orchid" : "bg-lavender-deep")}
                    style={{ width: 38, height: 22 }} title={r.isPublished ? "Live on the website" : "Draft"}
                  >
                    <span className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all" style={{ width: 16, height: 16, left: r.isPublished ? 19 : 3 }} />
                  </button>
                </div>

                {expanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-lavender-deep space-y-3">
                    <L label="Title">
                      <input className="ipt" defaultValue={r.title}
                        onBlur={(e) => e.target.value !== r.title && patch(r.id, { title: e.target.value })} />
                    </L>
                    <L label="The line on the card" hint="one sentence — it is what makes someone click">
                      <input className="ipt" defaultValue={r.excerpt ?? ""}
                        onBlur={(e) => e.target.value !== (r.excerpt ?? "") && patch(r.id, { excerpt: e.target.value })} />
                    </L>

                    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
                      <L label="Cover picture" hint="800 × 480 · wide">
                        <label className="relative block w-full aspect-[5/3] rounded-[10px] border-2 border-dashed border-lavender-deep bg-lavender/40 hover:border-orchid cursor-pointer overflow-hidden grid place-items-center">
                          {r.coverUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={r.coverUrl} alt="" className={"absolute inset-0 w-full h-full object-cover " + (uploadingId === r.id ? "opacity-40" : "")} />
                            : <span className="text-body-soft text-[11px]">{uploadingId === r.id ? "Uploading…" : "add a cover"}</span>}
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0]; if (!file) return;
                              setUploadingId(r.id);
                              try { const { url } = await uploadImage(file, "brand"); await patch(r.id, { coverUrl: url }); }
                              catch (er) { fail(er, "Upload failed"); }
                              finally { setUploadingId(null); }
                            }} />
                        </label>
                      </L>
                      <div className="space-y-3">
                        <L label="Written by"><input className="ipt" defaultValue={r.author ?? ""} placeholder="Radian"
                          onBlur={(e) => e.target.value !== (r.author ?? "") && patch(r.id, { author: e.target.value })} /></L>
                        <L label="Web address" hint="changing this breaks any link already shared">
                          <input className="ipt" defaultValue={r.slug}
                            onBlur={(e) => e.target.value !== r.slug && patch(r.id, { slug: e.target.value })} />
                        </L>
                      </div>
                    </div>

                    <L label="The article" hint="headings, bold, lists, links and pictures — saves when you click away">
                      <RichText
                        value={r.bodyHtml ?? ""}
                        onChange={(html) => { if (html !== (r.bodyHtml ?? "")) void patch(r.id, { bodyHtml: html }); }}
                      />
                    </L>

                    <button onClick={async () => {
                      if (!confirm("Remove this article?")) return;
                      await deleteJournalPost(r.id);
                      setRows((rs) => rs.filter((x) => x.id !== r.id));
                      flash("Removed");
                    }} className="text-[13px] text-body-soft hover:text-[#c0392b]">Remove this article</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button onClick={add} className="bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] inline-flex items-center gap-1.5">
        <Icon name="plus" size={15} /> Write an article
      </button>
    </div>
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
