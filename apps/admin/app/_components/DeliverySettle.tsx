"use client";

/*  SETTLING A CARRIER — DEC-DLV-016/017, 12 Aug 2026.

    THE PROBLEM THIS SCREEN EXISTS FOR. `DeliveryAssignment.costPaisa` has been
    in the schema for weeks, read by the analytics and by Finance, and written
    by nothing at all. Account 5200 Delivery Cost was therefore always empty and
    delivery margin always read as the whole charge — pure profit on every
    parcel. Meanwhile COD cash sat with riders and couriers with no per-parcel
    record of whether it ever came back.

    ONE LIST, NOT TWO. The owner's decision. A parcel appears here when its
    accounts are unfinished, and unfinished means either of two things: nobody
    has said what the delivery cost, or it was COD and the cash has not
    returned. Prepaid parcels are on the list too — there is nothing to
    reconcile on them, but the rider was still paid, and a COD-only list would
    quietly lose the cost of most of the shop's deliveries.

    WHY BOTH NUMBERS ARE TYPED HERE AND NOT SOMEWHERE ELSE. For a courier they
    arrive on the same piece of paper: their settlement sheet lists, per
    consignment, what they collected and what they charged. Splitting that into
    two screens would mean transcribing one sheet twice. The owner also decided
    the cost is never a fixed amount and is never pre-filled — the box starts
    empty, every time, because a suggested number is a number nobody checks.

    ⚠️ THE CHARGE IS EXPENSED ONCE. What is typed in "Cost" is written onto the
    parcel, and the parcel is what posts to 5200. The remittance this creates
    clears the accrual rather than debiting 5200 again. Change one side of that
    and every courier fee in the books doubles.
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import {
  ApiCourierService, ApiFinanceAccount, ApiRider, ApiUnsettledParcel,
  financeAccountsSafe, formatTaka, listCourierServices, listRiders,
  listUnsettled, settleCarrier,
} from "../_data/api";

const WRAP = "px-6 md:px-8 pt-7 pb-16 max-w-[1600px]";

function Guide({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] font-semibold tracking-[0.03em] uppercase text-body-soft mb-1.5">{children}</span>;
}

/** taka typed by a person → paisa. Empty stays empty, never becomes 0. */
const toPaisa = (s: string) => {
  const n = Number(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export function DeliverySettle() {
  const [rows, setRows] = useState<ApiUnsettledParcel[] | null>(null);
  const [riders, setRiders] = useState<ApiRider[]>([]);
  const [couriers, setCouriers] = useState<ApiCourierService[]>([]);
  const [accounts, setAccounts] = useState<ApiFinanceAccount[]>([]);
  const [carrierId, setCarrierId] = useState("");
  const [intoAccountId, setIntoAccountId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [cod, setCod] = useState<Record<string, string>>({});
  const [cost, setCost] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const [u, r, c, a] = await Promise.all([
        listUnsettled(carrierId || undefined), listRiders(), listCourierServices(), financeAccountsSafe(),
      ]);
      setRows(u);
      setRiders(r);
      setCouriers(c);
      setAccounts((a ?? []).filter((x) => x.isMoneyAccount && x.isActive));
    } catch (e) {
      setRows([]);
      setErr(e instanceof Error ? e.message : "could not reach the API");
    }
  }, [carrierId]);
  useEffect(() => { void load(); }, [load]);

  /*  A tick must not outlive the row. Changing carrier reloads the list, and a
      selection left over from the previous one would settle the wrong parcels. */
  useEffect(() => { setPicked(new Set()); }, [carrierId]);

  const totals = useMemo(() => {
    let gross = 0, charge = 0, expected = 0;
    for (const r of rows ?? []) {
      if (!picked.has(r.assignmentId)) continue;
      expected += r.codDuePaisa;
      gross += r.codDuePaisa > 0 ? toPaisa(cod[r.assignmentId] ?? "") : 0;
      charge += toPaisa(cost[r.assignmentId] ?? "");
    }
    return { gross, charge, expected, net: gross - charge };
  }, [rows, picked, cod, cost]);

  const carrierName =
    riders.find((r) => r.id === carrierId)?.name ??
    couriers.find((c) => c.id === carrierId)?.name ?? "";
  const carrierType: "RIDER" | "COURIER" = riders.some((r) => r.id === carrierId) ? "RIDER" : "COURIER";

  const toggle = (id: string) =>
    setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const submit = async () => {
    if (picked.size === 0) return;
    if (!carrierId) { setErr("Pick which rider or courier is settling"); return; }
    if (totals.gross > 0 && !intoAccountId) { setErr("Say where the money landed"); return; }
    setBusy(true); setErr(""); setOk("");
    try {
      const res = await settleCarrier({
        carrierType, carrierId,
        intoAccountId: intoAccountId || undefined,
        lines: [...picked].map((id) => ({
          assignmentId: id,
          codPaisa: toPaisa(cod[id] ?? ""),
          chargePaisa: toPaisa(cost[id] ?? ""),
        })),
      });
      setPicked(new Set()); setCod({}); setCost({});
      /*  ⚠️ A PREPAID SETTLEMENT BANKS NOTHING, and this line used to say it
          banked a NEGATIVE amount — "−৳120 in", which reads as the rider owing
          the shop when the truth is the reverse: no cash came back and the shop
          now owes him that ৳120, sitting in 2300 Accrued. Seen while walking a
          prepaid parcel on 31 Aug. The API returns `netPaisa: null` when there
          was no receipt, and the sentence says what actually happened.  */
      setOk(
        res.remittance
          ? `${res.settled} parcel(s) settled — ${formatTaka(res.netPaisa ?? 0)} banked, ${res.remittance.remittanceNo}`
          : `${res.settled} parcel(s) settled — no cash to bank; ${formatTaka(res.chargePaisa)} is owed to the carrier`,
      );
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "could not settle");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={WRAP}>
      <div className="mb-5">
        <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
          <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
          Delivery · settle
        </div>
        <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">Delivered — accounts unfinished</h1>
      </div>

      {err && <div className="bg-[#fdeff0] text-[#b42318] text-[13px] font-medium px-4 py-3 rounded-[12px] mb-4">{err}</div>}
      {ok && <div className="bg-[#e9f9ef] text-[#0e7a3d] text-[13px] font-medium px-4 py-3 rounded-[12px] mb-4">{ok}</div>}

      <div className="flex items-end gap-3 flex-wrap mb-5">
        <div className="min-w-[220px]">
          <Guide>Who is settling</Guide>
          <select className="ipt" value={carrierId} onChange={(e) => setCarrierId(e.target.value)}>
            <option value="">— everyone —</option>
            <optgroup label="Riders">
              {riders.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
            </optgroup>
            <optgroup label="Couriers">
              {couriers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </optgroup>
          </select>
        </div>
        <div className="min-w-[220px]">
          <Guide>Money landed in</Guide>
          <select className="ipt" value={intoAccountId} onChange={(e) => setIntoAccountId(e.target.value)}>
            <option value="">— pick an account —</option>
            {accounts.map((a) => (<option key={a.id} value={a.id}>{a.code} · {a.name}</option>))}
          </select>
        </div>
        <button onClick={() => void load()} className="border border-lavender-deep bg-white text-body-soft hover:text-purple text-[13px] font-medium px-4 py-2.5 rounded-[11px]">↻ Refresh</button>
      </div>

      {picked.size > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { l: "Parcels", v: String(picked.size), c: "#7d2ea8" },
            { l: "Cash expected", v: formatTaka(totals.expected), c: "#0b5f9e" },
            { l: "Cash received", v: formatTaka(totals.gross), c: totals.gross < totals.expected ? "#b42318" : "#0e7a3d" },
            { l: "Their charge", v: formatTaka(totals.charge), c: "#b45309" },
          ].map((s) => (
            <div key={s.l} className="bg-white border border-lavender-deep rounded-[13px] px-4 py-3">
              <div className="text-[12px] text-body-soft">{s.l}</div>
              <div className="text-[19px] font-semibold" style={{ color: s.c }}>{s.v}</div>
            </div>
          ))}
        </div>
      )}

      {/*  Short payment is shown, never blocked. "They handed over less than was
          due" is a fact worth recording and chasing, not an input error. */}
      {picked.size > 0 && totals.gross > 0 && totals.gross < totals.expected && (
        <div className="bg-[#fff4e2] text-[#b45309] text-[13px] px-4 py-3 rounded-[12px] mb-4">
          {formatTaka(totals.expected - totals.gross)} less than was due on these parcels.
        </div>
      )}

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
                <th className="px-3 py-3 w-[36px]" />
                <th className="text-left font-medium px-3 py-3 w-[120px]">Parcel</th>
                <th className="text-left font-medium px-3 py-3">Went to</th>
                <th className="text-left font-medium px-3 py-3 w-[130px]">Carrier</th>
                <th className="text-right font-medium px-3 py-3 w-[100px]">COD due</th>
                <th className="text-right font-medium px-3 py-3 w-[120px]">Received</th>
                <th className="text-right font-medium px-3 py-3 w-[120px]">Cost</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => {
                const stale = (r.daysSince ?? 0) >= 7 && r.codDuePaisa > 0;
                const prepaid = r.codDuePaisa === 0;
                return (
                  <tr key={r.assignmentId} className={`border-t border-lavender-deep ${stale ? "bg-[#fff4e2]" : "hover:bg-lavender/40"}`}>
                    <td className="px-3 py-2.5 text-center">
                      <input type="checkbox" checked={picked.has(r.assignmentId)} onChange={() => toggle(r.assignmentId)} aria-label={`Select ${r.orderNo}`} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono font-bold text-purple text-[12.5px]">{r.orderNo}</span>
                      <div className="text-[11px] text-body-soft">
                        {r.daysSince === null ? "—" : r.daysSince === 0 ? "today" : `${r.daysSince} days ago`}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-[12.5px] text-body truncate max-w-[300px]">{r.address ?? "—"}</div>
                      {r.consignmentNo && <div className="text-[11px] font-mono text-body-soft">{r.consignmentNo}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] text-body-soft">
                      {r.kind === "RIDER" ? "🛵" : "📦"} {r.carrier?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12.5px]">
                      {prepaid ? <span className="text-body-soft">prepaid</span> : formatTaka(r.codDuePaisa)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {prepaid ? (
                        <span className="text-body-soft text-[12px]">—</span>
                      ) : (
                        <input
                          className="ipt text-right py-1.5" inputMode="decimal"
                          value={cod[r.assignmentId] ?? ""} placeholder="0"
                          onChange={(e) => setCod((x) => ({ ...x, [r.assignmentId]: e.target.value }))}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <input
                        className="ipt text-right py-1.5" inputMode="decimal"
                        value={cost[r.assignmentId] ?? ""} placeholder="0"
                        onChange={(e) => setCost((x) => ({ ...x, [r.assignmentId]: e.target.value }))}
                      />
                    </td>
                  </tr>
                );
              })}
              {rows !== null && rows.length === 0 && (
                <tr><td colSpan={7} className="text-center text-body-soft py-14 border-t border-lavender-deep">
                  Nothing outstanding.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-lavender-deep flex-wrap">
          <span className="text-[12.5px] text-body-soft">
            {rows?.length ?? 0} parcel(s) waiting{carrierName ? ` from ${carrierName}` : ""}
          </span>
          <button
            onClick={() => void submit()} disabled={busy || picked.size === 0}
            className="bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] disabled:opacity-40"
          >
            <Icon name="check" size={15} /> {busy ? "Settling…" : `Settle ${picked.size || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
