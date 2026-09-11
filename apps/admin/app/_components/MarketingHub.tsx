"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  WRAP, FinHeader, Card, Panel, Kpi, Table, Th, Td, Chip, Empty, Flash, Tabs, Banner,
  btnPrimary, btnPrimaryStyle, btnGhost, input, taka, TONE, type Tone,
} from "./FinanceUI";
import {
  listCampaigns, attributionQuality, runAttribution,
  affiliateOverview, listCommissions, listPayouts, marketingSettings, accrueCommissions,
  ago,
  type ApiCampaign, type ApiMarketingStats, type ApiAffiliateOverview,
  type ApiCommissionRow, type ApiPayoutRow, type AttributionSource, type CommissionState,
} from "../_data/api";

/*
  The sub-modules' own front pages.

  Marketing is one module with four parts under it, and each part is big enough
  to need its own overview rather than a row on somebody else's page:

      Campaigns              what we paid for, and what came back
      Offers & Promotions    (owned by the Offers module — it only MOVED here)
      Affiliates & Partners  who sends us customers, and what we owe them
      Occasions & Outreach   who is worth a message this week

  Note on Offers: nothing about ownership changed. The Offer entity still
  belongs to the Offers module, its screens are the same screens, and Marketing
  does not write to it. Only where it sits in the panel changed (owner's call,
  28 Jul 2026) — because to the person using it, a coupon IS marketing.
*/

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const bpToPct = (bp: number) => (bp / 100).toFixed(bp % 100 === 0 ? 0 : 2);
const dayStr = (iso: string) => new Date(iso).toISOString().slice(0, 10);

const SOURCE_LABEL: Record<AttributionSource, string> = {
  REF_CODE: "Affiliate link",
  COUPON: "Coupon code",
  UTM: "Website link (UTM)",
  MANUAL: "Set by staff",
  UNATTRIBUTED: "Origin unknown",
};
const SOURCE_TONE: Record<AttributionSource, Tone> = {
  REF_CODE: "emerald", COUPON: "emerald", UTM: "sky", MANUAL: "amber", UNATTRIBUTED: "rose",
};

/* ============================================================
   CAMPAIGNS — sub-module overview
   ============================================================ */

export function CampaignsOverview() {
  const [rows, setRows] = useState<ApiCampaign[]>([]);
  const [q, setQ] = useState<ApiMarketingStats["quality"] | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([listCampaigns(), attributionQuality(30)]);
      setRows(a); setQ(b);
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const live = rows.filter((r) => r.status === "RUNNING");
  const spend = rows.reduce((n, r) => n + r.spentPaisa, 0);
  const contribution = rows.reduce((n, r) => n + r.contributionPaisa, 0);
  const orders = rows.reduce((n, r) => n + r.orders, 0);
  const best = [...rows].filter((r) => r.roi !== null).sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0));

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing · Campaigns"
        title="What we paid for, and what came back"
        emoji="🚀"
        right={
          <>
            <Link className={btnGhost} href="/marketing/campaigns/sources">Order sources</Link>
            <Link className={btnPrimary} style={btnPrimaryStyle} href="/marketing/campaigns/list">All campaigns</Link>
          </>
        }
      />
      <Flash ok="" err={err} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Running now" value={String(live.length)} emoji="🚀" tone="emerald"
          hint={`${rows.length} in total`} />
        <Kpi label="Spent, all campaigns" value={taka(spend)} emoji="৳" tone="amber"
          hint="tagged expenses, read from Finance" />
        <Kpi label="Left after goods & delivery" value={taka(contribution)} emoji="📈"
          tone={contribution >= spend ? "emerald" : "rose"} />
        <Kpi label="Orders credited" value={String(orders)} emoji="🛍" tone="sky" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Best return so far" emoji="🏆" tone="emerald">
          {best.length === 0 ? (
            <Empty emoji="🚀" title="Nothing to rank yet" />
          ) : (
            <Table head={<><Th>Campaign</Th><Th right>Spent</Th><Th right>Left</Th><Th right>Return</Th></>}>
              {best.slice(0, 6).map((c) => (
                <tr key={c.id}>
                  <Td>
                    <Link className="font-semibold text-purple hover:underline" href={`/marketing/campaigns/${c.id}`}>
                      {c.name}
                    </Link>
                    <div className="text-[11px] text-body-soft">{c.platform.toLowerCase()}</div>
                  </Td>
                  <Td right>{taka(c.spentPaisa)}</Td>
                  <Td right>{taka(c.contributionPaisa)}</Td>
                  <Td right>
                    <span className="font-bold" style={{
                      color: (c.roi ?? 0) >= 2 ? TONE.emerald.text : (c.roi ?? 0) >= 1 ? TONE.amber.text : TONE.rose.text,
                    }}>{(c.roi ?? 0).toFixed(1)}×</span>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="Running now" emoji="⏱" tone="sky">
          {live.length === 0 ? (
            <Empty emoji="⏱" title="Nothing running" />
          ) : (
            <Table head={<><Th>Campaign</Th><Th>Ends</Th><Th right>Budget used</Th></>}>
              {live.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <Link className="font-semibold text-purple hover:underline" href={`/marketing/campaigns/${c.id}`}>
                      {c.name}
                    </Link>
                  </Td>
                  <Td>{dayStr(c.endDate)}</Td>
                  <Td right>
                    {c.budgetPaisa > 0
                      ? `${taka(c.spentPaisa)} of ${taka(c.budgetPaisa)}`
                      : taka(c.spentPaisa)}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>

      {q && (
        <div className="mt-4">
          <Panel title="How well do we know where orders come from?" emoji="🔎" tone="brand"
            sub={`last ${q.days} days · ${q.totalOrders} orders`}
            right={<Link className={btnGhost} href="/marketing/campaigns/sources">Details</Link>}>
            <Table head={<><Th>How we know</Th><Th right>Orders</Th><Th right>Share</Th><Th right>Revenue</Th></>}>
              {q.rows.map((r) => (
                <tr key={r.source}>
                  <Td><Chip tone={SOURCE_TONE[r.source]}>{SOURCE_LABEL[r.source]}</Chip></Td>
                  <Td right>{r.orders}</Td>
                  <Td right>{pct(r.orders, q.totalOrders)}%</Td>
                  <Td right>{taka(r.revenuePaisa)}</Td>
                </tr>
              ))}
            </Table>
          </Panel>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   CAMPAIGNS — order sources (the attribution screen)
   ============================================================ */

export function OrderSourcesView() {
  const [days, setDays] = useState(30);
  const [q, setQ] = useState<ApiMarketingStats["quality"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setQ(await attributionQuality(days)); } catch (e) { setErr((e as Error).message); }
  }, [days]);
  useEffect(() => { void load(); }, [load]);

  const rerun = async () => {
    setBusy(true); setErr(""); setOk("");
    try {
      const r = await runAttribution();
      setOk(`Checked ${r.scanned} orders since ${r.from} — ${r.attributed} matched, ${r.unattributed} still unknown`);
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const unknown = q?.rows.find((r) => r.source === "UNATTRIBUTED");
  const unknownPct = q ? pct(unknown?.orders ?? 0, q.totalOrders) : 0;

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing · Campaigns"
        title="Where did the orders come from?"
        emoji="🔎"
        tone="brand"
        right={
          <>
            <select className={`${input} w-auto`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
            <button className={btnPrimary} style={btnPrimaryStyle} onClick={rerun} disabled={busy}>
              {busy ? "Checking…" : "Re-check"}
            </button>
          </>
        }
      />
      <Flash ok={ok} err={err} />

      {q && q.totalOrders > 0 && unknownPct >= 40 && (
        <Banner tone="rose" emoji="⚠"
          title={`${unknown?.orders ?? 0} of ${q.totalOrders} orders have no known origin (${unknownPct}%)`}>
        </Banner>
      )}

      <div className="grid gap-3">
        {q?.rows.map((r, i) => (
          <Card key={r.source} className="p-4" tone={SOURCE_TONE[r.source]}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg grid place-items-center text-[13px] font-bold text-white shrink-0"
                  style={{ background: TONE[SOURCE_TONE[r.source]].grad }}>
                  {i + 1}
                </div>
                <div>
                  <div className="font-display text-[15px] text-purple">{SOURCE_LABEL[r.source]}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[20px] font-bold leading-none" style={{ color: TONE[SOURCE_TONE[r.source]].text }}>
                  {r.orders}
                </div>
                <div className="text-[11px] text-body-soft mt-1">
                  {pct(r.orders, q.totalOrders)}% · {taka(r.revenuePaisa)}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

    </div>
  );
}

/* ============================================================
   AFFILIATES — sub-module overview
   ============================================================ */

export function AffiliatesOverview() {
  const [o, setO] = useState<ApiAffiliateOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setO(await affiliateOverview()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const sweep = async () => {
    setBusy(true); setErr(""); setOk("");
    try {
      const r = await accrueCommissions();
      setOk(`Checked ${r.scanned} delivered orders — ${r.accrued} new commission${r.accrued === 1 ? "" : "s"} recorded`);
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const ready = o?.readyToPay ?? [];
  const payable = ready.filter((r) => r.overMinimum);

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing · Affiliates"
        title="Who sends us customers"
        emoji="🤝"
        right={
          <>
            <button className={btnGhost} onClick={sweep} disabled={busy}>
              {busy ? "Working…" : "Check delivered orders"}
            </button>
            <Link className={btnPrimary} style={btnPrimaryStyle} href="/marketing/affiliates/list">
              All affiliates
            </Link>
          </>
        }
      />
      <Flash ok={ok} err={err} />

      {payable.length > 0 && (
        <Banner tone="amber" emoji="৳"
          title={`${payable.length} ${payable.length === 1 ? "person is" : "people are"} waiting to be paid`}
          right={<Link className={btnGhost} href="/marketing/affiliates/payouts">Payout history</Link>}>
          Cash leaving the shop — owner and PIN, every time.
        </Banner>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Active" value={String(o?.activeAffiliates ?? 0)} emoji="👥" tone="brand"
          hint={`${o?.people ?? 0} people · ${o?.businesses ?? 0} businesses`} />
        <Kpi label="They brought in" value={taka(o?.totalSalesPaisa ?? 0)} emoji="🛍" tone="emerald"
          hint={`${o?.commissionRows ?? 0} orders`} />
        <Kpi label="That cost us" value={taka(o?.totalCostPaisa ?? 0)} emoji="৳" tone="amber"
          hint={o ? `${bpToPct(o.effectiveRateBp)}% of the goods they sold` : ""} />
        <Kpi label="Ready to pay out" value={taka(o?.availablePaisa ?? 0)} emoji="✓"
          tone={(o?.availablePaisa ?? 0) > 0 ? "amber" : "slate"}
          hint={o ? `${taka(o.pendingPaisa)} still on hold` : ""} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Who brings the most" emoji="🏆" tone="emerald">
          {(o?.leaderboard.length ?? 0) === 0 ? (
            <Empty emoji="🤝" title="Nobody has earned yet" />
          ) : (
            <Table head={<><Th>Who</Th><Th right>Orders</Th><Th right>Sold</Th><Th right>Earned</Th></>}>
              {o!.leaderboard.map((r) => (
                <tr key={r.affiliate!.id}>
                  <Td>
                    <Link className="font-semibold text-purple hover:underline"
                      href={`/marketing/affiliates/${r.affiliate!.id}`}>
                      {r.affiliate!.type === "BUSINESS" ? "🏢" : "👤"} {r.affiliate!.name}
                    </Link>
                    <div className="text-[11px] text-body-soft">{r.affiliate!.code} · {bpToPct(r.affiliate!.commissionBp)}%</div>
                  </Td>
                  <Td right>{r.orders}</Td>
                  <Td right>{taka(r.salesPaisa)}</Td>
                  <Td right><span className="font-semibold">{taka(r.earnedPaisa)}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="Waiting to be paid" emoji="৳" tone="amber"
          sub={o ? `minimum ${taka(o.minWithdrawPaisa)} · ${o.holdDays} days on hold after delivery` : ""}>
          {ready.length === 0 ? (
            <Empty emoji="⏳" title="Nothing to pay right now" />
          ) : (
            <Table head={<><Th>Who</Th><Th>Pay by</Th><Th right>Amount</Th><Th right></Th></>}>
              {ready.map((r) => (
                <tr key={r.affiliate!.id}>
                  <Td>
                    <Link className="font-semibold text-purple hover:underline"
                      href={`/marketing/affiliates/${r.affiliate!.id}`}>{r.affiliate!.name}</Link>
                  </Td>
                  <Td>
                    <span className="text-[12.5px]">{r.affiliate!.payoutMethod ?? "—"}</span>
                    {r.affiliate!.payoutNumber && (
                      <div className="text-[11px] text-body-soft">{r.affiliate!.payoutNumber}</div>
                    )}
                  </Td>
                  <Td right><span className="font-semibold">{taka(r.amountPaisa)}</span></Td>
                  <Td right>
                    {r.overMinimum
                      ? <Chip tone="emerald">ready</Chip>
                      : <Chip tone="slate">below minimum</Chip>}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Latest commission" emoji="📒" tone="slate"
          right={<Link className={btnGhost} href="/marketing/affiliates/commissions">All commission</Link>}>
          {(o?.recent.length ?? 0) === 0 ? (
            <Empty emoji="📒" title="Nothing yet" />
          ) : (
            <Table head={<><Th>When</Th><Th>Who</Th><Th>Order</Th><Th>State</Th><Th right>Amount</Th></>}>
              {o!.recent.map((r) => (
                <tr key={r.id}>
                  <Td>{ago(r.createdAt)}</Td>
                  <Td>
                    <Link className="font-semibold text-purple hover:underline"
                      href={`/marketing/affiliates/${r.affiliate.id}`}>{r.affiliate.name}</Link>
                  </Td>
                  <Td>
                    <Link className="text-purple hover:underline" href={`/orders/${r.order.id}`}>{r.order.orderNo}</Link>
                  </Td>
                  <Td><Chip tone={COMMISSION_TONE[r.state]}>{r.state.toLowerCase()}</Chip></Td>
                  <Td right>{taka(r.amountPaisa)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>
    </div>
  );
}

const COMMISSION_TONE: Record<CommissionState, Tone> = {
  PENDING: "amber", AVAILABLE: "emerald", PAID: "slate", REVERSED: "rose",
};

/* ============================================================
   AFFILIATES — every commission row
   ============================================================ */

export function CommissionsView() {
  const [tab, setTab] = useState<"ALL" | CommissionState>("ALL");
  const [rows, setRows] = useState<ApiCommissionRow[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setRows(await listCommissions({ state: tab === "ALL" ? "" : tab })); }
    catch (e) { setErr((e as Error).message); }
  }, [tab]);
  useEffect(() => { void load(); }, [load]);

  const total = rows.reduce((n, r) => n + r.amountPaisa, 0);

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing · Affiliates"
        title="Commission ledger"
        emoji="📒"
        tone="slate"
        right={<Link className={btnGhost} href="/marketing/affiliates">Overview</Link>}
      />
      <Flash ok="" err={err} />

      <Tabs value={tab} onChange={setTab} items={[
        { key: "ALL", label: "All", count: rows.length, emoji: "☰" },
        { key: "PENDING", label: "On hold", emoji: "⏳", tone: "amber" },
        { key: "AVAILABLE", label: "Ready", emoji: "✓", tone: "emerald" },
        { key: "PAID", label: "Paid", emoji: "↗", tone: "slate" },
        { key: "REVERSED", label: "Reversed", emoji: "↩", tone: "rose" },
      ]} />

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty emoji="📒" title="Nothing here" />
        ) : (
          <>
            <Table head={
              <><Th>When</Th><Th>Who</Th><Th>Order</Th><Th right>Goods</Th>
                <Th right>Rate</Th><Th right>Earned</Th><Th>State</Th><Th>Ledger</Th></>
            }>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>{dayStr(r.createdAt)}</Td>
                  <Td>
                    <Link className="font-semibold text-purple hover:underline"
                      href={`/marketing/affiliates/${r.affiliate.id}`}>
                      {r.affiliate.type === "BUSINESS" ? "🏢" : "👤"} {r.affiliate.name}
                    </Link>
                    <div className="text-[11px] text-body-soft">{r.affiliate.code}</div>
                  </Td>
                  <Td>
                    <Link className="text-purple hover:underline" href={`/orders/${r.order.id}`}>{r.order.orderNo}</Link>
                    <div className="text-[11px] text-body-soft">{r.order.senderName}</div>
                  </Td>
                  <Td right>{taka(r.basePaisa)}</Td>
                  <Td right>{bpToPct(r.rateBp)}%</Td>
                  <Td right><span className="font-semibold">{taka(r.amountPaisa)}</span></Td>
                  <Td>
                    <Chip tone={COMMISSION_TONE[r.state]}>{r.state.toLowerCase()}</Chip>
                    {r.state === "PENDING" && (
                      <div className="text-[11px] text-body-soft mt-0.5">free {dayStr(r.availableAt)}</div>
                    )}
                    {r.reversedNote && (
                      <div className="text-[11px] mt-0.5" style={{ color: TONE.rose.text }}>{r.reversedNote}</div>
                    )}
                  </Td>
                  <Td>
                    {r.journalEntryId
                      ? <Chip tone="emerald">posted</Chip>
                      : <Chip tone="rose">no entry</Chip>}
                  </Td>
                </tr>
              ))}
            </Table>
            <div className="px-4 py-3 border-t border-[#f3eef7] flex items-center justify-between">
              <span className="text-[12px] text-body-soft">{rows.length} rows shown</span>
              <span className="text-[14px] font-bold text-purple">{taka(total)}</span>
            </div>
          </>
        )}
      </Card>

    </div>
  );
}

/* ============================================================
   AFFILIATES — payouts
   ============================================================ */

export function PayoutsView() {
  const [rows, setRows] = useState<ApiPayoutRow[]>([]);
  const [err, setErr] = useState("");
  const [setting, setSetting] = useState<{ minWithdrawPaisa: number; holdDays: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([listPayouts(), marketingSettings()]);
      setRows(a); setSetting(s);
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const paid = rows.reduce((n, r) => n + r.netPaisa, 0);
  const recovered = rows.reduce((n, r) => n + r.recoveredPaisa, 0);

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing · Affiliates"
        title="Payouts"
        emoji="↗"
        tone="slate"
        right={<Link className={btnGhost} href="/marketing/affiliates">Overview</Link>}
      />
      <Flash ok="" err={err} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Paid out, all time" value={taka(paid)} emoji="↗" tone="slate" />
        <Kpi label="Recovered from returns" value={taka(recovered)} emoji="↩"
          tone={recovered > 0 ? "amber" : "slate"} hint="netted off later payouts" />
        <Kpi label="Payouts made" value={String(rows.length)} emoji="🧾" tone="sky" />
        <Kpi label="Smallest withdrawal" value={taka(setting?.minWithdrawPaisa ?? 0)} emoji="⚖" tone="brand"
          hint={setting ? `${setting.holdDays} days on hold first` : ""} />
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty emoji="↗" title="Nothing has been paid out yet" />
        ) : (
          <Table head={
            <><Th>No.</Th><Th>When</Th><Th>Who</Th><Th>How</Th>
              <Th right>Earned</Th><Th right>Recovered</Th><Th right>Paid</Th><Th>Ledger</Th></>
          }>
            {rows.map((p) => (
              <tr key={p.id}>
                <Td><span className="font-semibold text-purple">{p.payoutNo}</span></Td>
                <Td>{dayStr(p.createdAt)}</Td>
                <Td>
                  <Link className="font-semibold text-purple hover:underline"
                    href={`/marketing/affiliates/${p.affiliate.id}`}>{p.affiliate.name}</Link>
                  <div className="text-[11px] text-body-soft">{p.affiliate.code}</div>
                </Td>
                <Td>
                  <span className="text-[12.5px]">{p.method ?? "—"}</span>
                  {p.reference && <div className="text-[11px] text-body-soft">{p.reference}</div>}
                </Td>
                <Td right>{taka(p.amountPaisa)}</Td>
                <Td right>{p.recoveredPaisa > 0
                  ? <span style={{ color: TONE.rose.text }}>−{taka(p.recoveredPaisa)}</span>
                  : "—"}</Td>
                <Td right><span className="font-semibold">{taka(p.netPaisa)}</span></Td>
                <Td>{p.journalEntryId ? <Chip tone="emerald">posted</Chip> : <Chip tone="rose">no entry</Chip>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
