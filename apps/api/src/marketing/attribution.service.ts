import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttributionSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import type { AttributionSetDto } from './marketing.dto';

/*
  ATTRIBUTION — where did this order come from?

  The hardest question in the module, and the one every ROI figure rests on.
  RADIAN_MARKETING_MODULE_ARCHITECTURE.md MKT-D02 / D03 / D04:

     1  ref code present      → that Affiliate   (money depends on it)
     2  coupon code used      → that Campaign
     3  utm_campaign captured → that Campaign
     4  staff set it by hand  → that Campaign
     5  nothing               → UNATTRIBUTED

  Two rules that matter more than the ladder itself:

  MKT-D03  an unattributed order is COUNTED AND SHOWN, never spread across
           campaigns. Spreading it is how a campaign that lost money reports a
           profit, and it is the single most common lie in marketing reporting.

  MKT-D04  one order, one campaign. An order counted in three campaigns turns
           ৳5,000 of revenue into ৳15,000 and makes all three look good.
           An affiliate is a SEPARATE column — an order may carry both, because
           they are two different ledgers.

  A manual override always wins and is audited (MKT-RULE-002). The rules never
  overwrite a human decision on a later re-run.
*/

const ENTITY = 'OrderAttribution';

@Injectable()
export class AttributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ---------------- the ladder ---------------- */

  /** Decide one order. Returns the row it wrote, or null if the order is gone. */
  async decide(orderId: string, opts: { force?: boolean } = {}) {
    const order = await this.prisma.db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        couponCode: true,
        utmCampaign: true,
        refCode: true,
        redemptions: { select: { offerId: true, code: true } },
      },
    });
    if (!order) return null;

    const existing = await this.prisma.db.orderAttribution.findUnique({
      where: { orderId },
    });
    // MKT-RULE-002 — a person's decision is not overwritten by a machine
    if (existing && existing.source === 'MANUAL' && !opts.force) return existing;

    const verdict = await this.runLadder(order);

    if (existing) {
      if (
        existing.source === verdict.source &&
        existing.campaignId === verdict.campaignId &&
        existing.affiliateId === verdict.affiliateId
      ) {
        return existing;
      }
      return this.prisma.db.orderAttribution.update({
        where: { orderId },
        data: { ...verdict, decidedAt: new Date(), decidedBy: 'system' },
      });
    }

    return this.prisma.db.orderAttribution.create({
      data: { orderId, ...verdict, decidedBy: 'system' },
    });
  }

  private async runLadder(order: {
    couponCode: string | null;
    utmCampaign: string | null;
    refCode: string | null;
    redemptions: { offerId: string; code: string | null }[];
  }): Promise<{
    source: AttributionSource;
    campaignId: string | null;
    affiliateId: string | null;
    evidence: string | null;
  }> {
    /* rung 1 — a ref code. Highest because commission money depends on it. */
    const ref = (order.refCode ?? '').trim().toUpperCase();
    if (ref) {
      /*  REV-MKT-2 — ACTIVE only.
          `remove()` on an affiliate who has ever earned does not delete them,
          it PAUSES them (the ledger still points at their rows). But nothing
          used to read that status, so pausing was decoration: the owner pressed
          remove, the screen said "paused", and the affiliate went on earning
          commission on every order carrying their code. */
      const aff = await this.prisma.db.affiliate.findFirst({
        where: { code: ref, status: 'ACTIVE' },
      });
      if (aff) {
        return {
          source: 'REF_CODE',
          campaignId: null,
          affiliateId: aff.id,
          evidence: ref,
        };
      }
    }

    /* rung 2 — a coupon that belongs to a campaign. The redemption row is the
       hard evidence; couponCode on the order is the fallback snapshot.
       Redemptions are read through prisma.db.* so a cancelled order's released
       redemption (DEC-OFR-008) does not count. */
    const offerIds = order.redemptions.map((r) => r.offerId);
    if (offerIds.length > 0) {
      const camp = await this.prisma.db.campaign.findFirst({
        where: { offerIds: { hasSome: offerIds } },
        orderBy: { startDate: 'desc' },
      });
      if (camp) {
        const code = order.redemptions.find((r) => r.code)?.code ?? order.couponCode;
        return {
          source: 'COUPON',
          campaignId: camp.id,
          affiliateId: null,
          evidence: code ?? null,
        };
      }
    }

    /* rung 3 — utm_campaign, forwarded by the storefront. Empty until the new
       storefront is built; the rung costs nothing while it waits. */
    const utm = (order.utmCampaign ?? '').trim().toLowerCase();
    if (utm) {
      const camp = await this.prisma.db.campaign.findFirst({
        where: { utmKeys: { has: utm } },
        orderBy: { startDate: 'desc' },
      });
      if (camp) {
        return { source: 'UTM', campaignId: camp.id, affiliateId: null, evidence: utm };
      }
    }

    /* rung 5 — nobody knows, and the report will say so. */
    return { source: 'UNATTRIBUTED', campaignId: null, affiliateId: null, evidence: null };
  }

  /* ---------------- rung 4: a person decides ---------------- */

  async setManual(orderId: string, dto: AttributionSetDto, actorName: string) {
    const order = await this.prisma.db.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNo: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (dto.campaignId) {
      const c = await this.prisma.db.campaign.findUnique({ where: { id: dto.campaignId } });
      if (!c) throw new BadRequestException('That campaign does not exist');
    }
    if (dto.affiliateId) {
      const a = await this.prisma.db.affiliate.findUnique({ where: { id: dto.affiliateId } });
      if (!a) throw new BadRequestException('That affiliate does not exist');
    }

    const cleared = !dto.campaignId && !dto.affiliateId;
    const data = {
      campaignId: dto.campaignId ?? null,
      affiliateId: dto.affiliateId ?? null,
      // clearing it by hand puts the order back in the honest bucket
      source: (cleared ? 'UNATTRIBUTED' : 'MANUAL') as AttributionSource,
      evidence: dto.note ?? null,
      decidedAt: new Date(),
      decidedBy: actorName,
    };

    const row = await this.prisma.db.orderAttribution.upsert({
      where: { orderId },
      create: { orderId, ...data },
      update: data,
    });

    await this.audit.record({
      entityType: ENTITY,
      entityId: row.id,
      action: 'UPDATE',
      actorName,
      changes: { orderNo: order.orderNo, ...data },
    });
    return row;
  }

  /* ---------------- bulk ---------------- */

  /** Re-run the ladder over recent orders. Safe to call again; manual
      decisions are left alone. */
  async runAll(fromISO?: string) {
    const from = fromISO ? new Date(fromISO) : new Date(Date.now() - 90 * 864e5);
    const orders = await this.prisma.db.order.findMany({
      where: { placedAt: { gte: from } },
      select: { id: true },
      orderBy: { placedAt: 'asc' },
    });

    let decided = 0;
    let unattributed = 0;
    for (const o of orders) {
      const row = await this.decide(o.id);
      if (row) {
        decided += 1;
        if (row.source === 'UNATTRIBUTED') unattributed += 1;
      }
    }
    return {
      scanned: orders.length,
      decided,
      unattributed,
      attributed: decided - unattributed,
      from: from.toISOString().slice(0, 10),
    };
  }

  /* ---------------- reporting ---------------- */

  /** The honesty panel: how many orders we can and cannot explain. */
  async quality(days = 30) {
    const since = new Date(Date.now() - days * 864e5);
    const orders = await this.prisma.db.order.findMany({
      where: { placedAt: { gte: since }, salesStatus: { not: 'cancelled' } },
      select: { id: true, totalPaisa: true, vatPaisa: true },
    });
    const ids = orders.map((o) => o.id);
    const rows =
      ids.length === 0
        ? []
        : await this.prisma.db.orderAttribution.findMany({
            where: { orderId: { in: ids } },
            select: { orderId: true, source: true },
          });

    const bySource = new Map<string, { orders: number; revenue: number }>();
    const seen = new Map<string, string>();
    for (const r of rows) seen.set(r.orderId, r.source);

    for (const o of orders) {
      const src = seen.get(o.id) ?? 'UNATTRIBUTED';
      const cur = bySource.get(src) ?? { orders: 0, revenue: 0 };
      cur.orders += 1;
      cur.revenue += o.totalPaisa - o.vatPaisa;
      bySource.set(src, cur);
    }

    const order: AttributionSource[] = [
      'REF_CODE',
      'COUPON',
      'UTM',
      'MANUAL',
      'UNATTRIBUTED',
    ];
    return {
      days,
      totalOrders: orders.length,
      rows: order.map((s) => ({
        source: s,
        orders: bySource.get(s)?.orders ?? 0,
        revenuePaisa: bySource.get(s)?.revenue ?? 0,
      })),
    };
  }

  async forOrder(orderId: string) {
    return this.prisma.db.orderAttribution.findUnique({
      where: { orderId },
      include: {
        campaign: { select: { id: true, campaignNo: true, name: true } },
        affiliate: { select: { id: true, affiliateNo: true, name: true, code: true } },
      },
    });
  }
}
