"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  WRAP, FinHeader, Card, Kpi, Table, Th, Td, Chip, Flash, Empty, Banner,
  btnPrimary, btnPrimaryStyle, btnGhost, input, Lbl, taka, toPaisa, TONE,
} from "./FinanceUI";
import {
  listPayrolls, buildPayroll, getPayroll, patchPayroll, approvePayroll,
  removePayrollLine, deletePayroll, financeAccounts, formatTaka,
  type ApiPayroll, type ApiPayrollLine, type ApiFinanceAccount,
} from "../_data/api";

/*
  PAYROLL — a month, a screen, one approval.

  Two rules the screen has to make obvious, because they are the ones that cost
  money when they are invisible:

  1. Nothing reaches the books until Approve. A draft can be edited all day;
     once approved it is frozen, and a mistake found later is fixed by reversing
     the entry in Finance, never by quietly editing history (FIN-RULE-003).

  2. Advance recovery is never automatic (HR-R05). The draft proposes zero. The
     owner decides how much comes back this month, because a system that
     collects the whole balance sends somebody home with nothing.
*/

const period = (d = new Date()) => d.toISOString().slice(0, 7);
const monthName = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
};

/* ==================================================================== LIST */

export function PayrollListView() {
  const router = useRouter();
  const [rows, setRows] = useState<ApiPayroll[]>([]);
  const [p, setP] = useState(period());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(""); const [ok, setOk] = useState("");

  const load = useCallback(async () => {
    try { setRows((await listPayrolls()).items); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not load"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function build() {
    setBusy(true); setErr("");
    try {
      const run = await buildPayroll({ period: p });
      router.push(`/employees/payroll/${run.id}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not start the run"); }
    finally { setBusy(false); }
  }

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="People"
        title="Payroll"
        emoji="🧾"
        tone="brand"
        sub="Days and hours come straight from the attendance sheet. Nothing touches the books until you approve — and then it is frozen."
        right={<><Link href="/employees" className={btnGhost}>Staff</Link><Link href="/employees/attendance" className={btnGhost}>Attendance</Link></>}
      />
      <Flash ok={ok} err={err} />

      <Banner tone="sky" emoji="?" title="How payroll works here">
        A run is one month. You build it, and every active person appears with their days and hours
        already counted from the attendance sheet — nothing to add up by hand. Monthly staff get
        their agreed figure whatever the days; where somebody was absent the screen offers the
        deduction with the arithmetic shown, and you decide whether to use it. Daily staff are days
        x rate, hourly staff are hours x rate. While it says <b>Draft</b> nothing has reached the
        books, so change it as often as you like. Pressing <b>Approve</b> pays it, writes it to the
        accounts and freezes it for good.
      </Banner>

      <Card className="px-5 py-5 mb-5">
        <h3 className="font-display text-[17px] text-purple mt-0 mb-3">Start a run</h3>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <Lbl>Month</Lbl>
            <input type="month" className={`${input} w-auto`} value={p} onChange={(e) => setP(e.target.value)} />
          </div>
          <button className={btnPrimary} style={btnPrimaryStyle} disabled={busy} onClick={build}>
            {busy ? "Building…" : `Build ${monthName(p)}`}
          </button>
          <p className="text-[12px] text-body-soft m-0 max-w-[420px]">
            Everyone active is pulled in with their days already counted. You can drop people,
            add a bonus, or set a deduction before approving.
          </p>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table head={<>
          <Th>Run</Th><Th>Month</Th><Th right>People</Th><Th right>Base</Th>
          <Th right>Extra</Th><Th right>Advance back</Th><Th right>Net</Th><Th right>Status</Th>
        </>}>
          {rows.length === 0 && (
            <tr><td colSpan={8} className="px-4 py-10">
              <Empty emoji="🧾" title="No payroll runs yet"
                sub="Nothing is wrong — a run only exists once you build one. Pick a month above and press Build." />
            </td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.id}>
              <Td><Link href={`/employees/payroll/${r.id}`} className="no-underline"><b className="text-purple">{r.payrollNo}</b></Link></Td>
              <Td>{monthName(r.period)}</Td>
              <Td right>{r._count?.lines ?? r.lines?.length ?? 0}</Td>
              <Td right>{taka(r.grossPaisa)}</Td>
              <Td right>{r.extraPaisa ? taka(r.extraPaisa) : "—"}</Td>
              <Td right>{r.advanceRecoveredPaisa ? `−${taka(r.advanceRecoveredPaisa)}` : "—"}</Td>
              <Td right><b>{taka(r.netPaisa)}</b></Td>
              <Td right>
                {r.status === "APPROVED" ? <Chip tone="emerald">Approved</Chip>
                  : r.status === "DRAFT" ? <Chip tone="amber">Draft</Chip>
                  : <Chip tone="slate">Cancelled</Chip>}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

/* ================================================================== DETAIL */

type Draft = Record<string, { extra: string; extraNote: string; deduction: string; deductionNote: string; advance: string }>;

export function PayrollDetailView({ id }: { id: string }) {
  const router = useRouter();
  const [run, setRun] = useState<ApiPayroll | null>(null);
  const [accs, setAccs] = useState<ApiFinanceAccount[]>([]);
  const [paidFromId, setPaidFromId] = useState("");
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");

  /*  Warnings arrive with the freshly built run and must survive every later
      save, or the one about "no attendance recorded" disappears the moment the
      owner types a bonus — exactly when it still matters. */
  const hydrate = useCallback((r: ApiPayroll) => {
    setRun((prev) => ({ ...r, warnings: r.warnings ?? prev?.warnings ?? [] }));
    const d: Draft = {};
    for (const l of r.lines)
      d[l.employeeId] = {
        extra: l.extraPaisa ? String(l.extraPaisa / 100) : "",
        extraNote: l.extraNote ?? "",
        deduction: l.deductionPaisa ? String(l.deductionPaisa / 100) : "",
        deductionNote: l.deductionNote ?? "",
        advance: l.advanceRecoveredPaisa ? String(l.advanceRecoveredPaisa / 100) : "",
      };
    setDraft(d);
  }, []);

  const load = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([getPayroll(id), financeAccounts().catch(() => [])]);
      hydrate(r);
      const money = (a as ApiFinanceAccount[]).filter((x) => x.isMoneyAccount && x.isActive);
      setAccs(money);
      setPaidFromId((prev) => prev || r.paidFromId || money[0]?.id || "");
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not load the run"); }
  }, [id, hydrate]);
  useEffect(() => { void load(); }, [load]);

  const frozen = run?.status !== "DRAFT";

  /** what the row will be worth with whatever is typed right now */
  const preview = useCallback((l: ApiPayrollLine) => {
    const d = draft[l.employeeId] ?? { extra: "", deduction: "", advance: "", extraNote: "", deductionNote: "" };
    const extra = toPaisa(d.extra);
    const deduction = toPaisa(d.deduction);
    const advance = toPaisa(d.advance);
    const earned = l.basePaisa + extra - deduction;
    return { extra, deduction, advance, earned, net: earned - advance };
  }, [draft]);

  const totals = useMemo(() => {
    if (!run) return { earned: 0, net: 0, advance: 0, extra: 0, deduction: 0, base: 0 };
    return run.lines.reduce(
      (acc, l) => {
        const p = preview(l);
        return {
          base: acc.base + l.basePaisa,
          earned: acc.earned + p.earned,
          net: acc.net + p.net,
          advance: acc.advance + p.advance,
          extra: acc.extra + p.extra,
          deduction: acc.deduction + p.deduction,
        };
      },
      { earned: 0, net: 0, advance: 0, extra: 0, deduction: 0, base: 0 },
    );
  }, [run, preview]);

  const problem = useMemo(() => {
    if (!run) return null;
    for (const l of run.lines) {
      const p = preview(l);
      if (p.earned < 0) return `${l.employee.name}: the deduction is bigger than the pay`;
      if (p.net < 0) return `${l.employee.name}: taking that much advance back leaves a negative payslip`;
      if (p.advance > l.advanceOutstandingPaisa)
        return `${l.employee.name} only owes ${formatTaka(l.advanceOutstandingPaisa)} of advance`;
    }
    return null;
  }, [run, preview]);

  /** the write itself — throws, so approve() can never post unsaved numbers */
  const persist = useCallback(async () => {
    if (!run) return null;
    return patchPayroll(run.id, {
      lines: run.lines.map((l) => {
        const p = preview(l);
        const d = draft[l.employeeId];
        return {
          employeeId: l.employeeId,
          extraPaisa: p.extra,
          extraNote: d?.extraNote?.trim() || null,
          deductionPaisa: p.deduction,
          deductionNote: d?.deductionNote?.trim() || null,
          advanceRecoveredPaisa: p.advance,
        };
      }),
    });
  }, [run, draft, preview]);

  async function saveDraft() {
    setBusy(true); setErr(""); setOk("");
    try {
      const saved = await persist();
      if (saved) hydrate(saved);
      setOk("Draft saved");
      window.setTimeout(() => setOk(""), 3000);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
    finally { setBusy(false); }
  }

  async function approve() {
    if (!run) return;
    if (!confirm(`Approve ${run.payrollNo}? ${formatTaka(totals.net)} leaves the account and the run is frozen.`)) return;
    setBusy(true); setErr(""); setOk("");
    try {
      // save first and let a failure stop us — approving what is on screen but
      // not in the database would post numbers nobody agreed to
      await persist();
      await approvePayroll(run.id, { paidFromId });
      await load();
      setOk("Approved and posted to the books");
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not approve"); }
    finally { setBusy(false); }
  }

  if (err && !run) return <div className={WRAP}><Flash ok="" err={err} /></div>;
  if (!run) return <div className={WRAP}><p className="text-body-soft">Loading…</p></div>;

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow={run.payrollNo}
        title={`Payroll · ${monthName(run.period)}`}
        emoji="🧾"
        tone={frozen ? "emerald" : "amber"}
        sub={frozen
          ? `Approved${run.approvedAt ? ` on ${new Date(run.approvedAt).toLocaleDateString("en-GB")}` : ""}${run.approvedBy ? ` by ${run.approvedBy}` : ""} — this run is frozen.`
          : "Draft. Nothing has reached the books yet, so edit freely."}
        right={<Link href="/employees/payroll" className={btnGhost}>← All runs</Link>}
      />
      <Flash ok={ok} err={err} />

      {(run.warnings ?? []).map((w, i) => (
        <Banner key={i} tone="amber" emoji="⚠" title="Read this before you approve">{w}</Banner>
      ))}
      {problem && !frozen && <Banner tone="rose" emoji="!" title="Fix this first">{problem}</Banner>}

      <div className="grid sm:grid-cols-4 gap-3 mb-5">
        <Kpi label="People" value={String(run.lines.length)} emoji="👥" tone="slate" />
        <Kpi label="Salary cost" value={taka(totals.earned)} emoji="৳" tone="sky" hint="base + extra − deductions" />
        <Kpi label="Advance recovered" value={taka(totals.advance)} emoji="↩" tone="amber" hint="comes back out of 1210" />
        <Kpi label="Actually handed over" value={taka(totals.net)} emoji="💵" tone="emerald" hint="leaves the money account" />
      </div>

      <Card className="overflow-hidden">
        <Table head={<>
          <Th>Employee</Th><Th right>Worked</Th><Th right>Base</Th>
          <Th right>Extra +</Th><Th right>Deduction −</Th><Th right>Advance back −</Th><Th right>Net pay</Th><Th />
        </>}>
          {run.lines.map((l) => {
            const p = preview(l);
            const d = draft[l.employeeId] ?? { extra: "", extraNote: "", deduction: "", deductionNote: "", advance: "" };
            const set = (patch: Partial<typeof d>) =>
              setDraft((prev) => ({ ...prev, [l.employeeId]: { ...d, ...patch } }));
            return (
              <tr key={l.id}>
                <Td>
                  <Link href={`/employees/${l.employeeId}`} className="no-underline"><b className="text-purple">{l.employee.name}</b></Link>
                  <span className="block text-[11.5px] text-body-soft">
                    {l.employee.role?.name ?? l.employee.employeeNo} ·{" "}
                    {l.payType === "MONTHLY" ? `${formatTaka(l.ratePaisa)}/month`
                      : l.payType === "DAILY" ? `${formatTaka(l.ratePaisa)}/day`
                      : `${formatTaka(l.ratePaisa)}/hour`}
                  </span>
                </Td>
                <Td right className="text-body-soft">
                  {l.payType === "HOURLY"
                    ? <><b className="text-purple">{(l.minutesWorked / 60).toFixed(1)} h</b><span className="block text-[11px]">{l.daysWorked} days worked</span></>
                    : <><b className="text-purple">{l.daysWorked} d</b><span className="block text-[11px]">{(l.minutesWorked / 60).toFixed(1)} h recorded</span></>}
                  {l.absentDays > 0 && (
                    <span className="block text-[11px] mt-0.5" style={{ color: TONE.amber.text }}>
                      {l.absentDays} day{l.absentDays === 1 ? "" : "s"} not worked
                    </span>
                  )}
                </Td>
                <Td right>{taka(l.basePaisa)}</Td>
                <Td right>
                  {frozen ? (l.extraPaisa ? taka(l.extraPaisa) : "—") : (
                    <>
                      <input className={`${input} w-[92px] text-right`} value={d.extra} placeholder="0"
                        onChange={(e) => set({ extra: e.target.value })} />
                      {p.extra > 0 && (
                        <input className={`${input} w-[92px] text-right mt-1 text-[11.5px]`} value={d.extraNote}
                          placeholder="Eid bonus" onChange={(e) => set({ extraNote: e.target.value })} />
                      )}
                    </>
                  )}
                </Td>
                <Td right>
                  {frozen ? (l.deductionPaisa ? taka(l.deductionPaisa) : "—") : (
                    <>
                      <input className={`${input} w-[92px] text-right`} value={d.deduction} placeholder="0"
                        onChange={(e) => set({ deduction: e.target.value })} />
                      {p.deduction > 0 && (
                        <input className={`${input} w-[92px] text-right mt-1 text-[11.5px]`} value={d.deductionNote}
                          placeholder="reason" onChange={(e) => set({ deductionNote: e.target.value })} />
                      )}
                      {/*  HR-D12 — a monthly salary is an agreement, so absence is
                          never docked automatically. The arithmetic is offered in
                          full and the owner decides whether to use it. */}
                      {l.suggestedAbsenceDeductionPaisa > 0 && p.deduction === 0 && (
                        <button
                          className="block text-[10.5px] underline mt-1 ml-auto text-right"
                          style={{ color: TONE.amber.text }}
                          title={`${formatTaka(l.ratePaisa)} x ${l.absentDays} absent / ${l.daysWorked + l.absentDays} days recorded`}
                          onClick={() => set({
                            deduction: String(l.suggestedAbsenceDeductionPaisa / 100),
                            deductionNote: `${l.absentDays} day${l.absentDays === 1 ? "" : "s"} not worked`,
                          })}
                        >
                          use {formatTaka(l.suggestedAbsenceDeductionPaisa)}
                          <span className="block">for {l.absentDays} absent day{l.absentDays === 1 ? "" : "s"}</span>
                        </button>
                      )}
                    </>
                  )}
                </Td>
                <Td right>
                  {frozen ? (l.advanceRecoveredPaisa ? taka(l.advanceRecoveredPaisa) : "—") : (
                    <>
                      <input className={`${input} w-[92px] text-right`} value={d.advance} placeholder="0"
                        disabled={l.advanceOutstandingPaisa <= 0}
                        onChange={(e) => set({ advance: e.target.value })} />
                      <span className="block text-[11px] mt-1"
                        style={{ color: l.advanceOutstandingPaisa > 0 ? TONE.amber.text : "#c9b8d4" }}>
                        {l.advanceOutstandingPaisa > 0 ? `owes ${formatTaka(l.advanceOutstandingPaisa)}` : "owes nothing"}
                      </span>
                    </>
                  )}
                </Td>
                <Td right><b style={{ color: p.net < 0 ? TONE.rose.bg : undefined }}>{taka(frozen ? l.netPaisa : p.net)}</b></Td>
                <Td right>
                  {!frozen && (
                    <button className="text-[12px] text-body-soft underline"
                      onClick={async () => {
                        if (!confirm(`Take ${l.employee.name} off this run?`)) return;
                        try { hydrate(await removePayrollLine(run.id, l.employeeId)); }
                        catch (e) { setErr(e instanceof Error ? e.message : "Could not remove"); }
                      }}>
                      remove
                    </button>
                  )}
                </Td>
              </tr>
            );
          })}
          <tr className="bg-[#faf7fc]">
            <Td><b className="text-purple">Total</b></Td>
            <Td />
            <Td right><b>{taka(totals.base)}</b></Td>
            <Td right><b>{totals.extra ? taka(totals.extra) : "—"}</b></Td>
            <Td right><b>{totals.deduction ? `−${taka(totals.deduction)}` : "—"}</b></Td>
            <Td right><b>{totals.advance ? `−${taka(totals.advance)}` : "—"}</b></Td>
            <Td right><b className="text-[15px] text-purple">{taka(totals.net)}</b></Td>
            <Td />
          </tr>
        </Table>
      </Card>

      {!frozen ? (
        <Card className="px-5 py-5 mt-4">
          <h3 className="font-display text-[17px] text-purple mt-0 mb-1">Approve &amp; pay</h3>
          <p className="text-[12.5px] text-body-soft mt-0 mb-4">
            Approving writes one balanced entry: the salary cost goes to <b>5420 Employee Salary</b>,
            whatever advance you are taking back comes off <b>1210 Employee Advance</b>, and{" "}
            <b>{taka(totals.net)}</b> leaves the account below. Each line carries the person, so every
            payslip can be traced back. After this the run is frozen — a mistake is corrected by
            reversing the entry in Finance, never by editing history.
          </p>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <Lbl>Paid from</Lbl>
              <select className={`${input} w-auto min-w-[220px]`} value={paidFromId} onChange={(e) => setPaidFromId(e.target.value)}>
                {accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <button className={btnGhost} disabled={busy} onClick={saveDraft}>Save draft</button>
            <button className={btnPrimary} style={btnPrimaryStyle} disabled={busy || !!problem || !paidFromId} onClick={approve}>
              {busy ? "Working…" : `Approve & pay ${taka(totals.net)}`}
            </button>
            <button className="text-[12.5px] text-body-soft underline ml-auto"
              onClick={async () => {
                if (!confirm("Throw this draft away?")) return;
                try { await deletePayroll(run.id); router.push("/employees/payroll"); }
                catch (e) { setErr(e instanceof Error ? e.message : "Could not delete"); }
              }}>
              Discard draft
            </button>
          </div>
        </Card>
      ) : (
        <Card className="px-5 py-4 mt-4">
          <p className="text-[12.5px] text-body-soft m-0">
            Posted to the books{run.journalEntryId ? " — the journal entry is in Finance → Ledger" : ""}. To
            correct it, reverse that entry in Finance; this run stays exactly as it was approved.
          </p>
        </Card>
      )}
    </div>
  );
}
