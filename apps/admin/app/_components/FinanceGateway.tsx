"use client";

/*
  /finance/gateway — DEC-FIN-029 / DEC-FIN-030.

  SSLCommerz does not hand money over as it is taken. It holds every online
  payment, waits until enough has built up, skips bank holidays, and then sends
  one lump sum to the shop's bank. So the Gateway account runs permanently
  ahead of the bank, and this page is where that gap is shown, checked and
  closed.

  ⚠️ The page has ONE number, and everything else serves it: what the gateway
  is still holding. It is worked out from our own ledger so that it can be held
  up against SSLCommerz's own "Unsettled Payable" — two independent systems
  agreeing is the only reconciliation worth doing. A page that showed the
  gateway's own figure back to itself would agree with itself for ever.

  ⚠️ THE OPENING BALANCE IS NOT SET HERE. On go-live day the gateway is already
  holding money from before this system existed; that figure is typed once, per
  account, on Finance → Money accounts, and freezes after the opening entry
  posts (DEC-FIN-007). This page links there rather than offering a second box,
  because two places to type one fact is how the two stop agreeing.

  House rules: brand palette only, coloured spine, icon in a tinted square,
  number large (rule 17); no loose prose — explanations behind the ⓘ; bold
  buttons that say what they do (rule 16).
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, apiPatch, apiPost } from "../_data/api";
import { Info } from "./ItemEditor";
import { Flash, Lbl, Table, Td, Th, WRAP, btnPrimary, btnPrimaryStyle, input, taka, toPaisa, todayStr } from "./FinanceUI";

/*  Four shades of one family — the same discipline as the tag groups the owner
    approved (22 Aug: "color jen amder brand color ar maje hoy"). `ink` writes
    the number and the icon, `wash` is the tint the panel sits on, `edge` is the
    spine down its left side.  */
const BRAND = {
  purple: { ink: "var(--t-accent)", wash: "var(--s-accent)", edge: "var(--l-accent)" },
  orchid: { ink: "var(--t-orchid)", wash: "var(--s-orchid)", edge: "var(--l-orchid)" },
  rose: { ink: "var(--t-gold)", wash: "var(--s-bad)", edge: "var(--l-gold)" },
  lavender: { ink: "var(--t-accent)", wash: "var(--s-info)", edge: "var(--l-info)" },
} as const;

interface Destination { id: string; code: string; name: string; balancePaisa: number }
interface Payout {
  id: string;
  transferNo: string;
  movedAt: string;
  amountPaisa: number;
  toName: string | null;
  note: string | null;
  actorName: string;
}
interface Overcharge {
  id: string;
  orderNo: string | null;
  createdAt: string;
  amountPaisa: number;
  feePaisa: number;
  expectedPaisa: number;
}
interface GatewaySummary {
  gatewayAccountId: string;
  gatewayName: string;
  heldPaisa: number;
  openingPaisa: number;
  inPaisa: number;
  outPaisa: number;
  destinations: Destination[];
  recent: Payout[];
  terms: { minimumPaisa: number; rateBps: number; note: string };
  overcharged: Overcharge[];
}

const HELD_INFO =
  "From our own ledger — compare it with 'Unsettled Payable' on the SSLCommerz panel.";

const OPENING_INFO =
  "Set once on Money accounts; it freezes after the opening entry posts.";

const PAYOUT_INFO =
  "Type what the bank actually received, from the statement.";

const THRESHOLD_INFO =
  "The gateway pays out only once this much has built up.";

const RATE_INFO =
  "Watches only — a payment where the gateway keeps more is listed. 0 watches nothing.";

/* ─────────────── the shared shapes this page is built from ─────────────── */

function Panel({
  title,
  icon,
  theme = BRAND.purple,
  right,
  children,
  className = "",
}: {
  title: string;
  icon: React.ReactNode;
  theme?: { ink: string; wash: string; edge: string };
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-white rounded-[18px] shadow-soft overflow-hidden ${className}`}
      style={{ border: `1px solid ${theme.edge}33` }}
    >
      <header
        className="relative grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-4 border-b"
        style={{ background: `linear-gradient(135deg,${theme.wash},#ffffff)`, borderColor: `${theme.edge}2e` }}
      >
        <span className="absolute left-0 right-0 top-0 h-[3px]" style={{ background: theme.edge }} />
        <span
          className="w-[38px] h-[38px] rounded-[11px] grid place-items-center text-[17px] shrink-0"
          style={{ background: `${theme.edge}22`, color: theme.ink }}
        >
          {icon}
        </span>
        <h2 className="text-[15px] font-bold" style={{ color: theme.ink }}>{title}</h2>
        <div>{right}</div>
      </header>
      {children}
    </section>
  );
}

/** one line of the hero's working-out */
function Step({ label, value, sign, info }: { label: string; value: string; sign?: string; info?: string }) {
  return (
    <div className="flex items-center justify-between py-[7px]">
      <span className="flex items-center gap-1 text-[12.5px] text-body-soft">
        {label}
        {info ? <Info text={info} /> : null}
      </span>
      <span className="text-[13.5px] font-semibold tabular-nums" style={{ color: "var(--t-accent)" }}>
        {sign ? <span className="text-body-soft mr-1">{sign}</span> : null}
        {value}
      </span>
    </div>
  );
}

/* ──────────────────────────── the page ──────────────────────────── */

export function GatewaySettlementLive() {
  const [data, setData] = useState<GatewaySummary | null>(null);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");
  const [f, setF] = useState({ toAccountId: "", amount: "", settledOn: todayStr(), note: "" });
  /*  The terms are held as text while being typed, so a half-deleted "2.5"
      does not snap back to a number mid-keystroke.  */
  const [t, setT] = useState({ minimum: "", rate: "" });

  const load = useCallback(async () => {
    try {
      const d = await apiGet<GatewaySummary>("/finance/gateway");
      setData(d);
      setT({ minimum: String(d.terms.minimumPaisa / 100), rate: String(d.terms.rateBps / 100) });
      setF((p) => ({
        ...p,
        toAccountId:
          p.toAccountId || (d.destinations.find((x) => x.code === "1040")?.id ?? d.destinations[0]?.id ?? ""),
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "API offline");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const held = data?.heldPaisa ?? 0;
  const typed = toPaisa(f.amount);
  const tooMuch = typed > held;
  const canSave = typed > 0 && !tooMuch && !!f.toAccountId;
  const leftAfter = useMemo(() => Math.max(0, held - (typed > 0 ? typed : 0)), [held, typed]);
  const belowThreshold = held > 0 && held < (data?.terms.minimumPaisa ?? 0);

  return (
    <div className={WRAP}>
      {/*  No page header band and no paragraph — the hero below says what this
           is by being it (rule 17).  */}
      <Flash ok={ok} err={err} />

      {/* ─────────── the one number, and its working ─────────── */}
      <section
        className="rounded-[22px] overflow-hidden shadow-soft mb-6"
        style={{ border: `1px solid ${BRAND.purple.edge}33` }}
      >
        <div className="grid lg:grid-cols-[1.15fr_1fr]">
          {/* left: the number */}
          <div
            className="relative px-8 py-9"
            style={{ background: `linear-gradient(135deg,${BRAND.purple.ink} 0%, var(--a-solid) 100%)` }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11.5px] font-bold tracking-[0.14em] text-white/70 uppercase">
                Waiting at the gateway
              </span>
            </div>
            <div className="text-white font-bold leading-none text-[46px] md:text-[54px] tabular-nums">
              {taka(held)}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <a
                href="https://report.sslcommerz.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-[12.5px] font-bold px-3.5 py-1.5 transition"
              >
                Compare with the SSLCommerz panel ↗
              </a>
              <span className="inline-flex items-center">
                <Info text={HELD_INFO} />
              </span>
            </div>
            {belowThreshold && (
              <div className="mt-4 text-[12.5px] text-white/80 leading-snug max-w-[36ch]">
                Not late — the gateway sends it once it passes{" "}
                <b className="text-white">{taka(data?.terms.minimumPaisa ?? 0)}</b>.
              </div>
            )}
          </div>

          {/* right: how that number was reached */}
          <div className="bg-white px-7 py-6">
            <div className="text-[11.5px] font-bold tracking-[0.12em] text-body-soft uppercase mb-2">
              How it adds up
            </div>
            <Step
              label="Already there when we started"
              value={taka(data?.openingPaisa ?? 0)}
              info={OPENING_INFO}
            />
            <Step label="Taken in for us since" value={taka(data?.inPaisa ?? 0)} sign="+" />
            <Step label="Paid over to the bank" value={taka(data?.outPaisa ?? 0)} sign="−" />
            <div
              className="flex items-center justify-between pt-3 mt-2 border-t"
              style={{ borderColor: `${BRAND.purple.edge}33` }}
            >
              <span className="text-[13px] font-bold" style={{ color: BRAND.purple.ink }}>
                Still with the gateway
              </span>
              <span className="text-[17px] font-bold tabular-nums" style={{ color: BRAND.purple.ink }}>
                {taka(held)}
              </span>
            </div>
            <Link
              href="/finance/accounts"
              className="inline-block mt-4 text-[12.5px] font-bold underline decoration-dotted"
              style={{ color: BRAND.purple.ink }}
            >
              Set the opening balance →
            </Link>
          </div>
        </div>
      </section>

      {/* ─────────── the watchdog, only when it has something to say ─────────── */}
      {(data?.overcharged.length ?? 0) > 0 && (
        <Panel title="The gateway kept more than expected" icon="⚠" theme={BRAND.rose} className="mb-6">
          <Table
            head={
              <>
                <Th w="130px">Order</Th>
                <Th w="120px">Date</Th>
                <Th right>Customer paid</Th>
                <Th right>Expected cut</Th>
                <Th right w="150px">Actually kept</Th>
              </>
            }
          >
            {data?.overcharged.map((o) => (
              <tr key={o.id}>
                <Td><span className="font-semibold" style={{ color: BRAND.purple.ink }}>{o.orderNo ?? "—"}</span></Td>
                <Td><span className="text-body-soft">{String(o.createdAt).slice(0, 10)}</span></Td>
                <Td right>{taka(o.amountPaisa)}</Td>
                <Td right><span className="text-body-soft">{taka(o.expectedPaisa)}</span></Td>
                <Td right>
                  <span className="font-bold" style={{ color: BRAND.rose.ink }}>{taka(o.feePaisa)}</span>
                </Td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}

      {/* ─────────── the two things you can do here ─────────── */}
      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-5 mb-6">
        <Panel title="The bank got a payout" icon="🏦" theme={BRAND.lavender}>
          <div className="px-5 py-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Lbl>Date the bank got it</Lbl>
                <input
                  type="date"
                  className={input}
                  value={f.settledOn}
                  onChange={(e) => setF({ ...f, settledOn: e.target.value })}
                />
              </div>
              <div>
                <span className="flex items-center gap-1">
                  <Lbl>Amount (৳)</Lbl>
                  <Info text={PAYOUT_INFO} />
                </span>
                <input
                  className={input}
                  value={f.amount}
                  placeholder="0.00"
                  onChange={(e) => setF({ ...f, amount: e.target.value })}
                />
              </div>
              <div>
                <Lbl>Landed in</Lbl>
                <select
                  className={input}
                  value={f.toAccountId}
                  onChange={(e) => setF({ ...f, toAccountId: e.target.value })}
                >
                  {(data?.destinations ?? []).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Lbl>Reference</Lbl>
                <input
                  className={input}
                  value={f.note}
                  placeholder="optional"
                  onChange={(e) => setF({ ...f, note: e.target.value })}
                />
              </div>
            </div>

            {typed > 0 && !tooMuch && (
              <div className="text-[12.5px] text-body-soft mt-4">
                Still with the gateway after this:{" "}
                <b style={{ color: BRAND.purple.ink }}>{taka(leftAfter)}</b>
              </div>
            )}
            {tooMuch && (
              <div className="text-[12.5px] mt-4 leading-snug" style={{ color: BRAND.rose.ink }}>
                <b>The gateway is only holding {taka(held)}.</b> Check it against the statement.
              </div>
            )}

            <button
              className={`${btnPrimary} mt-5 w-full sm:w-auto`}
              style={btnPrimaryStyle}
              disabled={!canSave}
              onClick={async () => {
                try {
                  await apiPost("/finance/gateway/settle", {
                    toAccountId: f.toAccountId,
                    amountPaisa: typed,
                    settledOn: f.settledOn,
                    note: f.note.trim() || undefined,
                  });
                  setF({ ...f, amount: "", note: "" });
                  await load();
                  setErr("");
                  setOk("Payout recorded");
                  window.setTimeout(() => setOk(""), 4000);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Could not save");
                }
              }}
            >
              Record payout
            </button>
          </div>
        </Panel>

        {/*  Rule 7 — these are SSLCommerz's terms, not ours, so they live in a
             box the owner can reach rather than in the code.  */}
        <Panel title="The gateway's terms" icon="📏" theme={BRAND.orchid}>
          <div className="px-5 py-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <span className="flex items-center gap-1">
                  <Lbl>Pays out above (৳)</Lbl>
                  <Info text={THRESHOLD_INFO} />
                </span>
                <input
                  className={input}
                  value={t.minimum}
                  onChange={(e) => setT({ ...t, minimum: e.target.value })}
                />
              </div>
              <div>
                <span className="flex items-center gap-1">
                  <Lbl>Expected cut (%)</Lbl>
                  <Info text={RATE_INFO} />
                </span>
                <input
                  className={input}
                  value={t.rate}
                  onChange={(e) => setT({ ...t, rate: e.target.value })}
                />
              </div>
            </div>
            <button
              className={`${btnPrimary} mt-5 w-full sm:w-auto`}
              style={btnPrimaryStyle}
              onClick={async () => {
                try {
                  await apiPatch("/finance/settings", {
                    gatewayPayoutMinPaisa: toPaisa(t.minimum),
                    /*  Percent on the screen, basis points in the database — 2.5%
                        is 250, so the stored number carries no fraction and
                        cannot drift by rounding.  */
                    gatewayFeeRateBps: Math.round(Number(t.rate || "0") * 100),
                  });
                  await load();
                  setErr("");
                  setOk("Terms saved");
                  window.setTimeout(() => setOk(""), 4000);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Could not save");
                }
              }}
            >
              Save terms
            </button>
          </div>
        </Panel>
      </div>

      {/* ─────────── what the gateway has paid over ─────────── */}
      <Panel title="Payouts so far" icon="📜" theme={BRAND.purple}>
        <Table
          head={
            <>
              <Th w="130px">No</Th>
              <Th w="120px">Date</Th>
              <Th>Landed in</Th>
              <Th>Reference</Th>
              <Th right w="150px">Amount</Th>
            </>
          }
        >
          {(!data || data.recent.length === 0) && (
            <tr>
              {/*  A plain <td colSpan> rather than the shared <Td>: Td takes no
                   colSpan, so the sentence folded itself into the No column and
                   read as four stacked words.  */}
              <td colSpan={5} className="text-center text-body-soft py-10 px-4">
                The gateway has not paid anything over yet.
              </td>
            </tr>
          )}
          {data?.recent.map((r) => (
            <tr key={r.id}>
              <Td><span className="font-semibold" style={{ color: BRAND.purple.ink }}>{r.transferNo}</span></Td>
              <Td><span className="text-body-soft">{String(r.movedAt).slice(0, 10)}</span></Td>
              <Td><b>{r.toName ?? "—"}</b></Td>
              <Td><span className="text-body-soft">{r.note || "—"}</span></Td>
              <Td right><span className="font-bold tabular-nums">{taka(r.amountPaisa)}</span></Td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}
