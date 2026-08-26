"use client";

import { useState } from "react";

import { formatTaka } from "../../_data/products";

/*
  The five round-2 proposals, drawn with the shop's REAL product photos so the
  owner judges the design the way a customer would meet it. Interactive where
  the idea IS the interaction (the date pills, the live gift card).

  English only — this is a mockup shown to the owner (CLAUDE.md rule 9).
*/

const FALLBACK = "linear-gradient(150deg,#EFE4F7,#DDC9EC)";

function bg(url?: string | null) {
  return url ? `url(${url}) center/cover no-repeat` : FALLBACK;
}

function Num({ n }: { n: number }) {
  return (
    <span className="inline-grid place-items-center w-[30px] h-[30px] rounded-[10px] bg-purple text-white font-bold text-[14px] shrink-0">
      {n}
    </span>
  );
}

function Block({
  n,
  title,
  why,
  tryIt,
  children,
  label,
}: {
  n: number;
  title: string;
  why: string;
  tryIt?: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border-[1.5px] border-lavender-deep rounded-[24px] p-6 sm:p-7 mt-6 shadow-soft">
      <div className="flex items-center gap-3 flex-wrap">
        <Num n={n} />
        <h2 className="m-0 text-[19px] font-bold text-ink">{title}</h2>
        {tryIt && (
          <span className="bg-orchid-soft text-orchid rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-[0.05em]">
            {tryIt}
          </span>
        )}
      </div>
      <p className="text-[13.5px] text-body-soft mt-2 mb-5 max-w-[680px]">{why}</p>
      <div className="border-[1.5px] border-dashed border-lavender-deep rounded-[18px] p-5 bg-[#fdfcff]">
        <div className="text-[10.5px] tracking-[0.14em] uppercase text-body-soft font-semibold mb-3.5">
          {label}
        </div>
        {children}
      </div>
    </section>
  );
}

export default function IdeasView({
  products,
}: {
  products: { slug: string; name: string; imageUrl: string | null; pricePaisa: number }[];
}) {
  const p = (i: number) => products[i % Math.max(products.length, 1)];
  const [day, setDay] = useState(0);
  const [msg, setMsg] = useState("Happy anniversary, Ruma. Twelve years, twelve roses.");

  const hero = p(0);
  const days = [
    { t: "Today", s: "by 6 PM · order in 2h 14m", zap: true },
    { t: "Tomorrow", s: "any time slot" },
    { t: "Pick a date", s: "birthdays & anniversaries" },
  ];

  return (
    <main className="bg-[#F6F4FA] min-h-screen">
      <div className="max-w-[980px] mx-auto px-4 sm:px-6 py-9 pb-24">
        <span className="inline-block bg-purple text-white rounded-full px-3.5 py-1 text-[12px] font-semibold tracking-[0.08em] uppercase mb-3.5">
          Design preview · nothing is built yet
        </span>
        <h1 className="font-display text-[30px] font-medium text-ink m-0">
          The selling page — five stronger moves
        </h1>
        <p className="text-[14.5px] text-body-soft mt-1.5 max-w-[660px]">
          Built on what a gift buyer actually worries about: when will it reach, what will they
          see at the door, and what am I really paying for. Say the numbers you like — only
          those get built.
        </p>

        {/* ── 1. DATE ON THE PAGE ── */}
        <Block
          n={1}
          title={'"When should it arrive?" — answered on the page'}
          tryIt="TAP THE PILLS"
          label="Above the buy buttons"
          why="Gifts are bought for a DATE, not for a product. Today the buyer only meets dates at checkout — the one question they came with waits while they decide. A date strip on the product page, fed by the Delivery module's own cut-offs; the choice rides into checkout already made. The biggest conversion move on this list."
        >
          <div className="flex gap-2.5 flex-wrap">
            {days.map((d, i) => (
              <button
                key={d.t}
                onClick={() => setDay(i)}
                className={`flex-1 min-w-[150px] text-left rounded-[16px] border-[1.5px] px-4 py-3 transition-all ${
                  day === i
                    ? "border-[#0E7A3D] bg-[#E8F9EE] shadow-[0_6px_18px_rgba(14,122,61,0.12)]"
                    : "border-lavender-deep bg-white hover:border-orchid-mid"
                }`}
              >
                <b className={`block text-[14px] ${day === i ? "text-[#0E7A3D]" : "text-ink"}`}>
                  {d.zap && "⚡ "}
                  {d.t}
                </b>
                <small className={day === i ? "text-[#3d7a55]" : "text-body-soft"}>{d.s}</small>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 bg-[#FFF7E8] border-[1.5px] border-[#F2D9A8] rounded-[14px] px-4 py-2.5 mt-3 text-[13px] font-semibold text-[#8A5A00]">
            ⚡ Order within the time and it reaches{" "}
            {day === 0 ? "today" : day === 1 ? "tomorrow" : "your date"}
            <span className="ml-auto font-display text-[16px] tabular-nums">02:14:09</span>
          </div>
        </Block>

        {/* ── 2. ANATOMY ── */}
        <Block
          n={2}
          title={'"Inside this bouquet" — the luxury anatomy'}
          label="Between the gallery and the reviews"
          why="A premium bouquet has to justify its price. Luxury florists itemise the composition — one photo becomes twelve roses, imported greens and satin ribbon, and the price stops being a number and becomes a recipe. Data comes from the craft points the admin already writes; only the presentation is new."
        >
          <div className="flex items-stretch rounded-[20px] overflow-hidden border-[1.5px] border-lavender-deep bg-gradient-to-br from-[#faf6fd] to-[#fdf6f3]">
            <div className="w-[180px] shrink-0 hidden sm:block" style={{ background: bg(hero?.imageUrl) }} />
            <div className="flex-1 px-5 py-4">
              <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#B76E79] mb-1">
                Inside this bouquet
              </div>
              <h3 className="font-display text-[17px] font-medium text-ink m-0 mb-3">
                {hero?.name ?? "Crimson Whisper"}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                {[
                  ["🌹", "12 premium red roses"],
                  ["🌿", "Imported eucalyptus"],
                  ["🎀", "Double satin ribbon"],
                  ["🖤", "Matte black wrap"],
                  ["💧", "Hydration pack for the road"],
                  ["✍️", "Hand-written card included"],
                ].map(([ic, tx]) => (
                  <div key={tx} className="flex items-center gap-2.5 text-[13.5px] text-body">
                    <i className="not-italic w-[26px] h-[26px] rounded-[9px] bg-white border border-lavender-deep grid place-items-center text-[13px] shrink-0">
                      {ic}
                    </i>
                    {tx}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Block>

        {/* ── 3. HOW IT ARRIVES ── */}
        <Block
          n={3}
          title={'"How it arrives" — the moment at the door'}
          label="Under the buy box, replacing dead space"
          why="The buyer never sees the delivery — and that unseen moment IS the product. Three real photographs of the journey remove a first-time buyer's last fear. Nobody in Bangladesh shows this; it costs the shop three photos, taken once. (The photos below are stand-ins from the catalogue until the real three exist.)"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              ["Arranged fresh, same day", "by hand in our Gulshan studio", p(1)],
              ["Boxed with your card", "wrapped, watered, sealed", p(2)],
              ["At their door", "photo confirmation after hand-over", p(3)],
            ].map(([t, s, prod], i) => (
              <div key={t as string} className="bg-white border-[1.5px] border-lavender-deep rounded-[16px] overflow-hidden">
                <div
                  className="aspect-[4/3] relative"
                  style={{ background: bg((prod as { imageUrl?: string | null })?.imageUrl) }}
                >
                  <span className="absolute top-2 left-2 bg-white/95 text-purple font-bold text-[11px] rounded-full px-2.5 py-1">
                    {i + 1}
                  </span>
                </div>
                <div className="px-3.5 py-3">
                  <b className="block text-[12.5px] text-ink">{t as string}</b>
                  <small className="text-[11.5px] text-body-soft leading-snug">{s as string}</small>
                </div>
              </div>
            ))}
          </div>
        </Block>

        {/* ── 4. LIVE GIFT CARD ── */}
        <Block
          n={4}
          title="The message writes itself onto the card"
          tryIt="TYPE IN THE BOX"
          label='The "Make it personal" section'
          why="The message box exists today, but it is a plain form field. Show the words landing on the card as they type and the moment turns emotional — people write longer messages, and someone mid-message does not abandon a cart. Same field underneath; only the face is new."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
            <div>
              <label className="block text-[13px] font-semibold text-purple mb-1.5">
                Your message
              </label>
              <textarea
                value={msg}
                maxLength={180}
                onChange={(e) => setMsg(e.target.value)}
                className="w-full border-[1.5px] border-lavender-deep rounded-[14px] px-4 py-3 text-[14px] bg-white outline-none focus:border-orchid min-h-[96px] resize-none"
              />
              <small className="text-[11.5px] text-body-soft">
                {msg.length}/180 · written on the card by hand
              </small>
            </div>
            <div>
              <div className="relative rounded-[16px] border-[1.5px] border-[#E8C9CE] bg-gradient-to-br from-[#fffdfb] to-[#fbf3f5] px-5 pt-6 pb-4 min-h-[150px] shadow-[0_14px_34px_rgba(183,110,121,0.16)]">
                <span className="absolute top-2 left-0 right-0 text-center text-[#B76E79] text-[15px] opacity-70">
                  ❦
                </span>
                <p className="font-display text-[15px] leading-[1.65] text-[#4a2b35] text-center mt-4 mb-2 min-h-[52px] break-words">
                  {msg || "Your words appear here…"}
                </p>
                <div className="text-center text-[11px] text-[#B76E79] tracking-[0.14em] uppercase">
                  — with love
                </div>
              </div>
              <div className="text-center text-[11px] text-body-soft mt-2 tracking-[0.05em]">
                LIVE PREVIEW · THE CARD THAT TRAVELS WITH THE FLOWERS
              </div>
            </div>
          </div>
        </Block>

        {/* ── 5. SELECTION SUMMARY ── */}
        <Block
          n={5}
          title="The buy bar knows what you picked"
          label="The sticky buy bar, scrolled deep into the page"
          why="Colour, size, two add-ons — by the time the buyer reaches the buttons, every choice is far above, out of sight. A slim summary riding on the sticky bar says what is being bought and what it adds up to, exactly at the moment of commitment. Doubt at the button is where carts die."
        >
          <div className="border-[1.5px] border-lavender-deep rounded-[18px] overflow-hidden shadow-[0_-14px_30px_rgba(71,0,102,0.08)] max-w-[560px]">
            <div className="flex items-center gap-3 bg-lavender px-3.5 py-2.5 border-b-[1.5px] border-lavender-deep">
              <span className="w-[40px] h-[40px] rounded-[10px] shrink-0" style={{ background: bg(hero?.imageUrl) }} />
              <span className="min-w-0 flex-1">
                <b className="block text-[12.5px] text-ink truncate">
                  {(hero?.name ?? "Crimson Whisper") + " — Red · Large"}
                </b>
                <small className="text-[11.5px] text-body-soft">+ chocolates · + greeting card ×2</small>
              </span>
              <span className="font-display text-[16px] text-purple whitespace-nowrap">
                {formatTaka((hero?.pricePaisa ?? 350000) + 69000)}
              </span>
            </div>
            <div className="flex gap-2.5 px-3.5 py-3 bg-white">
              <button className="flex-1 h-[46px] rounded-[13px] border-[1.5px] border-purple text-purple font-semibold text-[14px] bg-white">
                🛒 Add to Cart
              </button>
              <button className="flex-[1.3] h-[46px] rounded-[13px] bg-purple text-white font-semibold text-[14px] relative overflow-hidden animate-cta-glow">
                <span className="animate-shine pointer-events-none absolute -top-2 -bottom-2 w-[24px] bg-white/25 rotate-[8deg]" />
                ⚡ Buy Now · {formatTaka((hero?.pricePaisa ?? 350000) + 69000)}
              </button>
            </div>
          </div>
        </Block>

        <div className="mt-8 bg-purple rounded-[20px] text-white px-6 py-5 text-[14.5px]">
          <b className="text-orchid-mid">How to answer:</b> just say the numbers — e.g.{" "}
          <b className="text-white">&ldquo;1, 3, 4&rdquo;</b>. Those get built into the real product
          page and verified on this demo. Number 3 needs three photographs from the shop; the rest
          run on data the admin already has.
        </div>
      </div>
    </main>
  );
}
