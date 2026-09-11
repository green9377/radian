"use client";

/*
  The door (DEC-FIN-028).

  Until now anyone who opened the admin panel could do anything, and every
  action recorded a TYPED name — so "who approved this refund" was a claim, not
  a fact. Now: sign in once a day, and re-confirm with a 4-digit PIN at the
  moment money actually moves.

  The token lives in localStorage and is attached to every API call by
  _data/api.ts. The PIN is never stored — it is asked for each time.
*/

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { API_BASE, forgotPassword, setAuthToken } from "../_data/api";
import { Card, Flash, TONE, btnGhost, btnPrimary, btnPrimaryStyle, input, Lbl } from "./FinanceUI";

export interface Me { id: string; name: string; username: string; role: string; hasPin: boolean }

interface Ctx {
  me: Me | null;
  signOut: () => void;
  /** ask for the PIN, then run the action with it — the money-action wrapper */
  withPin: <T>(run: (pin: string) => Promise<T>) => Promise<T | undefined>;
}
const AuthCtx = createContext<Ctx>({ me: null, signOut: () => {}, withPin: async () => undefined });
export const useAuth = () => useContext(AuthCtx);

const TOKEN_KEY = "radian.token";

/*  Pages that must work with NO session, because needing one would be circular.
    /set-password is opened from an invite or reset link: an invited person has
    no password yet, and somebody who forgot theirs cannot sign in to fix it.
    Putting that page behind the gate is a locked door with the key inside.

    Kept as an explicit list, not a guess: anything not named here still needs
    signing in, so a new page is private by default (DEC-FIN-028).  */
export const NO_SESSION_PATHS = ["/set-password"];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [openPage, setOpenPage] = useState(false);

  useEffect(() => {
    setOpenPage(NO_SESSION_PATHS.some((p) => window.location.pathname.startsWith(p)));
  }, []);

  const [ready, setReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [offline, setOffline] = useState(false);

  // PIN prompt state
  const [pinAsk, setPinAsk] = useState<null | { resolve: (v: string | null) => void }>(null);
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState("");

  const boot = useCallback(async () => {
    try {
      const st = await (await fetch(`${API_BASE}/auth/status`, { cache: "no-store" })).json();
      setNeedsSetup(st.needsSetup);
      const token = window.localStorage.getItem(TOKEN_KEY);
      if (token && !st.needsSetup) {
        setAuthToken(token);
        const r = await fetch(`${API_BASE}/auth/me`, { headers: { "x-radian-token": token } });
        if (r.ok) setMe(await r.json());
        else { window.localStorage.removeItem(TOKEN_KEY); setAuthToken(null); }
      }
      setOffline(false);
    } catch { setOffline(true); }
    finally { setReady(true); }
  }, []);

  useEffect(() => { void boot(); }, [boot]);

  /*  KEEP TRYING.

      This screen used to be a dead end: `offline` was decided once, at page
      load, and never revisited. So if the API was down for the ten seconds it
      takes to restart, the panel showed "The API is not answering" and sat
      there — with no button and no retry — until somebody thought to press
      Ctrl+F5. On 28 July that cost an evening and a good deal of patience,
      and the API had been healthy the whole time.

      Now it asks again every four seconds while it believes it is offline,
      and stops the moment it gets an answer. The panel heals itself. */
  useEffect(() => {
    if (!offline) return;
    const t = setInterval(() => void boot(), 4000);
    return () => clearInterval(t);
  }, [offline, boot]);

  /*  Coming back to the tab is the other moment worth re-checking — somebody
      who switched away to restart Docker returns expecting it to work. */
  useEffect(() => {
    const wake = () => { if (document.visibilityState === "visible") void boot(); };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [boot]);

  // any call that comes back 401 means the session is gone — show the door again
  useEffect(() => {
    const back = () => setMe(null);
    window.addEventListener("radian:signed-out", back);
    return () => window.removeEventListener("radian:signed-out", back);
  }, []);

  // any money action anywhere can raise this box (api.ts retries with the PIN)
  useEffect(() => {
    window.__radianAskPin = () =>
      new Promise<string | null>((resolve) => {
        setPin(""); setPinErr(""); setPinAsk({ resolve });
      });
    return () => { delete window.__radianAskPin; };
  }, []);

  const signOut = () => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    void fetch(`${API_BASE}/auth/logout`, { method: "POST", headers: token ? { "x-radian-token": token } : {} });
    window.localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setMe(null);
  };

  const withPin = useCallback(async <T,>(run: (pin: string) => Promise<T>): Promise<T | undefined> => {
    const entered = await new Promise<string | null>((resolve) => {
      setPin(""); setPinErr(""); setPinAsk({ resolve });
    });
    if (!entered) return undefined;
    return run(entered);
  }, []);

  /*  Before anything else — including the loading state and the offline card.
      A reset link that lands on "Loading…" or "The API is not answering"
      because a session check is in flight is a link that appears broken.  */
  if (openPage) return <>{children}</>;

  if (!ready) return <div className="p-10 text-body-soft text-[14px]">Loading…</div>;

  if (offline)
    return (
      <div className="min-h-screen grid place-items-center p-6" style={{ background: "#faf7fc" }}>
        <Card className="px-8 py-10 text-center max-w-[420px]">
          <div className="text-[28px] mb-2">⚡</div>
          <div className="font-display text-[20px] text-purple mb-1">The API is not answering</div>
          <p className="text-[13.5px] text-body-soft mb-3">
            Checking again every few seconds.
          </p>
          <p className="text-[12.5px] text-body-soft mb-4">
            If it stays here: start Docker, then run
            <br />
            <code className="text-[12px]">D:\radian\radian_api_doctor.bat</code>
          </p>
          <button
            onClick={() => void boot()}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-[13px] font-semibold border border-[#e7dff0] bg-white text-purple hover:border-orchid transition-all"
          >
            Try now
          </button>
        </Card>
      </div>
    );

  if (needsSetup) return <SetupForm onDone={(m) => { setMe(m); setNeedsSetup(false); }} />;
  if (!me) return <LoginForm onDone={setMe} />;

  return (
    <AuthCtx.Provider value={{ me, signOut, withPin }}>
      {children}
      {pinAsk && (
        <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(40,20,55,0.45)" }}>
          <Card className="px-7 py-6 w-full max-w-[380px]">
            <div className="text-[24px] mb-1">🔒</div>
            <div className="font-display text-[19px] text-purple mb-1">Confirm it is you</div>
            <p className="text-[13px] text-body-soft mt-0 mb-4">
              The ledger will record this against <b>{me.name}</b>.
            </p>
            {pinErr && <div className="mb-3 px-3 py-2 rounded-xl text-[12.5px] font-semibold"
              style={{ background: TONE.rose.soft, color: TONE.rose.text }}>{pinErr}</div>}
            <input
              className={`${input} text-center text-[22px] tracking-[0.5em] font-bold`}
              value={pin} inputMode="numeric" maxLength={4} autoFocus type="password"
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onKeyDown={(e) => { if (e.key === "Enter") void confirmPin(); }}
              placeholder="••••"
            />
            <div className="flex gap-2 mt-4">
              <button className={btnPrimary} style={btnPrimaryStyle} disabled={pin.length !== 4} onClick={() => void confirmPin()}>
                Confirm
              </button>
              <button className={btnGhost} onClick={() => { pinAsk.resolve(null); setPinAsk(null); }}>Cancel</button>
            </div>
            {!me.hasPin && (
              <p className="text-[12px] mt-3 mb-0" style={{ color: TONE.amber.text }}>
                You have not set a PIN yet — open Settings → People to set one.
              </p>
            )}
          </Card>
        </div>
      )}
    </AuthCtx.Provider>
  );

  async function confirmPin() {
    const token = window.localStorage.getItem(TOKEN_KEY);
    const r = await fetch(`${API_BASE}/auth/verify-pin`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-radian-token": token } : {}) },
      body: JSON.stringify({ pin }),
    });
    const d = await r.json().catch(() => ({ ok: false }));
    if (!d.ok) { setPinErr("That PIN is not right"); return; }
    pinAsk?.resolve(pin);
    setPinAsk(null);
  }
}

/* ---------------- first run ---------------- */

function SetupForm({ onDone }: { onDone: (m: Me) => void }) {
  const [f, setF] = useState({ name: "", username: "", password: "", pin: "" });
  const [err, setErr] = useState("");

  return (
    <Shell title="Set up the first owner" sub="Nobody has access yet.">
      <Flash ok="" err={err} />
      <Lbl>Your name</Lbl>
      <input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Sobuj" />
      <div className="mt-3"><Lbl>Username</Lbl>
        <input className={input} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="sobuj" /></div>
      <div className="mt-3"><Lbl>Password (6+ characters)</Lbl>
        <input className={input} type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
      <div className="mt-3"><Lbl>4-digit PIN — asked whenever money moves</Lbl>
        <input className={`${input} tracking-[0.4em] text-center`} inputMode="numeric" maxLength={4}
          value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="••••" /></div>
      <button className={`${btnPrimary} w-full mt-5`} style={btnPrimaryStyle}
        disabled={!f.username.trim() || f.password.length < 6 || f.pin.length !== 4}
        onClick={async () => {
          try {
            const r = await fetch(`${API_BASE}/auth/setup`, {
              method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f),
            });
            const d = await r.json();
            if (!r.ok) { setErr(d.message ?? "Could not set up"); return; }
            window.localStorage.setItem(TOKEN_KEY, d.token);
            setAuthToken(d.token);
            onDone(d.user);
          } catch { setErr("The API is not answering"); }
        }}>Create owner account</button>
    </Shell>
  );
}

/* ---------------- sign in ---------------- */

function LoginForm({ onDone }: { onDone: (m: Me) => void }) {
  const [f, setF] = useState({ username: "", password: "" });
  const [err, setErr] = useState("");
  /*  30 Jul 2026 — the owner's requirement: somebody who forgets their password
      fixes it themselves, by email, without having to find him first.  */
  const [forgot, setForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSaid, setForgotSaid] = useState("");
  const submit = async () => {
    try {
      const r = await fetch(`${API_BASE}/auth/login`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.message ?? "Wrong username or password"); return; }
      window.localStorage.setItem(TOKEN_KEY, d.token);
      setAuthToken(d.token);
      onDone(d.user);
    } catch { setErr("The API is not answering"); }
  };

  if (forgot) {
    return (
      <Shell title="Forgot your password?" sub="Enter the email address you sign in with.">
        <Lbl>Email address</Lbl>
        <input className={input} type="email" value={forgotEmail} autoFocus
          autoComplete="new-password"
          onChange={(e) => setForgotEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && forgotEmail.trim())
              void forgotPassword(forgotEmail.trim()).then(setForgotSaid);
          }} />
        {/*  The reply is the same whether the address exists or not. Saying "no
            such account" would turn this box into a way to find out who works
            here, and the owner's own address is one of them.  */}
        {forgotSaid && (
          <p className="text-[12.5px] mt-3 leading-relaxed" style={{ color: "#0b6244" }}>
            {forgotSaid}
          </p>
        )}
        <button className={`${btnPrimary} w-full mt-4`} style={btnPrimaryStyle}
          disabled={!forgotEmail.trim()}
          onClick={() => void forgotPassword(forgotEmail.trim()).then(setForgotSaid)}>
          Send me a link
        </button>
        <p className="text-[11px] text-body-soft leading-relaxed mt-3">
          No email provider is connected yet — ask the owner for a link.
        </p>
        <button className="text-[12.5px] font-semibold text-purple mt-4"
          onClick={() => { setForgot(false); setForgotSaid(""); }}>
          ← Back to sign in
        </button>
      </Shell>
    );
  }

  return (
    <Shell title="Radian Business OS" sub="Sign in to continue.">
      <Flash ok="" err={err} />
      {/*  Either works. Accounts made before 30 Jul have a username and no
           email; accounts invited by email have both.  */}
      <Lbl>Email or username</Lbl>
      <input className={input} value={f.username} autoFocus
        onChange={(e) => setF({ ...f, username: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} />
      <div className="mt-3"><Lbl>Password</Lbl>
        <input className={input} type="password" value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} /></div>
      <button className={`${btnPrimary} w-full mt-5`} style={btnPrimaryStyle}
        disabled={!f.username.trim() || !f.password} onClick={() => void submit()}>Sign in</button>
      <button className="text-[12px] font-semibold text-purple mt-4 w-full text-center"
        onClick={() => setForgot(true)}>
        Forgot your password?
      </button>
    </Shell>
  );
}

function Shell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid place-items-center p-6" style={{ background: "linear-gradient(140deg,#f7ecfa,#eef4fb 60%,#fdf6f9)" }}>
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-2xl grid place-items-center text-[26px] mx-auto mb-3 text-white shadow-[0_6px_20px_rgba(160,33,184,0.3)]"
            style={{ background: TONE.brand.grad }}>৳</div>
          <div className="font-display text-[22px] text-purple">{title}</div>
          <p className="text-[13px] text-body-soft mt-1 mb-0">{sub}</p>
        </div>
        <Card className="px-6 py-6">{children}</Card>
      </div>
    </div>
  );
}
