"use client";

import { useEffect, useState } from "react";
import { WRAP, ItemPageHead, ErrBar, Modal, Field, msg } from "./ItemUI";
import Icon from "./Icon";
import {
  listPaymentMethods, updatePaymentMethod, addPaymentAccount, updatePaymentAccount, deletePaymentAccount,
  type ApiPaymentMethod, type ApiPaymentAccount, type ApiPaymentAccountWrite,
} from "../_data/api";

/*
  Setup → Payment methods — DEC-GBL-001 / DEC-GBL-006 (owner, 21 Aug 2026).

  One switch per method for the whole Business OS, and under each method the
  actual accounts (three bKash numbers, four bank accounts) the money lands in.

  Design settled after three rounds with the owner, same day:
    · every edit is a dialog with a Save button; the confirmation is a floating
      toast, so the page never reflows or jumps
    · each method keeps its street colour (bKash pink, Nagad orange…) but worn
      LIGHTLY — a tinted header and coloured accents on a calm white card, not
      a full gradient banner ("style ta sundor na… easy look a banaw")
    · the cards pack into two independent columns, so a short card (Cash) does
      not leave a hole beside a tall one (bKash with three numbers)
    · an account added by mistake can be DELETED from its edit dialog — but
      only while no money ever moved through it; after that, off is the only
      way (the ledger never loses an account it has lines against)
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

/*  each method's own colour — the ones people already know from the street.
    `tint` is the light wash the header sits on.  */
const LOOKS: Record<string, { deep: string; tint: string; icon: string }> = {
  CASH:  { deep: "#0e7a3d", tint: "#eaf7ef", icon: "cash" },
  BKASH: { deep: "#d6146a", tint: "#fdeef5", icon: "phone" },
  NAGAD: { deep: "#e05a10", tint: "#fdf1e8", icon: "phone" },
  CARD:  { deep: "#2563a8", tint: "#ecf3fa", icon: "register" },
  BANK:  { deep: "#4633a5", tint: "#efedfa", icon: "warehouse" },
  OTHER: { deep: "#a05a66", tint: "#f9f0f1", icon: "wallet" },
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
        <div className="fixed top-5 right-5 z-50 text-[13px] font-semibold text-white px-4 py-2.5 rounded-[12px] shadow-lift inline-flex items-center gap-2"
          style={{ background: "#0e7a3d" }}>
          <Icon name="check" size={14} /> {toast}
        </div>
      )}

      {rows === null && (
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-10 text-center text-[13px] text-body-soft">
          Loading…
        </div>
      )}

      {/*  two independent columns (CSS multi-column), so a one-account card
           does not leave a hole beside a three-account card  */}
      <div className="md:columns-2 gap-5">
        {shop.map((r) => {
          const look = lookOf(r.code);
          const accounts = r.accounts ?? [];
          const kind = kindOf(r.code);
          const liveCount = accounts.filter((a) => a.isActive).length;
          return (
            <div key={r.id} className="break-inside-avoid mb-5 rounded-[16px] overflow-hidden bg-white shadow-soft border border-lavender-deep">

              {/* ---------- header: a light wash of the method's colour ---------- */}
              <div className="flex items-center justify-between gap-3 px-4 py-3.5"
                style={{ background: r.isActive ? look.tint : "#f4f2f6" }}>
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-[40px] h-[40px] rounded-[12px] grid place-items-center text-white shrink-0"
                    style={{ background: r.isActive ? look.deep : "#aaa1b5" }}>
                    <Icon name={look.icon} size={19} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[16.5px] font-semibold leading-[1.2] truncate"
                      style={{ color: r.isActive ? look.deep : "#7c7189" }}>
                      {r.name}
                    </span>
                    <span className="block text-[11.5px] text-body-soft">
                      {r.isActive
                        ? `${liveCount || "no"} account${liveCount === 1 ? "" : "s"} on`
                        : "Off everywhere"}
                    </span>
                  </span>
                </span>

                <button type="button" disabled={busy === r.id} onClick={() => toggleMethod(r)}
                  aria-label={`${r.isActive ? "Switch off" : "Switch on"} ${r.name}`}
                  className="shrink-0 rounded-full transition-colors"
                  style={{
                    width: 50, height: 29, padding: 3,
                    background: r.isActive ? look.deep : "#d5cede",
                    opacity: busy === r.id ? 0.5 : 1,
                  }}>
                  <span className="block bg-white rounded-full transition-transform shadow-sm"
                    style={{ width: 23, height: 23, transform: `translateX(${r.isActive ? 21 : 0}px)` }} />
                </button>
              </div>

              {/* ---------- accounts: quiet white rows, colour only as accents ---------- */}
              <div>
                {accounts.map((a) => (
                  <div key={a.id}
                    className="flex items-center gap-3 px-4 py-3 border-t border-lavender-deep/60"
                    style={{ opacity: a.isActive ? 1 : 0.55 }}>
                    <span className="w-[34px] h-[34px] rounded-full grid place-items-center text-[12px] font-bold shrink-0"
                      style={{ background: look.tint, color: look.deep }}>
                      {initials(a.bankName ?? a.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium text-purple leading-[1.3] truncate">{a.name}</span>
                      <span className="block text-[11.5px] text-body-soft leading-[1.3] truncate">
                        {[a.accountRef, a.branchName, a.accountHolder].filter(Boolean).join(" · ") || "No details yet"}
                      </span>
                    </span>
                    <span className="flex items-center gap-0.5 shrink-0">
                      <button type="button" title="Edit or delete"
                        onClick={() => setDialog({ methodId: r.id, methodCode: r.code, methodName: r.name, account: a })}
                        className="p-2 rounded-[8px] text-body-soft hover:text-purple hover:bg-lavender/50">
                        <Icon name="edit" size={14} />
                      </button>
                      <button type="button" disabled={busy === a.id} onClick={() => toggleAccount(a)}
                        className="text-[10.5px] font-bold tracking-[0.03em] w-[42px] py-1.5 rounded-full"
                        style={a.isActive
                          ? { background: look.tint, color: look.deep }
                          : { background: "#f0edf3", color: "#8d8398" }}>
                        {a.isActive ? "ON" : "OFF"}
                      </button>
                    </span>
                  </div>
                ))}

                <div className="border-t border-lavender-deep/60 px-4 py-2.5">
                  <button type="button"
                    onClick={() => setDialog({ methodId: r.id, methodCode: r.code, methodName: r.name, account: null })}
                    className="text-[12.5px] font-semibold inline-flex items-center gap-1.5 px-2 py-1.5 rounded-[8px] hover:bg-lavender/40"
                    style={{ color: look.deep }}>
                    <Icon name="plus" size={12} />
                    {kind === "BANK" ? "Add bank account" : kind === "WALLET" ? `Add ${r.name} number` : "Add account"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* ---------- the website's own two ---------- */}
        {site.length > 0 && (
          <div className="break-inside-avoid mb-5 rounded-[16px] overflow-hidden bg-white shadow-soft border border-lavender-deep">
            <div className="flex items-center gap-3 px-4 py-3.5" style={{ background: "#f7f1fb" }}>
              <span className="w-[40px] h-[40px] rounded-[12px] grid place-items-center text-white shrink-0" style={{ background: "#470066" }}>
                <Icon name="store" size={19} />
              </span>
              <span>
                <span className="block text-[16.5px] font-semibold leading-[1.2]" style={{ color: "#470066" }}>The website&apos;s own</span>
                <span className="block text-[11.5px] text-body-soft">Switched where they are set up, not here</span>
              </span>
            </div>
            {site.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 border-t border-lavender-deep/60">
                <span className="text-[13.5px] font-medium text-purple">{r.name}</span>
                <span className="text-[10.5px] font-bold tracking-[0.03em] px-2.5 py-1.5 rounded-full"
                  style={{ background: "#f7f1fb", color: "#470066" }}>
                  {r.code === "COD" ? "DELIVERY SETUP" : "GATEWAY"}
                </span>
              </div>
            ))}
            <p className="text-[12px] text-body-soft leading-[1.55] m-0 px-4 py-3 border-t border-lavender-deep/60">
              Off here = off everywhere at once.
            </p>
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
  /*  delete is two presses on the same button — no native confirm(), and no
      way to lose an account to one slip of the mouse  */
  const [armDelete, setArmDelete] = useState(false);

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

  async function remove() {
    if (!a) return;
    if (!armDelete) { setArmDelete(true); return; }
    setBusy(true); setErr("");
    try {
      onSaved(await deletePaymentAccount(a.id), "Account deleted");
    } catch (e) { setErr(msg(e, "Could not delete the account")); setArmDelete(false); setBusy(false); }
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
          <Field label="Routing number" hint="9 digits">
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

      {a && !a.isSystem && (
        <div className="mt-4 pt-3 border-t border-lavender-deep flex items-center justify-between gap-3">
          <span className="text-[11.5px] text-body-soft">
            {armDelete ? "Really delete this account?" : "Only while no money has moved through it."}
          </span>
          <button type="button" disabled={busy} onClick={remove}
            className={"text-[12.5px] font-semibold px-3 py-2 rounded-[9px] shrink-0 " + (armDelete
              ? "text-white"
              : "text-[#c0392b] border border-[#e0a1a1] bg-white hover:bg-[#fdf3f3]")}
            style={armDelete ? { background: "#c0392b" } : undefined}>
            {armDelete ? "Yes, delete" : "Delete"}
          </button>
        </div>
      )}
    </Modal>
  );
}
