"use client";

/*
  Chart of accounts — every heading money can sit under, grouped so it can
  actually be read (gap G3/G4/G5 from the Biznify comparison).
  Type tabs → groups → accounts, with a description on each and "Add here"
  inside every group. Balances are shown because ours are live, unlike a
  plain bookkeeping chart.
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import {
  ApiFinanceAccount,
  FIN_TYPE_META,
  FinAccountType,
  createFinanceAccount,
  deleteFinanceAccount,
  financeAccounts,
  formatTaka,
  updateFinanceAccount,
} from "../_data/api";
import {
  Bar, Banner, Card, Chip, Empty, FinHeader, Flash, Kpi, Lbl, Panel, Table, Tabs, Td, Th, TONE, WRAP,
  btnGhost, btnPrimary, btnPrimaryStyle, input, taka, toPaisa, todayStr,
} from "./FinanceUI";


const TYPES: FinAccountType[] = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];

/** plain-language help so nobody has to know accounting */
const TAB_TONE: Record<FinAccountType, "brand" | "emerald" | "amber" | "rose" | "sky" | "slate"> = {
  ASSET: "sky", LIABILITY: "rose", EQUITY: "brand", INCOME: "emerald", EXPENSE: "amber",
};

const TYPE_HELP: Record<FinAccountType, string> = {
  ASSET: "Things the business has or is owed — money, stock, equipment.",
  LIABILITY: "Things the business owes — suppliers, loans, VAT, customer advances.",
  EQUITY: "The owners' side — money put in, money taken out, profit kept in the business.",
  INCOME: "Money the business earns.",
  EXPENSE: "What it costs to run and to sell. Fixed costs drive the break-even point.",
};


type Draft = { code: string; name: string; note: string; behavior: string; group: string };

export function ChartOfAccountsLive() {
  const [rows, setRows] = useState<ApiFinanceAccount[]>([]);
  const [tab, setTab] = useState<FinAccountType>("EXPENSE");
  const [q, setQ] = useState("");
  const [offline, setOffline] = useState(false);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ code: "", name: "", note: "", behavior: "FIXED", group: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ name: string; note: string; group: string }>({ name: "", note: "", group: "" });

  const load = useCallback(async () => {
    try { setRows(await financeAccounts()); setOffline(false); }
    catch { setOffline(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const flash = (m: string) => { setOk(m); setErr(""); window.setTimeout(() => setOk(""), 3500); };
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : "Could not save");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of TYPES) c[t] = rows.filter((r) => r.type === t).length;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows
      .filter((r) => r.type === tab)
      .filter((r) => !term || r.name.toLowerCase().includes(term) || r.code.includes(term) || (r.note ?? "").toLowerCase().includes(term));
  }, [rows, tab, q]);

  const grouped = useMemo(() => {
    const m = new Map<string, ApiFinanceAccount[]>();
    for (const r of visible) {
      const g = r.groupName?.trim() || "Other";
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(r);
    }
    for (const list of m.values()) list.sort((a, b) => a.code.localeCompare(b.code));
    return [...m.entries()].sort((a, b) => a[1][0].code.localeCompare(b[1][0].code));
  }, [visible]);

  const nextCode = (group: string) => {
    const inGroup = rows.filter((r) => r.type === tab && (r.groupName ?? "Other") === group);
    const max = inGroup.reduce((n, r) => Math.max(n, Number(r.code) || 0), 0);
    return max > 0 ? String(max + 1) : "";
  };

  const startAdd = (group: string) => {
    setAddingIn(group);
    setDraft({ code: nextCode(group), name: "", note: "", behavior: "FIXED", group });
  };

  const save = async () => {
    try {
      await createFinanceAccount({
        code: draft.code.trim(),
        name: draft.name.trim(),
        type: tab,
        groupName: draft.group,
        note: draft.note || null,
        costBehavior: tab === "EXPENSE" ? draft.behavior : null,
      });
      setAddingIn(null);
      await load();
      flash("Added");
    } catch (e) { fail(e); }
  };

  return (
    <div className={WRAP}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <FinHeader title="Chart of accounts" emoji="🗂" tone="brand" sub="Every heading money can sit under. You will mostly use the expense headings — the rest run themselves. Anything you add here appears in the expense and income forms straight away." />
        {offline && <Chip tone="amber">API offline</Chip>}
      </div>

      <Flash ok={ok} err={err} />

      {/* type tabs */}
      <div className="flex items-center gap-2 flex-wrap mb-1">
        {TYPES.map((t) => {
          const meta = FIN_TYPE_META[t];
          const on = tab === t;
          return (
            <button key={t} onClick={() => { setTab(t); setAddingIn(null); }}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold border transition-colors ${on ? "border-transparent text-white" : "bg-white border-[#3d3248] text-purple hover:bg-[#291e31]"}`}
              style={on ? { background: TONE[TAB_TONE[t]].grad } : undefined}>
              {meta.label}
              <span className="text-[11.5px] font-bold px-1.5 py-0.5 rounded-full"
                style={on ? { background: "rgba(255,255,255,0.25)" } : { background: meta.bg, color: meta.text }}>
                {counts[t] ?? 0}
              </span>
            </button>
          );
        })}
        <div className="ml-auto">
          <input className={`${input} w-[260px]`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search headings" />
        </div>
      </div>
      <p className="text-[13px] text-body-soft mt-2 mb-5">{TYPE_HELP[tab]}</p>

      {grouped.length === 0 && (
        <Card className="px-5 py-8 text-center text-body-soft">
          {offline ? "API offline" : q ? "Nothing matches that search" : "Nothing here yet"}
        </Card>
      )}

      {grouped.map(([group, list]) => (
        <div key={group} className="mb-5">
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-t-2xl"
            style={{ background: TONE[TAB_TONE[tab]].grad }}>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[16px] text-white">{group}</span>
              <span className="text-[12px] text-white/75">{list.length}</span>
            </div>
            <button className="text-[12.5px] font-bold text-white inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
              onClick={() => startAdd(group)}>
              <Icon name="plus" size={13} /> Add here
            </button>
          </div>

          <div className="border border-[#3f3446] rounded-b-2xl bg-white overflow-hidden">
            {addingIn === group && (
              <div className="px-4 py-3 bg-[#393016] border-b border-[#3e3248]">
                <div className="grid md:grid-cols-6 gap-2 items-end">
                  <div>
                    <label className="text-[11.5px] font-semibold text-body-soft">Code</label>
                    <input className={input} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[11.5px] font-semibold text-body-soft">Name</label>
                    <input className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
                  </div>
                  <div className={tab === "EXPENSE" ? "" : "md:col-span-2"}>
                    <label className="text-[11.5px] font-semibold text-body-soft">What it is</label>
                    <input className={input} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="One line" />
                  </div>
                  {tab === "EXPENSE" && (
                    <div>
                      <label className="text-[11.5px] font-semibold text-body-soft">Fixed or variable</label>
                      <select className={input} value={draft.behavior} onChange={(e) => setDraft({ ...draft, behavior: e.target.value })}>
                        <option value="FIXED">Fixed — every month</option>
                        <option value="VARIABLE">Variable — grows with sales</option>
                      </select>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => void save()} disabled={!draft.code.trim() || !draft.name.trim()}>Save</button>
                    <button className={btnGhost} onClick={() => setAddingIn(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {list.map((a) => (
              <div key={a.id} className="flex items-start gap-4 px-4 py-3 border-b border-[#3f3248] last:border-0 hover:bg-[#2b1a34]">
                <span className="text-[12.5px] text-body-soft font-semibold w-[52px] shrink-0 pt-0.5">{a.code}</span>

                <div className="flex-1 min-w-0">
                  {editing === a.id ? (
                    <div className="grid md:grid-cols-3 gap-2">
                      <input className={input} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                      <input className={input} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="One line description" />
                      <input className={input} value={edit.group} onChange={(e) => setEdit({ ...edit, group: e.target.value })} placeholder="Group" />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-purple text-[14px]">{a.name}</span>
                        {a.isMoneyAccount && (
                          <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#172e3d] text-[#6ec7f7]">money sits here</span>
                        )}
                        {a.costBehavior && (
                          <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full"
                            style={a.costBehavior === "FIXED" ? { background: "#28163b", color: "#9c69f1" } : { background: "#3c2e17", color: "#f7a96e" }}>
                            {a.costBehavior === "FIXED" ? "fixed" : "variable"}
                          </span>
                        )}
                        {!a.isActive && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#29242f] text-[#adadad]">off</span>}
                      </div>
                      {a.note && <div className="text-[12.5px] text-body-soft mt-0.5">{a.note}</div>}
                    </>
                  )}
                </div>

                <div className="text-right shrink-0 w-[120px] pt-0.5">
                  <div className="font-bold text-[14px]" style={{ color: a.balancePaisa < 0 ? "#ea7171" : "#b694d1" }}>
                    {taka(a.balancePaisa)}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2 pt-0.5">
                  {a.costBehavior && editing !== a.id && (
                    <select className="border border-[#3d3248] rounded-lg px-2 py-1 text-[11.5px] bg-white"
                      value={a.costBehavior}
                      onChange={async (e) => { try { await updateFinanceAccount(a.id, { costBehavior: e.target.value }); await load(); } catch (er) { fail(er); } }}>
                      <option value="FIXED">Fixed</option>
                      <option value="VARIABLE">Variable</option>
                    </select>
                  )}
                  {editing === a.id ? (
                    <>
                      <button className="text-[12px] font-semibold text-purple" onClick={async () => {
                        try { await updateFinanceAccount(a.id, { name: edit.name, note: edit.note || null, groupName: edit.group || null }); setEditing(null); await load(); flash("Saved"); }
                        catch (er) { fail(er); }
                      }}>Save</button>
                      <button className="text-[12px] font-semibold text-body-soft" onClick={() => setEditing(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="text-[12px] font-semibold text-purple" onClick={() => { setEditing(a.id); setEdit({ name: a.name, note: a.note ?? "", group: a.groupName ?? "" }); }}>Edit</button>
                      <button className="text-[12px] font-semibold text-body-soft" onClick={async () => {
                        try { await updateFinanceAccount(a.id, { isActive: !a.isActive }); await load(); } catch (er) { fail(er); }
                      }}>{a.isActive ? "Turn off" : "Turn on"}</button>
                      {!a.isSystem && (
                        <button className="text-[12px] font-semibold text-[#ea7171]" onClick={async () => {
                          if (!window.confirm(`Delete ${a.name}?`)) return;
                          try { await deleteFinanceAccount(a.id); await load(); flash("Removed"); } catch (er) { fail(er); }
                        }}>Delete</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <Card className="px-5 py-4 mt-6">
        <div className="text-[13px] text-body-soft">
          <b className="text-purple">Fixed or variable</b> is the one thing worth getting right.
          Fixed = you pay it whether you sell or not (rent, salary, internet). Variable = it grows
          with sales (flowers, packaging, delivery, ads). The break-even figure is built entirely
          from these two.
        </div>
      </Card>
    </div>
  );
}
