"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import Icon from "./Icon";
import {
  createCapacityGroup,
  deleteCapacityGroup,
  getCapacityBoard,
  listCapacityGroups,
  listCategories,
  setCapacityCategories,
  updateCapacityGroup,
  type ApiCapacityGroup,
  type ApiCategory,
  type CapacityBoardRow,
} from "../_data/api";

/*
  ═══════════════════════════════════════════════════════════════════════════
  Daily capacity — "how much more can we make today?"

  Owner's decisions, 1 Aug 2026, and the screen is shaped by the last one:

   · MEASURED IN TIME. He tried counts first — "50 quick jobs, 20 medium, 10
     long" — and found the flaw himself: the bands cannot lend to each other.
     A day of small orders fills the small band while the workshop sits idle,
     and a day of large ones fits inside three separate limits while adding up
     to more hours than exist.

   · THE DAY IS `workers × hoursEach`. His objection to everything else was
     "five makers today, three tomorrow — I cannot teach that to a system".
     Here he edits one number. That is the whole design.

  The board shows TODAY first because that is the question actually being
  asked. Editing the teams is underneath, where it is needed once a week
  rather than once an hour.
  ═══════════════════════════════════════════════════════════════════════════
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

const hhmm = (mins: number) => {
  const neg = mins < 0;
  const a = Math.abs(mins);
  const h = Math.floor(a / 60);
  const m = a % 60;
  const s = h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
  return neg ? `−${s}` : s;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function CapacityView() {
  const [date, setDate] = useState(todayStr());
  const [board, setBoard] = useState<CapacityBoardRow[] | null>(null);
  const [groups, setGroups] = useState<ApiCapacityGroup[]>([]);
  const [cats, setCats] = useState<ApiCategory[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const reload = useCallback(async () => {
    try {
      const [b, g] = await Promise.all([getCapacityBoard(date), listCapacityGroups()]);
      setBoard(b.groups);
      setGroups(g);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load");
      setBoard([]);
    }
  }, [date]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    /*  Top-level only. A sub-category takes its parent's team, so listing all
        forty-four here would be forty-four chances to disagree with the parent. */
    listCategories()
      .then((all) => setCats(all.filter((c) => !c.parentId)))
      .catch(() => {});
  }, []);

  async function addTeam() {
    const n = newName.trim();
    if (!n) return;
    setNewName("");
    try {
      await createCapacityGroup({ name: n, workers: 1, hoursEach: 8 });
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add");
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...body } : g)));
    try {
      await updateCapacityGroup(id, body);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function toggleCategory(g: ApiCapacityGroup, catId: string) {
    const have = (g.categories ?? []).map((c) => c.id);
    const next = have.includes(catId) ? have.filter((x) => x !== catId) : [...have, catId];
    try {
      await setCapacityCategories(g.id, next);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    }
  }

  const isToday = date === todayStr();

  return (
    <div className={WRAP}>
      <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-orchid mb-1.5">
        Product management · Capacity
      </div>
      <h1 className="font-display text-[30px] text-purple leading-tight m-0 mb-7">
        What we can make in a day
      </h1>

      {err && (
        <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-5 text-[13.5px]">
          {err}
        </div>
      )}

      {/* ── the day ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h2 className="font-display text-[19px] text-purple m-0">
          {isToday ? "Today" : "That day"}
        </h2>
        <input
          type="date"
          className="ipt h-[40px] w-[180px]"
          value={date}
          onChange={(e) => setDate(e.target.value || todayStr())}
        />
        {!isToday && (
          <button
            type="button"
            onClick={() => setDate(todayStr())}
            className="text-[13px] text-body-soft hover:text-purple"
          >
            back to today
          </button>
        )}
      </div>

      {board === null ? (
        <div className="text-[13.5px] text-body-soft mb-10">Loading…</div>
      ) : board.length === 0 ? (
        <div className="border border-dashed border-lavender-deep rounded-[16px] bg-white px-6 py-8 text-center mb-10">
          <div className="font-display text-[18px] text-purple">No teams yet</div>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 mb-10">
          {board.map((r) => {
            const pct =
              r.totalMinutes > 0
                ? Math.min(100, Math.round((r.usedMinutes / r.totalMinutes) * 100))
                : 0;
            const over = r.freeMinutes < 0;
            /*  tight = under a fifth left. Not "nearly full" as a feeling —
                a number, so two people reading the board agree.  */
            const tight = !over && r.totalMinutes > 0 && r.freeMinutes <= r.totalMinutes * 0.2;
            return (
              <div
                key={r.id}
                className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-display text-[17px] text-purple">{r.name}</div>
                  <div className="text-[12.5px] text-body-soft">
                    {r.workers} × {r.hoursEach}h
                  </div>
                </div>

                <div
                  className={
                    "font-display text-[30px] font-medium mt-3 leading-none " +
                    (over ? "text-[#c0392b]" : tight ? "text-[#b45309]" : "text-[#12693f]")
                  }
                >
                  {r.freeLabel}
                </div>
                <div className="text-[12.5px] text-body-soft mt-1">
                  {over ? "over capacity" : "still free"} · {hhmm(r.usedMinutes)} of{" "}
                  {hhmm(r.totalMinutes)} used
                </div>

                <div className="h-[7px] rounded-full bg-lavender mt-3.5 overflow-hidden">
                  <div
                    className={
                      "h-full rounded-full " +
                      (over ? "bg-[#c0392b]" : tight ? "bg-[#e29a34]" : "bg-[#37a97c]")
                    }
                    style={{ width: `${over ? 100 : pct}%` }}
                  />
                </div>

                <div className="text-[12.5px] text-body-soft mt-3">
                  {r.categories.length === 0 ? (
                    <span className="text-[#b45309]">
                      No categories — nothing draws on this team yet
                    </span>
                  ) : (
                    r.categories.map((c) => c.name).join(" · ")
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── the teams ───────────────────────────────────────────────────── */}
      <h2 className="font-display text-[19px] text-purple m-0 mb-1">Teams</h2>
      <div className="flex flex-col gap-3 mb-5">
        {groups.map((g) => (
          <div
            key={g.id}
            className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-5"
          >
            <div className="flex items-center gap-3 flex-wrap">
              <input
                className="ipt h-[44px] flex-1 min-w-[200px] font-medium"
                value={g.name}
                onChange={(e) =>
                  setGroups((gs) =>
                    gs.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)),
                  )
                }
                onBlur={(e) => void patch(g.id, { name: e.target.value })}
              />

              <div className="flex items-center gap-2">
                <input
                  className="ipt h-[44px] w-[76px] text-center text-[16px] font-medium"
                  type="number"
                  min={0}
                  value={g.workers}
                  onChange={(e) =>
                    setGroups((gs) =>
                      gs.map((x) =>
                        x.id === g.id ? { ...x, workers: Number(e.target.value) || 0 } : x,
                      ),
                    )
                  }
                  onBlur={(e) => void patch(g.id, { workers: Number(e.target.value) || 0 })}
                />
                <span className="text-[13px] text-body-soft">people ×</span>
                <input
                  className="ipt h-[44px] w-[76px] text-center text-[16px] font-medium"
                  type="number"
                  min={0}
                  value={g.hoursEach}
                  onChange={(e) =>
                    setGroups((gs) =>
                      gs.map((x) =>
                        x.id === g.id ? { ...x, hoursEach: Number(e.target.value) || 0 } : x,
                      ),
                    )
                  }
                  onBlur={(e) => void patch(g.id, { hoursEach: Number(e.target.value) || 0 })}
                />
                <span className="text-[13px] text-body-soft">hours</span>
                <span className="text-[13px] text-purple font-medium ml-1">
                  = {g.workers * g.hoursEach}h a day
                </span>
              </div>

              <button
                type="button"
                title="Remove this team"
                onClick={() => void deleteCapacityGroup(g.id).then(reload)}
                className="ml-auto w-[38px] h-[38px] rounded-[10px] grid place-items-center border border-lavender-deep bg-white text-body-soft hover:text-[#c0392b] hover:border-[#c0392b] transition-colors"
              >
                <Icon name="trash" size={16} />
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-lavender-deep">
              <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-body-soft mb-2">
                Makes these categories
              </div>
              {/*  Top-level only. A sub-category takes its parent's team, so
                  offering all forty-four here would be forty-four chances to
                  disagree with the parent.  */}
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => {
                  const on = (g.categories ?? []).some((x) => x.id === c.id);
                  const elsewhere =
                    !on && groups.some((o) => o.id !== g.id && (o.categories ?? []).some((x) => x.id === c.id));
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={elsewhere}
                      title={
                        elsewhere
                          ? "Already made by another team"
                          : undefined
                      }
                      onClick={() => void toggleCategory(g, c.id)}
                      className={
                        "text-[13px] px-3 py-1.5 rounded-full border transition-colors " +
                        (on
                          ? "bg-purple border-purple text-white"
                          : elsewhere
                            ? "bg-white border-lavender-deep text-body-soft/40 cursor-not-allowed"
                            : "bg-white border-lavender-deep text-body hover:border-orchid")
                      }
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input
          className="ipt h-[46px] w-[280px]"
          placeholder="New team — “Florists”, “Bakers”…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void addTeam()}
        />
        <button
          type="button"
          onClick={() => void addTeam()}
          disabled={!newName.trim()}
          className="inline-flex items-center gap-2 text-[14px] font-medium text-white bg-purple hover:bg-purple-deep disabled:opacity-50 rounded-[12px] px-5 py-3 shadow-soft transition-colors"
        >
          <Icon name="plus" size={16} /> Add team
        </button>
      </div>

      <p className="text-[13px] text-body-soft mt-8 mb-0">
        <Link href="/products/list" className="text-orchid font-medium hover:underline">
          Open products
        </Link>
      </p>
    </div>
  );
}
