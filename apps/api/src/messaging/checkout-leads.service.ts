import { Injectable, Logger } from '@nestjs/common';
import { CheckoutLeadStatus, CheckoutStage, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TPL, WhatsAppCloudService } from '../common/whatsapp-cloud';
import { MessagingSettingsService } from './messaging-settings.service';

/*
  Someone who typed into checkout and never submitted.

  This table holds phone numbers of people who bought nothing, so three things
  are not optional: the opt-out list is checked before any message, rows are
  deleted once past retention, and card-shaped fields never get stored. A lead
  that cannot be written is a lost opportunity; a checkout that breaks is a
  lost order, so everything here fails soft.
*/

/** What the storefront sends. */
export interface LeadPing {
  clientKey: string;
  name?: string;
  phone?: string;
  email?: string;
  stage?: CheckoutStage;
  draft?: Record<string, unknown>;
  cart?: unknown;
  itemCount?: number;
  totalPaisa?: number;
}

/*
  Never stored, whatever the browser sends. The storefront's good intentions
  are not a security boundary.
*/
const NEVER_STORE = [
  'card', 'cardnumber', 'cardno', 'cvv', 'cvc', 'pin', 'otp',
  'password', 'expiry', 'exp', 'securitycode',
];

@Injectable()
export class CheckoutLeadsService {
  private readonly log = new Logger('CheckoutLeads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly wa: WhatsAppCloudService,
    private readonly settings: MessagingSettingsService,
  ) {}

  private scrub(draft?: Record<string, unknown>) {
    if (!draft) return undefined;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(draft)) {
      const key = k.toLowerCase().replace(/[^a-z]/g, '');
      if (NEVER_STORE.some((bad) => key.includes(bad))) continue;
      if (typeof v === 'string' && v.length > 2000) continue;
      out[k] = v;
    }
    return out;
  }

  /** Called by the storefront as the customer types, throttled. */
  async ping(p: LeadPing) {
    const s = await this.settings.get();
    if (!s.recoveryEnabled || !s.abandonedEnabled) return { ok: true, stored: false };
    if (!p.clientKey?.trim()) return { ok: true, stored: false };

    const data = {
      name: p.name?.trim() || undefined,
      phone: p.phone?.replace(/\s/g, '') || undefined,
      email: p.email?.trim() || undefined,
      stage: p.stage ?? CheckoutStage.CART,
      draft: this.scrub(p.draft) as Prisma.InputJsonValue | undefined,
      cart: (p.cart ?? undefined) as Prisma.InputJsonValue | undefined,
      itemCount: p.itemCount ?? 0,
      totalPaisa: p.totalPaisa ?? 0,
      lastSeenAt: new Date(),
    };

    try {
      await this.prisma.db.checkoutLead.upsert({
        where: { clientKey: p.clientKey.trim() },
        create: { clientKey: p.clientKey.trim(), ...data },
        // Reopening checkout after an order must not make this open again.
        update: { ...data },
      });
      return { ok: true, stored: true };
    } catch (e) {
      this.log.warn(`lead ping failed: ${e instanceof Error ? e.message : e}`);
      return { ok: true, stored: false };
    }
  }

  /** The order went through, so this browser's lead is no longer abandoned. */
  async markConverted(clientKey: string | undefined, orderId: string, phone?: string) {
    try {
      const where: Prisma.CheckoutLeadWhereInput = clientKey?.trim()
        ? { clientKey: clientKey.trim() }
        : // Fall back to the phone: started on a phone, finished on a laptop.
          { phone: phone?.replace(/\s/g, ''), status: CheckoutLeadStatus.OPEN };
      if (!clientKey?.trim() && !phone) return;

      await this.prisma.db.checkoutLead.updateMany({
        where: { ...where, deletedAt: null },
        data: { status: CheckoutLeadStatus.CONVERTED, orderId },
      });
    } catch (e) {
      this.log.warn(`markConverted failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  /**
   * For the /cart/{id} page. Returns only what was left behind — no name,
   * phone or address, because the link travels by WhatsApp.
   */
  async savedCart(id: string) {
    try {
      const l = await this.prisma.db.checkoutLead.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, cart: true, itemCount: true, totalPaisa: true, status: true },
      });
      if (!l) return null;
      return {
        found: true,
        cart: l.cart,
        itemCount: l.itemCount,
        totalPaisa: l.totalPaisa,
        // Already ordered — the page says so instead of offering a restore.
        alreadyOrdered: l.status === CheckoutLeadStatus.CONVERTED,
      };
    } catch {
      return null;
    }
  }

  /* ---- sweep ---- */

  /** Messages leads that have gone quiet. */
  async sweepAbandoned(limit = 25) {
    const s = await this.settings.get();
    if (!s.recoveryEnabled || !s.abandonedEnabled) return { picked: 0, sent: 0, skipped: 0, failed: 0 };

    const cutoff = new Date(Date.now() - s.abandonedAfterMinutes * 60_000);
    const rows = await this.prisma.db.checkoutLead.findMany({
      where: {
        status: CheckoutLeadStatus.OPEN,
        lastSeenAt: { lte: cutoff },
        deletedAt: null,
      },
      orderBy: { lastSeenAt: 'asc' },
      take: limit,
    });

    let sent = 0, skipped = 0, failed = 0;
    const support = await this.settings.supportPhone();

    for (const l of rows) {
      const reason = await this.skipReason(l.phone, l.itemCount);
      if (reason) {
        await this.prisma.db.checkoutLead.update({
          where: { id: l.id },
          data: { status: CheckoutLeadStatus.SKIPPED, skipReason: reason },
        });
        skipped++;
        continue;
      }

      const r = await this.wa.sendRaw(
        l.phone as string,
        this.wa.template(TPL.abandoned, [l.name?.trim() || 'there', support], 'en', l.id),
        { origin: 'abandoned-cart', kind: 'abandoned-cart' },
      );
      await this.prisma.db.checkoutLead.update({
        where: { id: l.id },
        data: r.ok
          ? { status: CheckoutLeadStatus.MESSAGED, messageSentAt: new Date(), messageError: null }
          : !r.configured
            ? { status: CheckoutLeadStatus.SKIPPED, skipReason: 'WhatsApp is not connected' }
            : { messageError: (r.error ?? 'unknown').slice(0, 500) },
      });
      if (r.ok) sent++;
      else if (!r.configured) skipped++;
      else failed++;
    }

    return { picked: rows.length, sent, skipped, failed };
  }

  /**
   * Marketing owns the opt-out list; this only reads it. If the check itself
   * fails we do not send — losing an opportunity beats messaging someone who
   * asked not to be messaged.
   */
  private async skipReason(phone: string | null, itemCount: number): Promise<string | null> {
    if (!phone?.trim()) return 'no phone was typed';
    if (itemCount < 1) return 'cart was empty';

    try {
      // Consent restored is a soft delete, so deletedAt must be checked.
      const optedOut = await this.prisma.db.marketingOptOut.findFirst({
        where: {
          deletedAt: null,
          customer: { phone: phone.trim(), deletedAt: null },
        },
        select: { id: true },
      });
      if (optedOut) return 'customer has opted out of marketing';
    } catch {
      return 'could not check the opt-out list';
    }
    return null;
  }

  /** Deletes leads past their retention window. */
  async purgeOld() {
    const s = await this.settings.get();
    const cutoff = new Date(Date.now() - s.leadRetentionDays * 86_400_000);
    /*
      A real delete, not deletedAt — a deliberate exception to soft-delete.
      These are strangers' phone numbers, and "deleted" should mean deleted.
      Converted rows stay: an order depends on them.
    */
    const r = await this.prisma.db.checkoutLead.deleteMany({
      where: { createdAt: { lt: cutoff }, status: { not: CheckoutLeadStatus.CONVERTED } },
    });
    return { deleted: r.count, olderThanDays: s.leadRetentionDays };
  }
}
