import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { ensureSingleton } from '../common/singleton';
import { IntegrationsService } from '../administration/integrations.service';
import { OutboundGuard } from '../common/outbound-guard';

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
    private readonly integrations: IntegrationsService,
    private readonly guard: OutboundGuard,
  ) {}

  /*
    Keys live in the Integration row (Admin → Integrations); credentials()
    falls back to the old MessagingSetting columns by itself. Reading those
    columns directly here was a second home for the same key — a key pasted
    into the card did nothing, and nothing said why (found 7 Aug).
  */
  private async smsConf() {
    const c = await this.integrations.credentials('MESSAGING', 'SMS');
    return {
      enabled: !!(c.found && c.isEnabled),
      provider: (c.found && c.variant) || 'BULKSMSBD',
      apiKey: (c.found && c.apiKey) || null,
      secretKey: (c.found && c.clientSecret) || null,
      senderId: (c.found && c.username) || null,
      customUrl: (c.found && c.baseUrl) || null,
    };
  }

  private async emailConf() {
    const c = await this.integrations.credentials('MESSAGING', 'EMAIL');
    const provider = (c.found && c.variant) || 'BREVO';
    /*  SMTP (owner, 8 Sep 2026) — the second door beside the HTTP providers.
        host:port travel in baseUrl; 465 means TLS from the first byte.  */
    const [smtpHost, smtpPortRaw] = provider === 'SMTP' && c.found && c.baseUrl ? c.baseUrl.split(':') : [null, null];
    const smtpPort = Number(smtpPortRaw) || 587;
    return {
      enabled: !!(c.found && c.isEnabled),
      provider,
      apiKey: (c.found && c.apiKey) || null,
      fromAddress: (c.found && c.username) || null,
      fromName: (c.found && c.clientId) || null,
      domain: (c.found && c.baseUrl) || null,
      smtp: provider === 'SMTP'
        ? {
            host: smtpHost || null,
            port: smtpPort,
            secure: smtpPort === 465,
            user: (c.found && c.clientSecret) || (c.found && c.username) || null,
            pass: (c.found && c.password) || null,
          }
        : null,
    };
  }

  /* ---------------- settings ---------------- */

  async get() {
    // ensureSingleton — survives two requests creating this row at once (P2002)
    return ensureSingleton(
      () => this.prisma.db.messagingSetting.findUnique({ where: { id: 'singleton' } }),
      () => this.prisma.db.messagingSetting.create({ data: { id: 'singleton' } }),
    );
  }

  /** keys are passwords — the screen learns only that one exists */
  private safe<T extends { emailApiKey: string | null; smsApiKey: string | null; emailSmtpPass?: string | null }>(row: T) {
    return {
      ...row,
      emailApiKey: null,
      smsApiKey: null,
      emailSmtpPass: null,
      emailKeySet: !!row.emailApiKey,
      smsKeySet: !!row.smsApiKey,
      emailSmtpPassSet: !!row.emailSmtpPass,
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
    // SMTP (8 Sep 2026)
    if (dto.emailSmtpHost !== undefined) data.emailSmtpHost = t('emailSmtpHost');
    if (dto.emailSmtpPort !== undefined) data.emailSmtpPort = Math.min(65535, Math.max(1, Number(dto.emailSmtpPort) || 587));
    if (dto.emailSmtpUser !== undefined) data.emailSmtpUser = t('emailSmtpUser');
    if (dto.emailSmtpPass !== undefined) data.emailSmtpPass = t('emailSmtpPass');
    if (dto.emailSmtpSecure !== undefined) data.emailSmtpSecure = !!dto.emailSmtpSecure;

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
    if ('emailSmtpPass' in audit) audit.emailSmtpPass = audit.emailSmtpPass ? '(set)' : '(cleared)';
    if ('smsApiKey' in audit) audit.smsApiKey = audit.smsApiKey ? '(set)' : '(cleared)';
    await this.audit.record({ entityType: ENTITY, entityId: 'singleton', action: 'UPDATE', actorName, changes: audit });

    return this.safe(row);
  }

  async status() {
    const [s, email, sms] = await Promise.all([this.get(), this.emailConf(), this.smsConf()]);
    return {
      email: {
        enabled: email.enabled,
        provider: email.provider,
        keySet: email.smtp ? !!(email.smtp.host && email.smtp.pass) : !!email.apiKey,
        fromSet: !!email.fromAddress,
        ready: email.enabled && (email.smtp ? !!(email.smtp.host && email.smtp.pass) : !!email.apiKey) && !!email.fromAddress,
      },
      sms: {
        enabled: sms.enabled,
        provider: sms.provider,
        keySet: !!sms.apiKey,
        senderSet: !!sms.senderId,
        ready: sms.enabled && !!sms.apiKey,
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
    /** who asked - see common/outbound-guard.ts */
    origin?: string;
    kind?: string;
    batchId?: string;
  }): Promise<SendResult> {
    /*  FIRST, before anything about configuration.
        MKT-RULE-009 has no exception, so it must not sit behind a check that
        happens to be failing today for another reason — "Email is switched off"
        would hide it now and stop hiding it the day a key is pasted in, which
        is the worst possible time to discover the order was wrong. */
    await this.refuseIfOptedOut(input.customerId);

    const conf = await this.emailConf();
    const s = await this.get(); // still owns reply-to and the test addresses
    if (!conf.enabled) throw new BadRequestException('Email is switched off');
    if (conf.smtp) {
      if (!conf.smtp.host) throw new BadRequestException('Set the SMTP host');
      if (!conf.smtp.pass) throw new BadRequestException('No SMTP password has been saved yet');
    } else if (!conf.apiKey) {
      throw new BadRequestException('No email key has been saved yet');
    }
    if (!conf.fromAddress) throw new BadRequestException('Set the address emails are sent from');

    const from = { name: conf.fromName ?? 'Radian', email: conf.fromAddress };

    /*  DOOR C (email). A refusal is not thrown: a broadcast has to carry on
        past one refused address, and the row below is the record that it
        happened.  */
    const emailVerdict = await this.guard.check({
      channel: 'EMAIL',
      recipient: input.to,
      origin: input.origin ?? 'email',
      kind: input.kind,
      batchId: input.batchId,
    });
    if (!emailVerdict.allowed) {
      const blocked: SendResult = { ok: false, error: `BLOCKED: ${emailVerdict.reason}` };
      await this.log({
        channel: 'EMAIL', to: input.to, subject: input.subject, body: input.html,
        provider: conf.provider, result: blocked,
        customerId: input.customerId, outreachId: input.outreachId,
        broadcastId: input.broadcastId, isTest: input.isTest, actorName: input.actorName,
      });
      return blocked;
    }

    let result: SendResult;

    try {
      switch (conf.provider) {
        case 'SMTP': {
          const t = nodemailer.createTransport({
            host: conf.smtp!.host!,
            port: conf.smtp!.port,
            secure: conf.smtp!.secure,
            auth: { user: conf.smtp!.user!, pass: conf.smtp!.pass! },
            connectionTimeout: 15_000,
          });
          const info = await t.sendMail({
            from: `"${from.name.replace(/"/g, "'")}" <${from.email}>`,
            to: input.to,
            subject: input.subject,
            html: input.html,
            ...(s.emailReplyTo ? { replyTo: s.emailReplyTo } : {}),
          });
          result = { ok: true, providerRef: info.messageId, raw: info.response };
          break;
        }

        case 'RESEND':
          result = await this.http('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${conf.apiKey}`, 'content-type': 'application/json' },
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
            headers: { Authorization: `Bearer ${conf.apiKey}`, 'content-type': 'application/json' },
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
          if (!conf.domain) throw new Error('Mailgun needs its sending domain');
          const form = new URLSearchParams({
            from: `${from.name} <${from.email}>`,
            to: input.to,
            subject: input.subject,
            html: input.html,
          });
          result = await this.http(`https://api.mailgun.net/v3/${conf.domain}/messages`, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${Buffer.from(`api:${conf.apiKey}`).toString('base64')}`,
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
            headers: { 'api-key': conf.apiKey ?? '', 'content-type': 'application/json', accept: 'application/json' },
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
      provider: conf.provider,
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
    /** who asked - see common/outbound-guard.ts */
    origin?: string;
    kind?: string;
    batchId?: string;
  }): Promise<SendResult> {
    // first, for the same reason as sendEmail above
    await this.refuseIfOptedOut(input.customerId);

    const conf = await this.smsConf();
    if (!conf.enabled) throw new BadRequestException('SMS is switched off');
    if (!conf.apiKey) throw new BadRequestException('No SMS key has been saved yet');
    const apiKey = conf.apiKey;

    /*  Bangladeshi numbers reach the gateways as 8801XXXXXXXXX — no plus, no
        leading zero. Every gateway wants it that way and every one of them
        fails silently if it is wrong. */
    const to = normaliseBd(input.to);
    if (!to) throw new BadRequestException(`"${input.to}" does not look like a Bangladeshi mobile number`);

    /*  DOOR C (SMS). After normaliseBd, so the guard judges the number the
        gateway will actually dial.  */
    const smsVerdict = await this.guard.check({
      channel: 'SMS',
      recipient: to,
      origin: input.origin ?? 'sms',
      kind: input.kind,
      batchId: input.batchId,
    });
    if (!smsVerdict.allowed) {
      const blocked: SendResult = { ok: false, error: `BLOCKED: ${smsVerdict.reason}` };
      await this.log({
        channel: 'SMS', to, body: input.text, provider: conf.provider, result: blocked,
        customerId: input.customerId, outreachId: input.outreachId,
        broadcastId: input.broadcastId, isTest: input.isTest, actorName: input.actorName,
      });
      return blocked;
    }

    let result: SendResult;
    try {
      switch (conf.provider) {
        case 'CUSTOM': {
          if (!conf.customUrl) throw new Error('No custom URL has been set');
          const url = conf.customUrl
            .replace('{api_key}', encodeURIComponent(apiKey))
            .replace('{sender}', encodeURIComponent(conf.senderId ?? ''))
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
              UserName: conf.senderId, Apikey: apiKey,
              MobileNumber: to, CampaignId: 'null',
              SenderName: conf.senderId, TransactionType: 'T', Message: input.text,
            }),
          });
          break;

        /*
          KhudeBarta (SoftifyBD) and REVE are the same server family — a
          sendtext endpoint taking apikey + secretkey + callerID. KhudeBarta
          documents no domain for the API, only an IP, so the endpoint sits in
          the card's Custom endpoint box where a changed IP is an admin edit,
          not a deploy.
        */
        case 'KHUDEBARTA': {
          const base = conf.customUrl || 'http://118.67.213.114:3775/sendtext';
          const q = new URLSearchParams({
            apikey: apiKey, secretkey: conf.secretKey ?? '',
            callerID: conf.senderId ?? '', toUser: to, messageContent: input.text,
          });
          result = await this.http(`${base}?${q.toString()}`, { method: 'GET' }, 'Message_ID');
          break;
        }

        case 'REVE':
          result = await this.http('https://smpp.revesms.com:7790/sendtext', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              apikey: apiKey, secretkey: conf.secretKey ?? apiKey,
              callerID: conf.senderId, toUser: to, messageContent: input.text,
            }),
          });
          break;

        case 'BULKSMSBD':
        default: {
          const q = new URLSearchParams({
            api_key: apiKey,
            type: 'text',
            number: to,
            senderid: conf.senderId ?? '',
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
      provider: conf.provider,
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
      if (/error|invalid|fail|unauthor|insufficient|balance|reject/.test(low) && !/success|acceptd/.test(low))
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
