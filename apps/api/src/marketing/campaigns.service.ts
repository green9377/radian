import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, CampaignStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { ACC, ACC2 } from '../finance/finance.service';
import type { CampaignListQuery, CampaignWriteDto } from './marketing.dto';

/*
  CAMPAIGN — one promotional push.

  RADIAN_MARKETING_MODULE_ARCHITECTURE.md (28 Jul 2026):
    MKT-D01     one occasion, not one advertisement
    MKT-D05     spend is NEVER stored here. It is summed from Expense.campaignId,
                because the money belongs to Finance and two ledgers for the same
                taka never reconcile
    MKT-D06     ROI is three lines, and contribution is the headline
    MKT-RULE-004 a returned or cancelled order leaves campaign revenue
    MKT-RULE-005 VAT is never campaign revenue
    MKT-RULE-018 a campaign with attributed orders or tagged expenses is
                 archived, never deleted
    MKT-RULE-019 every count goes through prisma.db.* — the soft-delete-filtered
                 client. Using the raw client here would count cancelled orders'
                 released redemptions and every soft-deleted row (DEC-OFR-008)
*/

const ENTITY = 'Campaign';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ---------------- numbering ---------------- */

  /*  ⚠️ RAW client, not prisma.db.

      The number has to be unique across EVERY row, including soft-deleted
      ones — the unique index does not care that a row is hidden. Counting
      through the filtered client meant that deleting one campaign made the
      next one reuse its number, and the create blew up on the unique
      constraint. Found by the self-test, and it would have happened the first
      time the owner removed a campaign and made another. */
  private async nextNo(): Promise<string> {
    const rows = await this.prisma.campaign.findMany({ select: { campaignNo: true } });
    let max = 0;
    for (const r of rows) {
      const m = /^CMP-(\d{4,})$/.exec(r.campaignNo);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    return `CMP-${String(max + 1).padStart(6, '0')}`;
  }

  /* ---------------- read ---------------- */

  async list(q: CampaignListQuery) {
    const where: Prisma.CampaignWhereInput = {};
    if (q.status) where.status = q.status;
    else if (q.includeArchived !== '1') where.status = { not: 'ARCHIVED' };
    if (q.search?.trim()) {
      where.OR = [
        { name: { contains: q.search.trim(), mode: 'insensitive' } },
        { campaignNo: { contains: q.search.trim(), mode: 'insensitive' } },
      ];
    }

    const items = await this.prisma.db.campaign.findMany({
      where,
      orderBy: [{ startDate: 'desc' }],
    });

    // one round trip for the money rather than one per campaign
    const ids = items.map((c) => c.id);
    const spendMap = await this.spendByCampaign(ids);
    const revMap = await this.revenueByCampaign(ids);

    return items.map((c) => {
      const spend = spendMap.get(c.id) ?? 0;
      const r = revMap.get(c.id) ?? EMPTY_REVENUE;
      return {
        ...c,
        spentPaisa: spend,
        orders: r.orders,
        revenuePaisa: r.revenue,
        grossPaisa: r.revenue - r.cogs,
        contributionPaisa: r.revenue - r.cogs - r.deliveryCost,
        roi: spend > 0 ? (r.revenue - r.cogs - r.deliveryCost) / spend : null,
      };
    });
  }

  async get(id: string) {
    const c = await this.prisma.db.campaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Campaign not found');

    const spend = (await this.spendByCampaign([id])).get(id) ?? 0;
    const rev = (await this.revenueByCampaign([id])).get(id) ?? EMPTY_REVENUE;

    const expenses = await this.prisma.db.expense.findMany({
      where: { campaignId: id },
      orderBy: { spentAt: 'desc' },
      include: { account: { select: { code: true, name: true } } },
    });

    const attributions = await this.prisma.db.orderAttribution.findMany({
      where: { campaignId: id },
      orderBy: { decidedAt: 'desc' },
      take: 200,
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            placedAt: true,
            senderName: true,
            totalPaisa: true,
            vatPaisa: true,
            salesStatus: true,
            deliveryStatus: true,
          },
        },
      },
    });

    // how much of the number can be trusted (MKT-D02 / D03)
    const quality = await this.prisma.db.orderAttribution.groupBy({
      by: ['source'],
      where: { campaignId: id },
      _count: { _all: true },
    });

    return {
      ...c,
      spentPaisa: spend,
      orders: rev.orders,
      revenuePaisa: rev.revenue,
      cogsPaisa: rev.cogs,
      deliveryCostPaisa: rev.deliveryCost,
      grossPaisa: rev.revenue - rev.cogs,
      contributionPaisa: rev.revenue - rev.cogs - rev.deliveryCost,
      roi: spend > 0 ? (rev.revenue - rev.cogs - rev.deliveryCost) / spend : null,
      expenses,
      attributions,
      quality: quality.map((q) => ({ source: q.source, count: q._count._all })),
    };
  }

  /* ---------------- money, read from Finance (MKT-D05 / MKT-RULE-006) ----------------

     Spend is not a Marketing figure. It is the sum of the expenses somebody
     tagged with this campaign while entering them in Finance. If nobody tagged
     anything, the honest answer is zero — not an estimate. */

  private async spendByCampaign(ids: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (ids.length === 0) return out;
    const rows = await this.prisma.db.expense.groupBy({
      by: ['campaignId'],
      where: { campaignId: { in: ids }, approval: { not: 'DECLINED' } },
      _sum: { amountPaisa: true },
    });
    for (const r of rows) {
      if (r.campaignId) out.set(r.campaignId, r._sum.amountPaisa ?? 0);
    }
    return out;
  }

  /* Revenue, cost of goods and delivery cost for the orders attributed to each
     campaign.

     Revenue excludes VAT (MKT-RULE-005 — that is the government's money) and
     excludes cancelled orders (MKT-RULE-004). COGS and delivery cost are read
     from the ledger, where they are already posted per order — so these are
     recorded facts, not an estimate (MKT-D06). */
  private async revenueByCampaign(ids: string[]): Promise<Map<string, Revenue>> {
    const out = new Map<string, Revenue>();
    if (ids.length === 0) return out;

    const links = await this.prisma.db.orderAttribution.findMany({
      where: { campaignId: { in: ids } },
      select: { campaignId: true, orderId: true },
    });
    if (links.length === 0) return out;

    const orderIds = links.map((l) => l.orderId);
    const orders = await this.prisma.db.order.findMany({
      where: { id: { in: orderIds }, salesStatus: { not: 'cancelled' } },
      select: { id: true, totalPaisa: true, vatPaisa: true, refundPaisa: true },
    });
    const orderById = new Map(orders.map((o) => [o.id, o]));

    // COGS (5000) and delivery cost (5200) carry orderId as a dimension
    const costLines = await this.prisma.db.journalLine.findMany({
      where: {
        orderId: { in: orderIds },
        account: { code: { in: [ACC.COGS, ACC.DELIVERY_COST] } },
      },
      select: {
        orderId: true,
        debitPaisa: true,
        creditPaisa: true,
        account: { select: { code: true } },
      },
    });
    const cogsBy = new Map<string, number>();
    const delivBy = new Map<string, number>();
    for (const l of costLines) {
      if (!l.orderId) continue;
      // a return credits COGS back, so net the two sides
      const net = (l.debitPaisa ?? 0) - (l.creditPaisa ?? 0);
      const bucket = l.account.code === ACC.COGS ? cogsBy : delivBy;
      bucket.set(l.orderId, (bucket.get(l.orderId) ?? 0) + net);
    }

    for (const link of links) {
      if (!link.campaignId) continue;
      const o = orderById.get(link.orderId);
      if (!o) continue; // cancelled — MKT-RULE-004
      const cur = out.get(link.campaignId) ?? { ...EMPTY_REVENUE };
      cur.orders += 1;
      cur.revenue += o.totalPaisa - o.vatPaisa - o.refundPaisa;
      cur.cogs += cogsBy.get(o.id) ?? 0;
      cur.deliveryCost += delivBy.get(o.id) ?? 0;
      out.set(link.campaignId, cur);
    }
    return out;
  }

  /* ---------------- write ---------------- */

  async create(dto: CampaignWriteDto, actorName: string) {
    if (!dto.name?.trim()) throw new BadRequestException('A campaign needs a name');
    if (!dto.startDate || !dto.endDate)
      throw new BadRequestException('A campaign needs a start and an end date');
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) throw new BadRequestException('The end date is before the start date');

    const row = await this.prisma.db.campaign.create({
      data: {
        campaignNo: await this.nextNo(),
        name: dto.name.trim(),
        platform: dto.platform ?? 'FACEBOOK',
        status: dto.status ?? 'PLANNED',
        startDate: start,
        endDate: end,
        budgetPaisa: Math.max(0, Math.round(dto.budgetPaisa ?? 0)),
        goalNote: dto.goalNote ?? null,
        note: dto.note ?? null,
        offerIds: dto.offerIds ?? [],
        utmKeys: (dto.utmKeys ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean),
        actorName,
      },
    });
    await this.audit.record({
      entityType: ENTITY,
      entityId: row.id,
      action: 'CREATE',
      actorName,
      changes: { name: row.name, platform: row.platform },
    });
    return row;
  }

  async update(id: string, dto: CampaignWriteDto, actorName: string) {
    const before = await this.prisma.db.campaign.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Campaign not found');

    const data: Prisma.CampaignUpdateInput = { actorName };
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('A campaign needs a name');
      data.name = dto.name.trim();
    }
    if (dto.platform !== undefined) data.platform = dto.platform;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) data.endDate = new Date(dto.endDate);
    if (dto.budgetPaisa !== undefined)
      data.budgetPaisa = Math.max(0, Math.round(dto.budgetPaisa));
    if (dto.goalNote !== undefined) data.goalNote = dto.goalNote;
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.offerIds !== undefined) data.offerIds = dto.offerIds;
    if (dto.utmKeys !== undefined)
      data.utmKeys = dto.utmKeys.map((k) => k.trim().toLowerCase()).filter(Boolean);

    const start = (data.startDate as Date) ?? before.startDate;
    const end = (data.endDate as Date) ?? before.endDate;
    if (end < start) throw new BadRequestException('The end date is before the start date');

    const row = await this.prisma.db.campaign.update({ where: { id }, data });
    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorName,
      changes: dto as Record<string, unknown>,
    });
    return row;
  }

  /** MKT-RULE-018 — a campaign that has been used is archived, never deleted.
      Deleting it would silently detach expenses and orders that were correctly
      recorded, and the ROI of the past would quietly change. */
  async remove(id: string, actorName: string) {
    const row = await this.prisma.db.campaign.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Campaign not found');

    const [attributed, tagged] = await Promise.all([
      this.prisma.db.orderAttribution.count({ where: { campaignId: id } }),
      this.prisma.db.expense.count({ where: { campaignId: id } }),
    ]);

    if (attributed > 0 || tagged > 0) {
      const updated = await this.prisma.db.campaign.update({
        where: { id },
        data: { status: 'ARCHIVED', actorName },
      });
      await this.audit.record({
        entityType: ENTITY,
        entityId: id,
        action: 'UPDATE',
        actorName,
        changes: { archived: true, attributedOrders: attributed, taggedExpenses: tagged },
      });
      return {
        id,
        deleted: false,
        archived: true,
        message: `Archived instead of deleted — ${attributed} order(s) and ${tagged} expense(s) point at this campaign (MKT-RULE-018)`,
        campaign: updated,
      };
    }

    await this.prisma.db.campaign.update({
      where: { id },
      data: { deletedAt: new Date(), actorName },
    });
    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'DELETE',
      actorName,
    });
    return {
      id,
      deleted: true,
      archived: false,
      message: 'Removed — nothing pointed at it',
      campaign: row,
    };
  }

  /* ---------------- automation ---------------- */

  /*  Move a campaign's status on by its own dates.

      FORWARD ONLY, and never past FINISHED. That single restriction is what
      makes this safe to run every quarter of an hour: if the owner marks a
      campaign finished early — the budget ran out, the idea did not work — the
      machine must not quietly restart it tomorrow because the end date has not
      arrived yet. A person's decision is the later one, so it wins. */
  async advanceStatuses() {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const started = new Date();
    started.setHours(0, 0, 0, 0);

    const toRunning = await this.prisma.db.campaign.updateMany({
      where: { status: 'PLANNED', startDate: { lte: today } },
      data: { status: 'RUNNING' },
    });
    const toFinished = await this.prisma.db.campaign.updateMany({
      where: { status: 'RUNNING', endDate: { lt: started } },
      data: { status: 'FINISHED' },
    });
    return { started: toRunning.count, finished: toFinished.count };
  }

  /* ---------------- overview ---------------- */

  async stats() {
    const now = new Date();
    const [running, planned, finished] = await Promise.all([
      this.prisma.db.campaign.count({ where: { status: 'RUNNING' } }),
      this.prisma.db.campaign.count({ where: { status: 'PLANNED' } }),
      this.prisma.db.campaign.count({ where: { status: 'FINISHED' } }),
    ]);

    const live = await this.prisma.db.campaign.findMany({
      where: { status: 'RUNNING' },
      select: { id: true },
    });
    const ids = live.map((c) => c.id);
    const spendMap = await this.spendByCampaign(ids);
    const revMap = await this.revenueByCampaign(ids);

    let spend = 0;
    let contribution = 0;
    let orders = 0;
    for (const id of ids) {
      spend += spendMap.get(id) ?? 0;
      const r = revMap.get(id) ?? EMPTY_REVENUE;
      contribution += r.revenue - r.cogs - r.deliveryCost;
      orders += r.orders;
    }

    // MKT-D03 — the number nobody else shows
    const since = new Date(now);
    since.setDate(since.getDate() - 30);
    /*  REV-MKT-5 — both halves must count the SAME orders.
     *
     *  `known30` used to be "attributions DECIDED in the last 30 days", while
     *  `total30` is "orders PLACED in the last 30 days". They are different
     *  populations: re-running attribution over old orders — which the nightly
     *  sweep does, over 365 days — pushed `known30` up without touching
     *  `total30`, and "how many orders we cannot explain" quietly fell towards
     *  zero. The honesty figure was the one number in this module that had to
     *  be honest (MKT-D03).
     *
     *  Now both are keyed on the order's own placedAt. */
    const [total30, known30] = await Promise.all([
      this.prisma.db.order.count({
        where: { placedAt: { gte: since }, salesStatus: { not: 'cancelled' } },
      }),
      this.prisma.db.orderAttribution.count({
        where: {
          source: { not: 'UNATTRIBUTED' },
          order: { placedAt: { gte: since }, salesStatus: { not: 'cancelled' } },
        },
      }),
    ]);

    // 5450 / 5495 / 5496 spent in the last 30 days that nobody tagged
    const untagged = await this.prisma.db.expense.aggregate({
      where: {
        campaignId: null,
        spentAt: { gte: since },
        account: { code: { in: [ACC.MARKETING, '5495', '5496', ACC2.AFFILIATE_COMMISSION] } },
      },
      _sum: { amountPaisa: true },
    });

    return {
      running,
      planned,
      finished,
      liveSpendPaisa: spend,
      liveContributionPaisa: contribution,
      liveOrders: orders,
      orders30: total30,
      attributed30: known30,
      unattributed30: Math.max(0, total30 - known30),
      untaggedSpend30Paisa: untagged._sum.amountPaisa ?? 0,
    };
  }
}

interface Revenue {
  orders: number;
  revenue: number;
  cogs: number;
  deliveryCost: number;
}
const EMPTY_REVENUE: Revenue = { orders: 0, revenue: 0, cogs: 0, deliveryCost: 0 };
