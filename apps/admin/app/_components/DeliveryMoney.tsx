"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { WRAP, ErrorBox } from "./OrderViews";
import { deliveryMoney, settleCarrier, financeAccountsSafe, formatTaka, type ApiMoney, type ApiMoneyRow, type ApiFinanceAccount, type MoneyStage } from "../_data/api";
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
  const costDone = !!r.carrier?.costRecorded;
  switch (s) {
    case "":
      return true;
    case "COST":
      return delivered && !!r.carrier && !costDone;
    case "DONE":
      return delivered && (r.stage === "RECEIVED" || r.stage === "PREPAID") && costDone;
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

const HELP =
  "Every parcel on the road or delivered in the chosen period, one line each. Cash: Due from customer (still out) → Cash with rider (delivered, cash at the door) → Received (in our hands; the click writes the remittance). " +
  "Paid carrier = what we gave the rider or courier for this parcel (expensed once). Cost = Inventory's posted cost for the order, or the product's cost price when stock was never posted. Profit = order total − cost − carrier fee; it is final once the carrier fee is recorded.";

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
  const [open, setOpen] = useState<{ id: string; what: "received" | "paid" } | null>(null);
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");

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

  async function act(r: ApiMoneyRow, what: "received" | "paid") {
    const c = r.carrier;
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
      const res = await settleCarrier({
        carrierType: c.carrierType,
        carrierId: c.carrierId,
        intoAccountId: what === "received" ? account : undefined,
        lines: [
          {
            assignmentId: c.assignmentId,
            /*  Received: the cash that was taken at the door. Paid: nothing
                comes back, the fee only. The other side keeps what it had —
                settle() overwrites costPaisa, so the recorded fee is sent
                again rather than zeroed.  */
            codPaisa: what === "received" ? r.codCollectedPaisa : 0,
            chargePaisa: what === "paid" ? paisa : c.costRecorded ? c.costPaisa : 0,
          },
        ],
      });
      setOk(what === "received" ? `${formatTaka(r.codCollectedPaisa)} received from ${c.name}${res.remittance ? ` · ${res.remittance.remittanceNo}` : ""}.` : `${formatTaka(paisa)} paid to ${c.name} for ${r.orderNo}.`);
      setOpen(null);
      setAmount("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  const t = data?.totals;
  const v = (s: string) => (data === null ? "…" : s);
  const tiles: Tile[] = [
    { key: "TO_COLLECT", label: "Due from customer", value: v(formatTaka(t?.toCollect ?? 0)), sub: "parcels on the road" },
    { key: "WITH_CARRIER", label: "Cash with rider", value: v(formatTaka(t?.withCarrier ?? 0)), hot: (t?.withCarrier ?? 0) > 0, sub: "delivered, cash not here yet" },
    { key: "RECEIVED", label: "Received", value: v(formatTaka(t?.received ?? 0)), sub: `last ${days} days` },
    { key: "COST", label: "Paid to rider or courier", value: v(formatTaka(t?.paidCarrier ?? 0)), sub: data ? `${t?.costMissing ?? 0} parcel${t?.costMissing === 1 ? "" : "s"} not recorded` : undefined, hot: (t?.costMissing ?? 0) > 0 },
    { key: "profit", label: "Profit", value: v(formatTaka(t?.profit ?? 0)), sub: data ? `on ${formatTaka(t?.revenue ?? 0)} delivered` : undefined },
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
                  <td className={`${CELL} w-[150px]`}>
                    {c ? (
                      <>
                        <span className={VALUE}>{c.name}</span>
                        <span className={`block ${SOFT}`}>{c.kind === "RIDER" ? "own rider" : c.kind === "ONE_TIME" ? "one-time" : "courier"}{c.chargeCustomer ? " · retry, customer pays" : ""}</span>
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
                    <span className={`block mt-1 font-medium`}>
                      {r.stage === "TO_COLLECT" ? formatTaka(r.duePaisa) : r.stage === "PREPAID" ? <span className={SOFT}>nothing at the door</span> : formatTaka(r.codCollectedPaisa)}
                    </span>
                  </td>
                  <td className={`${CELL} w-[130px]`}>
                    {c?.costRecorded ? (
                      <>
                        <span className={VALUE}>{formatTaka(c.costPaisa)}</span>
                        <span className={LABEL}>{c.paidCash ? "cash at the door" : "recorded"}</span>
                      </>
                    ) : c && r.deliveryStatus === "delivered" ? (
                      <Pill colour={SOLID.amber}>not recorded</Pill>
                    ) : (
                      <span className={SOFT}>—</span>
                    )}
                  </td>
                  <td className={`${CELL} w-[110px] text-right whitespace-nowrap`}>
                    <span className="font-medium">{formatTaka(r.cogsPaisa)}</span>
                    <span className={LABEL}>{r.cogsFrom}</span>
                  </td>
                  <td className={`${CELL} w-[110px] text-right whitespace-nowrap`}>
                    <span className="font-medium" style={{ color: r.profitPaisa < 0 ? SOLID.red : SOLID.green }}>{formatTaka(r.profitPaisa)}</span>
                    <span className={LABEL}>{r.profitFinal ? "final" : "before carrier fee"}</span>
                  </td>
                  <td className={`${CELL} w-[190px]`}>
                    {c && c.carrierId && (
                      <div className="flex flex-col gap-1.5">
                        {r.stage === "WITH_CARRIER" && (
                          <ActButton kind="solid" colour={SOLID.green} disabled={busy === r.id} onClick={() => { setOpen(isOpen && open?.what === "received" ? null : { id: r.id, what: "received" }); setAmount(""); }}>
                            Cash received
                          </ActButton>
                        )}
                        {r.deliveryStatus === "delivered" && !c.costRecorded && (
                          <ActButton kind="primary" disabled={busy === r.id} onClick={() => { setOpen(isOpen && open?.what === "paid" ? null : { id: r.id, what: "paid" }); setAmount(""); }}>
                            Pay rider or courier
                          </ActButton>
                        )}
                        {isOpen && open?.what === "received" && (
                          <div className="rounded-[12px] border border-[#3e3447] bg-white p-2.5 flex flex-col gap-2">
                            <span className={LABEL}>{formatTaka(r.codCollectedPaisa)} landed in</span>
                            <select className="ipt h-[34px] text-[12.5px]" value={account} onChange={(e) => setAccount(e.target.value)}>
                              <option value="">Pick an account…</option>
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                            <ActButton kind="solid" colour={SOLID.green} disabled={busy === r.id} onClick={() => act(r, "received")}>{busy === r.id ? "…" : "Confirm received"}</ActButton>
                          </div>
                        )}
                        {isOpen && open?.what === "paid" && (
                          <div className="rounded-[12px] border border-[#3e3447] bg-white p-2.5 flex flex-col gap-2">
                            <span className={LABEL}>Paid to {c.name} for this parcel</span>
                            <input type="number" min={0} className="ipt h-[34px] text-[12.5px]" placeholder="৳" value={amount} onChange={(e) => setAmount(e.target.value)} />
                            <ActButton kind="primary" disabled={busy === r.id} onClick={() => act(r, "paid")}>{busy === r.id ? "…" : "Save"}</ActButton>
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
