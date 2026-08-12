"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import SaveBar, { type SaveState } from "./SaveBar";
import { ModuleCard, ModuleHeader, StatTiles } from "./ModuleShell";
import {
  listLinkGroups, createLinkGroup, updateLinkGroup, deleteLinkGroup,
  createNavLink, updateNavLink, deleteNavLink,
  listSocialLinks, createSocialLink, updateSocialLink, deleteSocialLink,
  listPaymentBadges, createPaymentBadge, updatePaymentBadge, deletePaymentBadge,
  getFooterSettings, saveFooterSettings, uploadImage,
  type ApiLinkGroup, type ApiSocialLink, type ApiPaymentBadge, type LinkPlacement,
} from "../_data/api";

/*
  Storefront · Footer & menus.

  ONE SCREEN FOR THREE THINGS that all live at the bottom of every page: the
  link columns, the social profiles, and the "We accept" row. The "More" panel
  behind the ☰ shares the same link table — several of its entries are the same
  pages, and keeping two lists means correcting an address in one and leaving
  the other pointing at a page that no longer exists.
*/

const SOCIAL_ICONS = ["facebook", "instagram", "whatsapp", "messenger", "tiktok", "youtube", "globe"];

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

export default function FooterView() {
  const [groups, setGroups] = useState<ApiLinkGroup[]>([]);
  const [socials, setSocials] = useState<ApiSocialLink[]>([]);
  const [badges, setBadges] = useState<ApiPaymentBadge[]>([]);
  const [tagline, setTagline] = useState("");
  const [legal, setLegal] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [tab, setTab] = useState<LinkPlacement>("FOOTER");
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const flash = (m: string) => { setOk(m); setSaveState("saved"); setTimeout(() => setOk(null), 2000); };
  const fail = (e: unknown, what: string) => {
    setErr(e instanceof Error ? e.message : what); setSaveState("error");
  };

  useEffect(() => { void reload(); }, []);
  async function reload() {
    setLoading(true);
    try {
      const [g, s, b, st] = await Promise.all([listLinkGroups(), listSocialLinks(), listPaymentBadges(), getFooterSettings()]);
      setGroups(g); setSocials(s); setBadges(b);
      setTagline(st.footerTagline ?? ""); setLegal(st.footerLegal ?? "");
      setErr(null);
    } catch (e) { fail(e, "Could not load"); }
    finally { setLoading(false); }
  }

  const shown = groups.filter((g) => g.placement === tab);

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
          tone="rosegold"
          icon="layers"
          title="Footer & menus"
          blurb="The bottom of every page, and the slide-out menu behind the ☰ — saves as you click away"
        />
        <StatTiles tone="rosegold" stats={[
          { label: "Footer columns", value: groups.filter((g) => g.placement === "FOOTER").length },
          { label: "Menu groups", value: groups.filter((g) => g.placement === "MORE").length },
          { label: "Links in all", value: groups.reduce((n, g) => n + g.links.length, 0) },
          { label: "Social profiles", value: socials.filter((x) => x.url).length },
        ]} />
        <div className="px-5 pt-4 pb-5">

      {loading ? <p className="text-[13px] text-body-soft">Loading…</p> : (
        <>
          {/* ---- link columns ---- */}
          <div className="flex gap-2 mb-4">
            {([
              { v: "FOOTER" as const, label: "Footer columns" },
              { v: "MORE" as const, label: "The ☰ menu" },
            ]).map((t) => (
              <button key={t.v} onClick={() => setTab(t.v)}
                className={"text-[12.5px] px-3.5 py-1.5 rounded-full border transition-colors " +
                  (tab === t.v ? "bg-purple text-white border-purple" : "bg-white text-body border-lavender-deep hover:border-orchid")}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="space-y-3 mb-8">
            {shown.map((g, gi) => (
              <div key={g.id} className="border border-lavender-deep rounded-[14px] bg-white p-4">
                <div className="flex items-center gap-2 mb-3">
                  <input
                    className="ipt font-medium max-w-[280px]" defaultValue={g.title} placeholder="Shop"
                    onBlur={async (e) => {
                      if (e.target.value === g.title) return;
                      setSaveState("saving");
                      try { const u = await updateLinkGroup(g.id, { title: e.target.value }); setGroups((gs) => gs.map((x) => x.id === g.id ? { ...x, ...u, links: x.links } : x)); flash("Saved"); }
                      catch (er) { fail(er, "Could not save"); }
                    }}
                  />
                  <div className="flex flex-col">
                    <button disabled={gi === 0} onClick={() => moveGroup(g.id, -1)} className="text-body-soft disabled:opacity-25 hover:text-purple text-[10px] leading-none py-0.5">▲</button>
                    <button disabled={gi === shown.length - 1} onClick={() => moveGroup(g.id, 1)} className="text-body-soft disabled:opacity-25 hover:text-purple text-[10px] leading-none py-0.5">▼</button>
                  </div>
                  <div className="flex-1" />
                  <button onClick={() => removeGroup(g.id)} className="text-[12.5px] text-body-soft hover:text-[#c0392b]">Remove column</button>
                </div>

                <div className="space-y-1.5">
                  {g.links.map((l, li) => (
                    <div key={l.id} className="grid gap-2 items-center" style={{ gridTemplateColumns: "1fr 1fr auto" }}>
                      <input className="ipt text-[13px]" defaultValue={l.label} placeholder="Fresh Flowers"
                        onBlur={(e) => e.target.value !== l.label && patchLink(l.id, g.id, { label: e.target.value })} />
                      <input className="ipt text-[13px]" defaultValue={l.href} placeholder="/categories/fresh-flowers"
                        onBlur={(e) => e.target.value !== l.href && patchLink(l.id, g.id, { href: e.target.value })} />
                      <div className="flex items-center gap-1">
                        <div className="flex flex-col">
                          <button disabled={li === 0} onClick={() => moveLink(g.id, l.id, -1)} className="text-body-soft disabled:opacity-25 hover:text-purple text-[10px] leading-none py-0.5">▲</button>
                          <button disabled={li === g.links.length - 1} onClick={() => moveLink(g.id, l.id, 1)} className="text-body-soft disabled:opacity-25 hover:text-purple text-[10px] leading-none py-0.5">▼</button>
                        </div>
                        <button onClick={() => removeLink(l.id, g.id)} className="text-body-soft hover:text-[#c0392b] p-1"><Icon name="trash" size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={() => addLink(g.id)} className="text-[12.5px] text-purple font-medium mt-2.5 inline-flex items-center gap-1.5">
                  <Icon name="plus" size={13} /> Add a link
                </button>
              </div>
            ))}

            <button onClick={() => addGroup(tab)} className="bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] inline-flex items-center gap-1.5">
              <Icon name="plus" size={15} /> Add a column
            </button>
          </div>

          {/* ---- social ---- */}
          <h2 className="font-display text-[17px] text-purple mb-1">Social profiles</h2>
          {/* Said out loud because the seeded rows are blank on purpose. */}
          <p className="text-[13px] text-body-soft mb-3">
            An icon with no address is <b>not shown at all</b> — a social button that goes nowhere reads as a broken site.
          </p>
          <div className="space-y-1.5 mb-3">
            {socials.map((so, i) => (
              <div key={so.id} className="border border-lavender-deep rounded-[12px] bg-white px-3 py-2.5 grid gap-2 items-center" style={{ gridTemplateColumns: "150px 160px 1fr auto" }}>
                <select className="ipt text-[13px]" value={so.icon} onChange={(e) => patchSocial(so.id, { icon: e.target.value })}>
                  {SOCIAL_ICONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <input className="ipt text-[13px]" defaultValue={so.label} placeholder="Facebook"
                  onBlur={(e) => e.target.value !== so.label && patchSocial(so.id, { label: e.target.value })} />
                <input className="ipt text-[13px]" defaultValue={so.url} placeholder="https://facebook.com/radianbd"
                  onBlur={(e) => e.target.value !== so.url && patchSocial(so.id, { url: e.target.value })} />
                <div className="flex items-center gap-1">
                  <div className="flex flex-col">
                    <button disabled={i === 0} onClick={() => moveSocial(so.id, -1)} className="text-body-soft disabled:opacity-25 hover:text-purple text-[10px] leading-none py-0.5">▲</button>
                    <button disabled={i === socials.length - 1} onClick={() => moveSocial(so.id, 1)} className="text-body-soft disabled:opacity-25 hover:text-purple text-[10px] leading-none py-0.5">▼</button>
                  </div>
                  <button onClick={async () => { await deleteSocialLink(so.id); setSocials((s) => s.filter((x) => x.id !== so.id)); flash("Removed"); }}
                    className="text-body-soft hover:text-[#c0392b] p-1"><Icon name="trash" size={14} /></button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={async () => { const s = await createSocialLink({ sortOrder: socials.length }); setSocials((x) => [...x, s]); }}
            className="text-[12.5px] text-purple font-medium mb-8 inline-flex items-center gap-1.5">
            <Icon name="plus" size={13} /> Add a profile
          </button>

          {/* ---- payment badges ---- */}
          <h2 className="font-display text-[17px] text-purple mb-1">&ldquo;We accept&rdquo; badges</h2>
          <p className="text-[13px] text-body-soft mb-1">
            Upload the brand logo, or leave it empty for the plain pill you have now.
          </p>
          {/* The warning is repeated on screen because the failure lands at the
              very end of the funnel, where it costs the most. */}
          <p className="text-[12px] text-[#8a6414] bg-[#fff8e6] border border-[#f5e2b8] rounded-[10px] px-3.5 py-2.5 mb-3">
            Only show a method you can actually take. A customer who sees the badge, fills a cart, and finds it missing at checkout is a lost order.
            <br />Logos: <b>height 48 · transparent background · max 50 KB</b>. The footer is dark purple, so ask for the &ldquo;on dark&rdquo; version of each logo.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {badges.map((b, i) => (
              <div key={b.id} className="border border-lavender-deep rounded-[12px] bg-white p-2.5 w-[176px]">
                <label className="relative block w-full h-[46px] rounded-[9px] border-2 border-dashed border-lavender-deep bg-lavender/40 hover:border-orchid cursor-pointer overflow-hidden grid place-items-center mb-2">
                  {b.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={b.imageUrl} alt="" className={"max-h-[34px] w-auto object-contain " + (uploadingId === b.id ? "opacity-40" : "")} />
                    : <span className="text-body-soft text-[11px]">{uploadingId === b.id ? "Uploading…" : "logo"}</span>}
                  <input type="file" accept="image/svg+xml,image/png,image/webp" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      setUploadingId(b.id);
                      try { const { url } = await uploadImage(file, "brand"); await patchBadge(b.id, { imageUrl: url }); }
                      catch (er) { fail(er, "Upload failed"); }
                      finally { setUploadingId(null); }
                    }} />
                </label>
                <input className="ipt text-[12.5px]" defaultValue={b.label} placeholder="bKash"
                  onBlur={(e) => e.target.value !== b.label && patchBadge(b.id, { label: e.target.value })} />
                <div className="flex items-center justify-between mt-1.5">
                  <div className="flex gap-1">
                    <button disabled={i === 0} onClick={() => moveBadge(b.id, -1)} className="text-body-soft disabled:opacity-25 hover:text-purple text-[11px]">◀</button>
                    <button disabled={i === badges.length - 1} onClick={() => moveBadge(b.id, 1)} className="text-body-soft disabled:opacity-25 hover:text-purple text-[11px]">▶</button>
                  </div>
                  {b.imageUrl && <button onClick={() => patchBadge(b.id, { imageUrl: null })} className="text-[11.5px] text-body-soft hover:text-[#c0392b]">clear</button>}
                  <button onClick={async () => { await deletePaymentBadge(b.id); setBadges((x) => x.filter((y) => y.id !== b.id)); flash("Removed"); }}
                    className="text-body-soft hover:text-[#c0392b]"><Icon name="trash" size={13} /></button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={async () => { const b = await createPaymentBadge({ sortOrder: badges.length }); setBadges((x) => [...x, b]); }}
            className="text-[12.5px] text-purple font-medium mb-8 inline-flex items-center gap-1.5">
            <Icon name="plus" size={13} /> Add a method
          </button>

          {/* ---- the two lines of copy ---- */}
          <h2 className="font-display text-[17px] text-purple mb-3">Footer wording</h2>
          <div className="space-y-3 max-w-[560px]">
            <div>
              <span className="text-[12.5px] font-medium text-body block mb-1.5">The paragraph under the logo</span>
              <textarea className="ipt" rows={2} defaultValue={tagline}
                onBlur={async (e) => { if (e.target.value === tagline) return; setSaveState("saving"); try { const s = await saveFooterSettings({ footerTagline: e.target.value }); setTagline(s.footerTagline ?? ""); flash("Saved"); } catch (er) { fail(er, "Could not save"); } }} />
            </div>
            <div>
              <span className="text-[12.5px] font-medium text-body block mb-1.5">
                The small line, bottom right
                <span className="block text-[11px] text-body-soft font-normal mt-0.5">
                  The year is added automatically — do not type it, or it will still say this year in three years&rsquo; time.
                </span>
              </span>
              <input className="ipt" defaultValue={legal} placeholder="Radian Flower &amp; Gift Shop. Made with love in Dhaka."
                onBlur={async (e) => { if (e.target.value === legal) return; setSaveState("saving"); try { const s = await saveFooterSettings({ footerLegal: e.target.value }); setLegal(s.footerLegal ?? ""); flash("Saved"); } catch (er) { fail(er, "Could not save"); } }} />
            </div>
          </div>
        </>
      )}
        </div>
      </ModuleCard>
    </div>
  );

  /* ---------- handlers, kept below the markup so the screen reads first ------ */

  async function patchLink(id: string, groupId: string, body: { label?: string; href?: string }) {
    setSaveState("saving");
    try {
      const u = await updateNavLink(id, body);
      setGroups((gs) => gs.map((g) => g.id === groupId ? { ...g, links: g.links.map((l) => l.id === id ? u : l) } : g));
      flash("Saved");
    } catch (e) { fail(e, "Could not save"); }
  }
  async function addLink(groupId: string) {
    const g = groups.find((x) => x.id === groupId);
    const l = await createNavLink({ groupId, sortOrder: g?.links.length ?? 0 });
    setGroups((gs) => gs.map((x) => x.id === groupId ? { ...x, links: [...x.links, l] } : x));
  }
  async function removeLink(id: string, groupId: string) {
    await deleteNavLink(id);
    setGroups((gs) => gs.map((g) => g.id === groupId ? { ...g, links: g.links.filter((l) => l.id !== id) } : g));
    flash("Removed");
  }
  async function moveLink(groupId: string, id: string, dir: -1 | 1) {
    const g = groups.find((x) => x.id === groupId); if (!g) return;
    const i = g.links.findIndex((l) => l.id === id), j = i + dir;
    if (j < 0 || j >= g.links.length) return;
    const next = [...g.links]; [next[i], next[j]] = [next[j], next[i]];
    setGroups((gs) => gs.map((x) => x.id === groupId ? { ...x, links: next.map((l, k) => ({ ...l, sortOrder: k })) } : x));
    await Promise.all(next.map((l, k) => ({ l, k })).filter(({ l, k }) => l.sortOrder !== k).map(({ l, k }) => updateNavLink(l.id, { sortOrder: k })));
    flash("Order saved");
  }

  async function addGroup(placement: LinkPlacement) {
    const g = await createLinkGroup({ placement, sortOrder: groups.filter((x) => x.placement === placement).length });
    setGroups((gs) => [...gs, { ...g, links: [] }]);
  }
  async function removeGroup(id: string) {
    if (!confirm("Remove this whole column and every link in it?")) return;
    await deleteLinkGroup(id);
    setGroups((gs) => gs.filter((g) => g.id !== id));
    flash("Removed");
  }
  async function moveGroup(id: string, dir: -1 | 1) {
    const list = groups.filter((g) => g.placement === tab);
    const i = list.findIndex((g) => g.id === id), j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]];
    setGroups((gs) => gs.map((g) => { const k = next.findIndex((n) => n.id === g.id); return k >= 0 ? { ...g, sortOrder: k } : g; }));
    await Promise.all(next.map((g, k) => updateLinkGroup(g.id, { sortOrder: k })));
    flash("Order saved");
  }

  async function patchSocial(id: string, body: Partial<ApiSocialLink>) {
    setSaveState("saving");
    try { const u = await updateSocialLink(id, body); setSocials((s) => s.map((x) => x.id === id ? u : x)); flash("Saved"); }
    catch (e) { fail(e, "Could not save"); }
  }
  async function moveSocial(id: string, dir: -1 | 1) {
    const i = socials.findIndex((s) => s.id === id), j = i + dir;
    if (j < 0 || j >= socials.length) return;
    const next = [...socials]; [next[i], next[j]] = [next[j], next[i]];
    setSocials(next.map((s, k) => ({ ...s, sortOrder: k })));
    await Promise.all(next.map((s, k) => updateSocialLink(s.id, { sortOrder: k })));
    flash("Order saved");
  }

  async function patchBadge(id: string, body: Partial<ApiPaymentBadge>) {
    setSaveState("saving");
    try { const u = await updatePaymentBadge(id, body); setBadges((b) => b.map((x) => x.id === id ? u : x)); flash("Saved"); }
    catch (e) { fail(e, "Could not save"); }
  }
  async function moveBadge(id: string, dir: -1 | 1) {
    const i = badges.findIndex((b) => b.id === id), j = i + dir;
    if (j < 0 || j >= badges.length) return;
    const next = [...badges]; [next[i], next[j]] = [next[j], next[i]];
    setBadges(next.map((b, k) => ({ ...b, sortOrder: k })));
    await Promise.all(next.map((b, k) => updatePaymentBadge(b.id, { sortOrder: k })));
    flash("Order saved");
  }
}
