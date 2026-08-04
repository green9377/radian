import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/*  DELIVERY ANALYTICS — the real numbers, at last.

    WHY THIS FILE EXISTS. `/delivery/performance` has been showing "On-time
    94 %" since the Delivery module was built, and that figure was INVENTED —
    it came from `apps/admin/app/_data/deliveryDemo.ts`, and no line anywhere in
    the API produced it. The screen carried a Demo badge, so it was never
    dishonest; it simply outlived its purpose, because real deliveries started
    happening and nobody went back to wire it up.

    It could not have been wired up anyway. Judging whether a delivery was on
    time needs to know when it was PROMISED, and the promise survived only as
    `Order.date` (a String) and `Order.slotLabel` (a String, "10:00–13:00") —
    text meant to be read, not compared to a clock. `Order.promisedBy` was added
    on 29 Jul for exactly this.

    OWNERSHIP. This lives in Delivery, not in Intelligence, and that is the whole
    point. Intelligence reads the verdict; it does not form its own. Two modules
    each computing "on-time %" is how a business ends up with two answers to one
    question and no way to tell which is true.

    HONESTY RULE (INT-R09, and it applies here at the source). Every order taken
    before promisedBy existed has none, and never will. Those are UNMEASURABLE —
    they are never counted as late, and the count of them travels with every
    percentage this file returns. A rate that hides its own denominator has
    stopped being a rate.
*/

export interface DeliveryAnalytics {
  from: string;
  to: string;
  delivered: number;
  failed: number;
  inFlight: number;
  /** how many of `delivered` could actually be judged against a promise */
  measurable: number;
  unmeasurable: number;
  onTimeCount: number;
  /** basis points, or null when nothing could be measured — never 0 */
  onTimeBp: number | null;
  failedBp: number | null;
  avgMinutesToDeliver: number | null;
  chargedPaisa: number;
  costPaisa: number;
  marginPaisa: number;
  byZone: { name: string; delivered: number; onTimeBp: number | null; measurable: number }[];
  byCarrier: { name: string; kind: 'RIDER' | 'COURIER'; delivered: number; onTimeBp: number | null; measurable: number; costPaisa: number }[];
  daily: { onDate: string; delivered: number; onTimeCount: number; measurable: number }[];
}

const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class DeliveryAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async analytics(from: Date, to: Date): Promise<DeliveryAnalytics> {
    const [rows, failed, inFlight] = await Promise.all([
      this.prisma.db.deliveryAssignment.findMany({
        where: { status: 'DELIVERED', deliveredAt: { gte: from, lte: to }, isActive: true },
        select: {
          deliveredAt: true,
          assignedAt: true,
          outAt: true,
          costPaisa: true,
          kind: true,
          rider: { select: { name: true } },
          courier: { select: { name: true } },
          order: { select: { promisedBy: true, zone: true, deliveryPaisa: true, deliveryWaivedPaisa: true } },
        },
      }),
      this.prisma.db.deliveryAssignment.count({
        where: { status: 'FAILED', failedAt: { gte: from, lte: to }, isActive: true },
      }),
      this.prisma.db.deliveryAssignment.count({
        where: { status: { in: ['ASSIGNED', 'OUT_FOR_DELIVERY'] }, isActive: true },
      }),
    ]);

    const delivered = rows.length;
    /** a delivery can only be judged if somebody promised a time for it */
    const judged = rows.filter((r) => r.order?.promisedBy && r.deliveredAt);
    const onTime = judged.filter((r) => r.deliveredAt! <= r.order!.promisedBy!);

    const rate = (ok: number, of: number) => (of > 0 ? Math.round((ok / of) * 10000) : null);

    // how long it actually took, from leaving the shop to arriving
    const durations = rows
      .filter((r) => r.outAt && r.deliveredAt)
      .map((r) => (r.deliveredAt!.getTime() - r.outAt!.getTime()) / 60000)
      .filter((m) => m >= 0 && m < 60 * 24 * 3); // discard nonsense, not silently keep it

    /*  Charge and cost are INDEPENDENT numbers — what the customer paid for
        delivery, and what we paid the rider or courier. Delivery margin can be
        negative, and pretending otherwise by deriving one from the other would
        hide exactly the case worth seeing. */
    const charged = rows.reduce(
      (n, r) => n + Math.max(0, (r.order?.deliveryPaisa ?? 0) - (r.order?.deliveryWaivedPaisa ?? 0)),
      0,
    );
    const cost = rows.reduce((n, r) => n + (r.costPaisa ?? 0), 0);

    // ---- by zone ----
    const zoneMap = new Map<string, { delivered: number; ok: number; measurable: number }>();
    for (const r of rows) {
      const z = r.order?.zone ?? 'UNKNOWN';
      const e = zoneMap.get(z) ?? { delivered: 0, ok: 0, measurable: 0 };
      e.delivered += 1;
      if (r.order?.promisedBy && r.deliveredAt) {
        e.measurable += 1;
        if (r.deliveredAt <= r.order.promisedBy) e.ok += 1;
      }
      zoneMap.set(z, e);
    }

    // ---- by rider / courier ----
    const carrierMap = new Map<
      string,
      { kind: 'RIDER' | 'COURIER'; delivered: number; ok: number; measurable: number; cost: number }
    >();
    for (const r of rows) {
      const name = r.rider?.name ?? r.courier?.name ?? 'Unassigned';
      const kind: 'RIDER' | 'COURIER' = r.rider ? 'RIDER' : 'COURIER';
      const e = carrierMap.get(name) ?? { kind, delivered: 0, ok: 0, measurable: 0, cost: 0 };
      e.delivered += 1;
      e.cost += r.costPaisa ?? 0;
      if (r.order?.promisedBy && r.deliveredAt) {
        e.measurable += 1;
        if (r.deliveredAt <= r.order.promisedBy) e.ok += 1;
      }
      carrierMap.set(name, e);
    }

    // ---- day by day, in Dhaka time ----
    const dayMap = new Map<string, { delivered: number; ok: number; measurable: number }>();
    for (const r of rows) {
      const key = new Date(r.deliveredAt!.getTime() + BD_OFFSET_MS).toISOString().slice(0, 10);
      const e = dayMap.get(key) ?? { delivered: 0, ok: 0, measurable: 0 };
      e.delivered += 1;
      if (r.order?.promisedBy) {
        e.measurable += 1;
        if (r.deliveredAt! <= r.order.promisedBy) e.ok += 1;
      }
      dayMap.set(key, e);
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      delivered,
      failed,
      inFlight,
      measurable: judged.length,
      unmeasurable: delivered - judged.length,
      onTimeCount: onTime.length,
      onTimeBp: rate(onTime.length, judged.length),
      failedBp: rate(failed, delivered + failed),
      avgMinutesToDeliver:
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : null,
      chargedPaisa: charged,
      costPaisa: cost,
      marginPaisa: charged - cost,
      byZone: [...zoneMap.entries()]
        .map(([name, e]) => ({ name, delivered: e.delivered, onTimeBp: rate(e.ok, e.measurable), measurable: e.measurable }))
        .sort((a, b) => b.delivered - a.delivered),
      byCarrier: [...carrierMap.entries()]
        .map(([name, e]) => ({
          name, kind: e.kind, delivered: e.delivered,
          onTimeBp: rate(e.ok, e.measurable), measurable: e.measurable, costPaisa: e.cost,
        }))
        .sort((a, b) => b.delivered - a.delivered),
      daily: [...dayMap.entries()]
        .map(([onDate, e]) => ({ onDate, delivered: e.delivered, onTimeCount: e.ok, measurable: e.measurable }))
        .sort((a, b) => a.onDate.localeCompare(b.onDate)),
    };
  }
}
