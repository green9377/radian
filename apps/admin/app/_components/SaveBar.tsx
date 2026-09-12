"use client";

import Icon from "./Icon";

/*
  The save indicator for the screens that save as you type.

  ⚠️ WHY THIS EXISTS. Three of the storefront screens commit each field the
  moment focus leaves it — genuinely safer than a Save button, because nothing
  can be lost by closing a tab. But the owner asked for a Save button three
  separate times, and that is not a preference to argue with: he could not tell
  whether his change had landed, and a two-second green flash at the top of a
  long page is not an answer.

  So both. The saving still happens on blur — that part was right. What was
  missing was a permanent, honest statement of where things stand:

    "All changes saved"  · nothing outstanding
    "Saving…"            · a request is in flight
    "Not saved"          · the last one failed, and the reason is above

  The button is not decoration. A text box that still has the cursor in it has
  not been committed yet, and clicking the button blurs it first — which is
  exactly what a person means when they reach for Save.
*/

export type SaveState = "idle" | "saving" | "saved" | "error";

export default function SaveBar({ state, onSave }: { state: SaveState; onSave?: () => void }) {
  const look =
    state === "error"
      ? { bg: "bg-[var(--s-bad)]", border: "border-[var(--l-bad)]", text: "text-[var(--t-bad)]", icon: "alert", label: "Not saved — see the message above" }
      : state === "saving"
        ? { bg: "bg-[var(--s-warn)]", border: "border-[var(--l-warn)]", text: "text-[var(--t-warn)]", icon: "clock", label: "Saving…" }
        : { bg: "bg-[var(--s-ok)]", border: "border-[var(--l-ok)]", text: "text-[var(--t-ok)]", icon: "check", label: "All changes saved" };

  return (
    <div className={`sticky top-0 z-20 -mx-6 px-6 py-2.5 mb-5 flex items-center justify-between gap-3 border-b ${look.bg} ${look.border}`}>
      <span className={`inline-flex items-center gap-2 text-[12.5px] font-medium ${look.text}`}>
        <Icon name={look.icon} size={14} /> {look.label}
      </span>
      <button
        onClick={() => {
          // commit whatever still has the cursor in it, then let the caller
          // decide whether anything else needs flushing
          (document.activeElement as HTMLElement | null)?.blur?.();
          onSave?.();
        }}
        className="bg-purple hover:bg-purple-deep text-white text-[12.5px] font-medium px-4 py-1.5 rounded-[9px] shrink-0"
      >
        Save
      </button>
    </div>
  );
}
