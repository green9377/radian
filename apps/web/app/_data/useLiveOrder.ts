"use client";

import { useEffect, useState } from "react";

import { trackOrder, type TrackedOrder } from "./checkoutApi";
import { isTerminal, type Order, type OrderEvent, type OrderStatus } from "./order";

/*
  ═══════════════════════════════════════════════════════════════════════════
  THE CUSTOMER'S ORDER PAGE ASKS THE SHOP — DEC-SAL-016, 30 Aug 2026.

  ⚠️ THE BUG THIS EXISTS FOR. The owner, walking his own shop: *"when we
  confirm / prepare / deliver from the admin, the steps on the front end do
  not change."* He was right, and the cause was not the admin.

  `buildOrder()` writes a snapshot of the order into localStorage the moment
  checkout finishes — `status: "placed"`, a one-event timeline — and every
  account page rendered THAT. The browser was remembering an order, not
  following one. Nothing the shop did afterwards could reach the page, because
  the page never asked. The one screen that always worked, `/track`, is the one
  screen that calls the server.

  So the snapshot keeps what only it knows (what was bought, what was paid,
  where it goes — none of which the public route will hand out), and the SHOP
  keeps what only it knows: where the order actually is.

  ⚠️ IT IS THE SAME ROUTE AS /track, ON PURPOSE. `orderNo + phone`, no new
  endpoint, no new way in. The website has no customer session — `useAuthStore`
  is a mock with no token — so inventing an "my orders" route here would have
  meant inventing an authentication story to go with it. The number and the
  phone are both already in the browser's own snapshot of its own order.

  ⚠️ A step with no time shows no time. Orders placed before the stage columns
  existed return nulls, and so does any step not yet reached. Nothing here
  invents a clock: a made-up "confirmed at 4:05pm" on a receipt is worse than
  a step with no time under it.
  ═══════════════════════════════════════════════════════════════════════════
*/

const STAGE_STATUS: Record<number, OrderStatus> = {
  1: "placed",
  2: "confirmed",
  3: "preparing",
  4: "out_for_delivery",
  5: "delivered",
};

/**
 * The order as the SHOP has it, or the given order untouched when the shop
 * cannot be reached (offline, an old order, a number the route will not open).
 * Never null, never a spinner in place of a receipt the browser already holds.
 */
export function useLiveOrder(order: Order | null): Order | null {
  const [live, setLive] = useState<Order | null>(order);

  /*  ⚠️ THE EFFECT KEYS ON THESE THREE STRINGS, NOT ON `order`.
      `findOrder()` builds a fresh array on every render, so depending on the
      object would re-run the effect each time this hook set state — a fetch
      loop against /shop/track for as long as the page is open. It happens to
      return a stable reference today (the store's object, or a module-level
      seed), which is exactly the kind of accident that stops being true after
      an unrelated edit.  */
  const key = order ? `${order.id}|${order.status}|${order.sender.phone}` : "";

  useEffect(() => {
    setLive(order);
    if (!order) return;

    /*  A delivered or cancelled order cannot move again, so it is not asked
        about — and its snapshot is already the final word.  */
    if (isTerminal(order.status)) return;

    const phone = order.sender.phone;
    if (!order.id.startsWith("RAD-") || !phone) return;

    let dropped = false;
    (async () => {
      const t = await trackOrder(order.id, phone);
      if (dropped || !t) return;

      const status: OrderStatus = t.cancelled
        ? "cancelled"
        : (STAGE_STATUS[t.stage] ?? order.status);

      setLive({ ...order, status, timeline: timelineFrom(order, t.steps, status) });
    })();

    return () => {
      dropped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return live;
}

/**
 * The steps the shop says have happened, each with its real moment.
 *
 * A step the shop reached but never timed (an order older than the columns)
 * is left out of the history rather than given a guessed time — the tracker
 * above it still shows it as done, which is the true statement: we know it
 * happened, we do not know when.
 */
function timelineFrom(
  order: Order,
  steps: TrackedOrder["steps"],
  status: OrderStatus,
): OrderEvent[] {
  if (!steps) return order.timeline;

  const at = (iso: string | null): number | null => {
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? null : ms;
  };

  const rows: { status: OrderStatus; at: number | null }[] = [
    { status: "placed", at: at(steps.placedAt) ?? order.placedAt },
    { status: "confirmed", at: at(steps.confirmedAt) },
    { status: "preparing", at: at(steps.preparingAt) },
    { status: "out_for_delivery", at: at(steps.outForDeliveryAt) },
    { status: "delivered", at: at(steps.deliveredAt) },
  ];

  const out: OrderEvent[] = rows
    .filter((r): r is { status: OrderStatus; at: number } => r.at !== null)
    .map((r) => ({ status: r.status, at: r.at }));

  const cancelledAt = at(steps.cancelledAt);
  if (status === "cancelled" && cancelledAt !== null)
    out.push({ status: "cancelled", at: cancelledAt });

  return out.length ? out : order.timeline;
}
