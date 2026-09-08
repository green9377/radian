import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { SettingsService } from './settings.service';
import type {
  OccasionQuery,
  OptOutDto,
  OutreachLogDto,
  OutreachResultDto,
} from './marketing.dto';

/*
  OUTREACH — talking to somebody Radian already knows.

  For a flower shop this is the largest repeat-sales lever there is, and the
  dates have been collecting in RecipientOccasion since the Customer module.
  Nothing has ever read them until now.

  RADIAN_MARKETING_MODULE_ARCHITECTURE.md:
    MKT-D07      a list plus a one-click WhatsApp link. No API, no approval,
                 no per-message cost — the same wa.me pattern radianbd.com
                 already uses
    MKT-RULE-007 the message goes to the BUYER, never to the recipient.
                 Telling Salma her own birthday is coming ruins the surprise,
                 and on an anonymousGift order it is worse than that
    MKT-RULE-008 one occasion, one contact per year — enforced by a unique key,
                 not by hoping three staff members coordinate
    MKT-RULE-009 anybody who opted out disappears from every list
    MKT-RULE-010 29 February surfaces on 28 February in an ordinary year.
                 Small, and without it those people vanish silently for three
                 years out of every four
*/

const ENTITY = 'Outreach';

@Injectable()
export class OutreachService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  /* ---------------- the list ---------------- */

  async dueOccasions(q: OccasionQuery = {}) {
    const s = await this.settings.get();
    const lead = Math.max(...(s.reminderLeadDays.length ? s.reminderLeadDays : [7]));
    const days = q.days ? Math.min(120, Math.max(0, parseInt(q.days, 10) || lead)) : lead;

    const today = startOfDay(new Date());
    const wanted = new Map<string, { date: Date; inDays: number }>();
    for (let i = 0; i <= days; i += 1) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      wanted.set(mmdd(d), { date: d, inDays: i });

      // MKT-RULE-010 — in a non-leap year, 29 Feb rides along with 28 Feb
      if (mmdd(d) === '02-28' && !isLeap(d.getFullYear())) {
        wanted.set('02-29', { date: d, inDays: i });
      }
    }

    const occasions = await this.prisma.db.recipientOccasion.findMany({
      where: { date: { in: [...wanted.keys()] } },
      include: {
        recipient: {
          select: {
            id: true,
            name: true,
            phone: true,
            relationship: true,
            // REV-MKT-4 — see below
            deletedAt: true,
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
                status: true,
                ordersCount: true,
                lastOrderAt: true,
                // ⚠️ the soft-delete extension does NOT reach into a nested
                // include, so deletedAt has to be read and checked by hand.
                // Without this, somebody who opted back in would stay hidden
                // for ever.
                deletedAt: true,
                marketingOptOut: { select: { id: true, deletedAt: true } },
              },
            },
          },
        },
      },
    });

    const year = today.getFullYear();
    const rows = occasions
      /*  REV-MKT-4 — deleted people are not on this list.
       *
       *  `recipientOccasion` itself is filtered by the extension, but the
       *  recipient and the customer arrive through a nested include, and the
       *  extension does not reach in there. So a customer somebody had deleted
       *  went on appearing here every year, with a one-click WhatsApp button
       *  beside their name. The opt-out check below already knew this trap; the
       *  two rows above it did not. */
      .filter((o) => !o.recipient?.deletedAt && !o.recipient?.customer?.deletedAt)
      // MKT-RULE-009 — opted out, or blocked, and they are simply not here
      .filter((o) => {
        const opt = o.recipient?.customer?.marketingOptOut;
        return !!o.recipient?.customer && !(opt && opt.deletedAt === null);
      })
      .filter((o) => o.recipient.customer.status !== 'BLOCKED')
      .map((o) => {
        const hit = wanted.get(o.date)!;
        const c = o.recipient.customer;
        return {
          occasionId: o.id,
          type: o.type as string,
          label: o.label,
          date: o.date,
          onDate: hit.date.toISOString().slice(0, 10),
          inDays: hit.inDays,
          occasionYear: year,
          recipient: {
            id: o.recipient.id,
            name: o.recipient.name,
            relationship: o.recipient.relationship as string,
          },
          customer: {
            id: c.id,
            name: c.name,
            phone: c.phone,
            ordersCount: c.ordersCount,
            lastOrderAt: c.lastOrderAt,
          },
        };
      })
      .sort((a, b) => a.inDays - b.inDays || a.customer.name.localeCompare(b.customer.name));

    const filtered = q.search?.trim()
      ? rows.filter((r) => {
          const s2 = q.search!.trim().toLowerCase();
          return (
            r.customer.name.toLowerCase().includes(s2) ||
            r.recipient.name.toLowerCase().includes(s2) ||
            (r.customer.phone ?? '').includes(s2)
          );
        })
      : rows;

    // MKT-RULE-008 — which of these have already been contacted this year
    const done = await this.prisma.db.outreach.findMany({
      where: {
        occasionYear: year,
        customerId: { in: [...new Set(filtered.map((r) => r.customer.id))] },
      },
      select: { customerId: true, recipientId: true, occasionType: true, createdAt: true, channel: true },
    });
    const doneKey = new Set(
      done.map((d) => `${d.customerId}|${d.recipientId ?? ''}|${d.occasionType ?? ''}`),
    );

    // what they sent last time, so the message can say something real
    const lastOrders = await this.lastOrderPerCustomer(filtered.map((r) => r.customer.id));

    return {
      days,
      leadDays: s.reminderLeadDays,
      template: s.whatsappTemplate,
      items: filtered.map((r) => ({
        ...r,
        alreadyContacted: doneKey.has(`${r.customer.id}|${r.recipient.id}|${r.type}`),
        lastOrder: lastOrders.get(r.customer.id) ?? null,
      })),
    };
  }

  private async lastOrderPerCustomer(customerIds: string[]) {
    const out = new Map<string, { orderNo: string; placedAt: Date; totalPaisa: number }>();
    if (customerIds.length === 0) return out;
    const orders = await this.prisma.db.order.findMany({
      where: { customerId: { in: customerIds }, salesStatus: { not: 'cancelled' } },
      orderBy: { placedAt: 'desc' },
      select: { customerId: true, orderNo: true, placedAt: true, totalPaisa: true },
    });
    for (const o of orders) {
      if (!out.has(o.customerId))
        out.set(o.customerId, { orderNo: o.orderNo, placedAt: o.placedAt, totalPaisa: o.totalPaisa });
    }
    return out;
  }

  /* ---------------- logging a contact ---------------- */

  async log(dto: OutreachLogDto, actorName: string) {
    const customer = await this.prisma.db.customer.findUnique({
      where: { id: dto.customerId },
      select: {
        id: true,
        name: true,
        marketingOptOut: { select: { id: true, deletedAt: true } },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    // MKT-RULE-009 — no exception, not even a manual one
    if (customer.marketingOptOut && customer.marketingOptOut.deletedAt === null)
      throw new BadRequestException(`${customer.name} has asked not to be contacted (MKT-RULE-009)`);

    const year = dto.occasionYear ?? new Date().getFullYear();

    // MKT-RULE-008 — the unique key does the work; three staff members cannot
    // all message the same person because they each opened the list separately
    const dup =
      dto.recipientId && dto.occasionType
        ? await this.prisma.db.outreach.findFirst({
            where: {
              customerId: dto.customerId,
              recipientId: dto.recipientId,
              occasionType: dto.occasionType,
              occasionYear: year,
            },
          })
        : null;
    if (dup)
      return { ...dup, duplicate: true, message: 'Already contacted for this occasion this year' };

    const row = await this.prisma.db.outreach.create({
      data: {
        customerId: dto.customerId,
        recipientId: dto.recipientId ?? null,
        occasionType: dto.occasionType ?? null,
        occasionDate: dto.occasionDate ?? null,
        occasionYear: dto.recipientId ? year : null,
        channel: dto.channel ?? 'WHATSAPP',
        purpose: dto.purpose ?? 'OCCASION',
        message: dto.message ?? null,
        note: dto.note ?? null,
        campaignId: dto.campaignId ?? null,
        actorName,
      },
    });
    await this.audit.record({
      entityType: ENTITY,
      entityId: row.id,
      action: 'CREATE',
      actorName,
      changes: { customer: customer.name, channel: row.channel, purpose: row.purpose },
    });
    return row;
  }

  async setResult(id: string, dto: OutreachResultDto, actorName: string) {
    const row = await this.prisma.db.outreach.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Outreach not found');
    const saved = await this.prisma.db.outreach.update({
      where: { id },
      data: {
        result: dto.result,
        resultOrderId: dto.resultOrderId ?? null,
        note: dto.note ?? row.note,
        actorName,
      },
    });
    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorName,
      changes: { result: dto.result },
    });
    return saved;
  }

  async history(q: { customerId?: string; days?: string } = {}) {
    const where: Prisma.OutreachWhereInput = {};
    if (q.customerId) where.customerId = q.customerId;
    if (q.days) {
      const d = parseInt(q.days, 10);
      if (d > 0) where.createdAt = { gte: new Date(Date.now() - d * 864e5) };
    }
    return this.prisma.db.outreach.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });
  }

  /* ---------------- did it work? (MKT-D07, point 5) ----------------

     Without this the whole exercise is faith. An outreach counts as having
     worked if the same customer ordered within 14 days of being contacted. */
  async effect(days = 90) {
    const since = new Date(Date.now() - days * 864e5);
    const rows = await this.prisma.db.outreach.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, customerId: true, createdAt: true, channel: true, purpose: true },
    });
    if (rows.length === 0)
      return { days, contacted: 0, ordered: 0, revenuePaisa: 0, byChannel: [] };

    const orders = await this.prisma.db.order.findMany({
      where: {
        customerId: { in: [...new Set(rows.map((r) => r.customerId))] },
        placedAt: { gte: since },
        salesStatus: { not: 'cancelled' },
      },
      select: { customerId: true, placedAt: true, totalPaisa: true, vatPaisa: true },
    });

    let ordered = 0;
    let revenue = 0;
    const byChannel = new Map<string, { contacted: number; ordered: number }>();
    for (const r of rows) {
      const c = byChannel.get(r.channel) ?? { contacted: 0, ordered: 0 };
      c.contacted += 1;
      const hit = orders.find(
        (o) =>
          o.customerId === r.customerId &&
          o.placedAt >= r.createdAt &&
          o.placedAt.getTime() - r.createdAt.getTime() <= 14 * 864e5,
      );
      if (hit) {
        ordered += 1;
        revenue += hit.totalPaisa - hit.vatPaisa;
        c.ordered += 1;
      }
      byChannel.set(r.channel, c);
    }

    return {
      days,
      contacted: rows.length,
      ordered,
      revenuePaisa: revenue,
      byChannel: [...byChannel.entries()].map(([channel, v]) => ({ channel, ...v })),
    };
  }

  /* ---------------- opt out (MKT-RULE-009) ---------------- */

  async optOut(dto: OptOutDto, actorName: string) {
    const c = await this.prisma.db.customer.findUnique({ where: { id: dto.customerId } });
    if (!c) throw new NotFoundException('Customer not found');
    // raw client on purpose: a row from an earlier opt-out is soft-deleted, and
    // the unique on customerId would block a fresh create. Revive it instead.
    const row = await this.prisma.marketingOptOut.upsert({
      where: { customerId: dto.customerId },
      create: { customerId: dto.customerId, reason: dto.reason ?? null, actorName },
      update: { reason: dto.reason ?? null, actorName, deletedAt: null },
    });
    await this.audit.record({
      entityType: 'MarketingOptOut',
      entityId: row.id,
      action: 'CREATE',
      actorName,
      changes: { customer: c.name, reason: dto.reason },
    });
    return row;
  }

  /** Consent given back. Soft delete, so the fact that they once said no stays. */
  async optIn(customerId: string, actorName: string) {
    const row = await this.prisma.marketingOptOut.findUnique({ where: { customerId } });
    if (!row || row.deletedAt) return { customerId, optedOut: false };
    await this.prisma.db.marketingOptOut.update({
      where: { customerId },
      data: { deletedAt: new Date(), actorName },
    });
    await this.audit.record({
      entityType: 'MarketingOptOut',
      entityId: row.id,
      action: 'DELETE',
      actorName,
    });
    return { customerId, optedOut: false };
  }

  async optOutList() {
    return this.prisma.db.marketingOptOut.findMany({
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });
  }
}

/* ---------------- date helpers ---------------- */

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function mmdd(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
