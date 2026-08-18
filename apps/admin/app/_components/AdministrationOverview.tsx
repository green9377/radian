"use client";

/*
  ADMINISTRATION — overview as a DASHBOARD, not an essay.

  Owner, 18 Aug 2026: "overview kkhno text hoy na. data diye visually design
  akare sundor kre sajabe" — and, same day: "brand color flow kre colorfull
  way te design kro". So: every element is a live number or a live list, and
  the page runs the brand palette — deep purple through orchid and pink to
  lavender and rose gold — one family per section, never grey-on-white.

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
import { Banner, Card, Chip, WRAP } from "./FinanceUI";
import Icon from "./Icon";

/*  The brand family, one hue per section — same idea as the sidebar accents.
    soft = card wash · text = numbers and icons · grad = chips and bars  */
const B = {
  purple:   { soft: "#f5eafb", text: "#7a2ea8", grad: "linear-gradient(135deg,#8a2bb0,#cf43ea)" },
  orchid:   { soft: "#fbeafb", text: "#a021b8", grad: "linear-gradient(135deg,#a021b8,#e07be0)" },
  pink:     { soft: "#fdeef7", text: "#c2419a", grad: "linear-gradient(135deg,#c2419a,#f08bc7)" },
  lavender: { soft: "#f1edfb", text: "#6d5bb8", grad: "linear-gradient(135deg,#6d5bb8,#a794e8)" },
  rosegold: { soft: "#fbf0ec", text: "#b76e79", grad: "linear-gradient(135deg,#b76e79,#e0a8a0)" },
  emerald:  { soft: "#e6f7ef", text: "#12a172", grad: "linear-gradient(135deg,#12a172,#5ec9a8)" },
  amber:    { soft: "#fdf3e2", text: "#b07818", grad: "linear-gradient(135deg,#d99a2b,#e9c46a)" },
  rose:     { soft: "#fdecea", text: "#c0392b", grad: "linear-gradient(135deg,#c0392b,#e87a6e)" },
} as const;
type Hue = keyof typeof B;

/* ── the eight doors — names only, each in its own brand hue ──────────── */
const DOORS: { label: string; href: string; icon: string; hue: Hue }[] = [
  { label: "Access control", href: "/administration/access", icon: "shield", hue: "purple" },
  { label: "People & accounts", href: "/settings/people", icon: "users", hue: "orchid" },
  { label: "Activity & audit", href: "/settings/audit", icon: "search", hue: "lavender" },
  { label: "Company", href: "/administration/company", icon: "store", hue: "rosegold" },
  { label: "All settings", href: "/administration/settings", icon: "gear", hue: "pink" },
  { label: "Backups", href: "/administration/backup", icon: "download", hue: "emerald" },
  { label: "Sessions", href: "/administration/sessions", icon: "eye", hue: "lavender" },
  { label: "Integrations", href: "/administration/integrations", icon: "bolt", hue: "purple" },
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

  const backupHue: Hue =
    backups?.state === "ok" ? "emerald" : backups?.state === "stale" ? "amber" : "rose";
  const backupWord =
    backups == null ? "…"
    : backups.state === "never" ? "Never run"
    : `${backups.hoursSince}h ago`;

  return (
    <div className={WRAP}>
      {/* ── hero — the brand itself, purple flowing into rose gold ───── */}
      <div className="rounded-[22px] px-6 py-6 mb-5 relative overflow-hidden"
        style={{ background: "linear-gradient(120deg,#470066 0%,#8a2bb0 42%,#cf43ea 74%,#b76e79 100%)" }}>
        <div className="absolute -right-10 -top-14 w-[220px] h-[220px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle,#fff,transparent 70%)" }} />
        <div className="flex items-center gap-3.5 relative">
          <span className="w-[44px] h-[44px] rounded-[14px] grid place-items-center text-white shrink-0"
            style={{ background: "rgba(255,255,255,0.16)", backdropFilter: "blur(4px)" }}>
            <Icon name="shield" size={22} strokeWidth={2.2} />
          </span>
          <div>
            <div className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-white/70">Setup · Administration</div>
            <h1 className="font-display text-[26px] text-white leading-tight m-0">Administration</h1>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-2">
            {sessions?.slice(0, 4).map((s) => (
              <span key={s.id} title={s.name}
                className="w-[30px] h-[30px] rounded-full grid place-items-center text-[12px] font-bold text-purple bg-white shadow-soft -ml-1 first:ml-0">
                {s.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
            {sessions && <span className="text-white/85 text-[12.5px] font-semibold ml-1">{sessions.length} online</span>}
          </div>
        </div>
      </div>

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
            right={<Link href="/administration/access" className="text-[12.5px] font-bold text-white px-3.5 py-2 rounded-[10px]" style={{ background: B.rose.grad }}>Decide now</Link>}
          >
            A new screen is handed to no one until you say so — safe, but these are waiting.
          </Banner>
        </div>
      )}

      {/* ── row 1 · four numbers, four brand hues ────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-4">
        <Tile hue="purple" icon="users" label="People with access"
          value={people ? String(active.length) : "—"}
          foot={people ? `${pendingInvites.length} invite${pendingInvites.length === 1 ? "" : "s"} pending · ${noPin.length} without a PIN` : "loading"}
          href="/settings/people" />
        <Tile hue="orchid" icon="eye" label="Signed in now"
          value={sessions ? String(sessions.length) : "—"}
          foot={sessions?.length ? sessions.slice(0, 2).map((s) => s.name).join(" · ") + (sessions.length > 2 ? " …" : "") : "nobody"}
          href="/administration/sessions" />
        <Tile hue="pink" icon="shield" label="Positions (templates)"
          value={positions ? String(positions.length) : "—"}
          foot={positions ? `${positions.reduce((n, p) => n + p.rules, 0)} explicit rules stored` : "loading"}
          href="/administration/access" />
        <Tile hue={backupHue} icon="download" label="Last backup"
          value={backupWord}
          foot={backups ? `${backups.count} kept${backups.suspicious ? ` · ${backups.suspicious} suspicious` : ""}` : "loading"}
          href="/administration/backup" />
      </div>

      {/* ── row 2 · access health (purple) + company (rose gold) ─────── */}
      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <Section hue="purple" icon="shield" title="Access — what the silent guard saw"
          sub="It blocks nobody yet; it writes down who it WOULD have refused">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <MiniStat hue={guard ? (guard.rows.length ? "amber" : "emerald") : "lavender"}
              value={guard ? String(guard.rows.length) : "—"} label="would have been refused" />
            <MiniStat hue={guard ? (guard.unjudged.length ? "rose" : "emerald") : "lavender"}
              value={guard ? String(guard.unjudged.length) : "—"} label="routes the guard cannot judge" />
          </div>
          {guard && guard.rows.length === 0 && guard.unjudged.length === 0 && (
            <p className="text-[12.5px] text-body-soft m-0">
              Clean sheet — and because unjudged is zero, the empty list means the ticks
              match reality, not that nobody was looking.
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
              {guard.rows.length > 4 && <div className="text-[11.5px] text-body-soft">+{guard.rows.length - 4} more</div>}
            </div>
          )}
          {guard && guard.unjudged.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {guard.unjudged.map((u) => <Chip key={u} tone="rose">/{u}</Chip>)}
            </div>
          )}
        </Section>

        <Section hue="rosegold" icon="store" title="Company papers"
          sub="What Mushak 6.3 and the gateways need to exist">
          {company == null ? (
            <p className="text-[12.5px] text-body-soft m-0">—</p>
          ) : company.ready ? (
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-bold text-white px-3 py-1.5 rounded-full" style={{ background: B.emerald.grad }}>Ready</span>
              <span className="text-[13px] text-body">Everything the challan needs is filled.</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-2.5">
                <span className="text-[12px] font-bold text-white px-3 py-1.5 rounded-full" style={{ background: B.amber.grad }}>
                  {company.missing.length} missing
                </span>
                <span className="text-[12.5px] text-body-soft">the VAT challan refuses to print until these exist</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {company.missing.map((m) => (
                  <Link key={m} href="/administration/company">
                    <span className="inline-block text-[11.5px] font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: B.rosegold.soft, color: B.rosegold.text }}>{m}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
          {company?.licence && (
            <div className="mt-3 pt-3 border-t border-[#f6e9e4] flex items-center gap-2 text-[12.5px]">
              <span className="text-body-soft">Trade licence</span>
              <span className="text-[11.5px] font-bold px-2.5 py-1 rounded-full"
                style={{
                  background: B[company.licence.daysLeft < 30 ? "rose" : company.licence.daysLeft < 90 ? "amber" : "emerald"].soft,
                  color: B[company.licence.daysLeft < 30 ? "rose" : company.licence.daysLeft < 90 ? "amber" : "emerald"].text,
                }}>
                {company.licence.daysLeft} days left
              </span>
            </div>
          )}
        </Section>
      </div>

      {/* ── row 3 · integrations (orchid) + sessions (lavender) ──────── */}
      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <Section hue="orchid" icon="bolt"
          title={`Integrations — ${connected.length} of ${services.length || "…"} connected`}
          sub={`${liveKeys.length} live · ${connected.length - liveKeys.length} sandbox`}>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {services.length === 0 && <span className="text-[12.5px] text-body-soft">—</span>}
            {services.map((s) => (
              <Link key={s.kind + s.provider} href="/administration/integrations"
                className="flex items-center gap-2 rounded-[10px] px-2.5 py-2 transition-colors"
                style={{ background: s.isEnabled ? B.orchid.soft : "#faf8fc" }}>
                <span className="w-[9px] h-[9px] rounded-full shrink-0"
                  style={{ background: s.isEnabled ? (s.isLive ? B.emerald.text : B.amber.text) : "#d8d2e2" }} />
                <span className="text-[12.5px] font-medium text-body truncate">{s.label}</span>
                <span className="ml-auto text-[10.5px] font-bold uppercase tracking-wide shrink-0"
                  style={{ color: s.isEnabled ? (s.isLive ? B.emerald.text : B.amber.text) : "#a99fbb" }}>
                  {s.isEnabled ? (s.isLive ? "live" : "sandbox") : "off"}
                </span>
              </Link>
            ))}
          </div>
        </Section>

        <Section hue="lavender" icon="eye" title="Signed in right now"
          sub="Every open session; sign any of them out from the Sessions screen">
          <div className="space-y-1.5">
            {sessions == null && <span className="text-[12.5px] text-body-soft">—</span>}
            {sessions?.length === 0 && <span className="text-[12.5px] text-body-soft">Nobody is signed in.</span>}
            {sessions?.slice(0, 6).map((s) => (
              <div key={s.id} className="flex items-center gap-2.5 text-[13px] rounded-[10px] px-2 py-1.5"
                style={{ background: s.isYou ? B.lavender.soft : undefined }}>
                <span className="w-[27px] h-[27px] rounded-full grid place-items-center text-[11px] font-bold text-white shrink-0"
                  style={{ background: B.lavender.grad }}>
                  {s.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="font-medium text-body truncate">{s.name}</span>
                {s.isYou && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: B.lavender.grad }}>you</span>}
                <span className="text-body-soft text-[11.5px] ml-auto shrink-0">{s.position} · {ago(s.startedAt)}</span>
              </div>
            ))}
            {(sessions?.length ?? 0) > 6 && (
              <div className="text-[11.5px] text-body-soft">+{sessions!.length - 6} more</div>
            )}
          </div>
        </Section>
      </div>

      {/* ── row 4 · settings coverage (pink) + doors (purple) ────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section hue="pink" icon="gear"
          title={`Module settings — ${touched.length} of ${settings?.length ?? "…"} touched`}
          sub="Untouched means the module still runs on its defaults">
          <div className="h-[9px] rounded-full overflow-hidden mb-3" style={{ background: B.pink.soft }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: settings?.length ? `${(touched.length / settings.length) * 100}%` : 0, background: B.pink.grad }} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {settings?.map((s) => (
              <Link key={s.key} href={s.href}>
                <span className="inline-block text-[11.5px] font-semibold px-2.5 py-1 rounded-full transition-colors"
                  style={s.exists
                    ? { background: B.emerald.soft, color: B.emerald.text }
                    : { background: "#f4f1f8", color: "#a99fbb" }}>
                  {s.label}
                </span>
              </Link>
            ))}
          </div>
        </Section>

        <Section hue="purple" icon="grid" title="Everything in this module" sub="Eight screens, one click each">
          <div className="grid grid-cols-2 gap-2">
            {DOORS.map((d) => (
              <Link key={d.href + d.label} href={d.href}
                className="flex items-center gap-2.5 rounded-[12px] px-3 py-2.5 transition-transform hover:-translate-y-[1px]"
                style={{ background: B[d.hue].soft }}>
                <span className="w-[26px] h-[26px] rounded-[8px] grid place-items-center text-white shrink-0"
                  style={{ background: B[d.hue].grad }}>
                  <Icon name={d.icon} size={14} strokeWidth={2.3} />
                </span>
                <span className="text-[13px] font-semibold" style={{ color: B[d.hue].text }}>{d.label}</span>
              </Link>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────── */

function Tile({ hue, icon, label, value, foot, href }: {
  hue: Hue; icon: string; label: string; value: string; foot: string; href: string;
}) {
  return (
    <Link href={href} className="block group">
      <div className="rounded-[18px] p-4 h-full bg-white border transition-all group-hover:-translate-y-[2px] group-hover:shadow-lg"
        style={{ borderColor: `${B[hue].text}22`, boxShadow: `0 2px 10px ${B[hue].text}14` }}>
        <div className="flex items-center gap-2.5 mb-2.5">
          <span className="w-[32px] h-[32px] rounded-[10px] grid place-items-center text-white"
            style={{ background: B[hue].grad, boxShadow: `0 3px 10px ${B[hue].text}45` }}>
            <Icon name={icon} size={16} strokeWidth={2.2} />
          </span>
          <span className="text-[11.5px] font-bold text-body-soft">{label}</span>
        </div>
        <div className="text-[28px] font-bold leading-tight" style={{ color: B[hue].text }}>{value}</div>
        <div className="text-[11px] text-body-soft mt-1 truncate">{foot}</div>
      </div>
    </Link>
  );
}

function Section({ hue, icon, title, sub, children }: {
  hue: Hue; icon: string; title: string; sub: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-[18px] bg-white border overflow-hidden"
      style={{ borderColor: `${B[hue].text}1f`, boxShadow: `0 2px 10px ${B[hue].text}10` }}>
      <div className="flex items-center gap-3 px-4 py-3"
        style={{ background: `linear-gradient(100deg, ${B[hue].soft}, #ffffff 85%)` }}>
        <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center text-white shrink-0"
          style={{ background: B[hue].grad, boxShadow: `0 3px 9px ${B[hue].text}40` }}>
          <Icon name={icon} size={15} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-bold leading-tight" style={{ color: B[hue].text }}>{title}</div>
          <div className="text-[11.5px] text-body-soft truncate">{sub}</div>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function MiniStat({ hue, value, label }: { hue: Hue; value: string; label: string }) {
  return (
    <div className="rounded-[13px] p-3" style={{ background: B[hue].soft }}>
      <div className="text-[23px] font-bold leading-none" style={{ color: B[hue].text }}>{value}</div>
      <div className="text-[11px] font-semibold mt-1" style={{ color: B[hue].text }}>{label}</div>
    </div>
  );
}

/**
 * Placeholder pages for screens that are not built yet — a stub HAS no data,
 * so honest prose is exactly right here.
 */
const SOON: Record<string, { label: string; what: string }> = {};

export function AdminSoon({ slug }: { slug: string }) {
  const part = SOON[slug];
  return (
    <div className={WRAP}>
      <div className="rounded-[18px] px-6 py-5 mb-5"
        style={{ background: "linear-gradient(120deg,#470066,#8a2bb0 60%,#cf43ea)" }}>
        <div className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-white/70">Administration</div>
        <h1 className="font-display text-[24px] text-white leading-tight m-0">{part?.label ?? "Not built yet"}</h1>
      </div>
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
