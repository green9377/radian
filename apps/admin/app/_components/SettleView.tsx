"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { WRAP, ErrorBox } from "./OrderViews";
import {
  listUnsettled, settleCarrier, listRiders, listCourierServices, financeAccountsSafe, formatTaka,
  type ApiUnsettledParcel, type ApiRider, type ApiCourierService, type ApiFinanceAccount,
} from "../_data/api";
import {
  SOLID, CELL, LABEL, VALUE, SOFT, NO, NAME, TABLE_WRAP, TABLE,
  Pill, ActButton, Band, Search, Count, Head, Empty, fmtStamp, type Tile,
} from "./OrdersUi";

/*
  Delivery -> Settle (owner, 10 Sep 2026; design/delivery-flow-v1.html tab 3).
  Same accounting as before (DEC-DLV-016/017): a parcel is here while its cost
  is not typed or its COD cash is still with the carrier. Three tabs by who
  carried it. One-time riders (Pathao ride, Uber) never have a name — they are
  grouped by platform and the fare was usually paid in cash at the door, so
  those rows arrive with the cost already recorded and only the COD to tick.
  The cost box is never pre-filled (owner).
*/

type Tab = "RIDER" | "COURIER" | "ONE_TIME";
const TABS: [Tab, string][] = [
  ["RIDER", "Own riders"],
  ["COURIER", "Courier companies"],
  ["ONE_TIME", "One-time riders"],
];

const toPaisa = (s: string) => {
  const n = Number(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const HELP =
  "Every delivered parcel whose money is not finished: the delivery cost has not been typed, or it was COD and the cash has not come back. " +
  "Tick the parcels a carrier is settling, type the cost per parcel and the cash returned, say where the money landed. The cost is expensed once (5200); the cash becomes a remittance. " +
  "One-time riders are grouped by platform — no names are kept. A retry the customer pays for adds its cost to the order's due when it is recorded here.";

export default function SettleView() {
  const [rows, setRows] = useState<ApiUnsettledParcel[] | null>(null);
  const [riders, setRiders] = useState<ApiRider[]>([]);
  const [couriers, setCouriers] = useState<ApiCourierService[]>([]);
  const [accounts, setAccounts] = useState<ApiFinanceAccount[]>([]);
  const [tab, setTab] = useState<Tab>("RIDER");
  const [carrierId, setCarrierId] = useState("");
  const [intoAccountId, setIntoAccountId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [cod, setCod] = useState<Record<string, string>>({});
  const [cost, setCost] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const [u, r, c, a] = await Promise.all([listUnsettled(), listRiders(), listCourierServices(), financeAccountsSafe()]);
      setRows(u);
      setRiders(r);
      setCouriers(c);
      setAccounts((a ?? []).filter((x) => x.isMoneyAccount && x.isActive));
    } catch (e) {
      setRows([]);
      setErr(e instanceof Error ? e.message : "could not reach the API");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setPicked(new Set());
    setCarrierId("");
  }, [tab]);

  const all = rows ?? [];
  const byTab = useMemo(() => all.filter((r) => r.kind === tab), [all, tab]);
  /* the carriers that actually have parcels waiting, with a count each */
  const carriers = useMemo(() => {
    const m = new Map<string, { id: string; name: string; n: number; cash: number }>();
    for (const r of byTab) {
      const id = r.carrierId ?? "";
      const name = r.carrier?.name ?? (r.platform ? `${r.platform} rider` : "Unknown");
      const cur = m.get(id) ?? { id, name, n: 0, cash: 0 };
      cur.n++;
      if (!r.codHandedOver) cur.cash += r.codDuePaisa;
      m.set(id, cur);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [byTab]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return byTab.filter((r) => (!carrierId || r.carrierId === carrierId) && (!needle || (r.orderNo ?? "").toLowerCase().includes(needle) || (r.consignmentNo ?? "").toLowerCase().includes(needle) || (r.riderPhone ?? "").includes(needle)));
  }, [byTab, carrierId, q]);

  const stats = useMemo(() => {
    let cash = 0, cashN = 0, noCost = 0;
    const perKind: Record<Tab, number> = { RIDER: 0, COURIER: 0, ONE_TIME: 0 };
    for (const r of all) {
      if (!r.codHandedOver && r.codDuePaisa > 0) { cash += r.codDuePaisa; cashN++; }
      if (!r.costRecorded) noCost++;
      perKind[r.kind]++;
    }
    return { cash, cashN, noCost, perKind };
  }, [all]);

  const totals = useMemo(() => {
    let gross = 0, charge = 0;
    for (const r of shown) {
      if (!picked.has(r.assignmentId)) continue;
      gross += r.codDuePaisa > 0 && !r.codHandedOver ? toPaisa(cod[r.assignmentId] ?? "") : 0;
      charge += toPaisa(cost[r.assignmentId] ?? "");
    }
    return { gross, charge, net: gross - charge };
  }, [shown, picked, cod, cost]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pickAll = () => setPicked(new Set(shown.map((r) => r.assignmentId)));

  const submit = async () => {
    if (picked.size === 0) return;
    if (!carrierId) {
      setErr("Pick which carrier is settling first.");
      return;
    }
    if (totals.gross > 0 && !intoAccountId) {
      setErr("Say where the money landed.");
      return;
    }
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const res = await settleCarrier({
        carrierType: tab,
        carrierId,
        intoAccountId: intoAccountId || undefined,
        lines: [...picked].map((id) => ({ assignmentId: id, codPaisa: toPaisa(cod[id] ?? ""), chargePaisa: toPaisa(cost[id] ?? "") })),
      });
      setOk(`Settled ${res.settled} parcel${res.settled === 1 ? "" : "s"} with ${res.carrierName}${res.remittance ? ` · ${res.remittance.remittanceNo}` : ""}.`);
      setPicked(new Set());
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not settle.");
    } finally {
      setBusy(false);
    }
  };

  const v = (s: string) => (rows === null ? "…" : s);
  const tiles: Tile[] = [
    { key: "cash", label: "Cash with carriers", value: v(formatTaka(stats.cash)), hot: stats.cash > 0, sub: rows === null ? undefined : `${stats.cashN} COD parcel${stats.cashN === 1 ? "" : "s"} delivered` },
    { key: "cost", label: "Cost not recorded", value: v(String(stats.noCost)), sub: "parcels" },
    { key: "RIDER", label: "Own riders", value: v(String(stats.perKind.RIDER)), sub: "parcels open" },
    { key: "COURIER", label: "Courier companies", value: v(String(stats.perKind.COURIER)), sub: "parcels open" },
    { key: "ONE_TIME", label: "One-time riders", value: v(String(stats.perKind.ONE_TIME)), sub: "Pathao ride · Uber · other" },
  ];

  const selected = carriers.find((c) => c.id === carrierId);

  return (
    <div className={WRAP}>
      <Band
        title="Settle"
        help={HELP}
        tiles={tiles}
        active={tab}
        onTile={(k) => {
          if (k === "RIDER" || k === "COURIER" || k === "ONE_TIME") setTab(k);
        }}
        right={
          <Link href="/finance/carrier" className="text-[12.5px] font-medium text-[#d9c5e6] hover:text-white">
            Cash with carriers · Accounts ›
          </Link>
        }
      />

      <div className="flex gap-0.5 border-b-[1.5px] border-[#3e3447] mb-3">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3.5 py-2.5 text-[13px] font-medium -mb-[1.5px] border-b-2 inline-flex items-center gap-1.5 ${tab === k ? "text-purple border-purple" : "text-body-soft border-transparent hover:text-purple"}`}
          >
            {label}
            {rows !== null && <span className="text-[11px] px-1.5 rounded-full bg-lavender-deep text-purple">{stats.perKind[k]}</span>}
          </button>
        ))}
      </div>

      <div className="flex gap-2.5 flex-wrap items-center mb-3">
        <select className="ipt max-w-[320px] h-[40px] font-medium" value={carrierId} onChange={(e) => setCarrierId(e.target.value)}>
          <option value="">{tab === "RIDER" ? "Which rider is settling…" : tab === "COURIER" ? "Which courier is settling…" : "Which platform…"}</option>
          {carriers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.n} parcel{c.n === 1 ? "" : "s"}{c.cash > 0 ? ` · ${formatTaka(c.cash)} cash` : ""}
            </option>
          ))}
        </select>
        <Search value={q} onChange={setQ} placeholder={tab === "COURIER" ? "Order no, CN" : "Order no, phone"} />
        {carrierId && shown.length > 0 && (
          <button type="button" onClick={pickAll} className="h-[40px] px-3.5 rounded-[11px] border border-[#3e3447] bg-white text-[13px] font-medium text-purple">
            Tick all {shown.length}
          </button>
        )}
        <Count n={shown.length} noun="parcel" loading={rows === null} />
      </div>

      {err && <ErrorBox error={err} onRetry={() => void load()} />}
      {ok && (
        <div className="rounded-[12px] border-[1.5px] px-4 py-3 mb-3 text-[13px] font-medium bg-white" style={{ borderColor: "#31493b", color: SOLID.green }}>
          {ok}
        </div>
      )}

      <div className={TABLE_WRAP}>
        <table className={TABLE}>
          <Head heads={["", "Delivered", "Order No", tab === "COURIER" ? "CN" : tab === "ONE_TIME" ? "Rider phone" : "Assignment", "Going to", "COD", "Cash", tab === "COURIER" ? "Delivery charge" : "Delivery cost", "Status"]} />
          <tbody>
            {shown.map((r) => {
              const on = picked.has(r.assignmentId);
              const cashOpen = r.codDuePaisa > 0 && !r.codHandedOver;
              return (
                <tr key={r.assignmentId} className="hover:bg-[#231538]" style={on ? { background: "#291e31" } : undefined}>
                  <td className={`${CELL} w-[34px]`}>
                    <input type="checkbox" className="w-[15px] h-[15px] accent-purple mt-0.5" checked={on} onChange={() => toggle(r.assignmentId)} disabled={!carrierId} aria-label={`Settle ${r.orderNo}`} />
                  </td>
                  <td className={`${CELL} w-[150px]`}>
                    <span className={VALUE}>{fmtStamp(r.deliveredAt)}</span>
                    {r.daysSince !== null && r.daysSince > 0 && <span className={LABEL}>{r.daysSince} day{r.daysSince === 1 ? "" : "s"} ago</span>}
                  </td>
                  <td className={`${CELL} w-[118px]`}>{r.orderId ? <Link href={`/orders/${r.orderId}`} className={NO}>{r.orderNo}</Link> : <span className={SOFT}>—</span>}</td>
                  <td className={`${CELL} w-[130px]`}>
                    <span className={SOFT}>{tab === "COURIER" ? r.consignmentNo || "—" : tab === "ONE_TIME" ? r.riderPhone || "—" : r.assignmentNo}</span>
                    {r.chargeCustomer && <span className={LABEL} style={{ color: SOLID.amber }}>retry · customer pays</span>}
                  </td>
                  <td className={CELL}>
                    <span className={NAME}>{r.carrier?.name ?? "—"}</span>
                    <span className={`block ${SOFT}`}>{r.address ?? ""}</span>
                  </td>
                  <td className={`${CELL} w-[100px] text-right whitespace-nowrap`}>
                    {r.codDuePaisa > 0 ? <span className="font-medium">{formatTaka(r.codDuePaisa)}</span> : <span className={SOFT}>prepaid</span>}
                  </td>
                  <td className={`${CELL} w-[170px]`}>
                    {!cashOpen ? (
                      <Pill colour={r.codDuePaisa > 0 ? SOLID.green : SOLID.grey}>{r.codDuePaisa > 0 ? "collected" : "—"}</Pill>
                    ) : on ? (
                      <input
                        type="number"
                        min={0}
                        className="ipt h-[32px] w-[120px] text-[12.5px]"
                        placeholder={`৳ ${Math.round(r.codDuePaisa / 100)}`}
                        value={cod[r.assignmentId] ?? ""}
                        onChange={(e) => setCod((m) => ({ ...m, [r.assignmentId]: e.target.value }))}
                      />
                    ) : (
                      <Pill colour={SOLID.amber}>with carrier</Pill>
                    )}
                  </td>
                  <td className={`${CELL} w-[150px]`}>
                    {r.costRecorded ? (
                      <span className={VALUE}>
                        {formatTaka(r.costPaisa)}
                        {r.paidCash && <span className={LABEL}>paid in cash at the door</span>}
                      </span>
                    ) : on ? (
                      <input
                        type="number"
                        min={0}
                        className="ipt h-[32px] w-[120px] text-[12.5px]"
                        placeholder="৳"
                        value={cost[r.assignmentId] ?? ""}
                        onChange={(e) => setCost((m) => ({ ...m, [r.assignmentId]: e.target.value }))}
                      />
                    ) : (
                      <span className={SOFT}>not typed</span>
                    )}
                  </td>
                  <td className={`${CELL} w-[110px]`}>
                    <Pill colour={SOLID.grey}>open</Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows !== null && shown.length === 0 && <Empty text={carrierId ? "Nothing open with this carrier." : "Pick a carrier to see the parcels waiting."} />}
      </div>

      {picked.size > 0 && (
        <div className="mt-3 rounded-[14px] border border-[#3e3447] bg-white px-5 py-4 flex gap-4 items-end flex-wrap">
          <div>
            <span className={LABEL}>Settling with</span>
            <span className={VALUE}>{selected?.name ?? "—"} · {picked.size} parcel{picked.size === 1 ? "" : "s"}</span>
          </div>
          <div>
            <span className={LABEL}>Cash returned</span>
            <span className={VALUE} style={{ color: SOLID.green }}>{formatTaka(totals.gross)}</span>
          </div>
          <div>
            <span className={LABEL}>Delivery cost</span>
            <span className={VALUE} style={{ color: SOLID.red }}>{formatTaka(totals.charge)}</span>
          </div>
          <div>
            <span className={LABEL}>Net</span>
            <span className={VALUE}>{formatTaka(totals.net)}</span>
          </div>
          {totals.gross > 0 && (
            <div className="min-w-[220px]">
              <span className={LABEL}>Money landed in</span>
              <select className="ipt h-[38px]" value={intoAccountId} onChange={(e) => setIntoAccountId(e.target.value)}>
                <option value="">Pick an account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="ml-auto w-[200px]">
            <ActButton kind="primary" onClick={submit} disabled={busy}>
              {busy ? "Settling…" : `Settle ${picked.size} parcel${picked.size === 1 ? "" : "s"}`}
            </ActButton>
          </div>
        </div>
      )}
    </div>
  );
}
