"use client";

/*
  ACCESS CONTROL — the one list (ADM-RULE-001), owner only.
  RADIAN_ADMINISTRATION_MODULE_ARCHITECTURE.md, 30 Jul 2026

  Why this screen exists. Until today "who can do what" was written in three
  places that did not agree: 73 @Roles decorators in the API, 10 hand-written
  ifs, and a roles: array in the sidebar covering 11 of 159 screens. Three
  lists, one question, nobody reconciling them. On the day Intelligence was
  built a roles: array here hid the entire module from STAFF while the decision
  had been the opposite and the API was left open. Nothing errored. Staff
  simply never saw a screen written for them.

  So: one list, on the server, and this screen is the only way to change it.

  How a tick behaves (§5). A position inherits DOWN the tree, and only the
  EXCEPTIONS are stored. Ticking Finance opens every screen under it; you then
  untick Profit & Loss alone. Making an accountant is two clicks, not 166 —
  but the power to reach any single screen is still there when it is wanted.

  Three states per node, never two:
    Allow    — explicitly open
    Block    — explicitly shut, and it beats whatever the module above says
    Inherit  — no row stored; the module above decides (this is the default)

  ⚠️ UI text is ENGLISH. Bangla is for talking to the owner, never for the
  screen. The first cut of this file got that wrong throughout.
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiAccessNode, ApiPosition, ApiUndecided, ApiWouldBlock,
  createPosition, getAccessRegistry, getPositionAccess, getUndecidedNodes,
  getWouldBlock, listPositions, removePosition, renamePosition, setPositionAccess,
} from "../_data/api";
import {
  Banner, Card, Chip, Empty, FinHeader, Flash, Panel, Table, Td, Th,
  btnGhost, btnPrimary, btnPrimaryStyle, input, TONE, WRAP,
} from "./FinanceUI";
import AccessPeople from "./AccessPeople";

type Verdict = boolean | null;

function flatten(nodes: ApiAccessNode[]): ApiAccessNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

export default function AccessControl() {
  const [tree, setTree] = useState<ApiAccessNode[]>([]);
  const [positions, setPositions] = useState<ApiPosition[]>([]);
  const [undecided, setUndecided] = useState<ApiUndecided[]>([]);
  const [wouldBlock, setWouldBlock] = useState<ApiWouldBlock[]>([]);
  /** routes the guard could not name — an empty report means nothing if this is not empty */
  const [unjudged, setUnjudged] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [rules, setRules] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  /*  The owner's question, 30 July: "there is no save button — how do I know
      this was confirmed?" A fair complaint about a real failure. Each tick was
      already being written to the server the moment it was clicked, but the
      screen never said so, so the only honest answer was "you cannot tell".

      Instant save is kept — a page of 166 rows with a Save button is a page
      where closing the tab loses work — but it now REPORTS itself: saving,
      saved with the time, or failed with the tick put back where it was.  */
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const flash = (o: string, e = "") => {
    setOk(o); setErr(e);
    setTimeout(() => { setOk(""); setErr(""); }, 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, p, u, w] = await Promise.all([
        getAccessRegistry(), listPositions(), getUndecidedNodes(),
        getWouldBlock().catch(() => ({ rows: [], unjudged: [] })),
      ]);
      setTree(t); setPositions(p); setUndecided(u);
      setWouldBlock(w.rows); setUnjudged(w.unjudged);
      setSelected((s) => s ?? p.find((x) => !x.isOwner)?.id ?? p[0]?.id ?? null);
    } catch (e) {
      setErr((e as Error).message || "Could not load the list");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected) return;
    getPositionAccess(selected).then(setRules).catch(() => setRules({}));
  }, [selected]);

  const position = positions.find((p) => p.id === selected) ?? null;
  const nodeCount = useMemo(() => flatten(tree).length, [tree]);

  /*  What a node actually resolves to for this position — the same walk the
      server does, so the screen never claims something the API will refuse.  */
  const parentOf = useMemo(() => {
    const m = new Map<string, string | null>();
    const walk = (n: ApiAccessNode, parent: string | null) => {
      m.set(n.key, parent);
      n.children.forEach((c) => walk(c, n.key));
    };
    tree.forEach((n) => walk(n, null));
    return m;
  }, [tree]);

  const effective = useCallback(
    (key: string): { allowed: boolean } => {
      let at: string | null | undefined = key;
      while (at) {
        if (at in rules) return { allowed: rules[at] };
        at = parentOf.get(at) ?? null;
      }
      return { allowed: false };
    },
    [rules, parentOf],
  );

  async function tick(nodeKey: string, allowed: Verdict) {
    if (!selected || !position || position.isOwner) return;
    setBusy(nodeKey);
    setSaveState("saving");
    // optimistic — the tree is 166 rows and a round-trip per click would crawl
    const before = { ...rules };
    setRules((r) => {
      const next = { ...r };
      if (allowed === null) delete next[nodeKey];
      else next[nodeKey] = allowed;
      return next;
    });
    try {
      await setPositionAccess(selected, nodeKey, allowed);
      setSaveState("saved");
      setSavedAt(new Date().toLocaleTimeString());
      void listPositions().then(setPositions);
      void getUndecidedNodes().then(setUndecided);
    } catch (e) {
      // put the tick back where it was — a screen that shows a change the
      // server refused is worse than no feedback at all
      setRules(before);
      setSaveState("error");
      flash("", (e as Error).message || "Could not save that");
    } finally {
      setBusy(null);
    }
  }

  async function addPosition() {
    const name = newName.trim();
    if (!name) return;
    try {
      const p = await createPosition(name);
      setNewName(""); setAdding(false);
      await load();
      setSelected(p.id);
      flash(`"${name}" created — now choose what it can see`);
    } catch (e) {
      flash("", (e as Error).message);
    }
  }

  async function rename(p: ApiPosition) {
    const name = window.prompt("New name for this position", p.name);
    if (!name || name === p.name) return;
    try {
      await renamePosition(p.id, name);
      await load();
      flash(`Renamed to "${name}"`);
    } catch (e) { flash("", (e as Error).message); }
  }

  async function drop(p: ApiPosition) {
    if (!window.confirm(`Delete the "${p.name}" position?`)) return;
    try {
      await removePosition(p.id);
      setSelected(null);
      await load();
      flash(`"${p.name}" deleted`);
    } catch (e) { flash("", (e as Error).message); }
  }

  const toggleOpen = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  /* ------------------------------------------------------------------ */

  if (loading) {
    return (
      <div className={WRAP}>
        <FinHeader eyebrow="Administration" title="Access control" sub="Loading the list…" emoji="🔑" />
      </div>
    );
  }

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Administration"
        title="Access control"
        emoji="🔑"
        sub={`${nodeCount} screens, ${positions.length} positions — one list, one place`}
      />
      <Flash ok={ok} err={err} />

      {/*  ADM-D06. A new screen reaches nobody until it is decided — but it
          says so, out loud. Failing closed is only safe if it is not silent;
          silence is exactly how Intelligence went missing.  */}
      {undecided.length > 0 && (
        <div className="mb-5">
          <Banner
            tone="rose"
            emoji="⚠"
            title={`${undecided.length} screens have arrived and reach nobody yet`}
          >
            <div className="mt-1">
              A new screen is given to no one until you say so — safe, but never
              silent. Tick it into place in the tree below.
              <div className="mt-2 flex flex-wrap gap-1.5">
                {undecided.slice(0, 12).map((u) => (
                  <Chip key={u.key} tone="rose">{u.domain} › {u.label}</Chip>
                ))}
                {undecided.length > 12 && (
                  <Chip tone="slate">{undecided.length - 12} more</Chip>
                )}
              </div>
            </div>
          </Banner>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        {/* ---------- positions ---------- */}
        <Card className="p-4 h-fit">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-bold text-purple">Positions</h3>
            <button className={btnGhost} onClick={() => setAdding((a) => !a)}>
              {adding ? "Cancel" : "+ New"}
            </button>
          </div>

          {adding && (
            <div className="mb-3 flex gap-1.5">
              <input
                className={input}
                placeholder="e.g. Accountant"
                value={newName}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addPosition()}
              />
              <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => void addPosition()}>
                Save
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            {positions.map((p) => {
              const on = p.id === selected;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  className="w-full text-left rounded-xl px-3 py-2.5 border transition"
                  style={{
                    background: on ? TONE.brand.soft : "#fff",
                    borderColor: on ? TONE.brand.ring : "#eceaf1",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-body">{p.name}</span>
                    {p.isOwner && <Chip tone="brand">everything</Chip>}
                  </div>
                  <div className="text-[11px] text-body-soft mt-0.5">
                    {p.people} {p.people === 1 ? "person" : "people"}
                    {!p.isOwner && ` · ${p.rules} own rules`}
                  </div>
                </button>
              );
            })}
          </div>

          {position && !position.isOwner && (
            <div className="mt-3 pt-3 border-t border-[#f0edf5] flex gap-1.5">
              <button className={btnGhost} onClick={() => void rename(position)}>Rename</button>
              {!position.isLocked && (
                <button className={btnGhost} onClick={() => void drop(position)}>Delete</button>
              )}
            </div>
          )}
        </Card>

        {/* ---------- the tree ---------- */}
        <Panel
          emoji="▤"
          title={position ? `What ${position.name} can see` : "Choose a position"}
          sub={
            position?.isOwner
              ? "OWNER sees everything and that cannot be changed — it is the last door into your own business"
              : "Tick a module and every screen under it opens. Then close only the exceptions."
          }
          /*  The answer to "how do I know it was confirmed?" — every tick is
              written the instant it is clicked, and now it says so.  */
          right={
            position && !position.isOwner ? (
              <span
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/25 text-white"
                title="Every tick is saved the moment you click it — there is nothing to submit"
              >
                {saveState === "saving" && "Saving…"}
                {saveState === "saved" && `Saved ✓ ${savedAt}`}
                {saveState === "error" && "Not saved — try again"}
                {saveState === "idle" && "Saves as you click"}
              </span>
            ) : undefined
          }
        >
          {!position ? (
            <div className="p-5">
              <Empty title="Pick a position on the left" />
            </div>
          ) : (
            <div className="p-3 space-y-1">
              {tree.map((mod) => {
                const eff = effective(mod.key);
                const isOpen = open.has(mod.key);
                return (
                  <div key={mod.key} className="rounded-xl border border-[#f0edf5] overflow-hidden">
                    <div
                      className="flex items-center gap-2 px-3 py-2.5"
                      style={{ background: eff.allowed ? "#fbf7fd" : "#fafafa" }}
                    >
                      <button
                        className="text-[11px] w-5 text-body-soft"
                        onClick={() => toggleOpen(mod.key)}
                        aria-label="Expand"
                      >
                        {mod.children.length ? (isOpen ? "▾" : "▸") : "·"}
                      </button>
                      <span className="text-[13px] font-semibold text-body flex-1">
                        {mod.label}
                        <span className="text-[11px] text-body-soft font-normal ml-2">
                          {mod.domain}
                        </span>
                      </span>
                      <TriState
                        value={mod.key in rules ? rules[mod.key] : null}
                        effective={eff.allowed}
                        disabled={position.isOwner || busy === mod.key}
                        onChange={(v) => void tick(mod.key, v)}
                      />
                    </div>

                    {isOpen && mod.children.length > 0 && (
                      <div className="border-t border-[#f4f2f7] bg-white">
                        {mod.children.map((sc) => (
                          <ScreenRow
                            key={sc.key}
                            node={sc}
                            depth={1}
                            rules={rules}
                            effective={effective}
                            disabled={position.isOwner}
                            busy={busy}
                            onTick={tick}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/*  The people column (§9). This is where an account is created — by
             email, with no password, because they choose their own.  */}
        <div className="xl:block">
          <AccessPeople
            positions={positions}
            selectedPositionId={selected}
            onChanged={() => void listPositions().then(setPositions)}
          />
        </div>
      </div>

      {/*  §7 stage 2 — the silent stage, made visible.

          346 of 419 API routes have no role check at all. Switching them on
          together and seeing what breaks means the thing that breaks is the
          shop, mid-sale. So the guard runs for real and turns NOBODY away; it
          only records who it would have. Stage 3 waits until this list stops
          filling up.  */}
      <div className="mt-5">
        <Panel
          emoji="◔"
          tone={wouldBlock.length || unjudged.length ? "amber" : "emerald"}
          title="Enforcement — still watching, not blocking"
          sub={
            wouldBlock.length
              ? `${wouldBlock.length} requests would have been refused. Nobody was.`
              : unjudged.length
                ? "Nothing refused — but some routes were never checked. See below."
                : "Nothing has been refused. Keep working normally and check back."
          }
        >
          <div className="p-4">
            <p className="text-[12.5px] text-body leading-relaxed mb-3">
              The API does not enforce these ticks yet — on purpose. It watches
              real traffic and writes down who it <em>would</em> have turned
              away. When this list stays empty through a normal day&apos;s work,
              enforcement is safe to switch on. Until then the ticks control
              what people <strong>see</strong>, not what the API allows.
            </p>

            {/*  ⚠️ Without this, an empty report above is ambiguous: it could
                 mean the ticks match reality, or it could mean the guard never
                 looked. Enforcement switched on off the back of the second one
                 would refuse traffic nobody had ever examined.  */}
            {unjudged.length > 0 && (
              <div className="mb-3">
                <Banner
                  tone="rose" emoji="⚠"
                  title={`${unjudged.length} route group${unjudged.length === 1 ? "" : "s"} could not be checked at all`}
                >
                  <div className="mt-1">
                    The guard has no registry node for these, so it waved every
                    request under them through without judging it. An empty list
                    above does <strong>not</strong> cover them.
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {unjudged.map((u) => <Chip key={u} tone="rose">/{u}</Chip>)}
                    </div>
                  </div>
                </Banner>
              </div>
            )}

            {wouldBlock.length === 0 ? (
              <div className="text-[12px] text-body-soft">
                Nothing recorded since the API last started.
              </div>
            ) : (
              <Table
                head={<><Th>When</Th><Th>Who</Th><Th>Request</Th><Th>Module</Th></>}
              >
                {wouldBlock.slice(0, 25).map((w, i) => (
                  <tr key={`${w.who}-${w.path}-${i}`}>
                    <Td>{new Date(w.at).toLocaleTimeString()}</Td>
                    <Td>{w.who}</Td>
                    <Td><code className="text-[11px]">{w.method} {w.path}</code></Td>
                    <Td><Chip tone="amber">{w.node}</Chip></Td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function ScreenRow({
  node, depth, rules, effective, disabled, busy, onTick,
}: {
  node: ApiAccessNode;
  depth: number;
  rules: Record<string, boolean>;
  effective: (k: string) => { allowed: boolean };
  disabled: boolean;
  busy: string | null;
  onTick: (k: string, v: Verdict) => void | Promise<void>;
}) {
  const eff = effective(node.key);
  const explicit = node.key in rules;
  return (
    <>
      <div
        className="flex items-center gap-2 px-3 py-1.5 border-b border-[#f7f5fa] last:border-0"
        style={{ paddingLeft: 12 + depth * 22 }}
      >
        <span
          className="text-[12.5px] flex-1"
          style={{ color: eff.allowed ? "#3f3a4a" : "#a9a3b5" }}
        >
          {node.label}
          {!explicit && (
            <span className="text-[10.5px] text-body-soft ml-2">
              inherited · {eff.allowed ? "open" : "closed"}
            </span>
          )}
        </span>
        <TriState
          value={explicit ? rules[node.key] : null}
          effective={eff.allowed}
          disabled={disabled || busy === node.key}
          onChange={(v) => void onTick(node.key, v)}
        />
      </div>
      {node.children.map((c) => (
        <ScreenRow
          key={c.key} node={c} depth={depth + 1} rules={rules}
          effective={effective} disabled={disabled} busy={busy} onTick={onTick}
        />
      ))}
    </>
  );
}

/** Allow · Inherit · Block — three states, because two would hide the default */
function TriState({
  value, effective, disabled, onChange,
}: {
  value: Verdict;
  effective: boolean;
  disabled: boolean;
  onChange: (v: Verdict) => void;
}) {
  const opts: { v: Verdict; label: string; tone: keyof typeof TONE }[] = [
    { v: true, label: "Allow", tone: "emerald" },
    { v: null, label: "Inherit", tone: "slate" },
    { v: false, label: "Block", tone: "rose" },
  ];
  return (
    <div className="flex rounded-lg overflow-hidden border border-[#eceaf1] shrink-0">
      {opts.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={String(o.v)}
            disabled={disabled}
            onClick={() => onChange(o.v)}
            className="text-[10.5px] px-2 py-1 font-semibold transition disabled:opacity-40"
            style={{
              background: on ? TONE[o.tone].soft : "#fff",
              color: on ? TONE[o.tone].text : "#a9a3b5",
              boxShadow: on ? `inset 0 0 0 1px ${TONE[o.tone].ring}` : undefined,
            }}
            title={
              o.v === null
                ? `Follows the module above — currently ${effective ? "open" : "closed"}`
                : undefined
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
