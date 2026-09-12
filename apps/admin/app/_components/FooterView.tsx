"use client";

import { useEffect, useMemo, useState } from "react";
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
  Storefront · Footer & menus — v2 (12 Aug 2026), in the Reviews/Journal rail.

  ONE SCREEN FOR the things at the bottom of every page — but no longer one
  SCROLL: the rail splits it into Footer columns / the ☰ menu / Social /
  We accept / Wording, one section at a time.

  Adding a link or a column still creates the row right away — these rows
  ARE the editor (a link is two boxes you type into), unlike an article or a
  review where a dialog fits. The safety net moved server-side instead: the
  storefront now FILTERS OUT links with an empty label or address and badges
  with neither label nor logo, so an unfinished row can never render as a
  blank <a> on the shop.

  The "More" panel behind the ☰ shares the same link table as the footer —
  two lists would mean correcting an address in one and leaving the other
  pointing at a page that no longer exists.
*/

const SOCIAL_ICONS = ["facebook", "instagram", "whatsapp", "messenger", "tiktok", "youtube", "globe"];

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

const SECTIONS = [
  {
    id: "footer", label: "Footer columns", blurb: "Link columns at the bottom", icon: "grid",
    tint: "var(--t-accent)", edge: "var(--l-accent)", chip: "var(--s-accent)",
    ink: "var(--t-accent)", sub: "var(--t-accent)", strong: "var(--t-accent)",
    fill: "linear-gradient(100deg,var(--a-solid),var(--o-solid))", glow: "rgba(71,0,102,.30)", soft: "var(--o-solid)",
  },
  {
    id: "menu", label: "The ☰ menu", blurb: "The slide-out panel", icon: "hash",
    tint: "var(--t-info)", edge: "var(--l-info)", chip: "var(--s-info)",
    ink: "var(--t-info)", sub: "var(--t-info)", strong: "var(--t-info)",
    fill: "linear-gradient(100deg,var(--f-info),var(--f-info))", glow: "rgba(24,95,165,.25)", soft: "var(--f-info)",
  },
  {
    id: "social", label: "Social profiles", blurb: "Only filled ones show", icon: "heart",
    tint: "var(--t-orchid)", edge: "var(--l-orchid)", chip: "var(--s-orchid)",
    ink: "var(--t-orchid)", sub: "var(--t-gold)", strong: "var(--t-gold)",
    fill: "linear-gradient(100deg,var(--t-gold),var(--t-gold))", glow: "rgba(153,53,86,.28)", soft: "var(--t-orchid)",
  },
  {
    id: "badges", label: "We accept", blurb: "Payment method badges", icon: "bag",
    tint: "var(--t-ok)", edge: "var(--l-ok)", chip: "var(--s-ok)",
    ink: "var(--t-ok)", sub: "var(--t-ok)", strong: "var(--t-ok)",
    fill: "linear-gradient(100deg,var(--f-ok),var(--f-ok))", glow: "rgba(14,122,61,.25)", soft: "var(--t-ok)",
  },
  {
    id: "wording", label: "Wording", blurb: "Tagline and the legal line", icon: "tag",
    tint: "var(--t-accent)", edge: "var(--l-accent)", chip: "var(--s-accent)",
    ink: "var(--t-accent)", sub: "var(--t-accent)", strong: "var(--t-accent)",
    fill: "linear-gradient(100deg,var(--a-solid),var(--a-solid))", glow: "rgba(95,75,115,.24)", soft: "var(--a-solid)",
  },
] as const;
type SecId = (typeof SECTIONS)[number]["id"];

export default function FooterView() {
  const [sec, setSec] = useState<SecId>("footer");
  const [groups, setGroups] = useState<ApiLinkGroup[]>([]);
  const [socials, setSocials] = useState<ApiSocialLink[]>([]);
  const [badges, setBadges] = useState<ApiPaymentBadge[]>([]);
  const [tagline, setTagline] = useState("");
  const [legal, setLegal] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
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

  const counts = useMemo<Record<SecId, number>>(() => ({
    footer: groups.filter((g) => g.placement === "FOOTER").length,
    menu: groups.filter((g) => g.placement === "MORE").length,
    social: socials.filter((x) => x.url).length,
    badges: badges.length,
    wording: [tagline, legal].filter((x) => x.trim()).length,
  }), [groups, socials, badges, tagline, legal]);

  const active = SECTIONS.find((s) => s.id === sec)!;
  const placement: LinkPlacement = sec === "menu" ? "MORE" : "FOOTER";
  const shownGroups = groups.filter((g) => g.placement === placement);

  return (
    <div className={WRAP}>
      <SaveBar state={saveState} onSave={() => flash("Saved")} />

      {err && (
        <div className="flex items-start gap-2 bg-[var(--s-bad)] border border-[var(--l-bad)] rounded-[11px] px-3.5 py-2.5 text-[12px] text-[var(--t-bad)] mb-4">
          <span className="mt-0.5 shrink-0"><Icon name="alert" size={14} /></span><span>{err}</span>
        </div>
      )}
      {ok && <div className="bg-[var(--s-ok)] border border-[var(--l-ok)] rounded-[11px] px-3.5 py-2 text-[12px] text-[var(--t-ok)] mb-4">{ok}</div>}

      <ModuleCard>
        <ModuleHeader
          tone="rosegold"
          icon="layers"
          title="Footer & menus"
          blurb="Bottom of every page and the ☰ menu"
        />
        <StatTiles tone="rosegold" stats={[
          { label: "Footer columns", value: counts.footer },
          { label: "Menu groups", value: counts.menu },
          { label: "Links in all", value: groups.reduce((n, g) => n + g.links.length, 0) },
          { label: "Social profiles", value: counts.social },
        ]} />

        <div className="grid grid-cols-1 md:grid-cols-[236px_minmax(0,1fr)] gap-5 items-start mx-5 mt-5 mb-5">
          {/* ---- the colourful section rail ---- */}
          <nav className="hidden md:grid gap-2 md:sticky md:top-[16px] self-start md:max-h-[calc(100vh-32px)] md:overflow-y-auto">
            {SECTIONS.map((s) => {
              const on = sec === s.id;
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
                    {counts[s.id]}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* ---- the open section ---- */}
          <div className="flex-1 min-w-0">
            <div className="md:hidden mb-4">
              <select className="ipt h-[44px]" value={sec} onChange={(e) => setSec(e.target.value as SecId)}>
                {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>

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

            {loading ? <p className="text-[13px] text-body-soft">Loading…</p> : (
              <>
                {(sec === "footer" || sec === "menu") && (
                  <>
                    <p className="text-[11.5px] text-body-soft mb-3">
                      A link with an empty name or address never shows on the website — finish the row and it appears.
                    </p>
                    <div className="space-y-3">
                      {shownGroups.map((g, gi) => (
                        <div key={g.id} className="border border-lavender-deep rounded-[16px] bg-white p-4">
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
                              <button disabled={gi === shownGroups.length - 1} onClick={() => moveGroup(g.id, 1)} className="text-body-soft disabled:opacity-25 hover:text-purple text-[10px] leading-none py-0.5">▼</button>
                            </div>
                            <div className="flex-1" />
                            <button onClick={() => removeGroup(g.id)} className="text-[12.5px] text-body-soft hover:text-[var(--t-bad)]">Remove column</button>
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
                                  <button onClick={() => removeLink(l.id, g.id)} className="text-body-soft hover:text-[var(--t-bad)] p-1"><Icon name="trash" size={14} /></button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <button onClick={() => addLink(g.id)} className="text-[12.5px] text-purple font-medium mt-2.5 inline-flex items-center gap-1.5">
                            <Icon name="plus" size={13} /> Add a link
                          </button>
                        </div>
                      ))}

                      <button onClick={() => addGroup(placement)} className="bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] inline-flex items-center gap-1.5">
                        <Icon name="plus" size={15} /> Add a column
                      </button>
                    </div>
                  </>
                )}

                {sec === "social" && (
                  <>
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
                            <button onClick={() => removeSocial(so.id)} className="text-body-soft hover:text-[var(--t-bad)] p-1"><Icon name="trash" size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={addSocial} className="text-[12.5px] text-purple font-medium inline-flex items-center gap-1.5">
                      <Icon name="plus" size={13} /> Add a profile
                    </button>
                  </>
                )}

                {sec === "badges" && (
                  <>
                    <p className="text-[12px] text-[var(--t-warn)] bg-[var(--s-warn)] border border-[var(--l-warn)] rounded-[10px] px-3.5 py-2.5 mb-3">
                      Only show a method you can actually take.
                      <br />Logos: <b>height 48 · transparent · max 50 KB</b>, on-dark version.
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
                            {b.imageUrl && <button onClick={() => patchBadge(b.id, { imageUrl: null })} className="text-[11.5px] text-body-soft hover:text-[var(--t-bad)]">clear</button>}
                            <button onClick={() => removeBadge(b.id)} className="text-body-soft hover:text-[var(--t-bad)]"><Icon name="trash" size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={addBadge} className="text-[12.5px] text-purple font-medium inline-flex items-center gap-1.5">
                      <Icon name="plus" size={13} /> Add a method
                    </button>
                  </>
                )}

                {sec === "wording" && (
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
                          The year is added automatically.
                        </span>
                      </span>
                      <input className="ipt" defaultValue={legal} placeholder="Radian Flower &amp; Gift Shop. Made with love in Dhaka."
                        onBlur={async (e) => { if (e.target.value === legal) return; setSaveState("saving"); try { const s = await saveFooterSettings({ footerLegal: e.target.value }); setLegal(s.footerLegal ?? ""); flash("Saved"); } catch (er) { fail(er, "Could not save"); } }} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
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
    try {
      const g = groups.find((x) => x.id === groupId);
      const l = await createNavLink({ groupId, sortOrder: g?.links.length ?? 0 });
      setGroups((gs) => gs.map((x) => x.id === groupId ? { ...x, links: [...x.links, l] } : x));
    } catch (e) { fail(e, "Could not add the link"); }
  }
  async function removeLink(id: string, groupId: string) {
    try {
      await deleteNavLink(id);
      setGroups((gs) => gs.map((g) => g.id === groupId ? { ...g, links: g.links.filter((l) => l.id !== id) } : g));
      flash("Removed");
    } catch (e) { fail(e, "Could not remove"); }
  }
  async function moveLink(groupId: string, id: string, dir: -1 | 1) {
    const g = groups.find((x) => x.id === groupId); if (!g) return;
    const i = g.links.findIndex((l) => l.id === id), j = i + dir;
    if (j < 0 || j >= g.links.length) return;
    const next = [...g.links]; [next[i], next[j]] = [next[j], next[i]];
    setGroups((gs) => gs.map((x) => x.id === groupId ? { ...x, links: next.map((l, k) => ({ ...l, sortOrder: k })) } : x));
    try {
      await Promise.all(next.map((l, k) => ({ l, k })).filter(({ l, k }) => l.sortOrder !== k).map(({ l, k }) => updateNavLink(l.id, { sortOrder: k })));
      flash("Order saved");
    } catch (e) { fail(e, "Could not save the order"); }
  }

  async function addGroup(pl: LinkPlacement) {
    try {
      const g = await createLinkGroup({ placement: pl, sortOrder: groups.filter((x) => x.placement === pl).length });
      setGroups((gs) => [...gs, { ...g, links: [] }]);
    } catch (e) { fail(e, "Could not add the column"); }
  }
  async function removeGroup(id: string) {
    if (!confirm("Remove this whole column and every link in it?")) return;
    try {
      await deleteLinkGroup(id);
      setGroups((gs) => gs.filter((g) => g.id !== id));
      flash("Removed");
    } catch (e) { fail(e, "Could not remove"); }
  }
  async function moveGroup(id: string, dir: -1 | 1) {
    const list = groups.filter((g) => g.placement === placement);
    const i = list.findIndex((g) => g.id === id), j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]];
    setGroups((gs) => gs.map((g) => { const k = next.findIndex((n) => n.id === g.id); return k >= 0 ? { ...g, sortOrder: k } : g; }));
    try {
      await Promise.all(next.map((g, k) => updateLinkGroup(g.id, { sortOrder: k })));
      flash("Order saved");
    } catch (e) { fail(e, "Could not save the order"); }
  }

  async function patchSocial(id: string, body: Partial<ApiSocialLink>) {
    setSaveState("saving");
    try { const u = await updateSocialLink(id, body); setSocials((s) => s.map((x) => x.id === id ? u : x)); flash("Saved"); }
    catch (e) { fail(e, "Could not save"); }
  }
  async function addSocial() {
    try {
      const s = await createSocialLink({ sortOrder: socials.length });
      setSocials((x) => [...x, s]);
    } catch (e) { fail(e, "Could not add"); }
  }
  async function removeSocial(id: string) {
    try {
      await deleteSocialLink(id);
      setSocials((s) => s.filter((x) => x.id !== id));
      flash("Removed");
    } catch (e) { fail(e, "Could not remove"); }
  }
  async function moveSocial(id: string, dir: -1 | 1) {
    const i = socials.findIndex((s) => s.id === id), j = i + dir;
    if (j < 0 || j >= socials.length) return;
    const next = [...socials]; [next[i], next[j]] = [next[j], next[i]];
    setSocials(next.map((s, k) => ({ ...s, sortOrder: k })));
    try {
      await Promise.all(next.map((s, k) => updateSocialLink(s.id, { sortOrder: k })));
      flash("Order saved");
    } catch (e) { fail(e, "Could not save the order"); }
  }

  async function patchBadge(id: string, body: Partial<ApiPaymentBadge>) {
    setSaveState("saving");
    try { const u = await updatePaymentBadge(id, body); setBadges((b) => b.map((x) => x.id === id ? u : x)); flash("Saved"); }
    catch (e) { fail(e, "Could not save"); }
  }
  async function addBadge() {
    try {
      const b = await createPaymentBadge({ sortOrder: badges.length });
      setBadges((x) => [...x, b]);
    } catch (e) { fail(e, "Could not add"); }
  }
  async function removeBadge(id: string) {
    try {
      await deletePaymentBadge(id);
      setBadges((x) => x.filter((y) => y.id !== id));
      flash("Removed");
    } catch (e) { fail(e, "Could not remove"); }
  }
  async function moveBadge(id: string, dir: -1 | 1) {
    const i = badges.findIndex((b) => b.id === id), j = i + dir;
    if (j < 0 || j >= badges.length) return;
    const next = [...badges]; [next[i], next[j]] = [next[j], next[i]];
    setBadges(next.map((b, k) => ({ ...b, sortOrder: k })));
    try {
      await Promise.all(next.map((b, k) => updatePaymentBadge(b.id, { sortOrder: k })));
      flash("Order saved");
    } catch (e) { fail(e, "Could not save the order"); }
  }
}
