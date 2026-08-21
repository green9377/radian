"use client";

import { useEffect, useState } from "react";
import { WRAP, ACCENT, ItemPageHead, ErrBar, OkBar, msg } from "./ItemUI";
import Icon from "./Icon";
import {
  listPaymentMethods, updatePaymentMethod, addPaymentAccount, updatePaymentAccount,
  type ApiPaymentMethod,
} from "../_data/api";

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
  const [openId, setOpenId] = useState("");
  const [newName, setNewName] = useState("");
  const [newRef, setNewRef] = useState("");

  async function addAccount(methodId: string) {
    setBusy(methodId); setErr(""); setOk("");
    try {
      setRows(await addPaymentAccount(methodId, { name: newName.trim(), accountRef: newRef.trim() || undefined }));
      setNewName(""); setNewRef(""); setOk("Account added.");
    } catch (e) { setErr(msg(e, "Could not add that account")); }
    finally { setBusy(""); }
  }

  async function saveAccount(accountId: string, patch: { name?: string; accountRef?: string; isActive?: boolean }) {
    setErr(""); setOk("");
    try { setRows(await updatePaymentAccount(accountId, patch)); setOk("Saved."); }
    catch (e) { setErr(msg(e, "Could not save that account")); await load(); }
  }

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
          {shop.map((r) => {
            const accounts = r.accounts ?? [];
            const open = openId === r.id;
            return (
              <div key={r.id} className="border-b border-lavender-deep last:border-0">
                <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="w-[34px] h-[34px] rounded-[10px] grid place-items-center shrink-0"
                      style={{ background: r.isActive ? "#f3e8fa" : "#f2eff5", color: r.isActive ? ACCENT : "#9b8aa6" }}>
                      <Icon name="wallet" size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium text-purple truncate">{r.name}</span>
                      <span className="block text-[11.5px] text-body-soft truncate">
                        {!r.isActive
                          ? "Not offered anywhere"
                          : accounts.length === 0
                            ? "No account yet"
                            : accounts.length === 1
                              ? (accounts[0].accountRef ? `${accounts[0].name} · ${accounts[0].accountRef}` : accounts[0].name)
                              : `${accounts.filter((a) => a.isActive).length} accounts`}
                      </span>
                    </span>
                  </span>

                  <span className="flex items-center gap-3 shrink-0">
                    <button type="button" onClick={() => setOpenId(open ? "" : r.id)}
                      className="text-[12px] text-purple underline">
                      {open ? "Close" : "Accounts"}
                    </button>
                    <button type="button" disabled={busy === r.id} onClick={() => toggle(r)}
                      aria-label={`${r.isActive ? "Switch off" : "Switch on"} ${r.name}`}
                      className="rounded-full transition-colors"
                      style={{
                        width: 52, height: 30, padding: 3,
                        background: r.isActive ? "#0e7a3d" : "#d8cbe4",
                        opacity: busy === r.id ? 0.5 : 1,
                      }}>
                      <span className="block bg-white rounded-full transition-transform"
                        style={{ width: 24, height: 24, transform: `translateX(${r.isActive ? 22 : 0}px)` }} />
                    </button>
                  </span>
                </div>

                {/*  DEC-GBL-006 — a method is HOW the money moves; these are WHERE
                     it lands. Three bKash numbers is normal, and the books need to
                     know which one took the ৳5,000.  */}
                {open && (
                  <div className="px-5 pb-4 pt-1 bg-[#faf8fc]">
                    {accounts.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 py-1.5">
                        <input className="ipt h-[34px] text-[12.5px] flex-1" defaultValue={a.name}
                          onBlur={(e) => e.target.value.trim() !== a.name && void saveAccount(a.id, { name: e.target.value })} />
                        <input className="ipt h-[34px] text-[12.5px]" style={{ width: 190 }}
                          placeholder="Number / account no" defaultValue={a.accountRef ?? ""}
                          onBlur={(e) => (e.target.value.trim() || null) !== a.accountRef && void saveAccount(a.id, { accountRef: e.target.value })} />
                        <button type="button" onClick={() => void saveAccount(a.id, { isActive: !a.isActive })}
                          className={"text-[11.5px] font-medium px-2.5 h-[34px] rounded-[8px] border shrink-0 " + (a.isActive
                            ? "border-[#c2ecd3] bg-[#e9f9ef] text-[#0e7a3d]"
                            : "border-lavender-deep bg-white text-body-soft")}>
                          {a.isActive ? "On" : "Off"}
                        </button>
                      </div>
                    ))}

                    <div className="flex items-center gap-2 pt-2">
                      <input className="ipt h-[34px] text-[12.5px] flex-1" placeholder="Add another — name (e.g. Shop bKash)"
                        value={newName} onChange={(e) => setNewName(e.target.value)} />
                      <input className="ipt h-[34px] text-[12.5px]" style={{ width: 190 }}
                        placeholder="Number / account no" value={newRef} onChange={(e) => setNewRef(e.target.value)} />
                      <button type="button" disabled={!newName.trim() || busy === r.id}
                        onClick={() => void addAccount(r.id)}
                        className="text-[12.5px] font-medium text-white px-3 h-[34px] rounded-[8px] shrink-0 disabled:opacity-40"
                        style={{ background: ACCENT }}>Add</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
