"use client";

import { useEffect } from "react";

import { useCheckoutStore } from "../../_store/useCheckoutStore";
import { Continue, QCard, inputClass } from "./CheckoutFields";

/*
  Q4 — CARD MESSAGE (owner, 8 Sep 2026, "same as FlowerAura's note section")

  ★ IT IS ITS OWN STEP. It used to be a textarea inside step 2, below the
  receiver's phone, and almost nobody wrote more than a line there — a form
  asks to be finished, not composed.

  ★ THE SHAPE IS THEIRS, AND NOTHING ELSE IS ADDED (owner's second look):
  Select Occasion · Select Relation · the message with its counter · From ·
  Continue. One column, in that order. A card preview and a signature toggle
  were tried here and taken out again — *"extra kichu kra dorkar nai."*

  ★ THE CHIPS ARE NOT ORDER FIELDS. Occasion and relation only choose which
  ready-made line drops into the box, and they are never sent to the shop; the
  order carries the message and the name under it, nothing more.

  ★ Only for a gift — the shell leaves the step out of a self order entirely.
  Nothing here is required: flowers may go without a message.
*/

const MSG_MAX = 250;

const OCCASIONS = ["Anniversary", "Birthday", "Love", "Thank you", "Congratulations"] as const;
const RELATIONS = ["Wife", "Husband", "Girlfriend", "Boyfriend", "Mother", "Friend"] as const;

/*
  The lines are short and plain on purpose. A suggestion that has to be edited
  down is worse than none: it gets sent as it stands, and the card sounds like
  a shop wrote it — which it did.
*/
const LINES: Record<string, string> = {
  "Anniversary": "Happy anniversary. I would pick you again.",
  "Anniversary|Wife": "Happy anniversary. Every year with you is my favourite one.",
  "Anniversary|Husband": "Happy anniversary. Still the best decision I ever made.",
  "Anniversary|Girlfriend": "Happy anniversary. Here's to us, and to all of it again.",
  "Anniversary|Boyfriend": "Happy anniversary. Here's to us, and to all of it again.",
  "Birthday": "Happy birthday. Here's to a year that is kind to you.",
  "Birthday|Wife": "Happy birthday to the one who makes the house a home.",
  "Birthday|Husband": "Happy birthday. Thank you for every ordinary day with you.",
  "Birthday|Mother": "Happy birthday, Ma. Everything I have started with you.",
  "Birthday|Friend": "Happy birthday. Another year of putting up with me — thank you.",
  "Love": "Thinking of you today, and most days.",
  "Love|Wife": "No reason. Just you.",
  "Love|Girlfriend": "These made me think of you the moment I saw them.",
  "Love|Boyfriend": "These made me think of you the moment I saw them.",
  "Thank you": "Thank you — for more than I can fit on a card.",
  "Thank you|Mother": "Thank you, Ma. For everything you never asked credit for.",
  "Thank you|Friend": "You helped when it counted. Thank you.",
  "Congratulations": "Congratulations. You earned every bit of this.",
  "Congratulations|Friend": "So proud of you today. Go and enjoy it.",
};

function suggest(occasion: string, relation: string): string {
  return LINES[`${occasion}|${relation}`] ?? LINES[occasion] ?? "";
}

/** every line the chips can produce — so we never overwrite what a person wrote */
const ALL_LINES = new Set(Object.values(LINES));

export function Q4Message() {
  const s = useCheckoutStore();

  /*  "From" starts as their own name, the way FlowerAura's does — so the
      common card is signed without anyone typing, and CLEARING the field is a
      deliberate act, which is what now sends the card unsigned.  */
  useEffect(() => {
    if (!s.signedName && s.senderName.trim()) s.set("signedName", s.senderName.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.senderName]);

  /*
    ⚠️ A SUGGESTION NEVER OVERWRITES THEIR OWN WORDS. Picking a chip fills the
    box only while it is empty or still holds a line the chips put there — the
    moment somebody types their own, the chips stop touching it. Losing a
    message a customer wrote to their mother would be unforgivable for a
    convenience.
  */
  function fill(occasion: string, relation: string) {
    const line = suggest(occasion, relation);
    const current = s.giftMessage.trim();
    if (!line) return;
    if (current === "" || ALL_LINES.has(current)) s.set("giftMessage", line);
  }

  return (
    <QCard
      n={4}
      title="Card Message"
      lead="Write your free card message"
      open={s.step === 4}
      done={s.done.includes(4)}
      facts={[
        { label: "Message", value: s.giftMessage.trim() || "No message" },
        { label: "From", value: s.signedName.trim() || s.senderName || "—" },
      ]}
      onOpen={() => s.openStep(4)}
    >
      <div className="max-w-[620px]">
        <span className="block text-[13px] font-semibold text-purple mb-2.5">Select occasion</span>
        <div className="flex flex-wrap gap-2">
          {OCCASIONS.map((o) => {
            const on = o === s.giftOccasion;
            return (
              <button
                key={o}
                type="button"
                onClick={() => {
                  const next = on ? "" : o;
                  s.set("giftOccasion", next);
                  if (next) fill(next, s.giftRelation);
                }}
                className={`rounded-[12px] border-[1.5px] px-4 py-2.5 text-[13px] font-bold transition-colors ${
                  on
                    ? "border-purple bg-purple text-white shadow-soft"
                    : "border-lavender-deep bg-white text-body hover:border-orchid-mid"
                }`}
              >
                {o}
              </button>
            );
          })}
        </div>

        <span className="block text-[13px] font-semibold text-purple mt-6 mb-2.5">
          Select relation
        </span>
        <div className="flex flex-wrap gap-2">
          {RELATIONS.map((r) => {
            const on = r === s.giftRelation;
            return (
              <button
                key={r}
                type="button"
                onClick={() => {
                  const next = on ? "" : r;
                  s.set("giftRelation", next);
                  if (s.giftOccasion) fill(s.giftOccasion, next);
                }}
                className={`rounded-[12px] border-[1.5px] px-4 py-2.5 text-[13px] font-bold transition-colors ${
                  on
                    ? "border-purple bg-purple text-white shadow-soft"
                    : "border-lavender-deep bg-white text-body hover:border-orchid-mid"
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>

        <div className="flex items-baseline justify-between mt-6 mb-2">
          <span className="text-[13px] font-semibold text-purple">Your message</span>
          <span className="text-[11.5px] text-body-soft">
            {s.giftMessage.length} / {MSG_MAX}
          </span>
        </div>
        <textarea
          className={`${inputClass} min-h-[132px] resize-none leading-relaxed`}
          value={s.giftMessage}
          maxLength={MSG_MAX}
          onChange={(e) => s.set("giftMessage", e.target.value)}
          placeholder="Happy anniversary, Meem. Ten years and I'd still pick you."
        />

        <span className="block text-[13px] font-semibold text-purple mt-5 mb-2">From</span>
        <input
          className={inputClass}
          value={s.signedName}
          onChange={(e) => s.set("signedName", e.target.value)}
          placeholder={s.senderName || "Your name"}
          maxLength={40}
        />
      </div>

      <Continue onClick={() => s.completeStep(4)} />
    </QCard>
  );
}
