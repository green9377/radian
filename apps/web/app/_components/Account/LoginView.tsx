"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  DEMO_OTP,
  OTP_LENGTH,
  normalizeLoginPhone,
  verifyOtp,
} from "../../_data/auth";
import { useAuthHydrated, useAuthStore } from "../../_store/useAuthStore";
import Icon from "../Pdp/PdpIcons";

/*
  WhatsApp login — mock, দুই ধাপ: phone → OTP।

  আসল কিছু পাঠানো হয় না; DEMO_OTP মিললেই session (auth.ts §mock)।
  logged-in থাকলে সরাসরি redirect।

  ⇄ SWAP HERE — Auth module lock হলে requestOtp/verifyOtp আসল API হবে।
*/

export default function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/account";

  const hydrated = useAuthHydrated();
  const customer = useAuthStore((s) => s.customer);
  const login = useAuthStore((s) => s.login);

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [normalized, setNormalized] = useState<string | null>(null);
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const boxRefs = useRef<Array<HTMLInputElement | null>>([]);

  /* logged-in হলে ভিতরে পাঠাও */
  useEffect(() => {
    if (hydrated && customer) router.replace(redirect);
  }, [hydrated, customer, redirect, router]);

  function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const norm = normalizeLoginPhone(phoneRaw);
    if (!norm) {
      setError("Enter a valid Bangladeshi number — 01XXXXXXXXX.");
      return;
    }
    setNormalized(norm);
    setError(null);
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

  function verify(code: string) {
    if (verifyOtp(code)) {
      login(normalized!);
      router.replace(redirect);
    } else {
      setError("That code didn't match. Try again.");
      setDigits(Array(OTP_LENGTH).fill(""));
      boxRefs.current[0]?.focus();
    }
  }

  /* hydration চলাকালীন / already logged-in → খালি */
  if (!hydrated || customer) {
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
          <Icon name="wa" className="w-7 h-7 rotate-45" />
        </span>

        {step === "phone" ? (
          <>
            <h1 className="text-center font-display text-[26px] text-purple font-semibold mt-5">
              Log in to Radian
            </h1>
            <p className="text-center text-[13.5px] text-body-soft mt-2">
              We&apos;ll send a login code to your WhatsApp — no password needed.
            </p>

            <form onSubmit={sendCode} className="mt-7">
              <label className="block text-[12px] font-semibold text-body-soft mb-1.5">
                WhatsApp number
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
                className="w-full mt-5 h-[52px] inline-flex items-center justify-center gap-2 bg-[#25D366] text-white rounded-[16px] font-semibold text-[14.5px] hover:brightness-95 transition"
              >
                <Icon name="wa" className="w-[19px] h-[19px]" />
                Send code on WhatsApp
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-center font-display text-[24px] text-purple font-semibold mt-5">
              Enter your code
            </h1>
            <p className="text-center text-[13.5px] text-body-soft mt-2">
              Sent to <span className="text-purple font-semibold">{normalized}</span> on
              WhatsApp.
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

            <p className="text-center text-[12px] text-body-soft mt-4">
              Demo — enter code{" "}
              <span className="font-semibold text-purple">{DEMO_OTP}</span>
            </p>

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
                onClick={() => {
                  setResent(true);
                  setTimeout(() => setResent(false), 2500);
                }}
                className="text-orchid font-semibold hover:text-purple transition-colors"
              >
                {resent ? "Code re-sent ✓" : "Resend code"}
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
