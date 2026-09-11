"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  WRAP, FinHeader, Card, Panel, Kpi, Table, Th, Td, Chip, Empty, Flash, Tabs, Banner,
  btnPrimary, btnPrimaryStyle, btnGhost, input, Lbl, taka, toPaisa, TONE, type Tone,
} from "./FinanceUI";
import {
  referralOverview, referralList, runReferral,
  marketingSettings, saveMarketingSettings, ago,
  type ApiReferralOverview, type ApiReferralRow, type ReferralState,
} from "../_data/api";

/*
  REFERRAL & POINTS — MKT-D16 / D17.

  The owner's rule: whoever brings a friend gets points; the friend gets a
  discount; the points land when the friend's order is CONFIRMED.

  Two things this screen refuses to hide:

  · POINTS OWED. Every point handed out is ৳1 of future revenue already
    promised away. That figure sits in the KPI row next to the happy ones,
    because a referral scheme that only ever shows what it brought in is how
    shops discover, two years later, that they gave away a month of profit.

  · WHETHER IT PAYS. Cost against what the referred friends actually bought.
    If that ratio is under 1, the scheme is buying customers at a loss and it
    should say so plainly rather than showing a bigger number in green.
*/

const STATE_TONE: Record<ReferralState, Tone> = {
  JOINED: "sky", REWARDED: "emerald", REVERSED: "rose",
};
const STATE_LABEL: Record<ReferralState, string> = {
  JOINED: "signed up, not ordered yet",
  REWARDED: "points paid",
  REVERSED: "taken back",
};

export function ReferralView() {
  const [tab, setTab] = useState<"OVERVIEW" | "LIST" | "RULES">("OVERVIEW");
  const [o, setO] = useState<ApiReferralOverview | null>(null);
  const [rows, setRows] = useState<ApiReferralRow[]>([]);
  const [filter, setFilter] = useState<"" | ReferralState>("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setO(await referralOverview()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const loadList = useCallback(async () => {
    if (tab !== "LIST") return;
    try { setRows(await referralList({ state: filter || undefined })); }
    catch (e) { setErr((e as Error).message); }
  }, [tab, filter]);
  useEffect(() => { void loadList(); }, [loadList]);

  const run = async () => {
    setBusy(true); setErr(""); setOk("");
    try {
      const r = await runReferral();
      setOk(`${r.rewarded} newly rewarded · ${r.reversed} taken back after a cancellation`);
      await load(); await loadList();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const payingOff = o?.returnRatio !== null && o?.returnRatio !== undefined && o.returnRatio >= 1;

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing"
        title="Referral"
        emoji="👥"
        tone="brand"
        right={
          <>
            <button className={btnGhost} onClick={run} disabled={busy}>
              {busy ? "Checking…" : "Check for new ones"}
            </button>
            <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => setTab("RULES")}>
              Reward rules
            </button>
          </>
        }
      />
      <Flash ok={ok} err={err} />

      {o && !o.enabled && (
        <Banner tone="amber" emoji="⏸" title="Referrals are switched off"
          right={<button className={btnGhost} onClick={() => setTab("RULES")}>Switch on</button>}>
          Codes still work for signing up, but nobody earns anything.
        </Banner>
      )}

      <Tabs value={tab} onChange={setTab} items={[
        { key: "OVERVIEW", label: "Where we stand", emoji: "◎", tone: "brand" },
        { key: "LIST", label: "Who brought whom", emoji: "👥", tone: "sky" },
        { key: "RULES", label: "Reward rules", emoji: "⚙", tone: "slate" },
      ]} />

      {tab === "OVERVIEW" && o && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Kpi label="Friends brought in" value={String(o.rewarded)} emoji="👥" tone="emerald"
              hint={`${o.joined} signed up and not ordered yet`} />
            <Kpi label="They bought" value={taka(o.broughtInPaisa)} emoji="🛍" tone="emerald" />
            <Kpi label="Points cost us" value={taka(o.costPaisa)} emoji="৳" tone="amber"
              hint={`${o.pointsGivenForReferrals.toLocaleString()} points given`} />
            <Kpi label="Points still owed" value={taka(o.liabilityPaisa)} emoji="⚠"
              tone={o.liabilityPaisa > 0 ? "rose" : "slate"}
              hint={`${o.pointsOutstanding.toLocaleString()} unspent — ৳1 each, already promised`} />
          </div>

          <Card className="p-5 mb-4" tone={payingOff ? "emerald" : "amber"}>
            <div className="flex items-baseline justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-body-soft">
                  Is the scheme paying for itself?
                </div>
                <div className="text-[26px] font-bold leading-none mt-1"
                  style={{ color: payingOff ? TONE.emerald.text : TONE.amber.text }}>
                  {o.returnRatio === null ? "nothing to judge yet" : `${o.returnRatio.toFixed(1)}× back`}
                </div>
              </div>
              {o.returnRatio !== null && (
                <p className="text-[12.5px] text-body-soft max-w-[440px] m-0">
                  {payingOff
                    ? "Revenue, not profit — the goods still have to be paid for."
                    : "Points cost more than the friends have bought."}
                </p>
              )}
            </div>
          </Card>

          <Panel title="Who brings the most" emoji="🏆" tone="emerald">
            {o.leaderboard.length === 0 ? (
              <Empty emoji="👥" title="Nobody has brought anybody yet" />
            ) : (
              <Table head={<><Th>Customer</Th><Th right>Friends</Th><Th right>Points earned</Th><Th right>Worth</Th></>}>
                {o.leaderboard.map((r) => (
                  <tr key={r.customer!.id}>
                    <Td>
                      <Link className="font-semibold text-purple hover:underline" href={`/customers/${r.customer!.id}`}>
                        {r.customer!.name}
                      </Link>
                      <div className="text-[11px] text-body-soft">{r.customer!.phone}</div>
                    </Td>
                    <Td right>{r.friends}</Td>
                    <Td right>{r.points.toLocaleString()}</Td>
                    <Td right>{taka(r.points * o.pointValuePaisa)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>

        </>
      )}

      {tab === "LIST" && (
        <>
          <div className="mb-4">
            <select className={`${input} max-w-[260px]`} value={filter}
              onChange={(e) => setFilter(e.target.value as "" | ReferralState)}>
              <option value="">Everybody</option>
              <option value="JOINED">Signed up, not ordered yet</option>
              <option value="REWARDED">Points paid</option>
              <option value="REVERSED">Taken back</option>
            </select>
          </div>
          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <Empty emoji="👥" title="Nothing here yet" />
            ) : (
              <Table head={<><Th>No.</Th><Th>Brought by</Th><Th>New customer</Th><Th>State</Th><Th right>Points</Th></>}>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <span className="font-semibold text-purple">{r.referralNo}</span>
                      <div className="text-[11px] text-body-soft">{ago(r.createdAt)}</div>
                    </Td>
                    <Td>
                      <Link className="font-semibold text-purple hover:underline" href={`/customers/${r.referrer.id}`}>
                        {r.referrer.name}
                      </Link>
                      <div className="text-[11px] text-body-soft">{r.referrer.phone}</div>
                    </Td>
                    <Td>
                      <Link className="font-semibold text-purple hover:underline" href={`/customers/${r.friend.id}`}>
                        {r.friend.name}
                      </Link>
                      <div className="text-[11px] text-body-soft">
                        {r.friend.ordersCount} order{r.friend.ordersCount === 1 ? "" : "s"} since
                      </div>
                    </Td>
                    <Td>
                      <Chip tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</Chip>
                      {r.reversedNote && (
                        <div className="text-[11px] mt-0.5" style={{ color: TONE.rose.text }}>{r.reversedNote}</div>
                      )}
                    </Td>
                    <Td right>{r.pointsAwarded ? r.pointsAwarded.toLocaleString() : "—"}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}

      {tab === "RULES" && <RulesTab onSaved={() => { setOk("Saved"); void load(); }} setErr={setErr} />}
    </div>
  );
}

/* ---------------- the rules ---------------- */

function RulesTab({ onSaved, setErr }: { onSaved: () => void; setErr: (s: string) => void }) {
  const [f, setF] = useState({
    referralEnabled: true, points: "200", pointValue: "1",
    friendPct: "10", friendMax: "500", minOrder: "0",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const s = await marketingSettings();
        setF({
          referralEnabled: s.referralEnabled ?? true,
          points: String(s.referralPoints ?? 200),
          pointValue: String((s.pointValuePaisa ?? 100) / 100),
          friendPct: String((s.friendDiscountBp ?? 1000) / 100),
          friendMax: String((s.friendDiscountMaxPaisa ?? 50000) / 100),
          minOrder: String((s.referralMinOrderPaisa ?? 0) / 100),
        });
      } catch (e) { setErr((e as Error).message); }
    })();
  }, [setErr]);

  const save = async () => {
    setBusy(true);
    try {
      await saveMarketingSettings({
        referralEnabled: f.referralEnabled,
        referralPoints: Math.round(Number(f.points || "0")),
        pointValuePaisa: toPaisa(f.pointValue),
        friendDiscountBp: Math.round(Number(f.friendPct || "0") * 100),
        friendDiscountMaxPaisa: toPaisa(f.friendMax),
        referralMinOrderPaisa: toPaisa(f.minOrder),
      });
      onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const rewardTaka = (Number(f.points || "0") * Number(f.pointValue || "0")).toFixed(0);

  return (
    <>
      <Banner tone="sky" emoji="৳" title="What this costs">
        Every friend brought in costs <strong>৳{rewardTaka}</strong> in points, plus the friend&apos;s discount.
      </Banner>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="What the referrer gets" emoji="🎁" tone="emerald">
          <div className="p-5 space-y-4">
            <label className="flex items-start gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" checked={f.referralEnabled} className="mt-0.5"
                onChange={(e) => setF({ ...f, referralEnabled: e.target.checked })} />
              <span>
                <strong>Referrals are running</strong>
                <div className="text-[11.5px] text-body-soft">Off means codes still work but nobody earns.</div>
              </span>
            </label>
            <div>
              <Lbl>Points per friend brought in</Lbl>
              <input className={input} value={f.points}
                onChange={(e) => setF({ ...f, points: e.target.value })} />
            </div>
            <div>
              <Lbl>What one point is worth (৳)</Lbl>
              <input className={input} value={f.pointValue}
                onChange={(e) => setF({ ...f, pointValue: e.target.value })} />
              <p className="text-[11.5px] text-body-soft mt-1 mb-0">
                Changes what every existing point is worth.
              </p>
            </div>
          </div>
        </Panel>

        <Panel title="What the friend gets" emoji="🎀" tone="brand">
          <div className="p-5 space-y-4">
            <div>
              <Lbl>Discount on their first order (%)</Lbl>
              <input className={input} value={f.friendPct}
                onChange={(e) => setF({ ...f, friendPct: e.target.value })} />
            </div>
            <div>
              <Lbl>But no more than (৳)</Lbl>
              <input className={input} value={f.friendMax}
                onChange={(e) => setF({ ...f, friendMax: e.target.value })} />
            </div>
            <div>
              <Lbl>The order must be at least (৳)</Lbl>
              <input className={input} value={f.minOrder}
                onChange={(e) => setF({ ...f, minOrder: e.target.value })} />
              <p className="text-[11.5px] text-body-soft mt-1 mb-0">0 means any order counts.</p>
            </div>
          </div>
        </Panel>
      </div>

      <Card className="p-5 mt-4" tone="amber">
        <div className="text-[13px]">
          <strong className="text-purple">Points arrive when the order is confirmed, not delivered</strong>
          <p className="text-body-soft mt-1 mb-0 text-[12.5px]">
            A cancellation takes them back on the nightly check.
          </p>
        </div>
      </Card>

      <div className="mt-5">
        <button className={btnPrimary} style={btnPrimaryStyle} onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save rules"}
        </button>
      </div>
    </>
  );
}
