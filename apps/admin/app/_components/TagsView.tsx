"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { Info } from "./ItemEditor";
import { placeholderBg } from "../_data/tagGroupDemo";
import {
  loadTagsSafe,
  initTagSystem,
  createTagGroup,
  updateTagGroup,
  deleteTagGroup,
  createTag,
  updateTag,
  deleteTag,
  tagSlug,
  uploadImage,
  type UiTagGroup,
  type UiTag,
  type TagDisplayStyle,
} from "../_data/api";

/*
  Classification · Occasions & Tags — LIVE two-pane manager.

    LEFT  : the list of groups (Occasions, Recipients, Bouquet Style…). Pick one.
    RIGHT : that one group — its tags as a clean list, a "show on site as Chips /
            Cards" choice, real image upload per tag, and a storefront preview.

  Live against the API (/tag-groups + /tags). Occasions & Recipients are seeded
  system groups (undeletable). Demo fallback ONLY when the API is unreachable.
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";
const rnd = () => Math.random().toString(36).slice(2, 9);

type Group = UiTagGroup;
type Tag = UiTag;

/*  The palette is the BRAND's, not a rainbow (owner, 22 Aug 2026: "color jen
    amder brand color ar maje hoy"). Every group wears purple, orchid, pink or
    rose gold — four shades of one family, so the page reads as one thing while
    the groups stay apart. `c` inks the icon and the name, `bg` is the tint the
    card sits on, `edge` is the coloured spine down its left side.  */
type GroupTheme = { c: string; bg: string; edge: string; icon: string };
const SYSTEM_THEME: Record<string, GroupTheme> = {
  occasions: { c: "#7a2ea8", bg: "#f6ecfb", edge: "#a94fd0", icon: "sparkle" },
  recipients: { c: "#a4566a", bg: "#fbeef0", edge: "#c9788a", icon: "user" },
};
const CUSTOM_THEMES: GroupTheme[] = [
  { c: "#470066", bg: "#f3ebf8", edge: "#6d3a9c", icon: "tag" },
  { c: "#b76e79", bg: "#fbf0f1", edge: "#d29aa2", icon: "heart" },
  { c: "#8b3fb0", bg: "#f7eafc", edge: "#cf43ea", icon: "star" },
  { c: "#5c3b8a", bg: "#efebf9", edge: "#8b6fc4", icon: "grid" },
];

/** background style for a tile/thumb — uploaded image if present, else gradient */
function tileBg(t: Tag): React.CSSProperties {
  return t.img
    ? { backgroundImage: `url(${t.img})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: placeholderBg(t.slug || t.name) };
}

export default function TagsView() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [groupDraft, setGroupDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTargetId = useRef<string | null>(null);
  /** which tag is mid-upload — the preview waits for the real URL */
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const sortedGroups = useMemo(() => groups.slice().sort((a, b) => a.sortOrder - b.sortOrder), [groups]);
  const tagsOf = (gid: string) => tags.filter((t) => t.groupId === gid).slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const selected = groups.find((g) => g.id === selectedId) ?? null;

  const themeFor = (g: Group): GroupTheme => {
    if (SYSTEM_THEME[g.slug]) return SYSTEM_THEME[g.slug];
    const customs = sortedGroups.filter((x) => !x.isSystem);
    const idx = customs.findIndex((x) => x.id === g.id);
    return CUSTOM_THEMES[(idx < 0 ? 0 : idx) % CUSTOM_THEMES.length];
  };

  const stats = useMemo(() => {
    const hidden = tags.filter((t) => !t.isActive).length + groups.filter((g) => !g.isActive).length;
    const empty = tags.filter((t) => t.products === 0).length;
    return { groups: groups.length, tags: tags.length, hidden, empty };
  }, [groups, tags]);

  async function load() {
    setLoading(true);
    try {
      const { groups, tags, isDemo } = await loadTagsSafe();
      setGroups(groups);
      setTags(tags);
      setIsDemo(isDemo);
      setSelectedId((cur) => {
        const ordered = groups.slice().sort((a, b) => a.sortOrder - b.sortOrder);
        return cur && groups.some((g) => g.id === cur) ? cur : ordered[0]?.id ?? "";
      });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  /* ---------- group mutations ---------- */
  async function addGroup() {
    const name = groupDraft.trim();
    if (!name) return;
    const slug = tagSlug(name);
    if (groups.some((g) => g.slug === slug)) { setErr(`A group called “${name}” already exists.`); return; }
    setErr(null);
    setGroupDraft("");
    if (isDemo) {
      const id = "grp-" + rnd();
      setGroups((p) => [...p, { id, slug, name, sortOrder: p.length, isActive: true, isSystem: false, displayStyle: "CHIP" }]);
      setSelectedId(id);
      return;
    }
    try {
      const g = await createTagGroup({ slug, name, sortOrder: groups.length, isActive: true, isSystem: false, displayStyle: "CHIP" });
      await load();
      setSelectedId(g.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the group.");
    }
  }
  async function moveGroup(g: Group, dir: "up" | "down") {
    const i = sortedGroups.findIndex((x) => x.id === g.id);
    const k = dir === "up" ? i - 1 : i + 1;
    if (k < 0 || k >= sortedGroups.length) return;
    const other = sortedGroups[k];
    const a = g.sortOrder, b = other.sortOrder === a ? a + (dir === "up" ? -1 : 1) : other.sortOrder;
    setGroups((p) => p.map((x) => (x.id === g.id ? { ...x, sortOrder: b } : x.id === other.id ? { ...x, sortOrder: a } : x)));
    if (isDemo) return;
    try { await Promise.all([updateTagGroup(g.id, { sortOrder: b }), updateTagGroup(other.id, { sortOrder: a })]); } catch { await load(); }
  }
  async function setStyle(g: Group, displayStyle: TagDisplayStyle) {
    setGroups((p) => p.map((x) => (x.id === g.id ? { ...x, displayStyle } : x)));
    if (isDemo) return;
    try { await updateTagGroup(g.id, { displayStyle }); } catch { setErr("Could not change the display style."); await load(); }
  }
  async function toggleGroup(g: Group) {
    const next = !g.isActive;
    setGroups((p) => p.map((x) => (x.id === g.id ? { ...x, isActive: next } : x)));
    if (isDemo) return;
    try { await updateTagGroup(g.id, { isActive: next }); } catch { setGroups((p) => p.map((x) => (x.id === g.id ? { ...x, isActive: g.isActive } : x))); setErr("Could not update visibility."); }
  }
  async function deleteGroup(g: Group) {
    if (g.isSystem) return;
    const n = tagsOf(g.id).length;
    if (!confirm(n > 0 ? `Delete the “${g.name}” group and its ${n} tag${n === 1 ? "" : "s"}?` : `Delete the “${g.name}” group?`)) return;
    setGroups((p) => p.filter((x) => x.id !== g.id));
    setTags((p) => p.filter((t) => t.groupId !== g.id));
    setSelectedId(sortedGroups.find((x) => x.id !== g.id)?.id ?? "");
    if (isDemo) return;
    try { await deleteTagGroup(g.id); } catch (e) { setErr(e instanceof Error ? e.message : "Could not delete the group."); await load(); }
  }

  /* ---------- tag mutations ---------- */
  async function addTag(gid: string) {
    const name = tagDraft.trim();
    if (!name) return;
    const slug = tagSlug(name);
    if (tags.some((t) => t.groupId === gid && t.slug === slug)) { setErr(`“${name}” already exists in this group.`); return; }
    setErr(null);
    setTagDraft("");
    const sortOrder = tagsOf(gid).length;
    if (isDemo) {
      setTags((p) => [...p, { id: "tag-" + rnd(), slug, name, groupId: gid, sortOrder, isActive: true, products: 0 }]);
      return;
    }
    try { await createTag({ slug, name, groupId: gid, sortOrder, isActive: true }); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not add the tag."); }
  }
  async function toggleTag(t: Tag) {
    const next = !t.isActive;
    setTags((p) => p.map((x) => (x.id === t.id ? { ...x, isActive: next } : x)));
    if (isDemo) return;
    try { await updateTag(t.id, { isActive: next }); } catch { setTags((p) => p.map((x) => (x.id === t.id ? { ...x, isActive: t.isActive } : x))); setErr("Could not update visibility."); }
  }
  async function moveTag(t: Tag, dir: "up" | "down") {
    const list = tagsOf(t.groupId);
    const i = list.findIndex((x) => x.id === t.id);
    const k = dir === "up" ? i - 1 : i + 1;
    if (k < 0 || k >= list.length) return;
    const other = list[k];
    const a = t.sortOrder, b = other.sortOrder === a ? a + (dir === "up" ? -1 : 1) : other.sortOrder;
    setTags((p) => p.map((x) => (x.id === t.id ? { ...x, sortOrder: b } : x.id === other.id ? { ...x, sortOrder: a } : x)));
    if (isDemo) return;
    try { await Promise.all([updateTag(t.id, { sortOrder: b }), updateTag(other.id, { sortOrder: a })]); } catch { await load(); }
  }
  async function removeTag(t: Tag) {
    const msg = t.products > 0 ? `“${t.name}” is used by ${t.products} product${t.products === 1 ? "" : "s"}. Remove it anyway?` : `Delete “${t.name}”?`;
    if (!confirm(msg)) return;
    setTags((p) => p.filter((x) => x.id !== t.id));
    if (isDemo) return;
    try { await deleteTag(t.id); } catch (e) { setErr(e instanceof Error ? e.message : "Could not delete."); await load(); }
  }

  /* ---------- image upload ----------------------------------------------------
     WAS: FileReader → a base64 data URL → straight into `imageUrl`.

     That is why the owner reported "anything but a small PNG disappears on
     refresh". Base64 makes a file about a third bigger and it travelled inside
     the JSON body, so anything past the server's body limit was rejected — while
     the picture was ALREADY on screen from the reader, so it looked saved. Small
     PNGs squeaked under the limit; a phone photograph never would.

     Now it goes to ImageKit like every other image in the panel, and what is
     stored is a URL. The preview only appears once the upload has returned, so
     what is on screen is what is in the database.                              */
  function pickImage(t: Tag) {
    uploadTargetId.current = t.id;
    fileRef.current?.click();
  }
  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const id = uploadTargetId.current;
    e.target.value = "";
    if (!file || !id) return;

    setUploadingId(id);
    setErr("");
    try {
      const { url } = await uploadImage(file, "tags");
      setTags((p) => p.map((x) => (x.id === id ? { ...x, img: url } : x)));
      if (!isDemo) await updateTag(id, { imageUrl: url });
    } catch (er) {
      // the server's own words — "14.2 MB, the limit is 10 MB" tells him what to
      // do; "upload failed" does not
      setErr(er instanceof Error ? er.message : "Could not upload that image.");
    } finally {
      setUploadingId(null);
    }
  }
  function clearImage(t: Tag) {
    setTags((p) => p.map((x) => (x.id === t.id ? { ...x, img: undefined } : x)));
    if (!isDemo) updateTag(t.id, { imageUrl: null }).catch(() => setErr("Could not remove the image."));
  }

  /* ---------- inline rename (groups + tags share editingId) ---------- */
  function startEdit(id: string, name: string) { setEditingId(id); setEditingName(name); }
  async function commitEdit() {
    const name = editingName.trim(); const id = editingId; setEditingId(null);
    if (!id || !name) return;
    const isGroup = groups.some((g) => g.id === id);
    setGroups((p) => p.map((g) => (g.id === id ? { ...g, name } : g)));
    setTags((p) => p.map((t) => (t.id === id ? { ...t, name } : t)));
    if (isDemo) return;
    try { if (isGroup) await updateTagGroup(id, { name }); else await updateTag(id, { name }); }
    catch { setErr("Could not rename."); await load(); }
  }

  async function retry() {
    try { await initTagSystem(); } catch { /* ignore — load() will fall back to demo again */ }
    await load();
  }

  const noTags = !loading && !isDemo && tags.length === 0;

  return (
    <div className={WRAP}>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={onFileChosen} />

      {/*  The page prose is gone (owner, 22 Aug 2026) — "odorkari sob text remove
           kro ba icon ar maje hide kre daw". What it said now lives behind the ⓘ
           beside the title, where it is there for whoever wants it and silent
           for everyone else.  */}
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
            <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
            Classification
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <h1 className="font-display text-[28px] text-purple m-0 leading-tight">Occasions &amp; Tags</h1>
            <Info text="Pick a group on the left, manage its tags on the right." />
          </div>
        </div>
        <Link href="/categories" className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] hover:border-orchid shrink-0">Categories</Link>
      </div>

      {err && (
        <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-4 text-[13px] flex items-center justify-between gap-3">
          <span>{err}</span><button className="underline shrink-0" onClick={() => setErr(null)}>Dismiss</button>
        </div>
      )}
      {isDemo && (
        <div className="flex items-center gap-3 bg-[#fff4e6] border border-[#fce4c4] text-[#b45309] rounded-[12px] px-4 py-2.5 mb-4 text-[12.5px] flex-wrap">
          <span className="text-[10px] font-bold tracking-[0.06em] uppercase bg-[#b45309] text-white px-2 py-1 rounded-full shrink-0">Offline</span>
          <span className="flex-1 min-w-[220px]">
            The API is not reachable, so nothing can be shown. Start it and
            <button className="underline font-medium mx-1" onClick={retry}>retry</button>
            to see what is really there.
          </span>
        </div>
      )}
      {loading && <div className="text-[13px] text-body-soft mb-4">Loading tags…</div>}

      {/*  Four tall coloured boxes became one quiet strip. They are a glance, not
           the subject of the page — the tags are.  */}
      {/*  Cards, as the owner asked (22 Aug) — but the brand's own family, not
           four unrelated colours: deep purple, orchid, rose gold. Each carries
           its icon in the tint, the number large, and any explanation behind
           the ⓘ rather than as a second line of grey.  */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
        {[
          { l: "Groups", v: stats.groups, c: "#470066", edge: "#6d3a9c", bg: "#f3ebf8", icon: "layers" },
          { l: "Tags", v: stats.tags, c: "#8b3fb0", edge: "#cf43ea", bg: "#f7eafc", icon: "tag" },
          { l: "Unused", v: stats.empty, c: "#a4566a", edge: "#c9788a", bg: "#fbeef0", icon: "bolt", tip: "Tags no product carries yet." },
          { l: "Hidden", v: stats.hidden, c: "#5c3b8a", edge: "#8b6fc4", bg: "#efebf9", icon: "eye", tip: "Switched off — hidden from the shop, kept here." },
        ].map((k, i) => (
          <div key={i} className="relative rounded-[16px] border border-white/70 shadow-soft overflow-hidden px-4 py-3.5"
            style={{ background: `linear-gradient(150deg,${k.bg},#ffffff 130%)` }}>
            <span className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ background: k.edge }} />
            <div className="flex items-center justify-between gap-2">
              <span className="w-[28px] h-[28px] rounded-[9px] grid place-items-center text-white shrink-0"
                style={{ background: k.edge, boxShadow: `0 3px 9px ${k.edge}45` }}>
                <Icon name={k.icon} size={14} />
              </span>
              {k.tip && <Info text={k.tip} />}
            </div>
            <div className="font-display text-[27px] leading-none mt-3 tabular-nums" style={{ color: k.c }}>{k.v}</div>
            <div className="text-[12px] font-semibold mt-1.5" style={{ color: k.c, opacity: 0.65 }}>{k.l}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-6 items-start">
        {/*  ---------------- LEFT: group list ----------------
             A DEEP PURPLE PANEL, not a column of loose cards. The owner asked
             for it on 22 Aug, I misread a later note and turned it back into
             cards, and he put it straight: "group section ta ager motii purple
             a kro."

             It earns its place: the two panes were both white on lavender, so
             the eye had to work out which side it was on. Dark purple says
             "this is the chooser" in one glance, and the selected row is the
             only light thing on it — the strongest possible signal for "you
             are here", with no ring or border needed.  */}
        <div className="xl:sticky xl:top-4 self-start rounded-[18px] shadow-soft overflow-hidden"
          style={{ background: "linear-gradient(168deg,#3b1152,#2a0b3d)" }}>
          <div className="px-4 pt-4 pb-2.5 flex items-center gap-2">
            <span className="w-[26px] h-[26px] rounded-[8px] grid place-items-center text-white shrink-0" style={{ background: "rgba(255,255,255,.14)" }}>
              <Icon name="layers" size={14} />
            </span>
            <span className="text-[12px] font-bold tracking-[0.08em] uppercase text-white/70">Groups</span>
            <span className="ml-auto text-[12px] text-white/45">{sortedGroups.length}</span>
          </div>

          <div className="px-3 pb-3 space-y-1.5">
            {sortedGroups.map((g, gi) => {
              const th = themeFor(g);
              const on = g.id === selectedId;
              const count = tagsOf(g.id).length;
              return (
                <div key={g.id}
                  className={"group/row grid grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-[12px] px-2.5 py-2.5 cursor-pointer transition-colors " + (on ? "bg-white shadow-soft" : "hover:bg-white/10")}
                  onClick={() => setSelectedId(g.id)}>
                  <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center text-white shrink-0"
                    style={{ background: on ? th.c : "rgba(255,255,255,.14)" }}>
                    <Icon name={th.icon} size={15} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={"font-medium text-[14px] truncate " + (on ? "text-purple" : "text-white")}>{g.name}</span>
                      {!g.isActive && (
                        <span className="shrink-0" title="Hidden from the storefront">
                          <Icon name="eye" size={12} className={on ? "text-[#b45309]" : "text-white/50"} />
                        </span>
                      )}
                    </div>
                    <div className={"text-[12.5px] " + (on ? "text-body-soft" : "text-white/45")}>
                      {count} tag{count === 1 ? "" : "s"} · {g.displayStyle === "CARD" ? "cards" : "chips"}
                    </div>
                  </div>
                  {/*  The arrows only appear on the row under the cursor. Two of
                       them on every row, all the time, is more furniture than the
                       names themselves.  */}
                  <div className={"flex flex-col shrink-0 transition-opacity " + (on ? "opacity-100" : "opacity-0 group-hover/row:opacity-100")}
                    onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => moveGroup(g, "up")} disabled={gi === 0}
                      className={"disabled:opacity-20 leading-none " + (on ? "text-body-soft hover:text-purple" : "text-white/60 hover:text-white")} title="Move up">
                      <span className="rotate-180 inline-block"><Icon name="chevronDown" size={13} /></span>
                    </button>
                    <button onClick={() => moveGroup(g, "down")} disabled={gi === sortedGroups.length - 1}
                      className={"disabled:opacity-20 leading-none " + (on ? "text-body-soft hover:text-purple" : "text-white/60 hover:text-white")} title="Move down">
                      <Icon name="chevronDown" size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* add group */}
          <div className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 pb-3.5 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,.1)" }}>
            <input
              className="w-full rounded-[10px] px-3 text-[13px] text-white placeholder:text-white/35 outline-none focus:ring-2 focus:ring-orchid/60"
              style={{ minHeight: 38, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)" }}
              placeholder="New group…" value={groupDraft}
              onChange={(e) => setGroupDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addGroup(); }} />
            <button onClick={addGroup} disabled={!groupDraft.trim()}
              className="bg-orchid hover:bg-white hover:text-purple disabled:opacity-30 text-white h-[38px] w-[38px] rounded-[10px] grid place-items-center shrink-0 transition-colors"
              title="Add group">
              <Icon name="plus" size={16} />
            </button>
          </div>
        </div>

        {/* ---------------- RIGHT: selected group ---------------- */}
        <div>
          {selected ? (
            <GroupManager
              key={selected.id}
              group={selected}
              theme={themeFor(selected)}
              tags={tagsOf(selected.id)}
              editingId={editingId}
              editingName={editingName}
              draft={tagDraft}
              onDraft={setTagDraft}
              onAddTag={() => addTag(selected.id)}
              onStartEdit={startEdit}
              onEditName={setEditingName}
              onCommitEdit={commitEdit}
              onCancelEdit={() => setEditingId(null)}
              onSetStyle={(s) => setStyle(selected, s)}
              onToggleGroup={() => toggleGroup(selected)}
              onDeleteGroup={() => deleteGroup(selected)}
              onToggleTag={toggleTag}
              onMoveTag={moveTag}
              onRemoveTag={removeTag}
              onPickImage={pickImage}
              onClearImage={clearImage}
              uploadingId={uploadingId}
            />
          ) : (
            <div className="bg-white border border-dashed border-lavender-deep rounded-[18px] shadow-soft p-10 text-center">
              <div className="font-display text-[18px] text-purple">{loading ? "Loading…" : "Pick a group"}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= right pane: one group ================= */
function GroupManager({
  group, theme, tags,
  editingId, editingName, draft, onDraft, onAddTag,
  onStartEdit, onEditName, onCommitEdit, onCancelEdit,
  onSetStyle, onToggleGroup, onDeleteGroup,
  onToggleTag, onMoveTag, onRemoveTag, onPickImage, onClearImage, uploadingId,
}: {
  group: Group; theme: GroupTheme; tags: Tag[];
  editingId: string | null; editingName: string; draft: string; onDraft: (v: string) => void; onAddTag: () => void;
  onStartEdit: (id: string, name: string) => void; onEditName: (v: string) => void; onCommitEdit: () => void; onCancelEdit: () => void;
  onSetStyle: (s: TagDisplayStyle) => void; onToggleGroup: () => void; onDeleteGroup: () => void;
  onToggleTag: (t: Tag) => void; onMoveTag: (t: Tag, d: "up" | "down") => void; onRemoveTag: (t: Tag) => void;
  onPickImage: (t: Tag) => void; onClearImage: (t: Tag) => void;
  /** the tag whose image is in flight — the tile says so instead of looking idle */
  uploadingId: string | null;
}) {
  const g = group;
  const isCard = g.displayStyle === "CARD";
  const editingGroup = editingId === g.id;
  const missingImages = isCard ? tags.filter((t) => !t.img).length : 0;

  return (
    <div className="bg-white rounded-[18px] shadow-soft overflow-hidden" style={{ border: `1px solid ${theme.edge}40` }}>
      {/*  The header wears the group's colour as a soft wash with its spine at
           the top, so the right pane and the chosen card on the left are
           visibly the same object.  */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-4 border-b relative"
        style={{ background: `linear-gradient(135deg,${theme.bg},#ffffff)`, borderColor: `${theme.edge}33` }}>
        <span className="absolute left-0 right-0 top-0 h-[3px]" style={{ background: theme.edge }} />
        <span className="w-[40px] h-[40px] rounded-[12px] grid place-items-center text-white shrink-0"
          style={{ background: theme.edge, boxShadow: `0 4px 12px ${theme.edge}45` }}><Icon name={theme.icon} size={19} /></span>
        <div className="min-w-0">
          {editingGroup ? (
            <input autoFocus className="ipt" style={{ minHeight: 34, maxWidth: 280 }} value={editingName} onChange={(e) => onEditName(e.target.value)} onBlur={onCommitEdit} onKeyDown={(e) => { if (e.key === "Enter") onCommitEdit(); if (e.key === "Escape") onCancelEdit(); }} />
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => onStartEdit(g.id, g.name)} className="font-display text-[21px] leading-tight hover:opacity-80" style={{ color: theme.c }} title="Rename group">{g.name}</button>
              {g.isSystem && <span className="shrink-0 opacity-45" style={{ color: theme.c }} title="Built in — this group cannot be deleted"><Icon name="shield" size={13} /></span>}
            </div>
          )}
          <div className="text-[13px] text-body-soft mt-0.5">{tags.length} tag{tags.length === 1 ? "" : "s"}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {g.isSystem ? (
            <span className="w-[34px] h-[34px] rounded-[9px] grid place-items-center text-body-soft opacity-50" title="Built in — this group cannot be deleted"><Icon name="shield" size={15} /></span>
          ) : (
            <button onClick={onDeleteGroup} className="w-[34px] h-[34px] rounded-[9px] grid place-items-center text-[#b42318] bg-white/70 hover:bg-white" title="Delete group"><Icon name="trash" size={15} /></button>
          )}
          {/*  The word beside the switch is gone — the switch already says it,
               and its title carries the meaning for anyone unsure.  */}
          <Switch on={g.isActive} onClick={onToggleGroup} />
        </div>
      </div>

      {/*  Show-as: a proper two-way switch in the group's own colour, not two
           quiet grey words (owner, 22 Aug — "ata color kro and r bold design
           kro"). The chosen half carries the colour and a lifted white knob
           behind it, so which one is on is obvious across the room. The
           sentence that used to explain each choice sits behind the ⓘ.  */}
      <div className="px-5 py-3.5 border-b border-lavender-deep flex items-center gap-3 flex-wrap"
        style={{ background: "linear-gradient(180deg,#ffffff,#fdfaff)" }}>
        <span className="text-[11px] font-bold tracking-[0.07em] uppercase text-purple/60 inline-flex items-center gap-1.5">
          Show as
          <Info text="Chips need no picture. Image cards show each tag as a photo tile." />
        </span>
        <div className="inline-flex rounded-[12px] p-1 gap-1" style={{ background: theme.bg, border: `1px solid ${theme.edge}33` }}>
          {(["CHIP", "CARD"] as TagDisplayStyle[]).map((s) => {
            const on = g.displayStyle === s;
            return (
              <button key={s} onClick={() => onSetStyle(s)}
                className={"text-[13px] font-bold px-3.5 py-2 rounded-[9px] inline-flex items-center gap-2 transition-all " + (on ? "text-white" : "hover:bg-white/70")}
                style={on
                  ? { background: theme.edge, boxShadow: `0 3px 10px ${theme.edge}55` }
                  : { color: theme.c }}>
                <Icon name={s === "CARD" ? "photo" : "tag"} size={14} /> {s === "CARD" ? "Image cards" : "Chips"}
              </button>
            );
          })}
        </div>
      </div>

      {isCard && missingImages > 0 && (
        <div className="mx-3.5 mt-3 bg-[#fff4e6] border border-[#fce4c4] text-[#b45309] rounded-[10px] px-3 py-2 text-[12px] flex items-center gap-2">
          <Icon name="photo" size={14} /> {missingImages} tag{missingImages === 1 ? "" : "s"} without an image
          <Info text="Those tiles show a placeholder until a picture is uploaded." />
        </div>
      )}

      {/* tag list */}
      <div className="p-3.5">
        {tags.length === 0 ? (
          <div className="text-center py-10">
            <span className="w-[42px] h-[42px] rounded-[13px] grid place-items-center mx-auto mb-2.5" style={{ background: theme.bg, color: theme.c }}>
              <Icon name="tag" size={19} />
            </span>
            <div className="text-[13.5px] text-body-soft">Nothing in this group yet</div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {tags.map((t, i) => {
              const editing = editingId === t.id;
              return (
                <div key={t.id}
                  className={"group/tag grid items-center gap-2.5 rounded-[12px] border px-2.5 py-2 transition-colors " + (isCard ? "grid-cols-[auto_1fr_auto]" : "grid-cols-[1fr_auto]")}
                  style={t.isActive
                    ? { background: "#fff", borderColor: "var(--color-lavender-deep)" }
                    : { background: "#fbf7fc", borderColor: "#ead9f2", opacity: 0.75 }}>
                  {isCard && (
                    <div className="relative shrink-0">
                      <button onClick={() => onPickImage(t)} disabled={uploadingId === t.id} className="w-[48px] h-[48px] rounded-[10px] relative overflow-hidden group border border-lavender-deep block" style={tileBg(t)} title={t.img ? "Click to replace image" : "Click to upload an image"}>
                        {uploadingId === t.id && (
                          <span className="absolute inset-0 bg-purple/80 text-white text-[9px] grid place-items-center">saving…</span>
                        )}
                        <span className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/30 text-white opacity-0 group-hover:opacity-100 transition"><Icon name="upload" size={15} /></span>
                        {!t.img && <span className="absolute bottom-0.5 right-0.5 w-[16px] h-[16px] rounded-full bg-white/90 grid place-items-center text-purple"><Icon name="plus" size={10} /></span>}
                      </button>
                      {t.img && (
                        <button onClick={() => onClearImage(t)} className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-white border border-lavender-deep grid place-items-center text-[#b42318] shadow-sm" title="Remove image">
                          <Icon name="plus" size={11} className="rotate-45" />
                        </button>
                      )}
                    </div>
                  )}

                  <div className="min-w-0">
                    {editing ? (
                      <input autoFocus className="ipt" style={{ minHeight: 34, maxWidth: 300 }} value={editingName} onChange={(e) => onEditName(e.target.value)} onBlur={onCommitEdit} onKeyDown={(e) => { if (e.key === "Enter") onCommitEdit(); if (e.key === "Escape") onCancelEdit(); }} />
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => onStartEdit(t.id, t.name)} className="font-medium text-[14px] text-purple truncate hover:text-orchid text-left" title="Rename">{t.name}</button>
                        {/*  Just the number. "0 products" on every row of a new
                             shop was a wall of orange saying nothing useful.  */}
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums"
                          style={t.products === 0 ? { background: "#f4eef8", color: "#8a7c94" } : { background: theme.bg, color: theme.c }}
                          title={`${t.products} product${t.products === 1 ? "" : "s"} carry this tag`}>
                          {t.products}
                        </span>
                        {!t.isActive && <span className="shrink-0 text-[#b45309]" title="Hidden from the storefront"><Icon name="eye" size={12} /></span>}
                      </div>
                    )}
                  </div>

                  {!editing && (
                    <div className="flex items-center gap-1 shrink-0">
                      {/*  Reorder, rename and delete stay out of sight until the
                           cursor is on the row. On a group of twenty tags, sixty
                           permanent little buttons is all anyone could see. The
                           switch stays — it shows STATE, not an action.  */}
                      <div className="flex items-center gap-1 opacity-0 group-hover/tag:opacity-100 focus-within:opacity-100 transition-opacity">
                        <div className="flex flex-col">
                          <button onClick={() => onMoveTag(t, "up")} disabled={i === 0} className="text-body-soft hover:text-purple disabled:opacity-25 leading-none" title="Move up"><span className="rotate-180 inline-block"><Icon name="chevronDown" size={13} /></span></button>
                          <button onClick={() => onMoveTag(t, "down")} disabled={i === tags.length - 1} className="text-body-soft hover:text-purple disabled:opacity-25 leading-none" title="Move down"><Icon name="chevronDown" size={13} /></button>
                        </div>
                        <button onClick={() => onStartEdit(t.id, t.name)} className="w-[28px] h-[28px] rounded-[8px] grid place-items-center text-purple hover:bg-lavender" title="Rename"><Icon name="edit" size={14} /></button>
                        <button onClick={() => onRemoveTag(t)} className="w-[28px] h-[28px] rounded-[8px] grid place-items-center text-[#b42318] hover:bg-[#fbecec]" title="Delete"><Icon name="trash" size={14} /></button>
                      </div>
                      <Switch on={t.isActive} onClick={() => onToggleTag(t)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* add tag */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-2 mt-3 pt-3 border-t border-lavender-deep">
          <input className="ipt" style={{ minHeight: 38 }} placeholder={`Add to ${g.name}…`} value={draft} onChange={(e) => onDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onAddTag(); }} />
          <button onClick={onAddTag} disabled={!draft.trim()} className="text-white h-[38px] w-[38px] rounded-[10px] grid place-items-center disabled:opacity-40 shrink-0" style={{ background: theme.c }} title="Add tag"><Icon name="plus" size={16} /></button>
        </div>
      </div>

      {/* storefront preview */}
      <div className="border-t border-lavender-deep px-5 py-4" style={{ background: "linear-gradient(180deg,#faf6fd,#f4ecfa)" }}>
        <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.06em] uppercase text-purple/70 mb-2.5">
          <Icon name="eye" size={13} /> On the site
        </div>
        <Preview group={g} theme={theme} tags={tags.filter((t) => t.isActive)} />
      </div>
    </div>
  );
}

function Preview({ group, theme, tags }: { group: Group; theme: GroupTheme; tags: Tag[] }) {
  if (!group.isActive) return <div className="text-[13px] text-body-soft">This group is hidden — it won’t appear on the storefront.</div>;
  if (!tags.length) return <div className="text-[13px] text-body-soft">No visible tags to show.</div>;
  if (group.displayStyle === "CARD") {
    /*  A FIXED tile width, not a fraction of the pane. With `grid-cols-4` two
        tags filled half the screen with two enormous pictures — nothing like
        what the shopper sees. The storefront tile is small; the preview has to
        be small, or it is not a preview.  */
    return (
      <div className="flex flex-wrap gap-2.5">
        {tags.slice(0, 8).map((t) => (
          <div key={t.id} className="text-center w-[92px]">
            <div className="rounded-t-[34px] rounded-b-[12px] shadow-soft" style={{ ...tileBg(t), aspectRatio: "4 / 4.6" }} />
            <div className="text-[11.5px] font-medium text-purple mt-1.5 truncate">{t.name}</div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span key={t.id} className="text-[12.5px] font-medium px-3 py-1.5 rounded-full border" style={{ background: theme.bg, color: theme.c, borderColor: theme.bg }}>{t.name}</span>
      ))}
    </div>
  );
}

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  const w = 34, h = 20, k = 14;
  return (
    <button onClick={onClick} className={"relative rounded-full transition-colors shrink-0 " + (on ? "bg-orchid" : "bg-lavender-deep")} style={{ width: w, height: h }} title={on ? "Visible to customers" : "Hidden from customers"}>
      <span className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all" style={{ width: k, height: k, left: on ? w - k - 3 : 3 }} />
    </button>
  );
}
