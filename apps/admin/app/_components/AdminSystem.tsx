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
import { useCallback, useEffect, useState } from "react";
import {
  ApiBackups, ApiSession, ApiSettingsEntry,
  endAllSessions, endSession, getBackups, getSettingsMap, listSessions,
} from "../_data/api";
import {
  Banner, Card, Chip, Empty, FinHeader, Flash, Panel, Table, Td, Th,
  TONE, WRAP, btnGhost,
} from "./FinanceUI";

/* ================================================================== *
 *  Signed in now
 * ================================================================== */

export function SessionsScreen() {
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
    <div className={WRAP}>
      <FinHeader
        eyebrow="Administration" emoji="◍" title="Signed in now"
        sub={`${rows.length} live session${rows.length === 1 ? "" : "s"} — a session lasts 7 days`}
      />
      <Flash ok={ok} err={err} />

      <Panel emoji="▤" title="Live sessions" sub="One row per device that is signed in">
        {rows.length === 0 ? (
          <div className="p-5"><Empty title="Nobody is signed in" /></div>
        ) : (
          <Table head={<><Th>Who</Th><Th>Position</Th><Th>Since</Th><Th>Until</Th><Th /></>}>
            {rows.map((s) => (
              <tr key={s.id}>
                <Td>
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-[11px] text-body-soft">{s.email ?? "no email"}</div>
                </Td>
                <Td><Chip tone="slate">{s.position}</Chip></Td>
                <Td>{new Date(s.startedAt).toLocaleString()}</Td>
                <Td>{new Date(s.expiresAt).toLocaleDateString()}</Td>
                <Td right>
                  {/*  You cannot sign yourself out from here. Locking yourself out
                       of the screen that manages access is a mistake worth making
                       impossible rather than recoverable — the sidebar does it.  */}
                  {s.isYou ? (
                    <Chip tone="brand">this device</Chip>
                  ) : (
                    <div className="flex gap-1.5 justify-end">
                      <button className={btnGhost} disabled={busy === s.id}
                              onClick={() => void drop(s)}>Sign out</button>
                      <button className={btnGhost} disabled={busy === s.id}
                              onClick={() => void dropAll(s)}>All devices</button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

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

const STATE: Record<ApiBackups["state"], { tone: keyof typeof TONE; title: string }> = {
  ok: { tone: "emerald", title: "Backups are running" },
  stale: { tone: "amber", title: "No backup in over a day and a half" },
  bad: { tone: "rose", title: "No backup in over a week" },
  never: { tone: "rose", title: "No backup has ever been recorded" },
};

export function BackupScreen() {
  const [b, setB] = useState<ApiBackups | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    getBackups().then(setB).catch((e) => setErr((e as Error).message));
  }, []);

  const meta = b ? STATE[b.state] : null;

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Administration" emoji="⛁" title="Backup & restore"
        sub="The whole business lives in one Docker volume — if it goes, everything goes"
      />
      <Flash ok="" err={err} />

      {b && meta && (
        <div className="mb-5">
          <Banner tone={meta.tone} emoji={b.state === "ok" ? "✓" : "⚠"} title={meta.title}>
            {b.last ? (
              <>
                Last one {b.hoursSince === 0 ? "less than an hour" : `${b.hoursSince} hours`} ago
                {b.last.bytes != null && ` · ${(b.last.bytes / 1024).toFixed(0)} KB`}
                {b.last.file && ` · ${b.last.file}`}
              </>
            ) : (
              <>
                Run <code>radian_backup.bat</code> now, then{" "}
                <code>radian_backup_schedule.bat</code> so it happens nightly
                without anybody remembering to.
              </>
            )}
          </Banner>
        </div>
      )}

      {/*  An empty dump is a file that looks like a backup and restores nothing.
           The .bat deletes those itself, so one appearing here means the check
           was bypassed and the "backup" is a 0-byte lie.  */}
      {b && b.suspicious > 0 && (
        <div className="mb-5">
          <Banner tone="rose" emoji="⚠" title={`${b.suspicious} dumps are suspiciously small`}>
            A dump under 10 KB is almost certainly empty. Run{" "}
            <code>radian_backup_check.bat</code> and look at them.
          </Banner>
        </div>
      )}

      <Panel emoji="▤" title="Recent backups" sub="Read from the audit trail, newest first">
        {!b || b.history.length === 0 ? (
          <div className="p-5"><Empty title="Nothing recorded yet" /></div>
        ) : (
          <Table head={<><Th>When</Th><Th>File</Th><Th right>Size</Th><Th>By</Th></>}>
            {b.history.map((h, i) => (
              <tr key={`${h.file}-${i}`}>
                <Td>{new Date(h.at).toLocaleString()}</Td>
                <Td><code className="text-[11px]">{h.file ?? "—"}</code></Td>
                <Td right>{h.bytes == null ? "—" : `${(h.bytes / 1024).toFixed(0)} KB`}</Td>
                <Td>{h.by}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Card className="p-5 mt-5 max-w-[760px]">
        <h3 className="text-[13.5px] font-bold text-purple mb-2">What this screen cannot tell you</h3>
        <p className="text-[12.5px] text-body leading-relaxed">
          It reads the trail the backup script writes, not the disk. So it knows a
          backup <em>was taken</em> — it does not know the file is still there, or
          that it would restore. Only a restore proves that.
        </p>
        <p className="text-[12.5px] text-body leading-relaxed mt-2">
          Run <code>radian_restore.bat</code> against a copy once, on purpose,
          while nothing is wrong. A backup nobody has ever restored is a guess.
        </p>
      </Card>
    </div>
  );
}

/* ================================================================== *
 *  All settings — a map, not a table
 * ================================================================== */

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

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Administration" emoji="⚙" title="All settings"
        sub="Every module's settings, reachable from one place"
      />
      <Flash ok="" err={err} />

      <div className="mb-5">
        <Card className="p-4 max-w-[760px]">
          <p className="text-[12.5px] text-body leading-relaxed">
            These are <strong>not</strong> gathered into one settings table, and
            they will not be. The VAT rate is a Finance business rule; the POS
            discount ceiling belongs to POS. Merging them would give every module
            a reason to write to a table it does not own.
          </p>
          <p className="text-[12.5px] text-body-soft leading-relaxed mt-2">
            What was missing was a way to find them. The old “Settings” row in the
            sidebar had no link behind it at all.
          </p>
        </Card>
      </div>

      <div className="space-y-4">
        {Object.entries(byOwner).map(([owner, list]) => (
          <Panel key={owner} emoji="▤" title={owner} sub={`${list.length} settings screen${list.length === 1 ? "" : "s"}`}>
            <div className="p-4 grid gap-3 md:grid-cols-2">
              {list.map((r) => (
                <Link key={r.key} href={r.href} className="block">
                  <Card className="p-4 h-full">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[13px] font-bold text-purple">{r.label}</span>
                      {/*  Counted from the real row, so this cannot claim a module
                           is set up when nobody has been near it.  */}
                      <Chip tone={r.exists ? "emerald" : "slate"}>
                        {r.exists ? "in use" : "untouched"}
                      </Chip>
                    </div>
                    <p className="text-[12px] text-body leading-relaxed">{r.what}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
