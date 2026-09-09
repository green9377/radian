import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderMessageChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

/*
  The words of every SMS and email the system sends (owner, 8 Sep 2026).

  WhatsApp keeps Meta's approved templates — those are submitted, not written
  here. SMS and email have no such thing, so their wording lives in this table
  and is written, edited and removed from Admin → Marketing → Email & SMS →
  Templates. The system reads the newest active row for a kind and channel
  at send time; with none, that message is skipped and the order's message
  log says why. Nothing is hard-coded, so a wording change needs no deploy
  (house rule 7).
*/

export const TEMPLATE_KINDS = [
  'ORDER_CONFIRMATION',
  'ORDER_CONFIRMATION_COD',
  'ORDER_APPROVED',
  'PAYMENT_RECEIVED',
  'ORDER_OUT_FOR_DELIVERY',
  'ORDER_DELIVERED',
  'PAYMENT_FAILED',
  'REVIEW_REQUEST',
  'LOGIN_OTP',
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** What each placeholder means — the admin screen prints this list. */
export const PLACEHOLDERS: Record<string, string> = {
  name: "the customer's name",
  order: 'the order number',
  total: 'the order total, with the taka sign',
  paid: 'how much has been paid so far, with the taka sign (part payment)',
  due: 'how much is still owed, with the taka sign (part payment)',
  link: 'the link that matters for this message (track / pay / review)',
  product: 'the product being asked about (review request)',
  code: 'the one-time code (login code)',
  minutes: 'how many minutes the code lives (login code)',
  shop: "the shop's name",
  phone: "the shop's support number",
};

export type TemplateVars = Partial<Record<keyof typeof PLACEHOLDERS, string>>;

const CHANNELS: OrderMessageChannel[] = [OrderMessageChannel.SMS, OrderMessageChannel.EMAIL];

@Injectable()
export class MessageTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.db.messageTemplate.findMany({
      where: { deletedAt: null },
      orderBy: [{ kind: 'asc' }, { channel: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /** The newest active wording for a kind on a channel, or null. */
  async pick(kind: TemplateKind, channel: OrderMessageChannel) {
    return this.prisma.db.messageTemplate.findFirst({
      where: { kind, channel, isActive: true, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** `{name}` → value. An unknown placeholder is left as typed, so a typo shows. */
  render(text: string, vars: TemplateVars): string {
    return text.replace(/\{([a-z]+)\}/g, (m, k: string) => {
      const v = (vars as Record<string, string | undefined>)[k];
      return v === undefined ? m : v;
    });
  }

  async create(
    dto: { kind: string; channel: string; name?: string; subject?: string; body?: string; isActive?: boolean },
    actor: string,
  ) {
    const { kind, channel } = this.validate(dto);
    if (!dto.body?.trim()) throw new BadRequestException('The message needs some words');
    if (channel === OrderMessageChannel.EMAIL && !dto.subject?.trim()) {
      throw new BadRequestException('An email needs a subject');
    }
    const row = await this.prisma.db.messageTemplate.create({
      data: {
        kind,
        channel,
        name: dto.name?.trim() || `${kind} · ${channel}`,
        subject: channel === OrderMessageChannel.EMAIL ? dto.subject!.trim() : null,
        body: dto.body.trim(),
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.record({
      entityType: 'MessageTemplate', entityId: row.id, action: 'CREATE', actorName: actor,
      changes: { kind, channel, name: row.name },
    });
    return row;
  }

  async update(
    id: string,
    dto: { name?: string; subject?: string; body?: string; isActive?: boolean },
    actor: string,
  ) {
    const before = await this.prisma.db.messageTemplate.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('No such template');
    if (dto.body !== undefined && !dto.body.trim()) throw new BadRequestException('The message needs some words');
    if (before.channel === OrderMessageChannel.EMAIL && dto.subject !== undefined && !dto.subject.trim()) {
      throw new BadRequestException('An email needs a subject');
    }
    const row = await this.prisma.db.messageTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() || before.name } : {}),
        ...(dto.subject !== undefined && before.channel === OrderMessageChannel.EMAIL ? { subject: dto.subject.trim() } : {}),
        ...(dto.body !== undefined ? { body: dto.body.trim() } : {}),
        ...(dto.isActive !== undefined ? { isActive: !!dto.isActive } : {}),
      },
    });
    await this.audit.record({
      entityType: 'MessageTemplate', entityId: id, action: 'UPDATE', actorName: actor,
      changes: {
        before: { name: before.name, subject: before.subject, body: before.body, isActive: before.isActive },
        after: { name: row.name, subject: row.subject, body: row.body, isActive: row.isActive },
      },
    });
    return row;
  }

  /** Soft delete (house rule 5). A kind left with no active wording is skipped at send time. */
  async remove(id: string, actor: string) {
    const row = await this.prisma.db.messageTemplate.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new NotFoundException('No such template');
    await this.prisma.db.messageTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      entityType: 'MessageTemplate', entityId: id, action: 'DELETE', actorName: actor,
      changes: { name: row.name, kind: row.kind, channel: row.channel },
    });
    return { ok: true };
  }

  /** Which kind + channel pairs have no active wording — the screen warns on these. */
  async gaps() {
    const rows = await this.prisma.db.messageTemplate.findMany({
      where: { isActive: true, deletedAt: null },
      select: { kind: true, channel: true },
    });
    const have = new Set(rows.map((r) => `${r.kind}:${r.channel}`));
    const out: { kind: TemplateKind; channel: OrderMessageChannel }[] = [];
    for (const kind of TEMPLATE_KINDS) {
      for (const channel of CHANNELS) {
        if (!have.has(`${kind}:${channel}`)) out.push({ kind, channel });
      }
    }
    return out;
  }

  private validate(dto: { kind: string; channel: string }) {
    const kind = TEMPLATE_KINDS.find((k) => k === dto.kind);
    if (!kind) throw new BadRequestException(`Unknown message kind "${dto.kind}"`);
    const channel = CHANNELS.find((c) => c === dto.channel);
    if (!channel) throw new BadRequestException('Channel must be SMS or EMAIL');
    return { kind, channel };
  }
}
