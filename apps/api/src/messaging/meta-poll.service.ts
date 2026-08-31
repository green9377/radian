import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InboxChannel } from '@prisma/client';
import { IntegrationsService } from '../administration/integrations.service';
import { MetaWebhookService } from './meta-webhook';

/*
  The net under the Instagram webhook.

  A webhook is a thing Meta chooses to send. A read is a thing we choose to do.
  On 31 Aug the difference stopped being academic: Instagram messages were
  sitting in Meta's inbox, our token could read every one of them, and Meta was
  pushing none of them to the webhook - with every setting it exposes reporting
  healthy (/{app-id}/subscriptions active and pointed at us, the account
  subscribed to `messages`, the app Live, sending working). Two and a half days
  of customer messages were lost that way before anyone noticed, because a
  silent channel looks exactly like a quiet one.

  So the inbox no longer depends only on being told. This asks.

  The webhook stays the fast path - it arrives in a second and this runs once a
  minute. Both land through the same importMessage(), which dedupes on Meta's
  own message id, so a message that comes both ways is still stored once.

  Instagram only, for now. The Page token carries just `pages_messaging`
  (checked with debug_token), so /me/conversations on the Page is refused until
  that token is re-authorised with `pages_read_engagement`. Messenger's webhook
  is delivering, so it does not need the net yet.
*/

const IG_GRAPH = 'https://graph.instagram.com/v23.0';

/** Steady state: re-read anything touched in the last few minutes. */
const WINDOW_MINUTES = 15;
/** First tick after a restart: how far back to reach for what the webhook missed. */
const BACKFILL_HOURS = 72;
const THREADS_PER_TICK = 50;
const MESSAGES_PER_THREAD = 20;

interface IgConversation {
  id: string;
  updated_time?: string;
}

interface IgMessage {
  id: string;
  created_time?: string;
  message?: string;
  from?: { id?: string; username?: string };
}

@Injectable()
export class MetaPollService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('MetaPoll');
  private timer?: NodeJS.Timeout;
  private running = false;
  private firstTickDone = false;

  constructor(
    private readonly integrations: IntegrationsService,
    private readonly meta: MetaWebhookService,
  ) {}

  onModuleInit() {
    // Always ticking; each tick re-reads the settings and usually returns.
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.syncInstagram();
    } catch (e) {
      this.log.warn(`tick failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * One pass over Instagram. Also what the admin "Sync now" button calls, so
   * the owner never has to wait out a minute to see whether it works.
   */
  async syncInstagram(force = false): Promise<{
    ran: boolean;
    reason?: string;
    threads: number;
    imported: number;
  }> {
    const row = await this.integrations.credentials('SOCIAL', 'INSTAGRAM').catch(() => null);
    const token = row?.isEnabled ? row.apiKey?.trim() : null;
    if (!token) return { ran: false, reason: 'Instagram is not connected', threads: 0, imported: 0 };

    const me = await this.get<{ id?: string; user_id?: string; username?: string }>(
      token,
      '/me?fields=id,user_id,username',
    );
    if (!me) return { ran: false, reason: 'Instagram did not answer', threads: 0, imported: 0 };

    // Whoever we are, a message from us is a reply, not a customer message.
    const ours = new Set([me.id, me.user_id].filter(Boolean) as string[]);

    const backfill = force || !this.firstTickDone;
    const since = Date.now() - (backfill ? BACKFILL_HOURS * 3600_000 : WINDOW_MINUTES * 60_000);
    this.firstTickDone = true;

    const convos = await this.get<{ data?: IgConversation[] }>(
      token,
      `/me/conversations?platform=instagram&fields=id,updated_time&limit=${THREADS_PER_TICK}`,
    );
    const touched = (convos?.data ?? []).filter((c) => {
      const t = c.updated_time ? Date.parse(c.updated_time) : 0;
      return t >= since;
    });

    let imported = 0;
    for (const c of touched) {
      const detail = await this.get<{ messages?: { data?: IgMessage[] } }>(
        token,
        `/${c.id}?fields=${encodeURIComponent(
          `messages.limit(${MESSAGES_PER_THREAD}){id,created_time,from,message}`,
        )}`,
      );
      const messages = detail?.messages?.data ?? [];

      // Meta returns newest first; replay oldest first so a thread reads right.
      for (const m of [...messages].reverse()) {
        const at = m.created_time ? new Date(m.created_time) : new Date();
        if (at.getTime() < since) continue;
        if (!m.message?.trim() || !m.from?.id) continue;

        const outbound = ours.has(m.from.id);
        /*
          On an outbound message the peer is the thread's other side, which the
          message itself does not name - so it is taken from the customer's own
          messages in the same thread.
        */
        const peer = outbound
          ? messages.find((x) => x.from?.id && !ours.has(x.from.id))?.from
          : m.from;
        if (!peer?.id) continue;

        const added = await this.meta.importMessage({
          channel: InboxChannel.INSTAGRAM,
          peerId: peer.id,
          /*
            The username comes free here, which is how a polled thread gets a
            real name where the webhook path only ever managed "Guest".
          */
          peerName: peer.username ?? null,
          mid: m.id,
          body: m.message.trim(),
          outbound,
          at,
        });
        if (added) imported += 1;
      }
    }

    if (imported > 0) {
      this.log.log(`picked up ${imported} Instagram message(s) the webhook never delivered`);
    }
    return { ran: true, threads: touched.length, imported };
  }

  private async get<T>(token: string, path: string): Promise<T | null> {
    try {
      const res = await fetch(`${IG_GRAPH}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        // Logged with Meta's own words. "It did not work" is not a diagnosis.
        const body = await res.text();
        this.log.warn(`GET ${path.split('?')[0]} (${res.status}): ${body.slice(0, 300)}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (e) {
      this.log.warn(`GET ${path.split('?')[0]} failed: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }
}
