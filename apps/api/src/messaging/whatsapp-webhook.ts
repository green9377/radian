import {
  Body, Controller, Get, Headers, HttpCode, Injectable, Logger, Post, Query, Req,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import {
  ConversationStatus, InboxChannel, MessageAuthor, MessageDirection,
  OrderMessageStatus, Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../administration/integrations.service';
import { Public } from '../auth/auth.guard';

/*
  Everything WhatsApp sends us: customer replies, and delivery receipts for
  what we sent.

  Two things make this endpoint unusual. It is public, because Meta calls it,
  so the signature is the only proof a request is really from Meta. And it must
  answer 200 fast — Meta retries anything slow or failed, so work that can wait
  happens after the response, and a message we cannot understand is still
  acknowledged rather than retried forever.

  Duplicates are expected. Message.externalMessageId is unique, so a retried
  delivery lands once.
*/

interface WaValue {
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: {
    from?: string;
    id?: string;
    timestamp?: string;
    type?: string;
    text?: { body?: string };
    button?: { text?: string };
    interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
    image?: { caption?: string };
    document?: { filename?: string; caption?: string };
    referral?: { source_id?: string; headline?: string; ctwa_clid?: string };
  }[];
  statuses?: {
    id?: string;
    status?: string;
    recipient_id?: string;
    errors?: { title?: string; message?: string }[];
  }[];
}

@Injectable()
export class WhatsAppWebhookService {
  private readonly log = new Logger('WhatsAppWebhook');

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
  ) {}

  private async secrets() {
    try {
      const row = await this.integrations.credentials('MESSAGING', 'WHATSAPP');
      return {
        verifyToken: row?.webhookSecret?.trim() || process.env.WHATSAPP_VERIFY_TOKEN || '',
        appSecret: row?.clientSecret?.trim() || process.env.WHATSAPP_APP_SECRET || '',
      };
    } catch {
      return {
        verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
        appSecret: process.env.WHATSAPP_APP_SECRET || '',
      };
    }
  }

  /** Meta's one-off subscription handshake. */
  async verify(mode?: string, token?: string, challenge?: string) {
    const { verifyToken } = await this.secrets();
    if (mode === 'subscribe' && verifyToken && token === verifyToken) return challenge ?? '';
    this.log.warn('webhook verify refused — token did not match');
    return null;
  }

  /**
   * Without the app secret nothing is accepted. An open webhook lets anyone
   * post fake customer messages into the inbox, and staff would answer them.
   */
  async signatureOk(signature: string | undefined, raw: Buffer | undefined) {
    const { appSecret } = await this.secrets();
    if (!appSecret) return false;
    if (!signature?.startsWith('sha256=') || !raw) return false;
    const expected = 'sha256=' + createHmac('sha256', appSecret).update(raw).digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async handle(payload: { entry?: { changes?: { value?: WaValue }[] }[] }) {
    for (const entry of payload?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value;
        if (!v) continue;
        for (const st of v.statuses ?? []) await this.onStatus(st);
        for (const m of v.messages ?? []) await this.onMessage(v, m);
      }
    }
  }

  /* ---- what we sent ---- */

  private async onStatus(st: NonNullable<WaValue['statuses']>[number]) {
    if (!st.id) return;
    const failed = st.status === 'failed';
    try {
      await this.prisma.db.orderMessage.updateMany({
        where: { providerMessageId: st.id },
        data: failed
          ? {
              status: OrderMessageStatus.FAILED,
              error: (st.errors?.[0]?.message ?? st.errors?.[0]?.title ?? 'failed').slice(0, 500),
            }
          : { status: OrderMessageStatus.SENT },
      });
    } catch (e) {
      this.log.warn(`status update failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  /* ---- what the customer sent ---- */

  private text(m: NonNullable<WaValue['messages']>[number]): string {
    return (
      m.text?.body ||
      m.button?.text ||
      m.interactive?.button_reply?.title ||
      m.interactive?.list_reply?.title ||
      m.image?.caption ||
      m.document?.caption ||
      (m.type ? `[${m.type}]` : '[message]')
    );
  }

  private async onMessage(v: WaValue, m: NonNullable<WaValue['messages']>[number]) {
    const from = m.from?.trim();
    if (!from || !m.id) return;

    try {
      const convo = await this.conversationFor(from, v.contacts?.[0]?.profile?.name, m.referral);

      await this.prisma.db.message.create({
        data: {
          conversationId: convo.id,
          direction: MessageDirection.IN,
          authorType: MessageAuthor.CUSTOMER,
          body: this.text(m).slice(0, 2000),
          externalMessageId: m.id,
        },
      });

      await this.prisma.db.conversation.update({
        where: { id: convo.id },
        data: {
          status: ConversationStatus.OPEN,
          lastMessageAt: new Date(),
          unreadForStaff: { increment: 1 },
        },
      });
    } catch (e) {
      // A duplicate is Meta retrying, not a problem.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return;
      this.log.warn(`inbound message failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  /**
   * One thread per WhatsApp number. A new thread per message would throw away
   * the history that makes the previous conversation worth having.
   */
  private async conversationFor(
    waId: string,
    profileName?: string,
    referral?: NonNullable<WaValue['messages']>[number]['referral'],
  ) {
    const existing = await this.prisma.db.conversation.findFirst({
      where: { channel: InboxChannel.WHATSAPP, externalIdentity: waId, deletedAt: null },
      orderBy: { lastMessageAt: 'desc' },
    });

    // Ad attribution only ever gets filled in, never overwritten with nothing.
    const ad = referral?.ctwa_clid
      ? {
          ctwaClid: referral.ctwa_clid,
          adReferralSourceId: referral.source_id ?? null,
          adReferralHeadline: referral.headline?.slice(0, 200) ?? null,
        }
      : {};

    if (existing) {
      if (Object.keys(ad).length) {
        await this.prisma.db.conversation.update({ where: { id: existing.id }, data: ad });
      }
      return existing;
    }

    const local = this.toLocal(waId);
    const customer = await this.prisma.db.customer
      .findFirst({ where: { phone: local, deletedAt: null }, select: { id: true } })
      .catch(() => null);

    return this.prisma.db.conversation.create({
      data: {
        channel: InboxChannel.WHATSAPP,
        externalIdentity: waId,
        guestPhone: local,
        guestName: profileName?.slice(0, 120) ?? null,
        customerId: customer?.id ?? null,
        ...ad,
      },
    });
  }

  /** Meta sends 8801…; customers are stored as 01…. */
  private toLocal(waId: string) {
    const d = waId.replace(/\D/g, '');
    return d.startsWith('88') ? d.slice(2) : d;
  }
}

@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  private readonly log = new Logger('WhatsAppWebhook');

  constructor(private readonly svc: WhatsAppWebhookService) {}

  @Public()
  @Get()
  async verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    const ok = await this.svc.verify(mode, token, challenge);
    if (ok === null) return 'forbidden';
    return ok;
  }

  /**
   * Always 200, even when we refuse the body: Meta retries anything else, and
   * a rejected forgery retried for hours helps nobody. The refusal is logged.
   */
  @Public()
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: { entry?: { changes?: { value?: unknown }[] }[] },
  ) {
    if (!(await this.svc.signatureOk(signature, req.rawBody))) {
      this.log.warn('webhook rejected — bad or missing signature');
      return { ok: true };
    }
    void this.svc.handle(body as never).catch(() => undefined);
    return { ok: true };
  }
}
