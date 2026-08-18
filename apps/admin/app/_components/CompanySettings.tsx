"use client";

/*
  COMPANY SETTINGS — who the company itself is. ADM-D08.
  RADIAN_ADMINISTRATION_MODULE_ARCHITECTURE.md, 30 Jul 2026

  This screen is why Mushak 6.3 has been sitting finished and unusable. The
  challan is a government form; it needs a real BIN, a registered name and an
  address, and there was nowhere in the panel to type them.

  Redesigned 19 Aug 2026 (owner): every field now carries a small tag saying
  WHERE it appears — Website (customers see it), Mushak challan (prints on the
  government form), Reminder only (the system watches the date), or On file
  only (saved, nothing shows it yet). The tags are read off the actual
  consumers in code, not guessed: shop.ts brand()/shopCard() for the website,
  finance-mushak.service.ts for the challan.

  ⚠️ Anything already typed into Finance was copied across by the migration,
  and the challan still falls back to the old columns per field. So this screen
  cannot make a working challan stop working, only start one.

  There is a Save button here, unlike Access control, and the difference is
  deliberate: this is a form somebody fills in and submits, not 166 independent
  ticks. A half-typed BIN should not be saved on every keystroke.
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

/*  Where a field ends up. One pill per destination, same colours everywhere:
    the legend at the top and the tag beside the field are the same object.  */
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
    <span className="text-[9px] font-bold uppercase tracking-[0.07em] px-1.5 py-[2px] rounded-[5px] align-middle"
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
  /** the logo upload is the one field on this screen that is not typed */
  const [logoBusy, setLogoBusy] = useState(false);

  const load = () =>
    Promise.all([getCompany(), getCompanyReadiness()])
      .then(([c, r]) => { setForm(c); setReady(r); setDirty(false); })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));

  useEffect(() => { void load(); }, []);

  /*  Closing the tab mid-form should cost a warning, not the work. Access
      control saves per click so it needs none of this; a form does.  */
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
          <div className="text-[13px] text-white/80">Loading company settings…</div>
        </div>
      </div>
    );
  }

  const licence = ready?.licence;

  return (
    <div className={WRAP}>
      {/* ── hero: name of the room, challan status, save ─────────────── */}
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

      {/* ── the key: what the tags on every field mean ────────────────── */}
      <div className="rounded-[14px] bg-white border border-[#e9e2f2] px-4 py-2.5 mb-4 flex items-center gap-x-4 gap-y-1.5 flex-wrap">
        <span className="text-[11px] font-bold text-body-soft uppercase tracking-[0.08em]">Where each field appears</span>
        <span className="flex items-center gap-1.5 text-[11px] text-body-soft"><Tag kind="web" /> customers see it</span>
        <span className="flex items-center gap-1.5 text-[11px] text-body-soft"><Tag kind="challan" /> prints on the government form</span>
        <span className="flex items-center gap-1.5 text-[11px] text-body-soft"><Tag kind="watch" /> the system watches the date</span>
        <span className="flex items-center gap-1.5 text-[11px] text-body-soft"><Tag kind="file" /> saved, nothing shows it yet</span>
      </div>

      {/*  This page's own status, not a system notice: the missing fields live
          right below, so naming them here is wayfinding, not shouting.  */}
      {ready && !ready.ready && (
        <div className="rounded-[14px] px-4 py-3 mb-4 flex items-start gap-2.5 flex-wrap"
          style={{ background: "#fdf3e2", border: "1px solid #f0dcae" }}>
          <span className="text-[12px] font-bold" style={{ color: "#b07818" }}>
            Mushak 6.3 refuses to print until these are filled:
          </span>
          <span className="flex flex-wrap gap-1.5">
            {ready.missing.map((m) => <Chip key={m} tone="amber">{m}</Chip>)}
          </span>
        </div>
      )}
      {ready?.ready && (
        <div className="rounded-[14px] px-4 py-2.5 mb-4 text-[12px] font-bold"
          style={{ background: "#e7f7f0", border: "1px solid #bfe8d6", color: "#0e9767" }}>
          Everything the Mushak 6.3 challan needs is filled in — Finance can print it.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── name & brand ──────────────────────────────────────────── */}
        <Section grad="linear-gradient(120deg,#8a2bb0,#cf43ea)" icon="gem" title="Name & brand"
          note="what the shop is called">
          <Field
            label="Registered name" tags={["challan"]}
            hint="Exactly as on the VAT certificate — this is what prints on the challan"
            value={form.legalName} onChange={set("legalName")}
          />
          <Field
            label="Trading name" tags={["web"]}
            hint="What customers call you — the website header, footer and shop card show this"
            value={form.tradeName} onChange={set("tradeName")}
          />

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
            {/*  The header sits on white and the footer on dark purple, so one
                file has to work on both — worth saying before he uploads a
                logo drawn for a white page.  */}
            <p className="text-[11px] text-body-soft mt-1.5 leading-relaxed">
              Website header and footer. The header is white and the footer dark purple — a
              transparent background with a mid-tone mark works on both. About 400 × 120, PNG, WebP or SVG.
            </p>
          </div>

          <Field
            label="Website address" tags={["file"]}
            hint="Kept on record — no document or page prints this yet"
            value={form.website} onChange={set("website")}
          />
        </Section>

        {/* ── government numbers ────────────────────────────────────── */}
        <Section grad="linear-gradient(120deg,#b07818,#d9a53a)" icon="shield" title="Government numbers"
          note="checked before they are saved">
          <Field
            label="BIN" tags={["challan"]}
            hint="9 to 13 digits. Mushak 6.3 was waiting on this one field."
            value={form.bin} onChange={set("bin")}
          />
          <Field
            label="VAT circle" tags={["challan"]}
            hint="Circle / division / commissionerate, as one line"
            value={form.vatCircle} onChange={set("vatCircle")}
          />
          <Field label="TIN" tags={["file"]} hint="9 to 15 digits — kept on record, nothing prints it yet"
            value={form.tin} onChange={set("tin")} />
          <Field label="Trade licence number" tags={["watch"]}
            value={form.tradeLicenceNo} onChange={set("tradeLicenceNo")} />
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[11.5px] font-semibold text-body-soft">Trade licence expiry</span>
              <Tag kind="watch" />
            </div>
            <input
              className={input}
              type="date"
              value={form.tradeLicenceExpiry ? String(form.tradeLicenceExpiry).slice(0, 10) : ""}
              onChange={(e) => set("tradeLicenceExpiry")(e.target.value)}
            />
            {/*  The licence countdown lives HERE, beside the date it is about —
                not as a banner on top of the page (the bell already carries it). */}
            {licence && licence.daysLeft <= 60 ? (
              <p className="text-[11.5px] font-bold mt-1"
                style={{ color: licence.daysLeft < 0 ? "#c0392b" : "#b07818" }}>
                {licence.daysLeft < 0
                  ? `Expired ${Math.abs(licence.daysLeft)} days ago — the shop is trading without a licence`
                  : `Runs out in ${licence.daysLeft} days`}
              </p>
            ) : (
              <p className="text-[11px] text-body-soft mt-1">You will be warned 60 days before it runs out.</p>
            )}
          </div>
        </Section>

        {/* ── address ───────────────────────────────────────────────── */}
        <Section grad="linear-gradient(120deg,#3b76c4,#6ba3e8)" icon="pin" title="Address"
          note="the registered one goes on the challan">
          <Field
            label="Registered address" tags={["challan"]}
            hint="As on the VAT certificate. Also shown on the website if the shop address below is blank."
            value={form.registeredAddress} onChange={set("registeredAddress")}
          />
          <Field
            label="Shop address" tags={["web"]}
            hint="The website's Visit-the-shop card shows this — blank means same as registered"
            value={form.operatingAddress} onChange={set("operatingAddress")}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" tags={["web"]} value={form.city} onChange={set("city")} />
            <Field label="Postcode" tags={["web"]} value={form.postcode} onChange={set("postcode")} />
          </div>
          <Field label="Country" tags={["file"]} value={form.country} onChange={set("country")} />
        </Section>

        {/* ── contact & signatory ───────────────────────────────────── */}
        <Section grad="linear-gradient(120deg,#b76e79,#e0a8a0)" icon="phone" title="Contact & signatory"
          note="who answers, and who signs">
          <Field
            label="Public phone" tags={["web"]}
            hint="On the website's shop card, and the WhatsApp button on product pages falls back to it"
            value={form.publicPhone} onChange={set("publicPhone")}
          />
          <Field label="Public email" tags={["file"]}
            hint="Kept on record — no page or document prints it yet"
            value={form.publicEmail} onChange={set("publicEmail")} />
          <Field
            label="Who signs the challan" tags={["challan"]}
            hint="Required before Mushak 6.3 will print"
            value={form.signatoryName} onChange={set("signatoryName")}
          />
          <Field
            label="Their designation" tags={["challan"]} value={form.signatoryDesignation}
            onChange={set("signatoryDesignation")}
          />
          <p className="text-[11px] text-body-soft leading-relaxed border-t border-[#f3eef7] pt-3">
            The WhatsApp number, map link and shop photo on the website&apos;s
            Visit-the-shop card are edited on <b>Website → Visit the shop</b> —
            same record, different room.
          </p>
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

/*  One card per topic: gradient header bar in its own hue, white body.
    Same shape the sessions list and the activity views wear.  */
function Section({ grad, icon, title, note, children }: {
  grad: string; icon: string; title: string; note: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-[16px] bg-white border border-[#e9e2f2] overflow-hidden self-start"
      style={{ boxShadow: "0 2px 10px rgba(70,0,102,0.06)" }}>
      <div className="px-4 py-2.5 flex items-center gap-2.5" style={{ background: grad }}>
        <span className="text-white"><Icon name={icon} size={14} strokeWidth={2.3} /></span>
        <span className="text-[11.5px] font-extrabold tracking-[0.1em] uppercase text-white flex-1">{title}</span>
        <span className="text-[10.5px] text-white/80">{note}</span>
      </div>
      <div className="p-4 space-y-3.5">{children}</div>
    </div>
  );
}

function Field({
  label, hint, tags, value, onChange,
}: {
  label: string; hint?: string; tags?: TagKind[];
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
        /*  ⚠️ Chrome ignores autoComplete="off" — only "new-password" is obeyed.
            On 29 July it filled the saved shop password into three key boxes.
            A BIN box offered somebody's password is the same class of bug.  */
        autoComplete="new-password"
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-[11px] text-body-soft mt-1 leading-relaxed">{hint}</p>}
    </div>
  );
}
