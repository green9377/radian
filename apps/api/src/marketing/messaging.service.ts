import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { ensureSingleton } from '../common/singleton';

/*
  EMAIL & SMS — MKT-D19.

  Every provider worth using speaks plain HTTP, so this talks to all of them
  with `fetch` and nothing installed. That is not a shortcut: adding an npm
  package to the API means rebuilding the container, and a rebuild is exactly
  the kind of chore that gets put off for a month while the feature sits unused.

  PROVIDER-AGNOSTIC, because the owner has no account with any of them yet and
  guessing which one he opens would be a coin toss. Pick from a dropdown, paste
  the key, press Test. Bangladeshi SMS gateways in particular get swapped on
  price two or three times a year — that should be a dropdown, not a rewrite,
  and CUSTOM covers whatever appears next.

  NOTHING IS SENT UNTIL IT IS SWITCHED ON and a key exists. A half-configured
  channel refuses loudly rather than failing quietly at three in the morning.

  MKT-D19 — every send is logged with the provider's own answer. For SMS,
  where each message costs money, "did it arrive?" needs a better answer than
  "probably".
*/

const ENTITY = 'MessagingSetting';

export interface SendResult {
  ok: boolean;
  providerRef?: string;
  error?: string;
  raw?: string;
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ---------------- settings ---------------- */

  async get() {
    // ensureSingleton — survives two requests creating this row at once (P2002)
    return ensureSingleton(
      () => this.prisma.db.messagingSetting.findUnique({ where: { id: 'singleton' } }),
      () => this.prisma.db.messagingSetting.create({ data: { id: 'singleton' } }),
    );
  }

  /** keys are passwords — the screen learns only that one exists */
  private safe<T extends { emailApiKey: string | null; smsApiKey: string | null }>(row: T) {
    return {
      ...row,
      emailApiKey: null,
      smsApiKey: null,
      emailKeySet: !!row.emailApiKey,
      smsKeySet: !!row.smsApiKey,
    };
  }

  async getForAdmin() {
    return this.safe(await this.get());
  }

  async update(dto: Record<string, unknown>, actorName: string) {
    await this.get();
    const data: Prisma.MessagingSettingUpdateInput = {};
    const t = (k: string) =>
      dto[k] === undefined ? undefined : (String(dto[k] ?? '').trim() || null);

    if (dto.emailEnabled !== undefined) data.emailEnabled = !!dto.emailEnabled;
    if (dto.emailProvider !== undefined) data.emailProvider = String(dto.emailProvider);
    if (dto.emailApiKey !== undefined) data.emailApiKey = t('emailApiKey');
    if (dto.emailFromName !== undefined) data.emailFromName = t('emailFromName');
    if (dto.emailFromAddress !== undefined) data.emailFromAddress = t('emailFromAddress');
    if (dto.emailReplyTo !== undefined) data.emailReplyTo = t('emailReplyTo');
    if (dto.emailDomain !== undefined) data.emailDomain = t('emailDomain');

    if (dto.smsEnabled !== undefined) data.smsEnabled = !!dto.smsEnabled;
    if (dto.smsProvider !== undefined) data.smsProvider = String(dto.smsProvider);
    if (dto.smsApiKey !== undefined) data.smsApiKey = t('smsApiKey');
    if (dto.smsSenderId !== undefined) data.smsSenderId = t('smsSenderId');
    if (dto.smsCustomUrl !== undefined) data.smsCustomUrl = t('smsCustomUrl');

    if (dto.testEmail !== undefined) data.testEmail = t('testEmail');
    if (dto.testPhone !== undefined) data.testPhone = t('testPhone');

    const row = await this.prisma.db.messagingSetting.update({ where: { id: 'singleton' }, data });

    const audit: Record<string, unknown> = { ...(data as Record<string, unknown>) };
    if ('emailApiKey' in audit) audit.emailApiKey = audit.emailApiKey ? '(set)' : '(cleared)';
    if ('smsApiKey' in audit) audit.smsApiKey = audit.smsApiKey ? '(set)' : '(cleared)';
    await this.audit.record({ entityType: ENTITY, entityId: 'singleton', action: 'UPDATE', actorName, changes: audit });

    return this.safe(row);
  }

  async status() {
    const s = await this.get();
    return {
      email: {
        enabled: s.emailEnabled,
        provider: s.emailProvider,
        keySet: !!s.emailApiKey,
        fromSet: !!s.emailFromAddress,
        ready: s.emailEnabled && !!s.emailApiKey && !!s.emailFromAddress,
      },
      sms: {
        enabled: s.smsEnabled,
        provider: s.smsProvider,
        keySet: !!s.smsApiKey,
        senderSet: !!s.smsSenderId,
        ready: s.smsEnabled && !!s.smsApiKey,
      },
      testEmail: s.testEmail,
      testPhone: s.testPhone,
    };
  }

  /* ---------------- sending ---------------- */

  /**
   * MKT-RULE-009, REV-MKT-9 — added 30 Jul 2026.
   *
   * "A customer in MarketingOptOut is excluded from every list and every send.
   * Exception: none." The WhatsApp path enforced that twice over — the audience
   * filter drops them, and OutreachService.log() refuses them again. This path
   * enforced it **nowhere**: sendEmail and sendSms took a customerId and sent.
   *
   * Nothing has been harmed yet only because no key is saved and no broadcast
   * uses email or SMS. That is luck, not a design, and it runs out the day the
   * first key is pasted in. A rule that holds on one channel and not another is
   * not a rule.
   *
   * A test send (isTest) has no customerId, so it is unaffected.
   */
  private async refuseIfOptedOut(customerId?: string) {
    if (!customerId) return;
    const c = await this.prisma.db.customer.findUnique({
      where: { id: customerId },
      select: { name: true, marketingOptOut: { select: { deletedAt: true } } },
    });
    // the extension does not reach into a nested include — check by hand
    if (c?.marketingOptOut && c.marketingOptOut.deletedAt === null) {
      throw new BadRequestException(
        `${c.name} has asked not to be contacted (MKT-RULE-009)`,
      );
    }
  }

  async sendEmail(input: {
    to: string;
    subject: string;
    html: string;
    customerId?: string;
    outreachId?: string;
    broadcastId?: string;
    isTest?: boolean;
    actorName?: string;
  }): Promise<SendResult> {
    /*  FIRST, before anything about configuration.
        MKT-RULE-009 has no exception, so it must not sit behind a check that
        happens to be failing today for another reason — "Email is switched off"
        would hide it now and stop hiding it the day a key is pasted in, which
        is the worst possible time to discover the order was wrong. */
    await this.refuseIfOptedOut(input.customerId);

    const s = await this.get();
    if (!s.emailEnabled) throw new BadRequestException('Email is switched off');
    if (!s.emailApiKey) throw new BadRequestException('No email key has been saved yet');
    if (!s.emailFromAddress) throw new BadRequestException('Set the address emails are sent from');

    const from = { name: s.emailFromName ?? 'Radian', email: s.emailFromAddress };
    let result: SendResult;

    try {
      switch (s.emailProvider) {
        case 'RESEND':
          result = await this.http('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${s.emailApiKey}`, 'content-type': 'application/json' },
            body: JSON.stringify({
              from: `${from.name} <${from.email}>`,
              to: [input.to],
              subject: input.subject,
              html: input.html,
              ...(s.emailReplyTo ? { reply_to: s.emailReplyTo } : {}),
            }),
          }, 'id');
          break;

        case 'SENDGRID':
          result = await this.http('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: { Authorization: `Bearer ${s.emailApiKey}`, 'content-type': 'application/json' },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: input.to }] }],
              from: { email: from.email, name: from.name },
              subject: input.subject,
              content: [{ type: 'text/html', value: input.html }],
              ...(s.emailReplyTo ? { reply_to: { email: s.emailReplyTo } } : {}),
            }),
          });
          break;

        case 'MAILGUN': {
          if (!s.emailDomain) throw new Error('Mailgun needs its sending domain');
          const form = new URLSearchParams({
            from: `${from.name} <${from.email}>`,
            to: input.to,
            subject: input.subject,
            html: input.html,
          });
          result = await this.http(`https://api.mailgun.net/v3/${s.emailDomain}/messages`, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${Buffer.from(`api:${s.emailApiKey}`).toString('base64')}`,
              'content-type': 'application/x-www-form-urlencoded',
            },
            body: form.toString(),
          }, 'id');
          break;
        }

        case 'BREVO':
        default:
          result = await this.http('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': s.emailApiKey, 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
              sender: from,
              to: [{ email: input.to }],
              subject: input.subject,
              htmlContent: input.html,
              ...(s.emailReplyTo ? { replyTo: { email: s.emailReplyTo } } : {}),
            }),
          }, 'messageId');
          break;
      }
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    /*  Named one by one, not `...input`. Spreading it after the explicit keys
        overwrote them and TypeScript stops the build over it — which is how
        the API refused to come back up on 28 Jul. Explicit is also why `html`
        does not leak into a field called `body` by accident. */
    await this.log({
      channel: 'EMAIL',
      to: input.to,
      subject: input.subject,
      body: input.html,
      provider: s.emailProvider,
      result,
      customerId: input.customerId,
      outreachId: input.outreachId,
      broadcastId: input.broadcastId,
      isTest: input.isTest,
      actorName: input.actorName,
    });
    return result;
  }

  async sendSms(input: {
    to: string;
    text: string;
    customerId?: string;
    outreachId?: string;
    broadcastId?: string;
    isTest?: boolean;
    actorName?: string;
  }): Promise<SendResult> {
    // first, for the same reason as sendEmail above
    await this.refuseIfOptedOut(input.customerId);

    const s = await this.get();
    if (!s.smsEnabled) throw new BadRequestException('SMS is switched off');
    if (!s.smsApiKey) throw new BadRequestException('No SMS key has been saved yet');

    /*  Bangladeshi numbers reach the gateways as 8801XXXXXXXXX — no plus, no
        leading zero. Every gateway wants it that way and every one of them
        fails silently if it is wrong. */
    const to = normaliseBd(input.to);
    if (!to) throw new BadRequestException(`"${input.to}" does not look like a Bangladeshi mobile number`);

    let result: SendResult;
    try {
      switch (s.smsProvider) {
        case 'CUSTOM': {
          if (!s.smsCustomUrl) throw new Error('No custom URL has been set');
          const url = s.smsCustomUrl
            .replace('{api_key}', encodeURIComponent(s.smsApiKey))
            .replace('{sender}', encodeURIComponent(s.smsSenderId ?? ''))
            .replace('{to}', encodeURIComponent(to))
            .replace('{text}', encodeURIComponent(input.text));
          result = await this.http(url, { method: 'GET' });
          break;
        }

        case 'MIMSMS':
          result = await this.http('https://api.mimsms.com/api/SmsSending/SMS', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              UserName: s.smsSenderId, Apikey: s.smsApiKey,
              MobileNumber: to, CampaignId: 'null',
              SenderName: s.smsSenderId, TransactionType: 'T', Message: input.text,
            }),
          });
          break;

        case 'REVE':
          result = await this.http('https://smpp.revesms.com:7790/sendtext', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              apikey: s.smsApiKey, secretkey: s.smsApiKey,
              callerID: s.smsSenderId, toUser: to, messageContent: input.text,
            }),
          });
          break;

        case 'BULKSMSBD':
        default: {
          const q = new URLSearchParams({
            api_key: s.smsApiKey,
            type: 'text',
            number: to,
            senderid: s.smsSenderId ?? '',
            message: input.text,
          });
          result = await this.http(`http://bulksmsbd.net/api/smsapi?${q.toString()}`, { method: 'GET' });
          break;
        }
      }
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    await this.log({
      channel: 'SMS',
      to,
      body: input.text,
      provider: s.smsProvider,
      result,
      customerId: input.customerId,
      outreachId: input.outreachId,
      broadcastId: input.broadcastId,
      isTest: input.isTest,
      actorName: input.actorName,
    });
    return result;
  }

  /* ---------------- the plumbing ---------------- */

  /*  One fetch with a timeout. Without the timeout a gateway having a bad day
      holds the request open until something else gives up, and the staff
      member sees a spinner that never stops. */
  private async http(url: string, init: RequestInit, refField?: string): Promise<SendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const r = await fetch(url, { ...init, signal: controller.signal });
      const text = await r.text();
      if (!r.ok) return { ok: false, error: `${r.status} ${text.slice(0, 500)}`, raw: text.slice(0, 1000) };

      let ref: string | undefined;
      if (refField) {
        try {
          const j = JSON.parse(text) as Record<string, unknown>;
          const v = j[refField] ?? (j.data as Record<string, unknown> | undefined)?.[refField];
          if (v) ref = String(v);
        } catch { /* plain-text answer — normal for the SMS gateways */ }
      }
      /*  Several Bangladeshi gateways answer 200 with an error IN the body.
          Trusting the status code alone would mark a failure as sent. */
      const low = text.toLowerCase();
      if (/error|invalid|fail|unauthor|insufficient|balance/.test(low) && !/success/.test(low))
        return { ok: false, error: text.slice(0, 500), raw: text.slice(0, 1000) };

      return { ok: true, providerRef: ref, raw: text.slice(0, 1000) };
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      return { ok: false, error: m === 'The operation was aborted.' ? 'The provider did not answer in 20 seconds' : m };
    } finally {
      clearTimeout(timer);
    }
  }

  private async log(p: {
    channel: 'EMAIL' | 'SMS';
    to: string;
    subject?: string;
    body: string;
    provider: string;
    result: SendResult;
    customerId?: string;
    outreachId?: string;
    broadcastId?: string;
    isTest?: boolean;
    actorName?: string;
  }) {
    await this.prisma.db.messageLog.create({
      data: {
        channel: p.channel,
        toAddress: p.to,
        subject: p.subject ?? null,
        body: p.body.slice(0, 4000),
        status: p.result.ok ? 'SENT' : 'FAILED',
        providerRef: p.result.providerRef ?? null,
        error: p.result.ok ? null : (p.result.error ?? 'unknown').slice(0, 2000),
        provider: p.provider,
        customerId: p.customerId ?? null,
        outreachId: p.outreachId ?? null,
        broadcastId: p.broadcastId ?? null,
        isTest: !!p.isTest,
        actorName: p.actorName ?? null,
      },
    });
    if (!p.result.ok) this.logger.warn(`${p.channel} to ${p.to} failed: ${p.result.error}`);
  }

  /* ---------------- test & history ---------------- */

  /** one real message, to prove the key works before anything real depends on it */
  async test(channel: 'EMAIL' | 'SMS', to: string | undefined, actorName: string) {
    const s = await this.get();
    const target = (to ?? (channel === 'EMAIL' ? s.testEmail : s.testPhone) ?? '').trim();
    if (!target) throw new BadRequestException('Where should the test go?');

    if (channel === 'EMAIL')
      return this.sendEmail({
        to: target,
        subject: 'Radian — test message',
        html: '<p>This is a test from the Radian admin panel.</p><p>If you are reading it, email is working.</p>',
        isTest: true,
        actorName,
      });

    return this.sendSms({
      to: target,
      text: 'Radian test message. If you got this, SMS is working.',
      isTest: true,
      actorName,
    });
  }

  async history(q: { channel?: string; status?: string; days?: string } = {}) {
    const where: Prisma.MessageLogWhereInput = {};
    if (q.channel) where.channel = q.channel as 'EMAIL' | 'SMS';
    if (q.status) where.status = q.status as 'SENT' | 'FAILED';
    const days = parseInt(q.days ?? '30', 10) || 30;
    where.createdAt = { gte: new Date(Date.now() - days * 864e5) };

    const [items, sent, failed] = await Promise.all([
      this.prisma.db.messageLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 }),
      this.prisma.db.messageLog.count({ where: { ...where, status: 'SENT' } }),
      this.prisma.db.messageLog.count({ where: { ...where, status: 'FAILED' } }),
    ]);
    return { items, sent, failed, days };
  }
}

/** 01712345678 · +8801712345678 · 8801712345678 → 8801712345678 */
function normaliseBd(v: string): string | null {
  const d = (v ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('01')) return `88${d}`;
  if (d.length === 13 && d.startsWith('880')) return d;
  if (d.length === 10 && d.startsWith('1')) return `880${d}`;
  return null;
}
