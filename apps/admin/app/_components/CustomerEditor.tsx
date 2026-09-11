"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createCustomer,
  updateCustomer,
  getCustomer,
  setCustomerBlocked,
  listSegmentsSafe,
  type ApiSegment,
  type ApiRecipient,
  uploadImage,
  addCustomerRecipient,
  updateCustomerRecipient,
  removeCustomerRecipient,
  type ApiCustomer,
} from "../_data/api";
import { COUNTRY_CODES } from "../_data/countryCodes";
import {
  SEGMENT_LABEL,
  RELATIONSHIP_LABEL,
  initials,
  shortDate,
  ago,
  type Segment,
  type Recipient,
  type RecipientOccasion,
  type OccasionType,
  type Relationship,
  type CustomerStatus,
} from "../_data/customers";
import { formatTaka, type Zone } from "../_data/products";
import { isDemoMode } from "../_data/demoMode";
import Icon from "./Icon";
import PhoneField from "./PhoneField";
import SpecialDateField from "./SpecialDateField";

/*
  Customer Editor — add / edit for Customer Management.
  Left: section nav. Middle: the active section. Right: live "My Account" preview.
  Data is mock (_data/customers.ts). ⇄ SWAP HERE: Customer API (:4000) will load/save.

  Key rules made visible here:
  - Phone = identity key (WhatsApp OTP, no password). INTERNATIONAL — any country.
  - Recipients = customer-owned rich address book. Any phone/country; we contact
    whatever number is given. They never log in or order.
  - status blocked is NOT delete. Delete = soft-hide.
  - Orders / lifetime value / deliveries are OWNED BY SALES — read-only (One Data, One Owner).
*/

/*  ১০ আগস্ট — মালিক: *"protita card colorfull hok"*。 প্রতিটা অংশের নিজের রং,
    কিন্তু সবগুলোই ব্র্যান্ডের ভেতর থেকে (বেগুনি → orchid → গোলাপি → rose gold)。
    বাইরের রং ঢুকলে রঙিন নয়, এলোমেলো লাগত。 যেটা খোলা সেটা ভরাট হয়ে যায় — কোন
    পাতায় আছেন, দূর থেকেই বোঝা যায়。                                          */
const SECTIONS = [
  {
    id: "profile", label: "Profile", blurb: "Name, phone, photo", icon: "user",
    tint: "#f3e8f9", edge: "#e6d3f2", chip: "#e6d3f2",
    ink: "#3b0b52", sub: "#816894", strong: "#470066",
    fill: "linear-gradient(100deg,#470066,#7a1e86)", glow: "rgba(71,0,102,.30)", soft: "#e9a8f5",
  },
  {
    id: "recipients", label: "Recipients", blurb: "Who they send to", icon: "pin",
    tint: "#fbeaf0", edge: "#f2cddb", chip: "#f2cddb",
    ink: "#6b2138", sub: "#a06a7c", strong: "#993556",
    fill: "linear-gradient(100deg,#993556,#c25476)", glow: "rgba(153,53,86,.28)", soft: "#f4c0d1",
  },
  {
    id: "segments", label: "Segments", blurb: "Tags and notes", icon: "hash",
    tint: "#f9e9fd", edge: "#eecffa", chip: "#eecffa",
    ink: "#5e1a5c", sub: "#96639a", strong: "#8c2d84",
    fill: "linear-gradient(100deg,#8c2d84,#b444ad)", glow: "rgba(140,45,132,.26)", soft: "#f0c4ec",
  },
  {
    id: "orders", label: "Orders", blurb: "Value and history", icon: "bag",
    tint: "#f8eef0", edge: "#e8c9ce", chip: "#e8c9ce",
    ink: "#6d3a43", sub: "#a5757e", strong: "#98545f",
    fill: "linear-gradient(100deg,#98545f,#c07f8a)", glow: "rgba(152,84,95,.26)", soft: "#eccdd2",
  },
  {
    id: "activity", label: "Activity", blurb: "Every change, logged", icon: "clock",
    tint: "#f3eff8", edge: "#e4dcee", chip: "#e4dcee",
    ink: "#453556", sub: "#8b7c9c", strong: "#5f4b73",
    fill: "linear-gradient(100deg,#5f4b73,#7f6b93)", glow: "rgba(95,75,115,.24)", soft: "#ded4ec",
  },
] as const;
type SecId = (typeof SECTIONS)[number]["id"];


/* ---------- small building blocks (same visual language as ProductEditor) ---------- */
function Card({
  icon,
  title,
  hint,
  children,
}: {
  icon?: string;
  title: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-6 mb-5">
      <div className="flex items-start gap-3 mb-4">
        {icon && (
          <span className="w-9 h-9 rounded-[11px] bg-orchid-soft text-purple grid place-items-center shrink-0">
            <Icon name={icon} size={19} />
          </span>
        )}
        <div>
          <h3 className="font-display text-[17px] text-purple m-0 leading-tight">
            {title}
          </h3>
          {hint && (
            <p className="text-body-soft text-[13px] mt-1 mb-0 leading-relaxed">
              {hint}
            </p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  note,
  full,
  children,
}: {
  label?: React.ReactNode;
  note?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={"flex flex-col gap-2 " + (full ? "col-span-full" : "")}>
      {label && (
        <label className="text-[13.5px] font-semibold text-body tracking-[0.01em]">
          {label}
        </label>
      )}
      {children}
      {note && <span className="text-[13px] text-body-soft">{note}</span>}
    </div>
  );
}

const delBtn =
  "border border-lavender-deep bg-white text-body-soft hover:text-[#c0392b] hover:border-[#e0a1a1] rounded-[10px] w-[38px] h-[38px] grid place-items-center shrink-0 transition-colors";
const addBtn =
  "self-start mt-3 border border-lavender-deep bg-white text-[13px] px-3.5 py-2 rounded-[10px] hover:border-orchid text-purple font-medium inline-flex items-center gap-1.5 transition-colors";

let seq = 0;
const newId = (p: string) => `${p}-new-${++seq}`;

const OCC_LABEL: Record<OccasionType, string> = {
  birthday: "Birthday",
  anniversary: "Anniversary",
  custom: "Custom",
};

export default function CustomerEditor({ id }: { id?: string }) {
  const [sec, setSec] = useState<SecId>("profile");

  // Profile — starts empty, filled from the API/demo record below
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("Bangladesh");
  const [ownLine, setOwnLine] = useState("");
  const [status, setStatus] = useState<CustomerStatus>("active");
  const [imageUrl, setImageUrl] = useState<string | null>(null); // DEC-CUS-009
  const [uploading, setUploading] = useState(false);

  // Recipients (rich book)
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  // Segments & notes
  const [segments, setSegments] = useState<Segment[]>([]);
  const [note, setNote] = useState("");

  /* ⇄ SWAPPED: load/save via :4000 API */
  const router = useRouter();
  const [apiCustomerId, setApiCustomerId] = useState<string | null>(null);
  /** the loaded record — source of the read-only Sales figures */
  const [api, setApi] = useState<ApiCustomer | null>(null);
  const [apiSegments, setApiSegments] = useState<ApiSegment[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    listSegmentsSafe()
      .then((r) => setApiSegments(r.items))
      .catch(() => {});
    if (id) {
      getCustomer(id)
        .then((c) => {
          setApiCustomerId(c.id);
          setApi(c);
          setName(c.name);
          setEmail(c.email ?? "");
          setPhone(c.phone);
          setCountry(c.country);
          setOwnLine(c.ownAddressLine ?? "");
          setImageUrl(c.imageUrl ?? null);
          setStatus(c.status === "BLOCKED" ? "blocked" : "active");
          setNote(c.note ?? "");
          setSegments(((c.segments ?? []).map((s) => s.slug)) as Segment[]);
          setRecipients(
            (c.recipients ?? []).map((r: ApiRecipient) => ({
              id: r.id,
              name: r.name,
              phone: r.phone,
              relationship: r.relationship as Relationship,
              zone: (r.zone === "DHAKA" ? "dhaka" : "bangladesh") as Zone,
              addressLine: r.addressLine,
              note: r.note ?? undefined,
              isFavorite: r.isFavorite,
              deliveriesCount: r.deliveriesCount,
              lastDeliveryAt: r.lastDeliveryAt ? Date.parse(r.lastDeliveryAt) : undefined,
              occasions: (r.occasions ?? []).map((o) => ({
                type: o.type.toLowerCase() as OccasionType,
                date: o.date,
                year: o.year ?? null,
                label: o.label ?? undefined,
              })),
            })),
          );
        })
        .catch(() => setNotFound(true))
        .finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function recipientToApi(r: Recipient) {
    return {
      name: r.name,
      phone: r.phone,
      relationship: r.relationship,
      zone: r.zone === "dhaka" ? "DHAKA" : "BANGLADESH",
      addressLine: r.addressLine,
      isFavorite: r.isFavorite ?? false,
      occasions: (r.occasions ?? []).map((o) => ({
        type: o.type.toUpperCase(),
        date: o.date,
        year: o.year ?? null, // DEC-CUS-010 — only if the customer gave one
        label: o.label,
      })),
    };
  }

  function buildDto(): Record<string, unknown> {
    const segmentIds = segments
      .map((slug) => apiSegments.find((s) => s.slug === slug)?.id)
      .filter((x): x is string => !!x);
    return {
      name,
      phone,
      email: email || undefined,
      country: country || "Bangladesh",
      ownAddressLine: ownLine || undefined,
      imageUrl: imageUrl ?? null, // DEC-CUS-009 — null clears the photo
      note: note || undefined,
      whatsappVerified: true,
      segmentIds,
      recipients: recipients.filter((r) => r.name && r.phone).map(recipientToApi),
    };
  }

  /**
   * DEC-CUS-011 — bring the stored recipient book in line with what is on screen.
   * Removed rows go first: a phone freed by a delete may be reused by an add in
   * the same save, and doing it the other way round would collide.
   */
  async function syncRecipients(customerId: string) {
    const onScreen = recipients.filter((r) => r.name.trim() && r.phone.trim());
    const before = api?.recipients ?? [];
    const keptIds = new Set(onScreen.map((r) => r.id));

    for (const old of before) {
      if (!keptIds.has(old.id)) await removeCustomerRecipient(customerId, old.id);
    }
    for (const r of onScreen) {
      const body = recipientToApi(r);
      if (before.some((b) => b.id === r.id)) {
        await updateCustomerRecipient(customerId, r.id, body);
      } else {
        await addCustomerRecipient(customerId, body);
      }
    }
  }

  async function handleSave() {
    setSaveErr(null);
    if (!name.trim()) {
      setSaveErr("Enter a customer name.");
      return;
    }
    if (!phone.trim() || !phone.startsWith("+")) {
      setSaveErr("Enter the phone in international format (+country…).");
      return;
    }
    setSaving(true);
    try {
      const dto = buildDto();
      if (apiCustomerId) {
        /*  DEC-CUS-011 (১০ আগস্ট) — customer PATCH `recipients` দেখেই না。
            আগে এখানে শুধু `delete` করা হতো, ফলে চলতি গ্রাহকের recipient-এ করা
            প্রতিটা বদল — সদ্য টাইপ করা জন্মদিনও — চুপচাপ হারিয়ে যেত。 এখন
            নিজের endpoint দিয়ে বই মিলিয়ে দিই。                              */
        if (!isDemoMode()) {
          delete (dto as Record<string, unknown>).recipients;
          await updateCustomer(apiCustomerId, dto);
          await syncRecipients(apiCustomerId);
        } else {
          await updateCustomer(apiCustomerId, dto);
        }
      } else {
        await createCustomer(dto);
      }
      router.push("/customers/list");
      router.refresh();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /* Block state is its own action (dedicated endpoint) — it is NOT part of Save.
     Both the top-bar button and the Profile toggle go through here, so what you
     see is always what is stored. */
  async function setBlocked(toBlocked: boolean) {
    if (!apiCustomerId) {
      setStatus(toBlocked ? "blocked" : "active"); // unsaved new customer
      return;
    }
    setSaveErr(null);
    try {
      const updated = await setCustomerBlocked(apiCustomerId, toBlocked);
      setStatus(updated.status === "BLOCKED" ? "blocked" : "active");
      setApi((prev) => (prev ? { ...prev, status: updated.status } : prev));
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Block failed");
    }
  }
  const handleBlock = () => setBlocked(status !== "blocked");

  /* ---- recipient helpers ---- */
  const addRecipient = () =>
    setRecipients((list) => [
      ...list,
      {
        id: newId("rcp"),
        name: "",
        phone: "",
        relationship: "friend",
        zone: "dhaka",
        addressLine: "",
        occasions: [],
        deliveriesCount: 0,
      },
    ]);
  const patchRcp = (rid: string, patch: Partial<Recipient>) =>
    setRecipients((list) =>
      list.map((r) => (r.id === rid ? { ...r, ...patch } : r)),
    );
  const removeRcp = (rid: string) =>
    setRecipients((list) => list.filter((r) => r.id !== rid));
  const toggleFav = (rid: string) =>
    setRecipients((list) =>
      list.map((r) => (r.id === rid ? { ...r, isFavorite: !r.isFavorite } : r)),
    );
  const addOccasion = (rid: string) =>
    setRecipients((list) =>
      list.map((r) =>
        r.id === rid
          ? {
              ...r,
              occasions: [
                ...r.occasions,
                { type: "birthday", date: "01-01" } as RecipientOccasion,
              ],
            }
          : r,
      ),
    );
  const patchOccasion = (
    rid: string,
    idx: number,
    patch: Partial<RecipientOccasion>,
  ) =>
    setRecipients((list) =>
      list.map((r) =>
        r.id === rid
          ? {
              ...r,
              occasions: r.occasions.map((o, i) =>
                i === idx ? { ...o, ...patch } : o,
              ),
            }
          : r,
      ),
    );
  const removeOccasion = (rid: string, idx: number) =>
    setRecipients((list) =>
      list.map((r) =>
        r.id === rid
          ? { ...r, occasions: r.occasions.filter((_, i) => i !== idx) }
          : r,
      ),
    );

  const toggleSeg = (s: Segment) =>
    setSegments((cur) =>
      cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
    );

  /* Read-only Sales figures come from the loaded record (demo or live) — NOT the
     legacy local mock, which never matches a real id. */
  const ms = (v?: string | null) => (v ? Date.parse(v) : undefined);
  const orders = api?.ordersCount ?? 0;
  const ltvPaisa = api?.ltvPaisa ?? 0;
  const t: "new" | "onetime" | "repeat" =
    orders <= 0 ? "new" : orders === 1 ? "onetime" : "repeat";
  const aov = orders > 0 ? Math.round(ltvPaisa / orders) : 0;
  const avatarBg = api?.avatarBg ?? "linear-gradient(150deg,#cf43ea,#b76e79)";
  const joinedMs = ms(api?.firstOrderAt);
  const abroad = country.trim().toLowerCase() !== "bangladesh";

  return (
    <div className="px-6 md:px-8 pt-6 pb-24 max-w-[1650px]">
      {/* top bar */}
      <div className="sticky top-0 z-20 -mx-6 md:-mx-8 px-6 md:px-8 py-3.5 bg-lavender/85 backdrop-blur border-b border-lavender-deep flex items-center gap-3 mb-6">
        <Link
          href="/customers/list"
          className="border border-lavender-deep bg-white text-body-soft hover:text-purple w-[38px] h-[38px] rounded-[11px] grid place-items-center shrink-0"
          title="Back"
        >
          <Icon name="chevronLeft" size={19} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] text-purple m-0 truncate leading-tight">
            {id ? name || "Edit customer" : "Add customer"}
          </h1>
          <p className="text-body-soft text-[12.5px] m-0">
            {id
              ? `${orders} orders · ${formatTaka(ltvPaisa)} · ${phone}`
              : "New customer — WhatsApp verified on first login"}
          </p>
        </div>
        {id && (
          <button
            type="button"
            onClick={handleBlock}
            className="border border-lavender-deep bg-white text-[13.5px] px-4 py-2.5 rounded-[11px] font-medium hover:border-[#e0a1a1] hover:text-[#c0392b] text-body-soft"
          >
            {status === "blocked" ? "Unblock" : "Block"}
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-purple hover:bg-purple-deep text-white text-[13.5px] px-5 py-2.5 rounded-[11px] font-medium inline-flex items-center gap-2 shadow-soft disabled:opacity-50"
        >
          <Icon name="check" size={17} /> {saving ? "Saving…" : id ? "Save changes" : "Add customer"}
        </button>
      </div>

      {loading && (
        <div className="text-[13px] text-body-soft mb-4">Loading customer…</div>
      )}
      {notFound && (
        <div className="bg-[#fff4e6] border border-[#fce4c4] text-[#b45309] rounded-[12px] px-4 py-3 mb-4 text-[13px]">
          This customer could not be loaded.{" "}
          <Link href="/customers/list" className="underline font-medium">
            Back to all customers
          </Link>
        </div>
      )}
      {saveErr && (
        <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-4 text-[13px]">
          {saveErr}
        </div>
      )}

      <div className="flex gap-6 items-start">
        {/* section nav */}
        <nav className="w-[236px] shrink-0 sticky top-[84px] hidden md:grid gap-2">
          {SECTIONS.map((s) => {
            const on = sec === s.id;
            const badge =
              s.id === "recipients" && recipients.length > 0 ? String(recipients.length)
                : s.id === "orders" && orders > 0 ? formatTaka(ltvPaisa)
                  : null;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSec(s.id)}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-[14px] text-left transition-all"
                style={on
                  ? { background: s.fill, border: "1px solid transparent", boxShadow: `0 5px 16px ${s.glow}` }
                  : { background: s.tint, border: `1px solid ${s.edge}` }}
              >
                <span className="w-[34px] h-[34px] rounded-[11px] grid place-items-center shrink-0"
                  style={{ background: on ? "rgba(255,255,255,.22)" : s.chip, color: on ? "#fff" : s.strong }}>
                  <Icon name={s.icon} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium truncate"
                    style={{ color: on ? "#fff" : s.ink }}>{s.label}</span>
                  <span className="block text-[11px] truncate"
                    style={{ color: on ? s.soft : s.sub }}>{s.blurb}</span>
                </span>
                {badge && (
                  <span className="text-[11px] font-medium shrink-0 rounded-full grid place-items-center px-2 h-[20px]"
                    style={on
                      ? { background: "rgba(255,255,255,.25)", color: "#fff" }
                      : { background: s.strong, color: "#fff" }}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* main column */}
        <div className="flex-1 min-w-0">
          {/* mobile section picker */}
          <div className="md:hidden mb-4">
            <select
              className="ipt h-[44px]"
              value={sec}
              onChange={(e) => setSec(e.target.value as SecId)}
            >
              {SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* PROFILE */}
          {sec === "profile" && (
            <>
              {/*  DEC-CUS-009 (১০ আগস্ট) — মালিক: *"profile picture upload dewar
                  option nei"*。 ছবি থাকলে ছবি, না থাকলে নামের আদ্যাক্ষর。 ব্র্যান্ড
                  purple → rose gold ঢাল, accent দুই জায়গায় মাত্র。            */}
              <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden mb-5">
                <div className="flex items-center gap-4 px-5 py-4"
                  style={{ background: "linear-gradient(105deg,#470066,#320049 62%,#b76e79)" }}>
                  <label className="relative shrink-0 cursor-pointer" title="Upload a photo">
                    <span className="w-[58px] h-[58px] rounded-full grid place-items-center overflow-hidden border-2 border-orchid-mid"
                      style={{ background: imageUrl ? "#fff" : "#f9e9fd" }}>
                      {imageUrl
                        ? /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                        : name.trim()
                          ? <span className="text-[20px] font-semibold text-purple">{initials(name)}</span>
                          /* নাম না থাকলে "?" নয় — ওটা ভাঙা মনে হয় */
                          : <span className="text-purple/70"><Icon name="user" size={24} /></span>}
                    </span>
                    <span className="absolute -right-1 -bottom-1 w-[23px] h-[23px] rounded-full bg-orchid grid place-items-center border-2 border-white text-white">
                      <Icon name="photo" size={11} />
                    </span>
                    <input type="file" accept="image/*" className="hidden" disabled={uploading}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setUploading(true); setSaveErr(null);
                        try { setImageUrl((await uploadImage(f, "people")).url); }
                        catch (err) { setSaveErr(err instanceof Error ? err.message : "Upload failed"); }
                        finally { setUploading(false); e.target.value = ""; }
                      }} />
                  </label>
                  <div className="min-w-0">
                    <div className="text-[16px] font-semibold text-white truncate">
                      {name || "New customer"}
                    </div>
                    <div className="text-[12.5px] text-orchid-mid">
                      {uploading ? "Uploading…" : imageUrl ? "Photo added" : "Add a photo, or leave the initials"}
                      {imageUrl && !uploading && (
                        <button type="button" onClick={() => setImageUrl(null)}
                          className="ml-2 underline hover:text-white">remove</button>
                      )}
                    </div>
                  </div>
                  <span className="ml-auto shrink-0 text-[11.5px] px-3 py-1.5 rounded-full font-medium inline-flex items-center gap-1.5"
                    style={{ background: "#e8c9ce", color: "#7a3f48" }}>
                    <Icon name="shield" size={12} /> WhatsApp is the login
                  </span>
                </div>
              </div>

              <Card
                icon="user"
                title="Profile"
                
              >
                {/*  ⚠️ ১০ আগস্ট — এখানে `gridCls` (auto-fit, minmax 220px) ছিল,
                    আর সেটাই ফোনের ঘরটা পিষে দিয়েছিল: চারটে মাঠ চার কলামে বসত,
                    ফোন পেত ~২২০px, তার ভেতরে code ১১৮px — নম্বরের জন্য বাকি
                    থাকত ৯০px。 মালিক: *"customer number ar ghor ki obostha"*。
                    সব মাঠ সমান চওড়া হওয়ার কোনো কারণ নেই。 তাই ইচ্ছাকৃত সারি:
                    নাম+ইমেইল একসাথে, ফোন+দেশ আলাদা সারিতে ফোনকে বেশি জায়গা দিয়ে。 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <Field label="Full name">
                    <input
                      className="ipt h-[44px]"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nusrat Jahan"
                    />
                  </Field>
                  <Field label="Email" >
                    <input
                      className="ipt h-[44px]"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                    />
                  </Field>
                </div>

                {/* the identity row — phone needs room, so it gets it */}
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4 mb-4">
                  <Field
                    label={
                      <span className="inline-flex items-center gap-2">
                        Phone / WhatsApp
                        <span className="inline-flex items-center gap-1 text-[11px] text-rosegold bg-rosegold-light/80 px-2 py-0.5 rounded-full font-medium">
                          <Icon name="shield" size={11} /> identity key
                        </span>
                      </span>
                    }
                    note="Changing it re-verifies the account."
                  >
                    <PhoneField value={phone} onChange={setPhone} />
                  </Field>
                  <Field
                    label="Lives in"
                    
                  >
                    {/*  ১০ আগস্ট — এটা খোলা লেখার ঘর ছিল。 "Banglades" লিখলেও কেউ
                        ধরত না, আর NRB ফিল্টার country মিলিয়ে চলে。 তাই তালিকা。
                        ⚠️ চেনা তালিকায় না থাকা পুরনো নাম যেন হারিয়ে না যায় —
                        সেটাকেও একটা option হিসেবে রাখি。                        */}
                    <select
                      className="ipt h-[44px]"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                    >
                      {!COUNTRY_CODES.some((c) => c.name === country) && country && (
                        <option value={country}>{country}</option>
                      )}
                      {COUNTRY_CODES.map((c) => (
                        <option key={c.iso} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field
                    label="Account status"
                    note="Blocked = cannot log in or order. Nothing is deleted."
                  >
                    <div className="inline-flex bg-lavender rounded-[11px] p-[4px] gap-[4px]">
                      {(["active", "blocked"] as CustomerStatus[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setBlocked(s === "blocked")}
                          className={
                            "text-[13px] px-4 py-2 rounded-[8px] font-medium capitalize transition-colors " +
                            (status === s
                              ? s === "blocked"
                                ? "bg-white text-[#c0392b] shadow-soft"
                                : "bg-white text-purple shadow-soft"
                              : "text-body-soft hover:text-purple")
                          }
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Joined" >
                    <input
                      className="ipt h-[44px] opacity-70"
                      value={id ? shortDate(joinedMs) : "— on first login —"}
                      disabled
                    />
                  </Field>
                </div>
              </Card>

              <Card
                icon="pin"
                title="Own address"
                
              >
                <Field label="Address line" full>
                  <input
                    className="ipt h-[44px]"
                    value={ownLine}
                    onChange={(e) => setOwnLine(e.target.value)}
                    placeholder="540 Market St, San Francisco, CA 94104"
                  />
                </Field>
              </Card>
            </>
          )}

          {/* RECIPIENTS — rich book */}
          {sec === "recipients" && (
            <Card
              icon="pin"
              title="Recipient book"
              
            >
              <div className="flex flex-col gap-4">
                {recipients.map((r) => (
                  <div
                    key={r.id}
                    className="border border-lavender-deep rounded-[14px] p-4 bg-lavender/40"
                  >
                    {/* header row */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => toggleFav(r.id)}
                        className={
                          "text-[12px] px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1.5 transition-colors " +
                          (r.isFavorite
                            ? "bg-rosegold text-white"
                            : "border border-lavender-deep bg-white text-body-soft hover:border-orchid hover:text-purple")
                        }
                      >
                        <Icon name="heart" size={13} />
                        {r.isFavorite ? "Favourite" : "Mark favourite"}
                      </button>
                      <div className="flex items-center gap-2">
                        {r.deliveriesCount > 0 && (
                          <span className="text-[13px] text-body-soft">
                            {r.deliveriesCount} deliver
                            {r.deliveriesCount === 1 ? "y" : "ies"}
                            {r.lastDeliveryAt
                              ? ` · last ${ago(r.lastDeliveryAt)}`
                              : ""}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeRcp(r.id)}
                          className={delBtn}
                          title="Remove recipient"
                        >
                          <Icon name="trash" size={17} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-[1fr_1fr] gap-2.5 max-md:grid-cols-1">
                      <div>
                        <div className="text-[13px] text-body-soft mb-1 font-medium">
                          Recipient name
                        </div>
                        <input
                          className="ipt h-[40px]"
                          placeholder="Meem"
                          value={r.name}
                          onChange={(e) =>
                            patchRcp(r.id, { name: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <div className="text-[13px] text-body-soft mb-1 font-medium">
                          Relationship
                        </div>
                        <select
                          className="ipt h-[40px]"
                          value={r.relationship}
                          onChange={(e) =>
                            patchRcp(r.id, {
                              relationship: e.target.value as Relationship,
                            })
                          }
                        >
                          {(
                            Object.keys(RELATIONSHIP_LABEL) as Relationship[]
                          ).map((rel) => (
                            <option key={rel} value={rel}>
                              {RELATIONSHIP_LABEL[rel]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-2.5">
                      <div className="text-[13px] text-body-soft mb-1 font-medium">
                        Phone (any country)
                      </div>
                      <PhoneField
                        value={r.phone}
                        size={40}
                        onChange={(v) => patchRcp(r.id, { phone: v })}
                      />
                    </div>

                    <div className="grid grid-cols-[200px_1fr] gap-2.5 mt-2.5 max-md:grid-cols-1">
                      <div>
                        <div className="text-[13px] text-body-soft mb-1 font-medium">
                          Delivery zone
                        </div>
                        <select
                          className="ipt h-[40px]"
                          value={r.zone}
                          onChange={(e) =>
                            patchRcp(r.id, { zone: e.target.value as Zone })
                          }
                        >
                          <option value="dhaka">Inside Dhaka</option>
                          <option value="bangladesh">Nationwide</option>
                        </select>
                      </div>
                      <div>
                        <div className="text-[13px] text-body-soft mb-1 font-medium">
                          Delivery address
                        </div>
                        <input
                          className="ipt h-[40px]"
                          placeholder="House, road, area, city"
                          value={r.addressLine}
                          onChange={(e) =>
                            patchRcp(r.id, { addressLine: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    {/* occasions */}
                    <div className="mt-3.5">
                      <div className="text-[13px] text-body-soft mb-1.5 font-medium uppercase tracking-[0.04em]">
                        Special dates
                      </div>
                      <div className="flex flex-col gap-2">
                        {r.occasions.map((o, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 flex-wrap"
                          >
                            <select
                              className="ipt h-[38px] max-w-[150px]"
                              value={o.type}
                              onChange={(e) =>
                                patchOccasion(r.id, i, {
                                  type: e.target.value as OccasionType,
                                })
                              }
                            >
                              {(
                                Object.keys(OCC_LABEL) as OccasionType[]
                              ).map((ot) => (
                                <option key={ot} value={ot}>
                                  {OCC_LABEL[ot]}
                                </option>
                              ))}
                            </select>
                            {o.type === "custom" && (
                              <input
                                className="ipt h-[38px] max-w-[170px]"
                                placeholder="Label (Mother's Day)"
                                value={o.label ?? ""}
                                onChange={(e) =>
                                  patchOccasion(r.id, i, {
                                    label: e.target.value,
                                  })
                                }
                              />
                            )}
                            {/* one box, one calendar — DEC-CUS-010 */}
                            <SpecialDateField
                              date={o.date}
                              year={o.year}
                              onChange={(next) => patchOccasion(r.id, i, next)}
                            />
                            <button
                              type="button"
                              onClick={() => removeOccasion(r.id, i)}
                              className="text-body-soft hover:text-[#c0392b] text-[13px] px-1"
                              title="Remove date"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => addOccasion(r.id)}
                        className="mt-2 text-[12.5px] text-purple font-medium inline-flex items-center gap-1 hover:underline"
                      >
                        <Icon name="plus" size={14} /> Add a special date
                      </button>
                    </div>
                  </div>
                ))}
                {recipients.length === 0 && (
                  <p className="text-[13px] text-body-soft">No recipients yet.</p>
                )}
              </div>
              <button type="button" onClick={addRecipient} className={addBtn}>
                <Icon name="plus" size={16} /> Add recipient
              </button>
            </Card>
          )}

          {/* SEGMENTS & NOTES */}
          {sec === "segments" && (
            <>
              <Card
                icon="hash"
                title="Segments"
                hint="Marketing tags"
              >
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(SEGMENT_LABEL) as Segment[]).map((s) => {
                    const on = segments.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSeg(s)}
                        className={
                          "text-[13px] px-3.5 py-2 rounded-full border font-medium transition-colors " +
                          (on
                            ? "bg-purple border-purple text-white"
                            : "bg-white border-lavender-deep text-body hover:border-orchid-mid")
                        }
                      >
                        {SEGMENT_LABEL[s]}
                      </button>
                    );
                  })}
                </div>
              </Card>
              <Card
                icon="book"
                title="Internal note"
                hint="Never shown to the customer"
              >
                <textarea
                  className="ipt"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. NRB in USA — sends home to Dhaka. High AOV. Prefers midnight delivery."
                />
              </Card>
            </>
          )}

          {/* ORDERS — read-only, owned by Sales */}
          {sec === "orders" && (
            <Card
              icon="bag"
              title={
                <span className="inline-flex items-center gap-2 flex-wrap">
                  Orders &amp; value
                  <span className="inline-flex items-center gap-1 text-[11px] text-rosegold bg-rosegold-light/80 px-2 py-0.5 rounded-full font-medium">
                    <Icon name="shield" size={11} /> owned by Sales · read-only
                  </span>
                </span>
              }
            >
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  ["Total orders", String(orders)],
                  ["Lifetime value", formatTaka(ltvPaisa)],
                  ["Average order", aov ? formatTaka(aov) : "—"],
                  [
                    "Customer type",
                    t === "repeat" ? "Repeat" : t === "onetime" ? "One-time" : "New",
                  ],
                  ["Last order", api?.lastOrderAt ? ago(ms(api.lastOrderAt)) : "—"],
                  ["First order", shortDate(ms(api?.firstOrderAt))],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="bg-gradient-to-b from-lavender/70 to-lavender rounded-[12px] border border-dashed border-lavender-deep px-4 py-3"
                  >
                    <div className="text-[13px] text-body-soft">{label}</div>
                    <div className="text-[19px] font-medium text-purple mt-0.5 font-display">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ACTIVITY LOG */}
          {sec === "activity" && (
            <Card
              icon="clock"
              title="Activity log"
            >
              <div className="flex flex-col">
                {[
                  {
                    who: "System",
                    what: "Customer created on first WhatsApp login",
                    when: joinedMs,
                  },
                  {
                    who: "Rima (CS)",
                    what: "Added recipient to the book",
                    when: joinedMs ? joinedMs + 5 * 86_400_000 : undefined,
                  },
                  {
                    who: "System",
                    what: "Lifetime value updated from Sales (order delivered)",
                    when: ms(api?.lastOrderAt),
                  },
                ].map((e, i, arr) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-orchid mt-1.5" />
                      {i < arr.length - 1 && (
                        <span className="w-px flex-1 bg-lavender-deep my-1" />
                      )}
                    </div>
                    <div className="pb-4">
                      <div className="text-[13.5px] text-body">{e.what}</div>
                      <div className="text-[13px] text-body-soft">
                        {e.who} · {shortDate(e.when)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[13px] text-body-soft">Demo entries.</p>
            </Card>
          )}
        </div>

        {/* live preview — "My Account" */}
        <aside className="w-[300px] shrink-0 sticky top-[84px] hidden lg:block">
          <div className="text-[13px] text-body-soft font-medium uppercase tracking-[0.06em] mb-2.5 px-1">
            Live preview · My Account
          </div>
          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-lift overflow-hidden">
            <div
              className="px-5 pt-6 pb-7 text-center text-white"
              style={{ background: "linear-gradient(150deg,#470066,#cf43ea)" }}
            >
              {/* the customer's own account view — photo if there is one */}
              <div
                className="w-16 h-16 rounded-full mx-auto mb-2.5 grid place-items-center font-display text-[22px] border-2 border-white/50 overflow-hidden"
                style={{ background: imageUrl ? "#fff" : avatarBg }}
              >
                {imageUrl
                  ? /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                  : initials(name || "?")}
              </div>
              <div className="font-display text-[19px] leading-tight">
                {name || "Customer name"}
              </div>
              <div className="text-[12px] opacity-85 mt-0.5">
                {phone || "+8801XXXXXXXXX"}
              </div>
              {status === "blocked" && (
                <div className="inline-block mt-2 text-[11px] bg-white/20 px-2.5 py-0.5 rounded-full">
                  Blocked
                </div>
              )}
            </div>
            <div className="p-4 text-[13px]">
              {[
                ["First order", id ? shortDate(joinedMs) : "—"],
                ["Country", country || "—"],
                ["Recipients", String(recipients.length)],
                ["Orders", String(orders)],
              ].map(([k, v], i, arr) => (
                <div
                  key={k}
                  className={
                    "flex justify-between py-2.5 " +
                    (i < arr.length - 1 ? "border-b border-lavender-deep" : "")
                  }
                >
                  <span className="text-body-soft">{k}</span>
                  <span className="text-body">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* mini value summary */}
          <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft mt-3 p-3.5 text-[12.5px]">
            <div className="flex justify-between py-1.5 border-b border-lavender-deep">
              <span className="text-body-soft">Lifetime value</span>
              <span className="text-purple font-medium">
                {formatTaka(ltvPaisa)}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-lavender-deep">
              <span className="text-body-soft">Avg order</span>
              <span>{aov ? formatTaka(aov) : "—"}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-body-soft">Ordering from</span>
              <span className="text-right">
                {abroad ? `${country} (NRB)` : "Bangladesh"}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
