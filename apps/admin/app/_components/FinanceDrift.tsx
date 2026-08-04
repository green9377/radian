"use client";

/*
  DOES THE BOOK STILL MATCH THE SHOP? (gap G1)

  Every other Finance screen reads the ledger and trusts it. This one does the
  opposite: it asks the operational tables the same questions and shows where
  the two disagree.

  Why that matters more than it sounds: a ledger can be completely wrong and
  still look perfect. The trial balance balances, every report adds up, nothing
  is red — because the books are consistent WITH THEMSELVES. The only way to
  catch a sale that never posted, or a supplier bill entered by hand, is to
  compare against the side that actually happened.

  Nothing here writes anything. A checker that quietly "repaired" a difference
  would destroy the very evidence you need to find out how it happened.
*/

import { useCallback, useEffect, useState } from "react";
import {
  ApiDriftCheck, ApiDriftReport, ApiDriftRun, DriftSeverity,
  financeDrift, financeDriftHistory, runFinanceDrift,
} from "../_data/api";
import {
  Banner, Card, Empty, FinHeader, Kpi, Panel, Table, Td, Th, TONE, WRAP,
  btnGhost, btnPrimary, btnPrimaryStyle, taka,
} from "./FinanceUI";

const LOOK: Record<DriftSeverity, { tone: keyof typeof TONE; emoji: string; word: string }> = {
  ok: { tone: "emerald", emoji: "✓", word: "Matches" },
  watch: { tone: "amber", emoji: "!", word: "Small gap" },
  wrong: { tone: "rose", emoji: "✕", word: "Does not match" },
};

export default function FinanceDrift() {
  const [rep, setRep] = useState<ApiDriftReport | null>(null);
  const [past, setPast] = useState<ApiDriftRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  /*  Two different things, on purpose:
      look()  — just show me the position now, leave no trace
      record() — the same check the 2 AM job runs, written into the history */
  const look = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const [r, h] = await Promise.all([financeDrift(), financeDriftHistory()]);
      setRep(r); setPast(h);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, []);

  const record = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      setRep(await runFinanceDrift());
      setPast(await financeDriftHistory());
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { void look(); }, [look]);

  const headline =
    !rep ? "Checking…"
      : rep.worst === "ok" ? "The books match the shop"
      : rep.worst === "watch" ? "Small differences — worth a look"
      : "Something does not match";

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Finance"
        title="Books vs reality"
        sub="The ledger can be wrong and still look perfect, because it is consistent with itself. This screen compares it against what the shop actually did."
        tone={rep ? LOOK[rep.worst].tone : "brand"}
        right={
          <div className="flex gap-2">
            <button className={btnGhost} disabled={busy} onClick={() => void look()}>
              {busy ? "Checking…" : "Check again"}
            </button>
            <button className={btnPrimary} style={btnPrimaryStyle} disabled={busy} onClick={() => void record()}>
              Check and save
            </button>
          </div>
        }
      />

      {err && <Banner tone="rose" emoji="⚡" title="Could not run the check">{err}</Banner>}

      {rep && (
        <>
          <div className="grid gap-3 md:grid-cols-3 mb-5">
            <Kpi label="VERDICT" value={headline} tone={LOOK[rep.worst].tone} emoji={LOOK[rep.worst].emoji} />
            <Kpi label="DOES NOT MATCH" value={String(rep.wrongCount)} tone={rep.wrongCount ? "rose" : "emerald"} emoji="✕"
              hint={rep.wrongCount ? "needs fixing" : "none"} />
            <Kpi label="WORTH A LOOK" value={String(rep.watchCount)} tone={rep.watchCount ? "amber" : "emerald"} emoji="!"
              hint={rep.watchCount ? "small gaps" : "none"} />
          </div>

          <Panel
            tone={rep.worst === "ok" ? "emerald" : rep.worst === "watch" ? "amber" : "rose"}
            emoji="🔍"
            title="What was compared"
            sub={`checked ${new Date(rep.ranAt).toLocaleString()}`}
          >
            {rep.checks.length === 0 ? (
              <Empty title="Nothing to compare yet" sub="Once orders and purchases start flowing, this fills up." />
            ) : (
              <div className="grid gap-3">
                {[...rep.checks]
                  .sort((a, b) => rank(b.severity) - rank(a.severity))
                  .map((c) => <Row key={c.key + c.title} c={c} />)}
              </div>
            )}
          </Panel>

          <Panel
            tone="slate"
            emoji="🌙"
            title="Past checks"
            sub="runs by itself at 2 AM, and after a restart if a night was missed"
            className="mt-5"
          >
            {past.length === 0 ? (
              <Empty
                title="No check has been saved yet"
                sub="The first one lands tonight at 2 AM — or press “Check and save” to start the history now."
              />
            ) : (
              <Table head={<tr><Th>When</Th><Th>Verdict</Th><Th>What did not match</Th><Th>Why it ran</Th></tr>}>
                {past.map((h) => (
                  <tr key={h.id}>
                    <Td>{new Date(h.ranAt).toLocaleString()}</Td>
                    <Td>
                      <span className="text-[11px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 rounded-full"
                        style={{ background: TONE[LOOK[h.worst].tone].soft, color: TONE[LOOK[h.worst].tone].text }}>
                        {LOOK[h.worst].word}
                      </span>
                    </Td>
                    <Td>
                      {h.problems.length === 0
                        ? <span className="text-[12.5px] text-body-soft">everything matched</span>
                        : <span className="text-[12.5px]">{h.problems.map((x) => x.title).join(" · ")}</span>}
                    </Td>
                    <Td><span className="text-[12px] text-body-soft">{h.reason}</span></Td>
                  </tr>
                ))}
              </Table>
            )}
            <p className="text-[12.5px] text-body-soft mt-3 mb-0">
              Every result is kept, not only the bad ones — otherwise you cannot tell
              “the books have matched every night this month” from “nobody has checked since March”.
              Knowing the night the difference <i>started</i> is usually what tells you what caused it.
            </p>
          </Panel>

          <Panel tone="sky" emoji="💡" title="How to read this" className="mt-5">
            <div className="text-[13px] text-body-soft leading-relaxed">
              <p className="mt-0">
                <b className="text-purple">Books say</b> is what the ledger holds.{" "}
                <b className="text-purple">Shop says</b> is the same number worked out from orders,
                purchases, stock and deliveries — the side where the thing actually happened.
              </p>
              <p>
                A difference is not automatically theft or a bug. The three usual causes, in order of
                how often they turn up: something was entered on one side only, a cost was edited after
                the fact, or a posting failed while the API was down and is still sitting in the replay queue.
              </p>
              <p className="mb-0">
                Nothing on this screen changes anything. Fix the cause, then check again.
              </p>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function rank(s: DriftSeverity) {
  return s === "wrong" ? 2 : s === "watch" ? 1 : 0;
}

function Row({ c }: { c: ApiDriftCheck }) {
  const look = LOOK[c.severity];
  const t = TONE[look.tone];
  const showMoney = c.booksPaisa !== null && c.realPaisa !== null;

  return (
    <Card className="px-4 py-4" style={{ borderColor: c.severity === "ok" ? "#eee6f4" : t.ring }}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-7 h-7 rounded-full grid place-items-center text-white text-[14px] font-bold shrink-0"
          style={{ background: t.grad }}>{look.emoji}</div>

        <div className="flex-1 min-w-[240px]">
          <div className="text-[14.5px] font-bold text-purple">{c.title}</div>
          <div className="text-[12.5px] text-body-soft mt-0.5 leading-snug">{c.why}</div>

          {showMoney && (
            <div className="flex gap-5 mt-3 flex-wrap text-[13px]">
              <span className="text-body-soft">Books say <b className="text-purple">{taka(c.booksPaisa!)}</b></span>
              <span className="text-body-soft">Shop says <b className="text-purple">{taka(c.realPaisa!)}</b></span>
              <span className="text-body-soft">
                Difference{" "}
                <b style={{ color: c.severity === "ok" ? "#0f7d55" : t.text }}>
                  {c.diffPaisa! > 0 ? "+" : ""}{taka(c.diffPaisa!)}
                </b>
              </span>
            </div>
          )}

          {c.count !== undefined && (
            <div className="mt-3 text-[13px] text-body-soft">
              <b style={{ color: c.count ? t.text : "#0f7d55" }}>{c.count}</b>{" "}
              {c.count === 1 ? "item" : "items"}
              {c.examples && c.examples.length > 0 && (
                <span className="text-[12px]"> · {c.examples.join(" · ")}
                  {c.count > c.examples.length && ` … and ${c.count - c.examples.length} more`}</span>
              )}
            </div>
          )}

          <div className="mt-2.5 px-3 py-2 rounded-[10px] text-[12.5px]"
            style={{ background: c.severity === "ok" ? "#f6fbf8" : t.soft, color: c.severity === "ok" ? "#0f7d55" : t.text }}>
            {c.advice}
          </div>
        </div>

        <div className="text-[11px] font-bold uppercase tracking-[0.07em] px-2.5 py-1 rounded-full shrink-0"
          style={{ background: t.soft, color: t.text }}>{look.word}</div>
      </div>
    </Card>
  );
}
