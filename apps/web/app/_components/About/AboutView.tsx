import Link from "next/link";

import { ABOUT } from "../../_data/about";
import { getDeliveryModes, getShopCard } from "../../_data/shop";

/*
  AboutView — brand story + trust page (server component, কোনো state নেই)।
  Hero → stats strip → story → Why Radian pillars → How it works →
  Verified Business (documents) → Contact card → Studio photo → CTA।
  Physical store details GBE-র VisitStore-এও আছে; এখানে contact card আলাদা
  reference (একই placeholder source)। draft হলে উপরে banner।

  🔒 documents[].number null হলে "Pending" pill; scanUrl null হলে "Scan pending"
  muted state। আসল নম্বর/scan config-এ বসালেই কার্ড নিজে থেকে active হয়।
*/

// ── petal mark (brand motif) ──
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

// ── small line-icons ──
function Icon({ name }: { name: string }) {
  const cls = "w-[18px] h-[18px] stroke-current fill-none stroke-[1.8]";
  if (name === "pin")
    return (
      <svg className={cls} viewBox="0 0 24 24">
        <path d="M12 21s-7-5.3-7-11a7 7 0 0 1 14 0c0 5.7-7 11-7 11z" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="10" r="2.6" />
      </svg>
    );
  if (name === "clock")
    return (
      <svg className={cls} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (name === "phone")
    return (
      <svg className={cls} viewBox="0 0 24 24">
        <path d="M6.8 3.5h2.9l1.4 3.9-2 1.5a12.5 12.5 0 0 0 5.9 5.9l1.5-2 3.9 1.4v2.9a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.8 5.7a2 2 0 0 1 2-2.2z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (name === "mail")
    return (
      <svg className={cls} viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  // shield-check (verified)
  return (
    <svg className={cls} viewBox="0 0 24 24">
      <path d="M12 3l7 2.5v5.5c0 4.5-3 7.8-7 9.5-4-1.7-7-5-7-9.5V5.5L12 3z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/*
  ⚠️ THE FACTS ARE THE SHOP'S OWN (9 Sep 2026).

  This page carried four hand-written statistics, and the first read **"2 hr —
  Express delivery in Dhaka"** while the shop's express is three hours: the
  same invented speed claim the hero was cleaned of in August, still here in
  the About page. The numbers now come from the delivery module and Company
  settings, and anything the shop has not filled in is simply not drawn.

  What stays hand-written is the STORY — how Radian sees itself, why it exists,
  the four pillars, how ordering works. That is voice, not data, and the owner
  can replace the whole page from Admin → Content → Pages ("about"), which wins
  over everything below.
*/
export default async function AboutView() {
  const [shop, modes] = await Promise.all([
    getShopCard().catch(() => null),
    getDeliveryModes(null).catch(() => null),
  ]);

  /*  The fastest promise the delivery module actually makes, in its own
      words — never a number typed here.  */
  const fastest = (modes ?? [])
    .filter((m) => m.promiseMinutes && m.promiseMinutes > 0)
    .sort((a, b) => (a.promiseMinutes ?? 0) - (b.promiseMinutes ?? 0))[0];
  const midnight = (modes ?? []).find((m) => /midnight/i.test(m.typeName || m.label));

  const stats = [
    fastest?.promiseMinutes && {
      value:
        fastest.promiseMinutes % 60 === 0
          ? `${fastest.promiseMinutes / 60} hr`
          : `${fastest.promiseMinutes} min`,
      label: `${fastest.label} inside Dhaka`,
    },
    { value: "64", label: "Districts we deliver to" },
    midnight && { value: "12 AM", label: "Midnight delivery available" },
    { value: "100%", label: "Hand-arranged to order" },
  ].filter(Boolean) as { value: string; label: string }[];

  return (
    <div className="max-w-[1000px] mx-auto">

      {/* ── Hero ── */}
      <header className="text-center max-w-[780px] mx-auto mb-10">
        <div className="mb-4 flex justify-center">
          <Eyebrow>{ABOUT.eyebrow}</Eyebrow>
        </div>
        <h1 className="font-display text-[clamp(30px,4.6vw,48px)] font-medium text-purple leading-[1.12]">
          {ABOUT.heading}
        </h1>
        <p className="text-[17px] leading-[1.7] text-body font-light mt-5">
          {ABOUT.lede}
        </p>
      </header>

      {/* ── Stats strip ── */}
      <section className="mb-14">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-lavender-deep rounded-[22px] overflow-hidden shadow-soft">
          {stats.map((s) => (
            <div
              key={s.label}
              className="bg-white px-5 py-7 text-center flex flex-col items-center justify-center"
            >
              <div className="font-display text-[clamp(28px,3.4vw,38px)] font-medium text-purple leading-none">
                {s.value}
              </div>
              <div className="text-[12.5px] leading-[1.5] text-body-soft font-light mt-2 max-w-[150px]">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Story ── */}
      <div className="bg-white rounded-[24px] shadow-soft px-6 sm:px-10 lg:px-14 py-10 lg:py-12 max-w-[840px] mx-auto mb-16">
        {ABOUT.story.map((para, i) => (
          <p
            key={i}
            className="text-[15.5px] leading-[1.8] text-body font-light mb-4 last:mb-0"
          >
            {para}
          </p>
        ))}
      </div>

      {/* ── Why Radian — pillar grid ── */}
      <section className="mb-16">
        <div className="text-center mb-8">
          <div className="mb-3 flex justify-center">
            <Eyebrow>What sets us apart</Eyebrow>
          </div>
          <h2 className="font-display text-[clamp(24px,3.2vw,34px)] font-medium text-purple">
            Why Radian
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {ABOUT.pillars.map((p) => (
            <div
              key={p.title}
              className="bg-white rounded-[20px] border border-lavender-deep shadow-soft px-7 py-7 transition-all duration-300 hover:-translate-y-[3px] hover:shadow-lift"
            >
              <div className="w-11 h-11 rounded-full bg-lavender grid place-items-center mb-4">
                <Petal className="w-[11px] h-[11px]" />
              </div>
              <h3 className="font-display text-[19px] font-medium text-purple mb-2">
                {p.title}
              </h3>
              <p className="text-[14.5px] leading-[1.7] text-body-soft font-light">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="mb-16">
        <div className="text-center mb-8">
          <div className="mb-3 flex justify-center">
            <Eyebrow>From cart to doorstep</Eyebrow>
          </div>
          <h2 className="font-display text-[clamp(24px,3.2vw,34px)] font-medium text-purple">
            How it works
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {ABOUT.steps.map((s) => (
            <div
              key={s.n}
              className="relative bg-white rounded-[20px] border border-lavender-deep shadow-soft px-6 py-7"
            >
              <span
                className="font-display text-[40px] font-medium leading-none text-orchid-mid select-none"
                aria-hidden
              >
                {s.n}
              </span>
              <h3 className="font-display text-[17px] font-medium text-purple mt-3 mb-2">
                {s.title}
              </h3>
              <p className="text-[13.5px] leading-[1.65] text-body-soft font-light">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Verified Business — documents ── */}
      <section className="mb-16">
        <div className="text-center mb-8">
          <div className="mb-3 flex justify-center">
            <Eyebrow>Registered &amp; verified</Eyebrow>
          </div>
          <h2 className="font-display text-[clamp(24px,3.2vw,34px)] font-medium text-purple">
            A business you can trust
          </h2>
          <p className="text-[14.5px] leading-[1.7] text-body-soft font-light mt-3 max-w-[640px] mx-auto">
            Radian is a fully registered company in Bangladesh. Our licences and
            tax records are listed here so you always know exactly who you&apos;re
            buying from.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            shop?.tradeLicence
              ? {
                  label: "Trade Licence",
                  authority: "Dhaka City Corporation",
                  number: shop.tradeLicence,
                  scanUrl: null as string | null,
                }
              : null,
            shop?.bin
              ? {
                  label: "BIN (Business Identification Number)",
                  authority: "National Board of Revenue",
                  number: shop.bin,
                  scanUrl: null as string | null,
                }
              : null,
          ]
            .filter(
              (x): x is { label: string; authority: string; number: string; scanUrl: string | null } =>
                x !== null,
            )
            .map((d) => {
            const hasScan = Boolean(d.scanUrl);
            return (
              <div
                key={d.label}
                className="bg-white rounded-[18px] border border-lavender-deep shadow-soft px-6 py-5 flex items-start gap-4"
              >
                <div className="w-11 h-11 rounded-full bg-orchid-soft text-orchid grid place-items-center shrink-0 mt-[2px]">
                  <Icon name="shield" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold text-purple leading-snug">
                    {d.label}
                  </h3>
                  <p className="text-[12.5px] text-body-soft font-light mt-[2px]">
                    Issued by {d.authority}
                  </p>

                  {/* number */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-body-soft">
                      No.
                    </span>
                    {d.number ? (
                      <span className="font-mono text-[13.5px] text-purple font-semibold">
                        {d.number}
                      </span>
                    ) : (
                      <span className="text-[12px] font-medium text-[#8A5A00] bg-[#FFF7E8] border border-[#F2D9A8] rounded-full px-2.5 py-[3px]">
                        Pending
                      </span>
                    )}
                  </div>

                  {/* scan link / pending */}
                  <div className="mt-3">
                    {hasScan ? (
                      <Link
                        href={d.scanUrl as string}
                        target="_blank"
                        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-orchid hover:text-purple transition-colors"
                      >
                        View document
                        <svg className="w-3.5 h-3.5 stroke-current fill-none stroke-[1.9]" viewBox="0 0 24 24">
                          <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-body-soft/70 font-light">
                        <span className="w-1.5 h-1.5 rounded-full bg-lavender-deep inline-block" />
                        Scan pending upload
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Contact card ── */}
      <section className="mb-16">
        <div className="bg-white rounded-[24px] shadow-soft border border-lavender-deep overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr]">
            {/* left: details */}
            <div className="px-7 sm:px-10 py-9">
              <div className="mb-5">
                <Eyebrow>Come say hello</Eyebrow>
                <h2 className="font-display text-[clamp(22px,3vw,30px)] font-medium text-purple mt-3 leading-[1.15]">
                  Visit or reach the studio
                </h2>
              </div>

              {[
                shop?.address ? { icon: "pin", t: shop.address, s: shop.cityLine ?? "" } : null,
                shop?.hours?.line
                  ? { icon: "clock", t: shop.hours.line, s: shop.hours.note ?? shop.hours.pill }
                  : null,
                shop?.phone
                  ? { icon: "phone", t: shop.phone, s: "Call or WhatsApp during opening hours" }
                  : null,
                shop?.email
                  ? { icon: "mail", t: shop.email, s: "For orders and support" }
                  : null,
              ]
                .filter((x): x is { icon: string; t: string; s: string } => x !== null)
                .map((line, i, arr) => (
                <div
                  key={line.icon}
                  className={`flex gap-[15px] items-start py-[13px] ${
                    i < arr.length - 1 ? "border-b border-lavender-deep" : ""
                  }`}
                >
                  <div className="w-[42px] h-[42px] rounded-full bg-lavender text-purple grid place-items-center shrink-0">
                    <Icon name={line.icon} />
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

            {/* right: map placeholder */}
            <div className="relative min-h-[260px] lg:min-h-full bg-lavender">
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
                    <Icon name="pin" />
                  </span>
                  <span className="text-[13px] font-semibold text-purple whitespace-nowrap">
                    Dhanmondi, Dhaka — map coming soon
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Studio photo placeholder ── */}
      <section className="mb-16">
        <div className="text-center mb-6">
          <div className="mb-3 flex justify-center">
            <Eyebrow>Inside the studio</Eyebrow>
          </div>
          <h2 className="font-display text-[clamp(22px,3vw,30px)] font-medium text-purple">
            Where every gift is made
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {["Our florists at work", "Fresh stems, daily", "Packed with care"].map(
            (caption, i) => (
              <div
                key={caption}
                className={`relative rounded-[20px] overflow-hidden shadow-soft ${
                  i === 0 ? "col-span-2 sm:col-span-1 h-[220px]" : "h-[220px]"
                }`}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      i % 2 === 0
                        ? "linear-gradient(160deg,#F3E2FA 0%,#E3C4F3 55%,#D5A8EC 100%)"
                        : "linear-gradient(160deg,#FBEFF6 0%,#F1D3E6 55%,#E8C9CE 100%)",
                  }}
                />
                <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-white/92 backdrop-blur-sm rounded-full px-3.5 py-1.5 shadow-lift">
                  <Petal className="w-[9px] h-[9px]" />
                  <span className="text-[12px] font-medium text-purple whitespace-nowrap">
                    {caption}
                  </span>
                </div>
              </div>
            ),
          )}
        </div>
        <p className="text-center text-[12.5px] text-body-soft/80 font-light mt-4">
          Real studio photos drop in after the shoot.
        </p>
      </section>

      {/* ── CTA ── */}
      <div className="text-center mb-4">
        <Link
          href="/fresh-flowers"
          className="inline-flex items-center gap-2 px-9 py-[15px] bg-purple text-white rounded-full font-medium text-[15px] transition-all duration-300 hover:bg-purple-deep hover:-translate-y-[2px] hover:shadow-lift"
        >
          Explore our flowers
          <svg className="w-4 h-4 stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
            <path d="M4 12h16m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
// end of AboutView
