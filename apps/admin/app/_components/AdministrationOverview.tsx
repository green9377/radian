"use client";

/*
  ADMINISTRATION — overview as a DASHBOARD, not an essay.

  Owner, 18 Aug 2026: "overview kkhno text hoy na. data diye visually design
  akare sundor kre sajabe." The previous version was eight paragraph-cards
  describing what each screen does — documentation wearing a dashboard's
  clothes. Everything below is a live number or a live list, and every tile
  is a door to the screen that owns it.

  Data on this page, and where it comes from:
    people + invites        GET /administration/people
    positions               GET /administration/positions
    signed-in sessions      GET /administration/sessions
    undecided screens       GET /administration/registry/undecided
    silent-guard report     GET /administration/would-block   (rows + unjudged)
    company readiness       GET /administration/company/readiness
    backups                 GET /administration/backups
    integrations            GET /administration/integrations
    settings coverage       GET /administration/settings-map

  Every call fails soft to an honest zero-state — never to invented rows.
*/

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getBackups, getCompanyReadiness, getIntegrations, getSettingsMap,
  getUndecidedNodes, getWouldBlock, listPeople, listPositions, listSessions,
  type ApiBackups, type ApiCompanyReadiness, type ApiIntegrationsOverview,
  type ApiPerson, type ApiPosition, type ApiSession, type ApiSettingsEntry,
  type ApiUndecided, type ApiWouldBlockReport,
} from "../_data/api";
import { Banner, Card, Chip, FinHeader, Panel, TONE, WRAP } from "./FinanceUI";
import Icon from "./Icon";

/* ── the eight doors, as chips — names only, no prose ─────────────────── */
const DOORS: { label: string; href: string; icon: string }[] = [
  { label: "Access control", href: "/administration/access", icon: "shield" },
  { label: "People & accounts", href: "/settings/people", icon: "users" },
  { label: "Activity & audit", href: "/settings/audit", icon: "search" },
  { label: "Company", href: "/administration/company", icon: "store" },
  { label: "All settings", href: "/administration/settings", icon: "gear" },
  { label: "Backups", href: "/administration/backup", icon: "download" },
  { label: "Sessions", href: "/administration/sessions", icon: "eye" },
  { label: "Integrations", href: "/administration/integrations", icon: "bolt" },
];

const ago = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
};

export default function AdministrationOverview() {
  const [people, setPeople] = useState<ApiPerson[] | null>(null);
  const [positions, setPositions] = useState<ApiPosition[] | null>(null);
  const [sessions, setSessions] = useState<ApiSession[] | null>(null);
  const [undecided, setUndecided] = useState<ApiUndecided[] | null>(null);
  const [guard, setGuard] = useState<ApiWouldBlockReport | null>(null);
  const [company, setCompany] = useState<ApiCompanyReadiness | null>(null);
  const [backups, setBackups] = useState<ApiBackups | null>(null);
  const [ints, setInts] = useState<ApiIntegrationsOverview | null>(null);
  const [settings, setSettings] = useState<ApiSettingsEntry[] | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const soft = <T,>(p: Promise<T>, set: (v: T) => void) =>
      p.then(set).catch(() => setOffline(true));
    soft(listPeople(), setPeople);
    soft(listPositions(), setPositions);
    soft(listSessions(), setSessions);
    soft(getUndecidedNodes(), setUndecided);
    soft(getWouldBlock(), setGuard);
    soft(getCompanyReadiness(), setCompany);
    soft(getBackups(), setBackups);
    soft(getIntegrations(), setInts);
    soft(getSettingsMap(), setSettings);
  }, []);

  const active = people?.filter((p) => p.isActive) ?? [];
  const pendingInvites = people?.filter((p) => p.pending?.kind === "INVITE") ?? [];
  const noPin = active.filter((p) => !p.hasPin);
  const services = ints?.groups.flatMap((g) => g.services) ?? [];
  const connected = services.filter((s) => s.isEnabled);
  const liveKeys = connected.filter((s) => s.isLive);
  const touched = settings?.filter((s) => s.exists) ?? [];

  const backupTone =
    backups?.state === "ok" ? "emerald" : backups?.state === "stale" ? "amber" : "rose";
  const backupWord =
    backups == null ? "…"
    : backups.state === "never" ? "Never run"
    : backups.state === "ok" ? `${backups.hoursSince}h ago`
    : backups.state === "stale" ? `${backups.hoursSince}h ago`
    : "Failing";

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Administration"
        emoji="⚙"
        title="Administration"
        sub="Who gets in, what they reach, and whether the company itself is in order"
      />

      {offline && (
        <div className="mb-5">
          <Banner tone="amber" emoji="⚠" title="Not reaching the API">
            Tiles that could not load show a dash — nothing on this page is invented.
          </Banner>
        </div>
      )}

      {(undecided?.length ?? 0) > 0 && (
        <div className="mb-5">
          <Banner
            tone="rose" emoji="⚠"
            title={`${undecided!.length} new screens reach nobody yet`}
            right={<Link href="/administration/access" className="text-[12.5px] font-bold text-white bg-[#c0392b] px-3.5 py-2 rounded-[10px]">Decide now</Link>}
          >
            A new screen is handed to no one until you say so — safe, but these are waiting.
          </Banner>
        </div>
      )}

      {/* ── row 1 · the four numbers that matter ─────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-4">
        <Tile
          tone="brand" icon="users" label="People with access"
          value={people ? String(active.length) : "—"}
          foot={people ? `${pendingInvites.length} invite${pendingInvites.length === 1 ? "" : "s"} pending · ${noPin.length} without a PIN` : "loading"}
          href="/settings/people"
        />
        <Tile
          tone="sky" icon="eye" label="Signed in now"
          value={sessions ? String(sessions.length) : "—"}
          foot={sessions?.length ? sessions.slice(0, 2).map((s) => s.name).join(" · ") + (sessions.length > 2 ? " …" : "") : "nobody"}
          href="/administration/sessions"
        />
        <Tile
          tone="emerald" icon="shield" label="Positions (templates)"
          value={positions ? String(positions.length) : "—"}
          foot={positions ? `${positions.reduce((n, p) => n + p.rules, 0)} explicit rules stored` : "loading"}
          href="/administration/access"
        />
        <Tile
          tone={backupTone} icon="download" label="Last backup"
          value={backupWord}
          foot={backups ? `${backups.count} kept${backups.suspicious ? ` · ${backups.suspicious} suspicious` : ""}` : "loading"}
          href="/administration/backup"
        />
      </div>

      {/* ── row 2 · access health + company ──────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <Panel emoji="🛡" title="Access — what the silent guard saw"
          sub="It blocks nobody yet; it writes down who it WOULD have refused">
          <div className="p-4">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <MiniStat
                tone={guard ? (guard.rows.length ? "amber" : "emerald") : "slate"}
                value={guard ? String(guard.rows.length) : "—"}
                label="would have been refused"
              />
              <MiniStat
                tone={guard ? (guard.unjudged.length ? "rose" : "emerald") : "slate"}
                value={guard ? String(guard.unjudged.length) : "—"}
                label="routes the guard cannot judge"
              />
            </div>
            {guard && guard.rows.length === 0 && guard.unjudged.length === 0 && (
              <p className="text-[12.5px] text-body-soft m-0">
                Clean sheet — and because unjudged is zero, the empty list means the ticks
                match reality, not that nobody was looking. Enforcement can be considered.
              </p>
            )}
            {guard && guard.rows.length > 0 && (
              <div className="space-y-1.5">
                {guard.rows.slice(0, 4).map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12.5px]">
                    <Chip tone="amber">{r.who}</Chip>
                    <span className="font-mono text-[11.5px] text-body truncate">{r.method} {r.path}</span>
                    <span className="text-body-soft ml-auto shrink-0">{ago(r.at)}</span>
                  </div>
                ))}
                {guard.rows.length > 4 && (
                  <div className="text-[11.5px] text-body-soft">+{guard.rows.length - 4} more</div>
                )}
              </div>
            )}
            {guard && guard.unjudged.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {guard.unjudged.map((u) => <Chip key={u} tone="rose">/{u}</Chip>)}
              </div>
            )}
          </div>
        </Panel>

        <Panel emoji="🏢" title="Company papers"
          sub="What Mushak 6.3 and the gateways need to exist">
          <div className="p-4">
            {company == null ? (
              <p className="text-[12.5px] text-body-soft m-0">—</p>
            ) : company.ready ? (
              <div className="flex items-center gap-3">
                <Chip tone="emerald">Ready</Chip>
                <span className="text-[13px] text-body">
                  Everything the challan needs is filled.
                </span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-2.5">
                  <Chip tone="amber">{company.missing.length} missing</Chip>
                  <span className="text-[12.5px] text-body-soft">the VAT challan refuses to print until these exist</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {company.missing.map((m) => (
                    <Link key={m} href="/administration/company">
                      <Chip tone="slate">{m}</Chip>
                    </Link>
                  ))}
                </div>
              </>
            )}
            {company?.licence && (
              <div className="mt-3 pt-3 border-t border-[#f0edf5] flex items-center gap-2 text-[12.5px]">
                <span className="text-body-soft">Trade licence</span>
                <Chip tone={company.licence.daysLeft < 30 ? "rose" : company.licence.daysLeft < 90 ? "amber" : "emerald"}>
                  {company.licence.daysLeft} days left
                </Chip>
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* ── row 3 · integrations + sessions ──────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <Panel emoji="🔌" title={`Integrations — ${connected.length} of ${services.length || "…"} connected`}
          sub={`${liveKeys.length} live · ${connected.length - liveKeys.length} sandbox`}>
          <div className="p-4 grid gap-1.5 sm:grid-cols-2">
            {services.length === 0 && <span className="text-[12.5px] text-body-soft">—</span>}
            {services.map((s) => (
              <Link key={s.kind + s.provider} href="/administration/integrations"
                className="flex items-center gap-2 rounded-[9px] px-2 py-1.5 hover:bg-[#faf7fd]">
                <span className="w-[9px] h-[9px] rounded-full shrink-0"
                  style={{ background: s.isEnabled ? (s.isLive ? "#12a172" : "#e2a63d") : "#d8d2e2" }} />
                <span className="text-[12.5px] font-medium text-body truncate">{s.label}</span>
                <span className="ml-auto text-[10.5px] font-bold uppercase tracking-wide shrink-0"
                  style={{ color: s.isEnabled ? (s.isLive ? "#12a172" : "#b07818") : "#a99fbb" }}>
                  {s.isEnabled ? (s.isLive ? "live" : "sandbox") : "off"}
                </span>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel emoji="👁" title="Signed in right now" sub="Every open session; sign any of them out from the Sessions screen">
          <div className="p-4 space-y-1.5">
            {sessions == null && <span className="text-[12.5px] text-body-soft">—</span>}
            {sessions?.length === 0 && <span className="text-[12.5px] text-body-soft">Nobody is signed in.</span>}
            {sessions?.slice(0, 6).map((s) => (
              <div key={s.id} className="flex items-center gap-2.5 text-[13px]">
                <span className="w-[26px] h-[26px] rounded-full grid place-items-center text-[11px] font-bold text-white shrink-0"
                  style={{ background: TONE.brand.grad }}>
                  {s.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="font-medium text-body truncate">{s.name}</span>
                {s.isYou && <Chip tone="brand">you</Chip>}
                <span className="text-body-soft text-[11.5px] ml-auto shrink-0">{s.position} · {ago(s.startedAt)}</span>
              </div>
            ))}
            {(sessions?.length ?? 0) > 6 && (
              <div className="text-[11.5px] text-body-soft">+{sessions!.length - 6} more</div>
            )}
          </div>
        </Panel>
      </div>

      {/* ── row 4 · settings coverage + doors ────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel emoji="🎚" title={`Module settings — ${touched.length} of ${settings?.length ?? "…"} touched`}
          sub="Untouched means the module still runs on its defaults">
          <div className="p-4">
            <div className="h-[8px] rounded-full bg-[#f0ebf7] overflow-hidden mb-3">
              <div className="h-full rounded-full transition-all"
                style={{ width: settings?.length ? `${(touched.length / settings.length) * 100}%` : 0, background: TONE.brand.grad }} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {settings?.map((s) => (
                <Link key={s.key} href={s.href}>
                  <Chip tone={s.exists ? "emerald" : "slate"}>{s.label}</Chip>
                </Link>
              ))}
            </div>
          </div>
        </Panel>

        <Panel emoji="🚪" title="Everything in this module" sub="Eight screens, one click each">
          <div className="p-4 grid grid-cols-2 gap-2">
            {DOORS.map((d) => (
              <Link key={d.href} href={d.href}
                className="flex items-center gap-2.5 rounded-[11px] border border-[#eee8f5] px-3 py-2.5 hover:border-orchid hover:bg-[#fdfaff] transition-colors">
                <span className="text-purple"><Icon name={d.icon} size={16} strokeWidth={2.2} /></span>
                <span className="text-[13px] font-semibold text-purple">{d.label}</span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────── */

function Tile({ tone, icon, label, value, foot, href }: {
  tone: keyof typeof TONE; icon: string; label: string; value: string; foot: string; href: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="p-4 h-full hover:shadow-md transition-shadow">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center"
            style={{ background: TONE[tone].soft, color: TONE[tone].text }}>
            <Icon name={icon} size={16} strokeWidth={2.2} />
          </span>
          <span className="text-[11.5px] font-semibold text-body-soft">{label}</span>
        </div>
        <div className="text-[27px] font-bold leading-tight" style={{ color: TONE[tone].text }}>{value}</div>
        <div className="text-[11px] text-body-soft mt-0.5 truncate">{foot}</div>
      </Card>
    </Link>
  );
}

function MiniStat({ tone, value, label }: { tone: keyof typeof TONE; value: string; label: string }) {
  return (
    <div className="rounded-[12px] p-3" style={{ background: TONE[tone].soft }}>
      <div className="text-[22px] font-bold leading-none" style={{ color: TONE[tone].text }}>{value}</div>
      <div className="text-[11px] font-medium mt-1" style={{ color: TONE[tone].text }}>{label}</div>
    </div>
  );
}

/**
 * The screens that are not built yet — still honest prose, because a stub HAS
 * no data to show. Only the overview stopped being text; a placeholder page
 * explaining itself is exactly what a placeholder should do.
 */
const SOON: Record<string, { label: string; what: string; why: string }> = {};

export function AdminSoon({ slug }: { slug: string }) {
  const part = SOON[slug];
  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Administration" emoji="⚙"
        title={part?.label ?? "Not built yet"}
        sub="This page says what it will hold and why"
      />
      <Card className="p-6 max-w-3xl">
        <Chip tone="slate">Queued</Chip>
        <p className="text-[13px] text-body leading-relaxed mt-3">
          {part?.what ?? "This screen is planned but not built. It will say so here the day it exists."}
        </p>
        <div className="mt-5 pt-4 border-t border-[#f0edf5]">
          <Link href="/administration" className="text-[12.5px] text-purple font-semibold">
            ← Back to Administration
          </Link>
        </div>
      </Card>
    </div>
  );
}
