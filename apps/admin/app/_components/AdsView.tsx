"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  WRAP, FinHeader, Panel, Kpi, Chip, Empty, Flash, Banner,
  Table, Th, Td, btnPrimary, btnPrimaryStyle, btnGhost, input, Lbl,
} from "./FinanceUI";
import {
  adsSummary, adsTest, adsPull, adsLink,
  trackingSettings, saveTracking,
  type ApiAdSummary, type ApiTracking,
} from "../_data/api";

/*
  META AD NUMBERS — MKT-D20.

  What this screen is: what Facebook and Instagram charged, and what it bought.
  Spend, impressions, clicks, CTR, cost per click — per campaign, without
  leaving the panel and without logging into Business Manager.

  ⚠️ WHAT IT IS NOT: the money.

  Meta reports what it billed, in the ad account's currency — usually US
  dollars for a Bangladeshi account. The bank charges something else once the
  conversion rate, the card fee and the government's levies land. Both figures
  are true and they never agree. So nothing on this screen writes to the
  ledger. The button hands the number to the Finance expense form and a person
  types what the statement actually says. Finance owns every taka (MKT-D05),
  and the books keep agreeing with the bank rather than with Facebook.

  This is also the one marketing screen that is fully useful TODAY. Every other
  one waits on the storefront being able to take an order. The ads are already
  running and already costing money — these numbers are real right now.
*/

const nf = new Intl.NumberFormat("en-US");

/** money in the AD ACCOUNT's currency — deliberately not the taka formatter,
    because using ৳ here would be the exact lie this screen exists to avoid */
const cash = (minor: number, ccy: string) =>
  `${ccy === "BDT" ? "৳" : ccy === "USD" ? "$" : `${ccy} `}${(minor / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

export function AdsView() {
  const [data, setData] = useState<ApiAdSummary | null>(null);
  const [tr, setTr] = useState<ApiTracking | null>(null);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState("");
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");
  const [showKeys, setShowKeys] = useState(false);
  const [acct, setAcct] = useState("");
  const [token, setToken] = useState("");
  const [ccy, setCcy] = useState("USD");

  const load = useCallback(async (d = days) => {
    try {
      const [s, t] = await Promise.all([adsSummary(d), trackingSettings()]);
      setData(s); setTr(t);
      setAcct(t.adAccountId ?? "");
      setCcy(t.adsCurrency ?? "USD");
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load");
    }
  }, [days]);
  useEffect(() => { void load(); }, [load]);

  const flash = (m: string) => { setOk(m); setErr(""); window.setTimeout(() => setOk(""), 6000); };
  const fail = (e: unknown) => { setErr(e instanceof Error ? e.message : "Something went wrong"); setOk(""); };

  const ready = !!tr?.adsEnabled && !!tr?.adAccountId && !!tr?.adsTokenSet;

  const saveKeys = async () => {
    setBusy("keys");
    try {
      const body: Record<string, unknown> = {
        adAccountId: acct, adsCurrency: ccy, adsEnabled: true,
      };
      if (token.trim()) body.adsAccessToken = token.trim();
      await saveTracking(body);
      setToken("");
      await load();
      flash("Saved.");
    } catch (e) { fail(e); } finally { setBusy(""); }
  };

  const doTest = async () => {
    setBusy("test");
    try {
      const r = await adsTest();
      flash(`${r.name || r.id} — ${r.note} Billing currency: ${r.currency}.`);
      if (r.currency && r.currency !== ccy) {
        setCcy(r.currency);
        await saveTracking({ adsCurrency: r.currency });
        await load();
      }
    } catch (e) { fail(e); } finally { setBusy(""); }
  };

  const doPull = async () => {
    setBusy("pull");
    try {
      const r = await adsPull(days);
      await load();
      flash(r.rows === 0
        ? `No campaign rows in the last ${r.days} days.`
        : `Pulled ${r.rows} day-rows for the last ${r.days} days.`);
    } catch (e) { fail(e); } finally { setBusy(""); }
  };

  const relink = async (extId: string, campaignId: string) => {
    try {
      await adsLink(extId, campaignId || null);
      await load();
    } catch (e) { fail(e); }
  };

  /*  Prefill the Finance expense form. Deliberately NOT the amount when the ad
      account bills in dollars — offering a dollar figure in a taka field is how
      a wrong number ends up in the books looking confident. */
  const bookIt = (name: string, spendMinor: number, campaignId: string | null) => {
    const q = new URLSearchParams();
    q.set("payee", "Meta Platforms");
    q.set("note", `Facebook/Instagram ads — ${name} (last ${days} days)`);
    if (campaignId) q.set("campaignId", campaignId);
    if (data?.isTaka) q.set("amount", (spendMinor / 100).toFixed(2));
    return `/finance/expenses?${q.toString()}`;
  };

  const totalCcy = data?.currency ?? ccy;

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing & Growth"
        title="Ad numbers — Meta"
        emoji="📊"
        tone="sky"
        right={
          <div className="flex items-center gap-2">
            <select
              className="rounded-xl px-3 py-2 text-[13px] font-semibold bg-white/90 text-[#075985] border-0"
              value={days}
              onChange={(e) => { const d = Number(e.target.value); setDays(d); void load(d); }}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button
              className="rounded-xl px-4 py-2 text-[13px] font-semibold bg-white text-[#075985] disabled:opacity-60"
              disabled={!ready || busy === "pull"}
              onClick={() => void doPull()}
            >
              {busy === "pull" ? "Fetching…" : "Fetch from Meta"}
            </button>
          </div>
        }
      />
      <Flash ok={ok} err={err} />

      {/* the one thing nobody must misread */}
      <Banner tone="amber" emoji="⚠️" title="These figures are not the books.">
        Meta reports what it billed{data && !data.isTaka ? ` in ${totalCcy}` : ""}; the bank charges something else.
      </Banner>

      {!ready && (
        <Banner
          tone="sky"
          emoji="🔌"
          title="Not connected yet"
          right={
            <button className={btnGhost} onClick={() => setShowKeys((v) => !v)}>
              {showKeys ? "Hide" : "Connect the ad account"}
            </button>
          }
        >
          Needs the ad account id (<code>act_…</code>) and a token with <b>ads_read</b> permission.
        </Banner>
      )}

      {(showKeys || !ready) && (
        <Panel
          title="Ad account"
          emoji="🔑"
          tone="slate"
          className="mb-6"
        >
          <div className="px-5 py-5 grid md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-2">
              <Lbl>Ad account id</Lbl>
              {/*  autoComplete="off" is ignored by Chrome on anything that looks
                   like a sign-in form, and it happily offered to fill this with
                   the saved username — which would have been saved as the ad
                   account id. "new-password" is the one value it obeys. */}
              <input className={input} placeholder="act_1234567890" value={acct}
                name="radian-ad-account" autoComplete="new-password"
                data-1p-ignore data-lpignore="true"
                onChange={(e) => setAcct(e.target.value)} />
            </div>
            <div>
              <Lbl>Bills in</Lbl>
              <select className={input} value={ccy} onChange={(e) => setCcy(e.target.value)}>
                <option value="USD">USD — US dollars</option>
                <option value="BDT">BDT — taka</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <Lbl>Access token (ads_read)</Lbl>
              <input className={input} type="password" autoComplete="new-password"
                name="radian-ads-token" data-1p-ignore data-lpignore="true"
                placeholder={tr?.adsTokenSet ? "•••••••• — a token is saved. Type to replace it." : "paste the token"}
                value={token} onChange={(e) => setToken(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button className={btnPrimary} style={btnPrimaryStyle}
                disabled={!acct.trim() || busy === "keys"} onClick={() => void saveKeys()}>
                {busy === "keys" ? "Saving…" : "Save"}
              </button>
              <button className={btnGhost} disabled={!tr?.adsTokenSet || busy === "test"}
                onClick={() => void doTest()}>
                {busy === "test" ? "Checking…" : "Check the connection"}
              </button>
            </div>
          </div>
        </Panel>
      )}

      {data && (
        <>
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <Kpi label={`Spend · last ${data.days} days`} value={cash(data.totalSpendMinor, totalCcy)}
              tone="amber" emoji="💸"
              hint={data.isTaka ? "the ad account bills in taka" : `reported in ${totalCcy} — not taka`} />
            <Kpi label="Impressions" value={nf.format(data.totalImpressions)} tone="sky" emoji="👁"
              hint="times an ad was on somebody's screen" />
            <Kpi label="Clicks" value={nf.format(data.totalClicks)} tone="brand" emoji="🖱"
              hint={data.totalImpressions > 0
                ? `${((data.totalClicks / data.totalImpressions) * 100).toFixed(2)}% clicked through`
                : undefined} />
            <Kpi label="Cost per click"
              value={data.totalClicks > 0
                ? cash(Math.round(data.totalSpendMinor / data.totalClicks), totalCcy)
                : "—"}
              tone="slate" emoji="🎯"
              hint={data.lastFetched
                ? `fetched ${new Date(data.lastFetched).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`
                : "not fetched yet"} />
          </div>

          <Panel title="By campaign" emoji="📈" tone="sky">
            {data.items.length === 0 ? (
              <Empty
                emoji="📭"
                title="Nothing fetched yet"
                sub={ready ? "Press “Fetch from Meta” above." : "Connect the ad account first."}
              />
            ) : (
              <Table head={
                <>
                  <Th>Meta campaign</Th>
                  <Th right>Spend</Th>
                  <Th right>Impressions</Th>
                  <Th right>Clicks</Th>
                  <Th right>CTR</Th>
                  <Th right>Cost/click</Th>
                  <Th>Belongs to</Th>
                  <Th />
                </>
              }>
                {data.items.map((c) => (
                  <tr key={c.id} className="border-t border-[#f1ecf6] hover:bg-[#fdfbff]">
                    <Td>
                      <div className="font-semibold text-[13px]">{c.name}</div>
                      <div className="text-[11px] text-body-soft">
                        last day {new Date(c.lastDay).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        {" · "}reach {nf.format(c.reach)}
                      </div>
                    </Td>
                    <Td right><span className="font-semibold">{cash(c.spendMinor, c.currency)}</span></Td>
                    <Td right>{nf.format(c.impressions)}</Td>
                    <Td right>{nf.format(c.clicks)}</Td>
                    <Td right>
                      {c.impressions > 0 ? (
                        <Chip tone={c.ctr >= 0.01 ? "emerald" : c.ctr >= 0.005 ? "amber" : "rose"}>
                          {(c.ctr * 100).toFixed(2)}%
                        </Chip>
                      ) : "—"}
                    </Td>
                    <Td right>{c.clicks > 0 ? cash(c.cpcMinor, c.currency) : "—"}</Td>
                    <Td>
                      <select
                        className="text-[12px] rounded-lg border border-[#e7dff0] px-2 py-1 bg-white max-w-[190px]"
                        value={c.linkedTo?.id ?? ""}
                        onChange={(e) => void relink(c.id, e.target.value)}
                      >
                        <option value="">— not tied —</option>
                        {data.campaigns.map((r) => (
                          <option key={r.id} value={r.id}>{r.campaignNo} · {r.name}</option>
                        ))}
                      </select>
                    </Td>
                    <Td right>
                      <Link className={btnGhost} href={bookIt(c.name, c.spendMinor, c.linkedTo?.id ?? null)}>
                        Put it in the books
                      </Link>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>

        </>
      )}
    </div>
  );
}
