import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EscalationReason, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from '../marketing/messaging.service';
import { OutboundGuard, maskRecipient, normaliseRecipient } from '../common/outbound-guard';

/*
  ═══════════════════════════════════════════════════════════════════════════
  ESCALATION NOTIFIER - telling a person that a customer is waiting.

  An escalation used to be a row and a badge. Nobody was actually told. If the
  screen was not open, the customer waited until somebody happened to look -
  which on a quiet evening is nobody, and the shop finds out from the customer.

  THE LADDER (owner, 2 Sep 2026)

    rung 0   the moment the escalation is raised   -> the assignees
    rung 1   ten minutes later, still unanswered   -> every OWNER
    stop     acknowledged, or the owners have been told

  There is no rung above the owner, so reaching it ends the ladder. That is
  also why the fallback stops it: when no assignee can be reached by phone the
  owners are told at rung 0, and a second owner SMS ten minutes later would
  say nothing new.

  DEDUPE IS PER PERSON, NOT PER EVENT. `notifiedMap` is { AppUser.id: ISO },
  written after every send. One person is told once about one escalation
  however many times the ticker wakes up, and an owner who was already told as
  an assignee is not told again as an owner. Two people sharing one phone are
  one SMS, because the phone is what receives it.

  A PHONE LIVES ON Employee, NOT ON AppUser. A login account is not a staff
  member (HR-D01), so the number is reached through `Employee.appUserId`.
  Somebody with an account and no employee record simply has no phone, and
  that is the case the owner fallback exists for.

  ORIGIN IS 'escalation' - OPERATIONAL, not CUSTOMER (see outbound-guard.ts).
  A tripped breaker must never silence the message that says the shop needs a
  human; the manual kill switch still stops it, because that switch means
  stop everything and is pulled by a person who knows what they are doing.

  IT NEVER THROWS INTO THE ESCALATION PATH. Failing to notify is bad; losing
  the escalation because notifying failed is worse. Every failure is written
  to `lastNotifyError` and the row is left for the next tick to retry.
*/

/** The rung and the ticker. Ten minutes is the owner's number. */
const LADDER_MINUTES = 10;
const TICK_MS = 60_000;

/** How long a rung-0 failure keeps being retried before it is left alone. */
const MAX_ATTEMPTS = 5;

const REASON_TEXT: Record<EscalationReason, string> = {
  MONEY_TOPIC: 'a customer is asking about money',
  LOW_CONFIDENCE: 'the assistant is unsure',
  CUSTOMER_ASKED_HUMAN: 'a customer asked for a person',
  ANGRY_CUSTOMER: 'a customer is upset',
  OFF_SCRIPT: 'a conversation went off script',
  MANUAL: 'a conversation was passed on by staff',
};

interface Target {
  userId: string;
  phone: string;
}

type Rung = 'assignee' | 'owner';

@Injectable()
export class EscalationNotifier implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('EscalationNotifier');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    private readonly guard: OutboundGuard,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /* -- rung 0 - called the moment an escalation is raised --------------- */

  /** Never throws: the caller is in the middle of raising an escalation. */
  async notifyNew(eventId: string): Promise<void> {
    try {
      await this.runEvent(eventId, 'assignee');
    } catch (e) {
      this.log.warn(`notifyNew failed for ${eventId}: ${msg(e)}`);
    }
  }

  /* -- the ticker - rung 1, and retries of a rung 0 that could not send -- */

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (e) {
      this.log.warn(`tick failed: ${msg(e)}`);
    } finally {
      this.running = false;
    }
  }

  /** One full pass. Exposed so a test - or a person - can run it on demand. */
  async runOnce(now: Date = new Date()): Promise<{ climbed: number; retried: number }> {
    const due = new Date(now.getTime() - LADDER_MINUTES * 60_000);

    /*  Both rungs in one query. Anything acknowledged, or whose owners have
        been told, is already off the ladder and is not selected at all.  */
    const open = await this.prisma.db.escalationEvent.findMany({
      where: {
        acknowledgedAt: null,
        ownerNotifiedAt: null,
        notifyAttempts: { lt: MAX_ATTEMPTS },
      },
      select: { id: true, createdAt: true, employeeNotifiedAt: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    let climbed = 0;
    let retried = 0;
    for (const e of open) {
      try {
        if (e.createdAt <= due) {
          await this.runEvent(e.id, 'owner', now);
          climbed++;
        } else if (!e.employeeNotifiedAt) {
          // rung 0 never got through - try again while it is still fresh
          await this.runEvent(e.id, 'assignee', now);
          retried++;
        }
      } catch (err) {
        this.log.warn(`escalation ${e.id} failed: ${msg(err)}`);
      }
    }
    return { climbed, retried };
  }

  /* -- one rung of one escalation --------------------------------------- */

  private async runEvent(eventId: string, rung: Rung, now: Date = new Date()): Promise<void> {
    const event = await this.prisma.db.escalationEvent.findFirst({
      where: { id: eventId },
      select: {
        id: true,
        conversationId: true,
        reason: true,
        notifiedUserIds: true,
        notifiedMap: true,
        acknowledgedAt: true,
        ownerNotifiedAt: true,
        employeeNotifiedAt: true,
        notifyAttempts: true,
      },
    });
    if (!event) return;

    // Someone answered while we were getting here, or the top rung is done.
    if (event.acknowledgedAt || event.ownerNotifiedAt) return;

    const already = asMap(event.notifiedMap);

    let targets: Target[] = [];
    let reachedOwners = false;

    if (rung === 'assignee') {
      targets = await this.assigneeTargets(event.conversationId, event.notifiedUserIds);
      /*  The fallback. Nobody assigned has a number we can reach, so the
          owners are told now rather than in ten minutes - and that IS the
          owner rung, so the ladder ends here.  */
      if (targets.length === 0) {
        targets = await this.ownerTargets();
        reachedOwners = true;
      }
    } else {
      targets = await this.ownerTargets();
      reachedOwners = true;
    }

    const fresh = dedupe(targets, already);

    /*  Nothing left to tell. On the owner rung that still closes the ladder:
        every owner has already heard about this one, and repeating it in a
        second SMS helps nobody.  */
    if (fresh.length === 0) {
      await this.stamp(event.id, {
        rung,
        reachedOwners,
        now,
        sentTo: [],
        error: targets.length === 0 ? 'no phone number to send to' : null,
        countAttempt: targets.length === 0,
        already,
      });
      return;
    }

    const text = this.text(event.reason, event.conversationId);
    const sentTo: Target[] = [];
    const failures: string[] = [];

    for (const t of fresh) {
      const r = await this.messaging
        .sendSms({
          to: t.phone,
          text,
          origin: 'escalation',
          /*  The event id makes the guard's repeat check per escalation:
              the same person cannot be told twice about the same one, even
              if this service is asked twice.  */
          kind: `escalation:${event.id}`,
          actorName: 'Escalation',
        })
        .catch((e) => ({ ok: false, error: msg(e) }) as { ok: boolean; error?: string });

      if (r.ok) {
        sentTo.push(t);
      } else {
        failures.push(`${maskRecipient(t.phone)}: ${r.error ?? 'send failed'}`);
      }
    }

    await this.stamp(event.id, {
      rung,
      reachedOwners,
      now,
      sentTo,
      error: failures.length ? failures.join(' - ').slice(0, 480) : null,
      countAttempt: failures.length > 0,
      already,
    });
  }

  /* -- who to tell ------------------------------------------------------ */

  /*  The thread's own assignee first, then the escalation's list. Somebody
      holding a conversation is the person who should hear that it needs
      them; `notifiedUserIds` is the standing list from Inbox settings
      (INB-RULE-005) and is what `escalate()` already resolved.  */
  private async assigneeTargets(conversationId: string, listed: Prisma.JsonValue): Promise<Target[]> {
    const ids = new Set<string>();

    const convo = await this.prisma.db.conversation.findFirst({
      where: { id: conversationId },
      select: { assigneeId: true },
    });
    if (convo?.assigneeId) ids.add(convo.assigneeId);

    if (Array.isArray(listed)) {
      for (const v of listed) if (typeof v === 'string' && v) ids.add(v);
    }

    return this.phonesFor([...ids]);
  }

  /** Every active OWNER we can actually reach by phone. */
  private async ownerTargets(): Promise<Target[]> {
    const owners = await this.prisma.db.appUser.findMany({
      where: { role: 'OWNER', deletedAt: null, isActive: true },
      select: { id: true },
    });
    return this.phonesFor(owners.map((o) => o.id));
  }

  /*  HR-D01 - the number is on Employee, reached through the account link.
      An account with no employee record has no phone, and that is what the
      owner fallback is for.  */
  private async phonesFor(userIds: string[]): Promise<Target[]> {
    if (userIds.length === 0) return [];
    const rows = await this.prisma.db.employee.findMany({
      where: { appUserId: { in: userIds }, deletedAt: null },
      select: { appUserId: true, phone: true },
    });
    const out: Target[] = [];
    for (const r of rows) {
      const phone = (r.phone ?? '').trim();
      if (r.appUserId && phone) out.push({ userId: r.appUserId, phone });
    }
    return out;
  }

  /* -- what it says ----------------------------------------------------- */

  /*  The [DEV] label. Both stacks send real SMS to real phones, so the
      message itself has to say which shop woke somebody up - otherwise a
      rehearsal at midnight reads exactly like the real thing.  */
  private text(reason: EscalationReason, conversationId: string): string {
    const label = this.guard.isDevStack() ? '[DEV] ' : '';
    const why = REASON_TEXT[reason] ?? 'a conversation needs a person';
    const base = (process.env.PUBLIC_ADMIN_URL ?? '').trim().replace(/\/+$/, '');
    const link = base ? ` ${base}/inbox/${conversationId}` : '';
    return `${label}Radian Inbox: ${why}. Please reply.${link}`;
  }

  /* -- the trail -------------------------------------------------------- */

  private async stamp(
    eventId: string,
    p: {
      rung: Rung;
      reachedOwners: boolean;
      now: Date;
      sentTo: Target[];
      error: string | null;
      countAttempt: boolean;
      already?: Record<string, string>;
    },
  ): Promise<void> {
    const map = { ...(p.already ?? {}) };
    for (const t of p.sentTo) map[t.userId] = p.now.toISOString();

    const data: Prisma.EscalationEventUpdateInput = {
      notifiedMap: map as Prisma.InputJsonValue,
      lastNotifyError: p.error,
    };

    if (p.countAttempt) data.notifyAttempts = { increment: 1 };

    if (p.sentTo.length > 0) {
      data.employeeNotifiedTo = p.sentTo
        .map((t) => maskRecipient(t.phone))
        .join(', ')
        .slice(0, 240);
    }

    /*  employeeNotifiedAt marks "rung 0 is done" - it is what stops the
        ticker retrying it. The fallback sets it too: rung 0 did happen, the
        people it reached were simply the owners.  */
    if (p.rung === 'assignee' && (p.sentTo.length > 0 || p.reachedOwners)) {
      data.employeeNotifiedAt = p.now;
    }

    /*  The ladder stops here. Set even when everyone had already been told,
        because there is no rung above the owner to climb to.  */
    if (p.reachedOwners) data.ownerNotifiedAt = p.now;

    await this.prisma.db.escalationEvent.update({ where: { id: eventId }, data });
  }
}

/* -- small helpers ------------------------------------------------------ */

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function asMap(v: Prisma.JsonValue): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val;
  }
  return out;
}

/*  Two filters, and both are needed. `already` is the per-person dedupe that
    survives a restart because it lives in the row; the phone set is what
    stops two accounts sharing one number turning into two SMS in one pass. */
function dedupe(targets: Target[], already: Record<string, string>): Target[] {
  const seenPhones = new Set<string>();
  const out: Target[] = [];
  for (const t of targets) {
    if (already[t.userId]) continue;
    const key = normaliseRecipient(t.phone);
    if (!key || seenPhones.has(key)) continue;
    seenPhones.add(key);
    out.push(t);
  }
  return out;
}
