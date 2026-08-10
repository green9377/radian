import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, CustomerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  RecipientInput,
  UpdateRecipientDto,
  ListCustomerQuery,
} from './customer.dto';

const ENTITY = 'Customer';

// nested include soft-delete extension ধরে না — তাই explicit deletedAt filter
const NOT_DELETED = { deletedAt: null };
const RECIPIENT_INCLUDE = {
  occasions: { where: NOT_DELETED, orderBy: { date: 'asc' } },
} satisfies Prisma.RecipientInclude;

const FULL_INCLUDE = {
  segments: { where: NOT_DELETED },
  recipients: { where: NOT_DELETED, include: RECIPIENT_INCLUDE, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.CustomerInclude;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ---------------- read ---------------- */

  async list(q: ListCustomerQuery) {
    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize ?? '20', 10) || 20));

    const where: Prisma.CustomerWhereInput = {};
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { phone: { contains: q.search } },
        { email: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    if (q.country) where.country = q.country;
    if (q.status === 'ACTIVE' || q.status === 'BLOCKED') where.status = q.status;
    if (q.segmentId) where.segments = { some: { id: q.segmentId } };
    // abroad = residence ≠ Bangladesh (NRB)
    if (q.abroad === 'true') where.NOT = { country: { equals: 'Bangladesh', mode: 'insensitive' } };
    if (q.abroad === 'false') where.country = { equals: 'Bangladesh', mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.db.customer.findMany({
        where,
        include: {
          segments: { where: NOT_DELETED },
          _count: { select: { recipients: { where: NOT_DELETED } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.db.customer.count({ where }),
    ]);

    return {
      items: items.map((c) => this.shape(c)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const c = await this.prisma.db.customer.findFirst({ where: { id }, include: FULL_INCLUDE });
    if (!c) throw new NotFoundException('Customer not found');
    return this.shape(c);
  }

  async timeline(id: string) {
    await this.ensureExists(id);
    return this.audit.timeline(ENTITY, id);
  }

  /* ---------------- create ---------------- */

  async create(dto: CreateCustomerDto) {
    this.validate(dto);
    await this.ensurePhoneFree(dto.phone);
    if (dto.segmentIds?.length) await this.ensureSegments(dto.segmentIds);
    const actorName = dto.actorName ?? 'Admin';

    const c = await this.prisma.db.customer.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        whatsappVerified: dto.whatsappVerified,
        country: dto.country,
        ownAddressLine: dto.ownAddressLine,
        note: dto.note,
        avatarBg: dto.avatarBg,
        imageUrl: dto.imageUrl, // DEC-CUS-009
        segments: dto.segmentIds?.length ? { connect: dto.segmentIds.map((id) => ({ id })) } : undefined,
        recipients: dto.recipients?.length
          ? { create: dto.recipients.map((r) => this.recipientData(r)) }
          : undefined,
      },
      include: FULL_INCLUDE,
    });

    await this.audit.record({ entityType: ENTITY, entityId: c.id, action: 'CREATE', actorName });
    await this.audit.event({
      entityType: ENTITY,
      entityId: c.id,
      kind: 'general',
      label: `Customer "${c.name}" created`,
      actorName,
    });
    return this.shape(c);
  }

  /* ---------------- update ---------------- */

  async update(id: string, dto: UpdateCustomerDto) {
    const existing = await this.prisma.db.customer.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Customer not found');
    if (dto.phone && dto.phone !== existing.phone) await this.ensurePhoneFree(dto.phone);
    if (dto.segmentIds?.length) await this.ensureSegments(dto.segmentIds);
    const actorName = dto.actorName ?? 'Admin';

    const c = await this.prisma.db.customer.update({
      where: { id },
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        whatsappVerified: dto.whatsappVerified,
        country: dto.country,
        ownAddressLine: dto.ownAddressLine,
        note: dto.note,
        avatarBg: dto.avatarBg,
        imageUrl: dto.imageUrl, // DEC-CUS-009
        segments: dto.segmentIds ? { set: dto.segmentIds.map((sid) => ({ id: sid })) } : undefined,
      },
      include: FULL_INCLUDE,
    });

    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorName,
      changes: this.diff(existing, dto),
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: id,
      kind: 'general',
      label: `Customer "${c.name}" updated`,
      actorName,
    });
    return this.shape(c);
  }

  /* ---------------- block / unblock (block ≠ delete, DEC-CUS-003) ---------------- */

  async setStatus(id: string, status: CustomerStatus, actorName = 'Admin') {
    const existing = await this.prisma.db.customer.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Customer not found');
    const c = await this.prisma.db.customer.update({ where: { id }, data: { status }, include: FULL_INCLUDE });
    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'UPDATE', actorName, changes: { status: { from: existing.status, to: status } } });
    await this.audit.event({
      entityType: ENTITY,
      entityId: id,
      kind: 'general',
      label: status === 'BLOCKED' ? `Customer "${c.name}" blocked` : `Customer "${c.name}" unblocked`,
      actorName,
    });
    return this.shape(c);
  }

  /* ---------------- soft delete / restore ---------------- */

  async remove(id: string, actorName = 'Admin') {
    const existing = await this.prisma.db.customer.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Customer not found');

    /* CUS-REV-1 (30 Jul) — the worst thing found in this pass, and nothing guarded it.
       'WALK-IN' is the system customer every anonymous counter sale is booked against
       (DEC-POS-007). Deleting it BRICKS THE TILL, permanently:
         · POS looks it up through `prisma.db`, which hides soft-deleted rows → not found
         · so it tries to create it → the deleted row still holds 'WALK-IN' in the
           @unique index → P2002
         · so every walk-in sale 500s, for ever, and Restore is the only way back —
           except nothing on the POS error says the word "customer".
       A row the software depends on by name is not the operator's to delete. */
    if (existing.phone === 'WALK-IN') {
      throw new BadRequestException(
        'This is the anonymous walk-in customer the till books counter sales against — it cannot be deleted. Every POS sale would stop.',
      );
    }

    /* CUS-REV-3 — do not let money owed disappear from the list. Customers had NO
       dependency check of any kind, unlike Item, which refuses while it is an
       ingredient somewhere. A customer with an unpaid POS bill could be removed and
       then owed money by somebody who is no longer on any screen — while the due board
       still shows the name, because a nested `include` is not soft-delete filtered. */
    const owing = await this.prisma.db.order.aggregate({
      where: { customerId: id, duePaisa: { gt: 0 } },
      _sum: { duePaisa: true },
      _count: true,
    });
    const due = owing._sum.duePaisa ?? 0;
    if (due > 0) {
      throw new BadRequestException(
        `"${existing.name}" still owes ${(due / 100).toFixed(2)} tk on ${owing._count} bill(s). Collect or write it off first — deleting the customer does not clear the debt, it only hides who owes it.`,
      );
    }

    await this.prisma.db.customer.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'DELETE', actorName });
    await this.audit.event({ entityType: ENTITY, entityId: id, kind: 'general', label: `Customer "${existing.name}" deleted (soft)`, actorName });
    return { id, deleted: true };
  }

  async restore(id: string, actorName = 'Admin') {
    const existing = await this.prisma.customer.findFirst({ where: { id, NOT: { deletedAt: null } } });
    if (!existing) throw new NotFoundException('Deleted customer not found');
    await this.prisma.customer.update({ where: { id }, data: { deletedAt: null } });
    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'RESTORE', actorName });
    await this.audit.event({ entityType: ENTITY, entityId: id, kind: 'general', label: `Customer "${existing.name}" restored`, actorName });
    return { id, restored: true };
  }

  /* ---------------- recipient book (customer-owned) ---------------- */

  async addRecipient(customerId: string, dto: RecipientInput, actorName = 'Admin') {
    await this.ensureExists(customerId);
    this.validateRecipient(dto);
    const r = await this.prisma.db.recipient.create({
      data: { customerId, ...this.recipientData(dto) },
      include: RECIPIENT_INCLUDE,
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: customerId,
      kind: 'general',
      label: `Recipient "${r.name}" added`,
      actorName,
    });
    return r;
  }

  async updateRecipient(customerId: string, recipientId: string, dto: UpdateRecipientDto, actorName = 'Admin') {
    const r = await this.prisma.db.recipient.findFirst({ where: { id: recipientId, customerId } });
    if (!r) throw new NotFoundException('Recipient not found');

    // occasions দেওয়া থাকলে পুরনোগুলো soft-delete করে নতুন সেট (soft-delete only)
    if (dto.occasions) {
      await this.prisma.db.recipientOccasion.updateMany({
        where: { recipientId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    }

    const updated = await this.prisma.db.recipient.update({
      where: { id: recipientId },
      data: {
        name: dto.name,
        phone: dto.phone,
        relationship: dto.relationship,
        zone: dto.zone,
        addressLine: dto.addressLine,
        note: dto.note,
        isFavorite: dto.isFavorite,
        occasions: dto.occasions?.length
          ? { create: dto.occasions.map((o) => ({ type: o.type, date: o.date, year: o.year ?? null, label: o.label })) }
          : undefined,
      },
      include: RECIPIENT_INCLUDE,
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: customerId,
      kind: 'general',
      label: `Recipient "${updated.name}" updated`,
      actorName,
    });
    return updated;
  }

  async removeRecipient(customerId: string, recipientId: string, actorName = 'Admin') {
    const r = await this.prisma.db.recipient.findFirst({ where: { id: recipientId, customerId } });
    if (!r) throw new NotFoundException('Recipient not found');
    await this.prisma.db.recipient.update({ where: { id: recipientId }, data: { deletedAt: new Date() } });
    await this.audit.event({
      entityType: ENTITY,
      entityId: customerId,
      kind: 'general',
      label: `Recipient "${r.name}" removed`,
      actorName,
    });
    return { id: recipientId, deleted: true };
  }

  /* ---------------- helpers ---------------- */

  private async ensureExists(id: string) {
    const c = await this.prisma.db.customer.findFirst({ where: { id }, select: { id: true } });
    if (!c) throw new NotFoundException('Customer not found');
  }
  /**
   * CUS-REV-2 (30 Jul) — the RAW client, because `Customer.phone` is @unique and the
   * index does not care that a row is soft-deleted.
   *
   * This read went through `prisma.db`, which filters `deletedAt: null`, so a deleted
   * customer's number looked FREE. The check passed, the insert hit the unique index,
   * and the user got a raw P2002 — HTTP 500, no message, form lost — for a number the
   * system had just told them was available.
   *
   * Item's `freeSku()` has always used the raw client for exactly this reason
   * ("unique across the whole system, deleted rows included"). The lesson simply never
   * crossed the module boundary. `Product.slug` had the same fault (PRD-REV-1).
   *
   * The message now says which case it is, because "already registered" and "in the
   * trash" need different actions from the user.
   */
  private async ensurePhoneFree(phone: string) {
    const dupe = await this.prisma.customer.findFirst({
      where: { phone },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!dupe) return;
    if (dupe.deletedAt) {
      throw new BadRequestException(
        `"${phone}" belongs to "${dupe.name}", who is in the trash. Restore that customer instead of making a second one.`,
      );
    }
    throw new BadRequestException(`phone "${phone}" already registered`);
  }
  private async ensureSegments(ids: string[]) {
    const found = await this.prisma.db.segment.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new BadRequestException('one or more segmentIds not found');
  }

  private validate(dto: CreateCustomerDto) {
    if (!dto.name?.trim()) throw new BadRequestException('name required');
    if (!dto.phone?.trim()) throw new BadRequestException('phone required (identity key)');
    if (!dto.phone.startsWith('+')) throw new BadRequestException('phone must be international (+countrycode…)');
    dto.recipients?.forEach((r) => this.validateRecipient(r));
  }
  private validateRecipient(r: RecipientInput) {
    if (!r.name?.trim()) throw new BadRequestException('recipient name required');
    if (!r.phone?.trim()) throw new BadRequestException('recipient phone required');
    if (!r.addressLine?.trim()) throw new BadRequestException('recipient addressLine required');
    r.occasions?.forEach((o) => {
      if (!/^\d{2}-\d{2}$/.test(o.date)) throw new BadRequestException('occasion date must be "MM-DD"');
      /*  DEC-CUS-010 — সাল ঐচ্ছিক。 এলে সেটা যেন সত্যিকারের সাল হয়: ভবিষ্যতের
          জন্মদিন বা ১৮৭২ সালের বিবাহবার্ষিকী দুটোই টাইপো。                   */
      if (o.year !== undefined && o.year !== null) {
        const now = new Date().getFullYear();
        if (!Number.isInteger(o.year) || o.year < 1900 || o.year > now) {
          throw new BadRequestException(`occasion year must be between 1900 and ${now}`);
        }
      }
    });
  }

  private recipientData(r: RecipientInput): Prisma.RecipientCreateWithoutCustomerInput {
    return {
      name: r.name,
      phone: r.phone,
      relationship: r.relationship,
      zone: r.zone,
      addressLine: r.addressLine,
      note: r.note,
      isFavorite: r.isFavorite,
      occasions: r.occasions?.length
        ? { create: r.occasions.map((o) => ({ type: o.type, date: o.date, year: o.year ?? null, label: o.label })) }
        : undefined,
    };
  }

  // ltvPaisa BigInt → Number (frontend-friendly) + derived tier/isAbroad (stored নয়)
  private shape<T extends { ltvPaisa: bigint; ordersCount: number; country: string }>(c: T) {
    return {
      ...c,
      ltvPaisa: Number(c.ltvPaisa),
      tier: this.tier(c.ordersCount),
      isAbroad: c.country?.trim().toLowerCase() !== 'bangladesh',
    };
  }
  private tier(ordersCount: number): 'new' | 'onetime' | 'repeat' {
    if (ordersCount <= 0) return 'new';
    if (ordersCount === 1) return 'onetime';
    return 'repeat';
  }

  private diff(before: Record<string, unknown>, patch: UpdateCustomerDto): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'actorName' || k === 'segmentIds') continue;
      if ((before as Record<string, unknown>)[k] !== v) changes[k] = { from: (before as Record<string, unknown>)[k], to: v };
    }
    return changes;
  }
}
