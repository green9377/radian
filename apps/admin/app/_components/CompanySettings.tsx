"use client";

/*
  COMPANY SETTINGS — who the company itself is. ADM-D08.
  RADIAN_ADMINISTRATION_MODULE_ARCHITECTURE.md, 30 Jul 2026

  Every field carries a tiny destination tag — Website / Mushak challan /
  Reminder only / On file only — read off the real consumers in code
  (shop.ts brand()/shopCard(), finance-mushak.service.ts), not guessed.

  19 Aug 2026, owner: "sob text remove kre clean vabe design kro" — all
  helper prose is gone. What a field needs is said by its placeholder
  (visible only while the box is empty), never by a paragraph under it.

  ⚠️ Fields already typed into Finance were copied across by the migration,
  and the challan still falls back to the old columns per field — this screen
  cannot make a working challan stop working, only start one.

  A Save button, unlike Access control's per-click saves, because this is a
  form: a half-typed BIN should not be saved on every keystroke.
*/

import { useEffect, useState } from "react";
import {
  ApiCompany, ApiCompanyReadiness,
  getCompany, getCompanyReadiness, saveCompany, uploadImage,
} from "../_data/api";
import { Chip, Flash, WRAP, input } from "./FinanceUI";
import Icon from "./Icon";

type Form = Partial<ApiCompany>;

const GRAD_HERO = "linear-gradient(120deg,#470066 0%,#8a2bb0 42%,#cf43ea 74%,#b76e79 100%)";

type TagKind = "web" | "challan" | "watch" | "file";
const TAGS: Record<TagKind, { label: string; bg: string; fg: string }> = {
  web: { label: "Website", bg: "#fbe9f6", fg: "#c2359f" },
  challan: { label: "Mushak challan", bg: "#fdf3e2", fg: "#b07818" },
  watch: { label: "Reminder only", bg: "#eef5fd", fg: "#3b76c4" },
  file: { label: "On file only", bg: "#f0edf5", fg: "#8f87a0" },
};

function Tag({ kind }: { kind: TagKind }) {
  const t = TAGS[kind];
  return (
    <span className="text-[9px] font-bold uppercase tracking-[0.07em] px-1.5 py-[2px] rounded-[5px]"
      style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export default function CompanySettings() {
  const [form, setForm] = useState<Form>({});
  const [ready, setReady] = useState<ApiCompanyReadiness | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [logoBusy, setLogoBusy] = useState(false);

  const load = () =>
    Promise.all([getCompany(), getCompanyReadiness()])
      .then(([c, r]) => { setForm(c); setReady(r); setDirty(false); })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));

  useEffect(() => { void load(); }, []);

  /* closing the tab mid-form costs a warning, not the work */
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (k: keyof ApiCompany) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  async function save() {
    setBusy(true); setErr(""); setOk("");
    try {
      const saved = await saveCompany(form);
      setForm(saved);
      setDirty(false);
      setReady(await getCompanyReadiness());
      setOk("Saved");
      setTimeout(() => setOk(""), 4000);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={WRAP}>
        <div className="rounded-[20px] px-5 py-6" style={{ background: GRAD_HERO }}>
          <div className="text-[13px] text-white/80">Loading…</div>
        </div>
      </div>
    );
  }

  const licence = ready?.licence;

  return (
    <div className={WRAP}>
      {/* ── hero: room name, challan status, save ────────────────────── */}
      <div className="rounded-[20px] px-5 py-4 mb-4 relative overflow-hidden" style={{ background: GRAD_HERO }}>
        <div className="flex items-center gap-3 relative flex-wrap">
          <span className="w-[38px] h-[38px] rounded-[12px] grid place-items-center text-white shrink-0"
            style={{ background: "rgba(255,255,255,0.16)" }}>
            <Icon name="store" size={18} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/70">Setup · Administration</div>
            <h1 className="font-display text-[21px] text-white leading-tight m-0">Company</h1>
          </div>

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {ready && (
              <span className="flex items-center gap-1.5 px-3 py-[7px] rounded-full text-[11px] font-bold text-white"
                style={{ background: "rgba(255,255,255,0.18)" }}>
                <span className="w-[7px] h-[7px] rounded-full"
                  style={{ background: ready.ready ? "#4be3a4" : "#ffd166" }} />
                {ready.ready ? "Challan ready" : `Challan: ${ready.missing.length} to fill`}
              </span>
            )}
            <button
              className="px-4 py-2 rounded-[11px] text-[12.5px] font-bold transition-all disabled:opacity-60"
              style={{ background: "#fff", color: "#7a2ea8", boxShadow: dirty ? "0 4px 14px rgba(0,0,0,0.25)" : undefined }}
              disabled={busy || !dirty}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </button>
          </div>
        </div>
      </div>

      <Flash ok={ok} err={err} />

      {ready && !ready.ready && (
        <div className="rounded-[14px] px-4 py-2.5 mb-4 flex items-center gap-2 flex-wrap"
          style={{ background: "#fdf3e2", border: "1px solid #f0dcae" }}>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ color: "#b07818" }}>
            Challan needs
          </span>
          {ready.missing.map((m) => <Chip key={m} tone="amber">{m}</Chip>)}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── name & brand ──────────────────────────────────────────── */}
        <Section grad="linear-gradient(120deg,#8a2bb0,#cf43ea)" icon="gem" title="Name & brand">
          <Field label="Registered name" tags={["challan"]} placeholder="As on the VAT certificate"
            value={form.legalName} onChange={set("legalName")} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Trading name" tags={["web"]} placeholder="e.g. Radian"
              value={form.tradeName} onChange={set("tradeName")} />
            <Field label="Website address" tags={["file"]} placeholder="https://…"
              value={form.website} onChange={set("website")} />
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[11.5px] font-semibold text-body-soft">Logo</span>
              <Tag kind="web" />
            </div>
            <div className="flex items-center gap-3">
              <label className="relative w-[190px] h-[64px] rounded-[12px] border-2 border-dashed border-lavender-deep bg-lavender/40 hover:border-orchid cursor-pointer overflow-hidden grid place-items-center shrink-0">
                {form.logoUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={form.logoUrl} alt="" className={"max-h-[52px] max-w-[170px] object-contain " + (logoBusy ? "opacity-40" : "")} />
                  : <span className="text-body-soft text-[11.5px]">{logoBusy ? "Uploading…" : "Drag & drop or click"}</span>}
                <input
                  type="file" accept="image/png,image/webp,image/svg+xml,image/jpeg" className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setLogoBusy(true);
                    try {
                      const { url } = await uploadImage(file, "brand");
                      set("logoUrl")(url);
                    } catch (er) {
                      alert(er instanceof Error ? er.message : "Upload failed");
                    } finally { setLogoBusy(false); }
                  }}
                />
              </label>
              {form.logoUrl && !logoBusy && (
                <button onClick={() => set("logoUrl")("")} className="text-[13px] text-body-soft hover:text-[#c0392b]">Remove</button>
              )}
            </div>
            <p className="text-[10.5px] text-body-soft mt-1.5">Transparent PNG / WebP / SVG · about 400 × 120</p>
          </div>
        </Section>

        {/* ── government numbers ────────────────────────────────────── */}
        <Section grad="linear-gradient(120deg,#b07818,#d9a53a)" icon="shield" title="Government numbers">
          <div className="grid grid-cols-2 gap-3">
            <Field label="BIN" tags={["challan"]} placeholder="9 to 13 digits"
              value={form.bin} onChange={set("bin")} />
            <Field label="TIN" tags={["file"]} placeholder="9 to 15 digits"
              value={form.tin} onChange={set("tin")} />
          </div>
          <Field label="VAT circle" tags={["challan"]} placeholder="Circle / division / commissionerate"
            value={form.vatCircle} onChange={set("vatCircle")} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Trade licence" tags={["watch"]}
              value={form.tradeLicenceNo} onChange={set("tradeLicenceNo")} />
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[11.5px] font-semibold text-body-soft">Expiry</span>
                <Tag kind="watch" />
              </div>
              <input
                className={input}
                type="date"
                value={form.tradeLicenceExpiry ? String(form.tradeLicenceExpiry).slice(0, 10) : ""}
                onChange={(e) => set("tradeLicenceExpiry")(e.target.value)}
              />
              {licence && licence.daysLeft <= 60 && (
                <p className="text-[11px] font-bold mt-1"
                  style={{ color: licence.daysLeft < 0 ? "#c0392b" : "#b07818" }}>
                  {licence.daysLeft < 0
                    ? `Expired ${Math.abs(licence.daysLeft)} days ago`
                    : `Runs out in ${licence.daysLeft} days`}
                </p>
              )}
            </div>
          </div>
        </Section>

        {/* ── address ───────────────────────────────────────────────── */}
        <Section grad="linear-gradient(120deg,#3b76c4,#6ba3e8)" icon="pin" title="Address">
          <Field label="Registered address" tags={["challan"]} placeholder="As on the VAT certificate"
            value={form.registeredAddress} onChange={set("registeredAddress")} />
          <Field label="Shop address" tags={["web"]} placeholder="Blank = same as registered"
            value={form.operatingAddress} onChange={set("operatingAddress")} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" tags={["web"]} value={form.city} onChange={set("city")} />
            <Field label="Postcode" tags={["web"]} value={form.postcode} onChange={set("postcode")} />
            <Field label="Country" tags={["file"]} value={form.country} onChange={set("country")} />
          </div>
        </Section>

        {/* ── contact & signatory ───────────────────────────────────── */}
        <Section grad="linear-gradient(120deg,#b76e79,#e0a8a0)" icon="phone" title="Contact & signatory">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Public phone" tags={["web"]} placeholder="01…"
              value={form.publicPhone} onChange={set("publicPhone")} />
            <Field label="Public email" tags={["file"]}
              value={form.publicEmail} onChange={set("publicEmail")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Signs the challan" tags={["challan"]}
              value={form.signatoryName} onChange={set("signatoryName")} />
            <Field label="Designation" tags={["challan"]}
              value={form.signatoryDesignation} onChange={set("signatoryDesignation")} />
          </div>
        </Section>
      </div>

      {dirty && (
        <div className="mt-4 rounded-[14px] px-4 py-3 flex items-center justify-between gap-3"
          style={{ background: "#fdf3e2", border: "1px solid #f0dcae" }}>
          <span className="text-[12.5px] font-bold" style={{ color: "#b07818" }}>Unsaved changes.</span>
          <button
            className="px-4 py-2 rounded-[11px] text-[12.5px] font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#8a2bb0,#cf43ea)", boxShadow: "0 4px 12px rgba(138,43,176,0.35)" }}
            disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ grad, icon, title, children }: {
  grad: string; icon: string; title: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-[16px] bg-white border border-[#e9e2f2] overflow-hidden self-start"
      style={{ boxShadow: "0 2px 10px rgba(70,0,102,0.06)" }}>
      <div className="px-4 py-2.5 flex items-center gap-2.5" style={{ background: grad }}>
        <span className="text-white"><Icon name={icon} size={14} strokeWidth={2.3} /></span>
        <span className="text-[11.5px] font-extrabold tracking-[0.1em] uppercase text-white">{title}</span>
      </div>
      <div className="p-4 space-y-3.5">{children}</div>
    </div>
  );
}

function Field({
  label, tags, placeholder, value, onChange,
}: {
  label: string; tags?: TagKind[]; placeholder?: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className="text-[11.5px] font-semibold text-body-soft">{label}</span>
        {tags?.map((t) => <Tag key={t} kind={t} />)}
      </div>
      <input
        className={input}
        value={value ?? ""}
        placeholder={placeholder}
        /*  ⚠️ Chrome ignores autoComplete="off" — only "new-password" is obeyed.
            On 29 July it filled the saved shop password into three key boxes.  */
        autoComplete="new-password"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
