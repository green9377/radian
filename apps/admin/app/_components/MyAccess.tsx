"use client";

/*
  MY PASSWORD & PIN — everyone, including staff.

  The owner hands out the first password, so every person must be able to
  change it to something only they know; otherwise the name in the ledger is
  still not proof. Changing the password signs the account out everywhere,
  which is the point — a tab left open on the shop computer dies with it.
*/

import { useState } from "react";
import { changeOwnAccess } from "../_data/api";
import { useAuth } from "./AuthGate";
import {
  Card, Flash, Panel, FinHeader, WRAP, btnPrimary, btnPrimaryStyle, input, Lbl,
} from "./FinanceUI";

export default function MyAccess() {
  const { me, signOut } = useAuth();
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pin, setPin] = useState("");
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  const mismatch = pw.length > 0 && pw !== pw2;
  const nothing = !pw && !pin;

  async function save() {
    setErr(""); setOk("");
    if (mismatch) { setErr("The two new passwords are not the same"); return; }
    try {
      const r = await changeOwnAccess({
        currentPassword: cur,
        password: pw || undefined,
        pin: pin || undefined,
      });
      setCur(""); setPw(""); setPw2(""); setPin("");
      if (r.signedOutEverywhere) {
        setOk("Changed — signing you in again with the new password…");
        setTimeout(signOut, 1400);
      } else {
        setOk("Your PIN is changed");
      }
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
  }

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="System"
        title="My password & PIN"
        tone="brand"
      />
      <Flash ok={ok} err={err} />

      <Panel tone="brand" emoji="🔒" title={me ? `${me.name} · ${me.role.toLowerCase()}` : "My account"}
        sub={me ? `signs in as ${me.username}` : undefined}>
        <Card className="px-5 py-5 max-w-[460px]">
          <Lbl>Your current password</Lbl>
          <input className={input} type="password" value={cur} onChange={(e) => setCur(e.target.value)} />
          <p className="text-[11.5px] text-body-soft mt-1 mb-0">Needed to prove it is really you.</p>

          <div className="mt-4 pt-4 border-t border-[var(--l-accent)]">
            <Lbl>New password (leave empty to keep it)</Lbl>
            <input className={input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <div className="mt-2">
              <Lbl>Type the new password again</Lbl>
              <input className={input} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </div>
            {mismatch && <p className="text-[12px] text-[var(--t-bad)] font-semibold mt-1 mb-0">These two do not match.</p>}
            <p className="text-[11.5px] text-body-soft mt-1 mb-0">
              Changing it signs this account out on every device.
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-[var(--l-accent)]">
            <Lbl>New 4-digit PIN (leave empty to keep it)</Lbl>
            <input className={`${input} tracking-[0.4em] text-center`} inputMode="numeric" maxLength={4}
              value={pin} placeholder="••••"
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </div>

          <button className={`${btnPrimary} w-full mt-5`} style={btnPrimaryStyle}
            disabled={!cur || nothing || mismatch || (pw.length > 0 && pw.length < 6) || (pin.length > 0 && pin.length !== 4)}
            onClick={() => void save()}>Save</button>
        </Card>
      </Panel>
    </div>
  );
}
