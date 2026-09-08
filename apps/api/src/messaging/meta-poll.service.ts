import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InboxChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../administration/integrations.service';
import { MetaWebhookService } from './meta-webhook';

/*
  The net under the Meta webhooks, for both channels.

  A webhook is a thing Meta chooses to send. A read is a thing we choose to do.
  On 31 Aug the difference stopped being academic: Instagram messages were
  sitting in Meta's inbox, our token could read every one of them, and Meta was
  pushing none of them - with every setting it exposes reporting healthy
  (/{app-id}/subscriptions active and pointed at us, the account subscribed to
  `messages`, the app Live, sending working). Two and a half days of customer
  messages were lost that way before anyone noticed, because a silent channel
  looks exactly like a quiet one.

  The same read also solved a second thing nobody expected. Asking Meta for a
  customer's name directly - GET /{psid}?fields=first_name,last_name - is
  refused, and stays refused with every scope granted (five field lists tried,
  all five refused, 31 Aug). Ask the CONVERSATION instead and the same name is
  handed over without argument:

      from: { name: "Mahisha Mouno", id: "28729587416665125" }   <- refused by /{psid}
      from: { name: "Radian Flower & Gift Shop", id: "3416781..." }

  Which is why 48 Messenger threads read "Guest" for weeks: the code was asking
  the one endpoint Meta will not answer.

  That second line is also the whole answer to "which of our admins replied":
  an outgoing message is FROM THE PAGE. Meta names the shop, never the person -
  true on Instagram and, now measured, true on Messenger too. Business Suite
  knows internally and does not expose it, so no amount of work here produces
  that name. The inbox says "Replied from Meta" instead of inventing one.

  The webhook stays the fast path - it arrives in a second and this runs once a
  minute. Both land through the same importMessage(), which dedupes on Meta's
  own message id, so a message that comes both ways is stored once.
*/

const IG_GRAPH = 'https://graph.instagram.com/v23.0';
const FB_GRAPH = 'https://graph.facebook.com/v23.0';

/** Steady state: re-read anything touched in the last few minutes. */
const WINDOW_MINUTES = 15;
/** First tick after a restart: how far back to reach for what the webhook missed. */
const BACKFILL_HOURS = 72;
const THREADS_PER_TICK = 50;
const MESSAGES_PER_THREAD = 20;

interface MetaParty {
  id?: string;
  /** Messenger says `name`, Instagram says `username`. Same thing to us. */
  name?: string;
  username?: string;
}

interface MetaConversation {
  id: string;
  updated_time?: string;
  participants?: { data?: MetaParty[] };
}

interface MetaAttachment {
  mime_type?: string;
  name?: string;
  file_url?: string;
  image_data?: { url?: string; preview_url?: string };
  video_data?: { url?: string; preview_url?: string };
}

interface MetaMessage {
  id: string;
  created_time?: string;
  message?: string;
  from?: MetaParty;
  attachments?: { data?: MetaAttachment[] };
}

/*
  An attachment becomes the same `[kind](url)` the webhook writes, so the admin
  renders both paths identically and there is one shape to reason about.

  Meta hands a shared Instagram post back as plain `image_data` exactly as it
  does a photo (checked against a live message, 1 Sep), so the picture kinds all
  come through here as `image`. A message with only an attachment has an empty
  `message`, which is why polled photos used to arrive as nothing at all.
*/
function bodyOf(m: MetaMessage): string | null {
  const text = m.message?.trim();
  if (text) return text;

  const a = m.attachments?.data?.[0];
  if (!a) return null;

  const image = a.image_data?.url || a.image_data?.preview_url;
  if (image) return `[image](${image})`;

  const video = a.video_data?.url || a.video_data?.preview_url;
  if (video) return `[video](${video})`;

  if (a.file_url) {
    const kind = a.mime_type?.startsWith('audio/') ? 'audio' : 'file';
    return `[${kind}](${a.file_url})`;
  }
  return null;
}

/** Everything that differs between the two channels, in one place. */
interface ChannelSetup {
  channel: InboxChannel;
  host: string;
  platform: 'instagram' | 'messenger';
  token: string;
  /** Ids that mean "us" — a message from one of these is a reply, not a customer. */
  ours: Set<string>;
}

const nameOf = (p?: MetaParty): string | null =>
  (p?.name || p?.username || '').trim() || null;

@Injectable()
export class MetaPollService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('MetaPoll');
  private timer?: NodeJS.Timeout;
  private running = false;
  private firstTickDone = false;

  constructor(
    private readonly prisma: PrismaService,
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

  private lastNameSweep = 0;

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.syncAll();

      /*
        The net under the net. Every ten minutes, make sure no thread is still
        reading "Guest" — two API calls, and it repairs whatever the live path
        missed without anyone pressing a button.

        This exists because the same fault came back twice: the backfill fixed
        the old threads and every NEW one still arrived nameless. A repair that
        only runs when someone remembers to run it is not a repair.
      */
      if (Date.now() - this.lastNameSweep > 10 * 60_000) {
        this.lastNameSweep = Date.now();
        await this.backfillNames();
      }
    } catch (e) {
      this.log.warn(`tick failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * One pass over both channels. Also what the admin "Sync now" button calls,
   * so nobody waits out a minute to find out whether it works.
   */
  async syncAll(force = false) {
    const backfill = force || !this.firstTickDone;
    this.firstTickDone = true;
    const since = Date.now() - (backfill ? BACKFILL_HOURS : WINDOW_MINUTES / 60) * 3600_000;

    const results: Record<string, unknown> = {};
    for (const setup of await this.setups()) {
      results[setup.channel] = await this.syncOne(setup, since);
    }
    return results;
  }

  /**
   * Fill in the names of threads that have been reading "Guest", without
   * waiting for each of those customers to write again — some never will.
   *
   * Names come from the conversation listing, which is the only place Meta
   * gives them up.
   */
  async backfillNames() {
    const out: Record<string, { looked: number; named: number; reason?: string }> = {};

    for (const setup of await this.setups()) {
      const convos = await this.get<{ data?: MetaConversation[] }>(
        setup,
        `/me/conversations?platform=${setup.platform}&fields=id,participants&limit=100`,
      );
      const rows = convos?.data ?? [];
      let named = 0;

      for (const c of rows) {
        for (const p of c.participants?.data ?? []) {
          const name = nameOf(p);
          if (!p.id || setup.ours.has(p.id)) continue;

          if (name) {
            const r = await this.prisma.db.conversation.updateMany({
              where: {
                channel: setup.channel,
                externalIdentity: p.id,
                deletedAt: null,
                OR: [{ guestName: null }, { guestName: '' }],
              },
              data: { guestName: name.slice(0, 120) },
            });
            named += r.count;
          }

          /*
            DEC-INB-009. The face, for threads that existed before there was a
            column to keep it in. The listing above does not carry a picture,
            so this is one extra call — but only for a thread that has no face
            yet, so it costs nothing once the backlog is done.
          */
          const faceless = await this.prisma.db.conversation.findFirst({
            where: {
              channel: setup.channel,
              externalIdentity: p.id,
              deletedAt: null,
              guestAvatarUrl: null,
            },
            select: { id: true },
          });
          if (!faceless) continue;

          const prof = await this.get<{ profile_pic?: string; username?: string }>(
            setup,
            `/${p.id}?fields=profile_pic,username`,
          );
          const patch = {
            ...(prof?.profile_pic ? { guestAvatarUrl: prof.profile_pic } : {}),
            ...(prof?.username ? { guestHandle: prof.username.slice(0, 80) } : {}),
          };
          if (Object.keys(patch).length) {
            await this.prisma.db.conversation.update({
              where: { id: faceless.id },
              data: patch,
            });
          }
        }
      }

      out[setup.channel] = { looked: rows.length, named };
      // Silent when there is nothing to fix — this now runs on its own.
      if (named > 0) {
        this.log.log(`name backfill — ${setup.channel}: named ${named} of ${rows.length} threads`);
      }
    }

    if (!Object.keys(out).length) return { ran: false, reason: 'No Meta channel is connected', out };
    return { ran: true, out };
  }

  /** What is connected right now, and who "we" are on each channel. */
  private async setups(): Promise<ChannelSetup[]> {
    const list: ChannelSetup[] = [];

    const ig = await this.integrations.credentials('SOCIAL', 'INSTAGRAM').catch(() => null);
    const igToken = ig?.isEnabled ? ig.apiKey?.trim() : null;
    if (igToken) {
      const me = await this.get<{ id?: string; user_id?: string }>(
        { host: IG_GRAPH, token: igToken } as ChannelSetup,
        '/me?fields=id,user_id',
      );
      const ours = new Set([me?.id, me?.user_id, ig?.clientId].filter(Boolean) as string[]);
      if (ours.size) {
        list.push({
          channel: InboxChannel.INSTAGRAM, host: IG_GRAPH, platform: 'instagram',
          token: igToken, ours,
        });
      }
    }

    const fb = await this.integrations.credentials('SOCIAL', 'FACEBOOK_PAGE').catch(() => null);
    const fbToken = fb?.isEnabled ? fb.apiKey?.trim() : null;
    if (fbToken && fb?.clientId?.trim()) {
      list.push({
        channel: InboxChannel.MESSENGER, host: FB_GRAPH, platform: 'messenger',
        token: fbToken, ours: new Set([fb.clientId.trim()]),
      });
    }

    return list;
  }

  private async syncOne(setup: ChannelSetup, since: number) {
    const convos = await this.get<{ data?: MetaConversation[] }>(
      setup,
      `/me/conversations?platform=${setup.platform}&fields=id,updated_time&limit=${THREADS_PER_TICK}`,
    );
    const touched = (convos?.data ?? []).filter(
      (c) => (c.updated_time ? Date.parse(c.updated_time) : 0) >= since,
    );

    let imported = 0;
    for (const c of touched) {
      const detail = await this.get<{ messages?: { data?: MetaMessage[] } }>(
        setup,
        `/${c.id}?fields=${encodeURIComponent(
          `messages.limit(${MESSAGES_PER_THREAD}){id,created_time,from,message,attachments}`,
        )}`,
      );
      const messages = detail?.messages?.data ?? [];

      // Meta returns newest first; replay oldest first so a thread reads right.
      for (const m of [...messages].reverse()) {
        const at = m.created_time ? new Date(m.created_time) : new Date();
        if (at.getTime() < since) continue;
        const body = bodyOf(m);
        if (!body || !m.from?.id) continue;

        const outbound = setup.ours.has(m.from.id);
        /*
          On an outbound message the peer is the thread's other side, which the
          message itself does not name — so it is taken from the customer's own
          messages in the same thread.
        */
        const peer = outbound
          ? messages.find((x) => x.from?.id && !setup.ours.has(x.from.id))?.from
          : m.from;
        if (!peer?.id) continue;

        const added = await this.meta.importMessage({
          channel: setup.channel,
          peerId: peer.id,
          // The name comes free here, which is the whole reason this works.
          peerName: nameOf(peer),
          mid: m.id,
          body,
          outbound,
          at,
        });
        if (added) imported += 1;
      }
    }

    if (imported > 0) {
      this.log.log(
        `picked up ${imported} ${setup.channel} message(s) the webhook never delivered`,
      );
    }
    return { threads: touched.length, imported };
  }

  private async get<T>(setup: Pick<ChannelSetup, 'host' | 'token'>, path: string): Promise<T | null> {
    try {
      const res = await fetch(`${setup.host}${path}`, {
        headers: { Authorization: `Bearer ${setup.token}` },
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
