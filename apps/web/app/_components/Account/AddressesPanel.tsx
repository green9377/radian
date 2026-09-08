"use client";

import { useEffect, useState } from "react";

import {
  addAddress,
  editAddress,
  getAddresses,
  removeAddress,
  type AccountAddress,
} from "../../_data/accountApi";
import { useToken } from "../../_store/useAuthStore";
import Icon from "../Pdp/PdpIcons";
import { Empty, Loading, Panel } from "./AccountShell";

/*
  /account/addresses — the Address Book: WHERE GIFTS GO.

  ⚠️ Kept apart from the customer's own address on the Profile screen (the
  owner's rule, 8 Sep 2026). This screen is other people; that one is them.

  These rows are `Recipient` — the table Customer Management already owns, and
  the same book the admin sees. The account does not keep a second copy of
  anybody's address (One Data One Owner).
*/

const input =
  "w-full border-[1.5px] border-lavender-deep rounded-[13px] px-4 py-3 text-[14px] text-body outline-none transition-colors focus:border-orchid";

const RELATIONS = ["mother", "father", "wife", "husband", "partner", "sibling", "friend", "colleague", "other"];

type Draft = {
  id?: string;
  name: string;
  phone: string;
  line: string;
  zone: string;
  relationship: string;
  isDefault: boolean;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  phone: "",
  line: "",
  zone: "DHAKA",
  relationship: "other",
  isDefault: false,
};

export default function AddressesPanel() {
  const token = useToken();
  const [rows, setRows] = useState<AccountAddress[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getAddresses(token)
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load your addresses."));
  }, [token]);

  async function save() {
    if (!token || !draft) return;
    setBusy(true);
    setErr(null);
    try {
      const next = draft.id
        ? await editAddress(token, draft.id, draft)
        : await addAddress(token, draft);
      setRows(next);
      setDraft(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save that address.");
    } finally {
      setBusy(false);
    }
  }

  async function drop(id: string) {
    if (!token) return;
    setBusy(true);
    try {
      setRows(await removeAddress(token, id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove that address.");
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(id: string) {
    if (!token) return;
    setBusy(true);
    try {
      setRows(await editAddress(token, id, { isDefault: true }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      icon="pin"
      title="Address book"
      sub="Where gifts go — pick any of these in one tap at checkout."
      action={
        !draft && (
          <button
            type="button"
            onClick={() => setDraft({ ...EMPTY_DRAFT })}
            className="bg-white text-purple border-2 border-white rounded-[13px] px-4 py-2.5 font-bold text-[13px]"
          >
            + Add new address
          </button>
        )
      }
    >
      {err && (
        <p className="mb-4 rounded-[13px] bg-[#FDECEE] border border-[#F5C2C7] px-4 py-3 text-[13px] text-[#8A1220]">
          {err}
        </p>
      )}

      {draft && (
        <div className="border-[1.5px] border-orchid-mid bg-[#FDF8FF] rounded-[18px] p-5 mb-5">
          <b className="block font-display text-[17px] text-purple mb-4">
            {draft.id ? "Edit address" : "New address"}
          </b>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-[12.5px] font-bold text-purple mb-1.5">Who receives it</span>
              <input
                className={input}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Meem Rahman"
              />
            </label>
            <label className="block">
              <span className="block text-[12.5px] font-bold text-purple mb-1.5">Their phone</span>
              <input
                className={input}
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="01X XXX XXXXX"
                inputMode="tel"
              />
            </label>
          </div>

          <label className="block mt-4">
            <span className="block text-[12.5px] font-bold text-purple mb-1.5">Full address</span>
            <textarea
              className={`${input} min-h-[86px] resize-none`}
              value={draft.line}
              onChange={(e) => setDraft({ ...draft, line: e.target.value })}
              placeholder="House 8, Road 27, Flat B4, Dhanmondi — opposite Star Kabab"
            />
          </label>

          <div className="flex flex-wrap gap-4 items-end mt-4">
            <label className="block">
              <span className="block text-[12.5px] font-bold text-purple mb-1.5">Relationship</span>
              <select
                className={input}
                value={draft.relationship}
                onChange={(e) => setDraft({ ...draft, relationship: e.target.value })}
              >
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {r[0].toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </label>

            <div className="inline-flex p-1 bg-lavender rounded-[14px] gap-1">
              {[
                { id: "DHAKA", label: "Inside Dhaka" },
                { id: "BANGLADESH", label: "All Bangladesh" },
              ].map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setDraft({ ...draft, zone: z.id })}
                  className={`px-4 py-2 rounded-[11px] text-[13px] font-bold transition-colors ${
                    draft.zone === z.id ? "bg-white text-purple shadow-soft" : "text-body-soft"
                  }`}
                >
                  {z.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setDraft({ ...draft, isDefault: !draft.isDefault })}
              className="flex items-center gap-2.5"
            >
              <span
                className={`w-5 h-5 rounded-[6px] border-[1.5px] grid place-items-center ${
                  draft.isDefault ? "bg-purple border-purple text-white" : "border-lavender-deep bg-white"
                }`}
              >
                {draft.isDefault && <Icon name="check" className="w-3 h-3" />}
              </span>
              <span className="text-[13px] font-bold text-purple">Use this one by default</span>
            </button>
          </div>

          <div className="flex gap-2.5 mt-5">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="bg-purple text-white rounded-[13px] px-6 py-3 font-bold text-[13.5px] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save address"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="bg-white border-[1.5px] border-lavender-deep rounded-[13px] px-5 py-3 font-bold text-[13px] text-body"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!rows && !err && <Loading />}

      {rows && rows.length === 0 && !draft && (
        <Empty
          title="No addresses saved yet"
          sub="Save the ones you send to often — checkout then fills itself in one tap."
        />
      )}

      {rows?.map((a) => (
        <div
          key={a.id}
          className={`border-[1.5px] rounded-[16px] p-4 mb-3 ${
            a.isDefault ? "border-orchid-mid bg-[#FDF8FF]" : "border-lavender-deep"
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <b className="text-[14px] text-purple">{a.name}</b>
            <span className="rounded-full bg-lavender text-purple px-2.5 py-1 text-[11px] font-bold">
              {a.zone === "BANGLADESH" ? "All Bangladesh" : "Inside Dhaka"}
            </span>
            {a.isDefault && (
              <span className="rounded-full bg-[#E8F9EE] text-[#0E7A3D] px-2.5 py-1 text-[11px] font-bold">
                Default
              </span>
            )}
            <span className="ml-auto flex gap-2">
              {!a.isDefault && (
                <button
                  type="button"
                  onClick={() => makeDefault(a.id)}
                  className="rounded-[11px] border-[1.5px] border-lavender-deep bg-white px-3 py-1.5 text-[12.5px] font-bold text-body"
                >
                  Make default
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    id: a.id,
                    name: a.name,
                    phone: a.phone,
                    line: a.line,
                    zone: a.zone,
                    relationship: a.relationship,
                    isDefault: a.isDefault,
                  })
                }
                className="rounded-[11px] border-[1.5px] border-lavender-deep bg-white px-3 py-1.5 text-[12.5px] font-bold text-body"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => drop(a.id)}
                className="rounded-[11px] border-[1.5px] border-[#F5C2C7] bg-white px-3 py-1.5 text-[12.5px] font-bold text-[#C4172B]"
              >
                Delete
              </button>
            </span>
          </div>
          <p className="text-[13px] text-body leading-relaxed m-0">
            {a.line}
            <br />
            {a.phone}
          </p>
        </div>
      ))}
    </Panel>
  );
}
