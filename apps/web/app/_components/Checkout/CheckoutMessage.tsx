"use client";

import { useCheckoutStore } from "../../_store/useCheckoutStore";
import { Continue, Field, Info, QCard, Toggle, inputClass } from "./CheckoutFields";

/*
  Q4 — CARD MESSAGE (owner, 8 Sep 2026, after FlowerAura's "Special Note")

  ★ IT IS ITS OWN STEP NOW. It used to be a textarea inside step 2, below the
  receiver's phone — and almost nobody wrote more than a line there, because a
  form asks to be finished, not composed. On its own screen, with the card
  drawn beside it, it reads as the thing it is: the part of the gift they keep.

  ★ ONLY FOR A GIFT. On an order to yourself there is no card, so the shell
  leaves this step out entirely (`CheckoutView`'s `shown`).

  ★ Nothing here is required (`validateStep` has no rule for step 4). Flowers
  may go without a message; refusing to continue over a blank card would be
  the shop insisting on being sentimental.

  ★ The occasion chips are a WRITING AID, not an order field. They swap the
  suggested lines and are never sent to the shop — the order carries the
  message, the signature and nothing else.
*/

const MSG_MAX = 200;

/*  The lines are deliberately short and plain. A suggestion the customer has
    to edit down is worse than no suggestion: it gets sent as it stands, and
    the card sounds like a shop wrote it — which it did.  */
const OCCASIONS: { id: string; label: string; lines: string[] }[] = [
  {
    id: "birthday",
    label: "Birthday",
    lines: [
      "Happy birthday. Here's to a year that is kind to you.",
      "Another year of you — that is worth celebrating.",
      "Happy birthday. Wish I could hand you these myself.",
    ],
  },
  {
    id: "anniversary",
    label: "Anniversary",
    lines: [
      "Happy anniversary. I would pick you again.",
      "Here's to us — and to all of it again.",
      "Every year with you is my favourite one.",
    ],
  },
  {
    id: "love",
    label: "Love",
    lines: [
      "Thinking of you today, and most days.",
      "No reason. Just you.",
      "These made me think of you the moment I saw them.",
    ],
  },
  {
    id: "thanks",
    label: "Thank you",
    lines: [
      "Thank you — for more than I can fit on a card.",
      "You helped when it counted. Thank you.",
      "A small thank you for something that wasn't small.",
    ],
  },
  {
    id: "congrats",
    label: "Congratulations",
    lines: [
      "Congratulations. You earned every bit of this.",
      "So proud of you today.",
      "Well done — go and enjoy it.",
    ],
  },
  {
    id: "sorry",
    label: "Sorry",
    lines: [
      "I'm sorry. I'd rather say it in person.",
      "Sorry — and thank you for being patient with me.",
    ],
  },
];

export function Q4Message() {
  const s = useCheckoutStore();

  const occasion = OCCASIONS.find((o) => o.id === s.giftOccasion) ?? null;
  /*  Whatever they signed with, else their own name from step 1. The card is
      never left with an empty signature line that they did not choose.  */
  const signature = s.anonymousGift ? "" : s.signedName.trim() || s.senderName.trim();

  return (
    <QCard
      n={4}
      title="Card Message"
      lead="Write the card"
      open={s.step === 4}
      done={s.done.includes(4)}
      facts={[
        { label: "Message", value: s.giftMessage.trim() || "No message" },
        { label: "Signed", value: s.anonymousGift ? "Not signed" : signature || "—" },
      ]}
      onOpen={() => s.openStep(4)}
    >
      <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
        {/* ── the writing side ── */}
        <div>
          <span className="block text-[13px] font-semibold text-purple mb-2.5">
            What is the occasion?
            <Info text="It only changes the ready-made lines offered below — it is not sent with the order." />
          </span>
          <div className="flex flex-wrap gap-2">
            {OCCASIONS.map((o) => {
              const on = o.id === s.giftOccasion;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => s.set("giftOccasion", on ? "" : o.id)}
                  className={`rounded-full border-[1.5px] px-4 py-2 text-[13px] font-bold transition-colors ${
                    on
                      ? "border-orchid bg-orchid-soft text-purple"
                      : "border-lavender-deep bg-white text-body hover:border-orchid-mid"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>

          {occasion && (
            <div className="mt-5">
              <span className="block text-[13px] font-semibold text-purple mb-2.5">
                Pick a line, or write your own
              </span>
              <div className="flex flex-col gap-2">
                {occasion.lines.map((line) => (
                  <button
                    key={line}
                    type="button"
                    onClick={() => s.set("giftMessage", line.slice(0, MSG_MAX))}
                    className={`text-left rounded-[14px] border-[1.5px] px-4 py-2.5 text-[13px] transition-colors ${
                      s.giftMessage.trim() === line
                        ? "border-orchid bg-orchid-soft text-purple font-semibold"
                        : "border-lavender-deep bg-white text-body hover:border-orchid-mid"
                    }`}
                  >
                    {line}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5">
            <Field
              label="Your message"
              optional
              hint="Hand-written on a Radian card and tucked into the bouquet."
            >
              <textarea
                className={`${inputClass} min-h-[104px] resize-none leading-relaxed`}
                value={s.giftMessage}
                maxLength={MSG_MAX}
                onChange={(e) => s.set("giftMessage", e.target.value)}
                placeholder="Happy anniversary, Meem. Ten years and I'd still pick you."
              />
            </Field>
            <div className="text-right text-[11.5px] text-body-soft mt-1">
              {s.giftMessage.length}/{MSG_MAX}
            </div>
          </div>

          {!s.anonymousGift && (
            <div className="mt-3">
              <Field label="Signed" optional>
                <input
                  className={inputClass}
                  value={s.signedName}
                  onChange={(e) => s.set("signedName", e.target.value)}
                  placeholder={s.senderName || "Your name"}
                  maxLength={40}
                />
              </Field>
            </div>
          )}
        </div>

        {/* ── the card itself ── */}
        <div>
          <span className="block text-[13px] font-semibold text-purple mb-2.5">On the card</span>

          {/*  ⚠️ WHAT IS DRAWN HERE IS WHAT GETS WRITTEN. It is the same three
               values that go on the order — message, signature, anonymity —
               and nothing else. A preview that flatters the text (a font we do
               not use, a name we would not print) is worse than none.  */}
          <div className="relative rounded-[20px] border-[1.5px] border-rosegold-light bg-[linear-gradient(160deg,#FFFDFD,#FDF4F5)] p-6 min-h-[190px]">
            <span className="pointer-events-none absolute inset-[9px] rounded-[14px] border border-rosegold-light" />
            <span className="font-display text-[11.5px] tracking-[0.18em] uppercase text-rosegold">
              Radian
            </span>
            <p className="font-display text-[16px] text-ink leading-[1.65] mt-3.5 whitespace-pre-wrap break-words">
              {s.giftMessage.trim() || (
                <span className="text-body-soft/70">Your message will appear here.</span>
              )}
            </p>
            {signature && (
              <div className="font-display text-[13.5px] text-body-soft mt-4 text-right">
                — {signature}
              </div>
            )}
          </div>

          <div className="mt-3">
            <Toggle
              icon="eye-off"
              title="Don't sign it"
              sub="The card goes without your name"
              on={s.anonymousGift}
              onChange={(v) => s.set("anonymousGift", v)}
            />
          </div>
        </div>
      </div>

      <Continue onClick={() => s.completeStep(4)} />
    </QCard>
  );
}
