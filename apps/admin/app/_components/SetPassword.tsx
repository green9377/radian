"use client";

/*
  SET PASSWORD — the page a one-time link opens.
  RADIAN_ADMINISTRATION_MODULE_ARCHITECTURE.md, 30 Jul 2026

  The owner's requirement: whoever is given access by email sets their OWN
  password, and can fix it themselves by email if they forget. So this page is
  reachable with no session at all — that is the point of it.

  It handles both cases, because they are the same act:
    INVITE — a brand new account choosing a password for the first time
    RESET  — an existing account choosing a new one

  ⚠️ It never sets or resets a PIN. Money actions need the 4-digit PIN, and if
  a PIN could be reset from an inbox then whoever holds the inbox holds the
  power to move money. PIN reset stays with the owner, face to face.
  (ADM-RULE-006)
*/

import { useEffect, useState } from "react";
import { checkSetPasswordToken, submitNewPassword } from "../_data/api";

type Check = Awaited<ReturnType<typeof checkSetPasswordToken>>;

export default function SetPassword() {
  const [token, setToken] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
    if (!t) { setCheck({ valid: false }); return; }
    checkSetPasswordToken(t).then(setCheck).catch(() => setCheck({ valid: false }));
  }, []);

  async function save() {
    setErr("");
    if (pw.length < 6) { setErr("Use at least 6 characters"); return; }
    if (pw !== again) { setErr("The two passwords do not match"); return; }
    setBusy(true);
    try {
      await submitNewPassword(token!, pw);
      setDone(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-12"
         style={{ background: "linear-gradient(160deg,#faf6fc,#f3ecf7)" }}>
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-6">
          <div className="font-display text-[26px]" style={{ color: "#7c1a92" }}>Radian</div>
          <div className="text-[12px] text-body-soft mt-0.5">Admin</div>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgba(80,40,100,0.10)]">
          {check === null && <p className="text-[13px] text-body-soft">Checking the link…</p>}

          {check && !check.valid && (
            <>
              <h1 className="font-display text-[19px] text-purple mb-2">This link no longer works</h1>
              <p className="text-[13px] text-body leading-relaxed">
                It may have expired, or it may already have been used — each link
                works once, on purpose.
              </p>
              <p className="text-[13px] text-body leading-relaxed mt-3">
                Ask the owner for a new one, or use <strong>Forgot password</strong>
                {" "}on the sign-in screen.
              </p>
              <a href="/" className="inline-block mt-5 text-[12.5px] font-semibold text-purple">
                ← Back to sign in
              </a>
            </>
          )}

          {check?.valid && done && (
            <>
              <h1 className="font-display text-[19px] text-purple mb-2">Password set</h1>
              <p className="text-[13px] text-body leading-relaxed">
                You can sign in with <strong>{check.email}</strong> and the
                password you just chose.
              </p>
              {/*  Every existing session for this account was dropped server-side.
                  If the reason for resetting was that somebody else got in,
                  leaving their session alive would make the reset decorative.  */}
              <p className="text-[11.5px] text-body-soft leading-relaxed mt-2">
                Any device that was already signed in to this account has been
                signed out.
              </p>
              <a href="/" className="inline-block mt-5 text-[12.5px] font-semibold text-purple">
                Go to sign in →
              </a>
            </>
          )}

          {check?.valid && !done && (
            <>
              <h1 className="font-display text-[19px] text-purple mb-1">
                {check.kind === "INVITE" ? "Choose your password" : "Set a new password"}
              </h1>
              <p className="text-[12.5px] text-body-soft leading-relaxed mb-4">
                {check.kind === "INVITE"
                  ? `Welcome, ${check.name}. Pick a password only you know — nobody else will ever see it.`
                  : `For ${check.email}.`}
              </p>

              <label className="text-[11.5px] font-semibold text-body-soft mb-1 block">
                New password
              </label>
              <input
                type="password"
                className="w-full rounded-xl border border-[#e7dff0] px-3 py-2 text-[13px] mb-3 outline-none focus:border-orchid"
                value={pw}
                autoFocus
                autoComplete="new-password"
                onChange={(e) => setPw(e.target.value)}
              />

              <label className="text-[11.5px] font-semibold text-body-soft mb-1 block">
                Type it again
              </label>
              <input
                type="password"
                className="w-full rounded-xl border border-[#e7dff0] px-3 py-2 text-[13px] outline-none focus:border-orchid"
                value={again}
                autoComplete="new-password"
                onChange={(e) => setAgain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void save()}
              />

              {err && (
                <div className="mt-3 text-[12px] rounded-lg px-3 py-2"
                     style={{ background: "#fdecec", color: "#991b1b" }}>
                  {err}
                </div>
              )}

              <button
                disabled={busy}
                onClick={() => void save()}
                className="w-full mt-4 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#a021b8,#d98cb3)" }}
              >
                {busy ? "Saving…" : "Save password"}
              </button>

              <p className="text-[11px] text-body-soft leading-relaxed mt-3">
                This does not set a PIN. Money actions need a 4-digit PIN, and
                only the owner can give you one — never by email.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
