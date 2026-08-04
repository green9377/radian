import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { TrackingService } from './tracking.service';

/*
  META ADS — MKT-D20. Reading what the advertising actually cost.

  This is the opposite direction to the Conversions API next door: that one
  SENDS Meta what happened in the shop, this one READS what Meta charged. It
  needs a different permission (ads_read) and therefore its own token.

  WHAT IT IS FOR. Today the owner types the Facebook spend into Finance by
  hand off a card statement, and tags it to a campaign. That works, and it is
  the reason the ROI figures exist at all. What it cannot tell him is which of
  three ads inside the occasion did the work, or what the cost per click was —
  and going to look means leaving the panel.

  ⚠️ THIS IS NOT THE MONEY, AND THE SCREEN SAYS SO.

  Meta reports what it billed, in the ad account's currency — for most
  Bangladeshi accounts that is US dollars. The bank charges something else
  entirely once the conversion rate, the card fee and the government's
  levies land. Both numbers are true and they will never agree.

  So the ledger is not touched from here. There is a button that PRE-FILLS a
  Finance expense and a person confirms the real taka amount from the
  statement. Finance keeps ownership of every taka (MKT-D05), and the books
  keep agreeing with the bank rather than with Facebook.

  CACHED, NOT LIVE. Meta rate-limits an ad account hard enough that a busy
  afternoon of screen refreshes starts returning errors instead of numbers. So
  a pull writes rows, and the screen reads rows.
*/

const GRAPH = 'https://graph.facebook.com/v21.0';

@Injectable()
export class AdsService {
  private readonly logger = new Logger(AdsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tracking: TrackingService,
  ) {}

  /* ---------------- talking to Meta ---------------- */

  private async creds() {
    const s = await this.tracking.get();
    if (!s.adsEnabled) throw new BadRequestException('Reading the ad account is switched off');
    if (!s.adAccountId) throw new BadRequestException('No ad account id has been saved');
    if (!s.adsAccessToken) throw new BadRequestException('No ads token has been saved');
    const acct = s.adAccountId.trim().startsWith('act_')
      ? s.adAccountId.trim()
      : `act_${s.adAccountId.trim()}`;
    return { acct, token: s.adsAccessToken, currency: s.adsCurrency ?? 'USD' };
  }

  private async graph(path: string, params: Record<string, string>, token: string) {
    const q = new URLSearchParams({ ...params, access_token: token });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const r = await fetch(`${GRAPH}${path}?${q.toString()}`, { signal: controller.signal });
      const text = await r.text();
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* not JSON */ }

      if (!r.ok) {
        /*  Meta's errors are actually informative if you read the nested bit,
            and useless if you only print the status code. */
        const err = body.error as { message?: string; type?: string; code?: number } | undefined;
        throw new Error(
          err?.message
            ? `Meta says: ${err.message}${err.code ? ` (code ${err.code})` : ''}`
            : `Meta answered ${r.status}: ${text.slice(0, 300)}`,
        );
      }
      return body;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      throw new Error(m === 'The operation was aborted.' ? 'Meta did not answer in 30 seconds' : m);
    } finally {
      clearTimeout(timer);
    }
  }

  /** prove the token works before anything depends on it */
  async test() {
    const { acct, token } = await this.creds();
    const body = await this.graph(
      `/${acct}`,
      { fields: 'id,name,account_status,currency,amount_spent' },
      token,
    );
    const status = Number(body.account_status ?? 0);
    return {
      ok: true,
      id: String(body.id ?? ''),
      name: String(body.name ?? ''),
      currency: String(body.currency ?? ''),
      active: status === 1,
      /*  status 2 is the one that matters and the one nobody notices — the
          account is disabled and every ad has silently stopped. */
      note:
        status === 1
          ? 'The account is active.'
          : status === 2
            ? 'The account is DISABLED — nothing is running.'
            : `Account status is ${status}.`,
    };
  }

  /* ---------------- pulling the numbers ---------------- */

  async pull(days = 30, actorName = 'system') {
    const { acct, token, currency } = await this.creds();
    const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);

    const body = await this.graph(
      `/${acct}/insights`,
      {
        level: 'campaign',
        fields: 'campaign_id,campaign_name,spend,impressions,clicks,reach,date_start',
        time_range: JSON.stringify({ since, until }),
        time_increment: '1', // one row per day, so a date range can be summed later
        limit: '500',
      },
      token,
    );

    const rows = (body.data ?? []) as Record<string, string>[];
    let written = 0;
    for (const r of rows) {
      const onDate = new Date(`${r.date_start}T00:00:00.000Z`);
      // spend arrives as "12.34" — money never becomes a float here either
      const spendMinor = Math.round(parseFloat(r.spend ?? '0') * 100);

      await this.prisma.adInsight.upsert({
        where: {
          platform_accountId_externalCampaignId_onDate: {
            platform: 'META',
            accountId: acct,
            externalCampaignId: r.campaign_id,
            onDate,
          },
        },
        create: {
          platform: 'META',
          accountId: acct,
          externalCampaignId: r.campaign_id,
          externalCampaignName: r.campaign_name ?? null,
          onDate,
          spendMinor,
          currency,
          impressions: parseInt(r.impressions ?? '0', 10) || 0,
          clicks: parseInt(r.clicks ?? '0', 10) || 0,
          reach: parseInt(r.reach ?? '0', 10) || 0,
        },
        update: {
          externalCampaignName: r.campaign_name ?? null,
          spendMinor,
          currency,
          impressions: parseInt(r.impressions ?? '0', 10) || 0,
          clicks: parseInt(r.clicks ?? '0', 10) || 0,
          reach: parseInt(r.reach ?? '0', 10) || 0,
          fetchedAt: new Date(),
        },
      });
      written += 1;
    }

    await this.audit.record({
      entityType: 'AdInsight',
      entityId: acct,
      action: 'UPDATE',
      actorName,
      changes: { days, rows: written },
    });
    return { days, since, until, rows: written, currency };
  }

  /* ---------------- reading them back ---------------- */

  /** grouped by Meta campaign, with whichever Radian campaign it is tied to */
  async summary(days = 30, accountId?: string) {
    const since = new Date(Date.now() - days * 864e5);
    const s0 = await this.tracking.get();
    /*  Scoped to ONE ad account. If the shop ever moves to a second account,
        rows from the old one must not quietly join the totals — that would
        report a spend nobody made this month. */
    const acct =
      accountId ??
      (s0.adAccountId
        ? s0.adAccountId.trim().startsWith('act_')
          ? s0.adAccountId.trim()
          : `act_${s0.adAccountId.trim()}`
        : undefined);

    const rows = await this.prisma.db.adInsight.findMany({
      where: { onDate: { gte: since }, ...(acct ? { accountId: acct } : {}) },
      orderBy: { onDate: 'desc' },
    });

    const byCampaign = new Map<
      string,
      { id: string; name: string; spendMinor: number; impressions: number; clicks: number; reach: number; currency: string; lastDay: Date }
    >();
    for (const r of rows) {
      const cur = byCampaign.get(r.externalCampaignId) ?? {
        id: r.externalCampaignId,
        name: r.externalCampaignName ?? r.externalCampaignId,
        spendMinor: 0, impressions: 0, clicks: 0, reach: 0,
        currency: r.currency,
        lastDay: r.onDate,
      };
      cur.spendMinor += r.spendMinor;
      cur.impressions += r.impressions;
      cur.clicks += r.clicks;
      cur.reach = Math.max(cur.reach, r.reach); // reach does not add up across days
      if (r.onDate > cur.lastDay) cur.lastDay = r.onDate;
      byCampaign.set(r.externalCampaignId, cur);
    }

    /*  Every campaign, not only the linked ones — this list is what the
        dropdown on the screen is built from, and a dropdown that only offers
        campaigns which are already linked can never make the first link. */
    const campaigns = await this.prisma.db.campaign.findMany({
      where: { status: { not: 'ARCHIVED' } },
      select: { id: true, campaignNo: true, name: true, metaCampaignIds: true },
      orderBy: { startDate: 'desc' },
      take: 200,
    });
    const linkOf = (extId: string) =>
      campaigns.find((c) => c.metaCampaignIds.includes(extId)) ?? null;

    const items = [...byCampaign.values()]
      .map((c) => ({
        ...c,
        ctr: c.impressions > 0 ? c.clicks / c.impressions : 0,
        cpcMinor: c.clicks > 0 ? Math.round(c.spendMinor / c.clicks) : 0,
        linkedTo: linkOf(c.id),
      }))
      .sort((a, b) => b.spendMinor - a.spendMinor);

    const s = await this.tracking.get();
    return {
      days,
      currency: items[0]?.currency ?? s.adsCurrency ?? 'USD',
      /*  Whether the reported spend can be treated as taka at all. If the ad
          account bills in dollars, it cannot — and the screen must not offer
          to write it into the books as though it could. */
      isTaka: (items[0]?.currency ?? s.adsCurrency) === 'BDT',
      totalSpendMinor: items.reduce((n, c) => n + c.spendMinor, 0),
      totalClicks: items.reduce((n, c) => n + c.clicks, 0),
      totalImpressions: items.reduce((n, c) => n + c.impressions, 0),
      lastFetched: rows[0]?.fetchedAt ?? null,
      items,
      campaigns: campaigns.map((c) => ({ id: c.id, campaignNo: c.campaignNo, name: c.name })),
    };
  }

  /** tie a Meta campaign to one of ours, so its spend has a home */
  async link(externalCampaignId: string, campaignId: string | null, actorName: string) {
    // remove it from wherever it was, so it can only ever belong to one
    const holders = await this.prisma.db.campaign.findMany({
      where: { metaCampaignIds: { has: externalCampaignId } },
      select: { id: true, metaCampaignIds: true },
    });
    for (const h of holders) {
      if (h.id === campaignId) continue;
      await this.prisma.db.campaign.update({
        where: { id: h.id },
        data: { metaCampaignIds: h.metaCampaignIds.filter((x) => x !== externalCampaignId) },
      });
    }

    if (!campaignId) return { externalCampaignId, campaignId: null };

    const c = await this.prisma.db.campaign.findUnique({ where: { id: campaignId } });
    if (!c) throw new BadRequestException('That campaign does not exist');
    if (!c.metaCampaignIds.includes(externalCampaignId)) {
      await this.prisma.db.campaign.update({
        where: { id: campaignId },
        data: { metaCampaignIds: [...c.metaCampaignIds, externalCampaignId] },
      });
    }
    await this.audit.record({
      entityType: 'Campaign',
      entityId: campaignId,
      action: 'UPDATE',
      actorName,
      changes: { linkedMetaCampaign: externalCampaignId },
    });
    return { externalCampaignId, campaignId };
  }
}
