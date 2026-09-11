"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { WRAP, ErrorBox } from "./OrderViews";
import {
  deliveryMoney, settleCarrier, financeAccountsSafe, formatTaka,
  type ApiMoney, type ApiMoneyRow, type ApiMoneyAttempt, type ApiFinanceAccount, type MoneyStage, type SettleLine,
} from "../_data/api";
import { SOLID, CELL, LABEL, VALUE, SOFT, NO, NAME, TABLE_WRAP, TABLE, Pill, ActButton, Band, Segs, Search, Count, Head, Empty, fmtStamp, type Tile } from "./OrdersUi";

/*
  Delivery -> Delivery money (owner, 10 Sep 2026). Replaces "Settle".

  One order, one line, the whole story of its money:
    To collect     out for delivery — the rider has to bring back this much
    With carrier   delivered, cash taken at the door, not in our hands yet
    Received       we have the cash (one click here writes the remittance)
    Paid carrier   what we gave the rider / courier for this parcel
  and, on the right, what the parcel cost us (Inventory's posted cost, or the
  product's cost price when nothing was posted) and the order's profit after
  delivery. Same accounting underneath as before (DEC-DLV-016/017): Received
  and Paid both go through settle(), so 5200 and the remittance book are
  written exactly as they always were.

  ── What the 11 Sep 2026 audit changed here ──────────────────────────────
  · The fee and the cash are two separate facts. "Cash received" no longer
    sends a fee of zero — a line without `chargePaisa` leaves the recorded
    cost alone, so a parcel stops vanishing off "Rider or courier not paid"
    the moment its cash comes in.
  · The fee is netted out of the cash ONLY when the rider actually kept it:
    "Rider kept the fee from the cash". A salaried rider, or a one-time rider
    paid at the door, hands over the whole COD and is paid separately.
  · Cash can be received once. A parcel already received says so and offers
    nothing more.
  · Every attempt is here, including one that FAILED at the door — a trip
    that came back still cost a fare, and it can be recorded and paid on the
    same row.
  · One carrier, one action: "Settle all" builds every outstanding receipt
    for that carrier and posts them in a single settle().
*/

type Seg = "" | MoneyStage | "COST" | "DONE";
const SEGS: [Seg, string][] = [
  ["", "All"],
  ["TO_COLLECT", "Due from customer"],
  ["WITH_CARRIER", "Cash with rider"],
  ["COST", "Rider or courier not paid"],
  ["RECEIVED", "Received"],
  ["DONE", "Finished"],
];
function inSeg(r: ApiMoneyRow, s: Seg): boolean {
  const delivered = r.deliveryStatus === "delivered";
  switch (s) {
    case "":
      return true;
    /*  (audit 11 Sep 2026, P0 #7) "not paid" counts EVERY attempt — the failed
        ones too. It used to ask only the newest, so a retry hid the fare of
        the trip before it.  */
    case "COST":
      return r.costMissing;
    case "DONE":
      return delivered && (r.stage === "RECEIVED" || r.stage === "PREPAID") && !r.costMissing;
    default:
      return r.stage === s;
  }
}
const STAGE: Record<MoneyStage, { label: string; colour: string }> = {
  TO_COLLECT: { label: "Due from customer", colour: SOLID.amber },
  WITH_CARRIER: { label: "Cash with rider", colour: SOLID.red },
  RECEIVED: { label: "Received", colour: SOLID.green },
  PREPAID: { label: "Prepaid", colour: SOLID.grey },
};

/** an attempt whose fare nobody has typed yet — delivered or failed, both cost money */
function unpriced(a: ApiMoneyAttempt) {
  return !a.costRecorded && (a.status === "DELIVERED" || a.status === "FAILED");
}
function attemptLabel(a: ApiMoneyAttempt) {
  return a.status === "FAILED" ? `${a.name} · failed attempt` : a.name;
}

const HELP =
  "Every parcel on the road or delivered in the chosen period, one line each — plus, whatever their date, every parcel whose cash is still with a carrier or whose fare nobody has recorded yet. " +
  "Cash: Due from customer (still out) to Cash with rider (delivered, cash taken at the door) to Received (in our hands; the click writes the remittance). Cash can be received once. " +
  "Carrier fee = what we owe the rider or courier for this parcel, counted for every attempt including one that failed at the door; it is expensed once, on the parcel. " +
  "Tick \"rider kept the fee from the cash\" only when he really did — otherwise the whole COD is the receipt and the fee is paid separately. " +
  "Cost = Inventory's posted cost for the order, or the product's cost price when stock was never posted, which makes the profit an estimate. Profit = order total minus cost minus every carrier fee.";

export default function DeliveryMoney() {
  const [data, setData] = useState<ApiMoney | null>(null);
  const [accounts, setAccounts] = useState<ApiFinanceAccount[]>([]);
  const [days, setDays] = useState(30);
  const [seg, setSeg] = useState<Seg>("");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  /* the small boxes on a row: which one is open, what is typed */
  const [open, setOpen] = useState<{ id: string; what: "received" | "paid"; assignmentId?: string } | null>(null);
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [feeKept, setFeeKept] = useState(false);
  /* carrier-level settle */
  const [bulkCarrier, setBulkCarrier] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const [m, a] = await Promise.all([deliveryMoney(days), financeAccountsSafe()]);
      setData(m);
      setAccounts((a ?? []).filter((x) => x.isMoneyAccount && x.isActive));
    } catch (e) {
      setData({ rows: [], totals: { toCollect: 0, withCarrier: 0, received: 0, paidCarrier: 0, costMissing: 0, revenue: 0, profit: 0 }, days });
      setErr(e instanceof Error ? e.message : "Could not load.");
    }
  }, [days]);
  useEffect(() => {
    void load();
  }, [load]);

  const rows = data?.rows ?? [];
  const counts = useMemo(() => {
    const c: Record<Seg, number> = { "": rows.length, TO_COLLECT: 0, WITH_CARRIER: 0, RECEIVED: 0, PREPAID: 0, COST: 0, DONE: 0 };
    for (const r of rows) for (const [k] of SEGS) if (k && inSeg(r, k)) c[k]++;
    return c;
  }, [rows]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => inSeg(r, seg) && (!needle || r.orderNo.toLowerCase().includes(needle) || (r.customer?.name ?? "").toLowerCase().includes(needle) || (r.customer?.phone ?? "").includes(needle) || (r.carrier?.name ?? "").toLowerCase().includes(needle)));
  }, [rows, seg, q]);

  function closeBox() {
    setOpen(null);
    setAmount("");
    setFeeKept(false);
  }

  /*  ONE PARCEL. "Cash received" sends the cash and, only when the rider kept
      it, the fee that is netted out of it. "Pay" sends the fee alone — the
      cash side of that parcel is left exactly as it was.  */
  async function act(r: ApiMoneyRow, what: "received" | "paid", attempt?: ApiMoneyAttempt) {
    const c = what === "paid" ? attempt ?? r.carrier : r.carrier;
    if (!c || !c.carrierId) return;
    const paisa = amount ? Math.round(Number(amount) * 100) : 0;
    if (what === "received" && !account) {
      setErr("Say which account the cash landed in.");
      return;
    }
    if (what === "paid" && paisa <= 0) {
      setErr("Type what was paid to the carrier.");
      return;
    }
    setBusy(r.id);
    setErr("");
    setOk("");
    try {
      const line: SettleLine =
        what === "received"
          ? {
              assignmentId: c.assignmentId,
              codPaisa: r.codCollectedPaisa,
              /*  (P0 #1) the fee travels ONLY when it is being kept out of the
                  cash. No number here = the recorded cost is left untouched,
                  and the parcel stays on "not paid" until it is really paid.  */
              ...(feeKept && c.costRecorded ? { chargePaisa: c.costPaisa, feeKeptFromCash: true } : {}),
            }
          : { assignmentId: c.assignmentId, chargePaisa: paisa };
      const res = await settleCarrier({
        carrierType: c.carrierType,
        carrierId: c.carrierId,
        intoAccountId: what === "received" ? account : undefined,
        lines: [line],
      });
      setOk(
        what === "received"
          ? `${formatTaka(r.codCollectedPaisa)} received from ${c.name}${res.remittance ? ` · ${res.remittance.remittanceNo}` : ""}.`
          : `${formatTaka(paisa)} recorded for ${c.name} on ${r.orderNo}.`,
      );
      closeBox();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  /*  ONE CARRIER, ONE ACTION (P3 #4 / P2 "15 clicks"). Every parcel of this
      carrier in the list whose cash is still with him becomes one line of one
      settle(), so fifteen parcels are one receipt and one journal entry.

      ⚠️ FEES ARE NOT INVENTED HERE. A parcel whose fare nobody has typed is
      counted and named, never guessed at — the shop says what it paid, the
      screen does not. Already-recorded fees are netted out only if the tick
      says the carrier kept them.  */
  const bulk = useMemo(() => {
    if (!bulkCarrier) return null;
    const mine = shown.filter((r) => r.carrier?.carrierId === bulkCarrier);
    const cash = mine.filter((r) => r.stage === "WITH_CARRIER" && r.carrier && !r.carrier.codHandedOver && r.codCollectedPaisa > 0);
    const feeMissing = mine.filter((r) => r.attempts.some(unpriced));
    return {
      name: mine[0]?.carrier?.name ?? "this carrier",
      carrierType: mine[0]?.carrier?.carrierType ?? "RIDER",
      cash,
      cashPaisa: cash.reduce((n, r) => n + r.codCollectedPaisa, 0),
      recordedFeePaisa: cash.reduce((n, r) => n + (r.carrier?.costRecorded ? r.carrier.costPaisa : 0), 0),
      feeMissing: feeMissing.length,
    };
  }, [bulkCarrier, shown]);

  async function settleAll() {
    if (!bulk || bulk.cash.length === 0) return;
    if (!account) {
      setErr("Say which account the cash landed in.");
      return;
    }
    setBusy("bulk");
    setErr("");
    setOk("");
    try {
      const res = await settleCarrier({
        carrierType: bulk.carrierType,
        carrierId: bulkCarrier,
        intoAccountId: account,
        lines: bulk.cash.map((r): SettleLine => {
          const c = r.carrier!;
          return {
            assignmentId: c.assignmentId,
            codPaisa: r.codCollectedPaisa,
            ...(feeKept && c.costRecorded ? { chargePaisa: c.costPaisa, feeKeptFromCash: true } : {}),
          };
        }),
      });
      setOk(`${formatTaka(res.grossPaisa)} received from ${res.carrierName} over ${res.settled} parcel(s)${res.remittance ? ` · ${res.remittance.remittanceNo}` : ""}.`);
      setBulkCarrier("");
      closeBox();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not settle.");
    } finally {
      setBusy(null);
    }
  }

  /** carriers with cash still out in the current list */
  const carriersWithCash = useMemo(() => {
    const m = new Map<string, { id: string; name: string; n: number; paisa: number }>();
    for (const r of shown) {
      const c = r.carrier;
      if (!c?.carrierId || r.stage !== "WITH_CARRIER" || c.codHandedOver || r.codCollectedPaisa <= 0) continue;
      const cur = m.get(c.carrierId) ?? { id: c.carrierId, name: c.name, n: 0, paisa: 0 };
      cur.n++;
      cur.paisa += r.codCollectedPaisa;
      m.set(c.carrierId, cur);
    }
    return [...m.values()].sort((a, b) => b.paisa - a.paisa);
  }, [shown]);

  const t = data?.totals;
  const v = (s: string) => (data === null ? "…" : s);
  const estimated = rows.some((r) => r.cogsFrom === "product cost");
  const tiles: Tile[] = [
    { key: "TO_COLLECT", label: "Due from customer", value: v(formatTaka(t?.toCollect ?? 0)), sub: "parcels on the road" },
    { key: "WITH_CARRIER", label: "Cash with rider", value: v(formatTaka(t?.withCarrier ?? 0)), hot: (t?.withCarrier ?? 0) > 0, sub: "delivered, cash not here yet" },
    { key: "RECEIVED", label: "Received", value: v(formatTaka(t?.received ?? 0)), sub: `last ${days} days` },
    { key: "COST", label: "Paid to rider or courier", value: v(formatTaka(t?.paidCarrier ?? 0)), sub: data ? `${t?.costMissing ?? 0} parcel${t?.costMissing === 1 ? "" : "s"} not recorded` : undefined, hot: (t?.costMissing ?? 0) > 0 },
    /*  (audit 11 Sep 2026, P2) ESTIMATED, and it says so. The cost side falls
        back to the product's cost price when Inventory never posted the
        order's movements — variants and add-ons are not in that figure, so
        calling it "profit" flat was a number pretending to be final.  */
    {
      key: "profit",
      label: estimated ? "Estimated profit" : "Profit",
      value: v(formatTaka(t?.profit ?? 0)),
      sub: data ? `on ${formatTaka(t?.revenue ?? 0)} delivered${estimated ? " · some rows use product cost only" : ""}` : undefined,
    },
  ];

  return (
    <div className={WRAP}>
      <Band
        title="Delivery money"
        help={HELP}
        tiles={tiles}
        active={seg || undefined}
        onTile={(k) => {
          if (k === "profit") return;
          setSeg(seg === k ? "" : (k as Seg));
        }}
        right={
          <select className="ipt h-[38px] font-medium bg-white" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        }
      />

      <div className="flex gap-2.5 flex-wrap items-center mb-3">
        <Segs items={SEGS} value={seg} counts={data ? counts : undefined} onChange={setSeg} />
        <Search value={q} onChange={setQ} placeholder="Order no, name, phone, carrier" />
        <Count n={shown.length} noun="order" loading={data === null} />
      </div>

      {carriersWithCash.length > 0 && (
        <div className="rounded-[14px] border border-[#3e3447] bg-white px-4 py-3 mb-3 flex flex-wrap items-end gap-2.5">
          <div>
            <span className={LABEL}>Settle a whole round in one go</span>
            <select className="ipt h-[36px] text-[12.5px] min-w-[230px]" value={bulkCarrier} onChange={(e) => { setBulkCarrier(e.target.value); setFeeKept(false); }}>
              <option value="">Pick a rider or courier…</option>
              {carriersWithCash.map((c) => (
                <option key={c.id} value={c.id}>{c.name} — {c.n} parcel{c.n === 1 ? "" : "s"} · {formatTaka(c.paisa)}</option>
              ))}
            </select>
          </div>
          {bulk && bulk.cash.length > 0 && (
            <>
              <div>
                <span className={LABEL}>{formatTaka(bulk.cashPaisa)} landed in</span>
                <select className="ipt h-[36px] text-[12.5px] min-w-[180px]" value={account} onChange={(e) => setAccount(e.target.value)}>
                  <option value="">Pick an account…</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              {bulk.recordedFeePaisa > 0 && (
                <label className="flex items-center gap-2 text-[12.5px] pb-1.5">
                  <input type="checkbox" className="w-4 h-4 accent-purple" checked={feeKept} onChange={(e) => setFeeKept(e.target.checked)} />
                  Kept {formatTaka(bulk.recordedFeePaisa)} of fees from the cash
                </label>
              )}
              <ActButton kind="solid" colour={SOLID.green} disabled={busy === "bulk"} onClick={() => void settleAll()}>
                {busy === "bulk" ? "…" : `Settle all for ${bulk.name} (${bulk.cash.length})`}
              </ActButton>
              <span className={`text-[12px] ${SOFT} basis-full`}>
                Cash only. {bulk.feeMissing > 0
                  ? `${bulk.feeMissing} parcel${bulk.feeMissing === 1 ? " still has" : "s still have"} no fare recorded — type those on the rows; the screen will not guess what was paid.`
                  : "Every fare on these parcels is already recorded."}
              </span>
            </>
          )}
        </div>
      )}

      {err && <ErrorBox error={err} onRetry={() => void load()} />}
      {ok && (
        <div className="rounded-[12px] border-[1.5px] px-4 py-3 mb-3 text-[13px] font-medium bg-white" style={{ borderColor: "#bfe3cd", color: SOLID.green }}>
          {ok}
        </div>
      )}

      <div className={TABLE_WRAP}>
        <table className={TABLE}>
          <Head heads={["Order No", "Customer", "Carrier", "Order total", "COD cash", "Carrier fee", "Cost", "Profit", "Action"]} />
          <tbody>
            {shown.map((r) => {
              const c = r.carrier;
              const st = STAGE[r.stage];
              const isOpen = open?.id === r.id;
              const toPay = r.attempts.filter(unpriced);
              const canReceive = r.stage === "WITH_CARRIER" && !!c && !c.codHandedOver && r.codCollectedPaisa > 0;
              const recordedAttempts = r.attempts.filter((a) => a.costRecorded).length;
              return (
                <tr key={r.id} className="hover:bg-[#231538]">
                  <td className={`${CELL} w-[130px]`}>
                    <Link href={`/orders/${r.id}`} className={NO}>{r.orderNo}</Link>
                    <span className={LABEL}>{r.deliveredAt ? `delivered ${fmtStamp(r.deliveredAt)}` : "on the road"}</span>
                  </td>
                  <td className={CELL}>
                    <span className={NAME}>{r.isGift && r.recipientName ? r.recipientName : r.customer?.name ?? "—"}</span>
                    <span className={`block ${SOFT}`}>{r.address}</span>
                  </td>
                  <td className={`${CELL} w-[170px]`}>
                    {c ? (
                      <>
                        <span className={VALUE}>{c.name}</span>
                        <span className={`block ${SOFT}`}>{c.kind === "RIDER" ? "own rider" : c.kind === "ONE_TIME" ? "one-time" : "courier"}</span>
                        {/* (audit 11 Sep 2026, P0 #7) the attempts before this one — they cost money too */}
                        {r.attempts.slice(1).map((a) => (
                          <span key={a.assignmentId} className={`block ${SOFT}`}>
                            {a.status === "FAILED" ? "failed: " : ""}{a.name}{a.costRecorded ? ` · ${formatTaka(a.costPaisa)}` : " · no fare yet"}
                          </span>
                        ))}
                      </>
                    ) : (
                      <span className={SOFT}>— none —</span>
                    )}
                  </td>
                  <td className={`${CELL} w-[110px] text-right whitespace-nowrap`}>
                    <span className="font-medium">{formatTaka(r.totalPaisa)}</span>
                    <span className={LABEL}>delivery ৳ {Math.round(r.deliveryPaisa / 100)} · {r.paymentMethod === "cod" ? "COD" : "online"}</span>
                  </td>
                  <td className={`${CELL} w-[170px]`}>
                    <Pill colour={st.colour}>{st.label}</Pill>
                    <span className="block mt-1 font-medium">
                      {r.stage === "TO_COLLECT" ? formatTaka(r.duePaisa) : r.stage === "PREPAID" ? <span className={SOFT}>nothing at the door</span> : formatTaka(r.codCollectedPaisa)}
                    </span>
                    {r.stage === "RECEIVED" && <span className={LABEL}>cash is with us</span>}
                  </td>
                  <td className={`${CELL} w-[140px]`}>
                    {r.carrierCostPaisa > 0 && (
                      <>
                        <span className={VALUE}>{formatTaka(r.carrierCostPaisa)}</span>
                        <span className={LABEL}>{r.attempts.length > 1 ? `${recordedAttempts} attempt(s) recorded` : c?.paidCash ? "cash at the door" : "recorded"}</span>
                      </>
                    )}
                    {toPay.length > 0 && (
                      <div className={r.carrierCostPaisa > 0 ? "mt-1" : ""}>
                        <Pill colour={SOLID.amber}>{toPay.length > 1 ? `${toPay.length} fares not recorded` : "not recorded"}</Pill>
                      </div>
                    )}
                    {r.carrierCostPaisa === 0 && toPay.length === 0 && <span className={SOFT}>—</span>}
                  </td>
                  <td className={`${CELL} w-[110px] text-right whitespace-nowrap`}>
                    <span className="font-medium">{formatTaka(r.cogsPaisa)}</span>
                    <span className={LABEL}>{r.cogsFrom}</span>
                  </td>
                  <td className={`${CELL} w-[110px] text-right whitespace-nowrap`}>
                    <span className="font-medium" style={{ color: r.profitPaisa < 0 ? SOLID.red : SOLID.green }}>{formatTaka(r.profitPaisa)}</span>
                    <span className={LABEL}>{r.profitFinal ? (r.cogsFrom === "product cost" ? "estimated" : "final") : r.cogsFrom === "product cost" ? "estimated · before carrier fee" : "before carrier fee"}</span>
                  </td>
                  <td className={`${CELL} w-[210px]`}>
                    {c && c.carrierId && (
                      <div className="flex flex-col gap-1.5">
                        {canReceive && (
                          <ActButton kind="solid" colour={SOLID.green} disabled={busy === r.id} onClick={() => { const on = isOpen && open?.what === "received"; closeBox(); if (!on) setOpen({ id: r.id, what: "received" }); }}>
                            Cash received
                          </ActButton>
                        )}
                        {/* (P0 #2) received once, and the row says so instead of offering it again */}
                        {r.stage === "RECEIVED" && <span className={`text-[12px] ${SOFT}`}>Cash already received.</span>}
                        {toPay.map((a) => (
                          <ActButton
                            key={a.assignmentId}
                            kind="primary"
                            disabled={busy === r.id}
                            onClick={() => { const on = isOpen && open?.what === "paid" && open?.assignmentId === a.assignmentId; closeBox(); if (!on) setOpen({ id: r.id, what: "paid", assignmentId: a.assignmentId }); }}
                          >
                            {toPay.length > 1 || a.status === "FAILED" ? `Pay · ${attemptLabel(a)}` : "Pay rider or courier"}
                          </ActButton>
                        ))}
                        {isOpen && open?.what === "received" && (
                          <div className="rounded-[12px] border border-[#3e3447] bg-white p-2.5 flex flex-col gap-2">
                            <span className={LABEL}>{formatTaka(r.codCollectedPaisa)} taken at the door — landed in</span>
                            <select className="ipt h-[34px] text-[12.5px]" value={account} onChange={(e) => setAccount(e.target.value)}>
                              <option value="">Pick an account…</option>
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                            {/*  (P0 #3) the fee comes out of the cash ONLY when he kept
                                it. Off, the whole COD is the receipt and the fee stays
                                on "not paid" until it is really paid.  */}
                            {c.costRecorded && c.costPaisa > 0 && (
                              <label className="flex items-start gap-2 text-[12.5px]">
                                <input type="checkbox" className="w-4 h-4 accent-purple mt-0.5" checked={feeKept} onChange={(e) => setFeeKept(e.target.checked)} />
                                <span>
                                  Rider kept the fee from the cash
                                  <span className={`block ${SOFT}`}>{formatTaka(c.costPaisa)} — leave it off if he handed over the whole {formatTaka(r.codCollectedPaisa)} and is paid separately</span>
                                </span>
                              </label>
                            )}
                            <ActButton kind="solid" colour={SOLID.green} disabled={busy === r.id} onClick={() => void act(r, "received")}>{busy === r.id ? "…" : "Confirm received"}</ActButton>
                          </div>
                        )}
                        {isOpen && open?.what === "paid" && (
                          <div className="rounded-[12px] border border-[#3e3447] bg-white p-2.5 flex flex-col gap-2">
                            <span className={LABEL}>
                              Paid to {attemptLabel(r.attempts.find((a) => a.assignmentId === open.assignmentId) ?? c)} for this parcel
                            </span>
                            <input type="number" min={0} className="ipt h-[34px] text-[12.5px]" placeholder="৳" value={amount} onChange={(e) => setAmount(e.target.value)} />
                            <ActButton kind="primary" disabled={busy === r.id} onClick={() => void act(r, "paid", r.attempts.find((a) => a.assignmentId === open.assignmentId))}>{busy === r.id ? "…" : "Save"}</ActButton>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data !== null && shown.length === 0 && <Empty text="Nothing here for this period." />}
      </div>
    </div>
  );
}
