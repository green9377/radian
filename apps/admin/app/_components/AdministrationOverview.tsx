"use client";

/*
  ADMINISTRATION — the module overview, and the honest placeholders behind it.
  RADIAN_ADMINISTRATION_MODULE_ARCHITECTURE.md, 30 Jul 2026

  This module took over the old "Settings" row, which had no href at all — a
  menu entry that did nothing when clicked, and had been there since the first
  build.

  Every card below says what it IS and what it is NOT yet. A stub that looks
  finished is worse than no stub: the shop plans around a screen that cannot
  do the thing it appears to do. So the ones that are not built say so, in
  their own words, and say what has to happen first.

  ⚠️ UI text is ENGLISH — Bangla is for talking to the owner, never for the
  screen. The first cut of this file got that wrong throughout, and the
  screenshot that came back said FINANCE at the top too, because FinHeader
  defaults its eyebrow to "Finance" and nobody had passed one.
*/

import Link from "next/link";
import { useEffect, useState } from "react";
import { getUndecidedNodes, listPositions, type ApiPosition, type ApiUndecided } from "../_data/api";
import { Banner, Card, Chip, FinHeader, Panel, TONE, WRAP, btnPrimary, btnPrimaryStyle } from "./FinanceUI";

type State = "live" | "next" | "queued";

const PARTS: {
  slug: string; label: string; state: State; what: string; why: string; href?: string;
}[] = [
  {
    slug: "access", label: "Access control", state: "live",
    what: "Every module and screen in one list. Create positions, name them yourself, and tick what each one can see.",
    why: "This answer used to live in three places — 73 @Roles decorators, 10 hand-written ifs, and 11 rules out of 159 screens in the sidebar. Nobody reconciled them.",
  },
  {
    slug: "people", label: "People & accounts", state: "live", href: "/settings/people",
    what: "Working today: add people, set a role, deactivate. Coming: invite by email, let them set their own password, reset a PIN.",
    why: "An invite goes to the email, the person chooses their own password, and forgets are fixed by email. ⚠️ The PIN will NOT travel that path — whoever holds the inbox would inherit the power to move money.",
  },
  {
    slug: "audit", label: "Activity & audit", state: "live", href: "/settings/audit",
    what: "Search by order number or name, filter by who and when, and click any row for everything that ever happened to that one record.",
    why: "The trail has been filling since the first module. The endpoints for search and per-record history existed and nothing called them — so the answer was there with no way to reach it.",
  },
  {
    slug: "company", label: "Company settings", state: "live",
    what: "Trade licence and its expiry · BIN · TIN · logo · address · the phone and email that get printed.",
    why: "This is what Mushak 6.3 was waiting for — the fields existed inside FinanceSetting with no screen in front of them. Anything already typed there was carried across, and the challan still falls back to the old columns per field, so a working challan cannot be broken by this.",
  },
  {
    slug: "settings", label: "All settings", state: "live",
    what: "One screen that reaches the settings of all eleven modules, and says which have actually been touched.",
    why: "⚠️ They will NOT be merged into one table — the VAT rate is a Finance business rule and the POS discount ceiling belongs to POS. One door, not one table.",
  },
  {
    slug: "backup", label: "Backup & restore", state: "live",
    what: "When the last backup ran, how big it was, and a verdict on whether the routine is still alive.",
    why: "Read from the audit trail the backup script has been writing all along — the API cannot see the backups folder and does not need to. ⚠️ It knows a backup was TAKEN, not that it would restore. Only a restore proves that.",
  },
  {
    slug: "sessions", label: "Signed in now", state: "live",
    what: "Who is signed in, since when, and signing one device — or all of them — out remotely.",
    why: "Needed the day a phone is lost or somebody leaves. AppSession has held this since the first build with nothing reading it.",
  },
  {
    slug: "integrations", label: "Integrations & keys", state: "live",
    what: "Split by what they do: payment gateways in one place, couriers in another. Keys, sandbox-vs-live, and whether checkout can actually take money.",
    why: "One flat list makes \"this moves money\" and \"this moves a parcel\" look identical. ⚠️ Secrets are shown masked and never returned in full, and WhatsApp/pixel keys are LINKED not copied — they belong to Marketing.",
  },
];

const STATE_META: Record<State, { label: string; tone: keyof typeof TONE }> = {
  live: { label: "Working", tone: "emerald" },
  next: { label: "Next", tone: "amber" },
  queued: { label: "Queued", tone: "slate" },
};

export default function AdministrationOverview() {
  const [positions, setPositions] = useState<ApiPosition[]>([]);
  const [undecided, setUndecided] = useState<ApiUndecided[]>([]);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    Promise.all([listPositions(), getUndecidedNodes()])
      .then(([p, u]) => { setPositions(p); setUndecided(u); })
      .catch(() => setOffline(true));
  }, []);

  const people = positions.reduce((n, p) => n + p.people, 0);

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Administration"
        emoji="⚙"
        title="Administration"
        sub="Control of the whole business in one place — what exists, who sees what, and who the company itself is"
      />

      {offline && (
        <div className="mb-5">
          <Banner tone="amber" emoji="⚠" title="Not reaching the API">
            The cards below still read correctly, but the counts are not live.
          </Banner>
        </div>
      )}

      {undecided.length > 0 && (
        <div className="mb-5">
          <Banner
            tone="rose" emoji="⚠"
            title={`${undecided.length} screens have arrived and reach nobody yet`}
            right={
              <Link href="/administration/access" className={btnPrimary} style={btnPrimaryStyle}>
                Decide
              </Link>
            }
          >
            A new screen is given to no one until you say so. Safe by default —
            but never silent.
          </Banner>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Stat label="Positions" value={positions.length} note="named by you" />
        <Stat label="People" value={people} note="login accounts — not the headcount" />
        <Stat
          label="Undecided screens" value={undecided.length}
          note="reaching nobody yet"
          tone={undecided.length ? "rose" : "emerald"}
        />
      </div>

      <Panel
        emoji="▤"
        title="What is in this module"
        sub="Anything not built yet says so, and says why"
      >
        <div className="p-4 grid gap-3 md:grid-cols-2">
          {PARTS.map((p) => {
            const meta = STATE_META[p.state];
            const live = p.state === "live";
            const body = (
              <Card className="p-4 h-full" style={{ borderColor: live ? TONE.brand.ring : undefined }}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[13.5px] font-bold text-purple">{p.label}</span>
                  <Chip tone={meta.tone}>{meta.label}</Chip>
                </div>
                <p className="text-[12.5px] text-body leading-relaxed">{p.what}</p>
                <p className="text-[11.5px] text-body-soft leading-relaxed mt-2">{p.why}</p>
              </Card>
            );
            return live ? (
              <Link key={p.slug} href={p.href ?? `/administration/${p.slug}`} className="block">
                {body}
              </Link>
            ) : (
              <div key={p.slug}>{body}</div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function Stat({
  label, value, note, tone = "brand",
}: { label: string; value: number; note: string; tone?: keyof typeof TONE }) {
  return (
    <Card className="p-4">
      <div className="text-[11.5px] font-semibold text-body-soft">{label}</div>
      <div className="text-[26px] font-bold leading-tight" style={{ color: TONE[tone].text }}>
        {value}
      </div>
      <div className="text-[11px] text-body-soft mt-0.5">{note}</div>
    </Card>
  );
}

/**
 * The screens that are not built yet. Deliberately not blank: what is coming,
 * why it is not here, and what has to happen first. "Coming soon" on its own
 * means that in six months nobody can remember what was meant to come.
 */
export function AdminSoon({ slug }: { slug: string }) {
  const part = PARTS.find((p) => p.slug === slug);
  if (!part) return null;
  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Administration"
        emoji="⚙"
        title={part.label}
        sub="Not built yet — this page says what it will hold and why"
      />
      <Card className="p-6 max-w-3xl">
        <Chip tone={STATE_META[part.state].tone}>{STATE_META[part.state].label}</Chip>
        <h3 className="text-[15px] font-bold text-purple mt-3 mb-1">What goes here</h3>
        <p className="text-[13px] text-body leading-relaxed">{part.what}</p>
        <h3 className="text-[15px] font-bold text-purple mt-4 mb-1">Why it matters</h3>
        <p className="text-[13px] text-body leading-relaxed">{part.why}</p>
        <div className="mt-5 pt-4 border-t border-[#f0edf5]">
          <Link href="/administration" className="text-[12.5px] text-purple font-semibold">
            ← Back to Administration
          </Link>
        </div>
      </Card>
    </div>
  );
}
