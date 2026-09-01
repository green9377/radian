import { Injectable, Logger, Optional } from '@nestjs/common';
import { ActivityKind, OutboundBreachAction, OutboundLimitMetric, OutboundLimitScope } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { DEFAULT_DECLARED_BATCH } from './outbound-limits.const';
import { OutboundSettingsService } from './outbound-settings.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  OUTBOUND GUARD — the last thing a message passes before it leaves the shop.

  ── WHAT IT IS NOT ──────────────────────────────────────────────────────────
  It does not ask who the recipient is. There is no allowlist here and there
  never will be: development is a full rehearsal of the real system, and an
  authorised person must be able to message ANY real number on purpose
  (owner, 2 Sep 2026). The first version of this file gated on the recipient
  and was ruled out for exactly that reason.

  ── WHAT IT IS ──────────────────────────────────────────────────────────────
  It stops the message NOBODY MEANT TO SEND. The insight the whole design
  rests on: an accident is never "one wrong person", it is "more than anyone
  intended" - a loop, a duplicate job, an automation firing when it should
  not, a bulk send larger than the one that was confirmed. So the questions
  are how many, how fast, and did anybody declare it.

  ── THE ORDER, AND WHY ──────────────────────────────────────────────────────
    0  manual kill      a person chose silence: EVERYTHING stops, including
                        the escalation SMS, because they already know
    1  class            CUSTOMER or OPERATIONAL
    2  breaker          the SYSTEM chose silence: customer messages stop and
                        the operational alert still goes, or the shop falls
                        quiet at the exact moment somebody must be told
    3  declared batch   a loop never declares thirty thousand. It declares one
                        and calls thirty thousand times, and dies here
    4  repeat guard     the same person, the same message, twice
    5  velocity         totals, and how many DIFFERENT people were reached
    6  audit            a block that says nothing is the failure this file
                        exists to prevent

  ⚠️ It sits INSIDE the three doors, immediately before the provider call, and
  never at the callers. OTP, order messages, the sweeper, the AI agent, the
  inbox reply button and the admin's test button are callers; a check at a
  caller is a check the next caller forgets.
*/

export type OutboundChannel = 'SMS' | 'EMAIL' | 'WHATSAPP' | 'MESSENGER' | 'INSTAGRAM';

/**
 * CUSTOMER is anything a customer receives - including an AI reply.
 * OPERATIONAL is the shop telling itself something is wrong.
 */
export type OutboundClass = 'CUSTOMER' | 'OPERATIONAL';

export interface OutboundRequest {
  channel: OutboundChannel;
  recipient: string;
  /** otp · order-message · abandoned-cart · campaign · inbox-reply · ai-reply · escalation · manual-test */
  origin: string;
  /** what kind of message, for the repeat guard. Defaults to the origin. */
  kind?: string;
  /** the declared send this message belongs to, if any */
  batchId?: string;
}

export interface GuardVerdict {
  allowed: boolean;
  /** Plain English, shown to a person. Never a code. */
  reason?: string;
}

export interface BlockedNote {
  at: string;
  channel: OutboundChannel;
  origin: string;
  /** masked - a list of refusals is not a place to keep phone numbers */
  recipient: string;
  reason: string;
}

const KEEP_NOTES = 50;

/** ORIGINS that are the shop talking to itself, not to a customer. */
const OPERATIONAL_ORIGINS = new Set(['escalation', 'breach-alert']);

/** A number is the same number however it was typed. */
export function normaliseRecipient(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  if (s.includes('@')) return s.toLowerCase();
  const digits = s.replace(/\D/g, '');
  if (!digits) return s.toLowerCase();
  if (digits.length === 13 && digits.startsWith('880')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('01')) return digits;
  if (digits.length === 10 && digits.startsWith('1')) return '0' + digits;
  return digits;
}

/** Enough to recognise a number in a log, not enough to message it. */
export function maskRecipient(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '(none)';
  if (s.includes('@')) {
    const [user, domain] = s.split('@');
    return `${user.slice(0, 2)}***@${domain ?? ''}`;
  }
  return s.length <= 6 ? s : `${s.slice(0, 4)}***${s.slice(-2)}`;
}

export function classOf(origin: string): OutboundClass {
  return OPERATIONAL_ORIGINS.has(origin) ? 'OPERATIONAL' : 'CUSTOMER';
}

interface SentRecord {
  at: number;
  who: string;
  channel: OutboundChannel;
  origin: string;
  kind: string;
}

@Injectable()
export class OutboundGuard {
  private readonly log = new Logger('OutboundGuard');

  /*  Counters live in the process. The STATE that matters - the kill switch
      and the breaker - lives in the database, so one container tripping stops
      every container. A second container would count its own five hundred;
      it could not, however, keep sending after the first one tripped.  */
  private sent: SentRecord[] = [];

  /** declared size per batch, learned from the caller or from the database */
  private batches = new Map<string, { declared: number; actual: number }>();

  private readonly notes: BlockedNote[] = [];

  constructor(
    private readonly settings: OutboundSettingsService,
    private readonly prisma: PrismaService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  /** DEV unless the stack says live - used only for the [DEV] label. */
  isDevStack(): boolean {
    const s = (process.env.STACK ?? '').trim().toLowerCase();
    return !(s === 'live' || s === 'prod' || s === 'production');
  }

  /**
   * Register a declared send. The bulk flow calls this after confirmation;
   * anything else may call it before starting a run of known size.
   */
  registerBatch(batchId: string, declaredCount: number): void {
    this.batches.set(batchId, {
      declared: Math.max(1, Math.trunc(declaredCount)),
      actual: this.batches.get(batchId)?.actual ?? 0,
    });
  }

  /** For the tests and the admin screen. */
  batchState(batchId: string) {
    return this.batches.get(batchId);
  }

  /**
   * The whole decision. Call it immediately before the provider call, never
   * earlier - anything between the check and the fetch is a gap.
   */
  async check(req: OutboundRequest): Promise<GuardVerdict> {
    const who = normaliseRecipient(req.recipient);
    const kind = req.kind ?? req.origin;
    const klass = classOf(req.origin);

    /* ── 0 · the manual kill switch ─────────────────────────────────── */
    const st = await this.settings.settings();
    if (st.manualKill) {
      return this.deny(req, who, 'a person has stopped all outbound messages');
    }

    /* ── 2 · the breaker: customer messages only ────────────────────── */
    if (st.breakerTrippedAt && klass === 'CUSTOMER') {
      return this.deny(
        req, who,
        `the safety breaker is tripped (${st.breakerTrippedReason ?? 'unknown'}) and has to be reset by the owner`,
      );
    }

    /* ── 3 · the declared batch ─────────────────────────────────────── */
    if (req.batchId) {
      const b = await this.batchFor(req.batchId);
      if (b.actual >= b.declared) {
        await this.overflow(req.batchId, b.declared);
        return this.deny(
          req, who,
          `this send declared ${b.declared} message(s) and has already sent that many`,
        );
      }
    }

    const limits = await this.settings.limits();
    const now = Date.now();

    /* ── 4 · the repeat guard ───────────────────────────────────────── */
    const repeat = limits.find((l) => l.metric === OutboundLimitMetric.REPEAT);
    if (repeat) {
      const cut = now - repeat.windowMinutes * 60_000;
      const seen = this.sent.filter(
        (s) => s.at > cut && s.who === who && s.kind === kind && s.channel === req.channel,
      ).length;
      if (seen >= repeat.value) {
        return this.deny(
          req, who,
          `the same message already went to this recipient within ${repeat.windowMinutes} minute(s)`,
        );
      }
    }

    /* ── 5 · velocity ───────────────────────────────────────────────── */
    for (const l of limits) {
      if (l.metric === OutboundLimitMetric.REPEAT) continue;
      if (!this.applies(l.scope, l.key, req)) continue;

      const cut = now - l.windowMinutes * 60_000;
      const window = this.sent.filter((s) => s.at > cut && this.recordApplies(l.scope, l.key, s));

      const count =
        l.metric === OutboundLimitMetric.DISTINCT
          ? new Set(window.map((s) => s.who)).size + (window.some((s) => s.who === who) ? 0 : 1)
          : window.length + 1;

      if (count > l.value) {
        const label =
          l.metric === OutboundLimitMetric.DISTINCT
            ? `${l.value} different recipients`
            : `${l.value} messages`;
        const where = l.scope === OutboundLimitScope.GLOBAL ? 'in total' : `for ${l.key}`;
        const reason = `the limit of ${label} ${where} in ${l.windowMinutes} minutes has been reached`;

        if (l.onBreach === OutboundBreachAction.WARN) {
          this.log.warn(`limit reached but set to WARN: ${reason}`);
          continue;
        }
        if (l.onBreach === OutboundBreachAction.TRIP) {
          /*  A breach is not "this message is wrong", it is "something is
              wrong". Stopping only this one would let the fault carry on.  */
          await this.settings.trip(reason, `${l.scope}:${l.key}:${l.metric}`);
        }
        return this.deny(req, who, reason);
      }
    }

    /* ── allowed ────────────────────────────────────────────────────── */
    this.sent.push({ at: now, who, channel: req.channel, origin: req.origin, kind });
    this.prune(limits);
    if (req.batchId) {
      const b = this.batches.get(req.batchId);
      if (b) b.actual += 1;
      void this.prisma.db.outboundBatch
        .update({ where: { id: req.batchId }, data: { actualCount: { increment: 1 } } })
        .catch(() => undefined);
    }
    return { allowed: true };
  }

  /* ─────────────────────────── internals ─────────────────────────── */

  private applies(scope: OutboundLimitScope, key: string, req: OutboundRequest): boolean {
    if (scope === OutboundLimitScope.GLOBAL) return true;
    if (scope === OutboundLimitScope.CHANNEL) return key === req.channel;
    return key === req.origin;
  }

  private recordApplies(scope: OutboundLimitScope, key: string, s: SentRecord): boolean {
    if (scope === OutboundLimitScope.GLOBAL) return true;
    if (scope === OutboundLimitScope.CHANNEL) return key === s.channel;
    return key === s.origin;
  }

  /** Keep only what the longest window still needs. */
  private prune(limits: { windowMinutes: number }[]): void {
    const longest = limits.reduce((n, l) => Math.max(n, l.windowMinutes), 60);
    const cut = Date.now() - longest * 60_000;
    if (this.sent.length > 5000 || this.sent[0]?.at < cut) {
      this.sent = this.sent.filter((s) => s.at > cut);
    }
  }

  private async batchFor(batchId: string): Promise<{ declared: number; actual: number }> {
    const held = this.batches.get(batchId);
    if (held) return held;
    const row = await this.prisma.db.outboundBatch
      .findUnique({ where: { id: batchId } })
      .catch(() => null);
    const state = {
      declared: row?.declaredCount ?? DEFAULT_DECLARED_BATCH,
      actual: row?.actualCount ?? 0,
    };
    this.batches.set(batchId, state);
    return state;
  }

  private async overflow(batchId: string, declared: number) {
    await this.prisma.db.outboundBatch
      .update({ where: { id: batchId }, data: { status: 'OVERFLOW', finishedAt: new Date() } })
      .catch(() => undefined);
    await this.settings.trip(
      `a send declared ${declared} message(s) and tried to send more`,
      `BATCH:${batchId}`,
    );
  }

  private deny(req: OutboundRequest, who: string, reason: string): GuardVerdict {
    const note: BlockedNote = {
      at: new Date().toISOString(),
      channel: req.channel,
      origin: req.origin,
      recipient: maskRecipient(who),
      reason,
    };
    this.notes.unshift(note);
    if (this.notes.length > KEEP_NOTES) this.notes.length = KEEP_NOTES;

    this.log.warn(`BLOCKED ${req.channel}/${req.origin} to ${note.recipient}: ${reason}`);

    /*  The persistent trail. The list above dies with the process, and "what
        did the guard stop last week" is a real question. ActivityEvent already
        exists for exactly this, so it needs no table of its own, and it is
        fired and forgotten because a trail that cannot be written must never
        stop a block from being applied.  */
    void this.audit?.event({
      entityType: 'OutboundGuard',
      entityId: req.channel,
      kind: ActivityKind.system,
      label: `Blocked ${req.channel} to ${note.recipient}`,
      actorName: 'OutboundGuard',
      note: `${reason} · origin=${req.origin}`,
    });

    return { allowed: false, reason };
  }

  /** What the admin screen shows: the rules in force and what they stopped. */
  async status() {
    const st = await this.settings.settings();
    const limits = await this.settings.limits();
    return {
      stack: process.env.STACK || '(unset)',
      manualKill: st.manualKill,
      manualKillReason: st.manualKillReason,
      manualKillAt: st.manualKillAt,
      breakerTrippedAt: st.breakerTrippedAt,
      breakerTrippedReason: st.breakerTrippedReason,
      breakerTrippedMetric: st.breakerTrippedMetric,
      limits,
      sentLastHour: this.sent.filter((s) => s.at > Date.now() - 3_600_000).length,
      recentlyBlocked: this.notes,
    };
  }
}
