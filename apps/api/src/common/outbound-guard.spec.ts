import { InboxChannel, OrderMessageKind, OrderMessageStatus, OtpPurpose } from '@prisma/client';

import { OutboundGuard } from './outbound-guard';
import { WhatsAppCloudService } from './whatsapp-cloud';
import { ChannelSender } from '../messaging/channel-sender.service';
import { MessagingService } from '../marketing/messaging.service';
import { OtpService } from '../messaging/otp.service';
import { OrderMessagesService } from '../messaging/order-messages.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  OUTBOUND GUARD — the RUNTIME test.

      npx jest src/common/outbound-guard.spec.ts

  The .mjs self-test reads the source and proves each door still calls the
  guard. This one is the other half and the one that cannot be fooled: it
  builds the REAL services, replaces global.fetch with a recorder, and asks the
  only question that matters —

      did anything actually reach the wire?

  Nothing here touches a network, a database, a customer or a provider. Every
  dependency below the service under test is a stub, and `fetch` is replaced
  for the whole file, so a regression that let a message out would show up as
  a recorded call rather than as a real SMS.

  The paths covered are the ones a real message can come from:
  OTP, order messages, the abandoned-cart sweeper's sender, the inbox
  (Messenger + Instagram), and the admin's own SMS/email.
*/

/* ─────────────────────────── the wire ─────────────────────────── */

let wire: { url: string; body: string }[] = [];

const okResponse = () =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ messages: [{ id: 'wamid.TEST' }], message_id: 'mid.TEST' }),
    text: async () => JSON.stringify({ messages: [{ id: 'wamid.TEST' }] }),
  }) as unknown as Response;

beforeAll(() => {
  global.fetch = jest.fn(async (input: unknown, init?: unknown) => {
    wire.push({
      url: String(input),
      body: String((init as { body?: unknown } | undefined)?.body ?? ''),
    });
    return okResponse();
  }) as unknown as typeof fetch;
});

/* ─────────────────────────── stubs ─────────────────────────── */

const CREDS: Record<string, Record<string, unknown>> = {
  'MESSAGING:WHATSAPP': {
    found: true, isEnabled: true, isLive: false,
    clientId: '111222333', apiKey: 'WA_TOKEN', clientSecret: 'secret', username: 'radian',
  },
  'MESSAGING:SMS': {
    found: true, isEnabled: true, isLive: false, variant: 'MIMSMS',
    apiKey: 'SMS_KEY', clientSecret: 'SMS_SECRET', username: 'RADIAN', baseUrl: null,
  },
  'MESSAGING:EMAIL': {
    found: true, isEnabled: true, variant: 'RESEND',
    apiKey: 'EMAIL_KEY', username: 'shop@radian.test', clientId: 'Radian', baseUrl: null,
  },
  'SOCIAL:FACEBOOK_PAGE': { found: true, isEnabled: true, apiKey: 'PAGE_TOKEN', clientId: '9988' },
  'SOCIAL:INSTAGRAM': { found: true, isEnabled: true, apiKey: 'IG_TOKEN', clientId: '7766' },
};

const integrations = {
  credentials: async (kind: string, provider: string) =>
    CREDS[`${kind}:${provider}`] ?? { found: false, isEnabled: false },
} as never;

const messageLogRows: Record<string, unknown>[] = [];
const orderMessageWrites: Record<string, unknown>[] = [];

const prisma = {
  db: {
    messageLog: { create: async (a: { data: Record<string, unknown> }) => { messageLogRows.push(a.data); return a.data; } },
    marketingOptOut: { findFirst: async () => null },
    messagingSetting: {
      findUnique: async () => ({ id: 'singleton', emailReplyTo: null, testPhone: null, testEmail: null }),
      create: async () => ({ id: 'singleton', emailReplyTo: null, testPhone: null, testEmail: null }),
    },
    phoneOtp: {
      count: async () => 0,
      findFirst: async () => null,
      updateMany: async () => ({ count: 0 }),
      create: async () => ({ id: 'otp1', createdAt: new Date() }),
      update: async () => ({ id: 'otp1' }),
    },
    orderMessage: {
      findFirst: async () => ({
        id: 'om1',
        status: OrderMessageStatus.QUEUED,
        kind: OrderMessageKind.ORDER_CONFIRMATION,
        order: {
          id: 'o1', orderNo: 'DEV-73412', senderName: 'Test Buyer',
          senderPhone: '01911223344', totalPaisa: 60000,
          salesStatus: 'placed', paymentStatus: 'unpaid', deletedAt: null,
        },
      }),
      update: async (a: { data: Record<string, unknown> }) => { orderMessageWrites.push(a.data); return a.data; },
    },
    reviewInvite: { findFirst: async () => null, updateMany: async () => ({ count: 0 }) },
  },
} as never;

const audit = { event: async () => undefined, record: async () => undefined } as never;
const settings = { supportPhone: async () => '01700000000' } as never;

/* ─────────────────────────── wiring ─────────────────────────── */

function build() {
  const guard = new OutboundGuard();
  const wa = new WhatsAppCloudService(integrations, guard);
  const messaging = new MessagingService(prisma, audit, integrations, guard);
  return {
    guard,
    wa,
    messaging,
    sender: new ChannelSender(wa, integrations, guard),
    otp: new OtpService(prisma, wa, messaging),
    orderMessages: new OrderMessagesService(prisma, wa, settings),
  };
}

const ENV_KEYS = [
  'STACK', 'OUTBOUND_DISABLED', 'OUTBOUND_ALLOWLIST',
  'OUTBOUND_MAX_PER_HOUR', 'OUTBOUND_REDIRECT_TO',
];

function env(values: Record<string, string>) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, values);
}

/** A development stack that has been set up correctly. */
const DEV = { STACK: 'dev', OUTBOUND_ALLOWLIST: '01712345678' };
/** A development stack where somebody forgot the allowlist. */
const DEV_UNCONFIGURED = { STACK: 'dev' };
const LIVE = { STACK: 'live' };

const CUSTOMER = '01911223344';   // a real customer: never on the allowlist
const TESTER = '01712345678';     // the approved test handset

beforeEach(() => {
  wire = [];
  messageLogRows.length = 0;
  orderMessageWrites.length = 0;
});

afterAll(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

/* ════════════════ 1. every path is blocked for a customer ════════════════ */

describe('a development stack cannot message a real customer', () => {
  test('OTP reaches neither WhatsApp nor SMS', async () => {
    env(DEV);
    const { otp } = build();
    const r = await otp.send({ phone: CUSTOMER, purpose: OtpPurpose.LOGIN });
    expect(r.sent).toBe(false);
    expect(wire).toHaveLength(0);
  });

  test('an order message never leaves', async () => {
    env(DEV);
    const { orderMessages } = build();
    const verdict = await orderMessages.sendOne('om1');
    expect(wire).toHaveLength(0);
    expect(verdict).not.toBe('SENT');
    expect(String(orderMessageWrites[0]?.error)).toContain('BLOCKED');
  });

  test('WhatsApp (door A) never leaves', async () => {
    env(DEV);
    const { wa } = build();
    const r = await wa.sendRaw(CUSTOMER, { type: 'text', text: { body: 'hi' } });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('BLOCKED');
    expect(wire).toHaveLength(0);
  });

  test('Messenger (door B) never leaves', async () => {
    env(DEV);
    const { sender } = build();
    const r = await sender.send(
      { id: 'c1', channel: InboxChannel.MESSENGER, externalIdentity: '28729587416665125' },
      'hello',
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('BLOCKED');
    expect(wire).toHaveLength(0);
  });

  test('Instagram (door B) never leaves', async () => {
    env(DEV);
    const { sender } = build();
    const r = await sender.send(
      { id: 'c2', channel: InboxChannel.INSTAGRAM, externalIdentity: '17841400000000000' },
      'hello',
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('BLOCKED');
    expect(wire).toHaveLength(0);
  });

  test('the admin SMS test button never leaves, and the block is written down', async () => {
    env(DEV);
    const { messaging } = build();
    const r = await messaging.sendSms({ to: CUSTOMER, text: 'campaign' });
    expect(r.ok).toBe(false);
    expect(wire).toHaveLength(0);
    expect(messageLogRows).toHaveLength(1);
    expect(messageLogRows[0].status).toBe('FAILED');
    expect(String(messageLogRows[0].error)).toContain('BLOCKED');
  });

  test('email is blocked the same way', async () => {
    env(DEV);
    const { messaging } = build();
    const r = await messaging.sendEmail({ to: 'customer@example.com', subject: 's', html: '<p>x</p>' });
    expect(r.ok).toBe(false);
    expect(wire).toHaveLength(0);
    expect(messageLogRows).toHaveLength(1);
  });
});

/* ════════════════ 2. the approved handset still works ════════════════ */

describe('an approved test number still gets the real thing', () => {
  test('WhatsApp really goes out', async () => {
    env(DEV);
    const { wa } = build();
    const r = await wa.sendRaw(TESTER, { type: 'text', text: { body: 'hi' } });
    expect(r.ok).toBe(true);
    expect(wire).toHaveLength(1);
    expect(wire[0].url).toContain('/messages');
    expect(wire[0].body).toContain('8801712345678');
  });

  test('SMS really goes out', async () => {
    env(DEV);
    const { messaging } = build();
    const r = await messaging.sendSms({ to: TESTER, text: 'real test' });
    expect(r.ok).toBe(true);
    expect(wire).toHaveLength(1);
    expect(messageLogRows[0].status).toBe('SENT');
  });

  test('OTP completes on the approved handset', async () => {
    env(DEV);
    const { otp } = build();
    const r = await otp.send({ phone: TESTER, purpose: OtpPurpose.LOGIN });
    expect(r.sent).toBe(true);
    expect(wire.length).toBeGreaterThan(0);
  });
});

/* ════════════════ 3. fail-safe: an unconfigured DEV stack ════════════════ */

describe('an unconfigured development stack blocks everything', () => {
  test('with no allowlist, even the tester is refused', async () => {
    env(DEV_UNCONFIGURED);
    const { wa, messaging } = build();
    expect((await wa.sendRaw(TESTER, { type: 'text', text: { body: 'x' } })).ok).toBe(false);
    expect((await messaging.sendSms({ to: TESTER, text: 'x' })).ok).toBe(false);
    expect(wire).toHaveLength(0);
  });

  test('an unset STACK is treated as development, not as live', async () => {
    env({});
    const { wa } = build();
    expect((await wa.sendRaw(CUSTOMER, { type: 'text', text: { body: 'x' } })).ok).toBe(false);
    expect(wire).toHaveLength(0);
  });
});

/* ════════════════ 4. the live stack is unchanged ════════════════ */

describe('the live stack behaves as it always did', () => {
  test('an empty allowlist means every customer is reachable', async () => {
    env(LIVE);
    const { wa, messaging } = build();
    expect((await wa.sendRaw(CUSTOMER, { type: 'text', text: { body: 'x' } })).ok).toBe(true);
    expect((await messaging.sendSms({ to: CUSTOMER, text: 'x' })).ok).toBe(true);
    expect(wire).toHaveLength(2);
  });
});

/* ════════════════ 5. kill switch, ceiling, catch-all ════════════════ */

describe('the other three levers', () => {
  test('the kill switch stops even the live stack', async () => {
    env({ ...LIVE, OUTBOUND_DISABLED: 'true' });
    const { wa } = build();
    expect((await wa.sendRaw(CUSTOMER, { type: 'text', text: { body: 'x' } })).ok).toBe(false);
    expect(wire).toHaveLength(0);
  });

  test('the runtime kill switch needs no env and no deploy', async () => {
    env(LIVE);
    const { guard, wa } = build();
    guard.setKill(true);
    expect((await wa.sendRaw(CUSTOMER, { type: 'text', text: { body: 'x' } })).ok).toBe(false);
    expect(wire).toHaveLength(0);
  });

  test('the hourly ceiling is enforced across channels, not per channel', async () => {
    env({ ...DEV, OUTBOUND_MAX_PER_HOUR: '2' });
    const { wa, messaging } = build();
    expect((await wa.sendRaw(TESTER, { type: 'text', text: { body: '1' } })).ok).toBe(true);
    expect((await messaging.sendSms({ to: TESTER, text: '2' })).ok).toBe(true);
    expect((await wa.sendRaw(TESTER, { type: 'text', text: { body: '3' } })).ok).toBe(false);
    expect(wire).toHaveLength(2);
  });

  test('catch-all sends a customer message to the test handset instead', async () => {
    env({ STACK: 'dev', OUTBOUND_ALLOWLIST: CUSTOMER, OUTBOUND_REDIRECT_TO: TESTER });
    const { wa } = build();
    const r = await wa.sendRaw(CUSTOMER, { type: 'text', text: { body: 'x' } });
    expect(r.ok).toBe(true);
    expect(wire).toHaveLength(1);
    expect(wire[0].body).toContain('8801712345678');
    expect(wire[0].body).not.toContain('8801911223344');
  });
});

/* ════════════════ 6. the blocks are written down ════════════════ */

describe('a block is never silent', () => {
  test('the guard keeps a masked record of what it stopped', async () => {
    env(DEV);
    const { guard, wa } = build();
    await wa.sendRaw(CUSTOMER, { type: 'text', text: { body: 'x' } });
    const s = guard.status();
    expect(s.recentlyBlocked).toHaveLength(1);
    expect(s.recentlyBlocked[0].channel).toBe('WHATSAPP');
    expect(s.recentlyBlocked[0].recipient).not.toContain('1122');
    expect(s.restricted).toBe(true);
    expect(s.emptyAllowlistMeans).toContain('nobody');
  });
});
