"use client";

import { useEffect, useState } from "react";
import { WRAP, ACCENT, ItemPageHead, ErrBar, OkBar, msg } from "./ItemUI";
import Icon from "./Icon";
import { listPaymentMethods, updatePaymentMethod, type ApiPaymentMethod } from "../_data/api";

/*
  DEC-GBL-001 (owner, 21 Aug 2026) — the shop's payment methods, in ONE place.

  "ami pos a jevabe setting set kri seta abr purchess a kaj kre na… off krle
  sob jaygay off, on krle sob jaygay on."

  Switching one off here takes it off the till, off a purchase bill, off a
  supplier payment and off a refund — and the server refuses it too, so an
  open tab from ten minutes ago cannot slip one through. Old bills keep the
  method they were written with; this only decides what may be used NEXT.
*/

const CARD = "bg-white border border-lavender-deep rounded-[16px] shadow-soft";

export default function PaymentMethodsView() {
  const [rows, setRows] = useState<ApiPaymentMethod[]>([]);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    try { setRows(await listPaymentMethods()); }
    catch (e) { setErr(msg(e, "Could not read the payment methods")); }
  }
  useEffect(() => { load(); }, []);

  async function toggle(row: ApiPaymentMethod) {
    setBusy(row.id); setErr(""); setOk("");
    try {
      const saved = await updatePaymentMethod(row.id, { isActive: !row.isActive });
      setRows((rs) => rs.map((r) => (r.id === saved.id ? saved : r)));
      setOk(saved.isActive ? `${saved.name} is on everywhere.` : `${saved.name} is off everywhere.`);
    } catch (e) { setErr(msg(e, "Could not change that")); }
    finally { setBusy(""); }
  }

  const shop = rows.filter((r) => !r.isSystem);
  const site = rows.filter((r) => r.isSystem);

  return (
    <div className={WRAP}>
      <ItemPageHead eyebrow="Setup · The whole shop" title="Payment methods" />
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      {ok && <OkBar text={ok} onClose={() => setOk("")} />}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div className={CARD + " overflow-hidden"}>
          {shop.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-lavender-deep last:border-0">
              <span className="flex items-center gap-3 min-w-0">
                <span className="w-[34px] h-[34px] rounded-[10px] grid place-items-center shrink-0"
                  style={{ background: r.isActive ? "#f3e8fa" : "#f2eff5", color: r.isActive ? ACCENT : "#9b8aa6" }}>
                  <Icon name="wallet" size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-purple truncate">{r.name}</span>
                  <span className="block text-[11.5px] text-body-soft">
                    {r.isActive ? "Counter · purchases · supplier payments · refunds" : "Not offered anywhere"}
                  </span>
                </span>
              </span>

              <button type="button" disabled={busy === r.id} onClick={() => toggle(r)}
                aria-label={`${r.isActive ? "Switch off" : "Switch on"} ${r.name}`}
                className="shrink-0 rounded-full transition-colors"
                style={{
                  width: 52, height: 30, padding: 3,
                  background: r.isActive ? "#0e7a3d" : "#d8cbe4",
                  opacity: busy === r.id ? 0.5 : 1,
                }}>
                <span className="block bg-white rounded-full transition-transform"
                  style={{ width: 24, height: 24, transform: `translateX(${r.isActive ? 22 : 0}px)` }} />
              </button>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="px-5 py-8 text-center text-[13px] text-body-soft">Nothing to show yet.</div>
          )}
        </div>

        <div className="space-y-4">
          <div className={CARD + " px-5 py-4"}>
            <b className="text-[13px] text-purple block mb-2">The website&apos;s own</b>
            {site.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                <span>{r.name}</span>
                <span className="text-[11.5px] text-body-soft">
                  {r.name.toLowerCase().includes("delivery") ? "Delivery setup" : "Payment gateway"}
                </span>
              </div>
            ))}
          </div>

          <div className={CARD + " px-5 py-4 text-[12.5px] text-body-soft"}>
            A bill already written keeps the method it was paid by. This list only
            decides what can be used from now on.
          </div>
        </div>
      </div>
    </div>
  );
}
