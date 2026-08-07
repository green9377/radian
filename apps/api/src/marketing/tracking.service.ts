import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { ensureSingleton } from '../common/singleton';
import { IntegrationsService } from '../administration/integrations.service';

/*
  TRACKING — MKT-D15. Every pixel and tag id in one place.

  Pasted once, read by the storefront at run time (7 Aug: the storefront now
  actually reads it — apps/web injects the tags and fires the events,
  including Purchase from the live checkout).

  Note for the cutover: customers are still on the old radianbd.com with its
  own GTM container. Ids pasted here affect only the NEW storefront.

  What Radian can do that no pixel can: send the server-side event, from the
  real order, including the phone, walk-in and foodpanda sales Meta cannot see
  at all. That is what capiDatasetId is for, and it is worth more than
  everything else on this screen put together.
*/

const ENTITY = 'TrackingSetting';

@Injectable()
export class TrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly integrations: IntegrationsService,
  ) {}

  /*  This screen asks two questions at once (the settings and the status), so
      it races on the very first load. Upsert alone does not close that gap —
      see common/singleton.ts. */
  async get() {
    return ensureSingleton(
      () => this.prisma.db.trackingSetting.findUnique({ where: { id: 'singleton' } }),
      () => this.prisma.db.trackingSetting.create({ data: { id: 'singleton' } }),
    );
  }

  async update(dto: Record<string, unknown>, actorName: string) {
    await this.get();
    const data: Prisma.TrackingSettingUpdateInput = {};
    const text = (k: string) =>
      dto[k] === undefined ? undefined : (String(dto[k] ?? '').trim() || null);

    if (dto.enabled !== undefined) data.enabled = !!dto.enabled;
    if (dto.testMode !== undefined) data.testMode = !!dto.testMode;
    if (dto.capiEnabled !== undefined) data.capiEnabled = !!dto.capiEnabled;

    if (dto.gtmId !== undefined) data.gtmId = text('gtmId');
    if (dto.metaPixelId !== undefined) data.metaPixelId = text('metaPixelId');
    if (dto.ga4MeasurementId !== undefined) data.ga4MeasurementId = text('ga4MeasurementId');
    if (dto.googleAdsId !== undefined) data.googleAdsId = text('googleAdsId');
    if (dto.googleAdsConversionLabel !== undefined)
      data.googleAdsConversionLabel = text('googleAdsConversionLabel');
    if (dto.tiktokPixelId !== undefined) data.tiktokPixelId = text('tiktokPixelId');
    if (dto.snapPixelId !== undefined) data.snapPixelId = text('snapPixelId');
    if (dto.pinterestTagId !== undefined) data.pinterestTagId = text('pinterestTagId');
    if (dto.clarityId !== undefined) data.clarityId = text('clarityId');
    if (dto.capiDatasetId !== undefined) data.capiDatasetId = text('capiDatasetId');
    if (dto.capiAccessToken !== undefined) data.capiAccessToken = text('capiAccessToken');

    /*  MKT-D20 — reading the ad account. Separate token from the one above:
        this one needs ads_read, that one needs the dataset permission, and a
        token minted for one will not do the other's job. */
    if (dto.adsEnabled !== undefined) data.adsEnabled = !!dto.adsEnabled;
    if (dto.adAccountId !== undefined) data.adAccountId = text('adAccountId');
    if (dto.adsAccessToken !== undefined) data.adsAccessToken = text('adsAccessToken');
    if (dto.adsCurrency !== undefined)
      data.adsCurrency = (String(dto.adsCurrency ?? '').trim().toUpperCase() || 'USD');

    const row = await this.prisma.db.trackingSetting.update({ where: { id: 'singleton' }, data });

    /*  The access token is a password. It is never written to the audit trail
        and never sent back to any screen — only whether one is set. */
    const safe: Record<string, unknown> = { ...(data as Record<string, unknown>) };
    if ('capiAccessToken' in safe) safe.capiAccessToken = safe.capiAccessToken ? '(set)' : '(cleared)';
    if ('adsAccessToken' in safe) safe.adsAccessToken = safe.adsAccessToken ? '(set)' : '(cleared)';
    await this.audit.record({
      entityType: ENTITY,
      entityId: 'singleton',
      action: 'UPDATE',
      actorName,
      changes: safe,
    });

    return this.forAdmin(row);
  }

  /** the tokens never leave the server — the screen only learns that one exists */
  private forAdmin<T extends { capiAccessToken: string | null; adsAccessToken: string | null }>(
    row: T,
  ) {
    return {
      ...row,
      capiAccessToken: null,
      capiTokenSet: !!row.capiAccessToken,
      adsAccessToken: null,
      adsTokenSet: !!row.adsAccessToken,
    };
  }

  async getForAdmin() {
    return this.forAdmin(await this.get());
  }

  /** what the storefront loads. Public — every id here ends up in the page
      source anyway; the CAPI token, which does not, is left out.

      Ids come through IntegrationsService.credentials(), the one read path:
      an Integration row when the card has been saved, the old TrackingSetting
      columns otherwise. Reading the old columns directly here was the same
      two-homes bug that bit SMS — a pixel id pasted into the card would never
      have reached the storefront. The master on/off and test switches stay on
      TrackingSetting (Marketing → Tracking). */
  async publicConfig() {
    const s = await this.get();
    if (!s.enabled) return { enabled: false as const };

    const read = async (provider: string) => {
      const c = await this.integrations.credentials('ANALYTICS', provider);
      return c.found && c.isEnabled ? c : null;
    };
    const [pixel, ga4, gads, gtm, tiktok, clarity, snap, pin] = await Promise.all([
      read('META_PIXEL'), read('GA4'), read('GOOGLE_ADS_TAG'), read('GTM'),
      read('TIKTOK_PIXEL'), read('CLARITY'), read('SNAP_PIXEL'), read('PINTEREST_TAG'),
    ]);

    return {
      enabled: true as const,
      testMode: s.testMode,
      gtmId: gtm?.clientId ?? null,
      metaPixelId: pixel?.clientId ?? null,
      ga4MeasurementId: ga4?.clientId ?? null,
      googleAdsId: gads?.clientId ?? null,
      googleAdsConversionLabel: gads?.username ?? null,
      tiktokPixelId: tiktok?.clientId ?? null,
      snapPixelId: snap?.clientId ?? null,
      pinterestTagId: pin?.clientId ?? null,
      clarityId: clarity?.clientId ?? null,
    };
  }

  /** which of these are actually doing anything, and what is missing */
  async status() {
    const s = await this.get();
    const set = (v: string | null) => !!v?.trim();

    const platforms = [
      { key: 'gtmId', name: 'Google Tag Manager', hint: 'GTM-XXXXXXX', on: set(s.gtmId) },
      { key: 'metaPixelId', name: 'Meta Pixel (Facebook & Instagram)', hint: '15 or 16 digits', on: set(s.metaPixelId) },
      { key: 'ga4MeasurementId', name: 'Google Analytics 4', hint: 'G-XXXXXXXXXX', on: set(s.ga4MeasurementId) },
      { key: 'googleAdsId', name: 'Google Ads', hint: 'AW-XXXXXXXXX', on: set(s.googleAdsId) },
      { key: 'tiktokPixelId', name: 'TikTok Pixel', hint: 'from TikTok Events Manager', on: set(s.tiktokPixelId) },
      { key: 'snapPixelId', name: 'Snapchat Pixel', hint: 'optional', on: set(s.snapPixelId) },
      { key: 'pinterestTagId', name: 'Pinterest Tag', hint: 'optional', on: set(s.pinterestTagId) },
      { key: 'clarityId', name: 'Microsoft Clarity', hint: 'free session recording', on: set(s.clarityId) },
    ];

    /*  Which events the storefront fires. Purchase became honest on 7 Aug —
        checkout is live and /order-success reports the real order. */
    const events = [
      { name: 'PageView', ready: true, why: 'every page' },
      { name: 'ViewContent', ready: true, why: 'a product page opened' },
      { name: 'Search', ready: true, why: 'somebody searched' },
      { name: 'AddToCart', ready: true, why: 'the basket is local, but the moment is real' },
      { name: 'InitiateCheckout', ready: true, why: 'checkout page opened' },
      { name: 'Purchase', ready: true, why: 'fired on /order-success with the real order number and total' },
    ];

    return {
      enabled: s.enabled,
      testMode: s.testMode,
      platforms,
      liveCount: platforms.filter((p) => p.on).length,
      events,
      capi: {
        enabled: s.capiEnabled,
        datasetSet: set(s.capiDatasetId),
        tokenSet: set(s.capiAccessToken),
        /* blocked for the same reason Purchase is */
        ready: s.capiEnabled && set(s.capiDatasetId) && set(s.capiAccessToken),
      },
      /*  MKT-D20 — reading the ad account. Unlike everything above, this one
          does not depend on the storefront at all: the ads are already running
          and already costing money, so these numbers are real today. */
      ads: {
        enabled: s.adsEnabled,
        accountSet: set(s.adAccountId),
        tokenSet: set(s.adsAccessToken),
        currency: s.adsCurrency ?? 'USD',
        ready: s.adsEnabled && set(s.adAccountId) && set(s.adsAccessToken),
      },
    };
  }
}
