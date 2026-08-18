"use client";

/*
  ACTIVITY — the audit trail and the live sessions, ONE page.
  Owner, 18 Aug 2026: "audit and signed now ai 2 ta module k akta module a
  niye aso — ak pataw, alada alada dorkar nai."

  Both answer the same question at different distances: who is doing what.
  The trail is the past tense, the sessions are the present tense. Two tabs
  on one brand hero; ?tab=sessions deep-links straight to the live view
  (the overview's "Signed in now" tile points there).

  The two bodies stay in their own files (AuditView, SessionsScreen) with an
  `embedded` switch — this page is only the roof over them.
*/

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { WRAP } from "./FinanceUI";
import Icon from "./Icon";
import { AuditView } from "./AuditView";
import { SessionsScreen } from "./AdminSystem";

const GRAD_HERO = "linear-gradient(120deg,#470066 0%,#8a2bb0 42%,#cf43ea 74%,#b76e79 100%)";

function ActivityCenterInner() {
  const params = useSearchParams();
  const [tab, setTab] = useState<"activity" | "sessions">(
    params.get("tab") === "sessions" ? "sessions" : "activity",
  );

  const tabs: { id: "activity" | "sessions"; label: string; icon: string }[] = [
    { id: "activity", label: "Activity & audit", icon: "search" },
    { id: "sessions", label: "Signed in now", icon: "eye" },
  ];

  return (
    <div className={WRAP}>
      {/* ── hero with the two tabs inside it ─────────────────────────── */}
      <div className="rounded-[20px] px-5 py-4 mb-5 relative overflow-hidden" style={{ background: GRAD_HERO }}>
        <div className="flex items-center gap-3 relative flex-wrap">
          <span className="w-[38px] h-[38px] rounded-[12px] grid place-items-center text-white shrink-0"
            style={{ background: "rgba(255,255,255,0.16)" }}>
            <Icon name="clock" size={18} strokeWidth={2.2} />
          </span>
          <div>
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/70">Setup · Administration</div>
            <h1 className="font-display text-[21px] text-white leading-tight m-0">Activity</h1>
          </div>

          <div className="ml-auto flex rounded-[12px] p-[3px] gap-[3px]" style={{ background: "rgba(255,255,255,0.14)" }}>
            {tabs.map((t) => {
              const on = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className="flex items-center gap-1.5 text-[12px] font-bold px-3.5 py-1.5 rounded-[9px] transition-colors"
                  style={{
                    background: on ? "#fff" : "transparent",
                    color: on ? "#7a2ea8" : "rgba(255,255,255,0.85)",
                  }}>
                  <Icon name={t.icon} size={13} strokeWidth={2.4} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {tab === "activity" ? <AuditView embedded /> : <SessionsScreen embedded />}
    </div>
  );
}

export default function ActivityCenter() {
  return (
    <Suspense fallback={<div className={WRAP} />}>
      <ActivityCenterInner />
    </Suspense>
  );
}
