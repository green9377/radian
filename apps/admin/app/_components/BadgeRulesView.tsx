"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";
import { Info } from "./ItemEditor";
import {
  getBadgeRules, saveBadgeRules, recomputeBadges,
  type ApiBadgeRules, type ApiBadgeRow,
} from "../_data/api";

/*
  Products · Badge rules — DEC-PRD-050.

  ⚠️ WHY THIS SCREEN EXISTS AT ALL. Until 24 August 2026 "Best seller" and
  "New arrival" were two checkboxes on the product form. That makes the shop's
  own claim only as true as the last person who remembered to untick it, and
  "Best seller" on a bouquet nobody has bought is the same offence as an
  invented review with a number on it.

  Now the numbers decide, and this is where the owner sets the numbers.

  THE ONE THING TO NOT UNDO. There is no maximum. Shown a "top 10, capped at
  12", the owner refused the cap outright: he does not accept a number that
  locks at twelve, and whatever the percentage works out to is what gets the
  badge. So the percentage is the rule, and a 500-product category on 10%
  badges 50 products. Whoever adds a ceiling back should read this first.

  The table underneath is the point of the screen, not decoration: it answers
  "10% of 500 — then what actually happens?" by showing it, category by
  category, before anything is saved.
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

/*  Brand family only — deep purple, orchid, rose gold, soft purple (house
    rule 17). Never a rainbow.  */
const P = { c: "#470066", edge: "#6d3a9c", bg: "#f3ebf8" };
const O = { c: "#8b3fb0", edge: "#cf43ea", bg: "#f7eafc" };
const R = { c: "#a4566a", edge: "#c9788a", bg: "#fbeef0" };
const S = { c: "#5c3b8a", edge: "#8b6fc4", bg: "#efebf9" };

/** One number the owner types. Bold label, real field — house rule 16. */
function RuleField({
  label, tip, value, onChange, suffix, min, max,
}: {
  label: string;
  tip: string;
  value: number;
  onChange: (n: number) => void;
  suffix: string;
  min: number;
  max: number;
}) {
  return (
    <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-4 py-3.5">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="text-[13px] font-bold text-purple">{label}</span>
        <Info text={tip} />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          className="ipt tabular-nums font-semibold text-[17px]"
          style={{ minHeight: 42, maxWidth: 110 }}
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="text-[13px] font-semibold text-body-soft">{suffix}</span>
      </div>
    </div>
  );
}

export default function BadgeRulesView() {
  const [rules, setRules] = useState<ApiBadgeRules | null>(null);
  const [rows, setRows] = useState<ApiBadgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBadgeRules();
      setRules(res.rules);
      setRows(res.rows);
      setErr(null);
    } catch {
      setErr("Could not reach the server. Nothing here has been changed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (patch: Partial<ApiBadgeRules>) =>
    setRules((r) => (r ? { ...r, ...patch } : r));

  async function save() {
    if (!rules) return;
    setBusy(true);
    try {
      await saveBadgeRules({
        bestSellerDays: rules.bestSellerDays,
        bestSellerPercent: rules.bestSellerPercent,
        bestSellerMinCount: rules.bestSellerMinCount,
        bestSellerMinSales: rules.bestSellerMinSales,
        newArrivalDays: rules.newArrivalDays,
      });
      /*  The save re-ranks on the server, so the table under it has to be
          re-read — otherwise the owner changes 10% to 20% and the numbers
          below still describe the old rule.  */
      await load();
      setFlash("Saved and re-ranked");
      setTimeout(() => setFlash(null), 2400);
    } catch {
      setErr("Save failed. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  async function rerun() {
    setBusy(true);
    try {
      await recomputeBadges();
      await load();
      setFlash("Re-ranked");
      setTimeout(() => setFlash(null), 2400);
    } catch {
      setErr("Could not re-rank just now.");
    } finally {
      setBusy(false);
    }
  }

  const totals = rows.reduce(
    (a, r) => ({
      products: a.products + r.products,
      earned: a.earned + r.earned,
      pinned: a.pinned + r.pinned,
      blocked: a.blocked + r.blocked,
    }),
    { products: 0, earned: 0, pinned: 0, blocked: 0 },
  );

  return (
    <div className={WRAP}>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display text-[26px] text-purple leading-tight">Badge rules</h1>
          {/*  House rule 17 — no explaining paragraph on the screen. What the
               page is for lives behind the ⓘ on each field.  */}
        </div>
        <div className="flex items-center gap-2.5">
          {flash && (
            <span className="text-[12.5px] font-semibold text-[#0E7A3D]">{flash}</span>
          )}
          <button
            type="button"
            onClick={rerun}
            disabled={busy || loading}
            className="inline-flex items-center gap-2 rounded-full border border-lavender-deep bg-white px-4 py-2.5 text-[13px] font-bold text-purple disabled:opacity-50"
          >
            <Icon name="bolt" size={15} /> Re-rank now
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || loading || !rules}
            className="inline-flex items-center gap-2 rounded-full bg-purple px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            <Icon name="check" size={15} /> Save rules
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-5 rounded-[14px] border border-[#f0c8c8] bg-[#fdf1f1] px-4 py-3 text-[13px] text-[#8a2b2b]">
          {err}
        </div>
      )}

      {loading || !rules ? (
        <div className="text-[13px] text-body-soft">Loading…</div>
      ) : (
        <>
          {/* ── Best seller ───────────────────────────────────────────────── */}
          <div className="flex items-center gap-2.5 mb-3">
            <span
              className="w-[30px] h-[30px] rounded-[10px] grid place-items-center text-white"
              style={{ background: R.edge, boxShadow: `0 3px 9px ${R.edge}45` }}
            >
              <Icon name="star" size={15} />
            </span>
            <h2 className="font-display text-[17px] text-purple">Best seller</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-7">
            <RuleField
              label="Top slice"
              suffix="% of the category"
              min={1}
              max={50}
              value={rules.bestSellerPercent}
              onChange={(n) => set({ bestSellerPercent: n })}
              tip="How much of a category may carry the badge. There is no upper limit on the COUNT — the percentage decides it. A category with 500 products at 10% badges 50 of them; at 20%, a hundred. The scope is the top-level category, not a sub-category: shop-wide every badge would land on fresh flowers, and by sub-category a shelf of four products would badge all four."
            />
            <RuleField
              label="Counted over"
              suffix="days of sales"
              min={7}
              max={730}
              value={rules.bestSellerDays}
              onChange={(n) => set({ bestSellerDays: n })}
              tip="How far back real, delivered sales are counted. 90 days rather than lifetime, so last Eid does not hold the badge all year and a better bouquet can climb past it. Only real orders count — the sales figures typed on the product page to reassure a shopper are display numbers and are deliberately ignored here."
            />
            <RuleField
              label="At least"
              suffix="badges per category"
              min={0}
              max={50}
              value={rules.bestSellerMinCount}
              onChange={(n) => set({ bestSellerMinCount: n })}
              tip="The floor, so a small category is not left with nothing: 10% of twelve products is one, and one is a fluke rather than a shelf. It only ever tops the list up out of products that qualify — it never invents a badge for something that has not sold, and it never trims a big category down."
            />
            <RuleField
              label="Needs at least"
              suffix="real sales"
              min={1}
              max={100}
              value={rules.bestSellerMinSales}
              onChange={(n) => set({ bestSellerMinSales: n })}
              tip="How many delivered units a product needs before it is eligible at all. Without it, the top of a quiet category is whoever happened to sell twice."
            />
          </div>

          {/* ── New arrival ───────────────────────────────────────────────── */}
          <div className="flex items-center gap-2.5 mb-3">
            <span
              className="w-[30px] h-[30px] rounded-[10px] grid place-items-center text-white"
              style={{ background: O.edge, boxShadow: `0 3px 9px ${O.edge}45` }}
            >
              <Icon name="sparkle" size={15} />
            </span>
            <h2 className="font-display text-[17px] text-purple">New arrival</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-8">
            <RuleField
              label="New for"
              suffix="days"
              min={1}
              max={180}
              value={rules.newArrivalDays}
              onChange={(n) => set({ newArrivalDays: n })}
              tip="Counted from the day the product went LIVE, not the day the draft was started — a bouquet drafted in March and published in August is new in August. Editing a live product does not make it new again."
            />
          </div>

          {/* ── What that works out to ────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div className="flex items-center gap-2.5">
              <span
                className="w-[30px] h-[30px] rounded-[10px] grid place-items-center text-white"
                style={{ background: P.edge, boxShadow: `0 3px 9px ${P.edge}45` }}
              >
                <Icon name="layers" size={15} />
              </span>
              <h2 className="font-display text-[17px] text-purple">What that works out to</h2>
              <Info text="Category by category, with today's sales: how many products it holds, how many the percentage asks for, and how many can actually be filled. Saved rules are already applied; change a number above and press Save to see this move." />
            </div>
            {rules.lastComputedAt && (
              <span className="text-[12px] text-body-soft">
                Last ranked {new Date(rules.lastComputedAt).toLocaleString("en-GB")}
              </span>
            )}
          </div>

          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr
                    className="text-left"
                    style={{ background: `linear-gradient(135deg,${P.bg},#ffffff)` }}
                  >
                    <th className="px-4 py-3 font-bold text-purple">Category</th>
                    <th className="px-3 py-3 font-bold text-purple text-right">Products</th>
                    <th className="px-3 py-3 font-bold text-purple text-right">
                      <span className="inline-flex items-center gap-1.5">
                        Rule asks for
                        <Info text="The percentage applied to this category, or the floor — whichever is larger." />
                      </span>
                    </th>
                    <th className="px-3 py-3 font-bold text-purple text-right">
                      <span className="inline-flex items-center gap-1.5">
                        Badged today
                        <Info text="How many the shop can actually fill. Lower than what the rule asks for whenever fewer products have reached the minimum number of real sales — a badge is never handed to something that has not sold." />
                      </span>
                    </th>
                    <th className="px-3 py-3 font-bold text-purple text-right">
                      <span className="inline-flex items-center gap-1.5">
                        By hand
                        <Info text="Products where the badge was forced on or off on the product itself — Always or Never instead of Auto. Those override the rule." />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-body-soft">
                        No published products yet.
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-lavender-deep/50">
                      <td className="px-4 py-3 font-semibold text-purple">{r.name}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-body-soft">{r.products}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-body-soft">{r.target}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold" style={{ color: R.c }}>
                        {r.earned}
                        {/*  The honest gap, said out loud rather than hidden:
                             the rule wanted more than the shop has sold.  */}
                        {r.earned < r.target && (
                          <span className="ml-1.5 text-[11px] font-semibold text-body-soft">
                            of {r.target}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-body-soft">
                        {r.pinned > 0 && (
                          <span className="font-semibold" style={{ color: O.c }}>+{r.pinned}</span>
                        )}
                        {r.pinned > 0 && r.blocked > 0 && <span className="mx-1">·</span>}
                        {r.blocked > 0 && (
                          <span className="font-semibold" style={{ color: S.c }}>−{r.blocked}</span>
                        )}
                        {r.pinned === 0 && r.blocked === 0 && "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-lavender-deep">
                      <td className="px-4 py-3 font-bold text-purple">All categories</td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-purple">{totals.products}</td>
                      <td className="px-3 py-3" />
                      <td className="px-3 py-3 text-right tabular-nums font-bold" style={{ color: R.c }}>
                        {totals.earned}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-body-soft">
                        {totals.pinned > 0 || totals.blocked > 0
                          ? `${totals.pinned > 0 ? `+${totals.pinned}` : ""}${totals.pinned > 0 && totals.blocked > 0 ? " · " : ""}${totals.blocked > 0 ? `−${totals.blocked}` : ""}`
                          : "—"}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
