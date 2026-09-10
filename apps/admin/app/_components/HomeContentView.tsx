"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import {
  loadHomeContent,
  toggleHomeItem,
  reorderHomeItems,
  setHomeItemZone,
  type ApiHomeGroup,
  type ApiHomeItem,
  type HomeContentKind,
} from "../_data/api";

/*
  ═══════════════════════════════════════════════════════════════════════════
  WHAT IS INSIDE EACH HOMEPAGE SECTION.

  The owner, 3 Aug 2026: he could turn a section ON and OFF and move it, but
  not decide what went in it. Which categories are on the rail, which occasion
  tabs exist and which cards sit behind each one, which delivery speeds get a
  card. Three sections, and for all three the answer was "somebody edits the
  code, or you dig through a different screen and change something that also
  changes elsewhere".

  ONE SCREEN, LAID OUT LIKE THE PAGE ITSELF. Sections in the order they appear
  on the homepage, each one showing its own contents. That ordering is not
  decoration: he navigates by what he sees on the website, so the screen has to
  be readable against the website with both open.

  THREE THINGS THIS SCREEN REFUSES TO DO, each for a reason learnt the hard way:

   1. It never hides an unticked item. Unticked rows stay in the list, greyed.
      A list that only shows what is on the homepage cannot be used to put
      something back.
   2. It never silently swaps two positions. Every arrow sends the WHOLE list
      and the server renumbers it. Rows arriving from seeds routinely shared a
      sortOrder, and swapping two equal numbers moves nothing — which reads as
      a broken button. That already happened once here.
   3. It never lets a tick look successful before the server agrees. The row
      shows its new state at once (waiting on a round trip for a tick feels
      broken), but a failure puts it back and says so, rather than leaving a
      tick that means nothing.
  ═══════════════════════════════════════════════════════════════════════════
*/

/** which table each section writes to — the server checks this too */
const KIND: Record<string, HomeContentKind> = {
  categories: "category",
  occasions: "taggroup",
  delivery: "delivery",
};

export default function HomeContentView() {
  const [groups, setGroups] = useState<ApiHomeGroup[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadHomeContent()
      .then((g) => { if (alive) setGroups(g); })
      .catch(() => { if (alive) setErr("Could not reach the API. Is it running?"); });
    return () => { alive = false; };
  }, []);

  /** replace one item wherever it sits — top level or inside a tab */
  function patchLocal(id: string, patch: Partial<ApiHomeItem>) {
    setGroups((gs) =>
      gs?.map((g) => ({
        ...g,
        items: g.items.map((it) =>
          it.id === id
            ? { ...it, ...patch }
            : it.children
              ? { ...it, children: it.children.map((c) => (c.id === id ? { ...c, ...patch } : c)) }
              : it,
        ),
      })) ?? null,
    );
  }

  async function tick(kind: HomeContentKind, item: ApiHomeItem) {
    const next = !item.shown;
    patchLocal(item.id, { shown: next });
    setErr("");
    try {
      await toggleHomeItem(kind, item.id, next);
    } catch (e) {
      patchLocal(item.id, { shown: item.shown }); // put it back — see note 3 above
      setErr(e instanceof Error ? e.message : "Could not save that change.");
    }
  }

  /*  6 Aug 2026 — owner: "if I turn these all on they show in BOTH zones,
      right? can we set them zone-wise?" He was right that the tick was one
      flag for both zones. Same optimistic-update-then-revert shape as tick(),
      for the same reason (note 3 above).  */
  async function setZone(kind: HomeContentKind, item: ApiHomeItem, zone: string | null) {
    const prev = item.zone ?? null;
    patchLocal(item.id, { zone });
    setErr("");
    try {
      await setHomeItemZone(kind, item.id, zone);
    } catch (e) {
      patchLocal(item.id, { zone: prev });
      setErr(e instanceof Error ? e.message : "Could not save that change.");
    }
  }

  /**
   * Move one row up or down.
   *
   * ⚠️ `list` must be the FULL list this row belongs to, unfiltered — including
   * the greyed-out rows. Reordering a filtered view writes positions computed
   * from a list the database has never seen.
   */
  async function move(kind: HomeContentKind, list: ApiHomeItem[], index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    [next[index], next[to]] = [next[to], next[index]];

    // renumber locally to match what the server is about to do, so the arrows
    // stay correct if he presses twice quickly
    const renumbered = next.map((it, i) => ({ ...it, sortOrder: i }));
    setGroups((gs) =>
      gs?.map((g) => {
        if (g.items === list) return { ...g, items: renumbered };
        return {
          ...g,
          items: g.items.map((it) => (it.children === list ? { ...it, children: renumbered } : it)),
        };
      }) ?? null,
    );

    setBusy(kind + index);
    setErr("");
    try {
      await reorderHomeItems(kind, next.map((it) => it.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the new order.");
    } finally {
      setBusy(null);
    }
  }

  if (err && !groups) return <Note tone="bad">{err}</Note>;
  if (!groups) return <Note>Loading…</Note>;

  return (
    <div className="space-y-5">
      {err && <Note tone="bad">{err}</Note>}

      {groups.map((g) => {
        const kind = KIND[g.key];
        const on = g.items.filter((i) => i.shown && i.live).length;
        return (
          <section key={g.key} className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
            <header
              className="px-5 py-4 border-b border-lavender-deep"
              style={{ background: "linear-gradient(120deg,#2b1b34 0%,#2d1c36 60%,#37191f 100%)" }}
            >
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h3 className="font-display text-[18px] text-purple m-0 leading-tight">{g.title}</h3>
                <span className="text-[11.5px] font-semibold text-orchid bg-orchid-soft rounded-full px-2.5 py-0.5">
                  {on} on the homepage
                </span>
              </div>
              <p className="text-[12.5px] text-body-soft m-0 mt-1">{g.hint}</p>
              {g.warning && (
                <p className="text-[12px] text-[#edbe78] bg-[#3c3017] border border-[#524528] rounded-[9px] px-3 py-1.5 m-0 mt-2.5">
                  {g.warning}
                </p>
              )}
            </header>

            <div className="p-3">
              {g.items.length === 0 && (
                <p className="text-[13px] text-body-soft text-center py-6 m-0">Nothing here yet.</p>
              )}
              {g.items.map((item, i) => (
                <div key={item.id}>
                  <Row
                    item={item}
                    index={i}
                    total={g.items.length}
                    busy={busy === kind + i}
                    onTick={() => tick(kind, item)}
                    onMove={(d) => move(kind, g.items, i, d)}
                    onZone={kind === "category" ? (z) => setZone(kind, item, z) : undefined}
                    expandable={!!item.children}
                    expanded={!!open[item.id]}
                    onExpand={() => setOpen((o) => ({ ...o, [item.id]: !o[item.id] }))}
                  />

                  {/* the cards behind a tab */}
                  {item.children && open[item.id] && (
                    <div className="ml-[46px] mr-1 mb-3 pl-3 border-l-2 border-lavender-deep">
                      {item.children.length === 0 ? (
                        <p className="text-[13px] text-body-soft py-3 m-0">
                          This tab has no cards yet. Add them under Master Data → Tags.
                        </p>
                      ) : (
                        item.children.map((c, ci) => (
                          <Row
                            key={c.id}
                            item={c}
                            index={ci}
                            total={item.children!.length}
                            small
                            busy={busy === "tag" + ci}
                            onTick={() => tick("tag", c)}
                            onMove={(d) => move("tag", item.children!, ci, d)}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ one row */

function Row({
  item, index, total, small, busy, onTick, onMove, onZone, expandable, expanded, onExpand,
}: {
  item: ApiHomeItem;
  index: number;
  total: number;
  small?: boolean;
  busy?: boolean;
  onTick: () => void;
  onMove: (dir: -1 | 1) => void;
  /** present only on rows that carry a homepage zone (categories) */
  onZone?: (zone: string | null) => void;
  expandable?: boolean;
  expanded?: boolean;
  onExpand?: () => void;
}) {
  /* An item switched off elsewhere cannot be rescued by a tick here, and
     pretending otherwise is the cruellest kind of dead control — it looks like
     it worked and the homepage never changes. Say so on the row. */
  const dead = !item.live;
  const size = small ? 34 : 44;

  return (
    <div
      className={
        "flex items-center gap-3 rounded-[12px] px-3 py-2.5 mb-1.5 border transition-colors " +
        (item.shown && !dead
          ? "border-lavender-deep bg-white"
          : "border-lavender-deep/50 bg-lavender/20")
      }
    >
      <button
        type="button"
        onClick={onTick}
        disabled={dead}
        title={dead ? "Switched off — turn it back on first" : item.shown ? "On the homepage — click to remove" : "Click to put it on the homepage"}
        className={
          "relative rounded-full shrink-0 transition-colors " +
          (dead ? "bg-lavender-deep cursor-not-allowed opacity-50" : item.shown ? "bg-orchid" : "bg-lavender-deep")
        }
        style={{ width: 38, height: 22 }}
      >
        <span
          className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all"
          style={{ width: 16, height: 16, left: item.shown && !dead ? 19 : 3 }}
        />
      </button>

      <div
        className="rounded-[9px] shrink-0 bg-cover bg-center border border-lavender-deep grid place-items-center text-[11px] font-bold text-orchid"
        style={{
          width: size,
          height: size,
          backgroundImage: item.imageUrl ? `url(${item.imageUrl})` : undefined,
          background: item.imageUrl ? undefined : "#2c1e34",
          opacity: item.shown && !dead ? 1 : 0.5,
        }}
      >
        {!item.imageUrl && (item.name[0]?.toUpperCase() ?? "?")}
      </div>

      <div className="min-w-0 flex-1">
        <div className={"truncate text-purple " + (small ? "text-[13.5px]" : "text-[14.5px] font-medium")}>
          {item.name}
        </div>
        <div className="text-[12px] text-body-soft truncate">
          {dead ? "Switched off — it will not appear anywhere" : item.note || "—"}
        </div>
      </div>

      {onZone && (
        <select
          value={item.zone ?? ""}
          disabled={dead}
          onChange={(e) => onZone(e.target.value || null)}
          title="Which zone's homepage shows this card"
          className="shrink-0 text-[12.5px] border border-lavender-deep rounded-[9px] px-2 py-1.5 bg-white text-purple outline-none focus:border-orchid disabled:opacity-50"
        >
          <option value="">Every zone</option>
          <option value="DHAKA">Dhaka only</option>
          <option value="NATIONWIDE">All Bangladesh only</option>
        </select>
      )}

      {expandable && (
        <button
          type="button"
          onClick={onExpand}
          className="text-[12.5px] text-orchid hover:underline shrink-0 px-2"
        >
          {expanded ? "Hide cards" : "Cards"}
        </button>
      )}

      <div className="flex items-center gap-1 shrink-0">
        <Arrow dir="up" disabled={index === 0 || busy} onClick={() => onMove(-1)} />
        <Arrow dir="down" disabled={index === total - 1 || busy} onClick={() => onMove(1)} />
      </div>
    </div>
  );
}

function Arrow({ dir, disabled, onClick }: { dir: "up" | "down"; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={dir === "up" ? "Move earlier" : "Move later"}
      className={
        "w-[28px] h-[28px] rounded-[8px] grid place-items-center border transition-colors " +
        (disabled
          ? "border-lavender-deep/40 text-body-soft/40 cursor-not-allowed"
          : "border-lavender-deep text-purple hover:border-orchid hover:text-orchid")
      }
    >
      <Icon name={dir === "up" ? "chevronUp" : "chevronDown"} size={14} />
    </button>
  );
}

function Note({ children, tone }: { children: React.ReactNode; tone?: "bad" }) {
  return (
    <p
      className={
        "text-[13px] rounded-[11px] px-4 py-3 m-0 " +
        (tone === "bad"
          ? "text-[#ed8078] bg-[#381b18] border border-[#502f2a]"
          : "text-body-soft")
      }
    >
      {children}
    </p>
  );
}
