import Link from "next/link";
import { CONTACT } from "../../_data/contact";

/*
  ContactView — /contact (server component, কোনো state নেই)।
  D19: form-backend নেই; সরাসরি WhatsApp / Call / Email deep-link।
  Hero → 3 channel cards → response note → visit/hours card →
  "How can we help" reasons grid → CTA। draft হলে banner।
*/

function Petal({ className = "" }: { className?: string }) {
  return (
    <span
      className={`bg-orchid rounded-[50%_50%_50%_0] -rotate-45 inline-block ${className}`}
    />
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 text-[12px] tracking-[0.22em] uppercase text-orchid font-semibold whitespace-nowrap">
      <Petal className="w-[9px] h-[9px]" />
      {children}
    </div>
  );
}

function ChannelIcon({ name }: { name: string }) {
  const cls = "w-6 h-6 stroke-current fill-none stroke-[1.7]";
  if (name === "whatsapp")
    return (
      <svg className={cls} viewBox="0 0 24 24">
        <path d="M12 3a9 9 0 0 0-7.7 13.6L3.3 21l4.5-1a9 9 0 1 0 4.2-17z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.8 8.2c-.2 0-.5 0-.7.3-.3.3-.9.9-.9 2s.9 2.3 1 2.5c.1.2 1.7 2.8 4.3 3.8 2.1.8 2.6.7 3 .6.6-.1 1.4-.6 1.6-1.2.2-.6.2-1 .1-1.2l-.7-.4c-.3-.1-1.4-.7-1.6-.8-.2 0-.4-.1-.6.2l-.6.8c-.1.1-.3.2-.5.1-.3-.1-1.1-.4-2-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.3 0-.4.1-.5l.4-.5c.1-.2.2-.3.3-.5v-.5c0-.2-.6-1.5-.8-2-.2-.4-.4-.4-.6-.4h-.3z" />
      </svg>
    );
  if (name === "call")
    return (
      <svg className={cls} viewBox="0 0 24 24">
        <path d="M6.8 3.5h2.9l1.4 3.9-2 1.5a12.5 12.5 0 0 0 5.9 5.9l1.5-2 3.9 1.4v2.9a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.8 5.7a2 2 0 0 1 2-2.2z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  // mail
  return (
    <svg className={cls} viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SmallIcon({ name }: { name: string }) {
  const cls = "w-[18px] h-[18px] stroke-current fill-none stroke-[1.8]";
  if (name === "pin")
    return (
      <svg className={cls} viewBox="0 0 24 24">
        <path d="M12 21s-7-5.3-7-11a7 7 0 0 1 14 0c0 5.7-7 11-7 11z" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="10" r="2.6" />
      </svg>
    );
  // clock
  return (
    <svg className={cls} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ContactView() {
  return (
    <div className="max-w-[1000px] mx-auto">
      {/* Draft banner */}
      {CONTACT.draft && (
        <div className="max-w-[860px] mx-auto bg-[#FFF7E8] border border-[#F2D9A8] text-[#8A5A00] rounded-[14px] px-4 py-3 mb-8 text-[13px]">
          <b>Draft.</b> Placeholder phone, WhatsApp and email. Radian to fill the
          real numbers — the links then work automatically.
        </div>
      )}

      {/* ── Hero ── */}
      <header className="text-center max-w-[720px] mx-auto mb-10">
        <div className="mb-4 flex justify-center">
          <Eyebrow>{CONTACT.eyebrow}</Eyebrow>
        </div>
        <h1 className="font-display text-[clamp(30px,4.6vw,46px)] font-medium text-purple leading-[1.12]">
          {CONTACT.heading}
        </h1>
        <p className="text-[17px] leading-[1.7] text-body font-light mt-5">
          {CONTACT.lede}
        </p>
      </header>

      {/* ── Channel cards ── */}
      <section className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {CONTACT.channels.map((c) => (
            <Link
              key={c.key}
              href={c.href}
              target={c.key === "whatsapp" ? "_blank" : undefined}
              className="group bg-white rounded-[22px] border border-lavender-deep shadow-soft px-7 py-8 text-center flex flex-col items-center transition-all duration-300 hover:-translate-y-[3px] hover:shadow-lift"
            >
              <div className="w-14 h-14 rounded-full bg-orchid-soft text-orchid grid place-items-center mb-4 transition-colors duration-300 group-hover:bg-orchid group-hover:text-white">
                <ChannelIcon name={c.key} />
              </div>
              <h3 className="font-display text-[19px] font-medium text-purple">
                {c.label}
              </h3>
              <p className="text-[14.5px] text-body font-medium mt-1 break-words">
                {c.value}
              </p>
              <p className="text-[12.5px] text-body-soft font-light mt-2 leading-[1.5]">
                {c.sub}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* response note */}
      <p className="text-center text-[13px] text-body-soft font-light mb-14 max-w-[560px] mx-auto">
        {CONTACT.responseNote}
      </p>

      {/* ── Visit / hours card ── */}
      <section className="mb-14">
        <div className="bg-white rounded-[24px] shadow-soft border border-lavender-deep overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_1fr]">
          <div className="px-7 sm:px-10 py-9">
            <div className="mb-5">
              <Eyebrow>Visit us</Eyebrow>
              <h2 className="font-display text-[clamp(22px,3vw,30px)] font-medium text-purple mt-3 leading-[1.15]">
                The Radian studio
              </h2>
            </div>
            {[
              { icon: "pin", t: CONTACT.address, s: CONTACT.area },
              { icon: "clock", t: CONTACT.hours, s: CONTACT.hoursSub },
            ].map((line, i, arr) => (
              <div
                key={line.icon}
                className={`flex gap-[15px] items-start py-[13px] ${
                  i < arr.length - 1 ? "border-b border-lavender-deep" : ""
                }`}
              >
                <div className="w-[42px] h-[42px] rounded-full bg-lavender text-purple grid place-items-center shrink-0">
                  <SmallIcon name={line.icon} />
                </div>
                <div className="min-w-0">
                  <b className="block text-[14.5px] text-purple font-semibold break-words">
                    {line.t}
                  </b>
                  <span className="text-[13px] text-body-soft">{line.s}</span>
                </div>
              </div>
            ))}
          </div>

          {/* map placeholder */}
          <div className="relative min-h-[240px] lg:min-h-full bg-lavender">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(160deg,#F3E2FA 0%,#E3C4F3 55%,#D5A8EC 100%)",
              }}
            />
            <div
              className="absolute w-[220px] h-[220px] rounded-full opacity-50"
              style={{
                background: "radial-gradient(circle,#F9E9FD 0%,transparent 70%)",
                top: -40,
                right: -40,
              }}
            />
            <div className="absolute inset-0 grid place-items-center px-6">
              <div className="flex items-center gap-2.5 bg-white/95 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-lift">
                <span className="text-orchid">
                  <SmallIcon name="pin" />
                </span>
                <span className="text-[13px] font-semibold text-purple whitespace-nowrap">
                  Dhanmondi, Dhaka — map coming soon
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How can we help — reasons ── */}
      <section className="mb-14">
        <div className="text-center mb-8">
          <div className="mb-3 flex justify-center">
            <Eyebrow>Before you message</Eyebrow>
          </div>
          <h2 className="font-display text-[clamp(24px,3.2vw,34px)] font-medium text-purple">
            How can we help?
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {CONTACT.reasons.map((r) => (
            <div
              key={r.title}
              className="bg-white rounded-[20px] border border-lavender-deep shadow-soft px-7 py-6"
            >
              <h3 className="font-display text-[18px] font-medium text-purple mb-2">
                {r.title}
              </h3>
              <p className="text-[14px] leading-[1.7] text-body-soft font-light">
                {r.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <div className="text-center mb-4">
        <Link
          href="/faq"
          className="inline-flex items-center gap-2 px-9 py-[15px] border-[1.5px] border-purple text-purple rounded-full font-medium text-[15px] transition-all duration-300 hover:bg-purple hover:text-white hover:-translate-y-[2px] hover:shadow-lift"
        >
          Check our FAQ first
          <svg className="w-4 h-4 stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
            <path d="M4 12h16m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
