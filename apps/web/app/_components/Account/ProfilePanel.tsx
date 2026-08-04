"use client";

import { useRef, useState } from "react";

import type { Zone } from "../../_store/useZoneStore";
import { useAuthStore } from "../../_store/useAuthStore";
import {
  useProfileHydrated,
  useProfileStore,
} from "../../_store/useProfileStore";
import Icon from "../Pdp/PdpIcons";

/*
  /account/profile — avatar upload + নিজের address (functional mock)।
  name/phone/email session থেকে (read-only); avatar/ownAddress editable।
*/

const MAX_BYTES = 1_500_000; // ~1.5MB — localStorage-এ বড় image রাখব না

export default function ProfilePanel() {
  const customer = useAuthStore((s) => s.customer)!;
  const hydrated = useProfileHydrated();
  const avatar = useProfileStore((s) => s.avatar);
  const setAvatar = useProfileStore((s) => s.setAvatar);
  const ownAddress = useProfileStore((s) => s.ownAddress);
  const setOwnAddress = useProfileStore((s) => s.setOwnAddress);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [imgErr, setImgErr] = useState<string | null>(null);

  const [editAddr, setEditAddr] = useState(false);
  const [line, setLine] = useState("");
  const [zone, setZone] = useState<Zone>("dhaka");
  const [phone, setPhone] = useState("");

  const initials = customer.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const since = new Date(customer.joinedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // একই ফাইল আবার বাছলেও trigger হয়
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImgErr("Image ফাইল দিন।");
      return;
    }
    if (file.size > MAX_BYTES) {
      setImgErr("ছবি 1.5MB-এর কম হতে হবে।");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatar(typeof reader.result === "string" ? reader.result : null);
      setImgErr(null);
    };
    reader.readAsDataURL(file);
  }

  function openAddr() {
    setLine(ownAddress?.line ?? "");
    setZone(ownAddress?.zone ?? "dhaka");
    setPhone(ownAddress?.phone ?? customer.phone);
    setEditAddr(true);
  }

  function saveAddr() {
    setOwnAddress({ line: line.trim(), zone, phone: phone.trim() });
    setEditAddr(false);
  }

  const rows: { label: string; value: string }[] = [
    { label: "Name", value: customer.name },
    { label: "WhatsApp number", value: customer.phone },
    { label: "Email", value: customer.email },
    { label: "Member since", value: since },
  ];

  return (
    <div>
      <h1 className="font-display text-[27px] sm:text-[32px] text-purple font-semibold">
        Profile & Updates
      </h1>
      <p className="text-[13px] text-body-soft mt-1">
        Your photo, details and how we reach you.
      </p>

      {/* avatar */}
      <div className="bg-white border-[1.5px] border-lavender-deep rounded-[22px] p-5 sm:p-6 mt-6 flex items-center gap-5">
        <span className="w-20 h-20 rounded-full overflow-hidden bg-orchid-soft text-orchid grid place-items-center font-display text-[26px] font-semibold shrink-0">
          {hydrated && avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          ) : (
            initials
          )}
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-purple">{customer.name}</p>
          <p className="text-[12.5px] text-body-soft">
            JPG or PNG, up to 1.5MB.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 h-[38px] px-4 rounded-[12px] bg-purple text-white font-semibold text-[12.5px] hover:bg-purple-deep transition-colors"
            >
              <Icon name="upload" className="w-[15px] h-[15px]" />
              {avatar ? "Change photo" : "Upload photo"}
            </button>
            {hydrated && avatar && (
              <button
                type="button"
                onClick={() => setAvatar(null)}
                className="h-[38px] px-3 rounded-[12px] text-[12.5px] font-semibold text-body-soft hover:text-[#B42318] transition-colors"
              >
                Remove
              </button>
            )}
          </div>
          {imgErr && (
            <p className="text-[12px] text-[#B42318] mt-1.5">{imgErr}</p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPick}
            className="hidden"
          />
        </div>
      </div>

      {/* details */}
      <div className="bg-white border-[1.5px] border-lavender-deep rounded-[22px] p-5 sm:p-6 mt-4">
        <dl className="divide-y divide-lavender">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <dt className="text-[12.5px] text-body-soft">{r.label}</dt>
              <dd className="text-[13.5px] font-semibold text-purple text-right">
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* own address */}
      <div className="bg-white border-[1.5px] border-lavender-deep rounded-[22px] p-5 sm:p-6 mt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-[17px] text-purple font-semibold">
            <Icon name="pin" className="w-[17px] h-[17px] text-orchid" />
            Your address
          </h2>
          {!editAddr && (
            <button
              type="button"
              onClick={openAddr}
              className="text-[12.5px] font-semibold text-orchid hover:text-purple transition-colors"
            >
              {ownAddress ? "Edit" : "Add"}
            </button>
          )}
        </div>

        {editAddr ? (
          <div className="mt-4">
            <label className="block mb-3">
              <span className="block text-[12px] font-semibold text-body-soft mb-1.5">
                Full address
              </span>
              <textarea
                value={line}
                onChange={(e) => setLine(e.target.value)}
                rows={2}
                placeholder="House, road, area…"
                className="ipt resize-none"
              />
            </label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-[12px] font-semibold text-body-soft mb-1.5">
                  Area
                </span>
                <select
                  value={zone}
                  onChange={(e) => setZone(e.target.value as Zone)}
                  className="ipt"
                >
                  <option value="dhaka">Inside Dhaka</option>
                  <option value="bangladesh">Nationwide</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-[12px] font-semibold text-body-soft mb-1.5">
                  Phone
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+8801XXXXXXXXX"
                  className="ipt"
                />
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={saveAddr}
                className="inline-flex items-center h-[42px] px-5 rounded-[13px] bg-purple text-white font-semibold text-[13px] hover:bg-purple-deep transition-colors"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditAddr(false)}
                className="inline-flex items-center h-[42px] px-4 rounded-[13px] bg-white border-[1.5px] border-lavender-deep text-body-soft font-semibold text-[13px] hover:text-purple transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : hydrated && ownAddress ? (
          <div className="mt-3">
            <p className="text-[13.5px] text-body">{ownAddress.line}</p>
            <p className="text-[12px] text-body-soft mt-1.5">
              {ownAddress.phone} ·{" "}
              {ownAddress.zone === "dhaka" ? "Inside Dhaka" : "Nationwide"}
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-body-soft mt-3">
            No personal address saved yet.
          </p>
        )}
      </div>

      {/* WhatsApp preference */}
      <div className="flex items-start gap-3 bg-[#F1FBF4] border-[1.5px] border-[#CDEFD9] rounded-[20px] p-5 mt-4">
        <span className="w-10 h-10 rounded-full bg-[#E1F6E8] text-[#1DA851] grid place-items-center shrink-0">
          <Icon name="wa" className="w-[19px] h-[19px]" />
        </span>
        <div>
          <p className="text-[13.5px] font-semibold text-purple">
            Updates go to WhatsApp {customer.phone}
          </p>
          <p className="text-[12.5px] text-body-soft mt-1">
            Order confirmations, delivery photos and occasion reminders. Sign-in
            is by OTP — no password to remember.
          </p>
        </div>
      </div>
    </div>
  );
}
