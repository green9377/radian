"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { formatTaka } from "../../_data/products";
import {
  courierWindow,
  dateOptions,
  defaultMethod,
  methodState,
  methodsForZone,
  slotsOf,
  ALL_SPEEDS_OK,
  METHODS,
  type CartSpeeds,
  type LiveMethod,
  slotState,
  toISODate,
  type MethodId,
} from "../../_data/delivery";
import { useZoneStore, type Zone } from "../../_store/useZoneStore";
import {
  useCheckoutStore,
  validateStep,
  type StepErrors,
} from "../../_store/useCheckoutStore";
import Icon from "../Pdp/PdpIcons";
import { promisePhrase } from "../../_data/deliveryClaims";
import { fetchSlotLoad } from "../../_data/checkoutApi";
import { Continue, Field, Info, QCard, Seg, inputClass } from "./CheckoutFields";

/** "12 September" — one shape for every date this screen prints in a sentence */
function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

/*
  Q3 — Where   ·   Q5 — When   (two separate steps, locked 14 July)

  ★ When is step 5 since 8 Sep 2026 — the card message took step 4.

  ★ NO district / thana / area dropdowns (D27)
  One big box, in both zones. Every dropdown is another decision and more
  time, and orders fall away at every extra decision.

  ★ A zone conflict is said HERE, not by throwing them back to the cart.
  Choosing All Bangladesh with a Dhaka-only product in the cart used to empty
  checkout and dump the customer on /cart — infuriating. Now this page says
  which products will not go to that address, and offers one click back to
  Dhaka.
*/

export function Q3Where({
  heldCount,
  deliverableCount,
  allHeld,
}: {
  heldCount: number;
  /** what will actually go to this zone — the address is for these */
  deliverableCount: number;
  /** every item is Dhaka-only; nothing at all goes to this zone */
  allHeld: boolean;
}) {
  const s = useCheckoutStore();
  const { zone, setZone } = useZoneStore();
  const [errors, setErrors] = useState<StepErrors>({});

  function onZone(next: Zone) {
    setZone(next);
    // methods are tied to a zone — no courier inside Dhaka, no express
    // nationwide
    s.patch({ method: defaultMethod(next), slotId: null, date: null });
  }

  function onContinue() {
    const e = validateStep(3, s);
    setErrors(e);
    if (Object.keys(e).length === 0) s.completeStep(3);
  }

  return (
    <QCard
      n={3}
      title="Where?"
      lead="Where should it go?"
      open={s.step === 3}
      done={s.done.includes(3)}
      facts={[
        { label: "Delivering to", value: zone === "bangladesh" ? "All Bangladesh" : "Inside Dhaka" },
        { label: "Address", value: s.address },
      ]}
      onOpen={() => s.openStep(3)}
    >
      <div className="mb-5">
        <span className="block text-[13px] font-semibold text-purple mb-1.5">
          Delivering to
        </span>
        <Seg
          options={[
            { id: "dhaka", label: "Inside Dhaka" },
            { id: "bangladesh", label: "All Bangladesh" },
          ]}
          value={zone === "bangladesh" ? "bangladesh" : "dhaka"}
          onChange={(id) => onZone(id as Zone)}
        />
      </div>

      {/* ─── every item is held in this zone ──────────────────────────
          Not a full screen of its own — inside Q3, on the checkout page
          (the owner, 15 July). The address fields are not drawn, because
          nothing is being shipped. */}
      {allHeld ? (
        <div className="rounded-[16px] bg-[#FFF7E8] border border-[#F2D9A8] px-5 py-5 text-center">
          <span className="w-12 h-12 rounded-full bg-white text-[#8A5A00] grid place-items-center mx-auto">
            <Icon name="truck" className="w-6 h-6" />
          </span>
          <b className="block font-display text-[18px] text-purple mt-3">
            These can&apos;t travel outside Dhaka
          </b>
          <p className="text-[13px] text-[#8A5A00] mt-2 max-w-[420px] mx-auto leading-snug">
            Fresh flowers and cakes don&apos;t survive the 1–3 day courier, so everything in
            your cart is Dhaka-only. Nothing has been removed — switch back to Dhaka, or add
            something we ship nationwide.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <button
              type="button"
              onClick={() => onZone("dhaka")}
              className="rounded-[12px] bg-purple text-white px-5 py-2.5 text-[13px] font-semibold hover:bg-purple-deep transition-colors"
            >
              Deliver inside Dhaka
            </button>
            <Link
              href="/cart"
              className="rounded-[12px] border-[1.5px] border-[#F2D9A8] px-5 py-2.5 text-[13px] font-semibold text-[#8A5A00]"
            >
              Back to cart
            </Link>
          </div>
        </div>
      ) : (
        <>
      {/* ─── zone conflict (some go, some do not) — no redirect (D21) ──
          Reading "2 cannot go" and then seeing an address field below it
          reads as a contradiction. So it says plainly how many items WILL
          go to this address. ─────────────────────────────────────────── */}
      {heldCount > 0 && (
        <div className="mb-5 rounded-[16px] bg-[#FFF7E8] border border-[#F2D9A8] px-4 py-3.5">
          <p className="flex gap-2.5 text-[12.5px] text-[#8A5A00] leading-snug">
            <Icon name="truck" className="w-[18px] h-[18px] shrink-0 mt-[1px]" />
            <span>
              <b>
                {deliverableCount} {deliverableCount === 1 ? "item goes" : "items go"}{" "}
                nationwide · {heldCount} {heldCount === 1 ? "stays" : "stay"} in your cart
              </b>{" "}
              — fresh flowers and cakes can&apos;t survive the 1–3 day courier, so we&apos;ll
              hold {heldCount === 1 ? "it" : "them"} for a Dhaka delivery. Give the address
              for the {deliverableCount === 1 ? "item" : "items"} we&apos;re shipping below.
            </span>
          </p>

          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={() => onZone("dhaka")}
              className="rounded-[12px] bg-[#8A5A00] text-white px-4 py-2 text-[12.5px] font-semibold"
            >
              Deliver everything inside Dhaka instead
            </button>
            <Link
              href="/cart"
              className="rounded-[12px] border border-[#F2D9A8] px-4 py-2 text-[12.5px] font-semibold text-[#8A5A00]"
            >
              Edit cart
            </Link>
          </div>
        </div>
      )}

      <Field
        label={
          heldCount > 0
            ? `Shipping address · for the ${deliverableCount} item${
                deliverableCount === 1 ? "" : "s"
              } going nationwide`
            : "Full address"
        }
        required
        hint="House, road, flat, area — and a landmark if it helps our rider."
        error={errors.address}
      >
        <textarea
          className={`${inputClass} min-h-[90px] resize-none`}
          value={s.address}
          onChange={(e) => s.set("address", e.target.value)}
          placeholder={
            zone === "bangladesh"
              ? "House 12, Sonadanga R/A, Khulna — beside Sonadanga Bus Terminal"
              : "House 8, Road 27, Flat B4, Dhanmondi — opposite Star Kabab"
          }
        />
      </Field>

      <div className="mt-4">
        <Field
          label="Note for the rider"
          optional
          hint="Anything that helps at the door — a gate code, a floor, a time to call."
        >
          <input
            className={inputClass}
            value={s.deliveryNotes}
            onChange={(e) => s.set("deliveryNotes", e.target.value)}
            placeholder="Call before arriving"
          />
        </Field>
      </div>

      <Continue onClick={onContinue} />
        </>
      )}
    </QCard>
  );
}

/* ═══════════════════════════════════════════════════════════════ */

export function Q5When({
  subtotalPaisa,
  leadDays = 0,
  preorder = null,
  speeds,
  liveMethods,
}: {
  subtotalPaisa: number;
  /*  DEC-PDP-10 — the largest "days to make" in the cart. Handed down from
      CheckoutView, which owns the resolved cart; this component must not go
      looking for it itself, or two screens end up disagreeing about the same
      date.  */
  leadDays?: number;
  /** the pre-ordered line, when the basket holds one — for the note below */
  preorder?: { name: string; backOn: string | null } | null;
  /*  Which fast options EVERY item in the cart allows. Computed once in
      CheckoutView, which owns the resolved cart — this component must not go
      looking for it itself, or two screens end up disagreeing.  */
  speeds?: CartSpeeds;
  /**
   * DEC-DLV-009 / DEC-DLV-010 — the delivery module's real menu.
   *
   * ⚠️ `null` = the answer has not arrived yet. The old list holds the space
   * until it does, or the screen would flash empty for a moment. An empty
   * array (`[]`) says something different: the shop has set up no delivery at
   * all for this zone.
   */
  liveMethods?: LiveMethod[] | null;
}) {
  const spd = speeds ?? ALL_SPEEDS_OK;
  const s = useCheckoutStore();
  const { zone } = useZoneStore();
  const [errors, setErrors] = useState<StepErrors>({});

  const now = useMemo(() => new Date(), []);
  const today = toISODate(now);

  /*  Whatever the delivery module says — the old list only until it answers. */
  const methods = liveMethods && liveMethods.length > 0 ? liveMethods : methodsForZone(zone);
  /*  ⚠️ Exactly the same three steps as `CheckoutView`'s `method` memo.  */
  const method = methods.find((m) => m.id === s.method) ?? methods[0] ?? METHODS[1];

  /*
    ═══ COUNTING "booked" FOR REAL — 4 Aug 2026, the owner's standing rule ═══
    *"Once a slot is full, show the customer the next slot; it must not take
    an order into that slot."*

    `toLiveMethods` wrote `booked: 0` onto every slot — a mock, admitted in its
    own comment. So a full slot still read "Available" and still took the
    order. The count now comes from `/shop/delivery/slot-load` for the day
    being delivered — the identical arithmetic to the admin's own, so the two
    screens cannot disagree.
    (The server counts again at the door — the UI is a courtesy, the rule is
    the server's.)
  */
  const [slotLoad, setSlotLoad] = useState<Record<string, number>>({});
  const loadDate = method.todayOnly ? today : (s.date ?? today);
  useEffect(() => {
    let stale = false;
    fetchSlotLoad(loadDate).then((by) => {
      if (!stale) setSlotLoad(by ?? {});
    });
    return () => { stale = true; };
  }, [loadDate]);

  /*  This delivery's own slots, with the real booked count on them. The
      module's slots when they arrived, otherwise the old three.  */
  const slotsForMethod = slotsOf(method).map((sl) => ({
    ...sl,
    booked: slotLoad[sl.id] ?? sl.booked,
  }));

  /*  If the chosen slot fills up (or its time passes), move to the next open
      one by itself — "show them the next slot". With nothing open the choice
      is cleared and the "all slots gone" message below takes over.  */
  useEffect(() => {
    if (!method.slots || !s.slotId) return;
    const cur = slotsForMethod.find((x) => x.id === s.slotId);
    if (cur && slotState(cur, isTodayRef.current, new Date()).ok) return;
    const next = slotsForMethod.find((x) => slotState(x, isTodayRef.current, new Date()).ok);
    s.set("slotId", next?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotLoad, s.slotId, method.id]);

  /*  TODAY, TOMORROW, AND A CALENDAR (owner, 8 Sep 2026, second look —
      FlowerAura's shape exactly: *"today ar tomorrow thakbe and arekta thakbe
      pick a date"*).

      It was eight tiles, then seven; both were an arbitrary week of chips to
      read past. Almost every order is today or tomorrow, and anything else is
      a date somebody already has in mind — which is a calendar's job, not a
      strip's. The third tile opens the browser's own picker (`customDate`).  */
  const dates = useMemo(
    () => dateOptions(method, now, 2, leadDays),
    [method, now, leadDays],
  );

  /*  A date chosen from the calendar rather than the strip — it gets its own
      tile so the choice is visible, instead of the strip quietly showing none
      of them selected.  */
  const customDate = s.date && !dates.some((d) => d.id === s.date) ? s.date : null;
  const dateRef = useRef<HTMLInputElement>(null);
  const minDate = useMemo(() => {
    const d = new Date(now);
    d.setDate(now.getDate() + Math.max(0, leadDays));
    return toISODate(d);
  }, [now, leadDays]);
  const isToday = method.todayOnly || s.date === today;
  const isTodayRef = useRef(isToday);
  isTodayRef.current = isToday;

  /*
    ── A DISABLED METHOD MUST NOT STAY SELECTED ──────────────────────────────
    Found 1 Aug 2026 the first time lead time actually greyed something out:
    Same Day is the default inside Dhaka, so a 3-day product landed on a
    checkout where Same Day was greyed with "Needs 3 days to make" AND the
    order summary still read "Delivery · Same Day · ৳60". The customer is being
    quoted a method the page has just refused.

    `validateStep(5)` would have caught it at "Continue to payment", but only
    after they had read a wrong total on the way there — and the fee is part of
    that total. A price must never be shown for something that cannot be sold.

    ⚠️ ONLY MOVES OFF AN IMPOSSIBLE CHOICE, never between two possible ones.
    The customer's own pick is left alone as long as it works; this fires for a
    default they never made, or for a pick that stopped working while they were
    filling the form (a slot filling up, the express window closing, an item
    added to the cart). Silently changing a working choice would be worse than
    the bug.
  */
  useEffect(() => {
    if (methodState(method, now, leadDays, spd).ok) return;
    /*  ⚠️ CHEAPEST FIRST, NOT FIRST IN THE LIST. The first working method in
        METHODS order is Midnight Surprise at ৳260, and the first version of
        this effect duly moved a 3-day bouquet onto it — the page refused Same
        Day and then quietly quoted the dearest option in the shop. Even done
        innocently that reads as upselling, and it is the customer's money
        being moved without them touching anything.

        Cheapest is the only defensible rule: a choice made FOR somebody must
        never cost them more than one they would have made.  */
    const next = [...methods]
      .filter((m) => methodState(m, now, leadDays, spd).ok)
      .sort((a, b) => a.feePaisa + a.surchargePaisa - (b.feePaisa + b.surchargePaisa))[0];
    if (!next || next.id === method.id) return;
    s.patch({
      method: next.id,
      date: next.todayOnly ? today : next.datePick ? s.date : null,
      slotId: next.slots ? s.slotId : null,
    });
    // `s` is a zustand store object — stable across renders, not a dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, methods, now, leadDays, spd, today]);

  /*  ⚠️ Taken from the list on screen, not from `getMethod(id)`. A live id
      never matched the hand-written list, so whatever was picked reset the
      date and slot by Same Day's rules — choosing Midnight wiped the date,
      choosing Schedule It wiped the slot.  */
  function onMethod(id: MethodId) {
    const m = methods.find((x) => x.id === id);
    if (!m) return;
    s.patch({
      method: id,
      // Same Day = today; there is nothing to choose
      date: m.todayOnly ? today : m.datePick ? s.date : null,
      /*  Is the slot in the new method's own list — because keeping one that
          is not means going forward with a slot this delivery does not have. */
      slotId: m.slots && slotsOf(m).some((sl) => sl.id === s.slotId) ? s.slotId : null,
    });
  }

  function onContinue() {
    const state = { ...useCheckoutStore.getState(), method: method.id };
    const e = validateStep(5, state, { now, leadDays, speeds: spd, method });
    setErrors(e);
    if (Object.keys(e).length === 0) {
      s.patch({ method: method.id });
      s.completeStep(5);
    }
  }

  const slotLabel = slotsForMethod.find((x) => x.id === s.slotId)?.label;
  const dateLabel = dates.find((d) => d.id === s.date)?.label;

  const facts = s.done.includes(5)
    ? [
        { label: "Delivery", value: method.label },
        ...(dateLabel || customDate
          ? [{ label: "Date", value: dateLabel ?? longDate(customDate!) }]
          : []),
        ...(slotLabel ? [{ label: "Time", value: slotLabel }] : []),
      ]
    : undefined;

  return (
    <QCard
      n={5}
      title="When?"
      lead="When should it arrive?"
      open={s.step === 5}
      done={s.done.includes(5)}
      facts={facts}
      onOpen={() => s.openStep(5)}
    >
      {/* ─── method ─── */}
      <div className="grid sm:grid-cols-2 gap-3">
        {methods.map((m) => {
          /*  DEC-DLV-010 — outside the day's window the server has already
              said so ("Opens later today" / "Closed for today"). That comes
              before the clock rule, because that is the sentence the customer
              can act on.  */
          const live = m as Partial<LiveMethod>;
          const state = live.closedNow
            ? ({ ok: false, reason: live.closedReason ?? "Not available now" } as const)
            : methodState(m, now, leadDays, spd);
          const on = m.id === method.id && state.ok;
          const fee = m.feePaisa + m.surchargePaisa;

          return (
            <button
              key={m.id}
              type="button"
              disabled={!state.ok}
              onClick={() => onMethod(m.id)}
              className={`text-left rounded-[16px] border-[1.5px] p-4 transition-colors ${
                on
                  ? "border-orchid-mid bg-orchid-soft/50"
                  : state.ok
                    ? "border-lavender-deep bg-white hover:border-orchid-mid"
                    : "border-lavender-deep bg-lavender cursor-not-allowed"
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon
                  name={m.icon}
                  className={`w-[18px] h-[18px] shrink-0 ${
                    state.ok ? "text-orchid" : "text-body-soft"
                  }`}
                />
                <span
                  className={`text-[14px] font-semibold ${
                    state.ok ? "text-purple" : "text-body-soft"
                  }`}
                >
                  {m.label}
                </span>
                <span
                  className={`ml-auto text-[13px] shrink-0 ${
                    state.ok ? "text-purple font-semibold" : "text-body-soft"
                  }`}
                >
                  {formatTaka(fee)}
                </span>
              </span>

              <span
                className={`block text-[12px] mt-1 leading-snug ${
                  state.ok ? "text-body-soft" : "text-[#8A5A00]"
                }`}
              >
                {state.ok ? m.sub : state.reason}
              </span>
            </button>
          );
        })}
      </div>

      {errors.method && (
        <p className="text-[12px] text-[#C4172B] mt-2">{errors.method}</p>
      )}

      {/*
        DEC-PDP-10 — said ONCE, above everything, instead of on each grey chip.

        ⚠️ WITHOUT THIS LINE THE PAGE IS A LOCKED DOOR WITH NO SIGN. Two methods
        greyed out and the first three dates dead, and the only explanation is
        a `reason` buried in a disabled card the customer will not read. People
        do not conclude "it takes time to make" — they conclude the site is
        broken, and they leave.

        It is framed as craft rather than delay. That is not spin: a shop that
        says "we start making it the day you order" is describing why it costs
        what it costs.
      */}
      {/*
        DEC-PDP-13 — one line naming the item that narrowed the choice.

        ⚠️ WITHOUT THE NAME THIS IS A PUZZLE. Two greyed cards and no
        explanation and the customer starts deleting things at random to find
        out which one did it — or gives up. "Chocolate Fudge Cake can't go at
        midnight" lets them decide in one read: drop the cake, or drop the
        midnight. The reason is already on each greyed card; this repeats it
        once at the top because a disabled card is exactly what nobody reads.

        Only shown when something is actually blocked, and only for the fast
        options — Schedule It is never gated.
      */}
      {(() => {
        /*  ⚠️ NOT WHEN THE PRE-ORDER NOTE IS ALREADY SAYING IT (23 Aug 2026).
            Both boxes named the same product for the same reason — one in
            lavender, one in amber, stacked. Two notices about one fact read as
            two problems.  */
        if (preorder) return null;
        const blocked = (["express", "sameday", "midnight"] as const)
          .map((k) => spd[k])
          .filter((b) => !b.ok && b.blockedBy);
        if (blocked.length === 0) return null;
        const names = [...new Set(blocked.map((b) => b.blockedBy))];
        return (
          <div className="mt-4 rounded-[16px] border border-lavender-deep bg-lavender px-4 py-3 flex gap-2.5 items-center">
            <Icon name="truck" className="w-[18px] h-[18px] text-purple shrink-0" />
            {/*  ⚠️ ONE STRING, NOT `{expr} text` — walked on DEV, 8 Sep 2026:
                 it rendered "…15% OFFcan't take", the space between the
                 product's name and the sentence swallowed by JSX. Interpolate
                 the whole line and there is nothing to swallow.  */}
            <p className="text-[13px] font-semibold text-purple leading-snug">
              {`${names.join(", ")} can’t take the faster options`}
              <Info
                text={`Remove ${names.length === 1 ? "it" : "them"} from the cart and the faster deliveries open up again.`}
              />
            </p>
          </div>
        );
      })()}

      {/*  ⚠️ TWO REASONS, TWO SENTENCES (23 Aug 2026). A pre-order used to
           close the early dates while this note still said "made to order",
           which explains nothing to somebody who ordered a plain product that
           the shop simply does not have yet.  */}
      {leadDays > 0 && (
        <div className="mt-4 rounded-[16px] border border-[#F2D9A8] bg-[#FFF7E8] px-4 py-3 flex gap-2.5 items-center">
          <Icon name="clock" className="w-[18px] h-[18px] text-[#8A5A00] shrink-0" />
          <p className="text-[13px] font-semibold text-[#8A5A00] leading-snug">
            {preorder ? (
              <>
                {`${preorder.name} is a pre-order${
                  preorder.backOn ? ` — sent from ${longDate(preorder.backOn)}` : ""
                }`}
                <Info text="The earlier dates are closed because this one is not in the studio yet." />
              </>
            ) : (
              <>
                {`Made to order — ${leadDays} day${leadDays === 1 ? "" : "s"} before it can go out`}
                <Info text="We start making it the day you order, so the earliest dates are closed." />
              </>
            )}
          </p>
        </div>
      )}

      {/*
        ─── express — a clock, not a time ───

        ⚠️ TWO BUGS ON ONE LINE, fixed 3 Aug 2026.

        It said "at their door within **2 hours**" — the shop's express is three
        hours, and this sentence sits on the step where the customer commits to
        it. Worse, `method.id === "express"` never matched a live method at all:
        those ids are cuids from the database, and `"express"` is a word from
        the old hard-coded list. So the box was invisible for real deliveries
        and would have lied if it had shown.

        Both come from `timing` and `promiseMinutes` now, which is where the
        promise is actually configured.
      */}
      {method.timing === "FROM_CONFIRM" && promisePhrase(method.promiseMinutes ?? null) && (
        <div className="mt-5 rounded-[16px] border border-[#F2D9A8] bg-[#FFF7E8] px-4 py-3 flex gap-2.5 items-center">
          <Icon name="bolt" className="w-[18px] h-[18px] text-[#8A5A00] shrink-0" />
          <p className="text-[13px] font-semibold text-[#8A5A00] leading-snug">
            {`At their door ${promisePhrase(method.promiseMinutes ?? null)}`}
            <Info text="We start arranging the moment you pay, so there is no date or slot to pick." />
          </p>
        </div>
      )}

      {/* ─── courier ─── */}
      {method.id === "courier" && (
        <div className="mt-5 rounded-[16px] border border-lavender-deep bg-lavender px-4 py-3 flex gap-2.5 items-center">
          <Icon name="truck" className="w-[18px] h-[18px] text-purple shrink-0" />
          <p className="text-[13px] font-semibold text-purple leading-snug">
            {`Arrives ${courierWindow(now, leadDays)}`}
            <Info text="Our courier partner calls before delivery. Time slots are inside Dhaka only." />
          </p>
        </div>
      )}

      {/* ─── date — midnight + scheduled ─── */}
      {method.datePick && (
        <div className="mt-5">
          <span className="block text-[13px] font-semibold text-purple mb-2">
            {method.midnight ? "Which midnight?" : "Delivery date"}
            <span className="text-[#C4172B] ml-0.5">*</span>
          </span>

          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {dates.map((d) => {
              const on = d.id === s.date;
              return (
                <button
                  key={d.id}
                  type="button"
                  disabled={d.disabled}
                  onClick={() => s.patch({ date: d.id, slotId: null })}
                  className={`shrink-0 w-[78px] rounded-[15px] border-[1.5px] py-2.5 text-center transition-colors ${
                    on
                      ? "border-orchid bg-orchid text-white shadow-soft"
                      : d.disabled
                        ? "border-lavender-deep bg-lavender text-body-soft/50 cursor-not-allowed"
                        : "border-lavender-deep bg-white text-purple hover:border-orchid-mid"
                  }`}
                >
                  <span className="block text-[11px] font-bold tracking-[0.04em] opacity-80">
                    {d.day}
                  </span>
                  <span className="block font-display text-[19px] font-semibold leading-tight">
                    {d.date}
                  </span>
                  <span className="block text-[10.5px] opacity-80 truncate px-0.5">
                    {d.label}
                  </span>
                </button>
              );
            })}

            {/*  the chosen calendar date, standing in the strip like the rest  */}
            {customDate && (
              <button
                type="button"
                onClick={() => dateRef.current?.showPicker?.()}
                className="shrink-0 w-[78px] rounded-[15px] border-[1.5px] border-orchid bg-orchid text-white shadow-soft py-2.5 text-center"
              >
                <span className="block text-[11px] font-bold tracking-[0.04em] opacity-80">
                  {new Date(customDate).toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase()}
                </span>
                <span className="block font-display text-[19px] font-semibold leading-tight">
                  {new Date(customDate).getDate()}
                </span>
                <span className="block text-[10.5px] opacity-80 truncate px-0.5">
                  {new Date(customDate).toLocaleDateString("en-GB", { month: "short" })}
                </span>
              </button>
            )}

            {/*  ── further out than the week ───────────────────────────────
                 The owner's question, 8 Sep: "and if somebody wants to
                 schedule beyond that?" This tile is the answer — the
                 browser's own calendar, with `min` set to the first date this
                 basket can actually be made by, so a date the strip would have
                 greyed out cannot be reached around the back either.  */}
            <div className="shrink-0 relative">
              <button
                type="button"
                onClick={() => dateRef.current?.showPicker?.()}
                className="w-[104px] h-full rounded-[15px] border-[1.5px] border-dashed border-orchid-mid bg-white text-orchid grid place-items-center gap-1 px-2 py-2.5 hover:border-orchid transition-colors"
              >
                <Icon name="calendar" className="w-[18px] h-[18px]" />
                <span className="text-[12px] font-bold leading-tight">
                  {customDate ? "Change date" : "Pick a date"}
                </span>
              </button>
              <input
                ref={dateRef}
                type="date"
                min={minDate}
                value={s.date ?? ""}
                onChange={(e) => e.target.value && s.patch({ date: e.target.value, slotId: null })}
                aria-label="Pick another delivery date"
                className="absolute inset-0 opacity-0 pointer-events-none"
              />
            </div>
          </div>

          {errors.date && <p className="text-[12px] text-[#C4172B] mt-1.5">{errors.date}</p>}

          {method.midnight && dates[0]?.disabled && (
            <p className="text-[12.5px] font-semibold text-[#8A5A00] mt-2.5">
              Tonight&apos;s midnight is closed — orders for tonight end at 6 PM.
            </p>
          )}
        </div>
      )}

      {/* ─── slot — same day + scheduled ─── */}
      {method.slots && (
        <div className="mt-5">
          <span className="block text-[13px] font-semibold text-purple mb-2">
            Time slot<span className="text-[#C4172B] ml-0.5">*</span>
            {method.todayOnly && (
              <span className="font-normal text-body-soft"> · today</span>
            )}
          </span>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {slotsForMethod.map((slot) => {
              const state = slotState(slot, isToday, now);
              const on = slot.id === s.slotId && state.ok;
              // real urgency when capacity is genuinely low — never invented
              const low = state.ok && state.left <= 5;

              return (
                <button
                  key={slot.id}
                  type="button"
                  disabled={!state.ok}
                  onClick={() => s.set("slotId", slot.id)}
                  className={`rounded-[14px] border-[1.5px] px-3 py-3 text-left transition-colors ${
                    on
                      ? "border-orchid bg-orchid-soft"
                      : state.ok
                        ? "border-lavender-deep bg-white hover:border-orchid-mid"
                        : "border-lavender-deep bg-lavender cursor-not-allowed"
                  }`}
                >
                  <span
                    className={`block text-[12.5px] font-semibold ${
                      state.ok ? "text-purple" : "text-body-soft"
                    }`}
                  >
                    {slot.label}
                  </span>
                  <span
                    className={`block text-[11px] mt-0.5 ${
                      !state.ok
                        ? "text-[#8A5A00]"
                        : low
                          ? "text-[#8A5A00] font-semibold"
                          : "text-body-soft"
                    }`}
                  >
                    {!state.ok
                      ? state.reason === "full"
                        ? "Fully booked"
                        : "Time has passed"
                      : low
                        ? `Only ${state.left} left`
                        : "Available"}
                  </span>
                </button>
              );
            })}
          </div>

          {errors.slotId && (
            <p className="text-[12px] text-[#C4172B] mt-1.5">{errors.slotId}</p>
          )}
        </div>
      )}

      {/*
        ⚠️ A MIDNIGHT PROMO LINE USED TO SIT HERE — removed 3 Aug 2026.

        It read "Midnight delivery is free on orders over ৳3,000", and above
        that threshold "Your order qualifies — midnight delivery is free
        (৳1,000 off)". Both sentences came from `FREE_DELIVERY_PROMO`, a
        constant in `_data/promo.ts`. The shop had no such offer, so the ৳1,000
        was promised by this file alone and would have been charged at the door.

        It is not replaced by a server-driven version here, deliberately: a
        waiver that IS real shows up in the Order Summary as the delivery line
        struck through and marked FREE, which is where a shopper checks what
        they are paying. Announcing it twice is how two numbers start to drift.
      */}

      <Continue label="Continue to payment" onClick={onContinue} />
    </QCard>
  );
}
