import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

/** the credential fields any provider may use — named, never secret1/secret2 */
export type CredField =
  | 'clientId' | 'clientSecret' | 'username' | 'password'
  | 'apiKey' | 'baseUrl' | 'webhookSecret';

export type IntKind = 'PAYMENT' | 'COURIER' | 'MESSAGING' | 'SOCIAL' | 'ANALYTICS';

/** which of those a provider actually uses, and what to call them on screen */
interface Manifest {
  provider: string;
  label: string;
  kind: IntKind;
  /** in the order they should appear */
  fields: { key: CredField | 'variant'; label: string; hint?: string; secret: boolean }[];
  /** what breaks while this is off */
  matters: string;
  hasSandbox: boolean;
  /** where the CONTENT that uses this connection is edited */
  contentAt?: { label: string; href: string };
  /** the old column this used to live in, so the copy can be verified */
  movedFrom?: string;
}

/**
 * THE MANIFEST — what each service needs, in that service's own words.
 *
 * Kept in code rather than the database on purpose: these are the shapes the
 * providers themselves define, and they change when a provider changes, not
 * when the shop does. A row in a table would invite somebody to "fix" a field
 * name and quietly break a live payment.
 */
export const PROVIDERS: Manifest[] = [
  {
    provider: 'SSLCOMMERZ', label: 'SSLCommerz', kind: 'PAYMENT', hasSandbox: true,
    matters:
      'Card, mobile banking and net banking on the website. Without this key checkout cannot take money at all.',
    fields: [
      { key: 'clientId', label: 'Store ID', secret: false },
      { key: 'clientSecret', label: 'Store password', secret: true },
    ],
  },
  {
    provider: 'BKASH', label: 'bKash', kind: 'PAYMENT', hasSandbox: true,
    matters:
      'bKash payment directly, rather than through SSLCommerz. Lower fee per transaction, one more account to reconcile.',
    fields: [
      { key: 'clientId', label: 'App key', secret: false },
      { key: 'clientSecret', label: 'App secret', secret: true },
      { key: 'username', label: 'Username', secret: false },
      { key: 'password', label: 'Password', secret: true },
    ],
  },
  {
    provider: 'NAGAD', label: 'Nagad', kind: 'PAYMENT', hasSandbox: true,
    matters:
      'Nagad payment directly. Same trade-off as bKash — cheaper per transaction, another account to settle.',
    fields: [
      { key: 'clientId', label: 'Merchant ID', secret: false },
      { key: 'clientSecret', label: 'Private key', secret: true },
      { key: 'baseUrl', label: 'Base URL', secret: false },
    ],
  },
  {
    provider: 'PATHAO', label: 'Pathao Courier', kind: 'COURIER', hasSandbox: true,
    matters:
      'Book a parcel and read its status without typing the consignment number by hand.',
    fields: [
      { key: 'clientId', label: 'Client ID', secret: false },
      { key: 'clientSecret', label: 'Client secret', secret: true },
      { key: 'username', label: 'Username', secret: false },
      { key: 'password', label: 'Password', secret: true },
      { key: 'baseUrl', label: 'Base URL', hint: 'Sandbox and live differ', secret: false },
    ],
  },
  {
    provider: 'STEADFAST', label: 'Steadfast', kind: 'COURIER', hasSandbox: false,
    matters: 'Same as Pathao — booking and tracking without hand-typed numbers.',
    fields: [
      { key: 'apiKey', label: 'API key', secret: true },
      { key: 'clientSecret', label: 'Secret key', secret: true },
    ],
  },
  {
    provider: 'REDX', label: 'RedX', kind: 'COURIER', hasSandbox: false,
    matters: 'Same as the others. Useful where RedX covers an area the rest do not.',
    fields: [{ key: 'apiKey', label: 'Access token', secret: true }],
  },

  /* ---------------- MESSAGING ---------------- */
  {
    provider: 'WHATSAPP', label: 'WhatsApp Business API', kind: 'MESSAGING',
    hasSandbox: false,
    matters:
      'Sending on its own instead of a person pressing the button. ⚠️ The Business APP cannot do this — only the Business API can, and the two are routinely confused.',
    contentAt: { label: 'The message text', href: '/marketing/settings' },
    fields: [
      { key: 'clientId', label: 'Phone number ID', secret: false },
      { key: 'apiKey', label: 'Permanent access token', secret: true },
      { key: 'clientSecret', label: 'App secret', hint: 'Only needed to verify incoming webhooks', secret: true },
      { key: 'webhookSecret', label: 'Webhook verify token', secret: true },
    ],
  },
  {
    provider: 'EMAIL', label: 'Email sending', kind: 'MESSAGING', hasSandbox: false,
    matters:
      'Invite links, password resets and any email campaign. Nothing can be emailed at all until this exists — including the invite links on the Access screen.',
    movedFrom: 'MessagingSetting.emailApiKey',
    fields: [
      { key: 'variant', label: 'Provider', hint: 'BREVO · RESEND · SENDGRID · MAILGUN', secret: false },
      { key: 'apiKey', label: 'API key', secret: true },
      { key: 'username', label: 'From address', hint: 'Must be verified with the provider', secret: false },
      { key: 'clientId', label: 'From name', secret: false },
      { key: 'baseUrl', label: 'Sending domain', hint: 'Mailgun needs this; the others ignore it', secret: false },
    ],
  },
  {
    provider: 'SMS', label: 'SMS sending', kind: 'MESSAGING', hasSandbox: false,
    matters:
      'Text messages. Costs per message and carries no picture — for a flower shop the picture is the product, so WhatsApp usually wins.',
    movedFrom: 'MessagingSetting.smsApiKey',
    fields: [
      { key: 'variant', label: 'Provider', hint: 'BULKSMSBD and similar', secret: false },
      { key: 'apiKey', label: 'API key', secret: true },
      { key: 'username', label: 'Sender ID', secret: false },
      { key: 'baseUrl', label: 'Custom endpoint', hint: 'Only if the provider needs one', secret: false },
    ],
  },

  /* ---------------- SOCIAL ---------------- */
  {
    provider: 'META_ADS', label: 'Meta Ads (Facebook & Instagram)', kind: 'SOCIAL',
    hasSandbox: false,
    matters: 'Reading what the ads actually spent, so reported profit is not overstated.',
    movedFrom: 'TrackingSetting.adsAccessToken',
    fields: [
      { key: 'clientId', label: 'Ad account ID', hint: 'act_XXXXXXXXXX', secret: false },
      { key: 'apiKey', label: 'Access token', secret: true },
      { key: 'variant', label: 'Currency', hint: 'The ad account\'s own currency, not taka', secret: false },
    ],
  },
  {
    provider: 'FACEBOOK_PAGE', label: 'Facebook Page', kind: 'SOCIAL', hasSandbox: false,
    matters:
      'Reading messages and comments from the page. ⚠️ Nothing in Radian uses this yet — the field exists so the token has a home when it does.',
    fields: [
      { key: 'clientId', label: 'Page ID', secret: false },
      { key: 'apiKey', label: 'Page access token', secret: true },
    ],
  },
  {
    provider: 'INSTAGRAM', label: 'Instagram Business', kind: 'SOCIAL', hasSandbox: false,
    matters: 'Same as the Facebook page — a home for the token, not a feature yet.',
    fields: [
      { key: 'clientId', label: 'Instagram account ID', secret: false },
      { key: 'apiKey', label: 'Access token', secret: true },
    ],
  },
  {
    provider: 'GOOGLE_ADS_API', label: 'Google Ads (spend)', kind: 'SOCIAL', hasSandbox: false,
    matters:
      'Reading Google ad spend. ⚠️ Needs a developer token Google approves by hand, and the wait is measured in weeks. Apply, then wait.',
    fields: [
      { key: 'clientId', label: 'Customer ID', secret: false },
      { key: 'apiKey', label: 'Developer token', secret: true },
      { key: 'clientSecret', label: 'OAuth client secret', secret: true },
      { key: 'password', label: 'Refresh token', secret: true },
    ],
  },

  /* ---------------- ANALYTICS ---------------- */
  {
    provider: 'META_PIXEL', label: 'Meta Pixel & Conversions API', kind: 'ANALYTICS',
    hasSandbox: false,
    matters:
      'What the website reports back to Meta. The pixel runs in the browser; the Conversions API sends the same events server-side, which survives ad blockers.',
    movedFrom: 'TrackingSetting.metaPixelId · capiAccessToken',
    fields: [
      { key: 'clientId', label: 'Pixel ID', secret: false },
      { key: 'username', label: 'CAPI dataset ID', secret: false },
      { key: 'apiKey', label: 'CAPI access token', secret: true },
    ],
  },
  {
    provider: 'GA4', label: 'Google Analytics 4', kind: 'ANALYTICS', hasSandbox: false,
    matters: 'Traffic and behaviour reporting.',
    movedFrom: 'TrackingSetting.ga4MeasurementId',
    fields: [{ key: 'clientId', label: 'Measurement ID', hint: 'G-XXXXXXXXXX', secret: false }],
  },
  {
    provider: 'GOOGLE_ADS_TAG', label: 'Google Ads conversion tag', kind: 'ANALYTICS',
    hasSandbox: false,
    matters: 'Telling Google Ads which visits turned into orders.',
    movedFrom: 'TrackingSetting.googleAdsId',
    fields: [
      { key: 'clientId', label: 'Conversion ID', hint: 'AW-XXXXXXXXX', secret: false },
      { key: 'username', label: 'Conversion label', secret: false },
    ],
  },
  {
    provider: 'GTM', label: 'Google Tag Manager', kind: 'ANALYTICS', hasSandbox: false,
    matters: 'One container instead of pasting each tag into the site by hand.',
    movedFrom: 'TrackingSetting.gtmId',
    fields: [{ key: 'clientId', label: 'Container ID', hint: 'GTM-XXXXXXX', secret: false }],
  },
  {
    provider: 'TIKTOK_PIXEL', label: 'TikTok Pixel', kind: 'ANALYTICS', hasSandbox: false,
    matters: 'Only worth switching on if TikTok ads are actually running.',
    movedFrom: 'TrackingSetting.tiktokPixelId',
    fields: [{ key: 'clientId', label: 'Pixel ID', secret: false }],
  },
  {
    provider: 'CLARITY', label: 'Microsoft Clarity', kind: 'ANALYTICS', hasSandbox: false,
    matters: 'Free session recording and heatmaps — useful for seeing where checkout loses people.',
    movedFrom: 'TrackingSetting.clarityId',
    fields: [{ key: 'clientId', label: 'Project ID', secret: false }],
  },
  {
    provider: 'SNAP_PIXEL', label: 'Snapchat Pixel', kind: 'ANALYTICS', hasSandbox: false,
    matters: 'Same as TikTok — only if those ads run.',
    movedFrom: 'TrackingSetting.snapPixelId',
    fields: [{ key: 'clientId', label: 'Pixel ID', secret: false }],
  },
  {
    provider: 'PINTEREST_TAG', label: 'Pinterest Tag', kind: 'ANALYTICS', hasSandbox: false,
    matters: 'Same again.',
    movedFrom: 'TrackingSetting.pinterestTagId',
    fields: [{ key: 'clientId', label: 'Tag ID', secret: false }],
  },
];

/** the five groups, in the order the screen shows them — money first */
export const KINDS: { kind: IntKind; label: string; blurb: string }[] = [
  { kind: 'PAYMENT', label: 'Payment gateways', blurb: 'Getting paid. Being wrong here costs money, not time.' },
  { kind: 'COURIER', label: 'Courier & delivery', blurb: 'Booking parcels and reading their status automatically.' },
  { kind: 'MESSAGING', label: 'Messaging', blurb: 'WhatsApp, email and SMS — how a customer hears from you.' },
  { kind: 'SOCIAL', label: 'Social & ads', blurb: 'Facebook, Instagram and what the advertising actually spent.' },
  { kind: 'ANALYTICS', label: 'Tracking & analytics', blurb: 'Pixels and measurement IDs — what the website reports back.' },
];

/**
 * IntegrationsService — outside services, GROUPED BY WHAT THEY DO. ADM-D09.
 *
 * The owner's instruction, 30 July: split them up — payment gateways in one
 * place, couriers in another. One flat list of keys makes "this one moves money"
 * and "this one moves a parcel" look identical, and they are not remotely the
 * same risk.
 *
 * ⚠️ ONLY payment and courier live here. WhatsApp, email and SMS keys are in
 * MessagingSetting and the pixels are in TrackingSetting — both owned by
 * Marketing. Copying them here would mean the same key in two places with
 * nobody able to say which one the code reads. The screen shows the DOOR to
 * those, not a copy.
 *
 * ⚠️ A secret is NEVER returned in full. `mask()` gives back the last four
 * characters only. A key in a JSON response is a key in the browser cache, in a
 * screenshot, and in whatever logs the response passed through.
 */
@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** "••••3f8a" — enough to tell two keys apart, not enough to use one */
  private mask(v: string | null | undefined): string | null {
    if (!v) return null;
    const t = v.trim();
    if (!t) return null;
    return t.length <= 4 ? '••••' : `••••${t.slice(-4)}`;
  }

  /**
   * Everything, grouped. Payment first — it is the group where being wrong costs
   * money rather than time.
   */
  async overview() {
    const rows = await this.prisma.db.integration.findMany();
    const couriers = await this.prisma.db.courierService.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    });
    const byProvider = new Map(rows.map((r) => [`${r.kind}:${r.provider}`, r]));

    const group = (kind: IntKind) =>
      PROVIDERS.filter((m) => m.kind === kind).map((m) => {
        const row = byProvider.get(`${kind}:${m.provider}`);
        const filled = m.fields.filter(
          (f) => !!(row as Record<string, unknown> | undefined)?.[f.key],
        ).length;
        return {
          provider: m.provider,
          label: m.label,
          kind: m.kind,
          matters: m.matters,
          hasSandbox: m.hasSandbox,
          /*  A key being present is not the same as it working. Both facts are
              reported separately so the screen never says "connected" on the
              strength of a saved string.  */
          fieldsTotal: m.fields.length,
          fieldsFilled: filled,
          isEnabled: row?.isEnabled ?? false,
          isLive: row?.isLive ?? false,
          courierId: row?.courierId ?? null,
          note: row?.note ?? null,
          lastCheckedAt: row?.lastCheckedAt ?? null,
          lastCheckOk: row?.lastCheckOk ?? null,
          lastCheckNote: row?.lastCheckNote ?? null,
          contentAt: m.contentAt ?? null,
          movedFrom: m.movedFrom ?? null,
          fields: m.fields.map((f) => ({
            ...f,
            /*  Non-secret values come back in full — a Store ID or a pixel ID is
                not a secret and hiding it just makes the screen useless. Secrets
                are masked.  */
            value: f.secret
              ? this.mask((row as Record<string, string | null> | undefined)?.[f.key])
              : ((row as Record<string, string | null> | undefined)?.[f.key] ?? null),
          })),
        };
      });

    return {
      /*  All five groups, because the owner's instruction on 30 July was that
          every outside service lives here — Facebook, WhatsApp, Google, Meta,
          all of it. Money first, then parcels, then reach, then measurement.  */
      groups: KINDS.map((k) => ({ ...k, services: group(k.kind) })),
      /*  What is deliberately NOT here: the CONTENT that travels over these
          connections. The WhatsApp message wording, the SEO titles, the loyalty
          rates — those are business rules owned by their own modules. The line
          is connection vs content, and it is what stops a key having two homes.  */
      contentElsewhere: [
        {
          label: 'WhatsApp message wording', owner: 'Marketing',
          href: '/marketing/settings',
          why: 'The connection is here; what it says is a Marketing decision.',
        },
        {
          label: 'SEO titles & verification tags', owner: 'Marketing → SEO',
          href: '/marketing/seo',
          why: 'Page titles and meta tags are page content, not a connection.',
        },
        {
          label: 'Loyalty & referral rates', owner: 'Marketing',
          href: '/marketing/settings',
          why: 'Business rules, with no outside service behind them at all.',
        },
      ],
      /** so a courier integration can be tied to the courier Delivery knows about */
      couriers,
    };
  }

  /**
   * THE SINGLE READ PATH. Every module that needs a key asks here.
   *
   * ⚠️ This is the whole reason moving the keys does not create two sources.
   * `MessagingSetting.emailApiKey` and `TrackingSetting.adsAccessToken` still
   * EXIST — dropping them in the same release that moves them would leave no way
   * back — so this reads the new row first and falls back to the old column,
   * per field. Nobody else may read those columns directly; when they are
   * finally dropped, only this method changes.
   */
  async credentials(kind: IntKind, provider: string) {
    const row = await this.prisma.db.integration.findFirst({ where: { kind, provider } });
    if (row) {
      return {
        found: true as const,
        isEnabled: row.isEnabled,
        isLive: row.isLive,
        clientId: row.clientId, clientSecret: row.clientSecret,
        username: row.username, password: row.password,
        apiKey: row.apiKey, baseUrl: row.baseUrl,
        webhookSecret: row.webhookSecret, variant: row.variant,
      };
    }

    // nothing saved here yet — look where it used to live
    const legacy = await this.legacy(kind, provider);
    return legacy ?? { found: false as const };
  }

  /**
   * The old homes, read once and only from here.
   *
   * This method is the entire remaining coupling to the pre-move world. When the
   * old columns come out, this is what gets deleted — and nothing else has to be
   * hunted for.
   */
  private async legacy(kind: IntKind, provider: string) {
    if (kind === 'MESSAGING' && (provider === 'EMAIL' || provider === 'SMS')) {
      const m = await this.prisma.db.messagingSetting.findFirst();
      if (!m) return null;
      if (provider === 'EMAIL')
        return {
          found: true as const, isEnabled: m.emailEnabled, isLive: true,
          apiKey: m.emailApiKey, variant: m.emailProvider,
          username: m.emailFromAddress, clientId: m.emailFromName,
          baseUrl: m.emailDomain,
          clientSecret: null, password: null, webhookSecret: null,
        };
      return {
        found: true as const, isEnabled: m.smsEnabled, isLive: true,
        apiKey: m.smsApiKey, variant: m.smsProvider,
        username: m.smsSenderId, baseUrl: m.smsCustomUrl,
        clientId: null, clientSecret: null, password: null, webhookSecret: null,
      };
    }

    if (kind === 'SOCIAL' && provider === 'META_ADS') {
      const t = await this.prisma.db.trackingSetting.findFirst();
      if (!t) return null;
      return {
        found: true as const, isEnabled: t.adsEnabled, isLive: true,
        clientId: t.adAccountId, apiKey: t.adsAccessToken, variant: t.adsCurrency,
        clientSecret: null, username: null, password: null,
        baseUrl: null, webhookSecret: null,
      };
    }

    if (kind === 'ANALYTICS') {
      const t = await this.prisma.db.trackingSetting.findFirst();
      if (!t) return null;
      const base = {
        found: true as const, isEnabled: t.enabled, isLive: true,
        clientSecret: null, password: null, baseUrl: null,
        webhookSecret: null, variant: null,
        apiKey: null as string | null, username: null as string | null,
      };
      switch (provider) {
        case 'META_PIXEL':
          return { ...base, clientId: t.metaPixelId, username: t.capiDatasetId, apiKey: t.capiAccessToken };
        case 'GA4': return { ...base, clientId: t.ga4MeasurementId };
        case 'GOOGLE_ADS_TAG':
          return { ...base, clientId: t.googleAdsId, username: t.googleAdsConversionLabel };
        case 'GTM': return { ...base, clientId: t.gtmId };
        case 'TIKTOK_PIXEL': return { ...base, clientId: t.tiktokPixelId };
        case 'CLARITY': return { ...base, clientId: t.clarityId };
        case 'SNAP_PIXEL': return { ...base, clientId: t.snapPixelId };
        case 'PINTEREST_TAG': return { ...base, clientId: t.pinterestTagId };
        default: return null;
      }
    }

    return null;
  }

  /**
   * Save one service's keys.
   *
   * ⚠️ A field left out of the request is left ALONE, and a field sent EMPTY is
   * cleared. That distinction matters because the screen only ever shows a mask:
   * if a blank box meant "clear it", opening the page and pressing Save would
   * wipe every secret on it.
   */
  async save(
    kind: IntKind,
    provider: string,
    dto: Partial<Record<CredField | 'variant', string | null>> & {
      isEnabled?: boolean; isLive?: boolean;
      courierId?: string | null; note?: string | null;
    },
    actorName: string,
  ) {
    const manifest = PROVIDERS.find((m) => m.provider === provider && m.kind === kind);
    if (!manifest) throw new NotFoundException(`${provider} is not a service we support`);

    const data: Record<string, unknown> = {};
    for (const f of manifest.fields) {
      const v = dto[f.key];
      if (v === undefined) continue; // not sent → untouched
      data[f.key] = v === null || v.trim() === '' ? null : v.trim();
    }
    if (dto.note !== undefined) data.note = dto.note?.trim() || null;
    if (dto.courierId !== undefined) data.courierId = dto.courierId || null;
    if (dto.isLive !== undefined) data.isLive = dto.isLive;

    /*  Turning something ON with fields still empty would produce a checkout
        that looks connected and fails at the moment a customer pays. Refuse it
        and say which fields.  */
    if (dto.isEnabled === true) {
      const existing = await this.prisma.db.integration.findFirst({
        where: { kind, provider },
      });
      const missing = manifest.fields.filter((f) => {
        const incoming = dto[f.key];
        const current = (existing as Record<string, string | null> | null)?.[f.key];
        const value = incoming === undefined ? current : incoming;
        return !value || !String(value).trim();
      });
      if (missing.length)
        throw new BadRequestException(
          `${manifest.label} cannot be switched on yet — still needs: ${missing
            .map((f) => f.label)
            .join(', ')}`,
        );
      data.isEnabled = true;
    } else if (dto.isEnabled === false) {
      data.isEnabled = false;
    }

    /*  ⚠️ `deletedAt: null` on the update path — 30 Jul 2026, review.
     *
     *  `upsert` is NOT filtered by the soft-delete extension, but `findMany` IS.
     *  So a soft-deleted Integration row would be found and updated here, stay
     *  soft-deleted, and then never appear on the screen: the owner pastes a key,
     *  is told it saved, and nothing shows up. Silent, and maddening. Clearing
     *  the flag makes save mean save.
     */
    const row = await this.prisma.db.integration.upsert({
      where: { kind_provider: { kind, provider } },
      create: {
        kind, provider, label: manifest.label,
        ...(data as Record<string, never>),
      },
      update: { ...data, deletedAt: null },
    });

    /*  ⚠️ The audit records WHICH fields changed, never their values. A secret
        written into AuditLog is a secret in a table nobody thinks of as secret,
        kept forever, by design.  */
    const touched = Object.keys(data).filter(
      (k) => !['isEnabled', 'isLive', 'note', 'courierId'].includes(k),
    );
    await this.audit.record({
      entityType: 'Integration',
      entityId: row.id,
      action: 'UPDATE',
      actorName,
      changes: {
        provider, kind,
        credentialsChanged: touched.length ? touched : undefined,
        isEnabled: data.isEnabled,
        isLive: data.isLive,
      },
    });

    return { ok: true };
  }

  /**
   * Record the result of a connection test.
   *
   * There is no real call to the provider here yet, and the screen says so. What
   * this does give is a place for the answer, and an honest "never checked"
   * until there is one — which beats a green tick that means "a string is saved".
   */
  async recordCheck(
    kind: IntKind, provider: string,
    ok: boolean, note: string, actorName: string,
  ) {
    const row = await this.prisma.db.integration.findFirst({ where: { kind, provider } });
    if (!row) throw new NotFoundException('Nothing saved for that service yet');
    await this.prisma.db.integration.update({
      where: { id: row.id },
      data: { lastCheckedAt: new Date(), lastCheckOk: ok, lastCheckNote: note.slice(0, 200) },
    });
    await this.audit.record({
      entityType: 'Integration', entityId: row.id, action: 'UPDATE',
      actorName, changes: { checked: provider, ok, note: note.slice(0, 120) },
    });
    return { ok: true };
  }

  /**
   * What Ecommerce needs to know: can the website take money at all?
   *
   * ⚠️ `isLive` is reported separately from `isEnabled`. A gateway switched on
   * with sandbox keys accepts payments that never arrive, and the two states
   * look the same to anybody who is not asked to look.
   */
  async paymentReadiness() {
    const rows = await this.prisma.db.integration.findMany({
      where: { kind: 'PAYMENT', isEnabled: true },
    });
    const live = rows.filter((r) => r.isLive);
    return {
      canTakeMoney: live.length > 0,
      enabled: rows.map((r) => r.provider),
      liveProviders: live.map((r) => r.provider),
      sandboxOnly: rows.filter((r) => !r.isLive).map((r) => r.provider),
      warning:
        rows.length > 0 && live.length === 0
          ? 'A gateway is switched on but all of them are in sandbox — the website would accept payments that never arrive'
          : rows.length === 0
            ? 'No payment gateway is switched on, so checkout cannot take money'
            : null,
    };
  }
}
