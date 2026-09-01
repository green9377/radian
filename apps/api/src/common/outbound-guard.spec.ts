import {
  InboxChannel, OrderMessageKind, OrderMessageStatus, OtpPurpose,
  OutboundBreachAction, OutboundLimitMetric, OutboundLimitScope,
} from '@prisma/client';

import { OutboundGuard } from './outbound-guard';
import { OutboundSettingsService } from './outbound-settings.service';
import { WhatsAppCloudService } from './whatsapp-cloud';
import { ChannelSender } from '../messaging/channel-sender.service';
import { MessagingService } from '../marketing/messaging.service';
import { OtpService } from '../messaging/otp.service';
import { OrderMessagesService } from '../messaging/order-messages.service';
import { LIMIT_SEEDS, clampLimitValue, clampWindowMinutes, clampBreachAction } from './outbound-limits.const';

/*
  ═══════════════════════════════════════════════════════════════════════════
  OUTBOUND GUARD — the RUNTIME test.

      npx jest src/common/outbound-guard.spec.ts

  The .mjs self-test reads the sources and proves each door still calls the
  guard. This is the other half, and the one that cannot be fooled: it builds
  the REAL services, replaces global.fetch with a recorder, and asks the only
  question that matters — did anything actually reach the wire?

  Nothing here touches a network, a database, a provider or a customer. Every
  dependency below the service under test is a stub.

  ⚠️ The point of most of these cases is the opposite of the old ones. The old
  guard asked WHO the recipient was; this one must let an authorised person
  reach ANY real number on purpose, and stop only what nobody meant to send.
  So "an arbitrary customer number goes through" is a PASS here, not a leak.
*/

/* ─────────────────────────── the wire ─────────────────────────── */

let wire: { url: string; body: string }[] = [];

const okResponse = () =>
  ({
    ok: true, status: 200,
    json: async () => ({ messages: [{ id: 'wamid.TEST' }], message_id: 'mid.TEST' }),
    text: async () => JSON.stringify({ messages: [{ id: 'wamid.TEST' }] }),
  }) as unknown as Response;

beforeAll(() => {
  global.fetch = jest.fn(async (input: unknown, init?: unknown) => {
    wire.push({ url: String(input), body: String((init as { body?: unknown } | undefined)?.body ?? '') });
    return okResponse();
  }) as unknown as typeof fetch;
});

/* ─────────────────────────── stubs ─────────────────────────── */

const CREDS: Record<string, Record<string, unknown>> = {
  'MESSAGING:WHATSAPP': { found: true, isEnabled: true, clientId: '111', apiKey: 'WA', clientSecret: 's', username: 'r' },
  'MESSAGING:SMS': { found: true, isEnabled: true, variant: 'MIMSMS', apiKey: 'K', clientSecret: 'S', username: 'RADIAN' },
  'MESSAGING:EMAIL': { found: true, isEnabled: true, variant: 'RESEND', apiKey: 'K', username: 'shop@radian.test', clientId: 'Radian' },
  'SOCIAL:FACEBOOK_PAGE': { found: true, isEnabled: true, apiKey: 'PAGE', clientId: '99' },
  'SOCIAL:INSTAGRAM': { found: true, isEnabled: true, apiKey: 'IG', clientId: '77' },
};
const integrations = {
  credentials: async (kind: string, provider: string) =>
    CREDS[`${kind}:${provider}`] ?? { found: false, isEnabled: false },
} as never;

const messageLogRows: Record<string, unknown>[] = [];
const orderMessageWrites: Record<string, unknown>[] = [];
const auditEvents: Record<string, unknown>[] = [];
const auditRecords: Record<string, unknown>[] = [];

/** one fake row per seeded limit, for the environment under test */
function seedRows(live: boolean) {
  return LIMIT_SEEDS.map((s, i) => ({
    id: `lim${i}`, scope: s.scope, key: s.key, metric: s.metric,
    windowMinutes: clampWindowMinutes(s.metric, s.windowMinutes),
    value: clampLimitValue(live ? s.prod : s.dev),
    onBreach: clampBreachAction(s.metric, s.onBreach),
    updatedById: null, updatedAt: new Date(), createdAt: new Date(), deletedAt: null,
  }));
}

interface World {
  setting: Record<string, unknown>;
  limits: ReturnType<typeof seedRows>;
  batches: Map<string, { id: string; declaredCount: number; actualCount: number; status: string }>;
}

function makePrisma(world: World) {
  return {
    db: {
      outboundSetting: {
        findUnique: async () => world.setting,
        findUniqueOrThrow: async () => world.setting,
        create: async () => world.setting,
        update: async (a: { data: Record<string, unknown> }) => {
          Object.assign(world.setting, a.data);
          return world.setting;
        },
      },
      outboundLimit: {
        count: async () => world.limits.length,
        findMany: async () => world.limits,
        findUnique: async () => null,
        createMany: async () => ({ count: 0 }),
        upsert: async (a: { create: Record<string, unknown> }) => ({ id: 'x', ...a.create }),
      },
      outboundBatch: {
        findUnique: async (a: { where: { id: string } }) => world.batches.get(a.where.id) ?? null,
        update: async (a: { where: { id: string }; data: Record<string, unknown> }) => {
          const b = world.batches.get(a.where.id);
          if (b && (a.data as { actualCount?: { increment: number } }).actualCount)
            b.actualCount += 1;
          if (b && typeof a.data.status === 'string') b.status = a.data.status as string;
          return b;
        },
      },
      messageLog: { create: async (a: { data: Record<string, unknown> }) => { messageLogRows.push(a.data); return a.data; } },
      marketingOptOut: { findFirst: async () => null },
      messagingSetting: {
        findUnique: async () => ({ id: 'singleton', emailReplyTo: null, testPhone: null, testEmail: null }),
        create: async () => ({ id: 'singleton', emailReplyTo: null, testPhone: null, testEmail: null }),
      },
      phoneOtp: {
        count: async () => 0, findFirst: async () => null,
        updateMany: async () => ({ count: 0 }),
        create: async () => ({ id: 'otp1', createdAt: new Date() }),
        update: async () => ({ id: 'otp1' }),
      },
      orderMessage: {
        findFirst: async () => ({
          id: 'om1', status: OrderMessageStatus.QUEUED, kind: OrderMessageKind.ORDER_CONFIRMATION,
          order: {
            id: 'o1', orderNo: 'RAD-73412', senderName: 'Test Buyer', senderPhone: '01911223344',
            totalPaisa: 60000, salesStatus: 'placed', paymentStatus: 'unpaid', deletedAt: null,
          },
        }),
        update: async (a: { data: Record<string, unknown> }) => { orderMessageWrites.push(a.data); return a.data; },
      },
      reviewInvite: { findFirst: async () => null, updateMany: async () => ({ count: 0 }) },
    },
  } as never;
}

const audit = {
  event: async (p: Record<string, unknown>) => { auditEvents.push(p); },
  record: async (p: Record<string, unknown>) => { auditRecords.push(p); },
} as never;
const msgSettings = { supportPhone: async () => '01700000000' } as never;

/* ─────────────────────────── wiring ─────────────────────────── */

function build(opts: { live?: boolean; manualKill?: boolean; tripped?: boolean } = {}) {
  const world: World = {
    setting: {
      id: 'singleton',
      manualKill: !!opts.manualKill,
      manualKillReason: opts.manualKill ? 'test' : null,
      manualKillAt: null,
      breakerTrippedAt: opts.tripped ? new Date() : null,
      breakerTrippedReason: opts.tripped ? 'test trip' : null,
      breakerTrippedMetric: null,
    },
    limits: seedRows(!!opts.live),
    batches: new Map(),
  };
  const prisma = makePrisma(world);
  const settings = new OutboundSettingsService(prisma, audit);
  const guard = new OutboundGuard(settings, prisma, audit);
  const wa = new WhatsAppCloudService(integrations, guard);
  const messaging = new MessagingService(prisma, audit, integrations, guard);
  return {
    world, settings, guard, wa, messaging,
    sender: new ChannelSender(wa, integrations, guard),
    otp: new OtpService(prisma, wa, messaging),
    orderMessages: new OrderMessagesService(prisma, wa, msgSettings),
  };
}

const CUSTOMER = '01911223344';   // an arbitrary real customer
const OTHER = '01722334455';
const TESTER = '01712345678';

beforeEach(() => {
  wire = [];
  messageLogRows.length = 0;
  orderMessageWrites.length = 0;
  auditEvents.length = 0;
  auditRecords.length = 0;
  process.env.STACK = 'dev';
});

afterAll(() => { delete process.env.STACK; });

/* ═══════ 1. an intentional test reaches any real recipient ═══════ */

describe('development can message an arbitrary real recipient on purpose', () => {
  test('WhatsApp to a number nobody listed anywhere', async () => {
    const { wa } = build();
    const r = await wa.sendRaw(CUSTOMER, { type: 'text', text: { body: 'hi' } }, { origin: 'manual-test' });
    expect(r.ok).toBe(true);
    expect(wire).toHaveLength(1);
    expect(wire[0].body).toContain('8801911223344');
  });

  test('SMS to an arbitrary number', async () => {
    const { messaging } = build();
    const r = await messaging.sendSms({ to: OTHER, text: 'real test', origin: 'manual-test' });
    expect(r.ok).toBe(true);
    expect(wire).toHaveLength(1);
  });

  test('OTP goes to whatever number the customer typed', async () => {
    const { otp } = build();
    const r = await otp.send({ phone: CUSTOMER, purpose: OtpPurpose.LOGIN });
    expect(r.sent).toBe(true);
    expect(wire.length).toBeGreaterThan(0);
  });

  test('a human reply reaches a real Instagram customer', async () => {
    const { sender } = build();
    const r = await sender.send(
      { id: 'c1', channel: InboxChannel.INSTAGRAM, externalIdentity: '17841400000000000' }, 'hello',
    );
    expect(r.ok).toBe(true);
    expect(wire).toHaveLength(1);
  });

  test('an order message goes out', async () => {
    const { orderMessages } = build();
    const verdict = await orderMessages.sendOne('om1');
    expect(verdict).toBe('SENT');
    expect(wire).toHaveLength(1);
  });
});

/* ═══════ 2. the accidents are stopped ═══════ */

describe('what nobody meant to send is stopped', () => {
  test('a runaway loop dies at the declared size', async () => {
    const { guard, wa } = build();
    guard.registerBatch('b1', 3);
    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await wa.sendRaw(`0171234567${i}`, { type: 'text', text: { body: 'x' } },
        { origin: 'campaign', batchId: 'b1' });
      results.push(r.ok);
    }
    expect(results.slice(0, 3)).toEqual([true, true, true]);
    expect(results.slice(3)).toEqual([false, false, false]);
    expect(wire).toHaveLength(3);
  });

  test('overflow trips the breaker', async () => {
    const { guard, wa, world } = build();
    guard.registerBatch('b2', 1);
    await wa.sendRaw(TESTER, { type: 'text', text: { body: 'x' } }, { origin: 'campaign', batchId: 'b2' });
    await wa.sendRaw(OTHER, { type: 'text', text: { body: 'x' } }, { origin: 'campaign', batchId: 'b2' });
    expect(world.setting.breakerTrippedAt).toBeTruthy();
  });

  test('an undeclared sender may send exactly one per batch', async () => {
    const { wa, world } = build();
    world.batches.set('unknown', { id: 'unknown', declaredCount: 1, actualCount: 1, status: 'RUNNING' });
    const r = await wa.sendRaw(CUSTOMER, { type: 'text', text: { body: 'x' } },
      { origin: 'campaign', batchId: 'unknown' });
    expect(r.ok).toBe(false);
    expect(wire).toHaveLength(0);
  });

  test('a duplicate job cannot send the same message twice', async () => {
    const { orderMessages } = build();
    const a = await orderMessages.sendOne('om1');
    const b = await orderMessages.sendOne('om1');
    expect(a).toBe('SENT');
    expect(b).not.toBe('SENT');
    expect(wire).toHaveLength(1);
  });

  test('too many DIFFERENT recipients trips the breaker', async () => {
    const { messaging, world } = build();
    /*  The development ceiling is a hundred different people an hour; a loop
        walking a customer list is what this number exists to catch.  */
    let blocked = 0;
    for (let i = 0; i < 120; i++) {
      const r = await messaging.sendSms({ to: `018${String(10000000 + i)}`, text: 'x', origin: 'campaign' });
      if (!r.ok) blocked++;
    }
    expect(blocked).toBeGreaterThan(0);
    expect(world.setting.breakerTrippedAt).toBeTruthy();
  });
});

/* ═══════ 3. the two switches ═══════ */

describe('the manual switch and the automatic breaker are different things', () => {
  test('a tripped breaker stops a customer message', async () => {
    const { wa } = build({ tripped: true });
    const r = await wa.sendRaw(CUSTOMER, { type: 'text', text: { body: 'x' } }, { origin: 'order-message' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('BLOCKED');
    expect(wire).toHaveLength(0);
  });

  test('a tripped breaker does NOT stop the escalation SMS', async () => {
    const { messaging } = build({ tripped: true });
    const r = await messaging.sendSms({ to: TESTER, text: '[DEV] a thread needs you', origin: 'escalation' });
    expect(r.ok).toBe(true);
    expect(wire).toHaveLength(1);
  });

  test('the manual kill switch stops the escalation SMS too', async () => {
    const { messaging } = build({ manualKill: true });
    const r = await messaging.sendSms({ to: TESTER, text: '[DEV] a thread needs you', origin: 'escalation' });
    expect(r.ok).toBe(false);
    expect(wire).toHaveLength(0);
  });

  test('the manual kill switch stops everything else as well', async () => {
    const { wa, sender } = build({ manualKill: true });
    expect((await wa.sendRaw(TESTER, { type: 'text', text: { body: 'x' } })).ok).toBe(false);
    const r = await sender.send({ id: 'c', channel: InboxChannel.MESSENGER, externalIdentity: '287' }, 'x');
    expect(r.ok).toBe(false);
    expect(wire).toHaveLength(0);
  });
});

/* ═══════ 4. the hard boundary ═══════ */

describe('configuration cannot leave the hard boundary', () => {
  test('a limit above the ceiling is clamped, and says so', async () => {
    const { settings } = build();
    const out = await settings.setLimit(
      { scope: OutboundLimitScope.GLOBAL, key: '', metric: OutboundLimitMetric.TOTAL,
        windowMinutes: 60, value: 99_999, onBreach: OutboundBreachAction.TRIP },
      { id: 'u1', name: 'Owner' },
    );
    expect(out.stored.value).toBe(10_000);
    expect(out.clamped).toBe(true);
  });

  test('the repeat window cannot be set to zero', async () => {
    const { settings } = build();
    const out = await settings.setLimit(
      { scope: OutboundLimitScope.GLOBAL, key: '', metric: OutboundLimitMetric.REPEAT,
        windowMinutes: 0, value: 1, onBreach: OutboundBreachAction.BLOCK },
      { id: 'u1', name: 'Owner' },
    );
    expect(out.stored.windowMinutes).toBeGreaterThan(0);
  });

  test('the breaker cannot be softened away on the recipient-count metric', async () => {
    const { settings } = build();
    const out = await settings.setLimit(
      { scope: OutboundLimitScope.GLOBAL, key: '', metric: OutboundLimitMetric.DISTINCT,
        windowMinutes: 60, value: 100, onBreach: OutboundBreachAction.WARN },
      { id: 'u1', name: 'Owner' },
    );
    expect(out.stored.onBreach).toBe(OutboundBreachAction.TRIP);
    expect(out.clamped).toBe(true);
  });

  test('a limit change is audited from → to', async () => {
    const { settings } = build();
    await settings.setLimit(
      { scope: OutboundLimitScope.CHANNEL, key: 'SMS', metric: OutboundLimitMetric.TOTAL,
        windowMinutes: 60, value: 300, onBreach: OutboundBreachAction.TRIP },
      { id: 'u1', name: 'Owner' },
    );
    expect(auditRecords).toHaveLength(1);
    const changes = auditRecords[0].changes as Record<string, unknown>;
    expect(changes).toHaveProperty('value');
    expect(auditRecords[0].actorName).toBe('Owner');
  });
});

/* ═══════ 5. the switches are audited and persistent ═══════ */

describe('the switches leave a trail', () => {
  test('turning the kill switch off records who and why', async () => {
    const { settings, world } = build({ manualKill: true });
    await settings.resumeAll('the fault was fixed', { id: 'u1', name: 'Owner' });
    expect(world.setting.manualKill).toBe(false);
    expect(world.setting.manualKillClearedReason).toBe('the fault was fixed');
    expect(auditRecords.some((r) => (r.changes as Record<string, unknown>).reason === 'the fault was fixed')).toBe(true);
  });

  test('the breaker reset is audited and never automatic', async () => {
    const { settings, world } = build({ tripped: true });
    await settings.resetBreaker({ id: 'u1', name: 'Owner' });
    expect(world.setting.breakerTrippedAt).toBeNull();
    expect(auditRecords).toHaveLength(1);
  });
});

/* ═══════ 6. a block is never silent ═══════ */

describe('a refusal is always written down', () => {
  test('the persistent trail gets the block, with the number masked', async () => {
    const { wa } = build({ manualKill: true });
    await wa.sendRaw(CUSTOMER, { type: 'text', text: { body: 'x' } }, { origin: 'order-message' });
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].entityType).toBe('OutboundGuard');
    expect(String(auditEvents[0].label)).not.toContain('1122');
  });

  test('a blocked SMS also lands in MessageLog', async () => {
    const { messaging } = build({ manualKill: true });
    await messaging.sendSms({ to: CUSTOMER, text: 'x', origin: 'campaign' });
    expect(messageLogRows).toHaveLength(1);
    expect(messageLogRows[0].status).toBe('FAILED');
    expect(String(messageLogRows[0].error)).toContain('BLOCKED');
  });

  test('the status screen shows the rules and what they stopped', async () => {
    const { guard, wa } = build({ manualKill: true });
    await wa.sendRaw(CUSTOMER, { type: 'text', text: { body: 'x' } }, { origin: 'order-message' });
    const s = await guard.status();
    expect(s.manualKill).toBe(true);
    expect(s.recentlyBlocked).toHaveLength(1);
    expect(s.limits.length).toBeGreaterThan(0);
  });
});

/* ═══════ 7. production keeps its own, looser numbers ═══════ */

describe('the live stack is seeded differently', () => {
  test('production allows more different recipients than development', async () => {
    const dev = build({ live: false });
    const prod = build({ live: true });
    const distinct = (b: ReturnType<typeof build>) =>
      b.world.limits.find((l) => l.metric === OutboundLimitMetric.DISTINCT)!.value;
    expect(distinct(dev)).toBe(100);
    expect(distinct(prod)).toBe(500);
  });
});
