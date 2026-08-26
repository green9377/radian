"use client";

/*
  /finance/gateway — DEC-FIN-030.

  What the screen is for: SSLCommerz does not hand money over as it is taken.
  It holds every online payment, waits until at least Tk 2,500 has built up,
  skips bank holidays, and then sends one lump sum to the shop's bank. So the
  Gateway account runs permanently ahead of the bank, and this page is where
  that gap is closed and — more importantly — CHECKED.

  ⚠️ The number that matters is "Waiting at the gateway". It should match the
  Unsettled Payable on report.sslcommerz.com. Two figures from two independent
  systems agreeing is the only kind of reconciliation worth doing; a screen
  that only showed our own arithmetic would agree with itself for ever.

  House rules: no loose prose on the page — every explanation sits behind the
  small ⓘ (rule 17); buttons are bold and say what they do (rule 16).
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiFinanceAccount, apiGet, apiPost } from "../_data/api";
import { Info } from "./ItemEditor";
import {
  Banner, Chip, FinHeader, Flash, Kpi, Lbl, Panel, Table, Td, Th, WRAP,
  btnPrimary, btnPrimaryStyle, input, taka, toPaisa, todayStr,
} from "./FinanceUI";

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
interface GatewaySummary {
  gatewayAccountId: string;
  gatewayName: string;
  heldPaisa: number;
  destinations: Destination[];
  recent: Payout[];
  terms: { minimumPaisa: number; note: string };
}

const HELD_INFO =
  "What SSLCommerz still owes us, worked out from our own ledger. Open " +
  "report.sslcommerz.com → Accounting and compare it with 'Unsettled Payable'. " +
  "If the two disagree, a payment is missing on one side and it is worth " +
  "finding out which before the next payout.";

const PAYOUT_INFO =
  "Type what the BANK actually received, from the statement — not what you " +
  "expect. The statement is the authority here; a figure this system worked " +
  "out for itself would agree with itself for ever while being wrong. The " +
  "gateway's 2.5% was already taken out of each payment as it came in, so " +
  "nothing is deducted again here.";

const THRESHOLD_INFO =
  "SSLCommerz only pays out once at least Tk 2,500 has built up, and not on " +
  "bank holidays. Below that the money is not late — it is simply waiting.";

export function GatewaySettlementLive() {
  const [data, setData] = useState<GatewaySummary | null>(null);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");
  const [f, setF] = useState({ toAccountId: "", amount: "", settledOn: todayStr(), note: "" });

  const load = useCallback(async () => {
    try {
      const d = await apiGet<GatewaySummary>("/finance/gateway");
      setData(d);
      /*  Default to the bank, since that is where a gateway settles — but only
          as a first guess; the owner can have several and the field stays open
          (DEC-GBL-006, "ask only when there is a choice").  */
      setF((p) => ({
        ...p,
        toAccountId: p.toAccountId || (d.destinations.find((x) => x.code === "1040")?.id ?? d.destinations[0]?.id ?? ""),
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "API offline");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const held = data?.heldPaisa ?? 0;
  const typed = toPaisa(f.amount);
  const belowThreshold = held > 0 && held < (data?.terms.minimumPaisa ?? 0);

  /*  The refusal is repeated here so the button can go dead before anybody
      presses it — the server refuses too (that is the real fence), but a
      button that cannot succeed should not look like it can.  */
  const tooMuch = typed > held;
  const canSave = typed > 0 && !tooMuch && !!f.toAccountId;

  const leftAfter = useMemo(() => Math.max(0, held - (typed > 0 ? typed : 0)), [held, typed]);

  return (
    <div className={WRAP}>
      <FinHeader title="Payment gateway" emoji="💳" tone="brand" />
      <Flash ok={ok} err={err} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <Kpi
          label="Waiting at the gateway"
          value={taka(held)}
          emoji="⏳"
          tone={held > 0 ? "amber" : "emerald"}
          hint={held > 0 ? "compare with the panel" : undefined}
        />
        <Kpi label="Payouts recorded" value={String(data?.recent.length ?? 0)} emoji="🏦" tone="sky" />
        <Kpi
          label="Pays out above"
          value={taka(data?.terms.minimumPaisa ?? 0)}
          emoji="📏"
          tone="slate"
        />
      </div>

      <div className="flex items-center gap-2 mb-5 text-[12.5px] text-body-soft">
        <span className="font-semibold text-purple">What these numbers mean</span>
        <Info text={HELD_INFO} />
        <span className="opacity-40">·</span>
        <span className="font-semibold text-purple">Why nothing has arrived</span>
        <Info text={THRESHOLD_INFO} />
      </div>

      {belowThreshold && (
        <Banner tone="sky" emoji="⏳" title="Not late — waiting">
          {taka(held)} is sitting at the gateway. It is sent once it passes{" "}
          {taka(data?.terms.minimumPaisa ?? 0)}.
        </Banner>
      )}

      <Panel title="Record a payout" emoji="🏦" tone="emerald" className="mb-5">
        <div className="px-5 py-4">
          <div className="grid md:grid-cols-5 gap-3 items-end">
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
                <Lbl>Amount the bank got (৳)</Lbl>
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
            <div>
              <button
                className={btnPrimary}
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
          </div>

          {/*  The one line of arithmetic the screen owes the reader: what is
               left behind. It is a live figure, not an explanation, so it
               belongs on the page rather than behind the ⓘ.  */}
          {typed > 0 && !tooMuch && (
            <div className="text-[12.5px] text-body-soft mt-3">
              Still waiting at the gateway after this:{" "}
              <b className="text-purple">{taka(leftAfter)}</b>
            </div>
          )}
          {tooMuch && (
            <div className="text-[12.5px] mt-3" style={{ color: "#c2185b" }}>
              <b>The gateway is only holding {taka(held)}.</b> Check the amount against
              the statement — if the statement is right, a payment is missing from our
              books and that is worth finding before this is recorded.
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Payouts so far" emoji="📜" tone="slate">
        <Table
          head={
            <>
              <Th w="110px">No</Th>
              <Th w="110px">Date</Th>
              <Th>Landed in</Th>
              <Th>Reference</Th>
              <Th right w="140px">Amount</Th>
            </>
          }
        >
          {(!data || data.recent.length === 0) && (
            <tr>
              <Td className="text-center text-body-soft py-8">
                The gateway has not paid anything over yet.
              </Td>
              <Td /><Td /><Td /><Td />
            </tr>
          )}
          {data?.recent.map((r) => (
            <tr key={r.id}>
              <Td><span className="font-semibold text-purple">{r.transferNo}</span></Td>
              <Td><span className="text-body-soft">{String(r.movedAt).slice(0, 10)}</span></Td>
              <Td><b>{r.toName ?? "—"}</b></Td>
              <Td>
                {r.note ? <span className="text-body-soft">{r.note}</span> : <Chip>—</Chip>}
              </Td>
              <Td right><span className="font-bold">{taka(r.amountPaisa)}</span></Td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}

export type { ApiFinanceAccount };
