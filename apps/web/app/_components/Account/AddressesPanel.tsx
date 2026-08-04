"use client";

import { useState } from "react";

import type { Zone } from "../../_store/useZoneStore";
import {
  useAddressHydrated,
  useAddressStore,
} from "../../_store/useAddressStore";
import Icon from "../Pdp/PdpIcons";

/*
  /account/addresses — শুধু delivery/recipient address।
  add/edit/delete/set-default — সব functional (useAddressStore, localStorage)।
*/

interface Form {
  label: string;
  recipient: string;
  phone: string;
  zone: Zone;
  line: string;
  isDefault: boolean;
}

const EMPTY: Form = {
  label: "",
  recipient: "",
  phone: "",
  zone: "dhaka",
  line: "",
  isDefault: false,
};

export default function AddressesPanel() {
  const hydrated = useAddressHydrated();
  const addresses = useAddressStore((s) => s.addresses);
  const add = useAddressStore((s) => s.add);
  const update = useAddressStore((s) => s.update);
  const remove = useAddressStore((s) => s.remove);
  const setDefault = useAddressStore((s) => s.setDefault);

  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [err, setErr] = useState<string | null>(null);

  function openNew() {
    setForm(EMPTY);
    setErr(null);
    setEditing("new");
  }

  function openEdit(id: string) {
    const a = addresses.find((x) => x.id === id);
    if (!a) return;
    setForm({
      label: a.label,
      recipient: a.recipient,
      phone: a.phone,
      zone: a.zone,
      line: a.line,
      isDefault: !!a.isDefault,
    });
    setErr(null);
    setEditing(id);
  }

  function save() {
    if (form.recipient.trim().length < 2) return setErr("Recipient name চাই।");
    if (form.line.trim().length < 6) return setErr("পুরো ঠিকানা লিখুন।");
    const payload = {
      label: form.label.trim() || form.recipient.trim(),
      recipient: form.recipient.trim(),
      phone: form.phone.trim(),
      zone: form.zone,
      line: form.line.trim(),
      isDefault: form.isDefault,
    };
    if (editing === "new") add(payload);
    else if (editing) update(editing, payload);
    setEditing(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[27px] sm:text-[32px] text-purple font-semibold">
            Delivery addresses
          </h1>
          <p className="text-[13px] text-body-soft mt-1">
            Where your gifts go. Add anyone you send to.
          </p>
        </div>
        {editing === null && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 h-[44px] px-5 rounded-[14px] bg-purple text-white font-semibold text-[13.5px] hover:bg-purple-deep transition-colors shrink-0"
          >
            <Icon name="pin" className="w-[16px] h-[16px]" />
            Add address
          </button>
        )}
      </div>

      {/* form */}
      {editing !== null && (
        <div className="bg-white border-[1.5px] border-orchid-mid rounded-[22px] p-5 sm:p-6 mt-5">
          <h2 className="font-display text-[17px] text-purple font-semibold mb-4">
            {editing === "new" ? "New delivery address" : "Edit address"}
          </h2>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Recipient name">
              <input
                value={form.recipient}
                onChange={(e) => setForm({ ...form, recipient: e.target.value })}
                placeholder="e.g. Meem"
                className="ipt"
              />
            </Field>
            <Field label="Label (optional)">
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="e.g. Meem — Dhanmondi"
                className="ipt"
              />
            </Field>
            <Field label="Phone">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+8801XXXXXXXXX"
                className="ipt"
              />
            </Field>
            <Field label="Delivery area">
              <select
                value={form.zone}
                onChange={(e) =>
                  setForm({ ...form, zone: e.target.value as Zone })
                }
                className="ipt"
              >
                <option value="dhaka">Inside Dhaka</option>
                <option value="bangladesh">Nationwide</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Full address">
                <textarea
                  value={form.line}
                  onChange={(e) => setForm({ ...form, line: e.target.value })}
                  rows={2}
                  placeholder="House, road, area, landmark…"
                  className="ipt resize-none"
                />
              </Field>
            </div>
          </div>

          <label className="flex items-center gap-2 mt-3 text-[13px] text-body cursor-pointer">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              className="w-4 h-4 accent-[#470066]"
            />
            Set as default delivery address
          </label>

          {err && <p className="text-[12.5px] text-[#B42318] mt-2">{err}</p>}

          <div className="flex gap-2 mt-5">
            <button
              type="button"
              onClick={save}
              className="inline-flex items-center h-[44px] px-6 rounded-[14px] bg-purple text-white font-semibold text-[13.5px] hover:bg-purple-deep transition-colors"
            >
              Save address
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="inline-flex items-center h-[44px] px-5 rounded-[14px] bg-white border-[1.5px] border-lavender-deep text-body-soft font-semibold text-[13.5px] hover:text-purple transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* list */}
      {!hydrated ? (
        <p className="text-[13px] text-body-soft mt-6">Loading…</p>
      ) : addresses.length === 0 ? (
        <div className="bg-white border-[1.5px] border-dashed border-lavender-deep rounded-[22px] p-10 text-center mt-5">
          <p className="text-[14px] text-body-soft">
            No addresses saved yet. Add your first recipient.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 mt-5">
          {addresses.map((a) => (
            <div
              key={a.id}
              className="bg-white border-[1.5px] border-lavender-deep rounded-[20px] p-5"
            >
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-lavender text-orchid grid place-items-center">
                  <Icon name="pin" className="w-4 h-4" />
                </span>
                <span className="text-[14px] font-semibold text-purple truncate">
                  {a.label}
                </span>
                {a.isDefault && (
                  <span className="rounded-full bg-orchid-soft text-orchid text-[10.5px] font-semibold px-2 py-0.5 shrink-0">
                    Default
                  </span>
                )}
              </div>
              <p className="text-[13px] text-body mt-3">{a.line}</p>
              <p className="text-[12px] text-body-soft mt-1.5">
                {a.recipient}
                {a.phone ? ` · ${a.phone}` : ""} ·{" "}
                {a.zone === "dhaka" ? "Inside Dhaka" : "Nationwide"}
              </p>

              <div className="flex items-center gap-3 mt-4 pt-3 border-t border-lavender text-[12.5px] font-semibold">
                <button
                  type="button"
                  onClick={() => openEdit(a.id)}
                  className="text-purple hover:text-orchid transition-colors"
                >
                  Edit
                </button>
                {!a.isDefault && (
                  <button
                    type="button"
                    onClick={() => setDefault(a.id)}
                    className="text-body-soft hover:text-purple transition-colors"
                  >
                    Set default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  className="ml-auto text-body-soft hover:text-[#B42318] transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold text-body-soft mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
