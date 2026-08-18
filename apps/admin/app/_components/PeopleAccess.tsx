"use client";

/*
  PEOPLE & ACCESS (DEC-FIN-028) — owner only.

  Until now the shop shared one login, so "who approved this refund" was a
  claim, not a fact. Give every person their own account and the ledger starts
  telling the truth by itself — the server writes the SESSION's name against
  every entry, and nobody can type someone else's name into a form.

  The role line is drawn at MONEY, not seniority:
    STAFF   — runs the shop: orders, POS, stock, assembly, delivery, returns.
              Never sees cost, profit, dues or the Finance module at all.
    MANAGER — the above plus buying (purchases, suppliers) and Finance.
    OWNER   — everything, plus capital, profit sharing and this screen.

  The same rule is enforced on the server; this screen only avoids showing a
  door that will not open.
*/

import { useCallback, useEffect, useState } from "react";
import {
  ApiAppUser,
  ApiPerson,
  ApiPosition,
  ApiRole,
  assignPosition,
  createAppUser,
  listAppUsers,
  listPeople,
  listPositions,
  removeAppUser,
  updateAppUser,
} from "../_data/api";
import { useAuth } from "./AuthGate";
import {
  Banner, Card, Chip, Empty, FinHeader, Flash, Panel, Table, Td, Th, TONE,
  btnGhost, btnPrimary, btnPrimaryStyle, input, Lbl, WRAP,
} from "./FinanceUI";

const ROLE_NOTE: Record<ApiRole, string> = {
  OWNER: "Everything, including capital, profit sharing and this screen",
  MANAGER: "Shop work, plus buying and the whole Finance module",
  STAFF: "Shop work only — never sees cost, profit or what we owe",
};
const ROLE_TONE: Record<ApiRole, keyof typeof TONE> = {
  OWNER: "brand",
  MANAGER: "sky",
  STAFF: "slate",
};

const blank = { name: "", username: "", password: "", pin: "", role: "STAFF" as ApiRole };

export default function PeopleAccess() {
  const { me } = useAuth();
  const [rows, setRows] = useState<ApiAppUser[]>([]);
  /*  Templates (positions) — built on Access control; ASSIGNED here.
      Owner's ruling, 18 Aug 2026: "people and access giye template dekhaia
      dibo" — the workshop makes them, this page hands them out.  */
  const [positions, setPositions] = useState<ApiPosition[]>([]);
  const [positionOf, setPositionOf] = useState<Record<string, string | null>>({});
  const [assigning, setAssigning] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState(blank);
  const [editing, setEditing] = useState<ApiAppUser | null>(null);
  const [e, setE] = useState({ name: "", role: "STAFF" as ApiRole, password: "", pin: "" });

  const load = useCallback(async () => {
    try {
      setRows(await listAppUsers());
      setOffline(false);
    } catch {
      setOffline(true);
    }
    /*  fail-soft: template data missing must not blank the people table  */
    try {
      const [pos, ppl] = await Promise.all([listPositions(), listPeople()]);
      setPositions(pos);
      setPositionOf(Object.fromEntries((ppl as ApiPerson[]).map((p) => [p.id, p.positionId])));
    } catch { /* templates unavailable — the column shows a dash */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const flash = (m: string) => { setOk(m); setErr(""); setTimeout(() => setOk(""), 3200); };
  const fail = (x: unknown) => { setErr(x instanceof Error ? x.message : String(x)); setOk(""); };

  async function add() {
    try {
      await createAppUser(f);
      setF(blank); setAdding(false); await load();
      flash(`${f.name || f.username} can sign in now`);
    } catch (x) { fail(x); }
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      await updateAppUser(editing.id, {
        name: e.name.trim() || undefined,
        role: e.role,
        password: e.password || undefined,
        pin: e.pin || undefined,
      });
      setEditing(null); await load(); flash("Saved");
    } catch (x) { fail(x); }
  }

  async function toggleActive(u: ApiAppUser) {
    try {
      await updateAppUser(u.id, { isActive: !u.isActive });
      await load();
      flash(u.isActive ? `${u.name} can no longer sign in` : `${u.name} can sign in again`);
    } catch (x) { fail(x); }
  }

  async function assign(u: ApiAppUser, positionId: string | null) {
    setAssigning(u.id);
    try {
      await assignPosition(u.id, positionId);
      setPositionOf((m) => ({ ...m, [u.id]: positionId }));
      const name = positions.find((p) => p.id === positionId)?.name;
      flash(positionId ? `${u.name} now holds "${name}"` : `${u.name} has no template now`);
    } catch (x) { fail(x); }
    finally { setAssigning(null); }
  }

  async function remove(u: ApiAppUser) {
    if (!window.confirm(`Remove ${u.name}? Their past entries stay in the books — only their access goes.`)) return;
    try { await removeAppUser(u.id); await load(); flash(`${u.name} removed`); } catch (x) { fail(x); }
  }

  const owners = rows.filter((r) => r.role === "OWNER" && r.isActive).length;

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="System"
        title="People & access"
        sub="One account per person. The books then record who did what by themselves — nobody can put another name on their own work."
        tone="brand"
      />

      <Flash ok={ok} err={err} />
      {offline && <Banner tone="rose" emoji="⚡" title="The API is not answering" >Start Docker and the API container, then reload this page.</Banner>}

      <Panel
        tone="brand"
        emoji="👥"
        title="Who can sign in"
        sub={`${rows.length} account${rows.length === 1 ? "" : "s"} · ${owners} owner${owners === 1 ? "" : "s"}`}
        right={
          <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => setAdding((v) => !v)}>
            {adding ? "Close" : "Add a person"}
          </button>
        }
      >
        {adding && (
          <Card className="px-5 py-4 mb-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Lbl>Their name</Lbl>
                <input className={input} value={f.name} placeholder="Rakib"
                  onChange={(x) => setF({ ...f, name: x.target.value })} />
                <p className="text-[11.5px] text-body-soft mt-1 mb-0">This is the name the books will show.</p>
              </div>
              <div>
                <Lbl>Username to sign in with</Lbl>
                <input className={input} value={f.username} placeholder="rakib"
                  onChange={(x) => setF({ ...f, username: x.target.value })} />
              </div>
              <div>
                <Lbl>First password (6+ characters)</Lbl>
                <input className={input} type="text" value={f.password}
                  onChange={(x) => setF({ ...f, password: x.target.value })} />
                <p className="text-[11.5px] text-body-soft mt-1 mb-0">Tell it to them once — they can change it themselves.</p>
              </div>
              <div>
                <Lbl>4-digit PIN (asked when money moves)</Lbl>
                <input className={`${input} tracking-[0.4em] text-center`} inputMode="numeric" maxLength={4}
                  value={f.pin} placeholder="••••"
                  onChange={(x) => setF({ ...f, pin: x.target.value.replace(/\D/g, "").slice(0, 4) })} />
              </div>
            </div>

            <div className="mt-4">
              <Lbl>What may they reach?</Lbl>
              <div className="grid gap-2 md:grid-cols-3 mt-1">
                {(["STAFF", "MANAGER", "OWNER"] as ApiRole[]).map((r) => {
                  const on = f.role === r;
                  const t = TONE[ROLE_TONE[r]];
                  return (
                    <button key={r} onClick={() => setF({ ...f, role: r })}
                      className="text-left px-3.5 py-3 rounded-[14px] border transition-all"
                      style={{
                        background: on ? t.soft : "#fff",
                        borderColor: on ? t.ring : "#eee6f4",
                        boxShadow: on ? `0 0 0 2px ${t.ring}` : "none",
                      }}>
                      <div className="text-[13.5px] font-bold" style={{ color: t.text }}>{r}</div>
                      <div className="text-[11.5px] text-body-soft leading-snug mt-0.5">{ROLE_NOTE[r]}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button className={btnPrimary} style={btnPrimaryStyle}
                disabled={!f.username.trim() || f.password.length < 6}
                onClick={() => void add()}>Create the account</button>
              <button className={btnGhost} onClick={() => { setAdding(false); setF(blank); }}>Cancel</button>
            </div>
          </Card>
        )}

        {rows.length === 0 && !offline ? (
          <Empty title="Nobody yet" sub="Add the people who work in the shop, each with their own account." />
        ) : (
          <Table head={<tr><Th>Person</Th><Th>Signs in as</Th><Th>Template</Th><Th>PIN</Th><Th>Last seen</Th><Th right>Actions</Th></tr>}>
            {rows.map((u) => {
              const t = TONE[ROLE_TONE[u.role]];
              return (
                <tr key={u.id} className={u.isActive ? "" : "opacity-55"}>
                  <Td>
                    <b className="text-purple">{u.name}</b>
                    {u.id === me?.id && <span className="text-[11px] text-body-soft"> · you</span>}
                    {!u.isActive && <span className="text-[11px] text-[#b91c1c] font-semibold"> · turned off</span>}
                  </Td>
                  <Td>{u.username}</Td>
                  <Td>
                    {u.role === "OWNER" ? (
                      <Chip tone="brand">OWNER — everything</Chip>
                    ) : positions.length ? (
                      <select
                        className="appearance-none text-[12.5px] font-bold rounded-[10px] pl-3 pr-8 py-[7px] max-w-[190px] cursor-pointer transition-colors disabled:opacity-50"
                        style={{
                          color: positionOf[u.id] ? "#7a2ea8" : "#8f87a0",
                          background: `${positionOf[u.id] ? "#f5eafb" : "#f6f3fa"} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a2ea8' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center`,
                          border: "1.5px solid " + (positionOf[u.id] ? "#d9b8ec" : "#e4ddef"),
                        }}
                        value={positionOf[u.id] ?? ""}
                        disabled={assigning === u.id}
                        onChange={(x) => void assign(u, x.target.value || null)}
                      >
                        <option value="">— no template —</option>
                        {positions.filter((p) => !p.isOwner).map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[12px] text-body-soft">—</span>
                    )}
                    <div className="text-[10.5px] text-body-soft mt-0.5">legacy: {u.role}</div>
                  </Td>
                  <Td>{u.hasPin ? "set" : <span className="text-[#b45309] font-semibold">not set</span>}</Td>
                  <Td>{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : "never"}</Td>
                  <Td right>
                    <div className="flex gap-1.5 justify-end flex-wrap">
                      <button className={btnGhost} onClick={() => {
                        setEditing(u); setE({ name: u.name, role: u.role, password: "", pin: "" });
                      }}>Edit</button>
                      <button className={btnGhost} onClick={() => void toggleActive(u)}
                        disabled={u.id === me?.id}>{u.isActive ? "Turn off" : "Turn on"}</button>
                      <button className={btnGhost} onClick={() => void remove(u)}
                        disabled={u.id === me?.id}>Remove</button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(40,20,55,0.45)" }}>
          <Card className="px-6 py-6 w-full max-w-[440px]">
            <div className="font-display text-[19px] text-purple mb-1">{editing.name}</div>
            <p className="text-[12.5px] text-body-soft mt-0 mb-4">
              Leave a box empty to keep what is there now.
            </p>
            <Lbl>Name shown in the books</Lbl>
            <input className={input} value={e.name} onChange={(x) => setE({ ...e, name: x.target.value })} />
            <div className="mt-3">
              <Lbl>May reach</Lbl>
              <select className={input} value={e.role} onChange={(x) => setE({ ...e, role: x.target.value as ApiRole })}>
                <option value="STAFF">STAFF — shop work only</option>
                <option value="MANAGER">MANAGER — plus buying and Finance</option>
                <option value="OWNER">OWNER — everything</option>
              </select>
            </div>
            <div className="mt-3">
              <Lbl>New password (optional)</Lbl>
              <input className={input} value={e.password} onChange={(x) => setE({ ...e, password: x.target.value })} />
            </div>
            <div className="mt-3">
              <Lbl>New 4-digit PIN (optional)</Lbl>
              <input className={`${input} tracking-[0.4em] text-center`} inputMode="numeric" maxLength={4}
                value={e.pin} placeholder="••••"
                onChange={(x) => setE({ ...e, pin: x.target.value.replace(/\D/g, "").slice(0, 4) })} />
            </div>
            <div className="flex gap-2 mt-5">
              <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => void saveEdit()}>Save</button>
              <button className={btnGhost} onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </Card>
        </div>
      )}

      <Panel tone="sky" emoji="🛡" title="Why this matters" sub="What each role can and cannot see" className="mt-5">
        <div className="grid gap-3 md:grid-cols-3">
          {(["STAFF", "MANAGER", "OWNER"] as ApiRole[]).map((r) => {
            const t = TONE[ROLE_TONE[r]];
            return (
              <Card key={r} className="px-4 py-4" style={{ background: t.soft, borderColor: t.ring }}>
                <div className="text-[14px] font-bold mb-1" style={{ color: t.text }}>{r}</div>
                <div className="text-[12.5px] text-body-soft leading-relaxed">{ROLE_NOTE[r]}</div>
              </Card>
            );
          })}
        </div>
        <p className="text-[12.5px] text-body-soft mt-4 mb-0">
          Whatever anyone does, the books record the name of the account that was signed in — not a name typed
          into a box. And before money actually moves, that person&apos;s own 4-digit PIN is asked again.
        </p>
      </Panel>
    </div>
  );
}
