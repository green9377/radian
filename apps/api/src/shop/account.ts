import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { DeliveryZone, OccasionType, OtpPurpose, Relationship } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';
import { Public } from '../auth/auth.guard';
import { OtpService } from '../messaging/otp.service';
import { MessagingModule } from '../messaging/messaging.controller';
import { GoogleSignInService } from './google-signin';
import { AdministrationModule } from '../administration/administration.module';
import { IntegrationsService } from '../administration/integrations.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  THE STOREFRONT ACCOUNT — `/shop/account/*`   (owner, 8 Sep 2026)

  Everything the customer's account shows used to be invented in the browser:
  the name "Nusrat Jahan", two Banani addresses, a list of orders nobody ever
  placed. The login itself was real — the code is checked by the server — but
  what appeared afterwards was a demo, and the owner's instruction was plain:
  *"sob jen real hoy, kon mock jen na hoy."*

  ── HOW SOMEBODY IS KNOWN HERE ───────────────────────────────────────────
  A `CustomerSession` row, issued only after the one-time code (or Google) has
  been verified, and only ever handed back as a raw token the browser keeps.
  The table stores nothing but its SHA-256, so a copy of the database cannot
  sign anybody in. Thirty days (the owner's ruling).

  ⚠️ The header is `Authorization: Bearer <token>` and NOT the admin's
  `x-radian-token`. Two different populations, two different doors: a
  customer's session must never be mistaken for a staff session by any guard,
  in either direction.

  ── WHAT IS READ, AND WHAT IS OWNED ──────────────────────────────────────
  Nothing here is a new store of data. The customer, the orders, the credit
  ledger and the reviews are owned by their own modules and read through a
  foreign key (One Data One Owner). This surface owns exactly two tables —
  the session, and the wishlist that used to live in a browser.

  ── THE ORDERS THAT COME BACK ────────────────────────────────────────────
  Not only the ones placed while signed in. The owner's ruling: an order
  placed as a guest belongs to the person whose phone is on it, and that phone
  is the one the code was sent to. So the list is `customerId = me` OR
  `senderPhone = my verified phone`.
  ═══════════════════════════════════════════════════════════════════════════
*/

const SESSION_DAYS = 30;

/** the browser's copy of the session; the table keeps only the hash of this */
function newToken(): string {
  return randomBytes(32).toString('hex');
}
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface CustomerRequest extends Request {
  customer?: { id: string; phone: string | null; name: string };
}

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  /* ─────────────────── the session ─────────────────── */

  async issue(customerId: string, userAgent?: string): Promise<string> {
    const raw = newToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.db.customerSession.create({
      data: { customerId, tokenHash: hashToken(raw), expiresAt, userAgent: userAgent?.slice(0, 300) },
    });
    return raw;
  }

  /**
   * Who is calling — or nobody.
   *
   * ⚠️ A blocked customer is refused here rather than at each screen: one
   * place to say no is one place to get it wrong.
   */
  async resolve(raw?: string) {
    if (!raw || raw.length < 32) return null;
    const row = await this.prisma.db.customerSession.findUnique({
      where: { tokenHash: hashToken(raw) },
      include: { customer: true },
    });
    if (!row || row.revokedAt || row.expiresAt < new Date()) return null;
    if (row.customer.deletedAt || row.customer.status === 'BLOCKED') return null;
    /*  Touched at most once a day: a write on every single request would turn
        a read-only page into a write to the database.  */
    if (Date.now() - row.lastSeenAt.getTime() > 24 * 60 * 60 * 1000) {
      await this.prisma.db.customerSession.update({
        where: { id: row.id },
        data: { lastSeenAt: new Date() },
      });
    }
    return row.customer;
  }

  async revoke(raw: string) {
    await this.prisma.db.customerSession.updateMany({
      where: { tokenHash: hashToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  /* ─────────────────── signing in ─────────────────── */

  /**
   * A verified phone becomes a session.
   *
   * The customer record is CREATED here when there is none — that is what
   * makes "log in, then order" work as well as "order, then log in". The name
   * is a placeholder until they type their own; the phone is the identity.
   */
  async loginWithPhone(phoneRaw: string, code: string, userAgent?: string) {
    const phone = this.e164(phoneRaw);
    if (!phone) throw new BadRequestException('Enter a valid Bangladeshi number.');

    const ok = await this.otpOk(phone, code);
    if (!ok) throw new UnauthorizedException('That code is wrong or has expired.');

    let customer = await this.prisma.db.customer.findFirst({ where: { phone } });
    if (customer?.deletedAt) {
      /*  They deleted the account and came back. The row is reopened rather
          than duplicated — the orders on it are the shop's books.  */
      customer = await this.prisma.db.customer.update({
        where: { id: customer.id },
        data: { deletedAt: null },
      });
    }
    if (!customer) {
      /*  The last order from this number is the best name we have; a stranger
          gets "Guest" until they type one.  */
      const lastOrder = await this.prisma.db.order.findFirst({
        where: { senderPhone: phone, deletedAt: null },
        orderBy: { placedAt: 'desc' },
        select: { senderName: true, senderEmail: true },
      });
      customer = await this.prisma.db.customer.create({
        data: {
          name: lastOrder?.senderName?.trim() || 'Guest',
          phone,
          email: lastOrder?.senderEmail ?? null,
          whatsappVerified: false,
        },
      });
    }
    if (customer.status === 'BLOCKED')
      throw new UnauthorizedException('This account cannot sign in. Please contact us.');

    const token = await this.issue(customer.id, userAgent);
    return { ok: true as const, token, customer: this.publicProfile(customer) };
  }

  /** the one-time code, checked by the module that owns it */
  private async otpOk(phone: string, code: string): Promise<boolean> {
    const purposes: OtpPurpose[] = [OtpPurpose.LOGIN, OtpPurpose.CHECKOUT];
    for (const p of purposes) {
      const r = await this.otp.verify(phone, p, code);
      if (r.ok) return true;
    }
    return false;
  }

  /** set by the module — kept off the constructor so the service stays testable */
  private otp!: OtpService;
  useOtp(otp: OtpService) {
    this.otp = otp;
  }

  e164(raw: string): string | null {
    let s = (raw ?? '').replace(/[\s\-().]/g, '').replace(/^\+/, '');
    s = s.replace(/^00/, '').replace(/^880/, '').replace(/^0/, '');
    return /^1[3-9]\d{8}$/.test(s) ? `+880${s}` : null;
  }

  /* ─────────────────── the profile ─────────────────── */

  publicProfile(c: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    joinedAt: Date;
    imageUrl: string | null;
    birthday: string | null;
    ownAddressLine: string | null;
    ownAddressZone: DeliveryZone | null;
  }) {
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      joinedAt: c.joinedAt.toISOString(),
      imageUrl: c.imageUrl,
      birthday: c.birthday,
      ownAddress: c.ownAddressLine
        ? { line: c.ownAddressLine, zone: c.ownAddressZone ?? DeliveryZone.DHAKA }
        : null,
    };
  }

  async me(customerId: string) {
    const c = await this.prisma.db.customer.findUnique({ where: { id: customerId } });
    if (!c) throw new UnauthorizedException('Please sign in again');
    const [orderCount, credit] = await Promise.all([
      this.prisma.db.order.count({ where: this.orderWhere(c.id, c.phone) }),
      this.creditBalance(c.id),
    ]);
    return { ...this.publicProfile(c), orderCount, creditPaisa: credit.balancePaisa };
  }

  async updateMe(
    customerId: string,
    b: { name?: string; email?: string; birthday?: string; ownAddressLine?: string; ownAddressZone?: string; imageUrl?: string },
  ) {
    const name = b.name?.trim();
    if (name !== undefined && name.length < 2)
      throw new BadRequestException('Please give a name we can call you by.');
    const email = b.email?.trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email))
      throw new BadRequestException("That email doesn't look right.");
    /*  ⚠️ THE PHONE IS NOT EDITABLE HERE, and that is deliberate: it is the
        identity a session was issued against. Changing it would mean proving
        the new one with a code — its own flow, not a profile field.  */
    const c = await this.prisma.db.customer.update({
      where: { id: customerId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email: email || null } : {}),
        ...(b.birthday !== undefined ? { birthday: b.birthday?.trim() || null } : {}),
        ...(b.imageUrl !== undefined ? { imageUrl: b.imageUrl?.trim() || null } : {}),
        ...(b.ownAddressLine !== undefined
          ? { ownAddressLine: b.ownAddressLine?.trim() || null }
          : {}),
        ...(b.ownAddressZone !== undefined ? { ownAddressZone: this.zone(b.ownAddressZone) } : {}),
      },
    });
    return this.publicProfile(c);
  }

  zone(v?: string | null): DeliveryZone {
    const s = (v ?? '').toUpperCase();
    return s === 'BANGLADESH' || s === 'NATIONWIDE' ? DeliveryZone.BANGLADESH : DeliveryZone.DHAKA;
  }

  /**
   * The number, proved with a code, put on an account that had none.
   *
   * ⚠️ If another customer already holds that number, this is refused rather
   * than merged. Two accounts becoming one is a decision about somebody's
   * order history and their store credit — the owner's call, not a side
   * effect of a profile screen.
   */
  async attachPhone(customerId: string, phoneRaw: string, code: string) {
    const phone = this.e164(phoneRaw);
    if (!phone) throw new BadRequestException('Enter a valid Bangladeshi number.');
    if (!(await this.otpOk(phone, code)))
      throw new UnauthorizedException('That code is wrong or has expired.');

    const taken = await this.prisma.db.customer.findFirst({
      where: { phone, NOT: { id: customerId } },
      select: { id: true },
    });
    if (taken)
      throw new BadRequestException(
        'That number already belongs to another account. Sign in with the number instead.',
      );

    const c = await this.prisma.db.customer.update({
      where: { id: customerId },
      data: { phone },
    });
    return this.publicProfile(c);
  }

  /* ─────────────────── the orders ─────────────────── */

  /**
   * DEC-ACC-002 — mine, and everything ordered from my verified number.
   *
   * ⚠️ A Google account that has never ordered has no number yet, and then
   * matching on `senderPhone` must not happen at all: `senderPhone: null`
   * would quietly match nothing useful, and an empty string would match
   * somebody else's rubbish row. Without a phone, only what is linked to this
   * customer counts.
   */
  private orderWhere(customerId: string, phone: string | null) {
    return {
      deletedAt: null,
      ...(phone ? { OR: [{ customerId }, { senderPhone: phone }] } : { customerId }),
    };
  }

  async orders(customerId: string, phone: string | null) {
    const rows = await this.prisma.db.order.findMany({
      where: this.orderWhere(customerId, phone),
      orderBy: { placedAt: 'desc' },
      take: 100,
      include: {
        lines: {
          where: { deletedAt: null },
          include: { product: { select: { slug: true, name: true, images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' }, take: 1 } } } },
        },
      },
    });
    return rows.map((o) => this.orderCard(o));
  }

  async order(customerId: string, phone: string | null, id: string) {
    const o = await this.prisma.db.order.findFirst({
      where: { id, ...this.orderWhere(customerId, phone) },
      include: {
        lines: {
          where: { deletedAt: null },
          include: { product: { select: { slug: true, name: true, images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' }, take: 1 } } } },
        },
        photos: { where: { deletedAt: null }, orderBy: { capturedAt: 'asc' } },
      },
    });
    if (!o) throw new BadRequestException('That order is not on this account.');
    return {
      ...this.orderCard(o),
      address: o.address,
      deliveryNotes: o.deliveryNotes,
      recipientName: o.recipientName,
      recipientPhone: o.recipientPhone,
      giftMessage: o.giftMessage,
      slotLabel: o.slotLabel,
      subtotalPaisa: o.subtotalPaisa,
      discountPaisa: o.discountPaisa,
      deliveryPaisa: o.deliveryPaisa,
      photos: o.photoUpdates
        ? o.photos.map((p) => ({ kind: p.kind, url: p.url, at: p.capturedAt.toISOString() }))
        : [],
    };
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private orderCard(o: any) {
    return {
      id: o.id as string,
      orderNo: o.orderNo as string,
      placedAt: (o.placedAt as Date).toISOString(),
      status: o.salesStatus as string,
      deliveryStatus: o.deliveryStatus as string,
      paymentStatus: o.paymentStatus as string,
      isGift: o.isGift as boolean,
      recipientName: (o.recipientName as string | null) ?? null,
      methodLabel: (o.methodLabel as string | null) ?? '',
      date: (o.date as string | null) ?? null,
      etaLabel: (o.etaLabel as string | null) ?? '',
      totalPaisa: o.totalPaisa as number,
      lines: (o.lines ?? []).map((l: any) => ({
        id: l.id as string,
        productId: l.productId as string,
        slug: (l.product?.slug as string) ?? '',
        name: (l.name as string) ?? (l.product?.name as string) ?? '',
        imageUrl: (l.product?.images?.[0]?.url as string | null) ?? null,
        variantLabel: (l.variantLabel as string | null) ?? null,
        sizeLabel: (l.sizeLabel as string | null) ?? null,
        qty: l.qty as number,
        linePaisa: l.linePaisa as number,
      })),
    };
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  /* ─────────────────── the address book ───────────────────
     These are `Recipient` rows — the module that already owns "people this
     customer sends to". The account does not keep a second copy; it is the
     same book the admin sees, and the same one checkout will read. */

  async addresses(customerId: string) {
    const rows = await this.prisma.db.recipient.findMany({
      where: { customerId, deletedAt: null },
      orderBy: [{ isFavorite: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      relationship: r.relationship,
      zone: r.zone,
      line: r.addressLine,
      note: r.note,
      isDefault: r.isFavorite,
    }));
  }

  async addAddress(customerId: string, b: Record<string, unknown>) {
    const name = String(b.name ?? '').trim();
    const phone = String(b.phone ?? '').trim();
    const line = String(b.line ?? '').trim();
    if (name.length < 2) throw new BadRequestException('Who is this address for?');
    if (line.length < 10) throw new BadRequestException('Add house, road and area.');
    const r = await this.prisma.db.recipient.create({
      data: {
        customerId,
        name,
        phone,
        relationship: this.relationship(b.relationship),
        zone: this.zone(String(b.zone ?? '')),
        addressLine: line,
        note: (b.note as string)?.trim() || null,
        isFavorite: b.isDefault === true,
      },
    });
    if (r.isFavorite) await this.clearOtherDefaults(customerId, r.id);
    return this.addresses(customerId);
  }

  async editAddress(customerId: string, id: string, b: Record<string, unknown>) {
    await this.ownAddress(customerId, id);
    await this.prisma.db.recipient.update({
      where: { id },
      data: {
        ...(b.name !== undefined ? { name: String(b.name).trim() } : {}),
        ...(b.phone !== undefined ? { phone: String(b.phone).trim() } : {}),
        ...(b.line !== undefined ? { addressLine: String(b.line).trim() } : {}),
        ...(b.note !== undefined ? { note: String(b.note).trim() || null } : {}),
        ...(b.zone !== undefined ? { zone: this.zone(String(b.zone)) } : {}),
        ...(b.relationship !== undefined
          ? { relationship: this.relationship(b.relationship) }
          : {}),
        ...(b.isDefault !== undefined ? { isFavorite: b.isDefault === true } : {}),
      },
    });
    if (b.isDefault === true) await this.clearOtherDefaults(customerId, id);
    return this.addresses(customerId);
  }

  async removeAddress(customerId: string, id: string) {
    await this.ownAddress(customerId, id);
    /*  Soft delete, house rule 5 — a delivered order points at this row.  */
    await this.prisma.db.recipient.update({ where: { id }, data: { deletedAt: new Date() } });
    return this.addresses(customerId);
  }

  private async ownAddress(customerId: string, id: string) {
    const r = await this.prisma.db.recipient.findFirst({
      where: { id, customerId, deletedAt: null },
      select: { id: true },
    });
    if (!r) throw new BadRequestException('That address is not on this account.');
    return r;
  }

  private async clearOtherDefaults(customerId: string, keepId: string) {
    await this.prisma.db.recipient.updateMany({
      where: { customerId, id: { not: keepId }, isFavorite: true, deletedAt: null },
      data: { isFavorite: false },
    });
  }

  /** the enum is lower-case in this schema; anything unknown is "other" */
  relationship(v: unknown): Relationship {
    const s = String(v ?? '').toLowerCase();
    return (Object.values(Relationship) as string[]).includes(s)
      ? (s as Relationship)
      : Relationship.other;
  }

  /* ─────────────────── the dates we remember ───────────────────
     `RecipientOccasion` — owned by Customer Management, and the same rows
     Marketing already reads to send the reminder. */

  async reminders(customerId: string) {
    const rows = await this.prisma.db.recipientOccasion.findMany({
      where: { deletedAt: null, recipient: { customerId, deletedAt: null } },
      include: { recipient: { select: { id: true, name: true } } },
      orderBy: { date: 'asc' },
    });
    return rows.map((o) => ({
      id: o.id,
      recipientId: o.recipient.id,
      who: o.recipient.name,
      type: o.type,
      label: o.label,
      date: o.date,
      year: o.year,
    }));
  }

  async addReminder(customerId: string, b: Record<string, unknown>) {
    const recipientId = String(b.recipientId ?? '');
    await this.ownAddress(customerId, recipientId);
    const date = String(b.date ?? '').trim();
    if (!/^\d{2}-\d{2}$/.test(date))
      throw new BadRequestException('A date looks like MM-DD, for example 09-20.');
    await this.prisma.db.recipientOccasion.create({
      data: {
        recipientId,
        type: this.occasion(b.type),
        date,
        year: typeof b.year === 'number' ? b.year : null,
        label: (b.label as string)?.trim() || null,
      },
    });
    return this.reminders(customerId);
  }

  async removeReminder(customerId: string, id: string) {
    const row = await this.prisma.db.recipientOccasion.findFirst({
      where: { id, deletedAt: null, recipient: { customerId } },
      select: { id: true },
    });
    if (!row) throw new BadRequestException('That date is not on this account.');
    await this.prisma.db.recipientOccasion.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return this.reminders(customerId);
  }

  occasion(v: unknown): OccasionType {
    const s = String(v ?? '').toUpperCase();
    return (Object.values(OccasionType) as string[]).includes(s)
      ? (s as OccasionType)
      : OccasionType.CUSTOM;
  }

  /* ─────────────────── the wishlist ─────────────────── */

  async wishlist(customerId: string) {
    const rows = await this.prisma.db.wishlistItem.findMany({
      where: { customerId, deletedAt: null, product: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            slug: true,
            name: true,
            sellingPricePaisa: true,
            /*  the first photo, the same one the card on the shop uses  */
            images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        },
      },
    });
    return rows.map((w) => ({
      productId: w.product.id,
      slug: w.product.slug,
      name: w.product.name,
      imageUrl: w.product.images[0]?.url ?? null,
      pricePaisa: w.product.sellingPricePaisa,
    }));
  }

  async addWish(customerId: string, slugOrId: string) {
    const p = await this.prisma.db.product.findFirst({
      where: { OR: [{ id: slugOrId }, { slug: slugOrId }], deletedAt: null },
      select: { id: true },
    });
    if (!p) throw new BadRequestException('That product no longer exists.');
    await this.prisma.db.wishlistItem.upsert({
      where: { customerId_productId: { customerId, productId: p.id } },
      create: { customerId, productId: p.id },
      update: { deletedAt: null },
    });
    return this.wishlist(customerId);
  }

  async removeWish(customerId: string, productId: string) {
    await this.prisma.db.wishlistItem.updateMany({
      where: { customerId, productId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return this.wishlist(customerId);
  }

  /* ─────────────────── store credit ───────────────────
     DEC-RTN-013 — Finance owns the ledger; this only adds it up and shows it. */

  async creditBalance(customerId: string) {
    const rows = await this.prisma.db.customerCredit.findMany({
      where: { customerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const balancePaisa = rows.reduce((sum, r) => sum + r.amountPaisa, 0);
    return {
      balancePaisa,
      lines: rows.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        kind: r.kind,
        amountPaisa: r.amountPaisa,
        note: r.note,
        refType: r.refType,
        refId: r.refId,
      })),
    };
  }

  /* ─────────────────── reviews ───────────────────
     Two halves, and the first one is the point: every delivered product that
     has not been reviewed yet, asked for by name (owner, 8 Sep 2026). */

  async reviews(customerId: string, phone: string | null) {
    const written = await this.prisma.db.review.findMany({
      where: { customerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { slug: true, name: true, images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' }, take: 1 } } } },
    });

    const delivered = await this.prisma.db.order.findMany({
      where: {
        ...this.orderWhere(customerId, phone),
        deliveryStatus: 'delivered',
      },
      orderBy: { placedAt: 'desc' },
      take: 40,
      include: {
        lines: {
          where: { deletedAt: null },
          include: { product: { select: { id: true, slug: true, name: true, images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' }, take: 1 } } } },
        },
      },
    });

    const reviewed = new Set(written.map((r) => r.productId));
    const waiting: {
      productId: string;
      slug: string;
      name: string;
      imageUrl: string | null;
      orderNo: string;
      orderId: string;
      deliveredAt: string | null;
      forWhom: string | null;
    }[] = [];
    for (const o of delivered) {
      for (const l of o.lines) {
        if (!l.product || reviewed.has(l.product.id)) continue;
        if (waiting.some((w) => w.productId === l.product!.id)) continue;
        waiting.push({
          productId: l.product.id,
          slug: l.product.slug,
          name: l.product.name,
          imageUrl: l.product.images[0]?.url ?? null,
          orderNo: o.orderNo,
          orderId: o.id,
          deliveredAt: o.deliveredAt?.toISOString() ?? null,
          forWhom: o.isGift ? o.recipientName : null,
        });
      }
    }

    return {
      waiting,
      written: written.map((r) => ({
        id: r.id,
        productId: r.productId,
        slug: r.product?.slug ?? '',
        name: r.product?.name ?? '',
        imageUrl: r.product?.images?.[0]?.url ?? null,
        rating: r.rating,
        body: r.body,
        status: r.status,
        at: r.createdAt.toISOString(),
      })),
    };
  }

  /* ─────────────────── leaving ───────────────────
     What goes, and what the shop must keep. Orders are the books; the law does
     not let them vanish, so the person is unlinked from them instead. */

  async deleteAccount(customerId: string) {
    const now = new Date();
    await this.prisma.db.$transaction([
      this.prisma.db.customerSession.updateMany({
        where: { customerId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.db.wishlistItem.updateMany({
        where: { customerId, deletedAt: null },
        data: { deletedAt: now },
      }),
      this.prisma.db.recipient.updateMany({
        where: { customerId, deletedAt: null },
        data: { deletedAt: now },
      }),
      this.prisma.db.customer.update({
        where: { id: customerId },
        data: {
          deletedAt: now,
          name: 'Deleted customer',
          email: null,
          birthday: null,
          ownAddressLine: null,
          imageUrl: null,
          note: 'Deleted by the customer from the account page',
        },
      }),
    ]);
    return { ok: true };
  }
}

/* ═══════════════ the guard ═══════════════
   Marked `@Public()` for the ADMIN guard — this door is not for staff — and
   then closed again by this one, which asks for a customer session. */

@Injectable()
export class CustomerGuard implements CanActivate {
  constructor(private readonly svc: AccountService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<CustomerRequest>();
    const raw = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
    const customer = await this.svc.resolve(raw);
    if (!customer) throw new UnauthorizedException('Please sign in again');
    req.customer = { id: customer.id, phone: customer.phone, name: customer.name };
    return true;
  }
}

@Public()
@Controller('shop/account')
export class AccountController {
  constructor(
    private readonly svc: AccountService,
    private readonly google: GoogleSignInService,
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
  ) {}

  /* ── signing in ── */

  @Post('login')
  login(@Body() b: { phone?: string; code?: string }, @Req() req: Request) {
    return this.svc.loginWithPhone(
      b?.phone ?? '',
      b?.code ?? '',
      req.headers['user-agent'] as string | undefined,
    );
  }

  /**
   * Google.
   *
   * ⚠️ AN EMAIL WE HAVE NEVER SEEN IS STILL A SIGN-IN (owner, 8 Sep 2026:
   * *"login kre dhuke pore order dite parbe, somossa nai"*). It used to be
   * refused — "we have no order from that email yet" — which made the account
   * a reward for having ordered, exactly backwards for a shop that wants the
   * order. The customer record is created here from what Google vouched for,
   * with no phone; the number arrives when they prove it on the profile, or
   * the first time they order.
   */
  @Post('login/google')
  async loginGoogle(@Body() b: { credential?: string }, @Req() req: Request) {
    const g = await this.google.signIn(b?.credential ?? '');
    const email = g.customer.email.trim().toLowerCase();

    /*  The phone first when Google's answer carried one (an existing
        customer), otherwise the email — and only then a new record.  */
    let customer = g.customer.phone
      ? await this.prisma.db.customer.findFirst({ where: { phone: g.customer.phone } })
      : null;
    if (!customer)
      customer = await this.prisma.db.customer.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });

    if (customer?.deletedAt)
      customer = await this.prisma.db.customer.update({
        where: { id: customer.id },
        data: { deletedAt: null },
      });

    if (!customer)
      customer = await this.prisma.db.customer.create({
        data: {
          name: g.customer.name?.trim() || email.split('@')[0],
          email,
          phone: null,
          whatsappVerified: false,
        },
      });

    if (customer.status === 'BLOCKED')
      throw new UnauthorizedException('This account cannot sign in. Please contact us.');

    /*  Google verified the email; if the record had none, it has one now.  */
    if (!customer.email)
      customer = await this.prisma.db.customer.update({
        where: { id: customer.id },
        data: { email },
      });

    const token = await this.svc.issue(customer.id, req.headers['user-agent'] as string | undefined);
    return { ok: true as const, token, customer: this.svc.publicProfile(customer) };
  }

  /**
   * Adding the phone to an account that signed in with Google.
   *
   * ⚠️ A CODE IS REQUIRED, always. A phone number typed into a profile is a
   * claim, not a fact — and this number is what the order list, the delivery
   * and the store credit are matched on. It is proved the same way a login is.
   */
  @UseGuards(CustomerGuard)
  @Post('me/phone')
  addPhone(@Req() req: CustomerRequest, @Body() b: { phone?: string; code?: string }) {
    return this.svc.attachPhone(req.customer!.id, b?.phone ?? '', b?.code ?? '');
  }

  @UseGuards(CustomerGuard)
  @Post('logout')
  logout(@Req() req: Request) {
    const raw = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
    return this.svc.revoke(raw);
  }

  /* ── the profile ── */

  @UseGuards(CustomerGuard)
  @Get('me')
  me(@Req() req: CustomerRequest) {
    return this.svc.me(req.customer!.id);
  }

  @UseGuards(CustomerGuard)
  @Patch('me')
  updateMe(@Req() req: CustomerRequest, @Body() b: Record<string, string>) {
    return this.svc.updateMe(req.customer!.id, b);
  }

  /* ── orders ── */

  @UseGuards(CustomerGuard)
  @Get('orders')
  orders(@Req() req: CustomerRequest) {
    return this.svc.orders(req.customer!.id, req.customer!.phone);
  }

  @UseGuards(CustomerGuard)
  @Get('orders/:id')
  order(@Req() req: CustomerRequest, @Param('id') id: string) {
    return this.svc.order(req.customer!.id, req.customer!.phone, id);
  }

  /* ── the address book ── */

  @UseGuards(CustomerGuard)
  @Get('addresses')
  addresses(@Req() req: CustomerRequest) {
    return this.svc.addresses(req.customer!.id);
  }

  @UseGuards(CustomerGuard)
  @Post('addresses')
  addAddress(@Req() req: CustomerRequest, @Body() b: Record<string, unknown>) {
    return this.svc.addAddress(req.customer!.id, b ?? {});
  }

  @UseGuards(CustomerGuard)
  @Patch('addresses/:id')
  editAddress(
    @Req() req: CustomerRequest,
    @Param('id') id: string,
    @Body() b: Record<string, unknown>,
  ) {
    return this.svc.editAddress(req.customer!.id, id, b ?? {});
  }

  @UseGuards(CustomerGuard)
  @Delete('addresses/:id')
  removeAddress(@Req() req: CustomerRequest, @Param('id') id: string) {
    return this.svc.removeAddress(req.customer!.id, id);
  }

  /* ── the dates we remember ── */

  @UseGuards(CustomerGuard)
  @Get('reminders')
  reminders(@Req() req: CustomerRequest) {
    return this.svc.reminders(req.customer!.id);
  }

  @UseGuards(CustomerGuard)
  @Post('reminders')
  addReminder(@Req() req: CustomerRequest, @Body() b: Record<string, unknown>) {
    return this.svc.addReminder(req.customer!.id, b ?? {});
  }

  @UseGuards(CustomerGuard)
  @Delete('reminders/:id')
  removeReminder(@Req() req: CustomerRequest, @Param('id') id: string) {
    return this.svc.removeReminder(req.customer!.id, id);
  }

  /* ── wishlist ── */

  @UseGuards(CustomerGuard)
  @Get('wishlist')
  wishlist(@Req() req: CustomerRequest) {
    return this.svc.wishlist(req.customer!.id);
  }

  @UseGuards(CustomerGuard)
  @Post('wishlist')
  addWish(@Req() req: CustomerRequest, @Body() b: { slug?: string; productId?: string }) {
    return this.svc.addWish(req.customer!.id, b?.productId || b?.slug || '');
  }

  @UseGuards(CustomerGuard)
  @Delete('wishlist/:productId')
  removeWish(@Req() req: CustomerRequest, @Param('productId') productId: string) {
    return this.svc.removeWish(req.customer!.id, productId);
  }

  /* ── store credit ── */

  @UseGuards(CustomerGuard)
  @Get('credit')
  credit(@Req() req: CustomerRequest) {
    return this.svc.creditBalance(req.customer!.id);
  }

  /* ── reviews ── */

  @UseGuards(CustomerGuard)
  @Get('reviews')
  reviews(@Req() req: CustomerRequest) {
    return this.svc.reviews(req.customer!.id, req.customer!.phone);
  }

  /* ── leaving ── */

  @UseGuards(CustomerGuard)
  @Delete('')
  deleteAccount(@Req() req: CustomerRequest) {
    return this.svc.deleteAccount(req.customer!.id);
  }
}

@Module({
  imports: [PrismaModule, MessagingModule, AdministrationModule],
  providers: [AccountService, CustomerGuard, GoogleSignInService],
  controllers: [AccountController],
  exports: [AccountService],
})
export class AccountModule {
  constructor(svc: AccountService, otp: OtpService) {
    svc.useOtp(otp);
  }
}
