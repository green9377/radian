"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";
import {
  WRAP, FinHeader, Card, Table, Th, Td, Chip, Empty, Flash,
  btnGhost, input, Lbl, taka, type Tone,
} from "./FinanceUI";
import {
  auditStats, auditFacets, auditList, auditBackups, auditActivity, auditForEntity, ago,
  type ApiAuditStats, type ApiAuditFacets, type ApiAuditRow, type ApiActivityRow,
  type AuditAction,
} from "../_data/api";

/*
  ACTIVITY & AUDIT — reading the trail that nothing has ever read.

  Every module has been writing to AuditLog since the first screen was built.
  The record is complete and it has never once been looked at, which until now
  was the same as not having one.

  The design problem here is not fetching rows, it is that a raw audit log is
  unreadable — thousands of lines of "Product UPDATE admin". So:

    · MONEY FIRST. The default view is the entity types where a mistake costs
      money. That is the question somebody actually opens this screen with.
    · plain words. "changed" not "UPDATE"; "3 hours ago" not a timestamp.
    · the field-level diff is shown inline, from → to, because "somebody
      changed the price" without saying from what is not an answer.
    · backups sit at the top, because "did last night's copy happen" is the
      one thing worth checking without being asked.
*/

const TAB_DEFS = [
  { key: "MONEY", label: "Money actions", icon: "cash", fg: "#edc278", bg: "#3c2f17", grad: "linear-gradient(135deg,#b07818,#d9a53a)" },
  { key: "ALL", label: "Everything", icon: "layers", fg: "#b97fdc", bg: "#2e1a38", grad: "linear-gradient(135deg,#8a2bb0,#cf43ea)" },
  { key: "ACTIVITY", label: "In plain words", icon: "mail", fg: "#82a7d9", bg: "#17273a", grad: "linear-gradient(135deg,#3b76c4,#6ba3e8)" },
  { key: "BACKUPS", label: "Backups", icon: "download", fg: "#73f2c6", bg: "#1e352b", grad: "linear-gradient(135deg,#0e9767,#22c08b)" },
] as const;

const ACTION_LABEL: Record<AuditAction, string> = {
  CREATE: "added",
  UPDATE: "changed",
  DELETE: "removed",
  RESTORE: "put back",
};
const ACTION_TONE: Record<AuditAction, Tone> = {
  CREATE: "emerald",
  UPDATE: "sky",
  DELETE: "rose",
  RESTORE: "amber",
};

/** turn "AffiliatePayout" into "Affiliate payout" */
const humanType = (t: string) =>
  t.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

const KIND_TONE: Record<string, Tone> = {
  sales: "emerald", delivery: "sky", payment: "brand", system: "slate", general: "slate",
};

/** money-ish keys get formatted as taka, everything else as-is */
function showValue(key: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number" && /paisa$/i.test(key)) return taka(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function Changes({ changes }: { changes: Record<string, unknown> | null }) {
  if (!changes || Object.keys(changes).length === 0)
    return <span className="text-body-soft text-[12px]">—</span>;

  const entries = Object.entries(changes).slice(0, 6);
  return (
    <div className="space-y-0.5">
      {entries.map(([k, v]) => {
        const pair = v as { from?: unknown; to?: unknown } | null;
        const isDiff = pair && typeof pair === "object" && ("from" in pair || "to" in pair);
        return (
          <div key={k} className="text-[12px] leading-snug">
            <span className="text-body-soft">{k}</span>{" "}
            {isDiff ? (
              <>
                <span className="line-through opacity-60">{showValue(k, pair.from)}</span>
                <span className="mx-1 text-body-soft">→</span>
                <span className="font-semibold text-purple">{showValue(k, pair.to)}</span>
              </>
            ) : (
              <span className="font-semibold text-purple">{showValue(k, v)}</span>
            )}
          </div>
        );
      })}
      {Object.keys(changes).length > entries.length && (
        <div className="text-[11px] text-body-soft">
          +{Object.keys(changes).length - entries.length} more
        </div>
      )}
    </div>
  );
}

export function AuditView({ embedded = false }: { embedded?: boolean } = {}) {
  const [tab, setTab] = useState<"MONEY" | "ALL" | "ACTIVITY" | "BACKUPS">("MONEY");
  const [stats, setStats] = useState<ApiAuditStats | null>(null);
  const [facets, setFacets] = useState<ApiAuditFacets | null>(null);
  const [rows, setRows] = useState<ApiAuditRow[]>([]);
  const [feed, setFeed] = useState<ApiActivityRow[]>([]);
  const [backups, setBackups] = useState<ApiAuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [entityType, setEntityType] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [err, setErr] = useState("");

  /*  ADM, 30 Jul 2026 — the two things this screen was missing.

      The API has supported both since the Audit module was built. Nothing called
      them, so "find order RAD-58217" and "what happened to this order" each had
      a working answer with no way to reach it. Filters alone do not answer
      either question: you cannot filter your way to one specific parcel.

      `search` is debounced rather than searched on every keystroke — the trail
      is the largest table in the database and it is only going to grow.  */
  const [search, setSearch] = useState("");
  const [searchLive, setSearchLive] = useState("");
  const [trace, setTrace] = useState<
    | null
    | { entityType: string; entityId: string; loading: boolean;
        audit: ApiAuditRow[]; activity: ApiActivityRow[] }
  >(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchLive.trim()), 350);
    return () => clearTimeout(t);
  }, [searchLive]);

  const openTrace = useCallback(async (entityType: string, entityId: string) => {
    setTrace({ entityType, entityId, loading: true, audit: [], activity: [] });
    try {
      const r = await auditForEntity(entityType, entityId);
      setTrace({ entityType, entityId, loading: false, audit: r.audit, activity: r.activity });
    } catch (e) {
      setErr((e as Error).message);
      setTrace(null);
    }
  }, []);

  /* modal manners: Esc closes, and the page behind holds still */
  useEffect(() => {
    if (!trace) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTrace(null); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [trace]);

  useEffect(() => {
    void (async () => {
      try {
        const [s, f] = await Promise.all([auditStats(), auditFacets()]);
        setStats(s); setFacets(f);
      } catch (e) { setErr((e as Error).message); }
    })();
  }, []);

  const load = useCallback(async () => {
    try {
      if (tab === "ACTIVITY") { setFeed(await auditActivity({ days: 14 })); return; }
      if (tab === "BACKUPS") { setBackups((await auditBackups(60)).items); return; }
      const r = await auditList({
        moneyOnly: tab === "MONEY" ? "1" : "",
        entityType: entityType || undefined,
        actor: actor || undefined,
        action: action || undefined,
        search: search || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
      });
      setRows(r.items); setTotal(r.total); setTotalPages(r.totalPages);
    } catch (e) { setErr((e as Error).message); }
  }, [tab, entityType, actor, action, search, from, to, page]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [tab, entityType, actor, action, search, from, to]);

  return (
    <div className={embedded ? "" : WRAP}>
      {!embedded && (
        <FinHeader
          eyebrow="Administration"
          title="Activity & audit"
          sub="Who did what, and when. Search for a record, or click any row to see everything that ever happened to it. Nothing on this page can be edited or deleted, on purpose."
          emoji="🕰"
          tone="slate"
        />
      )}
      <Flash ok="" err={err} />

      {/*  The stale-backup warning moved into the notification bell (owner,
          18 Aug 2026: system notices collect in one place, never on top of a
          working page). The KPI tile below still shows the state in colour.  */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile icon="clock" grad="linear-gradient(135deg,#8a2bb0,#cf43ea)" fg="#7a2ea8"
          label="Recorded today" value={String(stats?.today ?? 0)} />
        <StatTile icon="chart" grad="linear-gradient(135deg,#3b76c4,#7fb4f0)" fg="#3b76c4"
          label="This week" value={String(stats?.week ?? 0)} />
        <StatTile icon="cash" grad="linear-gradient(135deg,#b07818,#e9c46a)" fg="#b07818"
          label="Money actions · 7d" value={String(stats?.money7 ?? 0)} />
        <StatTile icon="download"
          grad={stats?.backupStale ? "linear-gradient(135deg,#c62f20,#e8604f)" : "linear-gradient(135deg,#0e9767,#22c08b)"}
          fg={stats?.backupStale ? "#c0392b" : "#0e9767"}
          label="Last backup" value={stats?.lastBackupAt ? ago(stats.lastBackupAt) : "never"} />
      </div>

      {/*  Four views, four colours — the chosen one goes solid in its own hue
          so which book is open reads from across the room.  */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TAB_DEFS.map((t) => {
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-[13px] text-[12.5px] font-bold border transition-all"
              style={on
                ? { background: t.grad, color: "#fff", borderColor: "transparent", boxShadow: `0 4px 14px ${t.fg}55` }
                : { background: "#fff", color: "#dfd2e4", borderColor: "#3c3249" }}>
              <span className="w-[22px] h-[22px] rounded-[7px] grid place-items-center"
                style={on ? { background: "rgba(255,255,255,0.22)", color: "#fff" } : { background: t.bg, color: t.fg }}>
                <Icon name={t.icon} size={12} strokeWidth={2.4} />
              </span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/*  The full history opens as a MODAL over wherever you are. It used to
          be a panel pinned to the top of the page - click "Full history" on
          row forty and the panel opened somewhere above the fold while you
          stayed put, none the wiser (owner, 19 Aug). An overlay has no
          location: it appears in front of you and, closed, you are exactly
          where you left off - page five of the results included.  */}
      {trace && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "rgba(28,12,42,0.5)", backdropFilter: "blur(3px)" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setTrace(null); }}>
          <div className="w-full max-w-[880px] max-h-[86vh] rounded-[20px] bg-white overflow-hidden flex flex-col"
            style={{ boxShadow: "0 24px 80px rgba(20,5,35,0.5)" }}>
            <div className="px-5 py-3.5 flex items-center gap-3 shrink-0"
              style={{ background: "linear-gradient(120deg,#470066,#8a2bb0 55%,#cf43ea)" }}>
              <span className="w-[34px] h-[34px] rounded-[11px] grid place-items-center text-white shrink-0"
                style={{ background: "rgba(255,255,255,0.16)" }}>
                <Icon name="clock" size={16} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-bold text-white leading-tight">
                  Everything that ever happened to this {humanType(trace.entityType).toLowerCase()}
                </div>
                <div className="text-[10.5px] text-white/70 font-mono truncate">{trace.entityId}</div>
              </div>
              <button onClick={() => setTrace(null)} aria-label="Close"
                className="w-[30px] h-[30px] rounded-[9px] grid place-items-center text-white shrink-0 hover:bg-white/30 transition-colors"
                style={{ background: "rgba(255,255,255,0.16)" }}>
                <span style={{ transform: "rotate(45deg)", display: "grid" }}><Icon name="plus" size={15} strokeWidth={2.4} /></span>
              </button>
            </div>

            <div className="overflow-y-auto">
              {trace.loading ? (
                <div className="p-6 text-[13px] text-body-soft">Reading the trail…</div>
              ) : trace.audit.length === 0 && trace.activity.length === 0 ? (
                <div className="p-6">
                  <Empty emoji="🕰" title="Nothing recorded for this record"
                    sub="Which is itself worth knowing — it means no module has ever written a change against this id." />
                </div>
              ) : (
                <div className="p-4 space-y-5">
                  {trace.audit.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[12px] font-extrabold tracking-[0.08em] uppercase text-purple">Field by field</span>
                        <span className="text-[10px] font-bold px-2 py-[1px] rounded-full" style={{ background: "#2e1a38", color: "#b97fdc" }}>{trace.audit.length}</span>
                      </div>
                      <Table head={<><Th>When</Th><Th>Who</Th><Th>What</Th><Th>Changed</Th></>}>
                        {trace.audit.map((r) => (
                          <tr key={r.id}>
                            <Td>
                              <div className="text-[12.5px]">{ago(r.createdAt)}</div>
                              <div className="text-[11px] text-body-soft">
                                {new Date(r.createdAt).toLocaleString()}
                              </div>
                            </Td>
                            <Td><span className="font-semibold text-purple">{r.actorName}</span></Td>
                            <Td><Chip tone={ACTION_TONE[r.action]}>{ACTION_LABEL[r.action]}</Chip></Td>
                            <Td><Changes changes={r.changes} /></Td>
                          </tr>
                        ))}
                      </Table>
                    </div>
                  )}
                  {trace.activity.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[12px] font-extrabold tracking-[0.08em] uppercase text-purple">In plain words</span>
                        <span className="text-[10px] font-bold px-2 py-[1px] rounded-full" style={{ background: "#17273a", color: "#82a7d9" }}>{trace.activity.length}</span>
                      </div>
                      <Table head={<><Th>When</Th><Th>What</Th><Th>Who</Th></>}>
                        {trace.activity.map((e) => (
                          <tr key={e.id}>
                            <Td>{ago(e.createdAt)}</Td>
                            <Td>
                              <Chip tone={KIND_TONE[e.kind] ?? "slate"}>{e.kind}</Chip>
                              <div className="text-[13px] mt-0.5">{e.label}</div>
                              {e.note && <div className="text-[11.5px] text-body-soft">{e.note}</div>}
                            </Td>
                            <Td><span className="text-[12.5px] text-body-soft">{e.actorName}</span></Td>
                          </tr>
                        ))}
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {(tab === "MONEY" || tab === "ALL") && (
        <>
          <Card className="p-4 mb-4">
            {/*  The search box sits ABOVE the filters, because it is what people
                 actually arrive wanting: they have an order number in their hand,
                 not a date range. It matches the record's id, who did it, and the
                 kind of thing — no amount of filtering finds one specific parcel. */}
            {/*  Just the field — no label, no helper prose (owner, 19 Aug:
                "search barer niche jen kon text na thake").  */}
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a08fb8] pointer-events-none">
                <Icon name="search" size={15} strokeWidth={2.2} />
              </span>
              <input
                className={input}
                style={{ paddingLeft: 36 }}
                placeholder="An order number, a name, anything — e.g. RAD-58217"
                value={searchLive}
                onChange={(e) => setSearchLive(e.target.value)}
              />
            </div>
            <div className="grid md:grid-cols-5 gap-3">
              <div>
                <Lbl>Kind of thing</Lbl>
                <select className={input} value={entityType} onChange={(e) => setEntityType(e.target.value)}>
                  <option value="">All</option>
                  {(facets?.types ?? [])
                    .filter((t) => tab === "ALL" || facets?.moneyEntities.includes(t.entityType))
                    .map((t) => (
                      <option key={t.entityType} value={t.entityType}>
                        {humanType(t.entityType)} ({t.count})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <Lbl>Who</Lbl>
                <select className={input} value={actor} onChange={(e) => setActor(e.target.value)}>
                  <option value="">Anybody</option>
                  {(facets?.actors ?? []).map((a) => (
                    <option key={a.actorName} value={a.actorName}>{a.actorName} ({a.count})</option>
                  ))}
                </select>
              </div>
              <div>
                <Lbl>What happened</Lbl>
                <select className={input} value={action} onChange={(e) => setAction(e.target.value)}>
                  <option value="">Anything</option>
                  <option value="CREATE">added</option>
                  <option value="UPDATE">changed</option>
                  <option value="DELETE">removed</option>
                  <option value="RESTORE">put back</option>
                </select>
              </div>
              <div><Lbl>From</Lbl>
                <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><Lbl>To</Lbl>
                <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <Empty emoji="🕰" title="Nothing matches"
                sub="Widen the dates, or switch to Everything — the money filter only shows the entity types where a mistake costs taka." />
            ) : (
              <>
                <Table head={<><Th>When</Th><Th>Who</Th><Th>What</Th><Th>Changed</Th><Th /></>}>
                  {rows.map((r) => (
                    <tr key={r.id} className="cursor-pointer hover:bg-[#271a34] transition-colors"
                      onClick={() => void openTrace(r.entityType, r.entityId)}>
                      <Td>
                        <div className="text-[12.5px]">{ago(r.createdAt)}</div>
                        <div className="text-[11px] text-body-soft">
                          {new Date(r.createdAt).toLocaleString()}
                        </div>
                      </Td>
                      <Td><span className="font-semibold text-purple">{r.actorName}</span></Td>
                      <Td>
                        <Chip tone={ACTION_TONE[r.action]}>{ACTION_LABEL[r.action]}</Chip>
                        <div className="text-[12.5px] mt-0.5">{humanType(r.entityType)}</div>
                        <div className="text-[10.5px] text-body-soft font-mono">{r.entityId.slice(0, 12)}</div>
                      </Td>
                      <Td><Changes changes={r.changes} /></Td>
                      <Td right>
                        {/*  One row is one moment. The question people actually ask
                             is about the whole life of a thing — "who touched this
                             order" — and that needs every row for that id, not
                             this one.  */}
                        <button
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-[8px] border bg-white whitespace-nowrap"
                          style={{ borderColor: "#3b3248", color: "#b97fdc" }}
                          onClick={(e) => { e.stopPropagation(); void openTrace(r.entityType, r.entityId); }}
                        >
                          Full history
                        </button>
                      </Td>
                    </tr>
                  ))}
                </Table>
                <div className="px-4 py-3 border-t border-[#3e3248] flex items-center justify-between gap-3">
                  <span className="text-[12px] text-body-soft">
                    {total.toLocaleString()} records · page {page} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button className={btnGhost} disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}>Newer</button>
                    <button className={btnGhost} disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}>Older</button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {tab === "ACTIVITY" && (
        <div className="rounded-[16px] bg-white border border-[#3c3249] overflow-hidden"
          style={{ boxShadow: "0 2px 10px rgba(70,0,102,0.06)" }}>
          <div className="px-4 py-2.5 flex items-center gap-2.5"
            style={{ background: "linear-gradient(120deg,#3b76c4,#6ba3e8)" }}>
            <span className="text-[11.5px] font-extrabold tracking-[0.1em] uppercase text-white flex-1">What happened, in plain words</span>
            <span className="text-[10px] font-bold px-2 py-[1px] rounded-full bg-white/25 text-white">last 14 days</span>
          </div>
          {feed.length === 0 ? (
            <Empty emoji="💬" title="Nothing in the last two weeks" />
          ) : (
            <Table head={<><Th>When</Th><Th>What</Th><Th>Who</Th></>}>
              {feed.map((e) => (
                <tr key={e.id}>
                  <Td>{ago(e.createdAt)}</Td>
                  <Td>
                    <Chip tone={KIND_TONE[e.kind] ?? "slate"}>{e.kind}</Chip>
                    <div className="text-[13px] mt-0.5">{e.label}</div>
                    {e.note && <div className="text-[11.5px] text-body-soft">{e.note}</div>}
                  </Td>
                  <Td><span className="text-[12.5px] text-body-soft">{e.actorName}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {tab === "BACKUPS" && (
        <div className="rounded-[16px] bg-white border border-[#3c3249] overflow-hidden"
          style={{ boxShadow: "0 2px 10px rgba(70,0,102,0.06)" }}>
          <div className="px-4 py-2.5 flex items-center gap-2.5"
            style={{ background: "linear-gradient(120deg,#0e9767,#22c08b)" }}>
            <span className="text-[11.5px] font-extrabold tracking-[0.1em] uppercase text-white flex-1">Nightly copies of the database</span>
            <span className="text-[10px] font-bold px-2 py-[1px] rounded-full bg-white/25 text-white">{backups.length}</span>
          </div>
          {backups.length === 0 ? (
            <Empty emoji="💾" title="No backup has ever been recorded"
              sub="Run D:\radian\radian_backup.bat once, then radian_backup_schedule.bat so it happens every night without anybody remembering." />
          ) : (
            <Table head={<><Th>When</Th><Th>File</Th><Th right>Size</Th><Th>By</Th></>}>
              {backups.map((b) => {
                const c = (b.changes ?? {}) as { file?: string; bytes?: number };
                return (
                  <tr key={b.id}>
                    <Td>
                      <div className="text-[12.5px]">{ago(b.createdAt)}</div>
                      <div className="text-[11px] text-body-soft">{new Date(b.createdAt).toLocaleString()}</div>
                    </Td>
                    <Td><code className="text-[12px]">{c.file ?? "—"}</code></Td>
                    <Td right>{c.bytes ? `${(c.bytes / 1024).toFixed(0)} KB` : "—"}</Td>
                    <Td><span className="text-[12px] text-body-soft">{b.actorName}</span></Td>
                  </tr>
                );
              })}
            </Table>
          )}
          <div className="px-5 py-4 border-t border-[#3e3248] text-[12px] text-body-soft">
            A copy on the same disk as the database survives a mistake, not a dead drive. Copy
            <code className="mx-1">D:\radian\backups\</code> somewhere else now and then.
          </div>
        </div>
      )}
    </div>
  );
}


/*  Compact brand stat tile — the audit page's own, matching the overview's
    visual language without dragging the chart kit in.  */
function StatTile({ icon, grad, fg, label, value }: {
  icon: string; grad: string; fg: string; label: string; value: string;
}) {
  return (
    <div className="rounded-[15px] p-3.5 bg-white border" style={{ borderColor: `${fg}22`, boxShadow: `0 2px 8px ${fg}12` }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-[26px] h-[26px] rounded-[8px] grid place-items-center text-white"
          style={{ background: grad }}>
          <Icon name={icon} size={13} strokeWidth={2.3} />
        </span>
        <span className="text-[11px] font-bold text-body-soft">{label}</span>
      </div>
      <div className="text-[22px] font-bold leading-none" style={{ color: fg }}>{value}</div>
    </div>
  );
}
