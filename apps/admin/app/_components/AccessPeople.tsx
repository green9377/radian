"use client";

/*
  ACCESS CONTROL — the people column.
  RADIAN_ADMINISTRATION_MODULE_ARCHITECTURE.md §9, 30 Jul 2026

  The owner's words, 30 July: give access by email, let people set their own
  password, and let them fix it by email when they forget.

  So this is where a person is added — by EMAIL, not by a password somebody
  types for them. An invited account has no password at all until they choose
  one from the link. A password read out over the phone is a password two
  people know, and it never gets changed afterwards.

  ⚠️ There is no PIN reset here, and that is not an omission. Money actions
  need the 4-digit PIN; if a forgotten PIN could be reset from an inbox, then
  whoever holds the inbox holds the power to move money. PIN reset stays with
  the owner, face to face. (ADM-RULE-006)

  ⚠️ No email provider key is saved yet, so nothing can actually be sent. The
  link is shown here to be copied instead. Building the invite so it only works
  once a Brevo account exists would have blocked the owner for no good reason.
*/

import { useCallback, useEffect, useState } from "react";
import {
  ApiInviteLink, ApiPerson, ApiPosition,
  assignPosition, invitePerson, listPeople, passwordResetLink, resendInvite,
} from "../_data/api";
import {
  Banner, Card, Chip, Empty, Panel, TONE,
  btnGhost, btnPrimary, btnPrimaryStyle, input, Lbl,
} from "./FinanceUI";

export default function AccessPeople({
  positions, selectedPositionId, onChanged,
}: {
  positions: ApiPosition[];
  selectedPositionId: string | null;
  onChanged: () => void;
}) {
  const [people, setPeople] = useState<ApiPerson[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "" });
  const [link, setLink] = useState<(ApiInviteLink & { who: string }) | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    listPeople().then(setPeople).catch((e) => setErr((e as Error).message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const position = positions.find((p) => p.id === selectedPositionId) ?? null;
  const here = people.filter((p) => p.positionId === selectedPositionId);
  const unassigned = people.filter((p) => !p.positionId);

  async function add() {
    const email = form.email.trim();
    if (!email) { setErr("An email address is needed"); return; }
    setErr("");
    try {
      const r = await invitePerson({
        name: form.name.trim() || undefined,
        email,
        positionId: selectedPositionId,
      });
      setLink({ ...r, who: r.user.email });
      setForm({ name: "", email: "" });
      setAdding(false);
      load(); onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function move(id: string, positionId: string | null) {
    setBusy(id);
    try {
      await assignPosition(id, positionId);
      load(); onChanged();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  async function newLink(p: ApiPerson) {
    setBusy(p.id);
    setErr("");
    try {
      const r = p.hasPassword ? await passwordResetLink(p.id) : await resendInvite(p.id);
      setLink({ ...r, who: p.email ?? p.name });
      load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[18px] bg-white overflow-hidden border"
        style={{ borderColor: "#a021b81f", boxShadow: "0 2px 10px #a021b810" }}>
        <div className="flex items-center gap-2.5 px-4 py-2.5"
          style={{ background: "linear-gradient(120deg,var(--a-solid),var(--o-solid))" }}>
          <span className="text-white text-[14px]">👥</span>
          <span className="text-[12px] font-extrabold tracking-[0.1em] uppercase text-white flex-1">
            {position ? `People in ${position.name}` : "People"}
          </span>
          {position && (
            <button
              className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/90 text-purple hover:bg-white"
              onClick={() => { setAdding((a) => !a); setErr(""); }}>
              {adding ? "Cancel" : "+ Add by email"}
            </button>
          )}
        </div>
        <div className="p-3.5">

        {adding && position && (
          <div className="mb-3 space-y-2 rounded-[13px] p-3" style={{ background: "var(--s-accent)" }}>
            <div>
              <Lbl>Email address</Lbl>
              <input
                className={input}
                type="email"
                placeholder="name@example.com"
                value={form.email}
                autoFocus
                /*  ⚠️ Chrome ignores autoComplete="off" — only "new-password"
                    is obeyed. On 29 July it filled the saved shop password into
                    three different key boxes. This is not a password field, but
                    it IS on a form Chrome wants to autofill.  */
                autoComplete="new-password"
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <Lbl>Name (optional)</Lbl>
              <input
                className={input}
                value={form.name}
                autoComplete="new-password"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && void add()}
              />
            </div>
            <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => void add()}>
              Create account &amp; get link
            </button>
          </div>
        )}

        {err && (
          <div className="mb-3 text-[12px] rounded-lg px-3 py-2"
               style={{ background: TONE.rose.soft, color: TONE.rose.text }}>
            {err}
          </div>
        )}

        {!position ? (
          <Empty title="Pick a position to see who holds it" />
        ) : here.length === 0 ? (
          <div className="text-[12px] text-body-soft py-2">
            Nobody holds this position yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {here.map((p) => (
              <PersonRow
                key={p.id} p={p} positions={positions} busy={busy === p.id}
                onMove={move} onLink={newLink}
              />
            ))}
          </div>
        )}
        </div>
      </div>

      {/*  Somebody with no position resolves to nothing but their legacy role,
          and once the enum is dropped they would silently have nothing at all.
          Better to say so now, while it is one click to fix.  */}
      {unassigned.length > 0 && (
        <Banner tone="amber" emoji="⚠" title={`${unassigned.length} without a position`}>
          <div className="mt-1.5 space-y-1.5">
            {unassigned.map((p) => (
              <PersonRow
                key={p.id} p={p} positions={positions} busy={busy === p.id}
                onMove={move} onLink={newLink}
              />
            ))}
          </div>
        </Banner>
      )}

      {link && (
        <Panel emoji="🔗" tone="emerald" title="One-time link">
          <div className="p-4">
            <p className="text-[12.5px] text-body leading-relaxed mb-2">
              For <strong>{link.who}</strong>. {link.note}
            </p>
            <div className="flex gap-1.5">
              <input className={input} readOnly value={link.link} onFocus={(e) => e.target.select()} />
              <button
                className={btnPrimary} style={btnPrimaryStyle}
                onClick={() => {
                  void navigator.clipboard?.writeText(link.link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2500);
                }}
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <p className="text-[11px] text-body-soft mt-2">
              Works once. Expires {new Date(link.expiresAt).toLocaleString()}.
            </p>
            <button className={`${btnGhost} mt-3`} onClick={() => setLink(null)}>Done</button>
          </div>
        </Panel>
      )}
    </div>
  );
}

function PersonRow({
  p, positions, busy, onMove, onLink,
}: {
  p: ApiPerson;
  positions: ApiPosition[];
  busy: boolean;
  onMove: (id: string, positionId: string | null) => void | Promise<void>;
  onLink: (p: ApiPerson) => void | Promise<void>;
}) {
  return (
    <div className="rounded-[13px] border border-[var(--l-accent)] px-3 py-2.5 bg-white">
      <div className="flex items-start gap-2.5">
        <span className="w-[30px] h-[30px] rounded-full grid place-items-center text-[12px] font-bold text-white shrink-0 mt-0.5"
          style={{ background: p.isActive ? "linear-gradient(135deg,var(--a-solid),var(--o-solid))" : "var(--s-accent)" }}>
          {p.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-body truncate">{p.name}</div>
          <div className="text-[11px] text-body-soft truncate">
            {p.email ?? `${p.username} (no email yet)`}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {!p.isActive && <Chip tone="slate">off</Chip>}
          {!p.hasPassword && <Chip tone="amber">no password yet</Chip>}
          {p.pending && (
            <Chip tone="sky">
              {p.pending.kind === "INVITE" ? "invite open" : "reset open"}
            </Chip>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <select
          className={`${input} text-[11.5px] py-1`}
          value={p.positionId ?? ""}
          disabled={busy}
          onChange={(e) => void onMove(p.id, e.target.value || null)}
        >
          <option value="">— no position —</option>
          {positions.map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </select>
        <button className={btnGhost} disabled={busy} onClick={() => void onLink(p)}>
          {p.hasPassword ? "Reset link" : "New link"}
        </button>
      </div>
    </div>
  );
}
