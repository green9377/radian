import { EscalationReason } from '@prisma/client';
import { EscalationNotifier } from './escalation-notifier.service';
import { OutboundGuard } from '../common/outbound-guard';
import { InboxService } from '../inbox/inbox';

/*
  ═══════════════════════════════════════════════════════════════════════════
  ESCALATION NOTIFIER — the RUNTIME test.

      npx jest src/messaging/escalation-notifier.spec.ts

  The question every case here asks is the owner's question: when a customer
  asks for a person, does a person's phone actually ring — once, with the
  right words, and does the ladder stop when it should?

  Nothing touches a network, a database or a provider. `sendSms` is a
  recorder, so a case that "sends" only ever pushes a row onto an array.

  The guard is the REAL OutboundGuard, because `[DEV]` comes from its own
  isDevStack() and a label that only the test computes proves nothing.
*/

/* ─────────────────────────── the fake books ─────────────────────────── */

interface Ev {
  id: string;
  conversationId: string;
  reason: EscalationReason;
  notifiedUserIds: unknown;
  notifiedMap: Record<string, string>;
  acknowledgedAt: Date | null;
  ownerNotifiedAt: Date | null;
  employeeNotifiedAt: Date | null;
  employeeNotifiedTo: string | null;
  notifyAttempts: number;
  lastNotifyError: string | null;
  createdAt: Date;
}

let events: Ev[] = [];
let convos: { id: string; assigneeId: string | null }[] = [];
let users: { id: string; role: string; isActive: boolean; deletedAt: Date | null }[] = [];
let employees: { appUserId: string | null; phone: string | null; deletedAt: Date | null }[] = [];
let sms: { to: string; text: string; origin?: string; kind?: string }[] = [];
let smsOk = true;

function newEvent(p: Partial<Ev> = {}): Ev {
  const e: Ev = {
    id: p.id ?? `ev${events.length + 1}`,
    conversationId: p.conversationId ?? 'c1',
    reason: p.reason ?? EscalationReason.CUSTOMER_ASKED_HUMAN,
    notifiedUserIds: p.notifiedUserIds ?? [],
    notifiedMap: p.notifiedMap ?? {},
    acknowledgedAt: p.acknowledgedAt ?? null,
    ownerNotifiedAt: p.ownerNotifiedAt ?? null,
    employeeNotifiedAt: p.employeeNotifiedAt ?? null,
    employeeNotifiedTo: p.employeeNotifiedTo ?? null,
    notifyAttempts: p.notifyAttempts ?? 0,
    lastNotifyError: p.lastNotifyError ?? null,
    createdAt: p.createdAt ?? new Date(),
  };
  events.push(e);
  return e;
}

const prisma = {
  db: {
    escalationEvent: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        events.find((e) => e.id === where.id) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        events.filter(
          (e) =>
            e.acknowledgedAt === null &&
            e.ownerNotifiedAt === null &&
            e.notifyAttempts < (((where.notifyAttempts as { lt: number }) ?? { lt: 99 }).lt),
        ),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const e = events.find((x) => x.id === where.id);
        if (!e) throw new Error('no such escalation');
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && 'increment' in (v as object)) {
            (e as unknown as Record<string, number>)[k] += (v as { increment: number }).increment;
          } else {
            (e as unknown as Record<string, unknown>)[k] = v;
          }
        }
        return e;
      },
    },
    conversation: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        convos.find((c) => c.id === where.id) ?? null,
    },
    appUser: {
      findMany: async () =>
        users.filter((u) => u.role === 'OWNER' && u.isActive && u.deletedAt === null),
    },
    employee: {
      findMany: async ({ where }: { where: { appUserId: { in: string[] } } }) =>
        employees.filter(
          (e) => e.deletedAt === null && e.appUserId && where.appUserId.in.includes(e.appUserId),
        ),
    },
  },
} as never;

const messaging = {
  sendSms: async (i: { to: string; text: string; origin?: string; kind?: string }) => {
    sms.push(i);
    return smsOk ? { ok: true } : { ok: false, error: 'provider said no' };
  },
} as never;

function build(stack = 'dev'): EscalationNotifier {
  process.env.STACK = stack;
  const guard = new OutboundGuard({} as never, prisma);
  return new EscalationNotifier(prisma, messaging, guard);
}

const MIN = 60_000;

beforeEach(() => {
  events = [];
  sms = [];
  smsOk = true;
  process.env.PUBLIC_ADMIN_URL = 'https://admin.development.radianbd.com';
  convos = [{ id: 'c1', assigneeId: 'u-staff' }];
  users = [
    { id: 'u-owner1', role: 'OWNER', isActive: true, deletedAt: null },
    { id: 'u-owner2', role: 'OWNER', isActive: true, deletedAt: null },
    { id: 'u-staff', role: 'STAFF', isActive: true, deletedAt: null },
  ];
  employees = [
    { appUserId: 'u-staff', phone: '01711111111', deletedAt: null },
    { appUserId: 'u-owner1', phone: '01822222222', deletedAt: null },
    { appUserId: 'u-owner2', phone: '01933333333', deletedAt: null },
  ];
});

/* ═════════════════ rung 0 — somebody's phone rings ═════════════════ */

describe('a customer who asks for a person gets one', () => {
  it('the assignee holding the thread is the one who is told', async () => {
    const n = build();
    const e = newEvent();
    await n.notifyNew(e.id);

    expect(sms.map((s) => s.to)).toEqual(['01711111111']);
    expect(e.employeeNotifiedAt).not.toBeNull();
  });

  it('the message says why, and links straight to the thread', async () => {
    const n = build();
    const e = newEvent({ reason: EscalationReason.ANGRY_CUSTOMER });
    await n.notifyNew(e.id);

    expect(sms[0].text).toContain('a customer is upset');
    expect(sms[0].text).toContain('https://admin.development.radianbd.com/inbox/c1');
  });

  it('it is sent as OPERATIONAL — the origin the breaker does not stop', async () => {
    const n = build();
    const e = newEvent();
    await n.notifyNew(e.id);

    expect(sms[0].origin).toBe('escalation');
    // the guard's repeat check is per escalation, not per person-per-day
    expect(sms[0].kind).toBe(`escalation:${e.id}`);
  });

  it('the standing assignee list is used when nobody holds the thread', async () => {
    convos = [{ id: 'c1', assigneeId: null }];
    const n = build();
    const e = newEvent({ notifiedUserIds: ['u-staff'] });
    await n.notifyNew(e.id);

    expect(sms.map((s) => s.to)).toEqual(['01711111111']);
  });
});

/* ═════════════════ the [DEV] label ═════════════════ */

describe('the SMS says which shop woke you up', () => {
  it('development messages carry [DEV]', async () => {
    const n = build('dev');
    await n.notifyNew(newEvent().id);
    expect(sms[0].text.startsWith('[DEV] ')).toBe(true);
  });

  it('the live shop sends the same message without it', async () => {
    const n = build('live');
    await n.notifyNew(newEvent().id);
    expect(sms[0].text.startsWith('[DEV] ')).toBe(false);
    expect(sms[0].text).toContain('Radian Inbox');
  });
});

/* ═════════════════ dedupe ═════════════════ */

describe('one person, one message', () => {
  it('asking twice about the same escalation sends once', async () => {
    const n = build();
    const e = newEvent();
    await n.notifyNew(e.id);
    await n.notifyNew(e.id);

    expect(sms).toHaveLength(1);
  });

  it('two accounts sharing one phone are one message', async () => {
    convos = [{ id: 'c1', assigneeId: null }];
    employees = [
      { appUserId: 'u-a', phone: '01711111111', deletedAt: null },
      { appUserId: 'u-b', phone: '01711111111', deletedAt: null },
    ];
    const n = build();
    await n.notifyNew(newEvent({ notifiedUserIds: ['u-a', 'u-b'] }).id);

    expect(sms).toHaveLength(1);
  });

  it('the dedupe survives a restart, because it lives in the row', async () => {
    const e = newEvent();
    await build().notifyNew(e.id);
    expect(sms).toHaveLength(1);

    // a brand-new process, with nothing in memory
    await build().notifyNew(e.id);
    expect(sms).toHaveLength(1);
    expect(Object.keys(e.notifiedMap)).toEqual(['u-staff']);
  });
});

/* ═════════════════ the fallback ═════════════════ */

describe('when the assignee cannot be reached', () => {
  it('an assignee with no phone means the owners are told instead', async () => {
    employees = [
      { appUserId: 'u-owner1', phone: '01822222222', deletedAt: null },
      { appUserId: 'u-owner2', phone: '01933333333', deletedAt: null },
    ];
    const n = build();
    const e = newEvent();
    await n.notifyNew(e.id);

    expect(sms.map((s) => s.to).sort()).toEqual(['01822222222', '01933333333']);
    expect(e.ownerNotifiedAt).not.toBeNull();
  });

  it('and that ends the ladder — there is no rung above the owner', async () => {
    employees = [{ appUserId: 'u-owner1', phone: '01822222222', deletedAt: null }];
    const n = build();
    const e = newEvent();
    await n.notifyNew(e.id);
    sms = [];

    // twenty minutes later
    await n.runOnce(new Date(Date.now() + 20 * MIN));
    expect(sms).toHaveLength(0);
  });

  it('nobody at all has a phone: it is written down, not thrown', async () => {
    employees = [];
    const n = build();
    const e = newEvent();
    await n.notifyNew(e.id);

    expect(sms).toHaveLength(0);
    expect(e.lastNotifyError).toBe('no phone number to send to');
    expect(e.notifyAttempts).toBe(1);
  });
});

/* ═════════════════ the ten-minute ladder ═════════════════ */

describe('the ladder', () => {
  it('does not climb before ten minutes', async () => {
    const n = build();
    await n.notifyNew(newEvent().id);
    sms = [];

    await n.runOnce(new Date(Date.now() + 9 * MIN));
    expect(sms).toHaveLength(0);
  });

  it('climbs to every owner after ten minutes with no answer', async () => {
    const n = build();
    const e = newEvent();
    await n.notifyNew(e.id);
    sms = [];

    await n.runOnce(new Date(Date.now() + 11 * MIN));
    expect(sms.map((s) => s.to).sort()).toEqual(['01822222222', '01933333333']);
    expect(e.ownerNotifiedAt).not.toBeNull();
  });

  it('an acknowledged escalation is never climbed', async () => {
    const n = build();
    const e = newEvent();
    await n.notifyNew(e.id);
    sms = [];
    e.acknowledgedAt = new Date();

    await n.runOnce(new Date(Date.now() + 30 * MIN));
    expect(sms).toHaveLength(0);
  });

  it('stops after the owner rung, however long it stays open', async () => {
    const n = build();
    const e = newEvent();
    await n.notifyNew(e.id);
    await n.runOnce(new Date(Date.now() + 11 * MIN));
    sms = [];

    await n.runOnce(new Date(Date.now() + 60 * MIN));
    await n.runOnce(new Date(Date.now() + 120 * MIN));
    expect(sms).toHaveLength(0);
  });

  it('an owner already told as the assignee is not told twice', async () => {
    convos = [{ id: 'c1', assigneeId: 'u-owner1' }];
    const n = build();
    const e = newEvent();
    await n.notifyNew(e.id);
    expect(sms.map((s) => s.to)).toEqual(['01822222222']);
    sms = [];

    await n.runOnce(new Date(Date.now() + 11 * MIN));
    expect(sms.map((s) => s.to)).toEqual(['01933333333']);
  });
});

/* ═════════════════ when sending fails ═════════════════ */

describe('a failure is recorded, not swallowed', () => {
  it('a refused send leaves the trail and the number masked', async () => {
    smsOk = false;
    const n = build();
    const e = newEvent();
    await n.notifyNew(e.id);

    expect(e.lastNotifyError).toContain('provider said no');
    expect(e.lastNotifyError).not.toContain('01711111111');
    expect(e.notifyAttempts).toBe(1);
    expect(e.employeeNotifiedAt).toBeNull();
  });

  it('and the next tick tries again', async () => {
    smsOk = false;
    const n = build();
    const e = newEvent();
    await n.notifyNew(e.id);
    sms = [];

    smsOk = true;
    await n.runOnce(new Date(Date.now() + 2 * MIN));
    expect(sms.map((s) => s.to)).toEqual(['01711111111']);
    expect(e.employeeNotifiedAt).not.toBeNull();
  });

  it('a broken database never breaks the escalation itself', async () => {
    const n = new EscalationNotifier(
      { db: { escalationEvent: { findFirst: async () => { throw new Error('db down'); } } } } as never,
      messaging,
      new OutboundGuard({} as never, prisma),
    );
    await expect(n.notifyNew('ev1')).resolves.toBeUndefined();
  });
});

/* ═════════════════ the AI switch leaves a trail ═════════════════ */

describe('turning the AI off is written down as before -> after', () => {
  const auditRows: Record<string, unknown>[] = [];

  function inbox(current: Record<string, unknown>) {
    auditRows.length = 0;
    const p = {
      db: {
        inboxSetting: {
          findFirst: async () => current,
          create: async () => current,
          update: async ({ data }: { data: Record<string, unknown> }) => ({ ...current, ...data }),
        },
      },
    } as never;
    const audit = { record: async (r: Record<string, unknown>) => { auditRows.push(r); } } as never;
    return new InboxService(p, audit, {} as never, {} as never);
  }

  it('records what it was, what it became, and who did it', async () => {
    const svc = inbox({ id: 'singleton', aiGloballyEnabled: true, staffGraceSec: 30 });
    await svc.updateSettings({ aiGloballyEnabled: false } as never, { id: 'u-owner1', name: 'sobuj' });

    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].changes).toEqual({ aiGloballyEnabled: { from: true, to: false } });
    expect(auditRows[0].actorName).toBe('sobuj');
    expect(auditRows[0].actorId).toBe('u-owner1');
  });

  it('X1 — switching it back ON is recorded and needs no PIN', async () => {
    const svc = inbox({ id: 'singleton', aiGloballyEnabled: false, staffGraceSec: 30 });
    await svc.updateSettings({ aiGloballyEnabled: true } as never, { name: 'sobuj' });

    expect(auditRows[0].changes).toEqual({ aiGloballyEnabled: { from: false, to: true } });
  });

  it('saving a form that changed nothing writes no entry', async () => {
    const svc = inbox({ id: 'singleton', aiGloballyEnabled: true, staffGraceSec: 30 });
    await svc.updateSettings({ aiGloballyEnabled: true, staffGraceSec: 30 } as never, { name: 'sobuj' });

    expect(auditRows).toHaveLength(0);
  });
});
