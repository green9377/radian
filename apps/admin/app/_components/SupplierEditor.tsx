"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import { WRAP, ACCENT, ItemPageHead, ErrBar, Field, QuickSelect, msg } from "./ItemUI";
import {
  getSupplier, createSupplier, updateSupplier, listSupplierTypes, createSupplierType,
  uploadItemImage, formatTaka,
  type ApiSupplierDetail, type ApiSupplierType, type NotifyChannel, type NotifyMode,
} from "../_data/api";
import { SupplierAvatar } from "./SupplierViews";

/*
  Supplier create/edit — RADIAN_SUPPLIER_MODULE_ARCHITECTURE.md (23 Jul 2026).
  SUP-R01: only name + type are required — a market mama without a phone number
  must never be blocked at the door.
  SUP-R04: opening due is shown as an input only while it has never been set;
  after that the panel says "use an Adjustment entry".
*/

const tkToPaisa = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export default function SupplierEditor({ supplierId, vendorMode = false }: { supplierId?: string; vendorMode?: boolean }) {
  const router = useRouter();
  const isNew = !supplierId;

  const [types, setTypes] = useState<ApiSupplierType[]>([]);
  const [loaded, setLoaded] = useState<ApiSupplierDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dupWarn, setDupWarn] = useState<string | null>(null); // SUP-R01 confirm path
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [typeId, setTypeId] = useState("");
  const [phone, setPhone] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [market, setMarket] = useState("");
  const [address, setAddress] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [paymentTerms, setPaymentTerms] = useState("");
  const [payoutInfo, setPayoutInfo] = useState("");
  const [notifyPhone, setNotifyPhone] = useState("");
  const [notifyChannel, setNotifyChannel] = useState<NotifyChannel>("OFF");
  const [notifyMode, setNotifyMode] = useState<NotifyMode>("MANUAL");
  const [leadTimeHours, setLeadTimeHours] = useState("");
  const [notes, setNotes] = useState("");
  const [dualRole, setDualRole] = useState(false); // DEC-SUP-010
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [openingTk, setOpeningTk] = useState("");
  const [openingAsOf, setOpeningAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [openingNote, setOpeningNote] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const t = await listSupplierTypes();
        setTypes(t);
        if (supplierId) {
          const s = await getSupplier(supplierId);
          setLoaded(s);
          setName(s.name); setNickname(s.nickname ?? ""); setTypeId(s.typeId);
          setPhone(s.phone ?? ""); setContactPerson(s.contactPerson ?? "");
          setMarket(s.market ?? ""); setAddress(s.address ?? "");
          setPhotoUrl(s.photoUrl ?? null);
          setPaymentTerms(s.paymentTerms ?? ""); setPayoutInfo(s.payoutInfo ?? "");
          setNotifyPhone(s.notifyPhone ?? ""); setNotifyChannel(s.notifyChannel);
          setNotifyMode(s.notifyMode);
          setLeadTimeHours(s.leadTimeHours?.toString() ?? "");
          setNotes(s.notes ?? ""); setStatus(s.status);
          setDualRole(s.dualRole ?? false);
        } else if (t.length) {
          // DEC-SUP-009 — the door you came in through picks the behaviour
          const preferred = vendorMode
            ? t.find((x) => x.isFulfillment)
            : t.find((x) => !x.isFulfillment);
          setTypeId((preferred ?? t[0]).id);
        }
      } catch (e) { setErr(msg(e, "Could not load.")); }
      finally { setLoading(false); }
    })();
  }, [supplierId]);

  const openingLocked = !!loaded && loaded.openingDuePaisa > 0; // SUP-R04

  // review fix — the form face follows the PICKED type, not just the door you
  // came in through: editing a vendor (or switching the type mid-form) shows
  // the vendor layout (DEC-SUP-009)
  const isVendorForm = vendorMode || (types.find((t) => t.id === typeId)?.isFulfillment ?? false);

  async function save(confirmDuplicatePhone = false) {
    if (!name.trim()) { setErr("Give the supplier a name."); return; }
    if (!typeId) { setErr("Pick a type — Product Supplier or Fulfillment Vendor."); return; }
    setBusy(true); setErr(null); setDupWarn(null);
    const body = {
      name: name.trim(),
      typeId,
      nickname: nickname.trim() || undefined,
      phone: phone.trim() || undefined,
      confirmDuplicatePhone,
      contactPerson: contactPerson.trim() || undefined,
      market: market.trim() || undefined,
      address: address.trim() || undefined,
      photoUrl: photoUrl ?? undefined,
      paymentTerms: paymentTerms.trim() || undefined,
      payoutInfo: payoutInfo.trim() || undefined,
      notifyPhone: notifyPhone.trim() || undefined,
      notifyChannel,
      notifyMode,
      leadTimeHours: leadTimeHours === "" ? undefined : Math.max(0, Math.round(Number(leadTimeHours) || 0)),
      notes: notes.trim() || undefined,
      dualRole,
      ...(isNew || !openingLocked
        ? tkToPaisa(openingTk) > 0
          ? {
              openingDuePaisa: tkToPaisa(openingTk),
              openingAsOf: new Date(openingAsOf).toISOString(),
              openingNote: openingNote.trim() || undefined,
            }
          : {}
        : {}),
      ...(isNew ? {} : { status }),
    };
    try {
      if (isNew) {
        const created = await createSupplier(body);
        router.push(`/suppliers/${created.id}`);
      } else {
        await updateSupplier(supplierId!, body);
        router.push(`/suppliers/${supplierId}`);
      }
    } catch (e) {
      const m = msg(e, "Could not save.");
      if (m.startsWith("DUPLICATE_PHONE:")) setDupWarn(m.replace(/^DUPLICATE_PHONE:/, ""));
      else setErr(m);
    } finally { setBusy(false); }
  }

  const [photoBusy, setPhotoBusy] = useState(false);
  async function pickPhoto(f: File | null) {
    if (!f) return;
    setPhotoBusy(true);
    try { setPhotoUrl(await uploadItemImage(f, "suppliers")); }
    catch (e) { setErr(msg(e, "Could not upload that photo.")); }
    finally { setPhotoBusy(false); }
  }

  if (loading) return <div className={WRAP}><p className="text-[13px] text-body-soft">Loading…</p></div>;

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow={isVendorForm ? "Master Data · Suppliers · Vendors" : "Master Data · Suppliers"}
        title={isNew ? (isVendorForm ? "New vendor" : "New supplier") : `Edit — ${loaded?.name ?? ""}`}
      />
      {err && <ErrBar text={err} onClose={() => setErr(null)} />}

      {/* SUP-R01 — duplicate phone warns, never blocks */}
      {dupWarn && (
        <div className="rounded-[14px] border-2 px-5 py-4 mb-4" style={{ background: "#3b2b17", borderColor: "#f0b95e" }}>
          <b className="text-[13.5px] block mb-1" style={{ color: "#f6bb6f" }}>⚠ Same phone, different supplier</b>
          <p className="text-[13px] text-body m-0 mb-3">{dupWarn}</p>
          <div className="flex gap-2">
            <button onClick={() => setDupWarn(null)} className="border border-lavender-deep bg-white text-purple text-[13px] font-medium px-4 py-2 rounded-[10px]">
              Let me check
            </button>
            <button onClick={() => save(true)} disabled={busy}
              className="text-white text-[13px] font-medium px-4 py-2 rounded-[10px]" style={{ background: "#b45309" }}>
              It's fine — save anyway
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        {/* DEC-SUP-009 — vendors read notify/lead-time FIRST, money later; the
            flex order swaps the cards without duplicating the form */}
        <div className="flex flex-col">
          {/* ---------------- who ---------------- */}
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4 mb-5" style={{ order: 1 }}>
            <b className="text-[13.5px] text-purple block mb-3">Who</b>
            <div className="flex items-start gap-4 mb-1">
              <label className="cursor-pointer shrink-0 group relative" title="Photo (optional)">
                <SupplierAvatar s={{ name: name || "?", photoUrl }} size={64} />
                <span className="absolute -bottom-1 -right-1 w-[22px] h-[22px] rounded-full grid place-items-center text-white border-2 border-white" style={{ background: ACCENT }}>
                  {photoBusy ? <span className="text-[10px] leading-none">…</span> : <Icon name="photo" size={11} />}
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)} />
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 flex-1">
                <Field label="Name" required>
                  <input className="ipt w-full" placeholder="Kamal Uddin, Cake Factory BD…" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Nickname">
                  <input className="ipt w-full" placeholder="Kamal Mama" value={nickname} onChange={(e) => setNickname(e.target.value)} />
                </Field>
                <Field label="Type" required>
                  <QuickSelect
                    value={typeId}
                    placeholder="Pick or type to create"
                    onChange={setTypeId}
                    allowClear={false}
                    options={types.map((t) => ({ id: t.id, label: t.name }))}
                    onCreate={async (label) => {
                      try {
                        const created = await createSupplierType({ name: label });
                        setTypes((p) => [...p, created]);
                        return created.id;
                      } catch (e) { setErr(msg(e, "Could not create that type.")); return null; }
                    }}
                  />
                  {/* DEC-SUP-010 — one tick, both workspaces */}
                  <label className="flex items-center gap-2 text-[12.5px] font-medium text-body cursor-pointer select-none mt-2">
                    <input type="checkbox" checked={dualRole} onChange={(e) => setDualRole(e.target.checked)} />
                    {isVendorForm ? "Also a supplier — shows in All suppliers too" : "Also a vendor — shows in Vendors too"}
                  </label>
                </Field>
                <Field label="Phone">
                  <input className="ipt w-full" placeholder="01…" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
                <Field label="Contact person">
                  <input className="ipt w-full" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
                </Field>
                <Field label="Market / area">
                  <input className="ipt w-full" placeholder="Shahbagh flower market" value={market} onChange={(e) => setMarket(e.target.value)} />
                </Field>
              </div>
            </div>
            <Field label="Address">
              <input className="ipt w-full" value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
          </div>

          {/* ---------------- money ---------------- */}
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4 mb-5" style={{ order: isVendorForm ? 3 : 2 }}>
            <b className="text-[13.5px] text-purple block mb-3">Money</b>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
              <Field label="Payment terms">
                <input className="ipt w-full" placeholder="bKash per order, settle month-end…" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
              </Field>
              <Field label="Payout info">
                <input className="ipt w-full" placeholder="bKash 01…" value={payoutInfo} onChange={(e) => setPayoutInfo(e.target.value)} />
              </Field>
            </div>

            {/* DEC-SUP-005 — opening due */}
            {openingLocked ? (
              <div className="rounded-[12px] px-4 py-3 mt-1 text-[12.5px]" style={{ background: "#282031", color: "#b0a1ba" }}>
                Opening due is set: <b>{formatTaka(loaded!.openingDuePaisa)}</b>
                {loaded!.openingNote ? <> · {loaded!.openingNote}</> : null} — locked (SUP-R04).
                Wrong figure? Use an <b>Adjustment entry</b> on the supplier page; history stays honest.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4">
                <Field label="Opening due (tk)">
                  <input className="ipt w-full" placeholder="Old-ledger due, blank = 0" inputMode="decimal" value={openingTk} onChange={(e) => setOpeningTk(e.target.value)} />
                </Field>
                <Field label="As of">
                  <input type="date" className="ipt w-full" value={openingAsOf} onChange={(e) => setOpeningAsOf(e.target.value)} />
                </Field>
                <Field label="Opening note">
                  <input className="ipt w-full" placeholder="Old khata till June" value={openingNote} onChange={(e) => setOpeningNote(e.target.value)} />
                </Field>
              </div>
            )}
          </div>

          {/* ---------------- order notifications (DEC-SUP-003) ----------------
              VENDOR-only (owner, 19 Aug): a plain supplier never receives an
              order message, so the card only shows on the vendor face — or the
              moment the dual-role tick makes this supplier a vendor too. */}
          {(isVendorForm || dualRole) && (
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4 mb-5" style={{ order: isVendorForm ? 2 : 3 }}>
            <b className="text-[13.5px] text-purple block mb-3">Order notifications</b>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
              <Field label="Notify phone">
                <input className="ipt w-full" placeholder="Where order messages go — 01…" value={notifyPhone} onChange={(e) => setNotifyPhone(e.target.value)} />
              </Field>
              <Field label="Lead time (hours)">
                <input className="ipt w-full" placeholder="Cake needs 4h notice" inputMode="numeric" value={leadTimeHours} onChange={(e) => setLeadTimeHours(e.target.value)} />
              </Field>
              <Field label="Channel">
                <div className="flex gap-2">
                  {(["WHATSAPP", "SMS", "OFF"] as const).map((c) => (
                    <button key={c} type="button" onClick={() => setNotifyChannel(c)}
                      className="text-[12.5px] font-medium px-3.5 py-2 rounded-[10px] border"
                      style={notifyChannel === c
                        ? { background: ACCENT, borderColor: ACCENT, color: "#fff" }
                        : { background: "#fff", borderColor: "#3f3248", color: "#b0a1ba" }}>
                      {c === "WHATSAPP" ? "WhatsApp" : c === "SMS" ? "SMS" : "Off"}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Mode">
                <div className="flex gap-2">
                  {(["MANUAL", "AUTO"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setNotifyMode(m)}
                      className="text-[12.5px] font-medium px-3.5 py-2 rounded-[10px] border"
                      style={notifyMode === m
                        ? { background: ACCENT, borderColor: ACCENT, color: "#fff" }
                        : { background: "#fff", borderColor: "#3f3248", color: "#b0a1ba" }}>
                      {m === "MANUAL" ? "Manual" : "Auto (later)"}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </div>
          )}

          {/* ---------------- notes / status ---------------- */}
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4" style={{ order: 4 }}>
            <Field label="Notes">
              <textarea className="ipt w-full" rows={3} placeholder="Delivers only inside Dhaka. Closed Fridays."
                value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            {!isNew && (
              <Field label="Status">
                <div className="flex gap-2">
                  {(["ACTIVE", "INACTIVE"] as const).map((s) => (
                    <button key={s} type="button" onClick={() => setStatus(s)}
                      className="text-[12.5px] font-medium px-3.5 py-2 rounded-[10px] border"
                      style={status === s
                        ? { background: ACCENT, borderColor: ACCENT, color: "#fff" }
                        : { background: "#fff", borderColor: "#3f3248", color: "#b0a1ba" }}>
                      {s === "ACTIVE" ? "Active" : "Inactive"}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </div>
        </div>

        {/* ---------------- side rail ---------------- */}
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4 xl:sticky xl:top-4">
          <b className="text-[13.5px] text-purple block mb-3">{isNew ? "Ready?" : "Save changes"}</b>
          <button onClick={() => save(false)} disabled={busy}
            className="w-full text-white text-[13.5px] font-semibold px-4 py-3 rounded-[12px] disabled:opacity-60"
            style={{ background: ACCENT }}>
            {busy ? "Saving…" : isNew ? "Create supplier" : "Save changes"}
          </button>
          <button onClick={() => router.back()} disabled={busy}
            className="w-full border border-lavender-deep bg-white text-purple text-[13px] font-medium px-4 py-2.5 rounded-[12px] mt-2">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
