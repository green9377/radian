"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  OTP_LENGTH,
  googleClientId,
  lastOtpChannel,
  normalizeLoginPhone,
  requestLoginOtp,
} from "../../_data/auth";
import { accountLogin, accountLoginGoogle } from "../../_data/accountApi";
import { mergeWishlistOnLogin } from "../../_store/useWishlistStore";
import { useAuthHydrated, useAuthStore } from "../../_store/useAuthStore";
import Icon from "../Pdp/PdpIcons";

/*
  Login in two steps: phone → the code we really sent.

  Real since 2 Sep 2026 (DEC-WA-010). Until that day this screen printed the
  code on itself — "Demo — enter code 123456" — and accepted it for any number,
  on a shop taking real orders. The code is now sent by the server (WhatsApp,
  then SMS, then email) and only the server says whether it matched.

  It names the channel that WORKED, and never the one that failed. The owner's
  first real code arrived by SMS while this screen insisted "on WhatsApp",
  which sends a customer hunting in the wrong app; naming a FAILURE would be
  different — it would turn a login box into a way of asking who has WhatsApp.

  8 Sep 2026: the route is the owner's — a Bangladeshi number gets the code by
  SMS, a foreign one by email, WhatsApp last — so the screen promises "a
  code", not an app. And "Continue with Google": Google's own button, the
  server checks the token, and that is the sign-in — no phone is asked for
  (owner's ruling); checkout takes it the first time they order.
*/

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void;
          renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export default function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/account";

  const hydrated = useAuthHydrated();
  const customer = useAuthStore((s) => s.customer);
  const token = useAuthStore((s) => s.token);
  const signIn = useAuthStore((s) => s.signIn);

  const [step, setStep] = useState<"phone" | "otp">("phone");
  /* Google: the button is drawn only when the server has a Client ID */
  const [gClientId, setGClientId] = useState<string | null>(null);
  const gButtonRef = useRef<HTMLDivElement | null>(null);
  const [phoneRaw, setPhoneRaw] = useState("");
  const [normalized, setNormalized] = useState<string | null>(null);
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  /* The code is now really sent and really checked, so both take a moment —
     and a second click while one is in flight must not start another. */
  const [busy, setBusy] = useState(false);
  /*
    The owner, 2 Sep: pressing Resend too soon said "Bad Request" and then
    sat there. A number that counts down answers both halves of the question
    — that the wait is deliberate, and how long is left.
  */
  const [waitSec, setWaitSec] = useState(0);
  /* Which app the code actually went to — named only on success. */
  const [channel, setChannel] = useState<string | null>(null);

  const boxRefs = useRef<Array<HTMLInputElement | null>>([]);

  /* already signed in → straight through */
  useEffect(() => {
    if (hydrated && token) router.replace(redirect);
  }, [hydrated, token, redirect, router]);

  /* Google's button: the script, then the button, only with a Client ID */
  useEffect(() => {
    let alive = true;
    googleClientId().then((id) => {
      if (alive) setGClientId(id);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!gClientId || step !== "phone" || !hydrated || token) return;
    const draw = () => {
      const g = window.google?.accounts.id;
      const el = gButtonRef.current;
      if (!g || !el) return;
      g.initialize({ client_id: gClientId, callback: (r) => void onGoogle(r.credential) });
      el.innerHTML = "";
      g.renderButton(el, { theme: "outline", size: "large", shape: "pill", width: 340, text: "continue_with" });
    };
    if (window.google?.accounts) {
      draw();
      return;
    }
    const id = "google-gsi";
    if (!document.getElementById(id)) {
      const sc = document.createElement("script");
      sc.id = id;
      sc.src = "https://accounts.google.com/gsi/client";
      sc.async = true;
      sc.onload = draw;
      document.head.appendChild(sc);
    } else {
      document.getElementById(id)?.addEventListener("load", draw);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gClientId, step, hydrated, token]);

  async function onGoogle(credential: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      /*  ⚠️ The SERVER issues the session — Google's word alone is not a
          login here. It answers with a token or it refuses (an email we have
          no order from has no account to open).  */
      const r = await accountLoginGoogle(credential);
      signIn(r.token, r.customer);
      await mergeWishlistOnLogin(r.token);
      router.replace(redirect);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in did not work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /* The cooldown, ticking. */
  useEffect(() => {
    if (waitSec <= 0) return;
    const t = setTimeout(() => setWaitSec((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [waitSec]);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const norm = normalizeLoginPhone(phoneRaw);
    if (!norm) {
      // With or without the leading 0 — both are the same number (2 Sep).
      setError("Enter a valid Bangladeshi mobile number.");
      return;
    }
    setBusy(true);
    setError(null);
    const failed = await requestLoginOtp(norm);
    setBusy(false);
    if (failed) {
      /*  A code asked for a moment ago is still valid — so the cooldown is
          not an error here, it is the reason to go to the boxes and type the
          one already on the phone.  */
      const secs = Number(failed.match(/(\d+)\s*second/)?.[1] ?? 0);
      if (secs > 0) {
        setWaitSec(secs);
        setNormalized(norm);
        setDigits(Array(OTP_LENGTH).fill(""));
        setStep("otp");
        setTimeout(() => boxRefs.current[0]?.focus(), 50);
        return;
      }
      setError(failed);
      return;
    }
    setChannel(lastOtpChannel);
    setNormalized(norm);
    setDigits(Array(OTP_LENGTH).fill(""));
    setStep("otp");
    setTimeout(() => boxRefs.current[0]?.focus(), 50);
  }

  function setDigit(i: number, val: string) {
    const d = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    setError(null);
    if (d && i < OTP_LENGTH - 1) boxRefs.current[i + 1]?.focus();
    if (next.every((x) => x !== "")) verify(next.join(""));
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      boxRefs.current[i - 1]?.focus();
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!text) return;
    e.preventDefault();
    const next = Array(OTP_LENGTH).fill("");
    text.split("").forEach((c, idx) => (next[idx] = c));
    setDigits(next);
    if (text.length === OTP_LENGTH) verify(text);
    else boxRefs.current[text.length]?.focus();
  }

  /**
   * The code, and with it the session.
   *
   * ⚠️ ONE CALL, NOT TWO (8 Sep 2026). It used to verify the code and then
   * "log in" by writing a made-up customer into this browser. The server does
   * both now: it checks the code and answers with the session token and the
   * customer's real record — or it refuses, and nobody is signed in.
   */
  async function verify(code: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await accountLogin(normalized!, code);
      signIn(r.token, r.customer);
      /*  hearts tapped before signing in are not lost by signing in  */
      await mergeWishlistOnLogin(r.token);
      router.replace(redirect);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't match. Try again.");
      setDigits(Array(OTP_LENGTH).fill(""));
      boxRefs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  }

  /* while hydrating, or already signed in → blank */
  if (!hydrated || token) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <span className="text-[13.5px] text-body-soft">Loading…</span>
      </div>
    );
  }

  return (
    <div className="py-12 sm:py-16 grid place-items-center">
      <div className="w-full max-w-[420px] bg-white border-[1.5px] border-lavender-deep rounded-[28px] shadow-soft p-7 sm:p-9">
        {/* brand mark */}
        <span className="w-14 h-14 rounded-[50%_50%_50%_0] -rotate-45 bg-orchid-soft text-orchid grid place-items-center mx-auto">
          <Icon name="lock" className="w-7 h-7 rotate-45" />
        </span>

        {step === "phone" ? (
          <>
            <h1 className="text-center font-display text-[26px] text-purple font-semibold mt-5">
              Log in to Radian
            </h1>
            <p className="text-center text-[13.5px] text-body-soft mt-2">
              We&apos;ll send you a login code — no password needed.
            </p>

            <form onSubmit={sendCode} className="mt-7">
              <label className="block text-[12px] font-semibold text-body-soft mb-1.5">
                Mobile number
              </label>
              <div className="flex items-center rounded-[14px] border-[1.5px] border-lavender-deep bg-lavender focus-within:border-orchid transition-colors overflow-hidden">
                <span className="pl-3.5 pr-2 py-3 text-[14px] text-body-soft font-medium border-r border-lavender-deep">
                  +880
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoFocus
                  value={phoneRaw}
                  onChange={(e) => {
                    setPhoneRaw(e.target.value);
                    setError(null);
                  }}
                  placeholder="1XXXXXXXXX"
                  className="flex-1 bg-transparent px-3 py-3 text-[14.5px] text-purple outline-none placeholder:text-body-soft/60"
                />
              </div>

              {error && (
                <p className="text-[12.5px] text-[#B42318] mt-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full mt-5 h-[52px] inline-flex items-center justify-center gap-2 bg-purple text-white rounded-[16px] font-bold text-[14.5px] hover:bg-purple-deep transition disabled:opacity-70"
              >
                {busy ? "Sending…" : "Send login code"}
                {!busy && <Icon name="chev" className="w-4 h-4 -rotate-90" />}
              </button>
            </form>

            {gClientId && (
              <>
                <div className="flex items-center gap-3 my-5 text-[12px] text-body-soft">
                  <span className="h-px flex-1 bg-lavender-deep" />
                  or
                  <span className="h-px flex-1 bg-lavender-deep" />
                </div>
                <div ref={gButtonRef} className="flex justify-center min-h-[44px]" />
              </>
            )}
          </>
        ) : (
          <>
            <h1 className="text-center font-display text-[24px] text-purple font-semibold mt-5">
              Enter your code
            </h1>
            <p className="text-center text-[13.5px] text-body-soft mt-2">
              Sent to <span className="text-purple font-semibold">{normalized}</span>
              {channel ? ` on ${channel}.` : "."}
            </p>

            <div
              className="flex justify-center gap-2 mt-7"
              onPaste={onPaste}
            >
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    boxRefs.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  className="w-11 h-14 text-center text-[20px] font-semibold text-purple bg-lavender border-[1.5px] border-lavender-deep rounded-[12px] outline-none focus:border-orchid transition-colors"
                />
              ))}
            </div>

            {error && (
              <p className="text-center text-[12.5px] text-[#B42318] mt-3">{error}</p>
            )}

            <div className="flex items-center justify-center gap-4 mt-5 text-[12.5px]">
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setError(null);
                }}
                className="text-body-soft hover:text-purple transition-colors"
              >
                Change number
              </button>
              <span className="text-lavender-deep">·</span>
              <button
                type="button"
                disabled={busy || waitSec > 0}
                onClick={async () => {
                  if (busy || waitSec > 0 || !normalized) return;
                  setBusy(true);
                  setError(null);
                  const failed = await requestLoginOtp(normalized);
                  setBusy(false);
                  if (failed) {
                    // The server says how long; show it counting rather than
                    // as a sentence that then goes stale on the screen.
                    const secs = Number(failed.match(/(\d+)\s*second/)?.[1] ?? 0);
                    if (secs > 0) setWaitSec(secs);
                    else setError(failed);
                    return;
                  }
                  setChannel(lastOtpChannel);
                  setResent(true);
                  setTimeout(() => setResent(false), 2500);
                }}
                className="text-orchid font-semibold hover:text-purple transition-colors disabled:opacity-50"
              >
                {waitSec > 0
                  ? `Resend in ${waitSec}s`
                  : resent
                    ? "Code re-sent ✓"
                    : busy
                      ? "Sending…"
                      : "Resend code"}
              </button>
            </div>
          </>
        )}

        <p className="text-center text-[11.5px] text-body-soft mt-7">
          By continuing you agree to our{" "}
          <Link href="/terms" className="text-orchid hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy-policy" className="text-orchid hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
