import {
  BadRequestException, Body, Controller, Get, Injectable, Logger, Post, Req,
} from '@nestjs/common';
import { InboxChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../administration/integrations.service';
import { Roles } from '../auth/auth.guard';

/*
  Connecting the Facebook Page — the button, not the paste.

  The Page token Radian had been using carried exactly one scope,
  `pages_messaging`. Enough to receive a message and answer it, and not enough
  for anything else: 48 of 49 Messenger threads read "Guest" because reading a
  customer's name needs `pages_read_engagement`, and the webhook subscription
  reads needed `pages_manage_metadata`. Five different field lists were tried
  against a live PSID before this was written, and all five were refused the
  same way, so it is the token and not the request (31 Aug).

  Fixing it by hand would mean generating a token in Meta's Graph Explorer and
  pasting it into a form. A token that has been copied through a clipboard, a
  chat window and a browser field has been somewhere it should never have been.
  So it is a button instead: Meta's popup asks the owner, the CODE comes back to
  the browser, and the code is exchanged for the token HERE — the app secret and
  the token both stay on the server, and nobody ever sees the token at all.

  Same shape as the WhatsApp embedded signup already in whatsapp-coexistence.ts,
  and the token lands where every other key lives, so the Integrations screen
  keeps being the one home for a key.
*/

const GRAPH = 'https://graph.facebook.com/v23.0';

/** What the Page needs and what the old token was missing. */
const SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_read_engagement',
  'pages_manage_metadata',
];

interface MetaPage {
  id: string;
  name?: string;
  access_token?: string;
}

@Injectable()
export class FacebookPageConnectService {
  private readonly log = new Logger('FacebookPageConnect');

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
  ) {}

  /** What the browser needs to open Meta's popup. Never the app secret. */
  async config() {
    const creds = await this.integrations.credentials('SOCIAL', 'FACEBOOK_PAGE');
    return {
      appId: process.env.META_APP_ID || '',
      graphVersion: 'v23.0',
      scopes: SCOPES.join(','),
      connected: Boolean(creds?.apiKey && creds?.clientId),
      pageId: creds?.clientId ?? null,
    };
  }

  /**
   * What Meta says this token can actually do — its own answer, not ours.
   * A connect screen that only ever says "connected" is how a token quietly
   * lost three scopes and nobody noticed for weeks.
   */
  async status() {
    const creds = await this.integrations.credentials('SOCIAL', 'FACEBOOK_PAGE');
    const token = creds?.apiKey?.trim();
    if (!token) return { connected: false, reason: 'No Page token saved yet' };

    const appSecret = await this.appSecret();
    if (!appSecret) return { connected: true, reason: 'App secret missing, cannot inspect the token' };

    const res = await fetch(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}` +
        `&access_token=${encodeURIComponent(`${process.env.META_APP_ID}|${appSecret}`)}`,
    );
    const j = (await res.json().catch(() => ({}))) as {
      data?: { scopes?: string[]; is_valid?: boolean; profile_id?: string };
    };
    const scopes = j.data?.scopes ?? [];
    return {
      connected: true,
      valid: j.data?.is_valid ?? false,
      pageId: j.data?.profile_id ?? creds?.clientId ?? null,
      scopes,
      missing: SCOPES.filter((s) => !scopes.includes(s)),
    };
  }

  /**
   * The popup's code becomes a Page token, here on the server.
   *
   * Meta hands back a USER token; the Page token is a separate thing fetched
   * with it from /me/accounts. Saving the user token instead is the mistake
   * that looks like it works — sending a message with it fails only later.
   */
  async exchange(code: string, actorName: string) {
    if (!code?.trim()) throw new BadRequestException('No code came back from Meta');

    const appId = process.env.META_APP_ID;
    const appSecret = await this.appSecret();
    if (!appId) throw new BadRequestException('META_APP_ID is not set on the server');
    if (!appSecret) throw new BadRequestException('The Meta app secret is empty — fill it in on this screen first');

    const res = await fetch(
      `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(appId)}` +
        `&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code.trim())}`,
    );
    const json = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      error?: { message?: string };
    };
    if (!res.ok || !json.access_token) {
      throw new BadRequestException(json.error?.message || 'Meta refused the code exchange');
    }

    const pages = await this.pages(json.access_token);
    if (!pages.length) {
      throw new BadRequestException(
        'That account manages no Page the app can see. Pick the Radian Page in the popup and try again.',
      );
    }

    /*  If a Page is already saved, keep the same one rather than silently
        moving the shop's inbox to whichever Page happens to come back first.  */
    const saved = await this.integrations.credentials('SOCIAL', 'FACEBOOK_PAGE');
    const wanted = saved?.clientId?.trim();
    const page = (wanted && pages.find((p) => p.id === wanted)) || pages[0];
    if (!page.access_token) {
      throw new BadRequestException(`Meta returned no token for the Page "${page.name ?? page.id}"`);
    }

    await this.integrations.save(
      'SOCIAL',
      'FACEBOOK_PAGE',
      { apiKey: page.access_token, clientId: page.id, isEnabled: true },
      actorName,
    );

    const after = await this.status();
    this.log.log(
      `Page connected — ${page.name ?? page.id} (${page.id}), ` +
        `missing scopes: ${(after as { missing?: string[] }).missing?.join(',') || 'none'}`,
    );
    return { connected: true, pageId: page.id, pageName: page.name ?? null, ...after };
  }

  /**
   * Fill in the names of threads that have been reading "Guest".
   *
   * Run after connecting, so the 48 threads that arrived while the token was
   * too narrow are repaired at once instead of waiting for each of those
   * customers to write again — some of them never will.
   */
  async backfillNames(limit = 500) {
    const creds = await this.integrations.credentials('SOCIAL', 'FACEBOOK_PAGE');
    const token = creds?.apiKey?.trim();
    if (!token) return { ran: false, reason: 'No Page token saved yet', looked: 0, named: 0 };

    const rows = await this.prisma.db.conversation.findMany({
      where: {
        channel: InboxChannel.MESSENGER,
        deletedAt: null,
        OR: [{ guestName: null }, { guestName: '' }],
        externalIdentity: { not: null },
      },
      select: { id: true, externalIdentity: true },
      take: limit,
    });

    let named = 0;
    const refusals: string[] = [];
    for (const r of rows) {
      const name = await this.profileName(r.externalIdentity as string, token, refusals);
      if (!name) continue;
      await this.prisma.db.conversation.update({ where: { id: r.id }, data: { guestName: name } });
      named += 1;
    }

    this.log.log(`name backfill — looked at ${rows.length}, named ${named}`);
    return {
      ran: true,
      looked: rows.length,
      named,
      // Meta's own words when it refused, so a zero is never a mystery.
      firstRefusal: refusals[0] ?? null,
    };
  }

  private async profileName(psid: string, token: string, refusals: string[]): Promise<string | null> {
    try {
      const res = await fetch(`${GRAPH}/${psid}?fields=first_name,last_name`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (refusals.length < 3) refusals.push((await res.text()).slice(0, 200));
        return null;
      }
      const j = (await res.json()) as { first_name?: string; last_name?: string };
      const name = [j.first_name, j.last_name].filter(Boolean).join(' ').trim();
      return name ? name.slice(0, 120) : null;
    } catch {
      return null;
    }
  }

  private async pages(userToken: string): Promise<MetaPage[]> {
    const res = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const j = (await res.json().catch(() => ({}))) as {
      data?: MetaPage[];
      error?: { message?: string };
    };
    if (!res.ok) throw new BadRequestException(j.error?.message || 'Meta refused to list the Pages');
    return j.data ?? [];
  }

  /*  The app secret already has a home on the Integrations screen — the webhook
      signature check reads it from there. Env is only a fallback.  */
  private async appSecret(): Promise<string | null> {
    const wa = await this.integrations.credentials('MESSAGING', 'WHATSAPP').catch(() => null);
    if (wa?.clientSecret?.trim()) return wa.clientSecret.trim();
    const fb = await this.integrations.credentials('SOCIAL', 'FACEBOOK_PAGE').catch(() => null);
    if (fb?.clientSecret?.trim()) return fb.clientSecret.trim();
    return process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET || null;
  }
}

interface ActorRequest {
  actor?: { id: string; name: string; role: string };
}

@Controller('messaging/facebook-page')
export class FacebookPageConnectController {
  constructor(private readonly svc: FacebookPageConnectService) {}

  @Get('config')
  @Roles('OWNER', 'MANAGER')
  config() {
    return this.svc.config();
  }

  @Get('status')
  @Roles('OWNER', 'MANAGER')
  status() {
    return this.svc.status();
  }

  @Post('exchange')
  @Roles('OWNER')
  exchange(@Body() dto: { code?: string }, @Req() req: ActorRequest) {
    return this.svc.exchange(dto?.code ?? '', req.actor?.name ?? 'system');
  }

  @Post('backfill-names')
  @Roles('OWNER', 'MANAGER')
  backfill() {
    return this.svc.backfillNames();
  }
}
