"use client";

/*
  The slower-moving money and the reports that read it back:
    /finance/carrier  — COD cash sitting with a rider or courier (DEC-FIN-021)
    /finance/assets   — things we own · money paid in advance · money borrowed
    /finance/reports  — salary & bills · P&L · who owes what · daily flow · leakage
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiFinanceAccount, apiGet, apiPost, financeAccounts } from "../_data/api";
import {
  Bar, Banner, Card, Chip, Empty, FinHeader, Flash, Kpi, Panel, Table, Tabs, Td, Th, TONE, WRAP,
  btnGhost, btnPrimary, btnPrimaryStyle, input, Lbl, taka, toPaisa, todayStr,
} from "./FinanceUI";

// both go through the shared client, so the session token rides along and the
// PIN box appears exactly as it does everywhere else. A plain fetch() here used
// to skip the token entirely — every one of these panels came back empty.
async function get<T>(path: string): Promise<T> {
  return apiGet<T>(path);
}
async function post<T>(path: string, body: unknown): Promise<T> {
  // goes through the shared client so the session token and the PIN prompt
  // behave exactly as they do everywhere else
  return apiPost<T>(path, body);
}

/* ==================== CARRIER MONEY ==================== */

interface CarrierRow { carrierId: string; name: string; type: string; paisa: number; daysHeld: number }
interface Remittance { id: string; remittanceNo: string; carrierName: string; receivedAt: string; grossPaisa: number; chargePaisa: number; netPaisa: number; intoAccount?: { name: string } }

export function CarrierMoneyLive() {
  const [data, setData] = useState<{ totalPaisa: number; carriers: CarrierRow[] } | null>(null);
  const [rows, setRows] = useState<Remittance[]>([]);
  const [accs, setAccs] = useState<ApiFinanceAccount[]>([]);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  const [f, setF] = useState({ carrierId: "", carrierName: "", carrierType: "COURIER", gross: "", charge: "", intoAccountId: "", receivedAt: todayStr() });

  const load = useCallback(async () => {
    try {
      const [c, r, a] = await Promise.all([
        get<{ totalPaisa: number; carriers: CarrierRow[] }>("/finance/carrier"),
        get<Remittance[]>("/finance/carrier/remittances"),
        financeAccounts(),
      ]);
      setData(c); setRows(r); setAccs(a);
      setF((p) => ({ ...p, intoAccountId: p.intoAccountId || (a.find((x) => x.code === "1040")?.id ?? "") }));
    } catch (e) { setErr(e instanceof Error ? e.message : "API offline"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const money = useMemo(() => accs.filter((a) => a.isMoneyAccount && a.isActive), [accs]);
  const net = Math.max(0, toPaisa(f.gross) - toPaisa(f.charge));
  const oldest = data?.carriers.length ? Math.max(...data.carriers.map((c) => c.daysHeld)) : 0;

  return (
    <div className={WRAP}>
      <FinHeader
        title="Cash with riders & couriers"
        emoji="🛵"
        tone="amber"
      />
      <Flash ok={ok} err={err} />

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
          <Kpi label="Held by carriers" value={taka(data.totalPaisa)} emoji="💸" tone={data.totalPaisa > 0 ? "amber" : "emerald"} />
          <Kpi label="Carriers holding" value={String(data.carriers.length)} emoji="🚚" tone="sky" />
          <Kpi label="Longest held" value={oldest ? `${oldest} days` : "—"} emoji="⏱" tone={oldest > 7 ? "rose" : "slate"} hint={oldest > 7 ? "chase this one" : undefined} />
        </div>
      )}

      <Panel title="Who is holding our cash" emoji="🤲" tone="amber" className="mb-5">
        <Table head={<><Th>Carrier</Th><Th>Type</Th><Th right>Holding</Th><Th right>Waiting</Th><Th right w="160px" /></>}>
          {(!data || data.carriers.length === 0) && (
            <tr><Td className="text-center text-body-soft py-8" >Nobody is holding our cash right now.</Td><Td /><Td /><Td /><Td /></tr>
          )}
          {data?.carriers.map((c) => (
            <tr key={c.carrierId}>
              <Td><span className="font-semibold text-purple">{c.name}</span></Td>
              <Td><Chip tone={c.type === "COURIER" ? "sky" : "brand"}>{c.type === "COURIER" ? "Courier" : "Rider"}</Chip></Td>
              <Td right><span className="font-bold">{taka(c.paisa)}</span></Td>
              <Td right>
                <span className="font-semibold" style={{ color: c.daysHeld > 7 ? TONE.rose.text : "var(--t-soft)" }}>{c.daysHeld} days</span>
              </Td>
              <Td right>
                <button className={btnGhost} onClick={() => setF({ ...f, carrierId: c.carrierId, carrierName: c.name, carrierType: c.type, gross: String(c.paisa / 100) })}>
                  Record handover
                </button>
              </Td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel title="Record a handover" emoji="✍" tone="emerald" className="mb-5">
        <div className="px-5 py-4">
          <div className="grid md:grid-cols-6 gap-3 items-end">
            <div><Lbl>Date</Lbl><input type="date" className={input} value={f.receivedAt} onChange={(e) => setF({ ...f, receivedAt: e.target.value })} /></div>
            <div><Lbl>Who</Lbl><input className={input} value={f.carrierName} onChange={(e) => setF({ ...f, carrierName: e.target.value })} placeholder="Steadfast" /></div>
            <div><Lbl>They collected (৳)</Lbl><input className={input} value={f.gross} onChange={(e) => setF({ ...f, gross: e.target.value })} /></div>
            <div><Lbl>Their charge (৳)</Lbl><input className={input} value={f.charge} onChange={(e) => setF({ ...f, charge: e.target.value })} placeholder="0" /></div>
            <div>
              <Lbl>Landed in</Lbl>
              <select className={input} value={f.intoAccountId} onChange={(e) => setF({ ...f, intoAccountId: e.target.value })}>
                {money.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <button className={btnPrimary} style={btnPrimaryStyle} disabled={toPaisa(f.gross) <= 0 || !f.intoAccountId}
                onClick={async () => {
                  try {
                    await post("/finance/carrier/remit", {
                      carrierId: f.carrierId || "unknown", carrierName: f.carrierName || "Carrier",
                      carrierType: f.carrierType, grossPaisa: toPaisa(f.gross), chargePaisa: toPaisa(f.charge),
                      intoAccountId: f.intoAccountId, receivedAt: f.receivedAt, actorName: "admin",
                    });
                    setF({ ...f, gross: "", charge: "" });
                    await load(); setErr(""); setOk("Handover recorded"); window.setTimeout(() => setOk(""), 4000);
                  } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
                }}>Record</button>
            </div>
          </div>
          <div className="text-[12.5px] text-body-soft mt-3">
            Landing in your account: <b className="text-purple">{taka(net)}</b> — the charge is booked as a delivery cost, so the real margin stays honest.
          </div>
        </div>
      </Panel>

      {rows.length > 0 && (
        <Panel title="Handovers so far" emoji="📜" tone="slate">
          <Table head={<><Th w="110px">No</Th><Th w="110px">Date</Th><Th>Who → where</Th><Th right>Charge</Th><Th right w="130px">Landed</Th></>}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td><span className="font-semibold text-purple">{r.remittanceNo}</span></Td>
                <Td><span className="text-body-soft">{r.receivedAt.slice(0, 10)}</span></Td>
                <Td>{r.carrierName} → <b>{r.intoAccount?.name}</b></Td>
                <Td right><span className="text-body-soft">{r.chargePaisa > 0 ? taka(r.chargePaisa) : "—"}</span></Td>
                <Td right><span className="font-bold">{taka(r.netPaisa)}</span></Td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}
    </div>
  );
}

/* ==================== ASSETS · PREPAID · LOANS ==================== */

interface Asset { id: string; assetNo: string; name: string; purchasedAt: string; costPaisa: number; usefulLifeMonths: number; accumDepPaisa: number; monthlyDepreciationPaisa: number; bookValuePaisa: number; depreciatedThisMonth: boolean; fullyDepreciated: boolean }
interface Prepaid { id: string; prepaidNo: string; name: string; totalPaisa: number; months: number; amortizedPaisa: number; remainingPaisa: number; monthlyPaisa: number; isDeposit: boolean }
interface Loan { id: string; loanNo: string; lenderName: string; kind: string; principalPaisa: number; interestRateBp: number; outstandingPaisa: number; principalPaidPaisa: number; interestPaidPaisa: number }

export function AssetsLoansLive() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [prepaid, setPrepaid] = useState<Prepaid[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [accs, setAccs] = useState<ApiFinanceAccount[]>([]);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  const [tab, setTab] = useState<"assets" | "prepaid" | "loans">("assets");
  const [a, setA] = useState({ name: "", cost: "", life: "48", paidFromId: "", purchasedAt: todayStr() });
  const [p, setP] = useState({ name: "", total: "", months: "0", expenseAccountId: "", paidFromId: "", startsOn: todayStr() });
  const [l, setL] = useState({ lenderName: "", kind: "FAMILY", principal: "", rate: "", intoAccountId: "", startsOn: todayStr() });
  const [pay, setPay] = useState<{ loan: Loan; principal: string; interest: string; from: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [x, y, z, acc] = await Promise.all([
        get<Asset[]>("/finance/assets"), get<Prepaid[]>("/finance/prepaid"),
        get<Loan[]>("/finance/loans"), financeAccounts(),
      ]);
      setAssets(x); setPrepaid(y); setLoans(z); setAccs(acc);
      const cash = acc.find((m) => m.isMoneyAccount)?.id ?? "";
      setA((s) => ({ ...s, paidFromId: s.paidFromId || cash }));
      setP((s) => ({ ...s, paidFromId: s.paidFromId || cash }));
      setL((s) => ({ ...s, intoAccountId: s.intoAccountId || cash }));
    } catch (e) { setErr(e instanceof Error ? e.message : "API offline"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const money = useMemo(() => accs.filter((x) => x.isMoneyAccount && x.isActive), [accs]);
  const expenses = useMemo(() => accs.filter((x) => x.type === "EXPENSE" && x.isActive), [accs]);
  const flash = (m: string) => { setOk(m); setErr(""); window.setTimeout(() => setOk(""), 4000); };
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : "Could not save");

  const ownValue = assets.reduce((n, x) => n + x.bookValuePaisa, 0);
  const advanceLeft = prepaid.reduce((n, x) => n + x.remainingPaisa, 0);
  const debt = loans.reduce((n, x) => n + x.outstandingPaisa, 0);

  return (
    <div className={WRAP}>
      <FinHeader
        title="Assets, advances & loans"
        emoji="🏛"
        tone="sky"
        right={
          <button className={btnGhost} onClick={async () => {
            try {
              const r = await post<{ depreciation: { posted: number }; prepaid: { posted: number } }>("/finance/month-end", { actorName: "admin" });
              await load(); flash(`Month-end run — ${r.depreciation.posted} assets, ${r.prepaid.posted} advances posted`);
            } catch (e) { fail(e); }
          }}>⚙ Run this month</button>
        }
      />
      <Flash ok={ok} err={err} />

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Kpi label="Things we own are worth" value={taka(ownValue)} emoji="🧊" tone="sky" />
        <Kpi label="Advances not used up" value={taka(advanceLeft)} emoji="📆" tone="brand" />
        <Kpi label="Still owed to lenders" value={taka(debt)} emoji="🏦" tone={debt > 0 ? "amber" : "emerald"} />
      </div>

      <Tabs value={tab} onChange={setTab} items={[
        { key: "assets", label: "Things we own", count: assets.length, emoji: "🧊", tone: "sky" },
        { key: "prepaid", label: "Paid in advance", count: prepaid.length, emoji: "📆", tone: "brand" },
        { key: "loans", label: "Money borrowed", count: loans.length, emoji: "🏦", tone: "amber" },
      ]} />

      {tab === "assets" && (
        <>
          <Panel title="Add something we bought" emoji="➕" tone="sky" className="mb-5">
            <div className="px-5 py-4">
              <div className="grid md:grid-cols-6 gap-3 items-end">
                <div className="md:col-span-2"><Lbl>What is it</Lbl><input className={input} value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} placeholder="Display fridge" /></div>
                <div><Lbl>Cost (৳)</Lbl><input className={input} value={a.cost} onChange={(e) => setA({ ...a, cost: e.target.value })} /></div>
                <div><Lbl>Lasts (months)</Lbl><input className={input} value={a.life} onChange={(e) => setA({ ...a, life: e.target.value })} /></div>
                <div>
                  <Lbl>Paid from</Lbl>
                  <select className={input} value={a.paidFromId} onChange={(e) => setA({ ...a, paidFromId: e.target.value })}>
                    <option value="">Not now</option>
                    {money.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <button className={btnPrimary} style={btnPrimaryStyle} disabled={!a.name.trim() || toPaisa(a.cost) <= 0}
                    onClick={async () => {
                      try {
                        await post("/finance/assets", { name: a.name, costPaisa: toPaisa(a.cost), usefulLifeMonths: Number(a.life || "48"), paidFromId: a.paidFromId || null, purchasedAt: a.purchasedAt });
                        setA({ ...a, name: "", cost: "" }); await load(); flash("Added");
                      } catch (e) { fail(e); }
                    }}>Add</button>
                </div>
              </div>
              {a.cost && a.life && (
                <div className="text-[12.5px] text-body-soft mt-3">
                  About <b className="text-purple">{taka(Math.round(toPaisa(a.cost) / Number(a.life || 48)))}</b> a month of wear and tear.
                </div>
              )}
            </div>
          </Panel>

          <Panel title="What we own" emoji="🧊" tone="sky">
            <Table head={<><Th>Asset</Th><Th right>Cost</Th><Th right>Per month</Th><Th right>Worn off</Th><Th right>Worth now</Th><Th right w="110px">This month</Th></>}>
              {assets.length === 0 && <tr><Td className="py-8"><Empty emoji="🧊" title="Nothing added yet" /></Td><Td /><Td /><Td /><Td /><Td /></tr>}
              {assets.map((x) => (
                <tr key={x.id}>
                  <Td>
                    <div className="font-semibold text-purple">{x.name}</div>
                    <div className="text-[11.5px] text-body-soft">{x.assetNo} · bought {x.purchasedAt.slice(0, 10)}</div>
                  </Td>
                  <Td right>{taka(x.costPaisa)}</Td>
                  <Td right><span className="text-body-soft">{taka(x.monthlyDepreciationPaisa)}</span></Td>
                  <Td right><span className="text-body-soft">{taka(x.accumDepPaisa)}</span></Td>
                  <Td right><span className="font-bold">{taka(x.bookValuePaisa)}</span></Td>
                  <Td right>
                    {x.fullyDepreciated ? <Chip tone="slate">done</Chip>
                      : x.depreciatedThisMonth ? <Chip tone="emerald">posted</Chip>
                      : <Chip tone="amber">pending</Chip>}
                  </Td>
                </tr>
              ))}
            </Table>
          </Panel>
        </>
      )}

      {tab === "prepaid" && (
        <>
          <Panel title="Add money paid up front" emoji="➕" tone="brand" className="mb-5">
            <div className="px-5 py-4">
              <div className="grid md:grid-cols-6 gap-3 items-end">
                <div className="md:col-span-2"><Lbl>What is it</Lbl><input className={input} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="6 months shop rent" /></div>
                <div><Lbl>Amount (৳)</Lbl><input className={input} value={p.total} onChange={(e) => setP({ ...p, total: e.target.value })} /></div>
                <div><Lbl>Spread over (months)</Lbl><input className={input} value={p.months} onChange={(e) => setP({ ...p, months: e.target.value })} placeholder="0 = deposit" /></div>
                <div>
                  <Lbl>Becomes which cost</Lbl>
                  <select className={input} value={p.expenseAccountId} onChange={(e) => setP({ ...p, expenseAccountId: e.target.value })}>
                    <option value="">Shop rent</option>
                    {expenses.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
                <div>
                  <button className={btnPrimary} style={btnPrimaryStyle} disabled={!p.name.trim() || toPaisa(p.total) <= 0}
                    onClick={async () => {
                      try {
                        await post("/finance/prepaid", { name: p.name, totalPaisa: toPaisa(p.total), months: Number(p.months || "0"), expenseAccountId: p.expenseAccountId || null, paidFromId: p.paidFromId || null, startsOn: p.startsOn });
                        setP({ ...p, name: "", total: "" }); await load(); flash("Added");
                      } catch (e) { fail(e); }
                    }}>Add</button>
                </div>
              </div>
              <div className="text-[12.5px] text-body-soft mt-3">
                Months <b>0</b> means a refundable deposit.
              </div>
            </div>
          </Panel>

          <Panel title="Paid in advance" emoji="📆" tone="brand">
            <Table head={<><Th>What</Th><Th right>Paid</Th><Th right>Per month</Th><Th right>Used up</Th><Th right>Left</Th></>}>
              {prepaid.length === 0 && <tr><Td className="py-8"><Empty emoji="📆" title="Nothing added yet" /></Td><Td /><Td /><Td /><Td /></tr>}
              {prepaid.map((x) => (
                <tr key={x.id}>
                  <Td>
                    <span className="font-semibold text-purple">{x.name}</span>
                    {x.isDeposit && <span className="ml-2"><Chip tone="sky">deposit · comes back</Chip></span>}
                  </Td>
                  <Td right>{taka(x.totalPaisa)}</Td>
                  <Td right><span className="text-body-soft">{x.isDeposit ? "—" : taka(x.monthlyPaisa)}</span></Td>
                  <Td right>
                    <div className="flex items-center gap-2 justify-end">
                      <div className="w-16"><Bar pct={x.totalPaisa > 0 ? (x.amortizedPaisa / x.totalPaisa) * 100 : 0} tone="brand" height={5} /></div>
                      <span className="text-body-soft">{taka(x.amortizedPaisa)}</span>
                    </div>
                  </Td>
                  <Td right><span className="font-bold">{taka(x.remainingPaisa)}</span></Td>
                </tr>
              ))}
            </Table>
          </Panel>
        </>
      )}

      {tab === "loans" && (
        <>
          <Panel title="Add a loan" emoji="➕" tone="amber" className="mb-5">
            <div className="px-5 py-4">
              <div className="grid md:grid-cols-6 gap-3 items-end">
                <div className="md:col-span-2"><Lbl>Who lent it</Lbl><input className={input} value={l.lenderName} onChange={(e) => setL({ ...l, lenderName: e.target.value })} placeholder="City Bank / Mama" /></div>
                <div>
                  <Lbl>Kind</Lbl>
                  <select className={input} value={l.kind} onChange={(e) => setL({ ...l, kind: e.target.value })}>
                    <option value="FAMILY">Family / friend</option>
                    <option value="BANK">Bank</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div><Lbl>Amount (৳)</Lbl><input className={input} value={l.principal} onChange={(e) => setL({ ...l, principal: e.target.value })} /></div>
                <div><Lbl>Interest (% a year)</Lbl><input className={input} value={l.rate} onChange={(e) => setL({ ...l, rate: e.target.value })} placeholder="0" /></div>
                <div>
                  <button className={btnPrimary} style={btnPrimaryStyle} disabled={!l.lenderName.trim() || toPaisa(l.principal) <= 0}
                    onClick={async () => {
                      try {
                        await post("/finance/loans", { lenderName: l.lenderName, kind: l.kind, principalPaisa: toPaisa(l.principal), interestRateBp: Math.round(Number(l.rate || "0") * 100), intoAccountId: l.intoAccountId || null, startsOn: l.startsOn });
                        setL({ ...l, lenderName: "", principal: "", rate: "" }); await load(); flash("Added");
                      } catch (e) { fail(e); }
                    }}>Add</button>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Money borrowed" emoji="🏦" tone="amber" className="mb-5">
            <Table head={<><Th>Lender</Th><Th right>Borrowed</Th><Th right>Paid back</Th><Th right>Interest paid</Th><Th right>Still owed</Th><Th right w="150px" /></>}>
              {loans.length === 0 && <tr><Td className="py-8"><Empty emoji="🌤" title="No loans" /></Td><Td /><Td /><Td /><Td /><Td /></tr>}
              {loans.map((x) => (
                <tr key={x.id}>
                  <Td>
                    <div className="font-semibold text-purple">{x.lenderName}</div>
                    <div className="text-[11.5px] text-body-soft">{x.loanNo} · {x.interestRateBp > 0 ? `${x.interestRateBp / 100}% a year` : "no interest"}</div>
                  </Td>
                  <Td right>{taka(x.principalPaisa)}</Td>
                  <Td right><span className="text-body-soft">{taka(x.principalPaidPaisa)}</span></Td>
                  <Td right><span className="text-body-soft">{taka(x.interestPaidPaisa)}</span></Td>
                  <Td right>
                    <span className="font-bold" style={{ color: x.outstandingPaisa > 0 ? TONE.amber.text : TONE.emerald.text }}>{taka(x.outstandingPaisa)}</span>
                  </Td>
                  <Td right><button className={btnGhost} onClick={() => setPay({ loan: x, principal: "", interest: "", from: money[0]?.id ?? "" })}>Pay instalment</button></Td>
                </tr>
              ))}
            </Table>
          </Panel>

          {pay && (
            <Panel title={`Instalment — ${pay.loan.lenderName}`} emoji="💵" tone="emerald">
              <div className="px-5 py-4">
                <div className="text-[12.5px] text-body-soft mb-3">
                  The principal reduces what you owe; the interest is this month's cost.
                </div>
                <div className="grid md:grid-cols-4 gap-3 items-end">
                  <div><Lbl>Principal (৳)</Lbl><input className={input} value={pay.principal} onChange={(e) => setPay({ ...pay, principal: e.target.value })} autoFocus /></div>
                  <div><Lbl>Interest (৳)</Lbl><input className={input} value={pay.interest} onChange={(e) => setPay({ ...pay, interest: e.target.value })} /></div>
                  <div>
                    <Lbl>From</Lbl>
                    <select className={input} value={pay.from} onChange={(e) => setPay({ ...pay, from: e.target.value })}>
                      {money.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button className={btnPrimary} style={btnPrimaryStyle} onClick={async () => {
                      try {
                        await post(`/finance/loans/${pay.loan.id}/payments`, { principalPaisa: toPaisa(pay.principal), interestPaisa: toPaisa(pay.interest), fromAccountId: pay.from, actorName: "admin" });
                        setPay(null); await load(); flash("Instalment recorded");
                      } catch (e) { fail(e); }
                    }}>Save</button>
                    <button className={btnGhost} onClick={() => setPay(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

/* ==================== REPORTS ==================== */

interface Commitments {
  items: { kind: string; name: string; monthlyPaisa: number; detail: string; status: string; dayOfMonth?: number }[];
  totalMonthlyPaisa: number; cashOutMonthlyPaisa: number; stillDuePaisa: number; dailyPaisa: number;
  marginBp: number; salesNeededPaisa: number;
  staff: { name: string; averagePaisa: number; thisMonthPaisa: number; monthsPaid: number }[];
}
interface Pnl {
  totalIncomePaisa: number; cogsPaisa: number; grossProfitPaisa: number; grossMarginBp: number;
  totalExpensePaisa: number; netProfitPaisa: number;
  income: { code: string; name: string; paisa: number }[];
  expenseGroups: { group: string; paisa: number }[];
  expense: { code: string; name: string; group: string; paisa: number }[];
}
interface Aging { receivable: AgingSide; payable: AgingSide }
interface AgingSide { rows: { ref: string; who: string; paisa: number; days: number }[]; buckets: { bucket: string; paisa: number }[]; totalPaisa: number }
interface Flow { date: string; openingPaisa: number; inPaisa: number; outPaisa: number; closingPaisa: number }
interface Leak {
  goodsStuckOut: { rows: { orderNo: string; paisa: number; days: number }[]; totalPaisa: number; overdueCount: number };
  writeOffs: { actor: string; wastagePaisa: number; giftPaisa: number; count: number }[];
  discounts: { rows: { orderNo: string; discountPaisa: number; adjustmentPaisa: number; counter: boolean }[]; adjustmentTotalPaisa: number };
  storeCredit: { issuedPaisa: number; usedPaisa: number; outstandingPaisa: number };
  staffAdvanceOutstandingPaisa: number;
}

const KIND_META: Record<string, { emoji: string; label: string; tone: "brand" | "emerald" | "amber" | "rose" | "sky" | "slate" }> = {
  BILL: { emoji: "🧾", label: "Monthly bill", tone: "amber" },
  PARTNER_SALARY: { emoji: "🤝", label: "Partner salary", tone: "brand" },
  STAFF_SALARY: { emoji: "👤", label: "Staff salary", tone: "sky" },
  DEPRECIATION: { emoji: "🧊", label: "Wear and tear", tone: "slate" },
  PREPAID: { emoji: "📆", label: "Advance used up", tone: "slate" },
  LOAN: { emoji: "🏦", label: "Loan interest", tone: "rose" },
};

export function ReportsLive() {
  const [tab, setTab] = useState<"bills" | "pnl" | "aging" | "flow" | "leak">("bills");
  const [com, setCom] = useState<Commitments | null>(null);
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [aging, setAging] = useState<Aging | null>(null);
  const [flow, setFlow] = useState<Flow[]>([]);
  const [leak, setLeak] = useState<Leak | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        if (tab === "bills" && !com) setCom(await get<Commitments>("/finance/reports/commitments"));
        if (tab === "pnl" && !pnl) setPnl(await get<Pnl>("/finance/reports/pnl"));
        if (tab === "aging" && !aging) setAging(await get<Aging>("/finance/reports/aging"));
        if (tab === "flow" && flow.length === 0) setFlow(await get<Flow[]>("/finance/reports/balance-flow?days=30"));
        if (tab === "leak" && !leak) setLeak(await get<Leak>("/finance/reports/leakage"));
      } catch (e) { setErr(e instanceof Error ? e.message : "API offline"); }
    })();
  }, [tab, com, pnl, aging, flow.length, leak]);

  return (
    <div className={WRAP}>
      <FinHeader
        title="Reports"
        emoji="📊"
        tone="emerald"
      />
      <Flash ok="" err={err} />

      <Tabs value={tab} onChange={setTab} items={[
        { key: "bills", label: "Salary & bills", emoji: "🧾", tone: "amber" },
        { key: "pnl", label: "Profit & loss", emoji: "📈", tone: "emerald" },
        { key: "aging", label: "Who owes what", emoji: "⏳", tone: "sky" },
        { key: "flow", label: "Daily money flow", emoji: "🌊", tone: "brand" },
        { key: "leak", label: "Leakage watch", emoji: "🔍", tone: "rose" },
      ]} />

      {/* ---------- salary & bills ---------- */}
      {tab === "bills" && com && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <Kpi label="Every month, no matter what" value={taka(com.totalMonthlyPaisa)} emoji="🧾" tone="amber" hint={`about ${taka(com.dailyPaisa)} a day`} />
            <Kpi label="Of that, real cash out" value={taka(com.cashOutMonthlyPaisa)} emoji="💸" tone="rose" hint="the rest is wear and tear" />
            <Kpi label="Still to pay this month" value={taka(com.stillDuePaisa)} emoji="⏰" tone={com.stillDuePaisa > 0 ? "amber" : "emerald"} />
            <Kpi label="Sales needed to cover it" value={com.salesNeededPaisa > 0 ? taka(com.salesNeededPaisa) : "—"} emoji="🎯" tone="brand" hint={com.marginBp > 0 ? `at ${(com.marginBp / 100).toFixed(0)}% margin` : "needs a normal month of sales"} />
          </div>

          {com.stillDuePaisa > 0 && (
            <Banner tone="amber" emoji="⏰" title={`${taka(com.stillDuePaisa)} of this month's commitments is still unpaid`}>
              Salaries and bills marked <b>due</b> below have not gone through the books yet this month.
            </Banner>
          )}

          <Panel title="What goes out every month" emoji="📋" tone="amber" className="mb-5">
            <Table head={<><Th>What</Th><Th>Kind</Th><Th right>Per month</Th><Th right>Share</Th><Th right w="110px">This month</Th></>}>
              {com.items.length === 0 && (
                <tr><Td className="py-8"><Empty emoji="🧾" title="Nothing set up yet" /></Td><Td /><Td /><Td /><Td /></tr>
              )}
              {com.items.map((i, k) => {
                const m = KIND_META[i.kind] ?? KIND_META.BILL;
                const share = com.totalMonthlyPaisa > 0 ? (i.monthlyPaisa / com.totalMonthlyPaisa) * 100 : 0;
                return (
                  <tr key={`${i.kind}-${i.name}-${k}`}>
                    <Td>
                      <div className="font-semibold text-purple">{m.emoji} {i.name}</div>
                      <div className="text-[11.5px] text-body-soft">{i.detail}{i.dayOfMonth ? ` · due on day ${i.dayOfMonth}` : ""}</div>
                    </Td>
                    <Td><Chip tone={m.tone}>{m.label}</Chip></Td>
                    <Td right><span className="font-bold">{taka(i.monthlyPaisa)}</span></Td>
                    <Td right>
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-20"><Bar pct={share} tone={m.tone} height={5} /></div>
                        <span className="text-body-soft text-[12px] w-9">{share.toFixed(0)}%</span>
                      </div>
                    </Td>
                    <Td right>
                      {i.status === "paid" ? <Chip tone="emerald">paid</Chip>
                        : i.status === "due" ? <Chip tone="amber">due</Chip>
                        : <Chip tone="slate">no cash</Chip>}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          </Panel>

          <Panel title="Salary history" emoji="👥" tone="sky">
            <Table head={<><Th>Person</Th><Th right>Average a month</Th><Th right>This month</Th><Th right>Months paid</Th></>}>
              {com.staff.length === 0 && (
                <tr><Td className="py-8"><Empty emoji="👥" title="No staff salary paid yet" /></Td><Td /><Td /><Td /></tr>
              )}
              {com.staff.map((s) => (
                <tr key={s.name}>
                  <Td><span className="font-semibold text-purple">{s.name}</span></Td>
                  <Td right>{taka(s.averagePaisa)}</Td>
                  <Td right>
                    {s.thisMonthPaisa > 0 ? <span className="font-bold" style={{ color: TONE.emerald.text }}>{taka(s.thisMonthPaisa)}</span>
                      : <Chip tone="amber">not paid yet</Chip>}
                  </Td>
                  <Td right><span className="text-body-soft">{s.monthsPaid}</span></Td>
                </tr>
              ))}
            </Table>
          </Panel>
        </>
      )}

      {/* ---------- profit & loss ---------- */}
      {tab === "pnl" && pnl && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <Kpi label="Earned" value={taka(pnl.totalIncomePaisa)} emoji="📈" tone="emerald" />
            <Kpi label="Cost of goods" value={taka(pnl.cogsPaisa)} emoji="🌸" tone="slate" />
            <Kpi label="Gross profit" value={taka(pnl.grossProfitPaisa)} emoji="✨" tone="emerald" hint={`${(pnl.grossMarginBp / 100).toFixed(0)}% margin`} />
            <Kpi label="Left over" value={taka(pnl.netProfitPaisa)} emoji={pnl.netProfitPaisa < 0 ? "⚠" : "🎉"} tone={pnl.netProfitPaisa < 0 ? "rose" : "emerald"} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Panel title="Where it came from" emoji="📥" tone="emerald">
              <div className="px-5 py-3">
                {pnl.income.length === 0 && <div className="text-[13px] text-body-soft py-3">Nothing earned in this period.</div>}
                {pnl.income.map((r) => (
                  <div key={r.code} className="flex justify-between py-2 border-b border-[var(--l-accent)] last:border-0 text-[13.5px]">
                    <span className="text-body-soft">{r.name}</span><span className="font-semibold text-purple">{taka(r.paisa)}</span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Where it went" emoji="📤" tone="amber">
              <div className="px-5 py-3">
                {pnl.expenseGroups.map((g) => (
                  <div key={g.group} className="mb-3 last:mb-0">
                    <div className="flex justify-between text-[13.5px] font-bold text-purple">
                      <span>{g.group}</span><span>{taka(g.paisa)}</span>
                    </div>
                    <div className="mt-1 mb-1.5"><Bar pct={pnl.totalExpensePaisa > 0 ? (g.paisa / pnl.totalExpensePaisa) * 100 : 0} tone="amber" height={4} /></div>
                    {pnl.expense.filter((e) => e.group === g.group).map((e) => (
                      <div key={e.code} className="flex justify-between text-[12.5px] text-body-soft pl-3 py-0.5">
                        <span>{e.name}</span><span>{taka(e.paisa)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </>
      )}

      {/* ---------- aging ---------- */}
      {tab === "aging" && aging && (
        <div className="grid md:grid-cols-2 gap-4">
          {([["Customers owe us", aging.receivable, "sky" as const, "📥"], ["We owe suppliers", aging.payable, "amber" as const, "📤"]] as const).map(([title, d, tone, emoji]) => (
            <Panel key={title} title={title} emoji={emoji} tone={tone}
              right={<span className="font-bold text-[16px]" style={{ color: TONE[tone].text }}>{taka(d.totalPaisa)}</span>}>
              <div className="px-5 py-4">
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {d.buckets.map((b) => {
                    const bad = b.bucket === "over 30 days" && b.paisa > 0;
                    return (
                      <div key={b.bucket} className="text-center px-2 py-2.5 rounded-xl" style={{ background: bad ? TONE.rose.soft : "var(--s-accent)" }}>
                        <div className="text-[10px] uppercase text-body-soft font-bold">{b.bucket}</div>
                        <div className="text-[13px] font-bold mt-0.5" style={{ color: bad ? TONE.rose.text : "var(--t-accent)" }}>{taka(b.paisa)}</div>
                      </div>
                    );
                  })}
                </div>
                {d.rows.slice(0, 12).map((r) => (
                  <div key={r.ref} className="flex justify-between py-1.5 text-[12.5px] border-b border-[var(--l-accent)] last:border-0">
                    <span className="text-body-soft">{r.ref} · {r.who}</span>
                    <span><b>{taka(r.paisa)}</b> <span style={{ color: r.days > 30 ? TONE.rose.text : "var(--t-soft)" }}>{r.days}d</span></span>
                  </div>
                ))}
                {d.rows.length === 0 && <div className="text-[13px] text-body-soft">Nothing outstanding — clean.</div>}
              </div>
            </Panel>
          ))}
        </div>
      )}

      {/* ---------- daily flow ---------- */}
      {tab === "flow" && (
        <Panel title="Money in and out, day by day" emoji="🌊" tone="brand" sub="last 30 days, all accounts together">
          <Table head={<><Th>Day</Th><Th right>Started with</Th><Th right>Came in</Th><Th right>Went out</Th><Th right>Ended with</Th></>}>
            {flow.length === 0 && <tr><Td className="py-8"><Empty emoji="🌊" title="No movement in the last 30 days" /></Td><Td /><Td /><Td /><Td /></tr>}
            {flow.map((d) => (
              <tr key={d.date}>
                <Td><span className="font-semibold text-purple">{d.date}</span></Td>
                <Td right><span className="text-body-soft">{taka(d.openingPaisa)}</span></Td>
                <Td right><span style={{ color: TONE.emerald.text }}>{d.inPaisa > 0 ? `+${taka(d.inPaisa)}` : "—"}</span></Td>
                <Td right><span style={{ color: TONE.rose.text }}>{d.outPaisa > 0 ? `−${taka(d.outPaisa)}` : "—"}</span></Td>
                <Td right><span className="font-bold">{taka(d.closingPaisa)}</span></Td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}

      {/* ---------- leakage ---------- */}
      {tab === "leak" && leak && (
        <div className="grid md:grid-cols-2 gap-4">
          <Panel title="Goods that left but never arrived" emoji="📦" tone={leak.goodsStuckOut.overdueCount > 0 ? "rose" : "slate"}
            sub="out of the warehouse, not delivered and not returned">
            <div className="px-5 py-4">
              <div className="text-[21px] font-bold mb-3" style={{ color: leak.goodsStuckOut.overdueCount > 0 ? TONE.rose.text : "var(--t-accent)" }}>
                {taka(leak.goodsStuckOut.totalPaisa)}
                <span className="text-[12px] font-normal text-body-soft ml-2">{leak.goodsStuckOut.overdueCount} over a week</span>
              </div>
              {leak.goodsStuckOut.rows.map((r) => (
                <div key={r.orderNo} className="flex justify-between py-1.5 text-[12.5px] border-b border-[var(--l-accent)] last:border-0">
                  <span className="text-body-soft">{r.orderNo}</span>
                  <span><b>{taka(r.paisa)}</b> <span style={{ color: r.days > 7 ? TONE.rose.text : "var(--t-soft)" }}>{r.days}d</span></span>
                </div>
              ))}
              {leak.goodsStuckOut.rows.length === 0 && <div className="text-[13px] text-body-soft">Nothing stuck — good.</div>}
            </div>
          </Panel>

          <Panel title="Who is writing stock off" emoji="🗑" tone="amber" sub="spoilage and giveaways, by the person who recorded them">
            <div className="px-5 py-4">
              {leak.writeOffs.length === 0 && <div className="text-[13px] text-body-soft">Nothing written off yet.</div>}
              {leak.writeOffs.map((w) => (
                <div key={w.actor} className="flex justify-between py-2 border-b border-[var(--l-accent)] last:border-0 text-[13px]">
                  <span className="text-body-soft">{w.actor} <span className="text-[11.5px]">({w.count} times)</span></span>
                  <span><b>{taka(w.wastagePaisa)}</b> spoiled · {taka(w.giftPaisa)} given</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Price given away" emoji="🏷" tone="brand" sub="discounts and counter adjustments, newest first">
            <div className="px-5 py-4">
              {leak.discounts.rows.slice(0, 10).map((d) => (
                <div key={d.orderNo} className="flex justify-between py-1.5 text-[12.5px] border-b border-[var(--l-accent)] last:border-0">
                  <span className="text-body-soft">{d.orderNo}{d.counter ? " · counter" : ""}</span>
                  <span>
                    {d.discountPaisa > 0 && <span style={{ color: TONE.amber.text }}>−{taka(d.discountPaisa)}</span>}
                    {d.adjustmentPaisa !== 0 && <span className="ml-2 text-body-soft">adj {taka(d.adjustmentPaisa)}</span>}
                  </span>
                </div>
              ))}
              {leak.discounts.rows.length === 0 && <div className="text-[13px] text-body-soft">No discounts given.</div>}
            </div>
          </Panel>

          <Panel title="Promised but not paid" emoji="🧧" tone="sky">
            <div className="px-5 py-4">
              {[
                { l: "Store credit still owed to customers", v: leak.storeCredit.outstandingPaisa, bold: true },
                { l: "Store credit given / used", v: -1, text: `${taka(leak.storeCredit.issuedPaisa)} / ${taka(leak.storeCredit.usedPaisa)}` },
                { l: "Staff advances not yet recovered", v: leak.staffAdvanceOutstandingPaisa, bold: true },
              ].map((r) => (
                <div key={r.l} className="flex justify-between py-2 border-b border-[var(--l-accent)] last:border-0 text-[13.5px]">
                  <span className="text-body-soft">{r.l}</span>
                  <span className={r.bold ? "font-bold" : "text-body-soft"}>{r.text ?? taka(r.v)}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
