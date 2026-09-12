"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  WRAP, FinHeader, Card, Panel, Kpi, Table, Th, Td, Chip, Empty, Flash, Tabs, Banner,
  btnPrimary, btnPrimaryStyle, btnGhost, input, Lbl, taka, toPaisa, todayStr, TONE,
  type Tone,
} from "./FinanceUI";
import {
  marketingStats, listCampaigns, getCampaign, createCampaign, updateCampaign,
  deleteCampaign, runAttribution, listAffiliates, getAffiliate, createAffiliate,
  updateAffiliate, accrueCommissions, payAffiliate, dueOccasions, logOutreach,
  outreachHistory, outreachEffect, listOptOuts, optOutCustomer, optInCustomer,
  marketingSettings, saveMarketingSettings, financeAccountsSafe, waLink, fillTemplate,
  marketingAutomation, runMarketingAutomation, ago,
  type ApiAutomationResult,
  type ApiMarketingStats, type ApiCampaign, type ApiCampaignDetail, type ApiAffiliate,
  type ApiAffiliateDetail, type ApiOccasions, type ApiOutreach, type ApiMarketingSetting,
  type ApiFinanceAccount, type CampaignPlatform, type CampaignStatus,
  type AttributionSource,
  WEB_BASE,
} from "../_data/api";

/*
  MARKETING screens — RADIAN_MARKETING_MODULE_ARCHITECTURE.md (28 Jul 2026).

  Two things drive every layout decision here.

  MKT-D03 — the unattributed count is shown in the same size as everything else.
  Most tools hide it, which is exactly how a campaign that lost money reports a
  profit. If two thirds of the orders have no known origin, the owner should see
  that before he sees the ROI, not after.

  MKT-D06 — revenue, gross and contribution are all three on screen, with
  contribution as the headline. The other two are there because Meta's own
  reporting shows revenue, and two numbers that disagree with no explanation are
  worse than one wrong number.
*/

/* ---------------- shared bits ---------------- */

const PLATFORMS: { key: CampaignPlatform; label: string; emoji: string }[] = [
  { key: "FACEBOOK", label: "Facebook", emoji: "📘" },
  { key: "INSTAGRAM", label: "Instagram", emoji: "📸" },
  { key: "GOOGLE", label: "Google Ads", emoji: "🔍" },
  { key: "TIKTOK", label: "TikTok", emoji: "🎵" },
  { key: "YOUTUBE", label: "YouTube", emoji: "▶️" },
  { key: "INFLUENCER", label: "Influencer", emoji: "🌟" },
  { key: "PRINT", label: "Print / Leaflet", emoji: "🖨" },
  { key: "EVENT", label: "Fair / Event", emoji: "🎪" },
  { key: "PARTNERSHIP", label: "Partnership", emoji: "🤝" },
  { key: "OTHER", label: "Other", emoji: "✦" },
];
const platformMeta = (p: CampaignPlatform) =>
  PLATFORMS.find((x) => x.key === p) ?? PLATFORMS[PLATFORMS.length - 1];

const STATUS_TONE: Record<CampaignStatus, Tone> = {
  PLANNED: "sky",
  RUNNING: "emerald",
  FINISHED: "slate",
  ARCHIVED: "slate",
};

const SOURCE_LABEL: Record<AttributionSource, string> = {
  REF_CODE: "Affiliate link",
  COUPON: "Coupon code",
  UTM: "Website link (UTM)",
  MANUAL: "Set by staff",
  UNATTRIBUTED: "Origin unknown",
};
const SOURCE_TONE: Record<AttributionSource, Tone> = {
  REF_CODE: "emerald",
  COUPON: "emerald",
  UTM: "sky",
  MANUAL: "amber",
  UNATTRIBUTED: "rose",
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const bpToPct = (bp: number) => (bp / 100).toFixed(bp % 100 === 0 ? 0 : 2);
const dayStr = (iso: string) => new Date(iso).toISOString().slice(0, 10);

function Roi({ value }: { value: number | null }) {
  if (value === null)
    return <span className="text-body-soft text-[12px]">no spend tagged</span>;
  const tone: Tone = value >= 2 ? "emerald" : value >= 1 ? "amber" : "rose";
  return (
    <span className="font-bold" style={{ color: TONE[tone].text }}>
      {value.toFixed(1)}×
    </span>
  );
}

/* ============================================================
   1 — OVERVIEW
   ============================================================ */

export function MarketingOverview() {
  const [s, setS] = useState<ApiMarketingStats | null>(null);
  const [occ, setOcc] = useState<ApiOccasions | null>(null);
  const [auto, setAuto] = useState<ApiAutomationResult | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([marketingStats(), dueOccasions(), marketingAutomation()]);
      setS(a);
      setOcc(b);
      setAuto(c.last);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  /* the same sweep the clock runs, on demand — MKT-D14 */
  const rerun = async () => {
    setBusy(true); setErr(""); setOk("");
    try {
      const r = await runMarketingAutomation();
      setOk(
        `Checked ${r.ordersChecked} orders · ${r.accrued} commission recorded · ${r.released} released · ` +
        `${r.reversed} reversed · ${r.stillUnattributed} still of unknown origin`,
      );
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const c = s?.campaigns;
  const a = s?.affiliates;
  const unattrPct = c ? pct(c.unattributed30, c.orders30) : 0;

  /* the four sub-modules, each with the one number that says whether it needs
     attention today — the hub exists to route, not to repeat every figure */
  const parts: {
    href: string; emoji: string; title: string;
    value: string; hint: string; tone: Tone;
  }[] = [
    {
      href: "/marketing/campaigns", emoji: "🚀", title: "Campaigns",
      value: String(c?.running ?? 0), hint: "running now", tone: "emerald",
    },
    {
      href: "/marketing/offers", emoji: "％", title: "Offers & Promotions",
      value: "—", hint: "open to manage", tone: "brand",
    },
    {
      href: "/marketing/affiliates", emoji: "🤝", title: "Affiliates & Partners",
      value: taka(a?.availablePaisa ?? 0), hint: "ready to pay out", tone: (a?.availablePaisa ?? 0) > 0 ? "amber" : "slate",
    },
    {
      href: "/marketing/occasions", emoji: "🎂", title: "Occasions & Outreach",
      value: String(occ?.items.filter((i) => !i.alreadyContacted).length ?? 0), hint: "waiting for a message", tone: "sky",
    },
    {
      href: "/marketing/whatsapp", emoji: "💬", title: "WhatsApp",
      value: "—", hint: "open to send", tone: "emerald",
    },
    {
      href: "/marketing/referral", emoji: "👥", title: "Referral",
      value: "—", hint: "open to check", tone: "brand",
    },
    {
      href: "/marketing/seo", emoji: "🔍", title: "SEO",
      value: "—", hint: "open to check", tone: "slate",
    },
  ];

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing & Growth"
        title="What we spent, and what came back"
        emoji="📣"
        right={
          <>
            <button className={btnGhost} onClick={rerun} disabled={busy}>
              {busy ? "Working…" : "Run the checks now"}
            </button>
            <Link className={btnPrimary} style={btnPrimaryStyle} href="/marketing/campaigns">
              Campaigns
            </Link>
          </>
        }
      />

      {/* the sub-modules, first — this page is a doorway */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
        {parts.map((p) => (
          <Link key={p.href} href={p.href}
            className="group rounded-2xl border bg-white p-4 transition-all hover:-translate-y-[2px] hover:shadow-[0_6px_20px_rgba(80,40,100,0.10)]"
            style={{ borderColor: TONE[p.tone].ring }}>
            <div className="flex items-start justify-between gap-2">
              <div className="w-10 h-10 rounded-xl grid place-items-center text-[18px] text-white shadow-[0_2px_8px_rgba(0,0,0,0.10)]"
                style={{ background: TONE[p.tone].grad }}>{p.emoji}</div>
              <div className="text-right">
                <div className="text-[18px] font-bold leading-none" style={{ color: TONE[p.tone].text }}>{p.value}</div>
                <div className="text-[10.5px] text-body-soft mt-1">{p.hint}</div>
              </div>
            </div>
            <div className="font-display text-[15px] text-purple mt-3 group-hover:text-orchid">{p.title}</div>
          </Link>
        ))}
      </div>
      <Flash ok={ok} err={err} />

      {/* MKT-D14 — what the clock has been doing while nobody watched */}
      <Card className="px-5 py-3.5 mb-5 flex items-center justify-between gap-4 flex-wrap"
        style={{ background: auto?.errors.length ? TONE.rose.soft : "var(--s-accent)" }}>
        <div className="flex items-center gap-3">
          <span className="text-[16px]">{auto?.errors.length ? "⚠" : "⏱"}</span>
          <div>
            <div className="text-[13px] font-semibold text-purple">
              {auto ? `Checks last ran ${ago(auto.at)}` : "Checks have not run yet in this session"}
            </div>
            <div className="text-[11.5px] text-body-soft mt-0.5">
              {auto
                ? `${auto.ordersChecked} orders looked at · ${auto.accrued} commission recorded · ${auto.released} released · ${auto.reversed} taken back · ${auto.campaignsStarted + auto.campaignsFinished} campaign status changed`
                : "Runs every 15 minutes, and again at 2 AM."}
            </div>
            {auto?.errors.length ? (
              <div className="text-[11.5px] mt-1" style={{ color: TONE.rose.text }}>
                {auto.errors.join(" · ")}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {/* MKT-D03 — the number nobody else shows, high up, not buried */}
      {c && c.orders30 > 0 && unattrPct >= 40 && (
        <Banner
          tone="rose"
          emoji="⚠"
          title={`${c.unattributed30} of ${c.orders30} orders in the last 30 days have no known origin (${unattrPct}%)`}
        />
      )}

      {c && c.untaggedSpend30Paisa > 0 && (
        <Banner
          tone="amber"
          emoji="৳"
          title={`${taka(c.untaggedSpend30Paisa)} of marketing spend in the last 30 days is not tagged to any campaign`}
          right={
            <Link className={btnGhost} href="/finance/expenses">Open expenses</Link>
          }
        />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Live campaigns" value={String(c?.running ?? 0)} emoji="🚀" tone="emerald"
          hint={`${c?.planned ?? 0} planned · ${c?.finished ?? 0} finished`} />
        <Kpi label="Spent on live campaigns" value={taka(c?.liveSpendPaisa ?? 0)} emoji="৳" tone="amber"
          hint="from Finance" />
        <Kpi label="Came back (after goods & delivery)" value={taka(c?.liveContributionPaisa ?? 0)} emoji="📈"
          tone={(c?.liveContributionPaisa ?? 0) >= (c?.liveSpendPaisa ?? 0) ? "emerald" : "rose"}
          hint={`${c?.liveOrders ?? 0} attributed orders`} />
        <Kpi label="Origin unknown (30 days)" value={String(c?.unattributed30 ?? 0)}
          emoji="❓" tone={unattrPct >= 40 ? "rose" : unattrPct >= 15 ? "amber" : "slate"}
          hint={`${unattrPct}% of ${c?.orders30 ?? 0} orders`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* honesty panel */}
        <Panel title="How well do we know where orders come from?" emoji="🔎" tone="sky"
          sub="last 30 days">
          {!s ? (
            <Empty title="Loading…" />
          ) : (
            <Table head={<><Th>How we know</Th><Th right>Orders</Th><Th right>Share</Th><Th right>Revenue</Th></>}>
              {s.quality.rows.map((r) => (
                <tr key={r.source}>
                  <Td><Chip tone={SOURCE_TONE[r.source]}>{SOURCE_LABEL[r.source]}</Chip></Td>
                  <Td right>{r.orders}</Td>
                  <Td right>{pct(r.orders, s.quality.totalOrders)}%</Td>
                  <Td right>{taka(r.revenuePaisa)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        {/* affiliates money */}
        <Panel title="Affiliates & partners" emoji="🤝" tone="brand"
          sub="commission earned on delivered orders"
          right={<Link className={btnGhost} href="/marketing/affiliates">Open</Link>}>
          <div className="grid grid-cols-2 gap-3 p-4">
            <Kpi label="Active" value={String(a?.activeAffiliates ?? 0)} tone="slate" emoji="👤" />
            <Kpi label="On hold" value={taka(a?.pendingPaisa ?? 0)} tone="amber" emoji="⏳"
              hint="inside the return window" />
            <Kpi label="Ready to pay" value={taka(a?.availablePaisa ?? 0)} tone="emerald" emoji="✓" />
            <Kpi label="Paid out" value={taka(a?.paidPaisa ?? 0)} tone="slate" emoji="↗" />
          </div>
        </Panel>
      </div>

      {/* occasions */}
      <div className="mt-4">
        <Panel title="Occasions worth a message" emoji="🎂" tone="amber"
          sub={occ ? `next ${occ.days} days` : ""}
          right={<Link className={btnGhost} href="/marketing/occasions">Open the list</Link>}>
          {!occ || occ.items.length === 0 ? (
            <Empty emoji="🌼" title="Nothing due" />
          ) : (
            <Table head={<><Th>Customer</Th><Th>For</Th><Th>Occasion</Th><Th right>In</Th><Th right></Th></>}>
              {occ.items.slice(0, 6).map((r) => (
                <tr key={r.occasionId}>
                  <Td><span className="font-semibold text-purple">{r.customer.name}</span></Td>
                  <Td>{r.recipient.name} <span className="text-body-soft text-[11.5px]">· {r.recipient.relationship.toLowerCase()}</span></Td>
                  <Td><Chip tone="brand">{r.type.toLowerCase()}</Chip></Td>
                  <Td right>{r.inDays === 0 ? "today" : `${r.inDays} day${r.inDays > 1 ? "s" : ""}`}</Td>
                  <Td right>{r.alreadyContacted && <Chip tone="emerald">contacted</Chip>}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ============================================================
   2 — CAMPAIGNS
   ============================================================ */

const emptyCampaign = () => ({
  name: "",
  platform: "FACEBOOK" as CampaignPlatform,
  status: "PLANNED" as CampaignStatus,
  startDate: todayStr(),
  endDate: todayStr(),
  budget: "",
  goalNote: "",
  utmKeys: "",
});

export function CampaignsView() {
  const [tab, setTab] = useState<"ALL" | CampaignStatus>("ALL");
  const [rows, setRows] = useState<ApiCampaign[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyCampaign());
  const [showForm, setShowForm] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await listCampaigns({ includeArchived: tab === "ARCHIVED" ? "1" : "" , status: tab === "ALL" ? "" : tab, search }));
    } catch (e) { setErr((e as Error).message); }
  }, [tab, search]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setBusy(true); setErr(""); setOk("");
    try {
      await createCampaign({
        name: form.name,
        platform: form.platform,
        status: form.status,
        startDate: form.startDate,
        endDate: form.endDate,
        budgetPaisa: toPaisa(form.budget),
        goalNote: form.goalNote || null,
        utmKeys: form.utmKeys.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setOk("Campaign created");
      setForm(emptyCampaign());
      setShowForm(false);
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const counts = useMemo(() => ({
    all: rows.length,
  }), [rows]);

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing"
        title="Campaigns"
        emoji="🚀"
        right={
          <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close" : "New campaign"}
          </button>
        }
      />
      <Flash ok={ok} err={err} />

      {showForm && (
        <Card className="p-5 mb-5">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Lbl>Name</Lbl>
              <input className={input} value={form.name} placeholder="Valentine's Day 2027"
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Lbl>Where</Lbl>
              <select className={input} value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value as CampaignPlatform })}>
                {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.emoji} {p.label}</option>)}
              </select>
            </div>
            <div><Lbl>Starts</Lbl>
              <input type="date" className={input} value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
            <div><Lbl>Ends</Lbl>
              <input type="date" className={input} value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
            <div><Lbl>Planned budget (৳)</Lbl>
              <input className={input} value={form.budget} placeholder="40000"
                onChange={(e) => setForm({ ...form, budget: e.target.value })} /></div>
            <div className="md:col-span-2"><Lbl>What are we trying to do?</Lbl>
              <input className={input} value={form.goalNote} placeholder="200 bouquet orders in Dhaka"
                onChange={(e) => setForm({ ...form, goalNote: e.target.value })} /></div>
            <div><Lbl>Website link tags (utm_campaign)</Lbl>
              <input className={input} value={form.utmKeys} placeholder="valentine27, vday27"
                onChange={(e) => setForm({ ...form, utmKeys: e.target.value })} /></div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button className={btnPrimary} style={btnPrimaryStyle} onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Create campaign"}
            </button>
            <span className="text-[12px] text-body-soft">
              Spend is entered in Finance and tagged to this campaign.
            </span>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Tabs value={tab} onChange={setTab} items={[
          { key: "ALL", label: "All", count: counts.all, emoji: "☰" },
          { key: "RUNNING", label: "Running", emoji: "🚀", tone: "emerald" },
          { key: "PLANNED", label: "Planned", emoji: "🗓", tone: "sky" },
          { key: "FINISHED", label: "Finished", emoji: "✓", tone: "slate" },
          { key: "ARCHIVED", label: "Archived", emoji: "📦", tone: "slate" },
        ]} />
        <input className={`${input} max-w-[240px] mb-5`} placeholder="Search…" value={search}
          onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty emoji="🚀" title="No campaigns yet" />
        ) : (
          <Table head={
            <>
              <Th>Campaign</Th><Th>When</Th><Th right>Spent</Th><Th right>Revenue</Th>
              <Th right>Left after goods</Th><Th right>Return</Th><Th right>Orders</Th>
            </>
          }>
            {rows.map((c) => {
              const p = platformMeta(c.platform);
              return (
                <tr key={c.id}>
                  <Td>
                    <Link href={`/marketing/campaigns/${c.id}`} className="font-semibold text-purple hover:underline">
                      {p.emoji} {c.name}
                    </Link>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Chip tone={STATUS_TONE[c.status]}>{c.status.toLowerCase()}</Chip>
                      <span className="text-[11px] text-body-soft">{c.campaignNo}</span>
                    </div>
                  </Td>
                  <Td>
                    <div className="text-[12.5px]">{dayStr(c.startDate)}</div>
                    <div className="text-[11.5px] text-body-soft">to {dayStr(c.endDate)}</div>
                  </Td>
                  <Td right>{taka(c.spentPaisa)}</Td>
                  <Td right>{taka(c.revenuePaisa)}</Td>
                  <Td right><span className="font-semibold">{taka(c.contributionPaisa)}</span></Td>
                  <Td right><Roi value={c.roi} /></Td>
                  <Td right>{c.orders}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}

/* ============================================================
   3 — CAMPAIGN DETAIL (the three-line ROI, MKT-D06)
   ============================================================ */

export function CampaignDetail({ id }: { id: string }) {
  const router = useRouter();
  const [c, setC] = useState<ApiCampaignDetail | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [edit, setEdit] = useState(false);

  const load = useCallback(async () => {
    try { setC(await getCampaign(id)); } catch (e) { setErr((e as Error).message); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const remove = async () => {
    if (!confirm("Remove this campaign?")) return;
    try {
      const r = await deleteCampaign(id);
      if (r.archived) { setOk(r.message ?? "Archived"); await load(); }
      else router.push("/marketing/campaigns");
    } catch (e) { setErr((e as Error).message); }
  };

  if (!c) return <div className={WRAP}><Flash ok="" err={err} /><Empty title="Loading…" /></div>;

  const p = platformMeta(c.platform);
  const totalKnown = c.quality.reduce((n, q) => n + q.count, 0);
  const unknown = c.quality.find((q) => q.source === "UNATTRIBUTED")?.count ?? 0;

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow={`Campaign · ${c.campaignNo}`}
        title={`${p.emoji} ${c.name}`}
        sub={`${dayStr(c.startDate)} → ${dayStr(c.endDate)}${c.goalNote ? ` · ${c.goalNote}` : ""}`}
        emoji="🚀"
        tone={STATUS_TONE[c.status]}
        right={
          <>
            <button className={btnGhost} onClick={() => setEdit((v) => !v)}>{edit ? "Close" : "Edit"}</button>
            <button className={btnGhost} onClick={remove}>Remove</button>
            <Link className={btnGhost} href="/marketing/campaigns">All campaigns</Link>
          </>
        }
      />
      <Flash ok={ok} err={err} />

      {edit && <CampaignEditor c={c} onDone={async () => { setEdit(false); await load(); }} />}

      {/* THE three-line block. Contribution is the headline; the other two are
          here because Meta reports revenue and the owner will compare. */}
      <Card className="mb-5 overflow-hidden">
        <div className="px-5 py-3.5" style={{ background: TONE.brand.grad }}>
          <div className="font-display text-[16px] text-white">Did it come back?</div>
        </div>
        <div className="grid lg:grid-cols-[1.2fr_1fr]">
          <div className="p-5 border-r border-[var(--l-accent)]">
            <RoiLine label="Revenue (VAT excluded)" value={c.revenuePaisa} />
            <RoiLine label="− Cost of the goods" value={-c.cogsPaisa} />
            <RoiLine label="= Gross profit" value={c.revenuePaisa - c.cogsPaisa} bold />
            <RoiLine label="− Delivery cost" value={-c.deliveryCostPaisa} />
            <div className="mt-3 pt-3 border-t-2 border-[var(--l-accent)] flex items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-body-soft">What was left</div>
                <div className="text-[30px] font-bold leading-none mt-1"
                  style={{ color: c.contributionPaisa >= c.spentPaisa ? TONE.emerald.text : TONE.rose.text }}>
                  {taka(c.contributionPaisa)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-body-soft">Against spend of</div>
                <div className="text-[18px] font-bold text-purple">{taka(c.spentPaisa)}</div>
                <div className="text-[22px] mt-1"><Roi value={c.roi} /></div>
              </div>
            </div>
            {c.spentPaisa === 0 && (
              <div className="mt-3 text-[12px] rounded-xl px-3 py-2"
                style={{ background: TONE.amber.soft, color: TONE.amber.text }}>
                No expense is tagged to this campaign yet.
              </div>
            )}
          </div>

          <div className="p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-body-soft mb-3">
              How much of this do we actually know?
            </div>
            {totalKnown === 0 ? (
              <div className="text-[13px] text-body-soft">No orders attributed to this campaign yet.</div>
            ) : (
              <div className="space-y-2">
                {c.quality.map((q) => (
                  <div key={q.source} className="flex items-center justify-between gap-3">
                    <Chip tone={SOURCE_TONE[q.source]}>{SOURCE_LABEL[q.source]}</Chip>
                    <span className="text-[13px] font-semibold">{q.count}</span>
                  </div>
                ))}
              </div>
            )}
            {unknown > 0 && (
              <div className="mt-3 text-[12px] rounded-xl px-3 py-2"
                style={{ background: TONE.rose.soft, color: TONE.rose.text }}>
                {unknown} of these were set by hand or guessed.
              </div>
            )}
            <div className="mt-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-body-soft mb-1">Budget</div>
              <div className="text-[14px] font-semibold text-purple">{taka(c.budgetPaisa)} planned</div>
              {c.budgetPaisa > 0 && (
                <div className="text-[12px] text-body-soft mt-0.5">
                  {taka(c.spentPaisa)} spent · {pct(c.spentPaisa, c.budgetPaisa)}% of plan
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Money spent on this campaign" emoji="৳" tone="amber"
          sub="entered in Finance, tagged here"
          right={<Link className={btnGhost} href="/finance/expenses">Add in Finance</Link>}>
          {c.expenses.length === 0 ? (
            <Empty emoji="৳" title="Nothing tagged yet" />
          ) : (
            <Table head={<><Th>Date</Th><Th>Heading</Th><Th>Paid to</Th><Th right>Amount</Th></>}>
              {c.expenses.map((e) => (
                <tr key={e.id}>
                  <Td>{dayStr(e.spentAt)}</Td>
                  <Td>{e.account.name}</Td>
                  <Td>{e.payeeName ?? "—"}</Td>
                  <Td right>{taka(e.amountPaisa)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="Orders credited to this campaign" emoji="🛍" tone="emerald"
          sub={`${c.attributions.length} shown`}>
          {c.attributions.length === 0 ? (
            <Empty emoji="🛍" title="No orders yet" />
          ) : (
            <Table head={<><Th>Order</Th><Th>Customer</Th><Th>How we know</Th><Th right>Total</Th></>}>
              {c.attributions.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <Link className="font-semibold text-purple hover:underline" href={`/orders/${a.order.id}`}>
                      {a.order.orderNo}
                    </Link>
                    <div className="text-[11px] text-body-soft">{dayStr(a.order.placedAt)}</div>
                  </Td>
                  <Td>{a.order.senderName}</Td>
                  <Td>
                    <Chip tone={SOURCE_TONE[a.source]}>{SOURCE_LABEL[a.source]}</Chip>
                    {a.evidence && <div className="text-[11px] text-body-soft mt-0.5">{a.evidence}</div>}
                  </Td>
                  <Td right>{taka(a.order.totalPaisa)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>
    </div>
  );
}

function RoiLine({ label, value, note, bold }: { label: string; value: number; note?: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <div>
        <span className={`text-[13.5px] ${bold ? "font-bold text-purple" : "text-body"}`}>{label}</span>
        {note && <div className="text-[11px] text-body-soft">{note}</div>}
      </div>
      <span className={`text-[15px] tabular-nums ${bold ? "font-bold text-purple" : ""}`}>{taka(value)}</span>
    </div>
  );
}

function CampaignEditor({ c, onDone }: { c: ApiCampaignDetail; onDone: () => void }) {
  const [f, setF] = useState({
    name: c.name, platform: c.platform, status: c.status,
    startDate: dayStr(c.startDate), endDate: dayStr(c.endDate),
    budget: String(c.budgetPaisa / 100), goalNote: c.goalNote ?? "",
    utmKeys: c.utmKeys.join(", "),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setBusy(true); setErr("");
    try {
      await updateCampaign(c.id, {
        name: f.name, platform: f.platform, status: f.status,
        startDate: f.startDate, endDate: f.endDate,
        budgetPaisa: toPaisa(f.budget), goalNote: f.goalNote || null,
        utmKeys: f.utmKeys.split(",").map((s) => s.trim()).filter(Boolean),
      });
      onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Card className="p-5 mb-5">
      <Flash ok="" err={err} />
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2"><Lbl>Name</Lbl>
          <input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><Lbl>Where</Lbl>
          <select className={input} value={f.platform}
            onChange={(e) => setF({ ...f, platform: e.target.value as CampaignPlatform })}>
            {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.emoji} {p.label}</option>)}
          </select></div>
        <div><Lbl>Status</Lbl>
          <select className={input} value={f.status}
            onChange={(e) => setF({ ...f, status: e.target.value as CampaignStatus })}>
            {(["PLANNED", "RUNNING", "FINISHED", "ARCHIVED"] as CampaignStatus[]).map((s) =>
              <option key={s} value={s}>{s.toLowerCase()}</option>)}
          </select></div>
        <div><Lbl>Starts</Lbl>
          <input type="date" className={input} value={f.startDate}
            onChange={(e) => setF({ ...f, startDate: e.target.value })} /></div>
        <div><Lbl>Ends</Lbl>
          <input type="date" className={input} value={f.endDate}
            onChange={(e) => setF({ ...f, endDate: e.target.value })} /></div>
        <div><Lbl>Planned budget (৳)</Lbl>
          <input className={input} value={f.budget}
            onChange={(e) => setF({ ...f, budget: e.target.value })} /></div>
        <div className="md:col-span-2"><Lbl>Goal</Lbl>
          <input className={input} value={f.goalNote}
            onChange={(e) => setF({ ...f, goalNote: e.target.value })} /></div>
        <div><Lbl>Website link tags</Lbl>
          <input className={input} value={f.utmKeys}
            onChange={(e) => setF({ ...f, utmKeys: e.target.value })} /></div>
      </div>
      <div className="mt-4">
        <button className={btnPrimary} style={btnPrimaryStyle} onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </Card>
  );
}

/* ============================================================
   4 — OCCASIONS (MKT-D07)
   ============================================================ */

export function OccasionsView() {
  const [data, setData] = useState<ApiOccasions | null>(null);
  const [days, setDays] = useState(7);
  const [search, setSearch] = useState("");
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setData(await dueOccasions({ days, search })); } catch (e) { setErr((e as Error).message); }
  }, [days, search]);
  useEffect(() => { void load(); }, [load]);

  const contact = async (r: ApiOccasions["items"][number], channel: "WHATSAPP" | "PHONE", msg: string) => {
    setErr(""); setOk("");
    try {
      const res = await logOutreach({
        customerId: r.customer.id,
        recipientId: r.recipient.id,
        occasionType: r.type,
        occasionDate: r.date,
        occasionYear: r.occasionYear,
        channel,
        purpose: "OCCASION",
        message: channel === "WHATSAPP" ? msg : null,
      });
      setOk(res.duplicate ? (res.message ?? "Already contacted") : `Logged — ${r.customer.name}`);
      await load();
    } catch (e) { setErr((e as Error).message); }
  };

  /*  ⚠️ Opting somebody out of marketing is not prompt material — it is a
      standing instruction about a real person, and the reason typed with it is
      the only record of WHY. A prompt blocks the page and loses that reason on
      Escape.  */
  const [stopping, setStopping] = useState<{ id: string; name: string; reason: string } | null>(null);
  const stopContacting = async () => {
    if (!stopping) return;
    const { id: customerId, name, reason } = stopping;
    setStopping(null);
    try {
      await optOutCustomer({ customerId, reason: reason.trim() || null });
      setOk(`${name} will not appear in these lists again`);
      await load();
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className={WRAP}>
      {stopping && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] grid place-items-center p-4">
          <div className="bg-white rounded-[18px] shadow-lift border border-lavender-deep p-5 w-full max-w-[420px]">
            <h3 className="font-display text-[18px] text-purple m-0 mb-1">Stop marketing messages to {stopping.name}?</h3>
            <p className="text-[12.5px] text-body-soft mt-0 mb-4">
              They will not appear in these lists again. Order updates still reach them.
            </p>
            <input
              autoFocus
              className={input}
              value={stopping.reason}
              onChange={(e) => setStopping({ ...stopping, reason: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") void stopContacting(); if (e.key === "Escape") setStopping(null); }}
              placeholder="Why (optional) — e.g. asked us on the phone"
            />
            <div className="flex gap-2.5 mt-5">
              <button onClick={() => void stopContacting()} className="flex-1 text-white text-[13.5px] font-bold py-2.5 rounded-[11px]" style={{ background: "var(--s-bad)" }}>Stop contacting</button>
              <button onClick={() => setStopping(null)} className="border-[1.5px] border-lavender-deep text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px]">Cancel</button>
            </div>
          </div>
        </div>
      )}
      <FinHeader
        eyebrow="Marketing"
        title="Occasions coming up"
        emoji="🎂"
        tone="amber"
        right={
          <>
            <select className={`${input} w-auto`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={3}>Next 3 days</option>
              <option value={7}>Next 7 days</option>
              <option value={14}>Next 14 days</option>
              <option value={30}>Next 30 days</option>
            </select>
            <Link className={btnGhost} href="/marketing/outreach">History</Link>
          </>
        }
      />
      <Flash ok={ok} err={err} />

      <div className="mb-4">
        <input className={`${input} max-w-[320px]`} placeholder="Search name or phone…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card className="overflow-hidden">
        {!data || data.items.length === 0 ? (
          <Empty emoji="🌼" title="Nothing in this window" />
        ) : (
          <Table head={
            <><Th>When</Th><Th>Who to message</Th><Th>About</Th><Th>Last time</Th><Th right>Do</Th></>
          }>
            {data.items.map((r) => {
              const msg = fillTemplate(data.template, {
                customer: r.customer.name,
                recipient: r.recipient.name,
                occasion: r.type.toLowerCase(),
                date: r.onDate,
              });
              return (
                <tr key={r.occasionId} className={r.alreadyContacted ? "opacity-60" : ""}>
                  <Td>
                    <div className="font-semibold" style={{ color: r.inDays <= 1 ? TONE.rose.text : TONE.brand.text }}>
                      {r.inDays === 0 ? "Today" : `${r.inDays} day${r.inDays > 1 ? "s" : ""}`}
                    </div>
                    <div className="text-[11.5px] text-body-soft">{r.onDate}</div>
                  </Td>
                  <Td>
                    <Link className="font-semibold text-purple hover:underline" href={`/customers/${r.customer.id}`}>
                      {r.customer.name}
                    </Link>
                    <div className="text-[11.5px] text-body-soft">{r.customer.phone} · {r.customer.ordersCount} orders</div>
                  </Td>
                  <Td>
                    <Chip tone="brand">{r.type.toLowerCase()}</Chip>
                    <div className="text-[12px] mt-0.5">
                      {r.recipient.name} <span className="text-body-soft">· {r.recipient.relationship.toLowerCase()}</span>
                    </div>
                  </Td>
                  <Td>
                    {r.lastOrder ? (
                      <>
                        <div className="text-[12.5px]">{taka(r.lastOrder.totalPaisa)}</div>
                        <div className="text-[11px] text-body-soft">{ago(r.lastOrder.placedAt)}</div>
                      </>
                    ) : <span className="text-body-soft text-[12px]">—</span>}
                  </Td>
                  <Td right>
                    {r.alreadyContacted ? (
                      <Chip tone="emerald">contacted this year</Chip>
                    ) : (
                      <div className="flex items-center gap-1.5 justify-end flex-wrap">
                        <a className={btnPrimary} style={btnPrimaryStyle}
                          href={waLink(r.customer.phone, msg)} target="_blank" rel="noreferrer"
                          onClick={() => void contact(r, "WHATSAPP", msg)}>
                          WhatsApp
                        </a>
                        <a className={btnGhost} href={`tel:${r.customer.phone}`}
                          onClick={() => void contact(r, "PHONE", "")}>Call</a>
                        <button className={btnGhost}
                          onClick={() => setStopping({ id: r.customer.id, name: r.customer.name, reason: "" })}>Stop</button>
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}

/* ============================================================
   5 — OUTREACH HISTORY
   ============================================================ */

export function OutreachView() {
  const [rows, setRows] = useState<ApiOutreach[]>([]);
  const [effect, setEffect] = useState<Awaited<ReturnType<typeof outreachEffect>> | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([outreachHistory({ days: 90 }), outreachEffect(90)]);
      setRows(a); setEffect(b);
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing · Outreach"
        title="Who we talked to, and whether it worked"
        emoji="💬"
        tone="sky"
        right={
          <>
            <Link className={btnGhost} href="/marketing/occasions">Occasions due</Link>
            <Link className={btnGhost} href="/marketing/outreach/optouts">Do not contact</Link>
          </>
        }
      />
      <Flash ok="" err={err} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Contacted (90 days)" value={String(effect?.contacted ?? 0)} emoji="💬" tone="sky" />
        <Kpi label="Ordered afterwards" value={String(effect?.ordered ?? 0)} emoji="🛍" tone="emerald"
          hint={effect && effect.contacted > 0 ? `${pct(effect.ordered, effect.contacted)}% of those contacted` : ""} />
        <Kpi label="Revenue that followed" value={taka(effect?.revenuePaisa ?? 0)} emoji="৳" tone="emerald" />
        <Kpi label="By WhatsApp" value={String(effect?.byChannel.find((c) => c.channel === "WHATSAPP")?.contacted ?? 0)}
          emoji="📱" tone="brand" />
      </div>

      <Panel title="Contact history" emoji="💬" tone="sky" sub="last 90 days">
        {rows.length === 0 ? (
          <Empty emoji="💬" title="Nothing yet" />
        ) : (
          <Table head={<><Th>When</Th><Th>Customer</Th><Th>How</Th><Th>Why</Th><Th>By</Th></>}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>{ago(r.createdAt)}</Td>
                <Td>
                  <span className="font-semibold text-purple">{r.customer?.name ?? "—"}</span>
                  <div className="text-[11px] text-body-soft">{r.customer?.phone}</div>
                </Td>
                <Td><Chip tone={r.channel === "WHATSAPP" ? "emerald" : "sky"}>{r.channel.toLowerCase()}</Chip></Td>
                <Td>
                  <span className="text-[12.5px]">{r.purpose.toLowerCase().replace("_", " ")}</span>
                  {r.occasionType && <div className="text-[11px] text-body-soft">{r.occasionType.toLowerCase()}</div>}
                </Td>
                <Td><span className="text-[12px] text-body-soft">{r.actorName ?? "—"}</span></Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}

/* ---------------- do not contact — its own screen (MKT-RULE-009) ---------------- */

export function OptOutsView() {
  const [opts, setOpts] = useState<Awaited<ReturnType<typeof listOptOuts>>>([]);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setOpts(await listOptOuts()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const allowAgain = async (customerId: string, name: string) => {
    try { await optInCustomer(customerId); setOk(`${name} can be contacted again`); await load(); }
    catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing · Outreach"
        title="Do not contact"
        sub="Removed from every list, with no exception."
        emoji="🚫"
        tone="rose"
        right={<Link className={btnGhost} href="/marketing/outreach">Contact history</Link>}
      />
      <Flash ok={ok} err={err} />

      <Card className="overflow-hidden">
        {opts.length === 0 ? (
          <Empty emoji="🚫" title="Nobody has asked to be left alone" />
        ) : (
          <Table head={<><Th>Customer</Th><Th>Why</Th><Th>Since</Th><Th right></Th></>}>
            {opts.map((o) => (
              <tr key={o.id}>
                <Td>
                  <Link className="font-semibold text-purple hover:underline" href={`/customers/${o.customerId}`}>
                    {o.customer.name}
                  </Link>
                  <div className="text-[11px] text-body-soft">{o.customer.phone}</div>
                </Td>
                <Td><span className="text-[12.5px]">{o.reason ?? "—"}</span></Td>
                <Td>{ago(o.createdAt)}</Td>
                <Td right>
                  <button className={btnGhost} onClick={() => void allowAgain(o.customerId, o.customer.name)}>
                    Allow again
                  </button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

/* ============================================================
   6 — AFFILIATES
   ============================================================ */

const emptyAffiliate = () => ({
  type: "INDIVIDUAL" as "INDIVIDUAL" | "BUSINESS",
  name: "", phone: "", code: "", commission: "10",
  contactName: "", payoutMethod: "bKash", payoutNumber: "", note: "",
});

export function AffiliatesView() {
  const [rows, setRows] = useState<ApiAffiliate[]>([]);
  const [tab, setTab] = useState<"ALL" | "INDIVIDUAL" | "BUSINESS">("ALL");
  const [form, setForm] = useState(emptyAffiliate());
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setRows(await listAffiliates({ type: tab === "ALL" ? "" : tab })); }
    catch (e) { setErr((e as Error).message); }
  }, [tab]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setBusy(true); setErr(""); setOk("");
    try {
      const a = await createAffiliate({
        type: form.type, name: form.name, phone: form.phone,
        code: form.code || undefined,
        commissionBp: Math.round(Number(form.commission || "0") * 100),
        contactName: form.contactName || null,
        payoutMethod: form.payoutMethod || null,
        payoutNumber: form.payoutNumber || null,
        note: form.note || null,
      });
      setOk(`${a.name} added — their link code is ${a.code}`);
      setForm(emptyAffiliate()); setShowForm(false); await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const sweep = async () => {
    setBusy(true); setErr(""); setOk("");
    try {
      const r = await accrueCommissions();
      setOk(`Checked ${r.scanned} delivered orders — ${r.accrued} new commission${r.accrued === 1 ? "" : "s"} recorded`);
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing"
        title="Affiliates & partners"
        emoji="🤝"
        right={
          <>
            <button className={btnGhost} onClick={sweep} disabled={busy}>
              {busy ? "Working…" : "Check delivered orders"}
            </button>
            <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Close" : "Add affiliate"}
            </button>
          </>
        }
      />
      <Flash ok={ok} err={err} />

      {showForm && (
        <Card className="p-5 mb-5">
          <div className="grid md:grid-cols-3 gap-4">
            <div><Lbl>Kind</Lbl>
              <select className={input} value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as "INDIVIDUAL" | "BUSINESS" })}>
                <option value="INDIVIDUAL">A person (influencer, promoter)</option>
                <option value="BUSINESS">A business (hall, hospital, office)</option>
              </select></div>
            <div><Lbl>Name</Lbl>
              <input className={input} value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Lbl>Phone</Lbl>
              <input className={input} value={form.phone} placeholder="01XXXXXXXXX"
                onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            {form.type === "BUSINESS" && (
              <div><Lbl>Person to talk to</Lbl>
                <input className={input} value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></div>
            )}
            <div><Lbl>Their code (blank = made from the name)</Lbl>
              <input className={input} value={form.code} placeholder="RAFI"
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
            <div><Lbl>Commission %</Lbl>
              <input className={input} value={form.commission}
                onChange={(e) => setForm({ ...form, commission: e.target.value })} /></div>
            <div><Lbl>Pay them by</Lbl>
              <select className={input} value={form.payoutMethod}
                onChange={(e) => setForm({ ...form, payoutMethod: e.target.value })}>
                <option>bKash</option><option>Nagad</option><option>Bank</option><option>Cash</option>
              </select></div>
            <div><Lbl>Their number / account</Lbl>
              <input className={input} value={form.payoutNumber}
                onChange={(e) => setForm({ ...form, payoutNumber: e.target.value })} /></div>
          </div>
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <button className={btnPrimary} style={btnPrimaryStyle} onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Add"}
            </button>
            <span className="text-[12px] text-body-soft">
              Commission is worked out on the goods after discount.
            </span>
          </div>
        </Card>
      )}

      <Tabs value={tab} onChange={setTab} items={[
        { key: "ALL", label: "All", count: rows.length, emoji: "☰" },
        { key: "INDIVIDUAL", label: "People", emoji: "👤", tone: "brand" },
        { key: "BUSINESS", label: "Businesses", emoji: "🏢", tone: "sky" },
      ]} />

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty emoji="🤝" title="No affiliates yet" />
        ) : (
          <Table head={
            <><Th>Who</Th><Th>Code</Th><Th right>Rate</Th><Th right>Orders</Th>
              <Th right>On hold</Th><Th right>Ready to pay</Th><Th right>Paid</Th></>
          }>
            {rows.map((a) => (
              <tr key={a.id}>
                <Td>
                  <Link className="font-semibold text-purple hover:underline" href={`/marketing/affiliates/${a.id}`}>
                    {a.type === "BUSINESS" ? "🏢" : "👤"} {a.name}
                  </Link>
                  <div className="text-[11px] text-body-soft">
                    {a.phone}{a.status === "PAUSED" ? " · paused" : ""}
                  </div>
                </Td>
                <Td><code className="text-[12px] px-2 py-0.5 rounded-md"
                  style={{ background: TONE.brand.soft, color: TONE.brand.text }}>{a.code}</code></Td>
                <Td right>{bpToPct(a.commissionBp)}%</Td>
                <Td right>{a.orders ?? 0}</Td>
                <Td right>{taka(a.pendingPaisa ?? 0)}</Td>
                <Td right><span className="font-semibold"
                  style={{ color: (a.availablePaisa ?? 0) > 0 ? TONE.emerald.text : undefined }}>
                  {taka(a.availablePaisa ?? 0)}</span></Td>
                <Td right>{taka(a.paidPaisa ?? 0)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

/* ============================================================
   7 — AFFILIATE DETAIL + PAYOUT
   ============================================================ */

const COMMISSION_TONE: Record<string, Tone> = {
  PENDING: "amber", AVAILABLE: "emerald", PAID: "slate", REVERSED: "rose",
};

export function AffiliateDetail({ id }: { id: string }) {
  const [a, setA] = useState<ApiAffiliateDetail | null>(null);
  const [accounts, setAccounts] = useState<ApiFinanceAccount[]>([]);
  const [paidFromId, setPaidFromId] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");
  const [settings, setSettings] = useState<ApiMarketingSetting | null>(null);

  const load = useCallback(async () => {
    try {
      const [x, accs, s] = await Promise.all([getAffiliate(id), financeAccountsSafe(), marketingSettings()]);
      setA(x); setSettings(s);
      const money = (accs ?? []).filter((v) => v.isMoneyAccount && v.isActive);
      setAccounts(money);
      if (!paidFromId && money.length) {
        const bkash = money.find((m) => m.payMethod === "BKASH") ?? money[0];
        setPaidFromId(bkash.id);
      }
    } catch (e) { setErr((e as Error).message); }
  }, [id, paidFromId]);
  useEffect(() => { void load(); }, [load]);

  const pay = async () => {
    if (!a) return;
    setBusy(true); setErr(""); setOk("");
    try {
      const r = await payAffiliate({ affiliateId: a.id, paidFromId, reference: reference || undefined });
      setOk(
        `${r.payoutNo} — ${taka(r.netPaisa)} paid` +
        (r.recoveredPaisa > 0 ? `, after recovering ${taka(r.recoveredPaisa)} from returned orders` : "") +
        `. Ledger entry ${r.entryNo}.`,
      );
      setReference(""); await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  if (!a) return <div className={WRAP}><Flash ok="" err={err} /><Empty title="Loading…" /></div>;

  const link = `${WEB_BASE}/?ref=${a.code}`;
  const canPay = (a.availablePaisa ?? 0) > 0;

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow={`Affiliate · ${a.affiliateNo}`}
        title={`${a.type === "BUSINESS" ? "🏢" : "👤"} ${a.name}`}
        sub={`${a.phone}${a.contactName ? ` · ${a.contactName}` : ""} · ${bpToPct(a.commissionBp)}% on goods after discount`}
        emoji="🤝"
        right={<Link className={btnGhost} href="/marketing/affiliates">All affiliates</Link>}
      />
      <Flash ok={ok} err={err} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi label="On hold" value={taka(a.pendingPaisa ?? 0)} emoji="⏳" tone="amber"
          hint={settings ? `released ${settings.holdDays} days after delivery` : ""} />
        <Kpi label="Ready to pay" value={taka(a.availablePaisa ?? 0)} emoji="✓" tone="emerald" />
        <Kpi label="Paid so far" value={taka(a.paidPaisa ?? 0)} emoji="↗" tone="slate" />
        <Kpi label="Owed back to us" value={taka(a.recoverablePaisa)} emoji="↩"
          tone={a.recoverablePaisa > 0 ? "rose" : "slate"}
          hint={a.recoverablePaisa > 0 ? "nets off the next payout" : ""} />
      </div>

      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-4">
        <div className="space-y-4">
          <Panel title="Their link" emoji="🔗" tone="brand">
            <div className="p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-body-soft mb-1">Code</div>
              <code className="text-[16px] font-bold px-3 py-1.5 rounded-lg inline-block"
                style={{ background: TONE.brand.soft, color: TONE.brand.text }}>{a.code}</code>
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-body-soft mt-4 mb-1">Link to share</div>
              <div className="text-[12.5px] break-all px-3 py-2 rounded-lg border border-[var(--l-accent)] bg-[var(--s-accent)]">{link}</div>
              <button className={`${btnGhost} mt-2`}
                onClick={() => { void navigator.clipboard?.writeText(link); setOk("Link copied"); }}>
                Copy link
              </button>
            </div>
          </Panel>

          <Panel title="Pay them" emoji="৳" tone={canPay ? "emerald" : "slate"}>
            <div className="p-4">
              {!canPay ? (
                <p className="text-[13px] text-body-soft m-0">
                  Nothing available yet — commission is on hold until the return window has passed.
                </p>
              ) : (
                <>
                  <div className="text-[24px] font-bold mb-1" style={{ color: TONE.emerald.text }}>
                    {taka(a.availablePaisa ?? 0)}
                  </div>
                  {a.recoverablePaisa > 0 && (
                    <div className="text-[12px] mb-2" style={{ color: TONE.rose.text }}>
                      − {taka(a.recoverablePaisa)} recovered from returned orders
                    </div>
                  )}
                  <div className="mt-3"><Lbl>Money comes out of</Lbl>
                    <select className={input} value={paidFromId} onChange={(e) => setPaidFromId(e.target.value)}>
                      {accounts.map((m) => <option key={m.id} value={m.id}>{m.name} — {taka(m.balancePaisa)}</option>)}
                    </select></div>
                  <div className="mt-3"><Lbl>Reference (bKash txn id)</Lbl>
                    <input className={input} value={reference} onChange={(e) => setReference(e.target.value)} /></div>
                  <button className={`${btnPrimary} mt-4 w-full`} style={btnPrimaryStyle}
                    onClick={pay} disabled={busy || !paidFromId}>
                    {busy ? "Paying…" : `Pay ${taka((a.availablePaisa ?? 0) - a.recoverablePaisa)}`}
                  </button>
                  <p className="text-[11.5px] text-body-soft mt-2 mb-0">
                    Owner only — the PIN is asked every time.
                  </p>
                </>
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Commission ledger" emoji="📒" tone="slate" sub="one row per order">
            {a.commissions.length === 0 ? (
              <Empty emoji="📒" title="Nothing earned yet" />
            ) : (
              <Table head={<><Th>Order</Th><Th>Base</Th><Th right>Rate</Th><Th right>Earned</Th><Th>State</Th></>}>
                {a.commissions.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <Link className="font-semibold text-purple hover:underline" href={`/orders/${c.order.id}`}>
                        {c.order.orderNo}
                      </Link>
                      <div className="text-[11px] text-body-soft">{dayStr(c.order.placedAt)}</div>
                    </Td>
                    <Td>{taka(c.basePaisa)}</Td>
                    <Td right>{bpToPct(c.rateBp)}%</Td>
                    <Td right><span className="font-semibold">{taka(c.amountPaisa)}</span></Td>
                    <Td>
                      <Chip tone={COMMISSION_TONE[c.state]}>{c.state.toLowerCase()}</Chip>
                      {c.state === "PENDING" && (
                        <div className="text-[11px] text-body-soft mt-0.5">free {dayStr(c.availableAt)}</div>
                      )}
                      {c.reversedNote && (
                        <div className="text-[11px] mt-0.5" style={{ color: TONE.rose.text }}>{c.reversedNote}</div>
                      )}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>

          <Panel title="Payouts" emoji="↗" tone="slate">
            {a.payouts.length === 0 ? (
              <Empty emoji="↗" title="Nothing paid out yet" />
            ) : (
              <Table head={<><Th>No.</Th><Th>When</Th><Th right>Earned</Th><Th right>Recovered</Th><Th right>Paid</Th></>}>
                {a.payouts.map((p) => (
                  <tr key={p.id}>
                    <Td><span className="font-semibold text-purple">{p.payoutNo}</span>
                      {p.reference && <div className="text-[11px] text-body-soft">{p.reference}</div>}</Td>
                    <Td>{dayStr(p.createdAt)}</Td>
                    <Td right>{taka(p.amountPaisa)}</Td>
                    <Td right>{p.recoveredPaisa > 0 ? taka(p.recoveredPaisa) : "—"}</Td>
                    <Td right><span className="font-semibold">{taka(p.netPaisa)}</span></Td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   8 — SETTINGS
   ============================================================ */

export function MarketingSettingsView() {
  const [s, setS] = useState<ApiMarketingSetting | null>(null);
  const [f, setF] = useState({ rate: "10", hold: "7", min: "500", ref: "30", lead: "7, 3", tpl: "" });
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const x = await marketingSettings();
        setS(x);
        setF({
          rate: bpToPct(x.defaultCommissionBp),
          hold: String(x.holdDays),
          min: String(x.minWithdrawPaisa / 100),
          ref: String(x.refWindowDays),
          lead: x.reminderLeadDays.join(", "),
          tpl: x.whatsappTemplate,
        });
      } catch (e) { setErr((e as Error).message); }
    })();
  }, []);

  const save = async () => {
    setBusy(true); setErr(""); setOk("");
    try {
      const x = await saveMarketingSettings({
        defaultCommissionBp: Math.round(Number(f.rate || "0") * 100),
        holdDays: Number(f.hold || "0"),
        minWithdrawPaisa: toPaisa(f.min),
        refWindowDays: Number(f.ref || "30"),
        reminderLeadDays: f.lead.split(",").map((v) => Number(v.trim())).filter((v) => !Number.isNaN(v)),
        whatsappTemplate: f.tpl,
      });
      setS(x); setOk("Saved");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing"
        title="Settings"
        emoji="⚙"
        tone="slate"
      />
      <Flash ok={ok} err={err} />

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Affiliate money" emoji="🤝" tone="brand">
          <div className="p-5 grid md:grid-cols-2 gap-4">
            <div><Lbl>Default commission %</Lbl>
              <input className={input} value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />
</div>
            <div><Lbl>Days on hold after delivery</Lbl>
              <input className={input} value={f.hold} onChange={(e) => setF({ ...f, hold: e.target.value })} />
</div>
            <div><Lbl>Smallest withdrawal (৳)</Lbl>
              <input className={input} value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></div>
            <div><Lbl>Link stays attached for (days)</Lbl>
              <input className={input} value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></div>
          </div>
        </Panel>

        <Panel title="Occasion reminders" emoji="🎂" tone="amber">
          <div className="p-5">
            <Lbl>Remind this many days before (comma separated)</Lbl>
            <input className={input} value={f.lead} onChange={(e) => setF({ ...f, lead: e.target.value })} />
            <div className="mt-4">
              <Lbl>The WhatsApp message</Lbl>
              <textarea className={`${input} min-h-[120px]`} value={f.tpl}
                onChange={(e) => setF({ ...f, tpl: e.target.value })} />
              <p className="text-[11.5px] text-body-soft mt-2 mb-0">
                <code>{"{customer}"}</code> <code>{"{recipient}"}</code> <code>{"{occasion}"}</code>{" "}
                <code>{"{date}"}</code> are filled in.
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-5">
        <button className={btnPrimary} style={btnPrimaryStyle} onClick={save} disabled={busy || !s}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
}
