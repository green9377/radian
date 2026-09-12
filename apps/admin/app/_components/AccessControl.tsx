"use client";

/*
  ACCESS CONTROL — the template workshop. Owner only.
  RADIAN_ADMINISTRATION_MODULE_ARCHITECTURE.md, 30 Jul 2026 · rebuilt 18 Aug 2026.

  The owner's ruling on what this page IS (18 Aug, second pass):
    "amra akhane just template make krbo" — this page ONLY builds templates
    (positions): the list of modules, and for each template, what it may see.
    WHO holds a template is decided on People & accounts, not here. So the
    position gallery and the people rail are gone from this page.

  And on how it should LOOK: the first pass was washed-out — pale pink rows,
  faded pills, "chokhe japsa lage". This version is dense and crisp: dark
  text on white, thin gradient department bars in the sidebar's exact hues,
  and a segmented Allow/Inherit/Block control with solid colour when chosen.

  How a tick behaves (§5, unchanged): a template inherits DOWN the tree; only
  the EXCEPTIONS are stored. Allow / Block / Inherit, never two states.
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiAccessNode, ApiPosition,
  createPosition, getAccessRegistry, getPositionAccess,
  listPositions, removePosition, renamePosition, setPositionAccess,
} from "../_data/api";
import { Card, FinHeader, Flash, btnPrimary, btnPrimaryStyle, input, WRAP } from "./FinanceUI";
import Icon from "./Icon";

type Verdict = boolean | null;

/*  Department hues — the sidebar's own, so nav and this page read as one.  */
const DEPT: Record<string, { text: string; grad: string; icon: string }> = {
  "Today's work":   { text: "var(--t-bad)", grad: "linear-gradient(120deg,var(--f-bad),var(--f-bad))", icon: "clock" },
  "What you sell":  { text: "var(--t-orchid)", grad: "linear-gradient(120deg,var(--o-solid),var(--o-solid))", icon: "star" },
  "Stock & buying": { text: "var(--t-ok)", grad: "linear-gradient(120deg,var(--f-ok),var(--f-ok))", icon: "box" },
  "Money":          { text: "var(--t-warn)", grad: "linear-gradient(120deg,var(--f-warn),var(--f-warn))", icon: "cash" },
  "Growth":         { text: "var(--t-info)", grad: "linear-gradient(120deg,var(--f-info),var(--f-info))", icon: "chart" },
  "Setup":          { text: "var(--t-accent)", grad: "linear-gradient(120deg,var(--a-solid),var(--a-solid))", icon: "gear" },
};
const dept = (d: string) => DEPT[d] ?? DEPT["Setup"];
const DEPT_ORDER = Object.keys(DEPT);

function flatten(nodes: ApiAccessNode[]): ApiAccessNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

export default function AccessControl() {
  /** which template is being renamed, and the name being typed for it */
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [tree, setTree] = useState<ApiAccessNode[]>([]);
  const [positions, setPositions] = useState<ApiPosition[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [rules, setRules] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const flash = (o: string, e = "") => {
    setOk(o); setErr(e);
    setTimeout(() => { setOk(""); setErr(""); }, 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, p] = await Promise.all([getAccessRegistry(), listPositions()]);
      setTree(t); setPositions(p);
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

  /** DEC-ADM-012 — the one capability that is not a screen */
  async function toggleCost(p: ApiPosition) {
    if (p.isOwner) return; // ADM-RULE-004 — never cut back
    setBusy(`cost:${p.id}`);
    setErr(""); setOk("");
    try {
      await renamePosition(p.id, p.name, p.note ?? undefined, !p.canSeeCost);
      setPositions((list) => list.map((x) => (x.id === p.id ? { ...x, canSeeCost: !p.canSeeCost } : x)));
      setOk(!p.canSeeCost
        ? `${p.name} can now see what things cost.`
        : `${p.name} no longer sees cost — the server stops sending it.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save that.");
    } finally { setBusy(null); }
  }
  const nodeCount = useMemo(() => flatten(tree).length, [tree]);

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
      /*  THE LIFT — mirrors effectiveFor (19 Aug 2026): a module left on
          Auto counts as open when any row inside it is explicitly allowed,
          otherwise this page would show "closed" for a module whose one
          allowed screen the menu is about to show.  */
      for (const [k, v] of Object.entries(rules)) {
        if (!v) continue;
        let up = parentOf.get(k) ?? null;
        while (up) {
          if (up === key) return { allowed: true };
          up = parentOf.get(up) ?? null;
        }
      }
      return { allowed: false };
    },
    [rules, parentOf],
  );

  async function tick(nodeKey: string, allowed: Verdict) {
    if (!selected || !position || position.isOwner) return;
    setBusy(nodeKey);
    setSaveState("saving");
    // optimistic — 188 rows; a round-trip per click would crawl
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
    } catch (e) {
      setRules(before); // never show a change the server refused
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

  /*  ⚠️ Typed on the row, not in a `window.prompt()` — a prompt blocks the
      page while it waits and throws the new name away on Escape.  */
  async function rename(p: ApiPosition, name: string) {
    setRenaming(null);
    const n = name.trim();
    if (!n || n === p.name) return;
    try {
      await renamePosition(p.id, n);
      await load();
      flash(`Renamed to "${n}"`);
    } catch (e) { flash("", (e as Error).message); }
  }

  async function drop(p: ApiPosition) {
    if (!window.confirm(`Delete the "${p.name}" template?`)) return;
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
      {/* ── hero ─────────────────────────────────────────────────────── */}
      <div className="rounded-[20px] px-5 py-4 mb-4 relative overflow-hidden"
        style={{ background: "linear-gradient(120deg,var(--a-solid) 0%,var(--a-solid) 42%,var(--o-solid) 74%,var(--t-gold) 100%)" }}>
        <div className="flex items-center gap-3 relative flex-wrap">
          <span className="w-[38px] h-[38px] rounded-[12px] grid place-items-center text-white shrink-0"
            style={{ background: "rgba(255,255,255,0.16)" }}>
            <Icon name="shield" size={18} strokeWidth={2.2} />
          </span>
          <div>
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/70">Setup · Administration</div>
            <h1 className="font-display text-[21px] text-white leading-tight m-0">Access templates</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] font-bold text-white bg-white/[0.16] px-2.5 py-1 rounded-full">{nodeCount} screens</span>
            {position && !position.isOwner && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{
                  background: saveState === "error" ? "var(--s-bad)" : "rgba(255,255,255,0.92)",
                  color: saveState === "error" ? "#fff" : "var(--t-accent)",
                }}>
                {saveState === "saving" && "Saving…"}
                {saveState === "saved" && `Saved ✓ ${savedAt}`}
                {saveState === "error" && "Not saved — try again"}
                {saveState === "idle" && "Saves as you click"}
              </span>
            )}
          </div>
        </div>
      </div>
      <Flash ok={ok} err={err} />

      {/*  The three words, explained once, on the screen itself — the owner
          should never need to remember what a button means.  */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 px-1 text-[11.5px] font-semibold">
        <span className="flex items-center gap-1.5">
          <span className="w-[10px] h-[10px] rounded-[3px]" style={{ background: "var(--s-ok)" }} />
          <span className="text-[var(--t-accent)]">Allow</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-[10px] h-[10px] rounded-[3px]" style={{ background: "var(--s-accent)" }} />
          <span className="text-[var(--t-accent)]">Auto — follows its module</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-[10px] h-[10px] rounded-[3px]" style={{ background: "var(--s-bad)" }} />
          <span className="text-[var(--t-accent)]">Block</span>
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[236px_minmax(0,1fr)] items-start">
        {/* ── templates rail ─────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-4 space-y-2">
          <div className="rounded-[16px] bg-white border border-[var(--l-accent)] overflow-hidden"
            style={{ boxShadow: "0 2px 10px rgba(70,0,102,0.06)" }}>
            <div className="px-3.5 py-2.5 flex items-center gap-2"
              style={{ background: "linear-gradient(120deg,var(--a-solid),var(--o-solid))" }}>
              <span className="text-[11.5px] font-extrabold tracking-[0.1em] uppercase text-white flex-1">Templates</span>
              <button
                className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/90 text-purple hover:bg-white"
                onClick={() => setAdding((a) => !a)}>
                {adding ? "×" : "+ New"}
              </button>
            </div>

            {adding && (
              <div className="p-2.5 border-b border-[var(--l-accent)] flex gap-1.5">
                <input className={input} placeholder="e.g. Counter staff" value={newName} autoFocus
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void addPosition()} />
                <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => void addPosition()}>✓</button>
              </div>
            )}

            <div className="p-1.5">
              {positions.map((p) => {
                const on = p.id === selected;
                return (
                  <button key={p.id} onClick={() => setSelected(p.id)}
                    className="w-full text-left rounded-[11px] px-2.5 py-2 mb-0.5 last:mb-0 transition-colors flex items-center gap-2.5"
                    style={{
                      background: on ? "linear-gradient(120deg,var(--a-solid),var(--o-solid))" : undefined,
                    }}>
                    <span className="w-[26px] h-[26px] rounded-[8px] grid place-items-center text-[12px] font-bold shrink-0"
                      style={{
                        background: on ? "rgba(255,255,255,0.25)" : p.isOwner ? "linear-gradient(135deg,var(--t-gold),var(--t-gold))" : "var(--s-accent)",
                        color: on ? "#fff" : p.isOwner ? "#fff" : "var(--t-accent)",
                      }}>
                      {p.isOwner ? <Icon name="lock" size={12} /> : p.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={"block text-[13px] font-bold truncate " + (on ? "text-white" : "text-[var(--t-accent)]")}>{p.name}</span>
                      <span className={"block text-[10.5px] font-medium " + (on ? "text-white/75" : "text-[var(--t-accent)]")}>
                        {p.isOwner ? "everything, always" : `${p.rules} rules · ${p.people} using it`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {position && !position.isOwner && renaming?.id === position.id && (
              <div className="px-3 py-2 border-t border-[var(--l-accent)] flex items-center gap-2">
                <input
                  autoFocus
                  className="ipt h-[32px] flex-1"
                  value={renaming.value}
                  onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") void rename(position, renaming.value); if (e.key === "Escape") setRenaming(null); }}
                />
                <button className="text-[11px] font-bold text-purple hover:underline" onClick={() => void rename(position, renaming.value)}>Save</button>
                <button className="text-[11px] font-bold text-body-soft hover:underline" onClick={() => setRenaming(null)}>Cancel</button>
              </div>
            )}
            {position && !position.isOwner && renaming?.id !== position.id && (
              <div className="px-3 py-2 border-t border-[var(--l-accent)] flex gap-3">
                <button className="text-[11px] font-bold text-purple hover:underline" onClick={() => setRenaming({ id: position.id, value: position.name })}>Rename</button>
                {!position.isLocked && (
                  <button className="text-[11px] font-bold hover:underline" style={{ color: "var(--t-bad)" }} onClick={() => void drop(position)}>Delete</button>
                )}
              </div>
            )}
          </div>

          <p className="text-[11px] text-[var(--t-accent)] leading-relaxed px-1 m-0">
            Who holds a template: People &amp; accounts.
          </p>
        </div>

        {/* ── the module list — one dense card ───────────────────────── */}
        {!position ? (
          <Card className="p-6 text-center text-[13px] text-body-soft">Pick a template on the left.</Card>
        ) : (
          <div className="rounded-[16px] bg-white border border-[var(--l-accent)] overflow-hidden"
            style={{ boxShadow: "0 2px 10px rgba(70,0,102,0.06)" }}>
            {position.isOwner && (
              <div className="px-4 py-2.5 flex items-center gap-2.5 border-b border-[var(--l-accent)]"
                style={{ background: "var(--s-bad)" }}>
                <Icon name="lock" size={14} strokeWidth={2.4} />
                <span className="text-[12px] font-semibold" style={{ color: "var(--t-bad)" }}>
                  {position.name} sees everything, always — pick another template to shape it.
                </span>
              </div>
            )}

            {/*  DEC-ADM-012 — not a screen, so not a row in the tree below: this says
                 whether the buying price shows AT ALL on the screens this template
                 already has. Off means the server does not even send it.  */}
            <div className="px-4 py-3 border-b border-[var(--l-accent)] flex items-center gap-3 flex-wrap"
              style={{ background: "var(--s-accent)" }}>
              <span className="text-[12.5px] font-bold text-purple">See cost prices</span>
              <span className="text-[11.5px] text-[var(--t-accent)] flex-1 min-w-[220px]">
What the shop paid. The selling price is always visible.
              </span>
              {position.isOwner ? (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                  style={{ background: "var(--s-ok)", color: "var(--t-ok)" }}>Always on</span>
              ) : (
                <button
                  onClick={() => void toggleCost(position)}
                  disabled={busy === `cost:${position.id}`}
                  className="text-[12px] font-bold px-3.5 py-1.5 rounded-full border-2 disabled:opacity-50"
                  style={position.canSeeCost
                    ? { background: "var(--s-ok)", borderColor: "var(--l-ok)", color: "#fff" }
                    : { background: "#fff", borderColor: "var(--l-accent)", color: "var(--t-accent)" }}>
                  {position.canSeeCost ? "On" : "Off"}
                </button>
              )}
            </div>

            {DEPT_ORDER.filter((d) => tree.some((m) => m.domain === d)).map((domain) => {
              const c = dept(domain);
              const mods = tree.filter((m) => m.domain === domain);
              const openCount = mods.filter((m) => effective(m.key).allowed).length;
              return (
                <div key={domain}>
                  {/* department bar — thin, solid gradient */}
                  <div className="flex items-center gap-2 px-4 py-[7px]" style={{ background: c.grad }}>
                    <span className="text-white"><Icon name={c.icon} size={13} strokeWidth={2.4} /></span>
                    <span className="text-[11px] font-extrabold tracking-[0.12em] uppercase text-white flex-1">{domain}</span>
                    <span className="text-[10px] font-bold px-2 py-[1px] rounded-full bg-white/25 text-white">{openCount}/{mods.length}</span>
                  </div>

                  {mods.map((mod) => {
                    const eff = effective(mod.key);
                    const isOpen = open.has(mod.key);
                    return (
                      <div key={mod.key}>
                        <div
                          className="flex items-center gap-2.5 pr-3 py-[9px] border-b border-[var(--l-accent)] hover:bg-[var(--s-accent)] transition-colors"
                          style={{ paddingLeft: 13, borderLeft: `3px solid ${eff.allowed ? c.text : "transparent"}` }}>
                          <button
                            className="flex items-center gap-2 min-w-0 flex-1 text-left"
                            onClick={() => mod.children.length && toggleOpen(mod.key)}>
                            {mod.children.length > 0 ? (
                              <span className="w-[22px] h-[22px] rounded-[7px] grid place-items-center shrink-0 transition-colors"
                                style={{ background: isOpen ? c.text : "var(--s-accent)" }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                                  stroke={isOpen ? "#fff" : c.text} strokeWidth="3.2"
                                  strokeLinecap="round" strokeLinejoin="round"
                                  className={"transition-transform " + (isOpen ? "rotate-90" : "")}>
                                  <path d="M9 6l6 6-6 6" />
                                </svg>
                              </span>
                            ) : (
                              <span className="w-[22px] grid place-items-center shrink-0">
                                <span className="w-[7px] h-[7px] rounded-full"
                                  style={{ background: eff.allowed ? c.text : "var(--s-accent)" }} />
                              </span>
                            )}
                            <span className="text-[14px] font-bold truncate text-[var(--t-accent)]">
                              {mod.label}
                            </span>
                            {mod.children.length > 0 && (
                              <span className="text-[10px] font-bold px-1.5 py-[1px] rounded-full shrink-0"
                                style={{ background: "var(--s-accent)", color: "var(--t-accent)" }}>
                                {mod.children.length}
                              </span>
                            )}
                            <span className="text-[10px] font-bold px-1.5 py-[1px] rounded-full shrink-0"
                              style={{
                                background: eff.allowed ? "var(--s-ok)" : "var(--s-accent)",
                                color: eff.allowed ? "var(--t-ok)" : "var(--t-accent)",
                              }}>
                              {eff.allowed ? "open" : "closed"}
                            </span>
                          </button>
                          <TriState
                            value={mod.key in rules ? rules[mod.key] : null}
                            effective={eff.allowed}
                            disabled={position.isOwner || busy === mod.key}
                            onChange={(v) => void tick(mod.key, v)}
                          />
                        </div>

                        {isOpen && mod.children.length > 0 && (
                          <div style={{ background: "var(--s-accent)" }}>
                            {mod.children.map((sc) => (
                              <ScreenRow key={sc.key} node={sc} depth={0} rules={rules}
                                effective={effective} disabled={position.isOwner}
                                busy={busy} onTick={tick} accent={c.text} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function ScreenRow({
  node, depth, rules, effective, disabled, busy, onTick, accent,
}: {
  node: ApiAccessNode;
  depth: number;
  rules: Record<string, boolean>;
  effective: (k: string) => { allowed: boolean };
  disabled: boolean;
  busy: string | null;
  onTick: (k: string, v: Verdict) => void | Promise<void>;
  accent: string;
}) {
  const eff = effective(node.key);
  const explicit = node.key in rules;
  return (
    <>
      <div
        className="flex items-center gap-2 pr-3 py-[6px] border-b border-[var(--l-accent)] last:border-0"
        style={{ paddingLeft: 34 + depth * 18 }}
      >
        <span className="w-[7px] h-[7px] rounded-full shrink-0"
          style={{ background: eff.allowed ? accent : "var(--s-accent)" }} />
        <span className="text-[13px] font-semibold flex-1 truncate text-[var(--t-accent)]">
          {node.label}
          {explicit && (
            <span className="text-[9.5px] font-bold ml-1.5 px-1.5 py-[1px] rounded-full align-middle"
              style={{ background: "var(--s-accent)", color: "var(--t-accent)" }}>own rule</span>
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
        <ScreenRow key={c.key} node={c} depth={depth + 1} rules={rules}
          effective={effective} disabled={disabled} busy={busy} onTick={onTick} accent={accent} />
      ))}
    </>
  );
}

/** Allow · Inherit · Block — three states, crisp and solid when chosen */
function TriState({
  value, effective, disabled, onChange,
}: {
  value: Verdict;
  effective: boolean;
  disabled: boolean;
  onChange: (v: Verdict) => void;
}) {
  const opts: {
    v: Verdict; label: string;
    on: string; onText: string; offBg: string; offText: string;
  }[] = [
    { v: true,  label: "Allow",   on: "linear-gradient(135deg,var(--f-ok),var(--f-ok))", onText: "#fff",    offBg: "var(--s-ok)", offText: "var(--t-ok)" },
    { v: null,  label: "Auto", on: "var(--t-accent)",                                  onText: "#fff",    offBg: "var(--s-accent)", offText: "var(--t-accent)" },
    { v: false, label: "Block",   on: "linear-gradient(135deg,var(--f-bad),var(--f-bad))",  onText: "#fff",    offBg: "var(--s-bad)", offText: "var(--t-bad)" },
  ];
  return (
    <div className="flex rounded-[9px] overflow-hidden shrink-0 gap-[3px] p-[3px]"
      style={{ background: "var(--s-accent)" }}>
      {opts.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={String(o.v)}
            disabled={disabled}
            onClick={() => onChange(o.v)}
            className="text-[11px] px-2.5 py-[4px] font-bold rounded-[6px] transition-all disabled:opacity-40"
            style={{
              background: on ? o.on : o.offBg,
              color: on ? o.onText : o.offText,
              boxShadow: on ? "0 1px 4px rgba(40,20,55,0.25)" : undefined,
            }}
            title={
              o.v === null
                ? `Follows the module above — right now ${effective ? "open" : "closed"}`
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
