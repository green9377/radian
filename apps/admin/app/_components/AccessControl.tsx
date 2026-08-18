"use client";

/*
  ACCESS CONTROL — the one list (ADM-RULE-001), owner only.
  RADIAN_ADMINISTRATION_MODULE_ARCHITECTURE.md, 30 Jul 2026 · redesigned 18 Aug 2026.

  Why this screen exists: "who can do what" used to live in three places that
  never agreed. Now there is one list, on the server, and this screen is the
  only way to change it.

  How a tick behaves (§5): a position inherits DOWN the tree; only the
  EXCEPTIONS are stored. Three states per node — Allow, Block, Inherit.

  ── 18 Aug redesign, all four by the owner's direct ruling ────────────────
  1. The "N screens reach nobody" banner is GONE from this page. New screens
     will always arrive here as modules are built; shouting about it every
     visit was noise, not safety. (The fail-closed behaviour itself is
     unchanged — an undecided screen still reaches nobody.)
  2. The enforcement/would-block panel is GONE from this page. It reports a
     background stage the owner does not need in his face while assigning
     access; the same report still lives on the Administration overview.
  3. The tree is six DEPARTMENT cards in the exact hues the sidebar wears,
     gradient headers, bold pills — not a grey list.
  4. Positions are a card gallery on top; People moved into a styled right
     rail (AccessPeople). Layout: hero → positions → tree + people.

  ⚠️ UI text is ENGLISH. Bangla is for talking to the owner, never the screen.
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiAccessNode, ApiPosition,
  createPosition, getAccessRegistry, getPositionAccess,
  listPositions, removePosition, renamePosition, setPositionAccess,
} from "../_data/api";
import { Card, FinHeader, Flash, btnPrimary, btnPrimaryStyle, input, WRAP } from "./FinanceUI";
import Icon from "./Icon";
import AccessPeople from "./AccessPeople";

type Verdict = boolean | null;

/*  Department colours — the SAME hues the sidebar wears, so the tree here and
    the nav read as one system.  */
const DEPT: Record<string, { bar: string; text: string; soft: string; grad: string; icon: string }> = {
  "Today's work":   { bar: "#f0a8b8", text: "#c25a72", soft: "#fdf1f4", grad: "linear-gradient(120deg,#c25a72,#f0a8b8)", icon: "clock" },
  "What you sell":  { bar: "#e07be0", text: "#a021b8", soft: "#fbeffb", grad: "linear-gradient(120deg,#a021b8,#e07be0)", icon: "star" },
  "Stock & buying": { bar: "#5ec9a8", text: "#12a172", soft: "#eaf8f2", grad: "linear-gradient(120deg,#12a172,#5ec9a8)", icon: "box" },
  "Money":          { bar: "#e9c46a", text: "#b07818", soft: "#fdf6e7", grad: "linear-gradient(120deg,#b07818,#e9c46a)", icon: "cash" },
  "Growth":         { bar: "#7fb4f0", text: "#3b76c4", soft: "#eef5fd", grad: "linear-gradient(120deg,#3b76c4,#7fb4f0)", icon: "chart" },
  "Setup":          { bar: "#b9aecf", text: "#7a6f96", soft: "#f4f1f8", grad: "linear-gradient(120deg,#7a6f96,#b9aecf)", icon: "gear" },
};
const dept = (d: string) => DEPT[d] ?? DEPT["Setup"];
const DEPT_ORDER = Object.keys(DEPT);

function flatten(nodes: ApiAccessNode[]): ApiAccessNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

export default function AccessControl() {
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

  /*  Every tick is written the moment it is clicked; the hero pill says so.  */
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
      return { allowed: false };
    },
    [rules, parentOf],
  );

  async function tick(nodeKey: string, allowed: Verdict) {
    if (!selected || !position || position.isOwner) return;
    setBusy(nodeKey);
    setSaveState("saving");
    // optimistic — the tree is 188 rows and a round-trip per click would crawl
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
      {/* ── hero ─────────────────────────────────────────────────────── */}
      <div className="rounded-[22px] px-6 py-5 mb-5 relative overflow-hidden"
        style={{ background: "linear-gradient(120deg,#470066 0%,#8a2bb0 42%,#cf43ea 74%,#b76e79 100%)" }}>
        <div className="absolute -right-10 -top-14 w-[220px] h-[220px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle,#fff,transparent 70%)" }} />
        <div className="flex items-center gap-3.5 relative flex-wrap">
          <span className="w-[42px] h-[42px] rounded-[13px] grid place-items-center text-white shrink-0"
            style={{ background: "rgba(255,255,255,0.16)" }}>
            <Icon name="shield" size={20} strokeWidth={2.2} />
          </span>
          <div>
            <div className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-white/70">Setup · Administration</div>
            <h1 className="font-display text-[24px] text-white leading-tight m-0">Access control</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11.5px] font-bold text-white bg-white/[0.16] px-3 py-1.5 rounded-full">{nodeCount} screens</span>
            {position && !position.isOwner && (
              <span className="text-[11.5px] font-bold px-3 py-1.5 rounded-full"
                style={{
                  background: saveState === "error" ? "#c0392b" : "rgba(255,255,255,0.92)",
                  color: saveState === "error" ? "#fff" : "#7a2ea8",
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

      {/* ── positions — the template gallery ─────────────────────────── */}
      <div className="flex gap-3 mb-5 overflow-x-auto pb-1 scrollbar-none">
        {positions.map((p) => {
          const on = p.id === selected;
          const grad = p.isOwner
            ? "linear-gradient(135deg,#b76e79,#e0a8a0)"
            : "linear-gradient(135deg,#8a2bb0,#cf43ea)";
          return (
            <button key={p.id} onClick={() => setSelected(p.id)}
              className="rounded-[16px] px-4 py-3 min-w-[190px] text-left transition-all border-2 shrink-0"
              style={{
                background: on ? "#fff" : "rgba(255,255,255,0.6)",
                borderColor: on ? "#cf43ea" : "transparent",
                boxShadow: on ? "0 6px 18px rgba(160,33,184,0.18)" : "0 1px 4px rgba(70,0,102,0.06)",
              }}>
              <div className="flex items-center gap-2.5">
                <span className="w-[34px] h-[34px] rounded-[11px] grid place-items-center text-[14px] font-bold text-white shrink-0"
                  style={{ background: grad }}>
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-bold text-purple truncate">{p.name}</div>
                  <div className="text-[11px] text-body-soft">
                    {p.isOwner ? "sees everything" : `${p.people} ${p.people === 1 ? "person" : "people"} · ${p.rules} rules`}
                  </div>
                </div>
              </div>
              {on && !p.isOwner && (
                <div className="flex gap-3 mt-2 pt-2 border-t border-[#f3eef8]">
                  <span role="button" tabIndex={0} className="text-[11px] font-bold text-purple hover:underline"
                    onClick={(e) => { e.stopPropagation(); void rename(p); }}
                    onKeyDown={(e) => e.key === "Enter" && (e.stopPropagation(), void rename(p))}>
                    Rename
                  </span>
                  {!p.isLocked && (
                    <span role="button" tabIndex={0} className="text-[11px] font-bold hover:underline" style={{ color: "#c0392b" }}
                      onClick={(e) => { e.stopPropagation(); void drop(p); }}
                      onKeyDown={(e) => e.key === "Enter" && (e.stopPropagation(), void drop(p))}>
                      Delete
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}

        {/* new position card */}
        <div className="rounded-[16px] px-4 py-3 min-w-[190px] shrink-0 border-2 border-dashed grid place-items-center"
          style={{ borderColor: "#dcc9ec", background: "rgba(255,255,255,0.45)" }}>
          {adding ? (
            <div className="flex gap-1.5 w-full">
              <input className={input} placeholder="e.g. Accountant" value={newName} autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addPosition()} />
              <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => void addPosition()}>Save</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="flex items-center gap-2 text-[13px] font-bold text-purple">
              <span className="w-[28px] h-[28px] rounded-[9px] grid place-items-center text-white"
                style={{ background: "linear-gradient(135deg,#8a2bb0,#cf43ea)" }}>
                <Icon name="plus" size={15} strokeWidth={2.6} />
              </span>
              New position
            </button>
          )}
        </div>
      </div>

      {/* ── tree + people ─────────────────────────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px] items-start">
        <div>
          {position?.isOwner && (
            <Card className="p-4 mb-4 flex items-center gap-3"
              style={{ background: "#fbf0ec", borderColor: "#eed7d0" }}>
              <span className="w-[30px] h-[30px] rounded-[10px] grid place-items-center text-white shrink-0"
                style={{ background: "linear-gradient(135deg,#b76e79,#e0a8a0)" }}>
                <Icon name="lock" size={15} />
              </span>
              <p className="text-[12.5px] m-0" style={{ color: "#8d5560" }}>
                <b>{position.name}</b> sees everything, always — the last door into your
                own business cannot be narrowed. Pick another position to shape it.
              </p>
            </Card>
          )}

          {!position ? (
            <Card className="p-6 text-center text-[13px] text-body-soft">Pick a position above.</Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {DEPT_ORDER.filter((d) => tree.some((m) => m.domain === d)).map((domain) => {
                const c = dept(domain);
                const mods = tree.filter((m) => m.domain === domain);
                const openCount = mods.filter((m) => effective(m.key).allowed).length;
                return (
                  <div key={domain} className="rounded-[18px] bg-white overflow-hidden border h-fit"
                    style={{ borderColor: `${c.text}1f`, boxShadow: `0 2px 10px ${c.text}10` }}>
                    {/* department header — gradient strip */}
                    <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ background: c.grad }}>
                      <span className="text-white"><Icon name={c.icon} size={15} strokeWidth={2.3} /></span>
                      <span className="text-[12px] font-extrabold tracking-[0.1em] uppercase text-white flex-1">{domain}</span>
                      <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-white/25 text-white">
                        {openCount}/{mods.length} open
                      </span>
                    </div>

                    <div className="p-2.5 space-y-1">
                      {mods.map((mod) => {
                        const eff = effective(mod.key);
                        const isOpen = open.has(mod.key);
                        return (
                          <div key={mod.key} className="rounded-[12px] overflow-hidden"
                            style={{ background: eff.allowed ? c.soft : "#faf9fb" }}>
                            <div className="flex items-center gap-2 px-2.5 py-2">
                              <button className="w-5 h-5 grid place-items-center rounded-[6px] text-[10px] shrink-0"
                                style={{ background: mod.children.length ? `${c.text}18` : "transparent", color: c.text }}
                                onClick={() => toggleOpen(mod.key)} aria-label="Expand">
                                {mod.children.length ? (isOpen ? "▾" : "▸") : ""}
                              </button>
                              <span className="text-[13px] font-semibold flex-1 truncate"
                                style={{ color: eff.allowed ? "#3f3a4a" : "#9a93a8" }}>
                                {mod.label}
                              </span>
                              <TriState
                                value={mod.key in rules ? rules[mod.key] : null}
                                effective={eff.allowed}
                                disabled={position.isOwner || busy === mod.key}
                                onChange={(v) => void tick(mod.key, v)}
                              />
                            </div>

                            {isOpen && mod.children.length > 0 && (
                              <div className="bg-white/70 mx-2 mb-2 rounded-[10px]">
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
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* people rail — sticky, its own scroll */}
        <div className="xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
          <AccessPeople
            positions={positions}
            selectedPositionId={selected}
            onChanged={() => void listPositions().then(setPositions)}
          />
        </div>
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
        className="flex items-center gap-2 px-3 py-1.5 border-b border-[#f4f1f8] last:border-0"
        style={{ paddingLeft: 12 + depth * 18 }}
      >
        <span className="w-[6px] h-[6px] rounded-full shrink-0"
          style={{ background: eff.allowed ? accent : "#ddd7e6" }} />
        <span className="text-[12.5px] flex-1 truncate"
          style={{ color: eff.allowed ? "#3f3a4a" : "#a9a3b5" }}>
          {node.label}
          {!explicit && (
            <span className="text-[10px] text-body-soft ml-1.5">
              · {eff.allowed ? "inherits open" : "inherits closed"}
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
        <ScreenRow key={c.key} node={c} depth={depth + 1} rules={rules}
          effective={effective} disabled={disabled} busy={busy} onTick={onTick} accent={accent} />
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
  const opts: { v: Verdict; label: string }[] = [
    { v: true, label: "Allow" },
    { v: null, label: "Inherit" },
    { v: false, label: "Block" },
  ];
  return (
    <div className="flex rounded-[9px] overflow-hidden border border-[#e7e2ef] shrink-0 bg-white">
      {opts.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={String(o.v)}
            disabled={disabled}
            onClick={() => onChange(o.v)}
            className="text-[10.5px] px-2.5 py-1 font-bold transition disabled:opacity-40"
            style={{
              background: on
                ? (o.v === true ? "linear-gradient(135deg,#12a172,#5ec9a8)"
                  : o.v === false ? "linear-gradient(135deg,#c0392b,#e87a6e)"
                  : "#eceaf1")
                : "#fff",
              color: on ? (o.v === null ? "#6b6478" : "#fff") : "#b3acc2",
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
