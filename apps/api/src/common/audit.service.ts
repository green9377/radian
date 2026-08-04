import { Injectable, Logger } from '@nestjs/common';
import { Prisma, AuditAction, ActivityKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * AuditService — constitution "Audit Everywhere" + "Unified Timeline" এর shared base।
 * প্রতিটি owning-module service create/update/delete-এ এটা ডাকবে।
 *   record() → AuditLog (মেশিন: field-level কী বদলাল)
 *   event()  → ActivityEvent (মানুষ: timeline feed)
 * Polymorphic (entityType + entityId) — সব module একই দুই table share করে।
 */
/**
 * AUD-REV-1 (30 Jul 2026) — why these two writes no longer throw.
 *
 * Every module calls `record()`/`event()` AFTER its business write has committed:
 *
 *     await this.prisma.db.purchase.create(...)   // committed, real, done
 *     await this.audit.record(...)                // ← threw ⇒ HTTP 500
 *
 * So a failure here could not undo anything. It could only hand the user a 500 for
 * work that had actually succeeded — and the user then does the one thing that makes
 * it worse: presses Save again. On `purchases.create()` that is a **duplicate
 * purchase**, with duplicate stock and a duplicate ledger entry.
 *
 * The trigger is not hypothetical. `changes` is typed `Record<string, unknown>` and
 * call sites pass DTOs straight in (`changes: { ...dto }`,
 * `changes: { courier: dto as ... }`). `Prisma.InputJsonValue` rejects a `BigInt` or a
 * `Date`, and `Customer.ltvPaisa` IS a BigInt that travels inside shaped objects. One
 * such value reaching `changes` turned a working save into a 500 plus a duplicate.
 *
 * THE SHAPE OF THE FIX, and why it is the mirror image of the finance one:
 *   · a FINANCE hand-off must never be silent — money moved and the books must know,
 *     so those calls are awaited and a failure is written to the entity's timeline.
 *   · an AUDIT write must never be FATAL — the deed is already done, and refusing the
 *     response destroys the record AND corrupts the data through the retry.
 * Both were wrong, in opposite directions, for the same reason: nobody had decided
 * what a failure was supposed to mean.
 *
 * NOT silent either: every failure is logged at error level with the entity it belongs
 * to, so it is greppable in the container log.
 *
 * ⚠️ REMAINING GAP, needs a schema decision in the architecture project: there is no
 * durable audit-failure table. Finance has `FinancePostingFailure` with a replay
 * screen; audit has the container log, which rotates. An `AuditFailure` table (same
 * shape) is the honest completion of this fix and is deliberately NOT invented here.
 *
 * `recordOrThrow()` exists for the ONE caller that genuinely wants the old behaviour:
 * `ItemsService.purge()` writes its trace BEFORE the row is destroyed, on purpose —
 * "if the audit write fails we would rather keep the row than lose it silently". That
 * is correct there and must not be quietly changed by this fix.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** AuditLog (machine: which field changed). Never fatal — see the note above. */
  async record(params: {
    entityType: string;
    entityId: string;
    action: AuditAction;
    actorName: string;
    actorId?: string;
    changes?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.recordOrThrow(params);
    } catch (e) {
      this.logger.error(
        `AUDIT WRITE FAILED — ${params.entityType}:${params.entityId} ${params.action} by ${params.actorName}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  /**
   * The strict form. Use ONLY where losing the trace is worse than failing the
   * request — i.e. where the trace is written before something irreversible.
   * Today that is `ItemsService.purge()` and nothing else.
   */
  async recordOrThrow(params: {
    entityType: string;
    entityId: string;
    action: AuditAction;
    actorName: string;
    actorId?: string;
    changes?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.db.auditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        actorName: params.actorName,
        actorId: params.actorId ?? null,
        changes: (params.changes ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /** ActivityEvent (human: the timeline feed). Never fatal — see the note above. */
  async event(params: {
    entityType: string;
    entityId: string;
    kind: ActivityKind;
    label: string;
    actorName: string;
    note?: string;
  }): Promise<void> {
    try {
      await this.prisma.db.activityEvent.create({
        data: {
          entityType: params.entityType,
          entityId: params.entityId,
          kind: params.kind,
          label: params.label,
          actorName: params.actorName,
          note: params.note ?? null,
        },
      });
    } catch (e) {
      this.logger.error(
        `TIMELINE WRITE FAILED — ${params.entityType}:${params.entityId} "${params.label}": ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  /**
   * কোনো entity-র timeline (সাম্প্রতিক আগে).
   * AUD-REV-2 — bounded. This was an unbounded `findMany`, so an order that had been
   * edited, paid, part-refunded and re-delivered for months returned every row it had
   * ever generated, on every page load of its detail screen. A timeline is read from
   * the top; the tail is history nobody scrolls to.
   */
  async timeline(entityType: string, entityId: string, take = 200) {
    return this.prisma.db.activityEvent.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(take, 1), 500),
    });
  }
}
