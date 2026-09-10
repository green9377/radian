"use client";

import { useCallback, useEffect, useState } from "react";
import {
  WRAP, FinHeader, Card, Panel, Kpi, Table, Th, Td, Chip, Empty, Flash, Tabs, Banner,
  btnPrimary, btnPrimaryStyle, btnGhost, input, Lbl, TONE, type Tone,
} from "./FinanceUI";
import {
  messagingSettings, messagingStatus, saveMessaging, testMessaging, messagingHistory, ago,
  wordingList, wordingCreate, wordingUpdate, wordingRemove,
  type ApiMessaging, type ApiMessagingStatus, type ApiMessageLog, type ApiWording, type ApiWordingList,
} from "../_data/api";

/*
  EMAIL & SMS — MKT-D19.

  The honest shape of this screen: nothing here works until an account exists
  somewhere else and a key is pasted in. So the screen is built around getting
  to a working Test as fast as possible — pick the provider, paste, press, read
  the answer. No pretending it is configured when it is not.

  Every send is logged with the provider's own reply, which matters most for
  SMS: several Bangladeshi gateways answer HTTP 200 and put the failure in the
  body, so "it returned 200" is not the same as "it was delivered". The log
  shows the raw answer either way.
*/

const EMAIL_PROVIDERS = [
  { key: "BREVO", name: "Brevo (Sendinblue)", note: "300 free a day — the usual choice here" },
  { key: "RESEND", name: "Resend", note: "simplest to set up, 3,000 free a month" },
  { key: "SENDGRID", name: "SendGrid", note: "widely used, stricter sign-up" },
  { key: "MAILGUN", name: "Mailgun", note: "needs its own sending domain" },
  { key: "SMTP", name: "SMTP (any mail server)", note: "Gmail, Zoho, Hostinger mail, cPanel — host, port, login and password" },
];

const SMS_PROVIDERS = [
  { key: "BULKSMSBD", name: "BulkSMSBD", note: "bulksmsbd.net — api key + sender id" },
  { key: "MIMSMS", name: "MIM SMS", note: "mimsms.com" },
  { key: "REVE", name: "REVE SMS", note: "revesms.com" },
  { key: "CUSTOM", name: "Something else", note: "paste the whole URL with {to} {text} in it" },
];

export function MessagingView() {
  const [tab, setTab] = useState<"SETUP" | "TEMPLATES" | "HISTORY">("SETUP");
  const [s, setS] = useState<ApiMessaging | null>(null);
  const [st, setSt] = useState<ApiMessagingStatus | null>(null);
  const [emailKey, setEmailKey] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smsKey, setSmsKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");
  const [testOut, setTestOut] = useState<{ channel: string; ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([messagingSettings(), messagingStatus()]);
      setS(a); setSt(b);
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!s || !st) return <div className={WRAP}><Flash ok="" err={err} /><Empty title="Loading…" /></div>;

  const set = (k: keyof ApiMessaging, v: unknown) => setS({ ...s, [k]: v } as ApiMessaging);

  const save = async () => {
    setBusy(true); setErr(""); setOk("");
    try {
      const body: Record<string, unknown> = { ...s };
      delete body.id; delete body.emailKeySet; delete body.smsKeySet; delete body.emailSmtpPassSet;
      // only send a key if a new one was typed — otherwise it would be wiped
      if (emailKey.trim()) body.emailApiKey = emailKey.trim(); else delete body.emailApiKey;
      if (smtpPass.trim()) body.emailSmtpPass = smtpPass.trim(); else delete body.emailSmtpPass;
      if (smsKey.trim()) body.smsApiKey = smsKey.trim(); else delete body.smsApiKey;
      await saveMessaging(body);
      setEmailKey(""); setSmsKey(""); setSmtpPass(""); setOk("Saved");
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const test = async (channel: "EMAIL" | "SMS") => {
    setBusy(true); setErr(""); setOk(""); setTestOut(null);
    try {
      const r = await testMessaging({ channel });
      setTestOut({
        channel,
        ok: r.ok,
        text: r.ok
          ? `Sent${r.providerRef ? ` — the provider's id is ${r.providerRef}` : ""}. Check the inbox or the handset.`
          : (r.error ?? "The provider refused it, and said nothing useful about why."),
      });
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing"
        title="Email & SMS"
        sub="Pick a provider, paste the key, press Test. Both work the same way and neither needs anything installed — every provider worth using speaks plain HTTP."
        emoji="📨"
        tone="sky"
        right={
          <button className={btnPrimary} style={btnPrimaryStyle} onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        }
      />
      <Flash ok={ok} err={err} />

      {testOut && (
        <Banner tone={testOut.ok ? "emerald" : "rose"} emoji={testOut.ok ? "✓" : "✕"}
          title={`${testOut.channel === "EMAIL" ? "Email" : "SMS"} test — ${testOut.ok ? "it went" : "it did not go"}`}>
          {testOut.text}
        </Banner>
      )}

      <Tabs value={tab} onChange={setTab} items={[
        { key: "SETUP", label: "Set up", emoji: "⚙", tone: "sky" },
        { key: "TEMPLATES", label: "Templates", emoji: "✎", tone: "brand" },
        { key: "HISTORY", label: "What was sent", emoji: "📜", tone: "slate" },
      ]} />

      {tab === "SETUP" && (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* ---------------- email ---------------- */}
          <Panel title="Email" emoji="✉" tone={st.email.ready ? "emerald" : "slate"}
            sub={st.email.ready ? "ready to send" : "not ready yet"}>
            <div className="p-5 space-y-4">
              <label className="flex items-start gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" checked={s.emailEnabled} className="mt-0.5"
                  onChange={(e) => set("emailEnabled", e.target.checked)} />
                <span>
                  <strong>Email is switched on</strong>
                  <div className="text-[11.5px] text-body-soft">Off means nothing sends, whatever is filled in below.</div>
                </span>
              </label>

              <div>
                <Lbl>Which service</Lbl>
                <select className={input} value={s.emailProvider}
                  onChange={(e) => set("emailProvider", e.target.value)}>
                  {EMAIL_PROVIDERS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                </select>
                <p className="text-[11.5px] text-body-soft mt-1 mb-0">
                  {EMAIL_PROVIDERS.find((p) => p.key === s.emailProvider)?.note}
                </p>
              </div>

              {s.emailProvider !== "SMTP" && (
                <div>
                  <Lbl>API key {s.emailKeySet && <Chip tone="emerald">one is saved</Chip>}</Lbl>
                  <input className={input} type="password" value={emailKey}
                    name="radian-email-key" autoComplete="new-password"
                    data-1p-ignore data-lpignore="true"
                    placeholder={s.emailKeySet ? "leave blank to keep the saved one" : "paste the key"}
                    onChange={(e) => setEmailKey(e.target.value)} />
                </div>
              )}

              {s.emailProvider === "SMTP" && (
                <>
                  <div className="grid grid-cols-[1fr_120px] gap-3">
                    <div><Lbl>SMTP host</Lbl>
                      <input className={input} value={s.emailSmtpHost ?? ""} placeholder="smtp.gmail.com"
                        onChange={(e) => set("emailSmtpHost", e.target.value)} /></div>
                    <div><Lbl>Port</Lbl>
                      <input className={input} inputMode="numeric" value={s.emailSmtpPort ?? 587}
                        onChange={(e) => set("emailSmtpPort", Number(e.target.value) || 587)} /></div>
                  </div>
                  <label className="flex items-center gap-2 text-[13px] text-body">
                    <input type="checkbox" checked={!!s.emailSmtpSecure}
                      onChange={(e) => set("emailSmtpSecure", e.target.checked)} />
                    TLS from the first byte (port 465). Off = STARTTLS on 587.
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Lbl>SMTP login</Lbl>
                      <input className={input} value={s.emailSmtpUser ?? ""} placeholder="usually the from address"
                        autoComplete="off" onChange={(e) => set("emailSmtpUser", e.target.value)} /></div>
                    <div>
                      <Lbl>SMTP password {s.emailSmtpPassSet && <Chip tone="emerald">one is saved</Chip>}</Lbl>
                      <input className={input} type="password" value={smtpPass}
                        name="radian-smtp-pass" autoComplete="new-password"
                        data-1p-ignore data-lpignore="true"
                        placeholder={s.emailSmtpPassSet ? "leave blank to keep the saved one" : "app password"}
                        onChange={(e) => setSmtpPass(e.target.value)} />
                    </div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div><Lbl>From name</Lbl>
                  <input className={input} value={s.emailFromName ?? ""} placeholder="Radian"
                    onChange={(e) => set("emailFromName", e.target.value)} /></div>
                <div><Lbl>From address</Lbl>
                  <input className={input} value={s.emailFromAddress ?? ""} placeholder="hello@radianbd.com"
                    onChange={(e) => set("emailFromAddress", e.target.value)} /></div>
              </div>

              {s.emailProvider === "MAILGUN" && (
                <div><Lbl>Mailgun domain</Lbl>
                  <input className={input} value={s.emailDomain ?? ""} placeholder="mg.radianbd.com"
                    onChange={(e) => set("emailDomain", e.target.value)} /></div>
              )}

              <div><Lbl>Send the test to</Lbl>
                <input className={input} value={s.testEmail ?? ""} placeholder="your own address"
                  onChange={(e) => set("testEmail", e.target.value)} /></div>

              <button className={btnGhost} onClick={() => void test("EMAIL")}
                disabled={busy || !st.email.ready}>
                Send a test email
              </button>
              {!st.email.ready && (
                <p className="text-[11.5px] text-body-soft mt-0 mb-0">
                  Switch it on, save a key (or the SMTP login) and a from-address first. Save before testing.
                </p>
              )}

              <p className="text-[12px] text-body-soft border-t border-[#3e3248] pt-3 mb-0">
                <strong>Worth knowing:</strong> the from-address has to be one the service has
                verified. Sending as <code>@radianbd.com</code> means proving you own the domain —
                a DNS record they will show you. Without it the mail goes to spam, or nowhere.
              </p>
            </div>
          </Panel>

          {/* ---------------- sms ---------------- */}
          <Panel title="SMS" emoji="📱" tone={st.sms.ready ? "emerald" : "slate"}
            sub={st.sms.ready ? "ready to send" : "not ready yet"}>
            <div className="p-5 space-y-4">
              <label className="flex items-start gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" checked={s.smsEnabled} className="mt-0.5"
                  onChange={(e) => set("smsEnabled", e.target.checked)} />
                <span>
                  <strong>SMS is switched on</strong>
                  <div className="text-[11.5px] text-body-soft">Every message costs money — this switch is the brake.</div>
                </span>
              </label>

              <div>
                <Lbl>Which gateway</Lbl>
                <select className={input} value={s.smsProvider}
                  onChange={(e) => set("smsProvider", e.target.value)}>
                  {SMS_PROVIDERS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                </select>
                <p className="text-[11.5px] text-body-soft mt-1 mb-0">
                  {SMS_PROVIDERS.find((p) => p.key === s.smsProvider)?.note}
                </p>
              </div>

              <div>
                <Lbl>API key {s.smsKeySet && <Chip tone="emerald">one is saved</Chip>}</Lbl>
                <input className={input} type="password" value={smsKey}
                  name="radian-sms-key" autoComplete="new-password"
                  data-1p-ignore data-lpignore="true"
                  placeholder={s.smsKeySet ? "leave blank to keep the saved one" : "paste the key"}
                  onChange={(e) => setSmsKey(e.target.value)} />
              </div>

              <div><Lbl>Sender ID</Lbl>
                <input className={input} value={s.smsSenderId ?? ""} placeholder="Radian"
                  onChange={(e) => set("smsSenderId", e.target.value)} />
                <p className="text-[11.5px] text-body-soft mt-1 mb-0">
                  The name that shows on the phone. It has to be approved by the gateway first.
                </p></div>

              {s.smsProvider === "CUSTOM" && (
                <div><Lbl>The whole URL</Lbl>
                  <textarea className={`${input} min-h-[70px] font-mono text-[12px]`}
                    value={s.smsCustomUrl ?? ""}
                    onChange={(e) => set("smsCustomUrl", e.target.value)}
                    placeholder="https://gateway.example.com/send?key={api_key}&from={sender}&to={to}&msg={text}" />
                  <p className="text-[11.5px] text-body-soft mt-1 mb-0">
                    <code>{"{api_key}"}</code> <code>{"{sender}"}</code> <code>{"{to}"}</code>{" "}
                    <code>{"{text}"}</code> are filled in at send time.
                  </p></div>
              )}

              <div><Lbl>Send the test to</Lbl>
                <input className={input} value={s.testPhone ?? ""} placeholder="01XXXXXXXXX"
                  onChange={(e) => set("testPhone", e.target.value)} /></div>

              <button className={btnGhost} onClick={() => void test("SMS")}
                disabled={busy || !st.sms.ready}>
                Send a test SMS
              </button>

              <p className="text-[12px] text-body-soft border-t border-[#3e3248] pt-3 mb-0">
                <strong>Worth knowing:</strong> several gateways here answer with HTTP 200 and put
                the failure in the body. So a test that says &ldquo;it went&rdquo; still deserves a
                look at the handset — and the log below keeps the raw answer either way.
              </p>
            </div>
          </Panel>

          <Card className="p-5 lg:col-span-2" tone="amber">
            <div className="text-[13px]">
              <strong className="text-purple">My honest view on these two, unchanged</strong>
              <p className="text-body-soft mt-1 mb-0 text-[12.5px]">
                In Bangladesh, WhatsApp does the work of both. Email is worth having for corporate
                quotes and order confirmations — things people need to keep — rather than for
                promotion, because personal customers rarely open it. SMS costs money per message
                and cannot carry a picture, and for a flower shop the picture <em>is</em> the
                product. Built because you asked, and they will work properly. Use them where they
                fit and let WhatsApp carry the rest.
              </p>
            </div>
          </Card>
        </div>
      )}

      {tab === "TEMPLATES" && <Wording setErr={setErr} />}
      {tab === "HISTORY" && <History setErr={setErr} />}
    </div>
  );
}

/* ---------------- the words of every SMS and email ----------------
   Owner, 8 Sep 2026: a Bangladeshi number gets SMS, a foreign number gets
   email (when the order has one), WhatsApp is the last resort. WhatsApp
   keeps Meta's approved templates; these are the SMS and email words —
   one per message kind and channel, written, edited and removed here.
   The system reads the newest active one at send time; a kind with none is
   skipped and the order's message log says so.  */

const KIND_LABEL: Record<string, string> = {
  ORDER_CONFIRMATION: "Order confirmation",
  ORDER_CONFIRMATION_COD: "Order confirmation (cash on delivery)",
  ORDER_OUT_FOR_DELIVERY: "Out for delivery",
  ORDER_DELIVERED: "Delivered",
  PAYMENT_FAILED: "Payment failed",
  REVIEW_REQUEST: "Review request",
  LOGIN_OTP: "Login code",
};

type Draft = { id?: string; kind: string; channel: "SMS" | "EMAIL"; name: string; subject: string; body: string };

function Wording({ setErr }: { setErr: (s: string) => void }) {
  const [d, setD] = useState<ApiWordingList | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setD(await wordingList()); } catch (e) { setErr((e as Error).message); }
  }, [setErr]);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      if (draft.id) await wordingUpdate(draft.id, { name: draft.name, subject: draft.subject, body: draft.body });
      else await wordingCreate({ kind: draft.kind, channel: draft.channel, name: draft.name, subject: draft.subject, body: draft.body });
      setDraft(null);
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function toggle(row: ApiWording) {
    try { await wordingUpdate(row.id, { isActive: !row.isActive }); await load(); }
    catch (e) { setErr((e as Error).message); }
  }

  async function remove(row: ApiWording) {
    if (!window.confirm(`Remove "${row.name}"? The system will stop sending this ${row.channel} until another is written.`)) return;
    try { await wordingRemove(row.id); await load(); }
    catch (e) { setErr((e as Error).message); }
  }

  const kinds = d?.kinds ?? Object.keys(KIND_LABEL);
  const rows = d?.rows ?? [];
  const gaps = d?.gaps ?? [];

  return (
    <>
      {gaps.length > 0 && (
        <Banner tone="amber" emoji="!" title={`${gaps.length} message${gaps.length === 1 ? "" : "s"} with no active wording`}>
          {gaps.map((g) => `${KIND_LABEL[g.kind] ?? g.kind} · ${g.channel}`).join(" · ")} — these are skipped until written.
        </Banner>
      )}

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="text-[12.5px] text-body-soft">
          Placeholders:{" "}
          {Object.entries(d?.placeholders ?? {}).map(([k, v]) => (
            <span key={k} title={v} className="inline-block mr-2 font-mono text-purple">{`{${k}}`}</span>
          ))}
        </div>
        <button className={btnPrimary} style={btnPrimaryStyle}
          onClick={() => setDraft({ kind: kinds[0], channel: "SMS", name: "", subject: "", body: "" })}>
          + New template
        </button>
      </div>

      {draft && (
        <Card className="p-5 mb-5">
          <div className="grid lg:grid-cols-3 gap-4">
            <div>
              <Lbl>Message</Lbl>
              <select className={input} value={draft.kind} disabled={!!draft.id}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k] ?? k}</option>)}
              </select>
            </div>
            <div>
              <Lbl>Channel</Lbl>
              <select className={input} value={draft.channel} disabled={!!draft.id}
                onChange={(e) => setDraft({ ...draft, channel: e.target.value as "SMS" | "EMAIL" })}>
                <option value="SMS">SMS</option>
                <option value="EMAIL">Email</option>
              </select>
            </div>
            <div>
              <Lbl>Name</Lbl>
              <input className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder={KIND_LABEL[draft.kind]} />
            </div>
          </div>
          {draft.channel === "EMAIL" && (
            <div className="mt-4">
              <Lbl>Subject</Lbl>
              <input className={input} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
            </div>
          )}
          <div className="mt-4">
            <Lbl>{draft.channel === "SMS" ? "Text" : "Body"}</Lbl>
            <textarea className={`${input} min-h-[140px]`} value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            {draft.channel === "SMS" && (
              <div className="text-[11.5px] text-body-soft mt-1">
                {draft.body.length} characters · one SMS is 160 (English)
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button className={btnPrimary} style={btnPrimaryStyle} onClick={save} disabled={busy}>
              {busy ? "Saving…" : draft.id ? "Save changes" : "Create"}
            </button>
            <button className={btnGhost} onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty emoji="✎" title="No templates yet" sub="Write one per message and channel; the system picks the newest active one." />
        ) : (
          <Table head={<><Th>Message</Th><Th>Channel</Th><Th>Name</Th><Th>Words</Th><Th>Active</Th><Th></Th></>}>
            {rows.map((r) => (
              <tr key={r.id} className={r.isActive ? "" : "opacity-60"}>
                <Td><span className="font-semibold text-purple">{KIND_LABEL[r.kind] ?? r.kind}</span></Td>
                <Td><Chip tone={r.channel === "EMAIL" ? "sky" : "brand"}>{r.channel.toLowerCase()}</Chip></Td>
                <Td>{r.name}</Td>
                <Td>
                  {r.subject && <div className="text-[12.5px] font-semibold text-purple">{r.subject}</div>}
                  <div className="text-[11.5px] text-body-soft max-w-[360px] whitespace-pre-wrap">{r.body.slice(0, 160)}{r.body.length > 160 ? "…" : ""}</div>
                </Td>
                <Td>
                  <button className={btnGhost} onClick={() => toggle(r)}>{r.isActive ? "On" : "Off"}</button>
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <button className={btnGhost} onClick={() => setDraft({ id: r.id, kind: r.kind, channel: r.channel, name: r.name, subject: r.subject ?? "", body: r.body })}>Edit</button>
                    <button className={btnGhost} onClick={() => remove(r)}>Remove</button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

/* ---------------- what actually went out ---------------- */

function History({ setErr }: { setErr: (s: string) => void }) {
  const [d, setD] = useState<{ items: ApiMessageLog[]; sent: number; failed: number } | null>(null);
  const [channel, setChannel] = useState("");

  const load = useCallback(async () => {
    try { setD(await messagingHistory({ channel: channel || undefined, days: 30 })); }
    catch (e) { setErr((e as Error).message); }
  }, [channel, setErr]);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi label="Sent (30 days)" value={String(d?.sent ?? 0)} emoji="✓" tone="emerald" />
        <Kpi label="Failed" value={String(d?.failed ?? 0)} emoji="✕"
          tone={(d?.failed ?? 0) > 0 ? "rose" : "slate"} />
      </div>

      <div className="mb-4">
        <select className={`${input} max-w-[200px]`} value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">Both</option>
          <option value="EMAIL">Email only</option>
          <option value="SMS">SMS only</option>
        </select>
      </div>

      <Card className="overflow-hidden">
        {!d || d.items.length === 0 ? (
          <Empty emoji="📜" title="Nothing sent yet"
            sub="Every message handed to a provider lands here with whatever the provider said back." />
        ) : (
          <Table head={<><Th>When</Th><Th>How</Th><Th>To</Th><Th>What</Th><Th>Result</Th></>}>
            {d.items.map((m) => (
              <tr key={m.id}>
                <Td>{ago(m.createdAt)}</Td>
                <Td>
                  <Chip tone={m.channel === "EMAIL" ? "sky" : "brand"}>{m.channel.toLowerCase()}</Chip>
                  {m.isTest && <div className="text-[10.5px] text-body-soft mt-0.5">test</div>}
                </Td>
                <Td><span className="text-[12.5px]">{m.toAddress}</span></Td>
                <Td>
                  {m.subject && <div className="text-[12.5px] font-semibold text-purple">{m.subject}</div>}
                  <div className="text-[11.5px] text-body-soft">
                    {m.body.replace(/<[^>]*>/g, " ").slice(0, 60)}…
                  </div>
                </Td>
                <Td>
                  <Chip tone={m.status === "SENT" ? "emerald" : "rose"}>{m.status.toLowerCase()}</Chip>
                  {m.error && (
                    <div className="text-[11px] mt-0.5 max-w-[280px]" style={{ color: TONE.rose.text }}>
                      {m.error.slice(0, 140)}
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
