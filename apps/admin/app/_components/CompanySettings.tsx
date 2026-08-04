"use client";

/*
  COMPANY SETTINGS — who the company itself is. ADM-D08.
  RADIAN_ADMINISTRATION_MODULE_ARCHITECTURE.md, 30 Jul 2026

  This screen is why Mushak 6.3 has been sitting finished and unusable. The
  challan is a government form; it needs a real BIN, a registered name and an
  address, and there was nowhere in the panel to type them. The fields existed —
  inside FinanceSetting, because that is where they were first needed — with no
  screen in front of them.

  They belong here. The company's registered name is not Finance's property,
  and a trade licence number certainly is not.

  ⚠️ Anything already typed into Finance was copied across by the migration, and
  the challan still falls back to the old columns per field. So this screen
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
import {
  Banner, Card, Chip, FinHeader, Flash, Panel, TONE, WRAP,
  btnPrimary, btnPrimaryStyle, input, Lbl,
} from "./FinanceUI";

type Form = Partial<ApiCompany>;

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
        <FinHeader eyebrow="Administration" emoji="🏛" title="Company settings" sub="Loading…" />
      </div>
    );
  }

  const licence = ready?.licence;

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Administration"
        emoji="🏛"
        title="Company settings"
        sub="The name, numbers and address that go on every printed document"
        right={
          <button
            className={btnPrimary}
            style={btnPrimaryStyle}
            disabled={busy || !dirty}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        }
      />
      <Flash ok={ok} err={err} />

      {/*  The whole reason this screen was built. It names the missing fields
           rather than saying "incomplete", so there is nothing to guess at.  */}
      {ready && (
        <div className="mb-5">
          {ready.ready ? (
            <Banner tone="emerald" emoji="✓" title="Mushak 6.3 can now be issued">
              Everything the challan needs is filled in. Finance → VAT &amp; Mushak
              will print instead of refusing.
            </Banner>
          ) : (
            <Banner
              tone="amber" emoji="⚠"
              title="Mushak 6.3 cannot be issued yet"
            >
              <div className="mt-1">
                The challan is a government form, so it refuses to print rather
                than carry an invented number. Still needed:
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ready.missing.map((m) => <Chip key={m} tone="amber">{m}</Chip>)}
                </div>
              </div>
            </Banner>
          )}
        </div>
      )}

      {/*  Not blocking — Mushak does not ask for the licence — but a licence that
           quietly expired means the shop is trading without one.  */}
      {licence && licence.daysLeft <= 60 && (
        <div className="mb-5">
          <Banner
            tone={licence.daysLeft < 0 ? "rose" : "amber"}
            emoji="⚠"
            title={
              licence.daysLeft < 0
                ? `The trade licence expired ${Math.abs(licence.daysLeft)} days ago`
                : `The trade licence expires in ${licence.daysLeft} days`
            }
          >
            {new Date(licence.expiry).toLocaleDateString()}
          </Banner>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel emoji="▤" title="Name" sub="As registered, and as customers know you">
          <div className="p-4 space-y-3">
            <Field
              label="Registered name" hint="Exactly as on the VAT certificate — this is what prints on the challan"
              value={form.legalName} onChange={set("legalName")}
            />
            <Field
              label="Trading name" hint="What customers call you. On screen, not on forms."
              value={form.tradeName} onChange={set("tradeName")}
            />
            <Field label="Website" value={form.website} onChange={set("website")} />

            {/*
              Was a text box called "Logo URL", asking the owner to paste an
              address he had no way of producing — so the logo could not be
              changed at all, and he could not find where it lived. It is a real
              upload now, and it is what the website header and footer show.
            */}
            <div>
              <span className="text-[12.5px] font-medium text-body block mb-1.5">
                Logo
                <span className="block text-[11px] text-body-soft font-normal mt-0.5">
                  Shown in the website header and footer, and on printed documents.
                  <b> Transparent background</b> · about 400 × 120 · PNG, WebP or SVG
                </span>
              </span>
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
              {/* The header sits on white and the footer on dark purple, so one
                  file has to work on both — worth saying before he uploads a
                  logo drawn for a white page. */}
              <p className="text-[11px] text-body-soft mt-1.5">
                It appears on a white header <i>and</i> on the dark purple footer — a logo with dark lettering will disappear on one of them. A version with transparent background and a mid-tone mark works on both.
              </p>
            </div>
          </div>
        </Panel>

        <Panel emoji="▤" title="Government numbers" sub="Checked before they are saved">
          <div className="p-4 space-y-3">
            <Field
              label="BIN" hint="9 to 13 digits. Mushak 6.3 was waiting on this one field."
              value={form.bin} onChange={set("bin")}
            />
            <Field label="TIN" hint="9 to 15 digits" value={form.tin} onChange={set("tin")} />
            <Field label="Trade licence number" value={form.tradeLicenceNo} onChange={set("tradeLicenceNo")} />
            <div>
              <Lbl>Trade licence expiry</Lbl>
              <input
                className={input}
                type="date"
                value={form.tradeLicenceExpiry ? String(form.tradeLicenceExpiry).slice(0, 10) : ""}
                onChange={(e) => set("tradeLicenceExpiry")(e.target.value)}
              />
              <p className="text-[11px] text-body-soft mt-1">
                You will be warned 60 days before it runs out.
              </p>
            </div>
            <Field
              label="VAT circle" hint="Circle / division / commissionerate, as one line"
              value={form.vatCircle} onChange={set("vatCircle")}
            />
          </div>
        </Panel>

        <Panel emoji="▤" title="Address" sub="The registered one goes on the challan">
          <div className="p-4 space-y-3">
            <Field
              label="Registered address" hint="As on the VAT certificate"
              value={form.registeredAddress} onChange={set("registeredAddress")}
            />
            <Field
              label="Shop address" hint="Only if it differs — blank means the same as above"
              value={form.operatingAddress} onChange={set("operatingAddress")}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="City" value={form.city} onChange={set("city")} />
              <Field label="Postcode" value={form.postcode} onChange={set("postcode")} />
            </div>
            <Field label="Country" value={form.country} onChange={set("country")} />
          </div>
        </Panel>

        <Panel emoji="▤" title="Contact & signatory" sub="What gets printed, and who signs">
          <div className="p-4 space-y-3">
            <Field
              label="Public phone" hint="Printed on receipts — not a personal number"
              value={form.publicPhone} onChange={set("publicPhone")}
            />
            <Field label="Public email" value={form.publicEmail} onChange={set("publicEmail")} />
            <Field
              label="Who signs the challan" hint="Required before Mushak 6.3 will print"
              value={form.signatoryName} onChange={set("signatoryName")}
            />
            <Field
              label="Their designation" value={form.signatoryDesignation}
              onChange={set("signatoryDesignation")}
            />
          </div>
        </Panel>
      </div>

      {dirty && (
        <div className="mt-5">
          <Card className="p-4 flex items-center justify-between gap-3"
                style={{ borderColor: TONE.amber.ring, background: TONE.amber.soft }}>
            <span className="text-[12.5px]" style={{ color: TONE.amber.text }}>
              Unsaved changes.
            </span>
            <button className={btnPrimary} style={btnPrimaryStyle}
                    disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </Card>
        </div>
      )}
    </div>
  );
}

function Field({
  label, hint, value, onChange,
}: {
  label: string; hint?: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Lbl>{label}</Lbl>
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
