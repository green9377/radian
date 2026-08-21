"use client";

import { useEffect, useState } from "react";
import { WRAP, ItemPageHead, ErrBar, Modal, Field, msg } from "./ItemUI";
import Icon from "./Icon";
import {
  listPaymentMethods, updatePaymentMethod, addPaymentAccount, updatePaymentAccount,
  type ApiPaymentMethod, type ApiPaymentAccount, type ApiPaymentAccountWrite,
} from "../_data/api";

/*
  Setup → Payment methods — DEC-GBL-001 / DEC-GBL-006 (owner, 21 Aug 2026).

  One switch per method for the whole Business OS, and under each method the
  actual accounts (three bKash numbers, four bank accounts) the money lands in.

  Redesigned twice the same day on the owner's feedback:
    · nothing saves itself — every edit is a dialog with a Save button, and the
      confirmation is a floating toast so the page never reflows
    · a bank account asks for what a bank account IS: the bank (picked from the
      Bangladesh list), account number, holder, branch, routing
    · and the look is BOLD — each method wears its own brand colour (bKash
      pink, Nagad orange, bank navy…), because "six grey rows" is not how a
      flower shop's control room should feel (owner: "bold and colorfull")
*/

/*  Scheduled + major banks of Bangladesh. A dropdown, so the ledger never
    holds four spellings of the same bank; "Other bank…" keeps the list from
    ever blocking anyone.  */
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

/*  each method's own face — the colours people already know from the street:
    bKash pink, Nagad orange, cash green, card blue, bank navy, rose for the
    rest. The gradient header IS the identity; no two methods look alike.  */
const LOOKS: Record<string, { grad: string; deep: string; icon: string }> = {
  CASH:  { grad: "linear-gradient(120deg,#0e7a3d,#16a34a)", deep: "#0e7a3d", icon: "cash" },
  BKASH: { grad: "linear-gradient(120deg,#c1125c,#e2136e)", deep: "#e2136e", icon: "phone" },
  NAGAD: { grad: "linear-gradient(120deg,#d94206,#f6921e)", deep: "#ec5c10", icon: "phone" },
  CARD:  { grad: "linear-gradient(120deg,#1d4f8f,#2f7ad1)", deep: "#2563a8", icon: "register" },
  BANK:  { grad: "linear-gradient(120deg,#251650,#4633a5)", deep: "#3b2d86", icon: "warehouse" },
  OTHER: { grad: "linear-gradient(120deg,#8f4c58,#b76e79)", deep: "#b76e79", icon: "wallet" },
};
const lookOf = (code: string) => LOOKS[code.toUpperCase()] ?? LOOKS.OTHER;

/** initials for the account badge — "Shop bKash" → SB */
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

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

  /*  the confirmation floats over the page — an inline bar pushed every row
      down a line, which read as a "jump" (owner, 21 Aug)  */
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
        <div className="fixed top-5 right-5 z-50 text-[13.5px] font-semibold text-white px-5 py-3 rounded-[14px] shadow-lift inline-flex items-center gap-2"
          style={{ background: "linear-gradient(120deg,#0e7a3d,#16a34a)" }}>
          <Icon name="check" size={15} /> {toast}
        </div>
      )}

      {rows === null && (
        <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-10 text-center text-[13px] text-body-soft">
          Loading…
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5 items-start">
        {shop.map((r) => {
          const look = lookOf(r.code);
          const accounts = r.accounts ?? [];
          const kind = kindOf(r.code);
          return (
            <div key={r.id} className="rounded-[18px] overflow-hidden shadow-soft bg-white"
              style={{ border: "1px solid #efe4f7", opacity: r.isActive ? 1 : 0.92 }}>

              {/* ---------- the coloured face ---------- */}
              <div className="relative px-5 py-4 flex items-center justify-between gap-3 text-white"
                style={{ background: r.isActive ? look.grad : "linear-gradient(120deg,#8d8496,#a99fb4)" }}>
                {/* a soft shine so the band reads premium, not flat */}
                <span aria-hidden className="absolute inset-0 pointer-events-none"
                  style={{ background: "radial-gradient(420px 90px at 18% 0%, rgba(255,255,255,.28), transparent 60%)" }} />
                <span className="relative flex items-center gap-3.5 min-w-0">
                  <span className="w-[46px] h-[46px] rounded-[14px] grid place-items-center shrink-0"
                    style={{ background: "rgba(255,255,255,.2)", boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.35)" }}>
                    <Icon name={look.icon} size={22} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-[21px] leading-[1.15] truncate">{r.name}</span>
                    <span className="block text-[11.5px] font-medium tracking-[0.02em]" style={{ color: "rgba(255,255,255,.85)" }}>
                      {r.isActive
                        ? `${accounts.filter((a) => a.isActive).length || "No"} account${accounts.filter((a) => a.isActive).length === 1 ? "" : "s"} · everywhere money moves`
                        : "Switched off everywhere"}
                    </span>
                  </span>
                </span>

                <button type="button" disabled={busy === r.id} onClick={() => toggleMethod(r)}
                  aria-label={`${r.isActive ? "Switch off" : "Switch on"} ${r.name}`}
                  className="relative shrink-0 rounded-full transition-colors"
                  style={{
                    width: 56, height: 32, padding: 3,
                    background: r.isActive ? "rgba(255,255,255,.32)" : "rgba(255,255,255,.22)",
                    boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.45)",
                    opacity: busy === r.id ? 0.5 : 1,
                  }}>
                  <span className="block rounded-full transition-transform"
                    style={{
                      width: 26, height: 26, background: "#fff",
                      transform: `translateX(${r.isActive ? 24 : 0}px)`,
                      boxShadow: "0 1px 4px rgba(0,0,0,.25)",
                    }} />
                </button>
              </div>

              {/* ---------- its accounts ---------- */}
              <div className="px-4 py-4 space-y-2.5">
                {accounts.map((a) => (
                  <div key={a.id}
                    className="flex items-center gap-3 rounded-[13px] px-3 py-2.5 border-2 transition-colors"
                    style={{
                      borderColor: a.isActive ? `${look.deep}33` : "#eee8f4",
                      background: a.isActive ? `${look.deep}0d` : "#faf8fc",
                      opacity: a.isActive ? 1 : 0.6,
                    }}>
                    <span className="w-[38px] h-[38px] rounded-[11px] grid place-items-center text-[13px] font-bold text-white shrink-0"
                      style={{ background: a.isActive ? look.grad : "#b6aec2" }}>
                      {initials(a.bankName ?? a.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold text-purple leading-[1.3] truncate">{a.name}</span>
                      <span className="block text-[11.5px] text-body-soft leading-[1.3] truncate">
                        {[a.bankName, a.accountRef, a.branchName].filter(Boolean).join(" · ") || "No details yet"}
                        {a.accountHolder ? ` — ${a.accountHolder}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <button type="button" title="Edit"
                        onClick={() => setDialog({ methodId: r.id, methodCode: r.code, methodName: r.name, account: a })}
                        className="p-2 rounded-[9px] text-body-soft hover:text-purple hover:bg-white">
                        <Icon name="edit" size={14} />
                      </button>
                      <button type="button" disabled={busy === a.id} onClick={() => toggleAccount(a)}
                        className="text-[10.5px] font-bold tracking-[0.04em] px-2.5 py-1.5 rounded-full text-white"
                        style={{ background: a.isActive ? look.deep : "#b6aec2" }}>
                        {a.isActive ? "ON" : "OFF"}
                      </button>
                    </span>
                  </div>
                ))}

                <button type="button"
                  onClick={() => setDialog({ methodId: r.id, methodCode: r.code, methodName: r.name, account: null })}
                  className="w-full rounded-[13px] border-2 border-dashed py-2.5 text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors hover:text-white"
                  style={{ borderColor: `${look.deep}55`, color: look.deep }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = look.deep; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                  <Icon name="plus" size={13} />
                  {kind === "BANK" ? "Add bank account" : kind === "WALLET" ? `Add ${r.name} number` : "Add account"}
                </button>
              </div>
            </div>
          );
        })}

        {/* ---------- the website's own two, same bold language ---------- */}
        {site.length > 0 && (
          <div className="rounded-[18px] overflow-hidden shadow-soft bg-white" style={{ border: "1px solid #efe4f7" }}>
            <div className="relative px-5 py-4 text-white"
              style={{ background: "linear-gradient(120deg,#470066,#8b21c9)" }}>
              <span aria-hidden className="absolute inset-0 pointer-events-none"
                style={{ background: "radial-gradient(420px 90px at 18% 0%, rgba(255,255,255,.25), transparent 60%)" }} />
              <span className="relative flex items-center gap-3.5">
                <span className="w-[46px] h-[46px] rounded-[14px] grid place-items-center shrink-0"
                  style={{ background: "rgba(255,255,255,.2)", boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.35)" }}>
                  <Icon name="store" size={22} />
                </span>
                <span>
                  <span className="block font-display text-[21px] leading-[1.15]">The website&apos;s own</span>
                  <span className="block text-[11.5px] font-medium" style={{ color: "rgba(255,255,255,.85)" }}>
                    Switched where they are set up, not here
                  </span>
                </span>
              </span>
            </div>
            <div className="px-4 py-4 space-y-2.5">
              {site.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-[13px] px-3.5 py-3 border-2"
                  style={{ borderColor: "#47006622", background: "#4700660a" }}>
                  <span className="text-[13.5px] font-semibold text-purple">{r.name}</span>
                  <span className="text-[10.5px] font-bold tracking-[0.04em] px-2.5 py-1.5 rounded-full text-white"
                    style={{ background: "#8b21c9" }}>
                    {r.code === "COD" ? "DELIVERY SETUP" : "GATEWAY"}
                  </span>
                </div>
              ))}
              <p className="text-[12px] text-body-soft leading-[1.55] m-0 px-1 pt-1">
                Off here = off at the counter, on purchase bills, supplier payments
                and refunds, all at once. A bill already written keeps the method
                it was paid by.
              </p>
            </div>
          </div>
        )}
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
        <Field label="Shown on payment screens as" hint="Leave empty and the suggestion is used">
          <input className="ipt" value={name} onChange={(e) => setName(e.target.value)} placeholder={suggested || "A short label"} />
        </Field>
      )}
    </Modal>
  );
}
