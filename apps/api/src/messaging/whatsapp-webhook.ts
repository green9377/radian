import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import {
  ConversationStatus,
  InboxChannel,
  MessageAuthor,
  MessageDirection,
  OrderMessageStatus,
  Prisma,
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

/** One message as WhatsApp describes it, in any of the payloads below. */
interface WaMessage {
  from?: string;
  to?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
  image?: { caption?: string };
  document?: { filename?: string; caption?: string };
  referral?: { source_id?: string; headline?: string; ctwa_clid?: string };
}

interface WaValue {
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: WaMessage[];
  statuses?: {
    id?: string;
    status?: string;
    recipient_id?: string;
    errors?: { title?: string; message?: string }[];
  }[];

  /*
    Coexistence (DEC-WA-009). The owner's number lives in the WhatsApp Business
    app AND here at the same time, so three more payloads arrive.
  */

  /// What the owner typed on the phone. Ours, but we did not send it.
  message_echoes?: WaMessage[];

  /// The chat that already existed on the phone, replayed once after onboarding.
  history?: {
    metadata?: { phase?: number; chunk_order?: number; progress?: number };
    threads?: { id?: string; messages?: WaMessage[] }[];
    errors?: { code?: number; message?: string }[];
  }[];

  /// The phone's address book. Read-only here — Customers owns that data.
  state_sync?: {
    type?: string;
    contact?: {
      full_name?: string;
      first_name?: string;
      phone_number?: string;
    };
    action?: string;
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
        verifyToken:
          row?.webhookSecret?.trim() || process.env.WHATSAPP_VERIFY_TOKEN || '',
        appSecret:
          row?.clientSecret?.trim() || process.env.WHATSAPP_APP_SECRET || '',
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
    if (mode === 'subscribe' && verifyToken && token === verifyToken)
      return challenge ?? '';
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
    const expected =
      'sha256=' + createHmac('sha256', appSecret).update(raw).digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async handle(payload: { entry?: { changes?: { value?: WaValue }[] }[] }) {
    /*
      Logged on the way in, not only on failure. A silent success is
      indistinguishable from never being called, which is exactly the question
      you need answered when a message does not appear.
    */
    const counts = (payload?.entry ?? [])
      .flatMap((e) => e.changes ?? [])
      .reduce(
        (a, c) => ({
          messages: a.messages + (c.value?.messages?.length ?? 0),
          statuses: a.statuses + (c.value?.statuses?.length ?? 0),
          echoes: a.echoes + (c.value?.message_echoes?.length ?? 0),
          history: a.history + (c.value?.history?.length ?? 0),
        }),
        { messages: 0, statuses: 0, echoes: 0, history: 0 },
      );
    this.log.log(
      `webhook in — ${counts.messages} message(s), ${counts.statuses} status(es), ` +
        `${counts.echoes} echo(es), ${counts.history} history batch(es)`,
    );

    for (const entry of payload?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value;
        if (!v) continue;
        for (const st of v.statuses ?? []) await this.onStatus(st);
        for (const m of v.messages ?? []) await this.onMessage(v, m);
        for (const e of v.message_echoes ?? []) await this.onEcho(e);
        for (const h of v.history ?? []) await this.onHistory(h);
        if (v.state_sync?.length) await this.onStateSync(v.state_sync);
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
              error: (
                st.errors?.[0]?.message ??
                st.errors?.[0]?.title ??
                'failed'
              ).slice(0, 500),
            }
          : { status: OrderMessageStatus.SENT },
      });
    } catch (e) {
      this.log.warn(
        `status update failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /* ---- what the customer sent ---- */

  private text(m: WaMessage): string {
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

  private async onMessage(v: WaValue, m: WaMessage) {
    const from = m.from?.trim();
    if (!from || !m.id) return;

    try {
      const convo = await this.conversationFor(
        from,
        v.contacts?.[0]?.profile?.name,
        m.referral,
      );

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
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        return;
      this.log.warn(
        `inbound message failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /**
   * One thread per WhatsApp number. A new thread per message would throw away
   * the history that makes the previous conversation worth having.
   */
  /* ---- Coexistence: what the owner sent from the phone ---- */

  /**
   * DEC-WA-009. The owner answers a customer on the WhatsApp Business app; we
   * were not the sender, so nothing else in this file would ever hear about it.
   * Without this the Inbox shows the customer's question and no reply, and the
   * next staff member answers it a second time.
   */
  private async onEcho(m: WaMessage) {
    const to = m.to?.trim();
    if (!to || !m.id) return;
    await this.storeOutbound(to, m, MessageAuthor.STAFF);
  }

  /* ---- Coexistence: the chat that was already on the phone ---- */

  /**
   * Replayed once, right after onboarding, in chunks that arrive out of order.
   * Timestamps are the original ones — a thread whose messages all claim today
   * would be worse than no history at all.
   */
  private async onHistory(h: NonNullable<WaValue['history']>[number]) {
    const err = h.errors?.[0];
    if (err) {
      // 2593109 = the owner declined to share history. Not a failure.
      this.log.log(`history not shared (${err.code ?? 'unknown'})`);
      return;
    }

    const meta = h.metadata;
    this.log.log(
      `history batch — phase ${meta?.phase ?? '?'}, chunk ${meta?.chunk_order ?? '?'}, ` +
        `${meta?.progress ?? '?'}% done`,
    );

    for (const thread of h.threads ?? []) {
      const waId = thread.id?.trim();
      if (!waId) continue;
      for (const m of thread.messages ?? []) {
        if (!m.id) continue;
        const at = this.at(m.timestamp);
        // `to` present = the business sent it; otherwise the customer did.
        if (m.to) await this.storeOutbound(waId, m, MessageAuthor.STAFF, at);
        else await this.storeInbound(waId, m, at);
      }
    }
  }

  /**
   * The phone's address book, replayed after onboarding.
   *
   * Still NOT a customer record (One Data One Owner — Customers owns those).
   * All it does is put a name on the thread: history arrives with numbers
   * only, so without this every imported conversation reads "Guest" and staff
   * cannot tell one from another.
   *
   * Only ever fills a blank. A name already on the thread came from the
   * customer's own WhatsApp profile or from staff, and both beat a label out
   * of somebody's phone book.
   */
  private async onStateSync(rows: NonNullable<WaValue['state_sync']>) {
    let named = 0;

    for (const r of rows) {
      if (r.action !== 'add') continue;

      const waId = r.contact?.phone_number?.replace(/\D/g, '');
      const name = (r.contact?.full_name || r.contact?.first_name)?.trim();
      if (!waId || !name) continue;

      const hit = await this.prisma.db.conversation
        .updateMany({
          where: {
            channel: InboxChannel.WHATSAPP,
            externalIdentity: waId,
            guestName: null,
            deletedAt: null,
          },
          data: { guestName: name.slice(0, 120) },
        })
        .catch(() => ({ count: 0 }));

      named += hit.count;
    }

    const added = rows.filter((r) => r.action === 'add').length;
    this.log.log(
      `contact sync — ${added} added/changed, ${rows.length - added} removed, ` +
        `${named} thread(s) named`,
    );
  }

  /* ---- shared writers ---- */

  private at(timestamp?: string) {
    const s = Number(timestamp);
    return Number.isFinite(s) && s > 0 ? new Date(s * 1000) : undefined;
  }

  private async storeInbound(waId: string, m: WaMessage, at?: Date) {
    try {
      const convo = await this.conversationFor(waId);
      await this.prisma.db.message.create({
        data: {
          conversationId: convo.id,
          direction: MessageDirection.IN,
          authorType: MessageAuthor.CUSTOMER,
          body: this.text(m).slice(0, 2000),
          externalMessageId: m.id,
          ...(at ? { createdAt: at } : {}),
        },
      });
      await this.touch(convo.id, at, true);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        return;
      this.log.warn(
        `history inbound failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  private async storeOutbound(
    waId: string,
    m: WaMessage,
    author: MessageAuthor,
    at?: Date,
  ) {
    try {
      const convo = await this.conversationFor(waId);
      await this.prisma.db.message.create({
        data: {
          conversationId: convo.id,
          direction: MessageDirection.OUT,
          authorType: author,
          body: this.text(m).slice(0, 2000),
          externalMessageId: m.id,
          ...(at ? { createdAt: at } : {}),
        },
      });
      await this.touch(convo.id, at, false);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        return;
      this.log.warn(
        `outbound mirror failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /**
   * History arrives out of order, so lastMessageAt only ever moves forward —
   * otherwise a late chunk of old messages would drag a live thread backwards
   * and bury it at the bottom of the Inbox.
   */
  private async touch(
    conversationId: string,
    at: Date | undefined,
    unread: boolean,
  ) {
    const when = at ?? new Date();
    const row = await this.prisma.db.conversation.findUnique({
      where: { id: conversationId },
      select: { lastMessageAt: true },
    });
    const forward = !row?.lastMessageAt || row.lastMessageAt < when;

    await this.prisma.db.conversation.update({
      where: { id: conversationId },
      data: {
        ...(forward ? { lastMessageAt: when } : {}),
        // Backfilled history was already read on the phone; only live inbound counts.
        ...(unread && !at
          ? {
              status: ConversationStatus.OPEN,
              unreadForStaff: { increment: 1 },
            }
          : {}),
      },
    });
  }

  private async conversationFor(
    waId: string,
    profileName?: string,
    referral?: WaMessage['referral'],
  ) {
    const existing = await this.prisma.db.conversation.findFirst({
      where: {
        channel: InboxChannel.WHATSAPP,
        externalIdentity: waId,
        deletedAt: null,
      },
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

    /*
      A thread built from history has no name — the history payload carries
      only the number. So the first live message is the first chance to stop
      calling this person "Guest". Fill it in, never overwrite: a name the
      owner typed himself beats one WhatsApp guessed.
    */
    const name =
      profileName?.trim() && !existing?.guestName
        ? { guestName: profileName.trim().slice(0, 120) }
        : {};

    if (existing) {
      const patch = { ...ad, ...name };
      if (Object.keys(patch).length) {
        await this.prisma.db.conversation.update({
          where: { id: existing.id },
          data: patch,
        });
        return { ...existing, ...patch };
      }
      return existing;
    }

    const local = this.toLocal(waId);
    const customer = await this.prisma.db.customer
      .findFirst({
        where: { phone: local, deletedAt: null },
        select: { id: true },
      })
      .catch(() => null);

    try {
      return await this.prisma.db.conversation.create({
        data: {
          channel: InboxChannel.WHATSAPP,
          externalIdentity: waId,
          guestPhone: local,
          guestName: profileName?.slice(0, 120) ?? null,
          customerId: customer?.id ?? null,
          ...ad,
        },
      });
    } catch (e) {
      // The unique index caught a concurrent create: the other one won, use it.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const winner = await this.prisma.db.conversation.findFirst({
          where: {
            channel: InboxChannel.WHATSAPP,
            externalIdentity: waId,
            deletedAt: null,
          },
        });
        if (winner) return winner;
      }
      throw e;
    }
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
