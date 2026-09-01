import { OutboundBreachAction, OutboundLimitMetric, OutboundLimitScope } from '@prisma/client';

/*
  ═══════════════════════════════════════════════════════════════════════════
  THE HARD BOUNDARY — what configuration may never cross.

  Owner, 2 Sep 2026: limits are the admin's to set, but "configuration cannot
  create a truly unlimited unsafe state". So every number an administrator
  types is clamped against this file, and this file is not reachable from the
  Admin Panel. Raising a limit is a setting; removing the protection is not.

  ⚠️ Read the direction of each clamp carefully. A MAXIMUM on a limit VALUE is
  a ceiling on how loose the shop may become. A MINIMUM on a dedupe window is
  a floor on how weak the repeat guard may become. They protect in opposite
  directions and swapping them would quietly disable both.
*/

/** No limit may be set higher than this, on any metric, in any window. */
export const HARD_MAX_VALUE = 10_000;

/** A window may not be so long that a limit stops meaning anything. */
export const HARD_MAX_WINDOW_MINUTES = 24 * 60;

/** The repeat guard may be relaxed, never switched off. */
export const HARD_MIN_REPEAT_WINDOW_MINUTES = 1;

/** A limit of zero would mean "never send"; a limit is a ceiling, not a gate. */
export const HARD_MIN_VALUE = 1;

/*
  The breaker cannot be disabled. An administrator may raise the number that
  trips it, or soften a single metric to BLOCK, but at least one metric must
  still TRIP - otherwise a runaway send has nothing left to stop it.
*/
export const MUST_TRIP_METRICS: OutboundLimitMetric[] = [
  OutboundLimitMetric.DISTINCT,
];

/** A caller that declares nothing may send exactly one message. */
export const DEFAULT_DECLARED_BATCH = 1;

/*  ── seeds ────────────────────────────────────────────────────────────────
    Written once, at first start, and the admin owns them from then on. DEV
    and PROD get different numbers because DEV is where real integration
    testing happens (owner, 2 Sep 2026).  */

export interface LimitSeed {
  scope: OutboundLimitScope;
  key: string;
  metric: OutboundLimitMetric;
  windowMinutes: number;
  dev: number;
  prod: number;
  onBreach: OutboundBreachAction;
}

export const LIMIT_SEEDS: LimitSeed[] = [
  { scope: OutboundLimitScope.GLOBAL, key: '', metric: OutboundLimitMetric.TOTAL,
    windowMinutes: 60, dev: 500, prod: 2000, onBreach: OutboundBreachAction.TRIP },

  /*  The one that matters most. A single wrong message reaches one person; a
      bulk accident reaches a hundred. This metric is the difference.  */
  { scope: OutboundLimitScope.GLOBAL, key: '', metric: OutboundLimitMetric.DISTINCT,
    windowMinutes: 60, dev: 100, prod: 500, onBreach: OutboundBreachAction.TRIP },

  /*  BLOCK, not TRIP: a repeat is one job misbehaving, not the shop losing
      control, and stopping every message because a sweeper woke twice would
      be worse than the fault.  */
  { scope: OutboundLimitScope.GLOBAL, key: '', metric: OutboundLimitMetric.REPEAT,
    windowMinutes: 10, dev: 1, prod: 1, onBreach: OutboundBreachAction.BLOCK },

  { scope: OutboundLimitScope.CHANNEL, key: 'SMS', metric: OutboundLimitMetric.TOTAL,
    windowMinutes: 60, dev: 200, prod: 1000, onBreach: OutboundBreachAction.TRIP },
  { scope: OutboundLimitScope.CHANNEL, key: 'WHATSAPP', metric: OutboundLimitMetric.TOTAL,
    windowMinutes: 60, dev: 500, prod: 2000, onBreach: OutboundBreachAction.TRIP },
  { scope: OutboundLimitScope.CHANNEL, key: 'MESSENGER', metric: OutboundLimitMetric.TOTAL,
    windowMinutes: 60, dev: 500, prod: 2000, onBreach: OutboundBreachAction.TRIP },
  { scope: OutboundLimitScope.CHANNEL, key: 'INSTAGRAM', metric: OutboundLimitMetric.TOTAL,
    windowMinutes: 60, dev: 500, prod: 2000, onBreach: OutboundBreachAction.TRIP },
  { scope: OutboundLimitScope.CHANNEL, key: 'EMAIL', metric: OutboundLimitMetric.TOTAL,
    windowMinutes: 60, dev: 500, prod: 2000, onBreach: OutboundBreachAction.TRIP },

  /*  A stuck model loops faster than anything else here, and this catches it
      before the channel ceiling does - and says which origin was at fault.  */
  { scope: OutboundLimitScope.ORIGIN, key: 'ai-reply', metric: OutboundLimitMetric.TOTAL,
    windowMinutes: 60, dev: 200, prod: 500, onBreach: OutboundBreachAction.TRIP },

  /*  Operational. WARN, never TRIP: this is the path that tells a person the
      shop is in trouble, and it must not be the path that goes quiet.  */
  { scope: OutboundLimitScope.ORIGIN, key: 'escalation', metric: OutboundLimitMetric.TOTAL,
    windowMinutes: 60, dev: 50, prod: 50, onBreach: OutboundBreachAction.WARN },
];

/** Clamp one value into the boundary. Returns what will actually be stored. */
export function clampLimitValue(value: number): number {
  if (!Number.isFinite(value)) return HARD_MIN_VALUE;
  return Math.min(HARD_MAX_VALUE, Math.max(HARD_MIN_VALUE, Math.trunc(value)));
}

export function clampWindowMinutes(metric: OutboundLimitMetric, minutes: number): number {
  const floor = metric === OutboundLimitMetric.REPEAT ? HARD_MIN_REPEAT_WINDOW_MINUTES : 1;
  if (!Number.isFinite(minutes)) return floor;
  return Math.min(HARD_MAX_WINDOW_MINUTES, Math.max(floor, Math.trunc(minutes)));
}

/** The breaker may be softened per metric, but not everywhere at once. */
export function clampBreachAction(
  metric: OutboundLimitMetric,
  action: OutboundBreachAction,
): OutboundBreachAction {
  if (MUST_TRIP_METRICS.includes(metric)) return OutboundBreachAction.TRIP;
  return action;
}
