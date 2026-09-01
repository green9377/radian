import { Injectable, Logger } from '@nestjs/common';
import {
  OutboundBreachAction,
  OutboundLimit,
  OutboundLimitMetric,
  OutboundLimitScope,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import {
  LIMIT_SEEDS,
  clampBreachAction,
  clampLimitValue,
  clampWindowMinutes,
} from './outbound-limits.const';

/*
  ═══════════════════════════════════════════════════════════════════════════
  The guard's configuration: the limits, and the two switches.

  ── WHY A CACHE ─────────────────────────────────────────────────────────────
  The guard runs on the path of every outgoing message. Reading eleven rows
  from Postgres per message would put the database in the middle of the
  send path for no gain, so the rows are held for CACHE_MS and re-read after
  that. Ten seconds is the whole cost of a limit change taking effect, and it
  is short enough that nobody notices.

  ⚠️ THE SWITCHES ARE NOT CACHED. `manualKill` and the breaker are read fresh
  every time. A kill switch that takes ten seconds to bite is not a kill
  switch, and the whole point of the breaker is that it stops things NOW.

  ── WHY THE STATE IS IN THE DATABASE ────────────────────────────────────────
  It used to be a field on the service, which meant a restart silently undid
  it. Owner, 2 Sep: both switches survive a restart. In the database they also
  survive a second container - one process trips, every process stops.
*/

const CACHE_MS = 10_000;

export interface EffectiveLimit {
  scope: OutboundLimitScope;
  key: string;
  metric: OutboundLimitMetric;
  windowMinutes: number;
  value: number;
  onBreach: OutboundBreachAction;
}

@Injectable()
export class OutboundSettingsService {
  private readonly log = new Logger('OutboundSettings');

  private cache: EffectiveLimit[] | null = null;
  private cachedAt = 0;
  private seeded = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** dev unless the stack says otherwise - the same test the rest of the API uses */
  private isLiveStack(): boolean {
    const s = (process.env.STACK ?? '').trim().toLowerCase();
    return s === 'live' || s === 'prod' || s === 'production';
  }

  /* ─────────────────────────── the switches ─────────────────────────── */

  /** Created on first read so nothing else has to care whether it exists. */
  async settings() {
    const found = await this.prisma.db.outboundSetting.findUnique({
      where: { id: 'singleton' },
    });
    if (found) return found;
    try {
      return await this.prisma.db.outboundSetting.create({ data: { id: 'singleton' } });
    } catch {
      /* two requests raced; the other one won */
      return this.prisma.db.outboundSetting.findUniqueOrThrow({ where: { id: 'singleton' } });
    }
  }

  /* ─────────────────────────── the limits ─────────────────────────── */

  /** Writes the environment's starting numbers, once, and never again. */
  async seedIfEmpty(): Promise<number> {
    if (this.seeded) return 0;
    const count = await this.prisma.db.outboundLimit.count({ where: { deletedAt: null } });
    if (count > 0) {
      this.seeded = true;
      return 0;
    }
    const live = this.isLiveStack();
    await this.prisma.db.outboundLimit.createMany({
      data: LIMIT_SEEDS.map((s) => ({
        scope: s.scope,
        key: s.key,
        metric: s.metric,
        windowMinutes: clampWindowMinutes(s.metric, s.windowMinutes),
        value: clampLimitValue(live ? s.prod : s.dev),
        onBreach: clampBreachAction(s.metric, s.onBreach),
      })),
      skipDuplicates: true,
    });
    this.seeded = true;
    this.cache = null;
    this.log.log(
      `seeded ${LIMIT_SEEDS.length} outbound limits for the ${live ? 'live' : 'development'} stack`,
    );
    return LIMIT_SEEDS.length;
  }

  /** Every limit in force, cached. Clamped on the way out as well as in. */
  async limits(): Promise<EffectiveLimit[]> {
    if (this.cache && Date.now() - this.cachedAt < CACHE_MS) return this.cache;
    await this.seedIfEmpty();
    const rows = await this.prisma.db.outboundLimit.findMany({ where: { deletedAt: null } });
    /*  Clamped on read too, not only on write. A row edited straight in the
        database - a restore, a migration, a hand fix - must not be able to
        put the shop outside the boundary either. */
    this.cache = rows.map((r) => this.toEffective(r));
    this.cachedAt = Date.now();
    return this.cache;
  }

  private toEffective(r: OutboundLimit): EffectiveLimit {
    return {
      scope: r.scope,
      key: r.key,
      metric: r.metric,
      windowMinutes: clampWindowMinutes(r.metric, r.windowMinutes),
      value: clampLimitValue(r.value),
      onBreach: clampBreachAction(r.metric, r.onBreach),
    };
  }

  /** Admin edit. Returns what was actually stored, which may be clamped. */
  async setLimit(
    input: {
      scope: OutboundLimitScope;
      key: string;
      metric: OutboundLimitMetric;
      windowMinutes: number;
      value: number;
      onBreach: OutboundBreachAction;
    },
    actor: { id?: string; name: string },
  ): Promise<{ stored: EffectiveLimit; clamped: boolean }> {
    const key = input.key ?? '';
    const before = await this.prisma.db.outboundLimit.findUnique({
      where: { scope_key_metric: { scope: input.scope, key, metric: input.metric } },
    });

    const windowMinutes = clampWindowMinutes(input.metric, input.windowMinutes);
    const value = clampLimitValue(input.value);
    const onBreach = clampBreachAction(input.metric, input.onBreach);
    const clamped =
      windowMinutes !== input.windowMinutes ||
      value !== input.value ||
      onBreach !== input.onBreach;

    const row = await this.prisma.db.outboundLimit.upsert({
      where: { scope_key_metric: { scope: input.scope, key, metric: input.metric } },
      create: {
        scope: input.scope, key, metric: input.metric,
        windowMinutes, value, onBreach, updatedById: actor.id ?? null,
      },
      update: { windowMinutes, value, onBreach, updatedById: actor.id ?? null, deletedAt: null },
    });

    /*  from -> to, because "who set it to 9,000" is the question that gets
        asked after an incident, and the new value alone cannot answer it. */
    await this.audit.record({
      entityType: 'OutboundLimit',
      entityId: row.id,
      action: before ? 'UPDATE' : 'CREATE',
      actorName: actor.name,
      changes: {
        scope: input.scope, key, metric: input.metric,
        value: { from: before?.value ?? null, to: value },
        windowMinutes: { from: before?.windowMinutes ?? null, to: windowMinutes },
        onBreach: { from: before?.onBreach ?? null, to: onBreach },
        ...(clamped ? { clampedByHardBoundary: true, requested: input } : {}),
      },
    });

    this.cache = null;
    return { stored: this.toEffective(row), clamped };
  }

  /* ─────────────────────── manual kill switch ─────────────────────── */

  async stopAll(reason: string, actor: { id?: string; name: string }) {
    await this.settings();
    const row = await this.prisma.db.outboundSetting.update({
      where: { id: 'singleton' },
      data: {
        manualKill: true,
        manualKillById: actor.id ?? null,
        manualKillAt: new Date(),
        manualKillReason: reason,
      },
    });
    await this.audit.record({
      entityType: 'OutboundSetting', entityId: 'singleton', action: 'UPDATE',
      actorName: actor.name,
      changes: { manualKill: { from: false, to: true }, reason },
    });
    this.log.warn(`MANUAL KILL SWITCH ON by ${actor.name}: ${reason}`);
    return row;
  }

  /**
   * ⚠️ OWNER + PIN + a reason (owner, 2 Sep 2026). Letting the shop speak
   * again is as serious an act as silencing it, and the audit has to be able
   * to answer WHY, not only who.
   */
  async resumeAll(reason: string, actor: { id?: string; name: string }) {
    const before = await this.settings();
    const row = await this.prisma.db.outboundSetting.update({
      where: { id: 'singleton' },
      data: {
        manualKill: false,
        manualKillClearedById: actor.id ?? null,
        manualKillClearedAt: new Date(),
        manualKillClearedReason: reason,
      },
    });
    await this.audit.record({
      entityType: 'OutboundSetting', entityId: 'singleton', action: 'UPDATE',
      actorName: actor.name,
      changes: { manualKill: { from: before.manualKill, to: false }, reason },
    });
    this.log.warn(`MANUAL KILL SWITCH OFF by ${actor.name}: ${reason}`);
    return row;
  }

  /* ───────────────────────── circuit breaker ───────────────────────── */

  /** Called by the guard itself. Never by a person, and never on a timer. */
  async trip(reason: string, metric: string) {
    const before = await this.settings();
    if (before.breakerTrippedAt) return before; // already tripped; do not restamp
    const row = await this.prisma.db.outboundSetting.update({
      where: { id: 'singleton' },
      data: {
        breakerTrippedAt: new Date(),
        breakerTrippedReason: reason,
        breakerTrippedMetric: metric,
      },
    });
    await this.audit.record({
      entityType: 'OutboundSetting', entityId: 'singleton', action: 'UPDATE',
      actorName: 'OutboundGuard',
      changes: { breakerTripped: { from: null, to: new Date().toISOString() }, reason, metric },
    });
    this.log.error(`CIRCUIT BREAKER TRIPPED (${metric}): ${reason}`);
    return row;
  }

  /** OWNER + PIN. Deliberately the only way back. */
  async resetBreaker(actor: { id?: string; name: string }) {
    const before = await this.settings();
    const row = await this.prisma.db.outboundSetting.update({
      where: { id: 'singleton' },
      data: {
        breakerTrippedAt: null,
        breakerTrippedReason: null,
        breakerTrippedMetric: null,
        breakerResetById: actor.id ?? null,
        breakerResetAt: new Date(),
      },
    });
    await this.audit.record({
      entityType: 'OutboundSetting', entityId: 'singleton', action: 'UPDATE',
      actorName: actor.name,
      changes: {
        breakerTripped: { from: before.breakerTrippedAt?.toISOString() ?? null, to: null },
        wasReason: before.breakerTrippedReason,
      },
    });
    this.log.warn(`circuit breaker reset by ${actor.name}`);
    return row;
  }
}
