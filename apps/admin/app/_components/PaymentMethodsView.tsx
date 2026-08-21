"use client";

import { useEffect, useState } from "react";
import { WRAP, ACCENT, ItemPageHead, ErrBar, Modal, Field, msg } from "./ItemUI";
import Icon from "./Icon";
import {
  listPaymentMethods, updatePaymentMethod, addPaymentAccount, updatePaymentAccount,
  type ApiPaymentMethod, type ApiPaymentAccount, type ApiPaymentAccountWrite,
} from "../_data/api";

/*
  Setup → Payment methods — DEC-GBL-001 / DEC-GBL-006 (owner, 21 Aug 2026).

  One switch per method for the whole Business OS, and under each method the
  actual accounts (three bKash numbers, four bank accounts) the money lands in.

  Redesigned the same day on the owner's complaint: the first cut saved on
  blur, which made the page jump, and offered one skinny "number" box for a
  bank account. Rules now:
    · nothing saves itself — every edit happens in a dialog with a Save button
    · the page never reflows on success; the confirmation is a floating toast
    · a bank account asks for what a bank account IS: the bank (picked from
      the Bangladesh list), account number, holder, branch, routing
    · a wallet asks for the number and the holder; cash for a label only
*/

const CARD = "bg-white border border-lavender-deep rounded-[16px] shadow-soft";

/*  Scheduled + major private/state banks of Bangladesh. A dropdown, so the
    ledger never holds four spellings of the same bank; "Other bank…" keeps the
    list from ever blocking anyone.  */
const BD_BANKS = [
  "AB Bank", "Agrani Bank", "Al-Arafah Islami Bank", "Bank Asia", "BRAC Bank",
  "City Bank", "Community Bank", "Dhaka Bank", "Dutch-Bangla Bank (DBBL)",
  "Eastern Bank (EBL)", "EXIM Bank", "First Security Islami Bank",
  "IFIC Bank", "Islami Bank Bangladesh", "Jamuna Bank", "Janata Bank",
  "Meghna Bank", "Mercantile Bank", "Midland Bank", "Modhumoti Bank",
  "Mutual Trust Bank (MTB)", "NCC Bank", "NRB Bank", "NRBC Bank", "One Bank",
  "Padma Bank", "Premier Bank", "Prime Bank", "Pubali Bank", "Rupali Bank",
  "Shahjalal Islami Bank", "Social Islami Bank", "Sonali Bank",
  "Southeast Bank", "Standard Bank", "Standard Chartered", "Trust Bank",
  "UCB (United Commercial Bank)", "Uttara Bank",
];

/** which fields a method's account actually has */
const kindOf = (code: string): "BANK" | "WALLET" | "CASH" | "CARD" => {
  const c = code.toUpperCase();
  if (c === "BANK") return "BANK";
  if (c === "CASH") return "CASH";
  if (c === "CARD") return "CARD";
  return "WALLET"; // BKASH · NAGAD · OTHER
};

const METHOD_ICON: Record<string, string> = {
  CASH: "cash", BKASH: "phone", NAGAD: "phone", CARD: "register", BANK: "warehouse", OTHER: "wallet",
};

/** one line that says what the account is — shown under its name */
function accountDetail(a: ApiPaymentAccount): string {
  const bits: string[] = [];
  if (a.bankName) bits.push(a.bankName);
  if (a.accountRef) bits.push(a.accountRef);
  if (a.branchName) bits.push(a.branchName);
  if (a.accountHolder) bits.push(a.accountHolder);
  return bits.join(" · ");
}

interface DialogState {
  methodId: string;
  methodCode: string;
  methodName: string;
  /** null = adding a new one */
  account: ApiPaymentAccount | null;
}

export default function PaymentMethodsView() {
  const [rows, setRows] = useState<ApiPaymentMethod[] | null>(null);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    listPaymentMethods().then(setRows).catch((e) => setErr(msg(e, "Could not read the payment methods")));
  }, []);

  /*  the confirmation floats over the page instead of being inserted above it —
      an inline bar pushed every row down a line, which read as a "jump"  */
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function toggleMethod(row: ApiPaymentMethod) {
    setBusy(row.id); setErr("");
    try {
      const saved = await updatePaymentMethod(row.id, { isActive: !row.isActive });
      setRows((rs) => (rs ?? []).map((r) => (r.id === saved.id ? saved : r)));
      setToast(saved.isActive ? `${saved.name} is on everywhere` : `${saved.name} is off everywhere`);
    } catch (e) { setErr(msg(e, "Could not change that")); }
    finally { setBusy(""); }
  }

  async function toggleAccount(a: ApiPaymentAccount) {
    setBusy(a.id); setErr("");
    try {
      setRows(await updatePaymentAccount(a.id, { isActive: !a.isActive }));
      setToast(a.isActive ? `${a.name} is off` : `${a.name} is on`);
    } catch (e) { setErr(msg(e, "Could not change that")); }
    finally { setBusy(""); }
  }

  const shop = (rows ?? []).filter((r) => !r.isSystem);
  const site = (rows ?? []).filter((r) => r.isSystem);

  return (
    <div className={WRAP}>
      <ItemPageHead eyebrow="Setup · The whole shop" title="Payment methods" />
      {err && <ErrBar text={err} onClose={() => setErr("")} />}

      {toast && (
        <div className="fixed top-5 right-5 z-50 text-[13px] font-medium text-white px-4 py-2.5 rounded-[12px] shadow-lift"
          style={{ background: "#0e7a3d" }}>
          {toast}
        </div>
      )}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
        <div className="space-y-4">
          {rows === null && <div className={CARD + " px-5 py-8 text-center text-[13px] text-body-soft"}>Loading…</div>}

          {shop.map((r) => {
            const accounts = r.accounts ?? [];
            return (
              <div key={r.id} className={CARD + " overflow-hidden"}>
                {/* ---- the method: name left, one switch right ---- */}
                <div className="flex items-center justify-between gap-3 px-5 py-4">
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="w-[38px] h-[38px] rounded-[11px] grid place-items-center shrink-0"
                      style={{ background: r.isActive ? "#f3e8fa" : "#f2eff5", color: r.isActive ? ACCENT : "#9b8aa6" }}>
                      <Icon name={METHOD_ICON[r.code] ?? "wallet"} size={17} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold text-purple truncate">{r.name}</span>
                      <span className="block text-[11.5px] text-body-soft">
                        {r.isActive ? "Counter · purchases · supplier payments · refunds" : "Not offered anywhere"}
                      </span>
                    </span>
                  </span>

                  <button type="button" disabled={busy === r.id} onClick={() => toggleMethod(r)}
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

                {/* ---- its accounts: always visible, nothing to hunt for ---- */}
                <div className="border-t border-lavender-deep/70 px-5 py-3 bg-[#fbf9fd]">
                  <div className="flex flex-wrap items-center gap-2">
                    {accounts.map((a) => (
                      <div key={a.id}
                        className={"flex items-center gap-2.5 rounded-[11px] border pl-3 pr-1.5 py-1.5 bg-white " +
                          (a.isActive ? "border-lavender-deep" : "border-lavender-deep opacity-55")}>
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-medium text-purple leading-[1.25] truncate" style={{ maxWidth: 260 }}>
                            {a.name}
                          </span>
                          {accountDetail(a) && (
                            <span className="block text-[11px] text-body-soft leading-[1.25] truncate" style={{ maxWidth: 260 }}>
                              {accountDetail(a)}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center shrink-0">
                          <button type="button" title="Edit"
                            onClick={() => setDialog({ methodId: r.id, methodCode: r.code, methodName: r.name, account: a })}
                            className="p-1.5 text-body-soft hover:text-purple">
                            <Icon name="edit" size={13} />
                          </button>
                          <button type="button" disabled={busy === a.id} onClick={() => toggleAccount(a)}
                            title={a.isActive ? "Switch this account off" : "Switch this account on"}
                            className={"text-[10.5px] font-semibold px-2 py-1 rounded-[7px] " +
                              (a.isActive ? "bg-[#e9f9ef] text-[#0e7a3d]" : "bg-[#f2eff5] text-body-soft")}>
                            {a.isActive ? "ON" : "OFF"}
                          </button>
                        </span>
                      </div>
                    ))}

                    <button type="button"
                      onClick={() => setDialog({ methodId: r.id, methodCode: r.code, methodName: r.name, account: null })}
                      className="text-[12px] font-medium text-purple border border-dashed border-[#c6a9e8] rounded-[11px] px-3 py-2.5 hover:bg-lavender/40 inline-flex items-center gap-1.5">
                      <Icon name="plus" size={12} />
                      {kindOf(r.code) === "BANK" ? "Add bank account" : kindOf(r.code) === "WALLET" ? "Add number" : "Add account"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-4">
          <div className={CARD + " px-5 py-4"}>
            <b className="text-[13px] text-purple block mb-2">The website&apos;s own</b>
            {site.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                <span>{r.name}</span>
                <span className="text-[11.5px] text-body-soft shrink-0">
                  {r.code === "COD" ? "Delivery setup" : "Payment gateway"}
                </span>
              </div>
            ))}
          </div>

          <div className={CARD + " px-5 py-4 text-[12.5px] text-body-soft leading-[1.55]"}>
            Off here = off at the counter, on purchase bills, supplier payments
            and refunds, all at once. A bill already written keeps the method it
            was paid by.
          </div>
        </div>
      </div>

      {dialog && (
        <AccountDialog
          state={dialog}
          onClose={() => setDialog(null)}
          onSaved={(fresh, note) => { setRows(fresh); setDialog(null); setToast(note); }}
        />
      )}
    </div>
  );
}

/* ======================================================== the account form */

function AccountDialog({ state, onClose, onSaved }: {
  state: DialogState;
  onClose: () => void;
  onSaved: (rows: ApiPaymentMethod[], note: string) => void;
}) {
  const kind = kindOf(state.methodCode);
  const a = state.account;

  const [name, setName] = useState(a?.name ?? "");
  const [ref, setRef] = useState(a?.accountRef ?? "");
  const [holder, setHolder] = useState(a?.accountHolder ?? "");
  const [bank, setBank] = useState(a?.bankName && BD_BANKS.includes(a.bankName) ? a.bankName : a?.bankName ? "__other" : "");
  const [bankOther, setBankOther] = useState(a?.bankName && !BD_BANKS.includes(a.bankName) ? a.bankName : "");
  const [branch, setBranch] = useState(a?.branchName ?? "");
  const [routing, setRouting] = useState(a?.routingNo ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const bankName = bank === "__other" ? bankOther.trim() : bank;

  /*  the label people will see in payment dropdowns — offered, not forced  */
  const suggested =
    kind === "BANK" && bankName
      ? `${bankName}${ref.trim() ? ` · …${ref.trim().slice(-4)}` : ""}`
      : kind === "WALLET" && ref.trim()
        ? `${state.methodName} ${ref.trim()}`
        : "";

  const canSave =
    kind === "BANK"
      ? !!bankName && !!ref.trim()
      : kind === "WALLET"
        ? !!ref.trim()
        : !!(name.trim() || suggested);

  async function save() {
    setBusy(true); setErr("");
    const body: ApiPaymentAccountWrite = {
      name: name.trim() || suggested || state.methodName,
      accountRef: ref.trim() || null,
      accountHolder: holder.trim() || null,
      bankName: kind === "BANK" ? bankName || null : null,
      branchName: kind === "BANK" ? branch.trim() || null : null,
      routingNo: kind === "BANK" ? routing.trim() || null : null,
    };
    try {
      const rows = a
        ? await updatePaymentAccount(a.id, body)
        : await addPaymentAccount(state.methodId, body);
      onSaved(rows, a ? "Account saved" : "Account added");
    } catch (e) { setErr(msg(e, "Could not save the account")); setBusy(false); }
  }

  return (
    <Modal
      title={a ? `Edit — ${a.name}` : kind === "BANK" ? "Add a bank account" : `Add a ${state.methodName} account`}
      onClose={onClose} onSave={save} busy={busy} canSave={canSave}
      saveLabel={a ? "Save changes" : "Add account"}>

      {err && <div className="mb-3 text-[12.5px] text-[#c0392b] bg-[#fdeeee] border border-[#f2c7c7] rounded-[10px] px-3 py-2">{err}</div>}

      {kind === "BANK" && (
        <>
          <Field label="Bank" required>
            <select className="ipt" value={bank} onChange={(e) => setBank(e.target.value)} autoFocus={!a}>
              <option value="">— pick the bank —</option>
              {BD_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
              <option value="__other">Other bank…</option>
            </select>
          </Field>
          {bank === "__other" && (
            <Field label="Bank name" required>
              <input className="ipt" value={bankOther} onChange={(e) => setBankOther(e.target.value)} placeholder="Write the bank's name" />
            </Field>
          )}
          <Field label="Account number" required>
            <input className="ipt" inputMode="numeric" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. 1501 2345 6789 001" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account holder">
              <input className="ipt" value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="As written at the bank" />
            </Field>
            <Field label="Branch">
              <input className="ipt" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="e.g. Dhanmondi" />
            </Field>
          </div>
          <Field label="Routing number" hint="9 digits — on the cheque book; needed for transfers in">
            <input className="ipt" inputMode="numeric" value={routing} onChange={(e) => setRouting(e.target.value)} placeholder="e.g. 090261726" />
          </Field>
        </>
      )}

      {kind === "WALLET" && (
        <>
          <Field label={`${state.methodName} number`} required>
            <input className="ipt" inputMode="tel" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="01…" autoFocus={!a} />
          </Field>
          <Field label="Account holder">
            <input className="ipt" value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Whose name it is registered in" />
          </Field>
        </>
      )}

      {(kind === "CASH" || kind === "CARD") && (
        <Field label={kind === "CASH" ? "Drawer name" : "Terminal / gateway name"} required>
          <input className="ipt" value={name} onChange={(e) => setName(e.target.value)}
            placeholder={kind === "CASH" ? "e.g. Front counter drawer" : "e.g. City Bank POS terminal"} autoFocus={!a} />
        </Field>
      )}

      {kind !== "CASH" && kind !== "CARD" && (
        <Field label="Shown on payment screens as" hint="Leave empty and the suggestion below is used">
          <input className="ipt" value={name} onChange={(e) => setName(e.target.value)} placeholder={suggested || "A short label"} />
        </Field>
      )}
    </Modal>
  );
}
