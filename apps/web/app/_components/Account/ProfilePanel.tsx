"use client";

import { useEffect, useState } from "react";

import { getMe, saveMe, type AccountCustomer } from "../../_data/accountApi";
import { useAuthStore, useToken } from "../../_store/useAuthStore";
import Icon from "../Pdp/PdpIcons";
import { Loading, Panel } from "./AccountShell";

/*
  /account — My Profile.

  ⚠️ EVERY FIELD HERE IS THE CUSTOMER'S OWN ROW, not a browser's memory. It
  used to be a constant named `DEMO_CUSTOMER`, so every person who ever logged
  in saw "Nusrat Jahan" and two addresses in Banani.

  ★ THE OWN ADDRESS IS KEPT APART from the delivery addresses (owner, 8 Sep
  2026). This one says who the customer IS — it is what we read back when we
  call them. Where gifts go is the Address Book, a different screen and a
  different table (`Recipient`).

  ★ The phone is not editable. It is the identity the session was issued
  against; changing it means proving the new one with a code, which is its own
  flow, not a text box on a profile.
*/

const input =
  "w-full border-[1.5px] border-lavender-deep rounded-[13px] px-4 py-3 text-[14px] text-body outline-none transition-colors focus:border-orchid";

export default function ProfilePanel() {
  const token = useToken();
  const setCustomer = useAuthStore((s) => s.setCustomer);

  const [me, setMe] = useState<AccountCustomer | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [line, setLine] = useState("");
  const [zone, setZone] = useState("DHAKA");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getMe(token)
      .then((c) => {
        setMe(c);
        setName(c.name === "Guest" ? "" : c.name);
        setEmail(c.email ?? "");
        setBirthday(c.birthday ?? "");
        setLine(c.ownAddress?.line ?? "");
        setZone(c.ownAddress?.zone ?? "DHAKA");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load your profile."));
  }, [token]);

  async function onSave() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      const c = await saveMe(token, {
        name,
        email,
        birthday,
        ownAddressLine: line,
        ownAddressZone: zone,
      });
      setMe(c);
      setCustomer(c);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  if (!me && !err) {
    return (
      <Panel icon="user" title="My profile" sub="What we call you, and how we reach you.">
        <Loading />
      </Panel>
    );
  }

  return (
    <Panel icon="user" title="My profile" sub="What we call you, and how we reach you.">
      {err && (
        <p className="mb-4 rounded-[13px] bg-[#FDECEE] border border-[#F5C2C7] px-4 py-3 text-[13px] text-[#8A1220]">
          {err}
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-[12.5px] font-bold text-purple mb-1.5">Full name</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </label>

        <label className="block">
          <span className="block text-[12.5px] font-bold text-purple mb-1.5">
            Phone number · verified
          </span>
          <input className={`${input} bg-lavender text-body-soft`} value={me?.phone ?? ""} disabled />
        </label>

        <label className="block">
          <span className="block text-[12.5px] font-bold text-purple mb-1.5">Email</span>
          <input
            className={input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            inputMode="email"
          />
        </label>

        <label className="block">
          <span className="block text-[12.5px] font-bold text-purple mb-1.5">
            Birthday <span className="font-normal text-body-soft">· optional</span>
          </span>
          <input
            className={input}
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            placeholder="MM-DD, e.g. 08-09"
            maxLength={5}
          />
        </label>
      </div>

      <div className="mt-6 pt-6 border-t border-lavender-deep">
        <h2 className="font-display text-[17px] text-purple font-semibold m-0">Your own address</h2>
        <p className="text-[12.5px] text-body-soft mt-1 mb-4">
          For our records and for calling you — where gifts go lives in the Address Book.
        </p>

        <label className="block">
          <span className="block text-[12.5px] font-bold text-purple mb-1.5">Address</span>
          <textarea
            className={`${input} min-h-[86px] resize-none`}
            value={line}
            onChange={(e) => setLine(e.target.value)}
            placeholder="House 1, Road 1, Dhanmondi, Dhaka"
          />
        </label>

        <div className="inline-flex p-1 bg-lavender rounded-[14px] gap-1 mt-3">
          {[
            { id: "DHAKA", label: "Inside Dhaka" },
            { id: "BANGLADESH", label: "All Bangladesh" },
          ].map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => setZone(z.id)}
              className={`px-4 py-2 rounded-[11px] text-[13px] font-bold transition-colors ${
                zone === z.id ? "bg-white text-purple shadow-soft" : "text-body-soft"
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-6">
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="bg-purple text-white rounded-[13px] px-7 py-3 font-bold text-[13.5px] disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#0E7A3D]">
            <Icon name="check" className="w-4 h-4" /> Saved
          </span>
        )}
      </div>
    </Panel>
  );
}
