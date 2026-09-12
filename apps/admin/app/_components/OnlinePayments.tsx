"use client";

/*
  /orders/online-payments — the answer to "I paid, but it says I still owe you".

  Every trip a customer made to the gateway is recorded, including the ones
  that failed. Until this screen the only way to read that was SQL, so the
  shop's honest answer to somebody holding a bank SMS was "let me get back to
  you".

  ⚠️ THE SCREEN CHANGES NOTHING. It reads. A payment is written in one place —
  the gateway callback, after we validate the payment back with SSLCommerz —
  and a button here that could mark an order paid would be a second way for
  money to appear in the books without money appearing in the bank.

  ⚠️ Read the pairing, not the row. INITIATED next to a customer's bank SMS is
  the interesting case: they were charged and the gateway never told us. That
  is what `tranId` and `bankTranId` are for — they are what SSLCommerz support
  asks for, and the reason they are printed here rather than tucked away.

  House rules: brand palette, coloured spine, icon in a tinted square (17);
  bold buttons that say what they do (16); explanations behind the ⓘ.
*/

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "../_data/api";
import { Info } from "./ItemEditor";
import { Flash, Table, Td, Th, WRAP, input, taka } from "./FinanceUI";

const BRAND = {
  purple: { ink: "var(--t-accent)", wash: "var(--s-accent)", edge: "var(--l-accent)" },
  rose: { ink: "var(--t-gold)", wash: "var(--s-bad)", edge: "var(--l-gold)" },
} as const;

/*  The gateway's four words, in the shop's own. `tone` inks the pill; the
    order is the story a session travels: started → one of three endings.  */
const STATE: Record<string, { label: string; bg: string; fg: string; hint?: string }> = {
  INITIATED: {
    label: "Went to pay",
    bg: "var(--s-warn)",
    fg: "var(--t-warn)",
    hint: "May have been charged without us being told — check the transaction id with SSLCommerz.",
  },
  SUCCESS: { label: "Paid", bg: "var(--s-ok)", fg: "var(--t-ok)" },
  FAILED: { label: "Refused", bg: "var(--s-bad)", fg: "var(--t-bad)" },
  CANCELLED: { label: "Backed out", bg: "var(--s-info)", fg: "var(--t-accent)" },
};

const TABS: { key: string; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "SUCCESS", label: "Paid" },
  { key: "INITIATED", label: "Went to pay" },
  { key: "FAILED", label: "Refused" },
  { key: "CANCELLED", label: "Backed out" },
];

export interface OnlinePaymentRow {
  id: string;
  tranId: string;
  provider: string;
  status: string;
  amountPaisa: number;
  createdAt: string;
  settledAt: string | null;
  valId: string | null;
  bankTranId: string | null;
  cardType: string | null;
  gatewayStatus: string | null;
  gatewayReason: string | null;
  storeAmountPaisa: number | null;
  order: { id: string; orderNo: string; totalPaisa: number; paidPaisa: number; refundPaisa: number } | null;
}

function Pill({ status }: { status: string }) {
  const s = STATE[status] ?? { label: status, bg: "#eee", fg: "#555" };
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block rounded-full px-2.5 py-[3px] text-[11.5px] font-bold whitespace-nowrap"
        style={{ background: s.bg, color: s.fg }}
      >
        {s.label}
      </span>
      {s.hint ? <Info text={s.hint} /> : null}
    </span>
  );
}

/** the shared card shell — same shape as the gateway page and the tag groups */
function Panel({
  title,
  icon,
  theme = BRAND.purple,
  right,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  theme?: { ink: string; wash: string; edge: string };
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="bg-white rounded-[18px] shadow-soft overflow-hidden"
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

export function OnlinePaymentsLive() {
  const [rows, setRows] = useState<OnlinePaymentRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [tab, setTab] = useState("ALL");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (tab !== "ALL") p.set("status", tab);
      if (q.trim()) p.set("q", q.trim());
      const d = await apiGet<{ rows: OnlinePaymentRow[]; counts: Record<string, number> }>(
        `/orders/online-payments?${p.toString()}`,
      );
      setRows(d.rows);
      setCounts(d.counts);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "API offline");
    }
  }, [tab, q]);

  /*  The search waits for the typing to stop — one request per word, not per
      keystroke, on a table that can hold every payment the shop ever took.  */
  useEffect(() => {
    const t = window.setTimeout(() => void load(), q ? 350 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  return (
    <div className={WRAP}>
      <Flash ok="" err={err} />

      <Panel
        title="Online payments"
        icon="💳"
      >
        {/* the filter row */}
        <div className="px-5 py-4 flex flex-wrap items-center gap-3 border-b" style={{ borderColor: "var(--l-accent)" }}>
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => {
              const on = tab === t.key;
              const n = counts[t.key] ?? 0;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition border"
                  style={
                    on
                      ? {
                          background: BRAND.purple.ink,
                          color: "#fff",
                          borderColor: BRAND.purple.ink,
                          boxShadow: "0 2px 8px rgba(122,46,168,0.25)",
                        }
                      : { background: "#fff", color: "var(--t-soft)", borderColor: "var(--l-accent)" }
                  }
                >
                  {t.label}
                  {n > 0 && <span className={on ? "ml-1.5 opacity-80" : "ml-1.5 opacity-60"}>{n}</span>}
                </button>
              );
            })}
          </div>
          <input
            className={`${input} w-[260px] ml-auto`}
            placeholder="Order no, transaction id, bank reference"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <Table
          head={
            <>
              <Th w="130px">Order</Th>
              <Th w="150px">When</Th>
              <Th w="150px">What happened</Th>
              <Th>Paid with</Th>
              <Th right w="140px">Amount</Th>
              <Th right w="110px" />
            </>
          }
        >
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center text-body-soft py-10 px-4">
                {q.trim() ? "Nothing matches that." : "No online payment has been attempted yet."}
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <>
              <tr key={r.id}>
                <Td>
                  {r.order ? (
                    <Link
                      href={`/orders/${r.order.id}`}
                      className="font-semibold underline decoration-dotted"
                      style={{ color: BRAND.purple.ink }}
                    >
                      {r.order.orderNo}
                    </Link>
                  ) : (
                    <span className="text-body-soft">—</span>
                  )}
                </Td>
                <Td>
                  <span className="text-body-soft">{String(r.createdAt).slice(0, 16).replace("T", " ")}</span>
                </Td>
                <Td><Pill status={r.status} /></Td>
                <Td>
                  <span className="text-body-soft">{r.cardType || "—"}</span>
                </Td>
                <Td right><span className="font-bold tabular-nums">{taka(r.amountPaisa)}</span></Td>
                <Td right>
                  <button
                    className="text-[12.5px] font-bold underline decoration-dotted"
                    style={{ color: BRAND.purple.ink }}
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                  >
                    {open === r.id ? "Hide" : "References"}
                  </button>
                </Td>
              </tr>
              {open === r.id && (
                <tr key={`${r.id}-open`}>
                  {/*  The references live behind a press rather than in their own
                       columns: they are long, ugly and needed perhaps twice a
                       month — but when they are needed, they are the only thing
                       that matters, so they are one click away, not in a
                       different system.  */}
                  <td colSpan={6} className="px-5 py-4" style={{ background: BRAND.purple.wash }}>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <Ref label="Our transaction id" value={r.tranId} />
                      <Ref label="Bank reference" value={r.bankTranId} />
                      <Ref label="Gateway validation id" value={r.valId} />
                      <Ref
                        label="Gateway kept"
                        value={
                          r.storeAmountPaisa === null
                            ? null
                            : `${taka(r.amountPaisa - r.storeAmountPaisa)} of ${taka(r.amountPaisa)}`
                        }
                      />
                    </div>
                    {r.gatewayReason && (
                      <div className="mt-3 text-[12.5px]" style={{ color: BRAND.rose.ink }}>
                        <b>The gateway said:</b> {r.gatewayReason}
                      </div>
                    )}
                    {r.order && (
                      <div className="mt-3 text-[12.5px] text-body-soft">
                        This order: bill <b>{taka(r.order.totalPaisa)}</b> · paid{" "}
                        <b>{taka(r.order.paidPaisa - r.order.refundPaisa)}</b> · still owed{" "}
                        <b style={{ color: BRAND.purple.ink }}>
                          {taka(Math.max(0, r.order.totalPaisa - (r.order.paidPaisa - r.order.refundPaisa)))}
                        </b>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </>
          ))}
        </Table>
      </Panel>
    </div>
  );
}

function Ref({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[11px] font-bold tracking-[0.1em] text-body-soft uppercase mb-1">{label}</div>
      <div className="text-[12.5px] font-semibold break-all" style={{ color: value ? "var(--t-accent)" : "var(--t-soft)" }}>
        {value || "—"}
      </div>
    </div>
  );
}
