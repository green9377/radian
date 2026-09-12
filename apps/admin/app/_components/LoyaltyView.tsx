"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  WRAP, FinHeader, Panel, Kpi, Chip, Empty, Flash, Banner,
  Table, Th, Td, btnPrimary, btnPrimaryStyle, btnGhost, input, Lbl, taka,
} from "./FinanceUI";
import {
  loyaltyOverview, loyaltyHolders, loyaltyAdjust, loyaltyReconcile,
  marketingSettings, saveMarketingSettings,
  type ApiLoyaltyOverview, type ApiLoyaltyHolder, type ApiMarketingSetting,
} from "../_data/api";

/*
  LOYALTY — MKT-D21.

  The owner's rules, locked 29 Jul 2026:
    earn   1 % of (goods − discount), when the order is DELIVERED
    spend  at most 20 % of the same base on any one order — the customer
           always pays at least 80 % from their own pocket
    never  on delivery or VAT, either direction
    off    until the radianbd.com customers are imported

  This screen is built around one number that no loyalty screen usually shows:
  THE LIABILITY. Every unspent point is ৳1 of future revenue already promised
  away. A scheme that only shows "points given" flatters itself — it reads like
  generosity when it is actually debt.

  And beside it, the same figure taken from account 2130. If the two ever
  disagree, something wrote points without a ledger entry, and the screen says
  so rather than quietly picking whichever number looks nicer.
*/

const nf = new Intl.NumberFormat("en-US");
const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;

export function LoyaltyView() {
  const [o, setO] = useState<ApiLoyaltyOverview | null>(null);
  const [holders, setHolders] = useState<ApiLoyaltyHolder[]>([]);
  const [s, setS] = useState<ApiMarketingSetting | null>(null);
  const [busy, setBusy] = useState("");
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  // the settings form
  const [rate, setRate] = useState("1");
  const [cap, setCap] = useState("20");
  const [floor, setFloor] = useState("50");
  const [mult, setMult] = useState("1");
  const [until, setUntil] = useState("");

  // hand adjustment
  const [adjCust, setAdjCust] = useState("");
  const [adjPts, setAdjPts] = useState("");
  const [adjWhy, setAdjWhy] = useState("");
  const [adjOpening, setAdjOpening] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ov, hs, st] = await Promise.all([
        loyaltyOverview(), loyaltyHolders(50), marketingSettings(),
      ]);
      setO(ov); setHolders(hs); setS(st);
      setRate((st.earnRateBp / 100).toString());
      setCap((st.redeemMaxBp / 100).toString());
      setFloor(String(st.minRedeemPoints));
      setMult((st.earnMultiplierBp / 10000).toString());
      setUntil(st.multiplierUntil ? st.multiplierUntil.slice(0, 10) : "");
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const flash = (m: string) => { setOk(m); setErr(""); window.setTimeout(() => setOk(""), 6000); };
  const fail = (e: unknown) => { setErr(e instanceof Error ? e.message : "Something went wrong"); setOk(""); };

  const save = async (patch: Partial<ApiMarketingSetting>, msg: string) => {
    setBusy("save");
    try { await saveMarketingSettings(patch); await load(); flash(msg); }
    catch (e) { fail(e); } finally { setBusy(""); }
  };

  const saveRules = () =>
    save({
      earnRateBp: Math.round(parseFloat(rate || "0") * 100),
      redeemMaxBp: Math.round(parseFloat(cap || "0") * 100),
      minRedeemPoints: parseInt(floor || "1", 10),
      earnMultiplierBp: Math.round(parseFloat(mult || "1") * 10000),
      multiplierUntil: until ? new Date(`${until}T23:59:59`).toISOString() : null,
    }, "Saved.");

  const doAdjust = async () => {
    setBusy("adj");
    try {
      await loyaltyAdjust({
        customerId: adjCust.trim(),
        points: parseInt(adjPts || "0", 10),
        why: adjWhy.trim(),
        opening: adjOpening,
      });
      setAdjPts(""); setAdjWhy("");
      await load();
      flash("Done.");
    } catch (e) { fail(e); } finally { setBusy(""); }
  };

  const doRun = async () => {
    setBusy("run");
    try {
      const r = await loyaltyReconcile(90);
      await load();
      flash(`Checked the last 90 days — ${r.earned} order${r.earned === 1 ? "" : "s"} earned, ${r.reversed} taken back.`);
    } catch (e) { fail(e); } finally { setBusy(""); }
  };

  const worth = (pts: number) => taka(pts * (o?.pointValuePaisa ?? 100));

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing & Growth"
        title="Loyalty points"
        emoji="⭐"
        tone="brand"
        sub="1 point = ৳1"
        right={
          <div className="flex items-center gap-2">
            <button className="rounded-xl px-4 py-2 text-[13px] font-semibold bg-white text-purple disabled:opacity-60"
              disabled={busy === "run"} onClick={() => void doRun()}>
              {busy === "run" ? "Checking…" : "Check the last 90 days"}
            </button>
          </div>
        }
      />
      <Flash ok={ok} err={err} />

      {o && !o.enabled && (
        <Banner
          tone="amber"
          emoji="⏸"
          title="The scheme is switched off."
          right={
            <button className={btnPrimary} style={btnPrimaryStyle} disabled={busy === "save"}
              onClick={() => void save({ loyaltyEnabled: true }, "Loyalty is now live.")}>
              Switch it on
            </button>
          }
        >
          Nothing is earned and nothing can be spent while this is off.
        </Banner>
      )}

      {o && o.enabled && !o.agrees && (
        <Banner tone="rose" emoji="⚠️" title="The points and the books disagree.">
          Points owed <b>{worth(o.outstanding)}</b> · account 2130 <b>{taka(o.ledgerPaisa)}</b>.
        </Banner>
      )}

      {o && (
        <>
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <Kpi
              label="Owed to customers"
              value={worth(o.outstanding)}
              tone={o.outstanding > 0 ? "amber" : "slate"}
              emoji="🧾"
              hint={`${nf.format(o.outstanding)} unspent points · ${o.customersWithPoints} customer${o.customersWithPoints === 1 ? "" : "s"}`}
            />
            <Kpi label="Given, all time" value={nf.format(o.pointsGiven)} tone="brand" emoji="⭐"
              hint={worth(o.pointsGiven)} />
            <Kpi label="Spent" value={nf.format(o.pointsSpent)} tone="emerald" emoji="🛍"
              hint={o.pointsGiven > 0
                ? `${((o.pointsSpent / o.pointsGiven) * 100).toFixed(0)}% of what was given`
                : undefined} />
            <Kpi label="Earning right now"
              value={pct(o.rate.effectiveBp)}
              tone={o.rate.festivalOn ? "rose" : "sky"} emoji={o.rate.festivalOn ? "🎉" : "📈"}
              hint={o.rate.festivalOn
                ? `festival ×${o.rate.multiplierBp / 10000}${o.rate.until ? ` until ${new Date(o.rate.until).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}`
                : `${pct(o.rate.baseBp)} of goods after discount`} />
          </div>

        </>
      )}

      {/* ---- the rules ---- */}
      <Panel title="The rules" emoji="⚖️" tone="brand" className="mb-6">
        <div className="px-5 py-5 grid md:grid-cols-4 gap-4 items-end">
          <div>
            <Lbl>Earn — % of goods</Lbl>
            <input className={input} type="number" step="0.1" min="0" max="10"
              value={rate} onChange={(e) => setRate(e.target.value)} />
            <div className="text-[11.5px] text-body-soft mt-1">
              ৳1,000 order → <b>{Math.floor((parseFloat(rate || "0") * 1000) / 100)} points</b>
            </div>
          </div>
          <div>
            <Lbl>Spend — most of one order</Lbl>
            <input className={input} type="number" step="1" min="0" max="50"
              value={cap} onChange={(e) => setCap(e.target.value)} />
            <div className="text-[11.5px] text-body-soft mt-1">
              customer pays <b>{100 - (parseFloat(cap || "0") || 0)}%</b> from pocket, minimum
            </div>
          </div>
          <div>
            <Lbl>Smallest redemption</Lbl>
            <input className={input} type="number" step="1" min="1"
              value={floor} onChange={(e) => setFloor(e.target.value)} />
            <div className="text-[11.5px] text-body-soft mt-1">points, per order</div>
          </div>
          <div className="flex gap-2">
            <button className={btnPrimary} style={btnPrimaryStyle} disabled={busy === "save"}
              onClick={() => void saveRules()}>
              {busy === "save" ? "Saving…" : "Save the rules"}
            </button>
          </div>

          <div className="md:col-span-4 border-t border-[var(--l-accent)] pt-4 grid md:grid-cols-4 gap-4 items-end">
            <div>
              <Lbl>Festival — multiply earning by</Lbl>
              <select className={input} value={mult} onChange={(e) => setMult(e.target.value)}>
                <option value="1">×1 — normal</option>
                <option value="2">×2 — double points</option>
                <option value="3">×3 — triple points</option>
                <option value="5">×5</option>
              </select>
            </div>
            <div>
              <Lbl>…until the end of</Lbl>
              <input className={input} type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
              <div className="text-[11.5px] text-body-soft mt-1">
                leave blank and it stays on until you turn it off
              </div>
            </div>
          </div>

          {s?.loyaltyEnabled && (
            <div className="md:col-span-4 border-t border-[var(--l-accent)] pt-4">
              <button className={btnGhost} disabled={busy === "save"}
                onClick={() => void save({ loyaltyEnabled: false }, "Switched off.")}>
                Switch the scheme off
              </button>
              <span className="text-[12px] text-body-soft ml-3">
                Balances are kept.
              </span>
            </div>
          )}
        </div>
      </Panel>

      {/* ---- who is holding points ---- */}
      <Panel title="Who is holding points" sub="Biggest first" emoji="👥" tone="slate" className="mb-6">
        {holders.length === 0 ? (
          <Empty emoji="⭐" title="Nobody has points yet" />
        ) : (
          <Table head={<><Th>Customer</Th><Th>Phone</Th><Th right>Orders</Th><Th right>Points</Th><Th right>Worth</Th></>}>
            {holders.map((h, i) => (
              <tr key={h.customer?.id ?? i} className="border-t border-[var(--l-accent)] hover:bg-[var(--s-accent)]">
                <Td>
                  {h.customer ? (
                    <Link className="font-semibold text-purple hover:underline" href={`/customers/${h.customer.id}`}>
                      {h.customer.name}
                    </Link>
                  ) : <span className="text-body-soft">(deleted customer)</span>}
                </Td>
                <Td>{h.customer?.phone ?? "—"}</Td>
                <Td right>{h.customer?.ordersCount ?? 0}</Td>
                <Td right><b>{nf.format(h.points)}</b></Td>
                <Td right>{taka(h.worthPaisa)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      {/* ---- by hand ---- */}
      <Panel title="Put points in by hand" emoji="✍️" tone="sky">
        <div className="px-5 py-5 grid md:grid-cols-5 gap-4 items-end">
          <div className="md:col-span-2">
            <Lbl>Customer id</Lbl>
            <input className={input} value={adjCust}
              onChange={(e) => setAdjCust(e.target.value)} />
          </div>
          <div>
            <Lbl>Points</Lbl>
            <input className={input} type="number" placeholder="e.g. 250 or −50" value={adjPts}
              onChange={(e) => setAdjPts(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Lbl>Why</Lbl>
            <input className={input} placeholder="required" value={adjWhy}
              onChange={(e) => setAdjWhy(e.target.value)} />
          </div>
          <label className="md:col-span-3 flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={adjOpening} onChange={(e) => setAdjOpening(e.target.checked)} />
            Opening balance from the old site
          </label>
          <div className="md:col-span-2">
            <button className={btnPrimary} style={btnPrimaryStyle}
              disabled={!adjCust.trim() || !adjPts || !adjWhy.trim() || busy === "adj"}
              onClick={() => void doAdjust()}>
              {busy === "adj" ? "Saving…" : "Add the points"}
            </button>
          </div>
          <div className="md:col-span-5 text-[12.5px] text-body-soft border-t border-[var(--l-accent)] pt-3">
            Points cost real money and write to the ledger — your PIN is required.
          </div>
        </div>
      </Panel>
    </div>
  );
}
