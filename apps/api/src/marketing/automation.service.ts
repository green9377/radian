import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { CampaignsService } from './campaigns.service';
import { AttributionService } from './attribution.service';
import { AffiliatesService } from './affiliates.service';
import { ReferralService } from './referral.service';
import { LoyaltyService } from './loyalty.service';

/*  MARKETING AUTOMATION — MKT-D14.

    The old module map listed "Marketing Automation" as a module of its own,
    next to a workflow builder. It is not a module. It is five things that were
    already written and that nobody was calling:

      1  a delivered order earns its affiliate's commission          (MKT-RULE-012)
      2  commission past its hold becomes withdrawable               (MKT-D10)
      3  a cancelled or fully-returned order gives the money back    (MKT-RULE-014)
      4  a campaign starts and finishes on the dates it was given
      5  recent orders are re-checked for where they came from       (MKT-D02)

    RECONCILIATION, NOT HOOKS. The obvious design is to call these from
    OrdersService.delivered() and ReturnsService.complete(). It was considered
    and rejected: a hook that fails, fails silently, and nobody finds out for a
    month. That is precisely why Finance has a drift checker, and why HR's
    worst bug survived a design review, a code read and daily use of the
    screens. This asks the orders what actually happened and makes the
    commission ledger agree — so a missed event repairs itself on the next run
    instead of becoming a permanent hole.

    Everything here is idempotent. Running it twice does nothing the second
    time: the (orderId, affiliateId) unique stops a double accrual, and
    postEntry()'s sourceKey stops a double ledger entry (DEC-FIN-023).

    Rhythm, borrowed from FinanceDriftService because it works:
      · every 15 minutes while the API is up — a light pass over recent days
      · 2 AM Bangladesh time — a wide pass, and an audit record of the result
      · 90 seconds after boot — because a shop laptop is usually off at 2 AM
*/

const BD_OFFSET_MS = 6 * 60 * 60 * 1000;
const NIGHTLY_HOUR_BD = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
const LIGHT_EVERY_MS = 15 * 60 * 1000;

/** how far back each pass looks */
const LIGHT_DAYS = 14;
const NIGHTLY_DAYS = 120;

export interface AutomationResult {
  at: string;
  scope: 'light' | 'nightly' | 'manual';
  days: number;
  accrued: number;
  released: number;
  reversed: number;
  campaignsStarted: number;
  campaignsFinished: number;
  ordersChecked: number;
  stillUnattributed: number;
  referralRewarded: number;
  referralReversed: number;
  loyaltyEarned: number;
  loyaltyReversed: number;
  errors: string[];
  ms: number;
}

@Injectable()
export class MarketingAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketingAutomationService.name);
  private nightlyTimer?: NodeJS.Timeout;
  private lightTimer?: NodeJS.Timeout;
  private running = false;
  private last?: AutomationResult;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly campaigns: CampaignsService,
    private readonly attribution: AttributionService,
    private readonly affiliates: AffiliatesService,
    private readonly referral: ReferralService,
    private readonly loyalty: LoyaltyService,
  ) {}

  onModuleInit() {
    this.scheduleNightly();
    this.lightTimer = setInterval(() => void this.safeRun('light'), LIGHT_EVERY_MS);
    this.lightTimer.unref?.();
    // the shop laptop is not on at 2 AM, so catch up shortly after boot
    setTimeout(() => void this.safeRun('light'), 90_000).unref?.();
  }

  onModuleDestroy() {
    if (this.nightlyTimer) clearTimeout(this.nightlyTimer);
    if (this.lightTimer) clearInterval(this.lightTimer);
  }

  private scheduleNightly() {
    const now = Date.now();
    const bdNow = new Date(now + BD_OFFSET_MS);
    const next =
      Date.UTC(bdNow.getUTCFullYear(), bdNow.getUTCMonth(), bdNow.getUTCDate(), NIGHTLY_HOUR_BD) -
      BD_OFFSET_MS;
    const at = next > now ? next : next + DAY_MS;
    this.nightlyTimer = setTimeout(() => {
      void this.safeRun('nightly');
      this.scheduleNightly();
    }, at - now);
    this.nightlyTimer.unref?.();
    this.logger.log(`next marketing sweep at ${new Date(at).toISOString()}`);
  }

  /** never let a background failure take the API down with it */
  private async safeRun(scope: 'light' | 'nightly') {
    try {
      await this.run(scope);
    } catch (e) {
      this.logger.error(`marketing sweep failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  lastRun(): AutomationResult | null {
    return this.last ?? null;
  }

  /** History, read from the audit trail — no table of its own. */
  async history(limit = 20) {
    return this.prisma.db.auditLog.findMany({
      where: { entityType: ENTITY },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async run(scope: 'light' | 'nightly' | 'manual' = 'manual'): Promise<AutomationResult> {
    if (this.running) {
      return this.last ?? emptyResult(scope);
    }
    this.running = true;
    const started = Date.now();
    const days = scope === 'light' ? LIGHT_DAYS : NIGHTLY_DAYS;
    const errors: string[] = [];

    let accrued = 0;
    let released = 0;
    let reversed = 0;
    let campaignsStarted = 0;
    let campaignsFinished = 0;
    let ordersChecked = 0;
    let stillUnattributed = 0;
    let referralRewarded = 0;
    let referralReversed = 0;
    let loyaltyEarned = 0;
    let loyaltyReversed = 0;

    try {
      /*  ORDER MATTERS.
          Attribution first — a commission cannot be earned on an order until
          somebody knows whose link brought it. Then reversals, so money that
          should come back is not paid out by a release a moment later. Then
          accrual and release. */
      try {
        const from = new Date(Date.now() - days * 864e5).toISOString();
        const r = await this.attribution.runAll(from);
        ordersChecked = r.scanned;
        stillUnattributed = r.unattributed;
      } catch (e) {
        errors.push(`attribution: ${msg(e)}`);
      }

      try {
        const r = await this.affiliates.reconcileReversals(scope === 'light' ? 60 : 365);
        reversed = r.reversed;
      } catch (e) {
        errors.push(`reversals: ${msg(e)}`);
      }

      try {
        const r = await this.affiliates.accrueAll(days);
        accrued = r.accrued;
      } catch (e) {
        errors.push(`accrual: ${msg(e)}`);
      }

      try {
        const r = await this.affiliates.releaseHolds();
        released = r.released;
      } catch (e) {
        errors.push(`hold release: ${msg(e)}`);
      }

      try {
        const r = await this.campaigns.advanceStatuses();
        campaignsStarted = r.started;
        campaignsFinished = r.finished;
      } catch (e) {
        errors.push(`campaign status: ${msg(e)}`);
      }

      /*  MKT-D16 — referral points. Reversal first for the same reason as the
          affiliate side: money that should come back must not be handed out
          again a moment later. */
      try {
        const back = await this.referral.reconcile(scope === 'light' ? 60 : 365);
        referralReversed = back.reversed;
        const paid = await this.referral.rewardAll(days);
        referralRewarded = paid.rewarded;
      } catch (e) {
        errors.push(`referral: ${msg(e)}`);
      }

      /*  MKT-D21 — loyalty points. Same order and the same reason: take back
          before handing out. This does nothing at all while the scheme is
          switched off, which it is until the radianbd.com balances land. */
      try {
        const l = await this.loyalty.reconcile(scope === 'light' ? 60 : 365);
        loyaltyEarned = l.earned;
        loyaltyReversed = l.reversed;
      } catch (e) {
        errors.push(`loyalty: ${msg(e)}`);
      }

      const result: AutomationResult = {
        at: new Date().toISOString(),
        scope,
        days,
        accrued,
        released,
        reversed,
        campaignsStarted,
        campaignsFinished,
        ordersChecked,
        stillUnattributed,
        referralRewarded,
        referralReversed,
        loyaltyEarned,
        loyaltyReversed,
        errors,
        ms: Date.now() - started,
      };
      this.last = result;

      /*  Only write to the audit trail when something actually happened, or on
          the nightly run. A quarter-hourly "nothing to do" would bury the real
          entries under thousands of empty ones and make the log useless. */
      const didSomething =
        accrued + released + reversed + campaignsStarted + campaignsFinished +
          referralRewarded + referralReversed +
          loyaltyEarned + loyaltyReversed > 0 ||
        errors.length > 0;
      if (scope !== 'light' || didSomething) {
        await this.audit.record({
          entityType: ENTITY,
          entityId: 'marketing',
          action: 'UPDATE',
          actorName: 'automation',
          changes: result as unknown as Record<string, unknown>,
        });
      }
      if (didSomething) {
        this.logger.log(
          `marketing sweep (${scope}): ${accrued} accrued, ${released} released, ${reversed} reversed, ${campaignsStarted}/${campaignsFinished} campaign status` +
            (errors.length ? `, ${errors.length} error(s)` : ''),
        );
      }
      return result;
    } finally {
      this.running = false;
    }
  }
}

const ENTITY = 'MarketingAutomation';

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function emptyResult(scope: 'light' | 'nightly' | 'manual'): AutomationResult {
  return {
    at: new Date().toISOString(),
    scope,
    days: 0,
    accrued: 0,
    released: 0,
    reversed: 0,
    campaignsStarted: 0,
    campaignsFinished: 0,
    ordersChecked: 0,
    stillUnattributed: 0,
    referralRewarded: 0,
    referralReversed: 0,
    loyaltyEarned: 0,
    loyaltyReversed: 0,
    errors: ['a sweep was already running — nothing to do'],
    ms: 0,
  };
}
