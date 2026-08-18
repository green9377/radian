"use client";

/*
  ADMINISTRATION — three screens over facts the system already had.
  RADIAN_ADMINISTRATION_MODULE_ARCHITECTURE.md, 30 Jul 2026

  None of these needed new data collected. All three needed something to read
  what was already being written:

    Signed in now   AppSession has had a row per sign-in since the first build
    Backup          radian_backup_silent.bat has logged every dump it took
    All settings    ten singleton tables, and a sidebar button with no href

  ⚠️ "All settings" is a MAP, not a merged table. Gathering ten module settings
  into one table is the tempting mistake: the VAT rate is a Finance business
  rule and the POS discount ceiling belongs to POS. One door, not one table.
*/

import Link from "next/link";
import Icon from "./Icon";
import { useCallback, useEffect, useState } from "react";
import {
  ApiBackups, ApiSession, ApiSettingsEntry,
  endAllSessions, endSession, getBackups, getSettingsMap, listSessions,
} from "../_data/api";
import {
  FinHeader, Flash, Table, Td, Th, WRAP,
} from "./FinanceUI";

/* ================================================================== *
 *  Signed in now
 * ================================================================== */

export function SessionsScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const [rows, setRows] = useState<ApiSession[]>([]);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    listSessions().then(setRows).catch((e) => setErr((e as Error).message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const flash = (m: string) => { setOk(m); setTimeout(() => setOk(""), 4000); };

  async function drop(s: ApiSession) {
    setBusy(s.id); setErr("");
    try {
      await endSession(s.id);
      flash(`${s.name} was signed out on that device`);
      load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  async function dropAll(s: ApiSession) {
    if (!window.confirm(`Sign ${s.name} out of every device?`)) return;
    setBusy(s.id); setErr("");
    try {
      const r = await endAllSessions(s.userId);
      flash(`${r.ended} device${r.ended === 1 ? "" : "s"} signed out`);
      load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <div className={embedded ? "" : WRAP}>
      {!embedded && (
        <FinHeader
          eyebrow="Administration" emoji="◍" title="Signed in now"
          sub={`${rows.length} live session${rows.length === 1 ? "" : "s"} — a session lasts 7 days`}
        />
      )}
      <Flash ok={ok} err={err} />

      <div className="rounded-[16px] bg-white border border-[#e9e2f2] overflow-hidden"
        style={{ boxShadow: "0 2px 10px rgba(70,0,102,0.06)" }}>
        <div className="px-4 py-2.5 flex items-center gap-2.5"
          style={{ background: "linear-gradient(120deg,#8a2bb0,#cf43ea)" }}>
          <span className="text-[11.5px] font-extrabold tracking-[0.1em] uppercase text-white flex-1">Live sessions</span>
          <span className="text-[10px] font-bold px-2 py-[1px] rounded-full bg-white/25 text-white">{rows.length}</span>
        </div>

        {rows.length === 0 ? (
          <p className="text-[12.5px] text-body-soft px-4 py-4 m-0">Nobody is signed in.</p>
        ) : (
          <div>
            {rows.map((s) => (
              <div key={s.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-[#f3eff8] last:border-0 flex-wrap">
                <span className="w-[34px] h-[34px] rounded-full grid place-items-center text-[13px] font-bold text-white shrink-0"
                  style={{ background: s.isYou ? "linear-gradient(135deg,#b76e79,#e0a8a0)" : "linear-gradient(135deg,#8a2bb0,#cf43ea)" }}>
                  {s.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold text-[#2d2838] truncate">
                    {s.name}
                    {s.isYou && (
                      <span className="text-[9.5px] font-bold text-white px-1.5 py-[2px] rounded-full ml-1.5 align-middle"
                        style={{ background: "linear-gradient(135deg,#b76e79,#e0a8a0)" }}>this device</span>
                    )}
                  </div>
                  <div className="text-[11px] text-body-soft truncate">{s.email ?? "no email"}</div>
                </div>
                <span className="text-[10.5px] font-bold px-2 py-[3px] rounded-full shrink-0"
                  style={{ background: "#f5eafb", color: "#7a2ea8" }}>{s.position}</span>
                <div className="text-right shrink-0 hidden sm:block">
                  <div className="text-[11px] font-semibold text-body">since {new Date(s.startedAt).toLocaleString()}</div>
                  <div className="text-[10px] text-body-soft">until {new Date(s.expiresAt).toLocaleDateString()}</div>
                </div>
                {!s.isYou && (
                  <div className="flex gap-1 shrink-0">
                    <button className="text-[11px] font-bold px-2.5 py-1.5 rounded-[8px] border bg-white transition-colors disabled:opacity-40"
                      style={{ borderColor: "#e4ddef", color: "#7a2ea8" }}
                      disabled={busy === s.id} onClick={() => void drop(s)}>Sign out</button>
                    <button className="text-[11px] font-bold px-2.5 py-1.5 rounded-[8px] border bg-white transition-colors disabled:opacity-40"
                      style={{ borderColor: "#f2c8c2", color: "#c0392b" }}
                      disabled={busy === s.id} onClick={() => void dropAll(s)}>All devices</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11.5px] text-body-soft leading-relaxed mt-4 max-w-[720px]">
        Signing someone out does not change their password. If an account is
        actually compromised, use <strong>All devices</strong> and then send a
        password reset link from Access control.
      </p>
    </div>
  );
}

/* ================================================================== *
 *  Backup & restore
 * ================================================================== */

export function BackupScreen() {
  const [b, setB] = useState<ApiBackups | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    getBackups().then(setB).catch((e) => setErr((e as Error).message));
  }, []);

  /*  No state banners here - never / stale / suspicious all live in the
      bell (owner, 19 Aug). The hero pill gives the verdict at a glance.  */
  const pill = !b
    ? null
    : b.state === "never"
      ? { dot: "#ff8a80", text: "Never run" }
      : b.state === "ok"
        ? { dot: "#4be3a4", text: `Last: ${b.hoursSince === 0 ? "under an hour" : `${b.hoursSince}h`} ago` }
        : { dot: "#ffd166", text: `Last: ${b.hoursSince}h ago` };

  return (
    <div className={WRAP}>
      <div className="rounded-[20px] px-5 py-4 mb-4 relative overflow-hidden"
        style={{ background: "linear-gradient(120deg,#470066 0%,#8a2bb0 42%,#cf43ea 74%,#b76e79 100%)" }}>
        <div className="flex items-center gap-3 relative flex-wrap">
          <span className="w-[38px] h-[38px] rounded-[12px] grid place-items-center text-white shrink-0"
            style={{ background: "rgba(255,255,255,0.16)" }}>
            <Icon name="download" size={18} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/70">Setup · Administration</div>
            <h1 className="font-display text-[21px] text-white leading-tight m-0">Backup & restore</h1>
          </div>
          {pill && (
            <span className="ml-auto flex items-center gap-1.5 px-3 py-[7px] rounded-full text-[11px] font-bold text-white"
              style={{ background: "rgba(255,255,255,0.18)" }}>
              <span className="w-[7px] h-[7px] rounded-full" style={{ background: pill.dot }} />
              {pill.text}
            </span>
          )}
        </div>
      </div>
      <Flash ok="" err={err} />

      <div className="rounded-[16px] bg-white border border-[#e9e2f2] overflow-hidden"
        style={{ boxShadow: "0 2px 10px rgba(70,0,102,0.06)" }}>
        <div className="px-4 py-2.5 flex items-center gap-2.5"
          style={{ background: "linear-gradient(120deg,#0e9767,#22c08b)" }}>
          <span className="text-white"><Icon name="download" size={14} strokeWidth={2.3} /></span>
          <span className="text-[11.5px] font-extrabold tracking-[0.1em] uppercase text-white flex-1">Recent backups</span>
          <span className="text-[10px] font-bold px-2 py-[1px] rounded-full bg-white/25 text-white">{b?.history.length ?? 0}</span>
        </div>
        {!b || b.history.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[13px] font-bold text-[#2d2838] m-0">Nothing recorded yet</p>
            <p className="text-[11.5px] text-body-soft mt-1 mb-0">
              <code>radian_backup.bat</code> once, then <code>radian_backup_schedule.bat</code> for every night
            </p>
          </div>
        ) : (
          <Table head={<><Th>When</Th><Th>File</Th><Th right>Size</Th><Th>By</Th></>}>
            {b.history.map((h, i) => (
              <tr key={`${h.file}-${i}`}>
                <Td>{new Date(h.at).toLocaleString()}</Td>
                <Td><code className="text-[11px]">{h.file ?? "\u2014"}</code></Td>
                <Td right>
                  {h.bytes == null ? "\u2014" : (
                    <span className="font-semibold"
                      style={{ color: h.bytes < 10 * 1024 ? "#c0392b" : "#0e9767" }}>
                      {(h.bytes / 1024).toFixed(0)} KB
                    </span>
                  )}
                </Td>
                <Td>{h.by}</Td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}

/* ================================================================== *
 *  All settings — a map, not a table
 * ================================================================== */

/*  Owner modules wear the same hues their departments wear in the sidebar,
    so this map and the nav read as one system.  */
const OWNER_META: Record<string, { label: string; icon: string; grad: string; fg: string }> = {
  pos: { label: "POS", icon: "register", grad: "linear-gradient(120deg,#d8577e,#f0a8b8)", fg: "#d8577e" },
  returns: { label: "Returns", icon: "returnArrow", grad: "linear-gradient(120deg,#d8577e,#f0a8b8)", fg: "#d8577e" },
  offers: { label: "Offers", icon: "tag", grad: "linear-gradient(120deg,#b23bd6,#e07be0)", fg: "#b23bd6" },
  inventory: { label: "Inventory", icon: "warehouse", grad: "linear-gradient(120deg,#1d9d77,#5ec9a8)", fg: "#1d9d77" },
  finance: { label: "Finance", icon: "wallet", grad: "linear-gradient(120deg,#b07818,#e9c46a)", fg: "#b07818" },
  marketing: { label: "Marketing", icon: "megaphone", grad: "linear-gradient(120deg,#3b76c4,#7fb4f0)", fg: "#3b76c4" },
  messaging: { label: "Messaging", icon: "mail", grad: "linear-gradient(120deg,#3b76c4,#7fb4f0)", fg: "#3b76c4" },
  seo: { label: "SEO", icon: "search", grad: "linear-gradient(120deg,#3b76c4,#7fb4f0)", fg: "#3b76c4" },
  tracking: { label: "Tracking", icon: "chart", grad: "linear-gradient(120deg,#3b76c4,#7fb4f0)", fg: "#3b76c4" },
  intelligence: { label: "Intelligence", icon: "bolt", grad: "linear-gradient(120deg,#3b76c4,#7fb4f0)", fg: "#3b76c4" },
  company: { label: "Company", icon: "store", grad: "linear-gradient(120deg,#8879a8,#b9aecf)", fg: "#8879a8" },
};
/* sidebar department order: today's work, sell, stock, money, growth, setup */
const OWNER_ORDER = [
  "pos", "returns", "offers", "inventory", "finance",
  "marketing", "messaging", "seo", "tracking", "intelligence", "company",
];

export function SettingsMapScreen() {
  const [rows, setRows] = useState<ApiSettingsEntry[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    getSettingsMap().then(setRows).catch((e) => setErr((e as Error).message));
  }, []);

  const byOwner = rows.reduce<Record<string, ApiSettingsEntry[]>>((acc, r) => {
    (acc[r.owner] ??= []).push(r);
    return acc;
  }, {});
  const pos = (o: string) => { const i = OWNER_ORDER.indexOf(o); return i === -1 ? 999 : i; };
  const owners = Object.keys(byOwner).sort((a, b) => pos(a) - pos(b));
  const inUse = rows.filter((r) => r.exists).length;

  return (
    <div className={WRAP}>
      <div className="rounded-[20px] px-5 py-4 mb-4 relative overflow-hidden"
        style={{ background: "linear-gradient(120deg,#470066 0%,#8a2bb0 42%,#cf43ea 74%,#b76e79 100%)" }}>
        <div className="flex items-center gap-3 relative flex-wrap">
          <span className="w-[38px] h-[38px] rounded-[12px] grid place-items-center text-white shrink-0"
            style={{ background: "rgba(255,255,255,0.16)" }}>
            <Icon name="gear" size={18} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/70">Setup · Administration</div>
            <h1 className="font-display text-[21px] text-white leading-tight m-0">All settings</h1>
          </div>
          {rows.length > 0 && (
            <span className="ml-auto px-3 py-[7px] rounded-full text-[11px] font-bold text-white"
              style={{ background: "rgba(255,255,255,0.18)" }}>
              {rows.length} screens · {inUse} in use
            </span>
          )}
        </div>
      </div>
      <Flash ok="" err={err} />

      <div className="space-y-4">
        {owners.map((owner) => {
          const meta = OWNER_META[owner] ?? {
            label: owner.replace(/^./, (c) => c.toUpperCase()), icon: "gear",
            grad: "linear-gradient(120deg,#8a2bb0,#cf43ea)", fg: "#7a2ea8",
          };
          const list = byOwner[owner];
          return (
            <div key={owner} className="rounded-[16px] bg-white border border-[#e9e2f2] overflow-hidden"
              style={{ boxShadow: "0 2px 10px rgba(70,0,102,0.06)" }}>
              <div className="px-4 py-2.5 flex items-center gap-2.5" style={{ background: meta.grad }}>
                <span className="text-white"><Icon name={meta.icon} size={14} strokeWidth={2.3} /></span>
                <span className="text-[11.5px] font-extrabold tracking-[0.1em] uppercase text-white flex-1">{meta.label}</span>
                <span className="text-[10px] font-bold px-2 py-[1px] rounded-full bg-white/25 text-white">{list.length}</span>
              </div>
              <div className="p-3.5 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {list.map((r) => (
                  <Link key={r.key} href={r.href}
                    className="rounded-[13px] border bg-white p-3 transition-all hover:-translate-y-[1px]"
                    style={{ borderColor: "#eee9f4", boxShadow: "0 1px 4px rgba(70,0,102,0.05)" }}>
                    <div className="flex items-center gap-2.5">
                      <span className="w-[26px] h-[26px] rounded-[8px] grid place-items-center text-white shrink-0"
                        style={{ background: meta.grad }}>
                        <Icon name={meta.icon} size={12} strokeWidth={2.4} />
                      </span>
                      <span className="text-[13px] font-bold text-[#2d2838] flex-1 min-w-0 truncate">{r.label}</span>
                      <span className="w-[8px] h-[8px] rounded-full shrink-0"
                        title={r.exists ? "in use" : "untouched"}
                        style={r.exists
                          ? { background: "#22c08b" }
                          : { background: "#fff", border: "2px solid #d8d0e4" }} />
                    </div>
                    <p className="text-[11px] text-body-soft mt-1.5 mb-0 truncate">{r.what}</p>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
