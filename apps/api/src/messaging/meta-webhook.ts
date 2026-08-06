import {
  Body, Controller, Get, Headers, HttpCode, Injectable, Logger, Post, Query, Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  ConversationStatus, InboxChannel, MessageAuthor, MessageDirection, Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../administration/integrations.service';
import { Public } from '../auth/auth.guard';
import { WhatsAppWebhookService } from './whatsapp-webhook';

/*
  Messenger and Instagram direct messages.

  One endpoint for both: Meta sends `object: "page"` for Messenger and
  `object: "instagram"` for Instagram, and the payload is otherwise the same.

  They do NOT share a token. Messenger belongs to the Facebook Page; Instagram
  is connected on its own and holds its own token, its own host and its own app
  secret. Treating them as one account is the mistake that cost an evening.

  Comments are not handled on purpose (owner, 6 Aug). A comment is public and a
  DM is not, so the reply is a different act; mixing them into one list would
  make them look like the same job.
*/

const GRAPH = 'https://graph.facebook.com/v25.0';
const IG_GRAPH = 'https://graph.instagram.com/v23.0';

interface MetaMessaging {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: { type?: string }[];
  };
  postback?: { title?: string; payload?: string };
}

@Injectable()
export class MetaWebhookService {
  private readonly log = new Logger('MetaWebhook');

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    /* The signature check is identical, so it is borrowed rather than copied. */
    private readonly wa: WhatsAppWebhookService,
  ) {}

  async verify(mode?: string, token?: string, challenge?: string) {
    return this.wa.verify(mode, token, challenge);
  }

  /*
    Instagram signs with the Instagram app secret, Messenger with the Facebook
    one, and both arrive at this endpoint. Rather than guess from the body
    before it has been trusted, either secret is accepted — each is a secret
    only Meta and Radian hold, so neither weakens the other.
  */
  async signatureOk(signature: string | undefined, raw: Buffer | undefined) {
    if (await this.wa.signatureOk(signature, raw)) return true;
    if (!signature?.startsWith('sha256=') || !raw) return false;

    const secret = await this.instagramAppSecret();
    if (!secret) return false;

    const expected = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async instagramAppSecret(): Promise<string | null> {
    try {
      const row = await this.integrations.credentials('SOCIAL', 'INSTAGRAM');
      if (row?.clientSecret?.trim()) return row.clientSecret.trim();
    } catch {
      /* fall through to env */
    }
    return process.env.INSTAGRAM_APP_SECRET || null;
  }

  async handle(payload: { object?: string; entry?: { messaging?: MetaMessaging[] }[] }) {
    const channel =
      payload?.object === 'instagram' ? InboxChannel.INSTAGRAM : InboxChannel.MESSENGER;

    const events = (payload?.entry ?? []).flatMap((e) => e.messaging ?? []);
    this.log.log(`webhook in — ${channel}, ${events.length} event(s)`);

    for (const ev of events) {
      /*
        Echoes are our own messages coming back. Storing them would duplicate
        every reply, and answering them would have the AI talking to itself.
      */
      if (ev.message?.is_echo) continue;
      await this.onMessage(channel, ev);
    }
  }

  private text(ev: MetaMessaging): string | null {
    if (ev.message?.text?.trim()) return ev.message.text.trim();
    if (ev.postback?.title?.trim()) return ev.postback.title.trim();
    const a = ev.message?.attachments?.[0]?.type;
    if (a) return `[${a}]`;
    // Delivery and read receipts arrive here too, and are not messages.
    return null;
  }

  private async onMessage(channel: InboxChannel, ev: MetaMessaging) {
    const psid = ev.sender?.id?.trim();
    const body = this.text(ev);
    if (!psid || !body) return;

    try {
      const convo = await this.conversationFor(channel, psid);

      await this.prisma.db.message.create({
        data: {
          conversationId: convo.id,
          direction: MessageDirection.IN,
          authorType: MessageAuthor.CUSTOMER,
          body: body.slice(0, 2000),
          externalMessageId: ev.message?.mid ?? null,
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
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return;
      this.log.warn(`inbound ${channel} failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** One thread per person per channel, so their history stays in one place. */
  private async conversationFor(channel: InboxChannel, psid: string) {
    const existing = await this.prisma.db.conversation.findFirst({
      where: { channel, externalIdentity: psid, deletedAt: null },
      orderBy: { lastMessageAt: 'desc' },
    });
    if (existing) return existing;

    return this.prisma.db.conversation.create({
      data: {
        channel,
        externalIdentity: psid,
        // Meta gives a scoped id, not a phone number, so the name is fetched
        // separately — and a failure there must not lose the message.
        guestName: await this.profileName(channel, psid),
      },
    });
  }

  private async profileName(channel: InboxChannel, id: string): Promise<string | null> {
    const instagram = channel === InboxChannel.INSTAGRAM;
    const token = await this.token(instagram ? 'INSTAGRAM' : 'FACEBOOK_PAGE',
      instagram ? 'INSTAGRAM_TOKEN' : 'FACEBOOK_PAGE_TOKEN');
    if (!token) return null;

    // Instagram has usernames, Messenger has real names.
    const host = instagram ? IG_GRAPH : GRAPH;
    const fields = instagram ? 'name,username' : 'name';
    try {
      const res = await fetch(`${host}/${id}?fields=${fields}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { name?: string; username?: string };
      return (j.name || j.username)?.slice(0, 120) ?? null;
    } catch {
      return null;
    }
  }

  private async token(provider: string, envKey: string): Promise<string | null> {
    try {
      const row = await this.integrations.credentials('SOCIAL', provider);
      if (row?.isEnabled && row.apiKey?.trim()) return row.apiKey.trim();
    } catch {
      /* fall through to env */
    }
    return process.env[envKey] || null;
  }
}

@Controller('webhooks/meta')
export class MetaWebhookController {
  private readonly log = new Logger('MetaWebhook');

  constructor(private readonly svc: MetaWebhookService) {}

  @Public()
  @Get()
  async verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    const ok = await this.svc.verify(mode, token, challenge);
    return ok === null ? 'forbidden' : ok;
  }

  @Public()
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: { object?: string; entry?: unknown[] },
  ) {
    if (!(await this.svc.signatureOk(signature, req.rawBody))) {
      this.log.warn('webhook rejected — bad or missing signature');
      return { ok: true };
    }
    void this.svc.handle(body as never).catch(() => undefined);
    return { ok: true };
  }
}
