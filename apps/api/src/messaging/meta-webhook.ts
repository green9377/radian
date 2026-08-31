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
    attachments?: { type?: string; payload?: { url?: string } }[];
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
        Echoes are our own messages coming back — EITHER a reply Radian just
        sent (dedupe catches it below, by mid) OR a reply typed straight into
        the Messenger/Instagram app on someone's phone, which Radian never
        saw. Throwing every echo away — the old behaviour — silently dropped
        the second kind: a staff member could answer a customer from their
        phone and the admin thread would never show it, still looking
        unanswered (found 8 Aug, owner: "mobile theke reply dile admin a ase
        na").
      */
      if (ev.message?.is_echo) await this.onEcho(channel, ev);
      else await this.onMessage(channel, ev);
    }
  }

  private text(ev: MetaMessaging): string | null {
    if (ev.message?.text?.trim()) return ev.message.text.trim();
    if (ev.postback?.title?.trim()) return ev.postback.title.trim();
    /*
      An attachment carries Meta's CDN URL, stored as `[type](url)` so the
      admin can show the picture itself instead of the word "[image]". The CDN
      link expires after a while — acceptable for a support inbox, where the
      conversation is live when it matters.
    */
    const a = ev.message?.attachments?.[0];
    if (a?.type) {
      const url = a.payload?.url?.trim();
      return url ? `[${a.type}](${url})` : `[${a.type}]`;
    }
    // Delivery and read receipts arrive here too, and are not messages.
    return null;
  }

  private async onMessage(channel: InboxChannel, ev: MetaMessaging) {
    const psid = ev.sender?.id?.trim();
    const body = this.text(ev);
    if (!psid || !body) return;
    await this.importMessage({
      channel, peerId: psid, mid: ev.message?.mid ?? null, body, outbound: false,
    });
  }

  /**
   * The single door every inbound message comes through, whichever way it
   * arrived — Meta pushed it to the webhook, or the poller went and fetched it
   * (meta-poll.service.ts, built after Meta went quiet on Instagram for two and
   * a half days while swearing everything was healthy).
   *
   * Both paths dedupe on Meta's own message id, so a message that comes both
   * ways is stored once. Returns true only when a row was actually written.
   */
  async importMessage(input: {
    channel: InboxChannel;
    peerId: string;
    mid: string | null;
    body: string;
    outbound: boolean;
    peerName?: string | null;
    at?: Date;
  }): Promise<boolean> {
    const { channel, peerId, mid, outbound } = input;
    const body = input.body.trim();
    if (!peerId || !body) return false;

    try {
      /*
        The duplicate check comes BEFORE the thread lookup. When Meta retries a
        delivery, creating the thread first and then discovering the message
        already existed left an empty thread behind — the "—" rows the owner
        saw on 7 Aug.
      */
      if (mid) {
        const seen = await this.prisma.db.message.findFirst({
          where: { externalMessageId: mid },
          select: { id: true },
        });
        if (seen) return false;
      }

      const convo = await this.conversationFor(channel, peerId, input.peerName ?? null);

      await this.prisma.db.message.create({
        data: {
          conversationId: convo.id,
          direction: outbound ? MessageDirection.OUT : MessageDirection.IN,
          /*
            On an outbound message the real author is unknown from here —
            whoever was holding the phone or sitting in Meta's own inbox. STAFF
            with no authorUserId renders as plain "Staff".
          */
          authorType: outbound ? MessageAuthor.STAFF : MessageAuthor.CUSTOMER,
          body: body.slice(0, 2000),
          externalMessageId: mid,
          ...(input.at ? { createdAt: input.at } : {}),
        },
      });

      await this.prisma.db.conversation.update({
        where: { id: convo.id },
        data: outbound
          ? { status: ConversationStatus.WAITING_CUSTOMER, lastMessageAt: input.at ?? new Date() }
          : {
              status: ConversationStatus.OPEN,
              lastMessageAt: input.at ?? new Date(),
              unreadForStaff: { increment: 1 },
            },
      });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false;
      this.log.warn(`inbound ${channel} failed: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

  /**
   * A reply sent OUTSIDE Radian — typed straight into the Page's Messenger
   * app or the Instagram app on someone's phone. Meta echoes every outgoing
   * message back to the webhook whichever way it was sent, tagged is_echo.
   *
   * Sender/recipient are reversed from onMessage(): on an echo, `sender` is
   * our own Page/IG account and `recipient` is the customer.
   *
   * Replies sent THROUGH Radian arrive here too — inbox.ts/ai-agent.ts tag
   * their own Message row with Meta's message id the moment the send
   * succeeds, so the dedupe check below finds it and this is a no-op for
   * them. Only a mid Radian never saw reaches the create() below.
   */
  private async onEcho(channel: InboxChannel, ev: MetaMessaging) {
    const mid = ev.message?.mid;
    const psid = ev.recipient?.id?.trim();
    const body = this.text(ev);
    if (!mid || !psid || !body) return;
    /*
      Replies sent THROUGH Radian arrive here too — inbox.ts/ai-agent.ts tag
      their own Message row with Meta's message id the moment the send
      succeeds, so importMessage's dedupe finds it and this is a no-op for
      them. Only a mid Radian never saw becomes a row.
    */
    await this.importMessage({ channel, peerId: psid, mid, body, outbound: true });
  }

  /**
   * One thread per person per channel. The database enforces it with a partial
   * unique index on (channel, externalIdentity) — find-then-create alone let
   * two concurrent webhook deliveries each create a thread, which is how one
   * Instagram customer ended up with a new thread per message.
   */
  private async conversationFor(
    channel: InboxChannel,
    psid: string,
    /*
      The poller already knows the username — it came back with the message —
      so it hands it over rather than making us ask Meta again for something
      Meta has repeatedly refused to answer.
    */
    knownName: string | null = null,
  ) {
    const existing = await this.prisma.db.conversation.findFirst({
      where: { channel, externalIdentity: psid, deletedAt: null },
      orderBy: { lastMessageAt: 'desc' },
    });
    if (existing) {
      // A thread created while the profile was unreadable stays "Guest"
      // forever unless somebody tries again.
      if (!existing.guestName) {
        const name = knownName || (await this.profileName(channel, psid));
        if (name) {
          await this.prisma.db.conversation.update({
            where: { id: existing.id }, data: { guestName: name },
          });
          existing.guestName = name;
        }
      }
      return existing;
    }

    try {
      return await this.prisma.db.conversation.create({
        data: {
          channel,
          externalIdentity: psid,
          // Meta gives a scoped id, not a phone number, so the name is fetched
          // separately — and a failure there must not lose the message.
          guestName: knownName || (await this.profileName(channel, psid)),
        },
      });
    } catch (e) {
      // The unique index caught a concurrent create: the other one won, use it.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const winner = await this.prisma.db.conversation.findFirst({
          where: { channel, externalIdentity: psid, deletedAt: null },
        });
        if (winner) return winner;
      }
      throw e;
    }
  }

  private async profileName(channel: InboxChannel, id: string): Promise<string | null> {
    const instagram = channel === InboxChannel.INSTAGRAM;
    const token = await this.token(instagram ? 'INSTAGRAM' : 'FACEBOOK_PAGE',
      instagram ? 'INSTAGRAM_TOKEN' : 'FACEBOOK_PAGE_TOKEN');
    if (!token) return null;

    /*
      Instagram has usernames. On Messenger many Page tokens return only
      first_name/last_name and refuse the combined `name` — asking for `name`
      alone is why Messenger threads showed "Guest" while Instagram showed the
      username (7 Aug).
    */
    const host = instagram ? IG_GRAPH : GRAPH;
    const fields = instagram ? 'name,username' : 'name,first_name,last_name';
    try {
      const res = await fetch(`${host}/${id}?fields=${fields}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        /*
          Logged, not swallowed. A thread showing "Guest" could mean the token
          is wrong, the permission is missing, or Meta simply withholds the
          profile — and without Meta's own words there is no way to tell which.
        */
        const body = await res.text();
        this.log.warn(`no profile for ${channel} ${id} (${res.status}): ${body.slice(0, 300)}`);
        return null;
      }
      const j = (await res.json()) as {
        name?: string; username?: string; first_name?: string; last_name?: string;
      };
      const joined = [j.first_name, j.last_name].filter(Boolean).join(' ');
      const name = (j.name || joined || j.username)?.slice(0, 120) || null;
      if (!name) this.log.warn(`profile for ${channel} ${id} came back without a name`);
      return name;
    } catch (e) {
      this.log.warn(`profile lookup failed for ${channel} ${id}: ${e instanceof Error ? e.message : e}`);
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
