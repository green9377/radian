"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteAccount } from "../../_data/accountApi";
import { useAuthStore, useToken } from "../../_store/useAuthStore";
import { Panel } from "./AccountShell";

/*
  /account/settings — there is no password to change, so this screen is about
  messages and about leaving.

  ⚠️ WHAT DELETING REALLY DOES is said in plain words, because the truth is
  not "everything vanishes": the orders are the shop's books and the law keeps
  them. The profile, the addresses, the wishlist and the dates go; the orders
  stay with the name taken off them.
*/

export default function SettingsPanel() {
  const token = useToken();
  const signOut = useAuthStore((s) => s.signOut);
  const router = useRouter();

  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onDelete() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteAccount(token);
      signOut();
      router.replace("/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete the account.");
      setBusy(false);
    }
  }

  return (
    <Panel icon="shield" title="Settings" sub="Signed in on this device · your session lasts 30 days.">
      {err && (
        <p className="mb-4 rounded-[13px] bg-[#FDECEE] border border-[#F5C2C7] px-4 py-3 text-[13px] text-[#8A1220]">
          {err}
        </p>
      )}

      <div className="border-[1.5px] border-lavender-deep rounded-[16px] p-4 mb-3">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <b className="text-[14px] text-purple">Order updates</b>
          <span className="rounded-full bg-[#E8F9EE] text-[#0E7A3D] px-2.5 py-1 text-[11px] font-bold">
            On
          </span>
        </div>
        <p className="text-[13px] text-body-soft m-0">
          Confirmation, the preparation photo and the delivery photo. These follow the order
          itself, so they cannot be switched off — a delivery nobody was told about is a delivery
          that goes wrong.
        </p>
      </div>

      <div className="border-[1.5px] border-lavender-deep rounded-[16px] p-4 mb-3">
        <b className="block text-[14px] text-purple mb-1.5">Occasion reminders</b>
        <p className="text-[13px] text-body-soft m-0">
          Only the dates you asked us to remember, a few days before. Remove a date on the
          Reminders screen and nothing about it is sent again.
        </p>
      </div>

      <div className="border-[1.5px] border-[#F5C2C7] bg-[#FDECEE] rounded-[16px] p-4 mt-6">
        <b className="block text-[14px] text-[#C4172B] mb-1.5">Delete my account</b>
        <p className="text-[13px] text-[#8A1220] leading-relaxed m-0">
          Your profile, addresses, wishlist and remembered dates are erased. Your past orders stay
          in the shop&apos;s books, as the law requires — with your name taken off them.
        </p>

        {!asked ? (
          <button
            type="button"
            onClick={() => setAsked(true)}
            className="mt-3 bg-white border-[1.5px] border-[#F5C2C7] text-[#C4172B] rounded-[13px] px-5 py-2.5 font-bold text-[13px]"
          >
            Delete my account
          </button>
        ) : (
          <div className="flex gap-2.5 mt-3 flex-wrap">
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="bg-[#C4172B] text-white rounded-[13px] px-5 py-2.5 font-bold text-[13px] disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Yes, delete it"}
            </button>
            <button
              type="button"
              onClick={() => setAsked(false)}
              className="bg-white border-[1.5px] border-lavender-deep rounded-[13px] px-5 py-2.5 font-bold text-[13px] text-body"
            >
              Keep my account
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}
