"use client";

/*
  PEOPLE & ACCESS — two doors, nothing else. Owner only.
  Rebuilt 18 Aug 2026 to the owner's exact shape:

    "2 vabe people and access kaj krbe: employee list asbe, sekhan theke name
     select kre access dewa jabe — ar 2nd, name ar email diye just template
     dekhai dile hobe. bahire extra kichu jen na thake."

  Door 1 — FROM THE STAFF LIST. Pick an employee from HR, give an email and a
  template; the account is created by invite AND linked to that employee row
  (Employee.appUserId — the column has existed since HR was built). ADM-D10's
  auto-deactivate on employment end rides on this link later.

  Door 2 — BY EMAIL. Name + email + template for people who are not on the
  payroll (an outside accountant, a partner).

  Both doors end the same way (ADM-RULE-006): a one-time link, shown here to
  be copied; the person chooses their own password. No password is ever typed
  on this screen, and the PIN never travels by email.

  Below the doors: who has access — one row per account, template changeable
  in place. That is the whole page.
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiEmployee, ApiInviteLink, ApiPerson, ApiPosition,
  assignPosition, invitePerson, listEmployees, listPeople, listPositions,
  passwordResetLink, removeAppUser, resendInvite, updateAppUser, updateEmployee,
} from "../_data/api";
import { useAuth } from "./AuthGate";
import { Flash, WRAP, input } from "./FinanceUI";
import Icon from "./Icon";

const GRAD = "linear-gradient(120deg,#8a2bb0,#cf43ea)";
const GRAD_HERO = "linear-gradient(120deg,#470066 0%,#8a2bb0 42%,#cf43ea 74%,#b76e79 100%)";

export default function PeopleAccess() {
  const { me } = useAuth();
  const [people, setPeople] = useState<ApiPerson[]>([]);
  const [positions, setPositions] = useState<ApiPosition[]>([]);
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  /* door 1 — which employee is being given access, and the form for it */
  const [giving, setGiving] = useState<ApiEmployee | null>(null);
  const [empEmail, setEmpEmail] = useState("");
  const [empPosition, setEmpPosition] = useState<string>("");
  const [empSearch, setEmpSearch] = useState("");

  /* door 2 — by email */
  const [form, setForm] = useState({ name: "", email: "", positionId: "" });

  /* the one-time link, whichever door produced it */
  const [link, setLink] = useState<(ApiInviteLink & { who: string }) | null>(null);
  const [copied, setCopied] = useState(false);

  const flash = (m: string) => { setOk(m); setErr(""); setTimeout(() => setOk(""), 3600); };
  const fail = (x: unknown) => { setErr(x instanceof Error ? x.message : String(x)); setOk(""); };

  const load = useCallback(() => {
    listPeople().then(setPeople).catch((e) => fail(e));
    listPositions().then(setPositions).catch(() => undefined);
    listEmployees().then((r) => setEmployees(r.items)).catch(() => setEmployees([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const templates = positions.filter((p) => !p.isOwner);
  const accountIds = useMemo(() => new Set(people.map((p) => p.id)), [people]);
  const staff = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    return employees
      .filter((e) => !e.deletedAt && e.status === "ACTIVE")
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.employeeNo.toLowerCase().includes(q));
  }, [employees, empSearch]);

  /* ── door 1: employee → invite → LINK the two rows ─────────────────── */
  async function giveToEmployee() {
    if (!giving) return;
    const email = empEmail.trim();
    if (!email) { setErr("An email address is needed — the invite travels there."); return; }
    if (!empPosition) { setErr("Pick a template — an account with no template can reach nothing."); return; }
    setBusy("door1"); setErr("");
    try {
      const r = await invitePerson({
        name: giving.name,
        email,
        positionId: empPosition || null,
      });
      /*  The link that makes door 1 different from door 2: the account now
          belongs to this employee. Employment ends → access ends (ADM-D10).  */
      await updateEmployee(giving.id, { appUserId: r.user.id });
      setLink({ ...r, who: `${giving.name} (${email})` });
      setGiving(null); setEmpEmail(""); setEmpPosition("");
      load();
      flash(`${giving.name} invited and linked to their staff record`);
    } catch (x) { fail(x); }
    finally { setBusy(null); }
  }

  /* ── door 2: plain email invite ────────────────────────────────────── */
  async function giveByEmail() {
    const email = form.email.trim();
    if (!email) { setErr("An email address is needed."); return; }
    if (!form.positionId) { setErr("Pick a template — an account with no template can reach nothing."); return; }
    setBusy("door2"); setErr("");
    try {
      const r = await invitePerson({
        name: form.name.trim() || undefined,
        email,
        positionId: form.positionId || null,
      });
      setLink({ ...r, who: r.user.email });
      setForm({ name: "", email: "", positionId: "" });
      load();
      flash(`Invite created for ${email}`);
    } catch (x) { fail(x); }
    finally { setBusy(null); }
  }

  /* ── the list below ────────────────────────────────────────────────── */
  async function assign(p: ApiPerson, positionId: string | null) {
    setBusy(p.id);
    try {
      await assignPosition(p.id, positionId);
      load();
      const name = positions.find((x) => x.id === positionId)?.name;
      flash(positionId ? `${p.name} now holds "${name}"` : `${p.name} holds no template now`);
    } catch (x) { fail(x); }
    finally { setBusy(null); }
  }

  async function newLink(p: ApiPerson) {
    setBusy(p.id);
    try {
      const r = p.hasPassword ? await passwordResetLink(p.id) : await resendInvite(p.id);
      setLink({ ...r, who: p.email ?? p.name });
      load();
    } catch (x) { fail(x); }
    finally { setBusy(null); }
  }

  async function toggleActive(p: ApiPerson) {
    setBusy(p.id);
    try {
      await updateAppUser(p.id, { isActive: !p.isActive });
      load();
      flash(p.isActive ? `${p.name} can no longer sign in` : `${p.name} can sign in again`);
    } catch (x) { fail(x); }
    finally { setBusy(null); }
  }

  async function remove(p: ApiPerson) {
    if (!window.confirm(`Remove ${p.name}? Their past entries stay in the books — only the access goes.`)) return;
    setBusy(p.id);
    try { await removeAppUser(p.id); load(); flash(`${p.name} removed`); }
    catch (x) { fail(x); }
    finally { setBusy(null); }
  }

  const posSelect = (value: string, onChange: (v: string) => void) => (
    <select
      className="appearance-none w-full text-[13px] font-bold rounded-[10px] pl-3 pr-8 py-2 cursor-pointer"
      style={{
        color: value ? "#b97fdc" : "#aaa4b7",
        background: `${value ? "#2e1a38" : "#271f31"} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a2ea8' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center`,
        border: "1.5px solid " + (value ? "#422c4f" : "#3b3248"),
      }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— pick a template —</option>
      {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );

  return (
    <div className={WRAP}>
      {/* ── hero ─────────────────────────────────────────────────────── */}
      <div className="rounded-[20px] px-5 py-4 mb-4 relative overflow-hidden" style={{ background: GRAD_HERO }}>
        <div className="flex items-center gap-3 relative flex-wrap">
          <span className="w-[38px] h-[38px] rounded-[12px] grid place-items-center text-white shrink-0"
            style={{ background: "rgba(255,255,255,0.16)" }}>
            <Icon name="users" size={18} strokeWidth={2.2} />
          </span>
          <div>
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/70">Setup · Administration</div>
            <h1 className="font-display text-[21px] text-white leading-tight m-0">People &amp; access</h1>
          </div>
          <span className="ml-auto text-[11px] font-bold text-white bg-white/[0.16] px-2.5 py-1 rounded-full">
            {people.filter((p) => p.isActive).length} with access
          </span>
        </div>
      </div>
      <Flash ok={ok} err={err} />

      {/* ── the two doors ────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2 mb-4 items-start">

        {/* door 1 — from the staff list */}
        <div className="rounded-[16px] bg-white border border-[#3c3249] overflow-hidden"
          style={{ boxShadow: "0 2px 10px rgba(70,0,102,0.06)" }}>
          <div className="px-4 py-2.5 flex items-center gap-2.5" style={{ background: GRAD }}>
            <span className="text-white"><Icon name="users" size={15} strokeWidth={2.3} /></span>
            <span className="text-[11.5px] font-extrabold tracking-[0.1em] uppercase text-white flex-1">
              From your staff list
            </span>
            <span className="text-[10px] font-bold px-2 py-[1px] rounded-full bg-white/25 text-white">{staff.length}</span>
          </div>

          <div className="p-3">
            {employees.length === 0 ? (
              <p className="text-[12.5px] text-body-soft m-0 px-1 py-2">
                No staff in HR yet — add them under Staff, or use the email door on the right.
              </p>
            ) : (
              <>
                <input className={`${input} mb-2`} placeholder="Search staff…"
                  value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} />
                <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                  {staff.map((emp) => {
                    const linked = emp.appUserId && accountIds.has(emp.appUserId);
                    const opening = giving?.id === emp.id;
                    return (
                      <div key={emp.id} className="rounded-[11px] border border-[#3c304a]">
                        <div className="flex items-center gap-2.5 px-2.5 py-2">
                          <span className="w-[28px] h-[28px] rounded-full grid place-items-center text-[12px] font-bold text-white shrink-0"
                            style={{ background: linked ? "linear-gradient(135deg,#12a172,#5ec9a8)" : GRAD }}>
                            {emp.name.slice(0, 1).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-bold text-[#dfd2e4] truncate">{emp.name}</div>
                            <div className="text-[10.5px] text-body-soft truncate">
                              {emp.employeeNo}{emp.role?.name ? ` · ${emp.role.name}` : ""}
                            </div>
                          </div>
                          {linked ? (
                            <span className="text-[10.5px] font-bold px-2 py-1 rounded-full shrink-0"
                              style={{ background: "#1c3629", color: "#73f2c6" }}>
                              has access ✓
                            </span>
                          ) : (
                            <button
                              className="text-[11px] font-bold px-2.5 py-1.5 rounded-[8px] text-white shrink-0"
                              style={{ background: opening ? "#5b5370" : GRAD }}
                              onClick={() => {
                                setGiving(opening ? null : emp);
                                setEmpEmail(""); setEmpPosition("");
                              }}>
                              {opening ? "Cancel" : "Give access"}
                            </button>
                          )}
                        </div>

                        {opening && (
                          <div className="px-2.5 pb-2.5 pt-1 space-y-2 border-t border-[#3d304a]">
                            <input className={input} type="email" placeholder="Their email — the invite goes there"
                              autoFocus autoComplete="new-password"
                              value={empEmail} onChange={(e) => setEmpEmail(e.target.value)} />
                            {posSelect(empPosition, setEmpPosition)}
                            <button
                              className="w-full text-[12.5px] font-bold py-2 rounded-[10px] text-white disabled:opacity-50"
                              style={{ background: GRAD }}
                              disabled={busy === "door1" || !empEmail.trim() || !empPosition}
                              onClick={() => void giveToEmployee()}>
                              {busy === "door1" ? "Creating…" : "Create the invite & link to this employee"}
                            </button>
                            <p className="text-[10.5px] text-body-soft m-0 leading-snug">
                              They choose their own password from a one-time link. The account is
                              tied to this staff record.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* door 2 — by email */}
        <div className="rounded-[16px] bg-white border border-[#3c3249] overflow-hidden"
          style={{ boxShadow: "0 2px 10px rgba(70,0,102,0.06)" }}>
          <div className="px-4 py-2.5 flex items-center gap-2.5" style={{ background: GRAD }}>
            <span className="text-white"><Icon name="mail" size={15} strokeWidth={2.3} /></span>
            <span className="text-[11.5px] font-extrabold tracking-[0.1em] uppercase text-white flex-1">
              By email — anyone
            </span>
          </div>

          <div className="p-4 space-y-2.5">
            <input className={input} placeholder="Name (optional — taken from the email if blank)"
              autoComplete="new-password"
              value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <input className={input} type="email" placeholder="Email address"
              autoComplete="new-password"
              value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            {posSelect(form.positionId, (v) => setForm((f) => ({ ...f, positionId: v })))}
            <button
              className="w-full text-[13px] font-bold py-2.5 rounded-[10px] text-white disabled:opacity-50"
              style={{ background: GRAD }}
              disabled={busy === "door2" || !form.email.trim() || !form.positionId}
              onClick={() => void giveByEmail()}>
              {busy === "door2" ? "Creating…" : "Create the invite"}
            </button>
            <p className="text-[10.5px] text-body-soft m-0 leading-snug">
              For someone not on the payroll — an accountant, a partner. No password is
              typed here; they choose their own from the one-time link.
            </p>
          </div>
        </div>
      </div>

      {/* ── the one-time link, whichever door made it ────────────────── */}
      {link && (
        <div className="rounded-[16px] bg-white border overflow-hidden mb-4"
          style={{ borderColor: "#314943", boxShadow: "0 2px 10px rgba(18,161,114,0.10)" }}>
          <div className="px-4 py-2.5 flex items-center gap-2.5"
            style={{ background: "linear-gradient(120deg,#0e9767,#22c08b)" }}>
            <span className="text-white"><Icon name="check" size={15} strokeWidth={2.6} /></span>
            <span className="text-[11.5px] font-extrabold tracking-[0.1em] uppercase text-white flex-1">
              One-time link — send it yourself
            </span>
            <button className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/90"
              style={{ color: "#73f2c6" }} onClick={() => setLink(null)}>Done</button>
          </div>
          <div className="p-4">
            <p className="text-[12.5px] text-body m-0 mb-2">For <b>{link.who}</b>. {link.note}</p>
            <div className="flex gap-1.5">
              <input className={input} readOnly value={link.link} onFocus={(e) => e.target.select()} />
              <button
                className="text-[12.5px] font-bold px-4 rounded-[10px] text-white shrink-0"
                style={{ background: GRAD }}
                onClick={() => {
                  void navigator.clipboard?.writeText(link.link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2500);
                }}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <p className="text-[10.5px] text-body-soft mt-2 mb-0">
              Works once, then stops. Expires {new Date(link.expiresAt).toLocaleString()}.
              Asking again replaces it — the old link dies immediately.
            </p>
          </div>
        </div>
      )}

      {/* ── who has access ───────────────────────────────────────────── */}
      <div className="rounded-[16px] bg-white border border-[#3c3249] overflow-hidden"
        style={{ boxShadow: "0 2px 10px rgba(70,0,102,0.06)" }}>
        <div className="px-4 py-2.5 flex items-center gap-2.5" style={{ background: GRAD }}>
          <span className="text-white"><Icon name="shield" size={15} strokeWidth={2.3} /></span>
          <span className="text-[11.5px] font-extrabold tracking-[0.1em] uppercase text-white flex-1">
            Who has access
          </span>
          <span className="text-[10px] font-bold px-2 py-[1px] rounded-full bg-white/25 text-white">{people.length}</span>
        </div>

        <div>
          {people.map((p) => {
            const isOwnerAcct = positions.find((x) => x.id === p.positionId)?.isOwner
              || p.legacyRole === "OWNER";
            return (
              <div key={p.id}
                className={"flex items-center gap-3 px-4 py-2.5 border-b border-[#3c3149] last:border-0 flex-wrap " + (p.isActive ? "" : "opacity-55")}>
                <span className="w-[32px] h-[32px] rounded-full grid place-items-center text-[13px] font-bold text-white shrink-0"
                  style={{ background: isOwnerAcct ? "linear-gradient(135deg,#b76e79,#432926)" : GRAD }}>
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold text-[#dfd2e4] truncate">
                    {p.name}
                    {p.id === me?.id && <span className="text-[10.5px] font-semibold text-body-soft"> · you</span>}
                  </div>
                  <div className="text-[11px] text-body-soft truncate">
                    {p.email ?? `${p.username} (no email yet)`}
                    {p.lastLogin ? ` · seen ${new Date(p.lastLogin).toLocaleDateString()}` : " · never signed in"}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  {!p.hasPassword && (
                    <span className="text-[10px] font-bold px-2 py-[3px] rounded-full" style={{ background: "#3c2f17", color: "#edc278" }}>no password yet</span>
                  )}
                  {p.pending && (
                    <span className="text-[10px] font-bold px-2 py-[3px] rounded-full" style={{ background: "#17273a", color: "#82a7d9" }}>
                      {p.pending.kind === "INVITE" ? "invite open" : "reset open"}
                    </span>
                  )}
                  {!p.isActive && (
                    <span className="text-[10px] font-bold px-2 py-[3px] rounded-full" style={{ background: "#3b1a16", color: "#e1837a" }}>off</span>
                  )}
                </div>

                {isOwnerAcct ? (
                  <span className="text-[11px] font-bold px-2.5 py-1.5 rounded-full shrink-0"
                    style={{ background: "#37221a", color: "#c9929a" }}>OWNER — everything</span>
                ) : (
                  <div className="w-[180px] shrink-0">
                    {posSelect(p.positionId ?? "", (v) => void assign(p, v || null))}
                  </div>
                )}

                <div className="flex gap-1 shrink-0">
                  <RowBtn label={p.hasPassword ? "Reset link" : "New link"} disabled={busy === p.id}
                    onClick={() => void newLink(p)} />
                  <RowBtn label={p.isActive ? "Turn off" : "Turn on"} disabled={busy === p.id || p.id === me?.id}
                    onClick={() => void toggleActive(p)} />
                  <RowBtn label="Remove" tone="danger" disabled={busy === p.id || p.id === me?.id}
                    onClick={() => void remove(p)} />
                </div>
              </div>
            );
          })}
          {people.length === 0 && (
            <p className="text-[12.5px] text-body-soft px-4 py-3 m-0">Nobody yet — use either door above.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function RowBtn({ label, onClick, disabled, tone }: {
  label: string; onClick: () => void; disabled?: boolean; tone?: "danger";
}) {
  return (
    <button
      className="text-[11px] font-bold px-2.5 py-1.5 rounded-[8px] border transition-colors disabled:opacity-40"
      style={{
        borderColor: tone === "danger" ? "#512e29" : "#3b3248",
        color: tone === "danger" ? "#e1837a" : "#b97fdc",
        background: "#fff",
      }}
      disabled={disabled}
      onClick={onClick}>
      {label}
    </button>
  );
}
