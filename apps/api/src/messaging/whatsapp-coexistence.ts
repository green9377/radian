import { BadRequestException, Body, Controller, Get, Injectable, Logger, Post, Req } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../administration/integrations.service';
import { Roles, type AuthedRequest } from '../auth/auth.guard';

/*
  Coexistence (DEC-WA-009) — the shop's own number in two places at once.

  Normally a number added to the Cloud API leaves the WhatsApp Business app.
  Coexistence is Meta's exception: staff keep answering on the phone, and the
  system sends order and delivery messages on the SAME number. Meta only opens
  it to a Tech Provider, which Radian became on 29 Aug 2026.

  What happens here is only the middle step. The owner presses Connect in the
  admin, Meta's popup takes over (phone number, then a code confirmed inside
  the WhatsApp Business app), and the popup hands back a short-lived code. This
  file exchanges that code for the long-lived token, stores it where every
  other key lives, and asks Meta to replay the phone's contacts and chat
  history — which arrive as webhooks, handled in whatsapp-webhook.ts.

  The 24-hour rule below is Meta's, not ours: sync must be requested within a
  day of onboarding, or the owner has to do the whole flow again.
*/

const GRAPH = 'https://graph.facebook.com/v23.0';

@Injectable()
export class WhatsAppCoexistenceService {
  private readonly log = new Logger('WhatsAppCoexistence');

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
  ) {}

  /**
   * What the browser needs to open Meta's popup. The app secret is NOT here:
   * the exchange happens on the server precisely so the secret never ships to
   * a browser.
   */
  async config() {
    const creds = await this.integrations.credentials('MESSAGING', 'WHATSAPP');
    return {
      appId: process.env.META_APP_ID || '',
      configId: process.env.META_ES_CONFIG_ID || '',
      graphVersion: 'v23.0',
      connected: Boolean(creds?.clientId && creds?.apiKey),
      phoneNumberId: creds?.clientId ?? null,
      wabaId: creds?.username ?? null,
    };
  }

  /**
   * Step 2: the popup's code becomes the token we send with.
   *
   * The phone number is already registered — that happened inside the WhatsApp
   * Business app — so unlike normal onboarding there is no register step here.
   */
  async exchange(code: string, wabaId: string, phoneNumberId: string, actorName: string) {
    if (!code?.trim()) throw new BadRequestException('No code came back from Meta');
    if (!wabaId?.trim() || !phoneNumberId?.trim())
      throw new BadRequestException('Meta did not return the account and number ids');

    /*  The app secret is already on the Integrations screen — the webhook
        signature check reads it from there. Asking the owner to paste it into
        a second place would give one secret two homes, which is exactly what
        the Integrations screen exists to prevent. Env is only a fallback.  */
    const saved = await this.integrations.credentials('MESSAGING', 'WHATSAPP');
    const appId = process.env.META_APP_ID;
    const appSecret =
      saved?.clientSecret?.trim() || process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
    if (!appId)
      throw new BadRequestException('META_APP_ID is not set on the server');
    if (!appSecret)
      throw new BadRequestException(
        'The WhatsApp App secret is empty — fill it in on this screen first',
      );

    const url =
      `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(appId)}` +
      `&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code.trim())}`;

    const res = await fetch(url);
    const json = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      error?: { message?: string };
    };
    if (!res.ok || !json.access_token)
      throw new BadRequestException(json.error?.message || 'Meta refused the code exchange');

    const token = json.access_token;

    /*  The token goes where every other key goes, so the Integrations screen
        keeps being the one place a key lives. `username` carries the WABA id
        and `clientId` the phone number id — the same shape the manifest
        already uses for WhatsApp.  */
    await this.integrations.save(
      'MESSAGING',
      'WHATSAPP',
      { apiKey: token, clientId: phoneNumberId.trim(), username: wabaId.trim(), isEnabled: true },
      actorName,
    );

    // Without this Meta has our token but no idea where to deliver webhooks.
    const sub = await this.post(`${GRAPH}/${wabaId.trim()}/subscribed_apps`, token);
    if (!sub.ok) this.log.warn(`webhook subscribe failed: ${sub.error}`);

    /*  Meta allows each sync exactly once, and only within 24 hours. Failing
        one must not stop the other, so both are attempted and both reported.  */
    const contacts = await this.sync(phoneNumberId.trim(), token, 'smb_app_state_sync');
    const history = await this.sync(phoneNumberId.trim(), token, 'history');

    this.log.log(
      `coexistence connected — waba ${wabaId}, number ${phoneNumberId}, ` +
        `subscribe ${sub.ok ? 'ok' : 'failed'}, contacts ${contacts.ok ? 'requested' : 'failed'}, ` +
        `history ${history.ok ? 'requested' : 'failed'}`,
    );

    return {
      connected: true,
      wabaId: wabaId.trim(),
      phoneNumberId: phoneNumberId.trim(),
      subscribed: sub.ok,
      contactsSync: contacts,
      historySync: history,
    };
  }

  /** Is this number really live on both sides? Meta's own answer, not ours. */
  async status() {
    const creds = await this.integrations.credentials('MESSAGING', 'WHATSAPP');
    const id = creds?.clientId?.trim();
    const token = creds?.apiKey?.trim();
    if (!id || !token) return { connected: false, reason: 'No WhatsApp keys saved yet' };

    const res = await fetch(`${GRAPH}/${id}?fields=is_on_biz_app,platform_type,display_phone_number`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json().catch(() => ({}))) as {
      is_on_biz_app?: boolean;
      platform_type?: string;
      display_phone_number?: string;
      error?: { message?: string };
    };
    if (!res.ok) return { connected: false, reason: json.error?.message || 'Meta did not answer' };

    return {
      connected: Boolean(json.is_on_biz_app) && json.platform_type === 'CLOUD_API',
      onBusinessApp: Boolean(json.is_on_biz_app),
      platformType: json.platform_type ?? null,
      phone: json.display_phone_number ?? null,
    };
  }

  private async sync(phoneNumberId: string, token: string, syncType: 'history' | 'smb_app_state_sync') {
    const res = await fetch(`${GRAPH}/${phoneNumberId}/smb_app_data`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: syncType }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      request_id?: string;
      error?: { message?: string };
    };
    // request_id is worth keeping: Meta support asks for it first.
    return res.ok
      ? { ok: true as const, requestId: json.request_id ?? null }
      : { ok: false as const, error: json.error?.message ?? 'failed' };
  }

  private async post(url: string, token: string) {
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return res.ok ? { ok: true as const } : { ok: false as const, error: json.error?.message ?? 'failed' };
  }
}

@Controller('messaging/coexistence')
export class WhatsAppCoexistenceController {
  constructor(private readonly svc: WhatsAppCoexistenceService) {}

  @Get('config')
  @Roles('OWNER')
  config() {
    return this.svc.config();
  }

  @Get('status')
  @Roles('OWNER', 'MANAGER')
  status() {
    return this.svc.status();
  }

  /** Owner only: this replaces the token every WhatsApp message is sent with. */
  @Post('exchange')
  @Roles('OWNER')
  exchange(
    @Body() b: { code?: string; wabaId?: string; phoneNumberId?: string },
    @Req() req: AuthedRequest,
  ) {
    return this.svc.exchange(
      b?.code ?? '',
      b?.wabaId ?? '',
      b?.phoneNumberId ?? '',
      req.actor?.name ?? 'unknown',
    );
  }
}
