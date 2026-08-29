import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { OtpChannel, OtpPurpose, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppCloudService } from '../common/whatsapp-cloud';
import { MessagingService } from '../marketing/messaging.service';

/*
  The one-time code (DEC-WA-010).

  ── Why there is no "does this number have WhatsApp?" check ──────────────
  The owner asked for one. Meta's official API does not offer it, and the
  services that do work by driving a logged-in WhatsApp session, which risks
  the number being banned — a bad trade for a Tech Provider account.

  So the code is not checked, it is SENT, and delivery decides. That reaches
  the same answer with nothing at risk: a number without WhatsApp fails at the
  send, and the next channel takes over.

  ── The order the channels are tried (owner's rule, 29 Aug) ──────────────
    foreign number : WhatsApp → email
    Bangladeshi    : WhatsApp → SMS → email
  Email is the last resort in both, and only when we have an address.
  A foreign number never gets SMS: our gateway is domestic.

  ── What is deliberately NOT done here ───────────────────────────────────
  No customerId is passed to the email and SMS senders. That skips
  refuseIfOptedOut, and it must: MKT-RULE-009 is about MARKETING. Someone who
  asked for no marketing must still be able to sign in. Blocking a login code
  as if it were an advertisement would lock a customer out of their own
  account.
*/

/** Long enough to be safe, short enough to read off a screen. */
const CODE_LENGTH = 6;
/** Must match the template's stated expiry, or the message lies. */
const EXPIRY_MINUTES = 5;
/** Guesses before the code is spent. 6 digits, 5 tries — not brute-forceable. */
const MAX_WRONG_TRIES = 5;
/** A resend before this is refused; it is almost always a double-tap. */
const RESEND_COOLDOWN_SEC = 60;
/** Codes per phone per hour. Above this something is wrong, or someone is. */
const MAX_PER_HOUR = 5;

type Attempt = {
  channel: OtpChannel;
  to: string;
  ok: boolean;
  error?: string;
  at: string;
};

export interface OtpSendResult {
  sent: boolean;
  /** Which channel got there — the screen says "sent to your WhatsApp". */
  via: OtpChannel | null;
  /** Masked. The full address is never returned to a browser. */
  to: string | null;
  expiresInSec: number;
  /** Only when nothing worked. Never says which channel failed and why. */
  error?: string;
}

@Injectable()
export class OtpService {
  private readonly log = new Logger('Otp');

  constructor(
    private readonly prisma: PrismaService,
    private readonly wa: WhatsAppCloudService,
    private readonly messaging: MessagingService,
  ) {}

  /* ---------------- sending ---------------- */

  async send(input: {
    phone: string;
    purpose: OtpPurpose;
    /** Only used if WhatsApp and SMS both fail. */
    email?: string | null;
  }): Promise<OtpSendResult> {
    const phone = this.e164(input.phone);
    if (!phone)
      throw new BadRequestException('That does not look like a phone number');

    await this.guardRate(phone, input.purpose);

    /*  Any code still alive for this phone and purpose is retired first.
        Two live codes means the customer reads the newer message, types that
        code, and the older row is still sitting there accepting the older
        one — which is a second valid key nobody is watching.  */
    await this.prisma.db.phoneOtp.updateMany({
      where: { phone, purpose: input.purpose, usedAt: null, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    const code = this.newCode();
    const row = await this.prisma.db.phoneOtp.create({
      data: {
        phone,
        purpose: input.purpose,
        codeHash: 'pending',
        expiresAt: new Date(Date.now() + EXPIRY_MINUTES * 60_000),
      },
    });
    // The hash needs the row id, so it is written once the id exists.
    await this.prisma.db.phoneOtp.update({
      where: { id: row.id },
      data: { codeHash: this.hash(code, row.id) },
    });

    const attempts: Attempt[] = [];
    const local = this.isBangladeshi(phone);

    for (const channel of this.chain(local, input.email)) {
      const to = channel === OtpChannel.EMAIL ? input.email!.trim() : phone;
      const r = await this.deliver(channel, to, code);
      attempts.push({
        channel,
        to,
        ok: r.ok,
        error: r.error,
        at: new Date().toISOString(),
      });

      if (r.ok) {
        await this.prisma.db.phoneOtp.update({
          where: { id: row.id },
          data: {
            sentVia: channel,
            sentTo: channel === OtpChannel.EMAIL ? to : null,
            attemptsLog: attempts as unknown as Prisma.InputJsonValue,
          },
        });
        this.log.log(
          `otp ${input.purpose} sent via ${channel} (${attempts.length} attempt(s))`,
        );
        return {
          sent: true,
          via: channel,
          to: this.mask(to, channel),
          expiresInSec: EXPIRY_MINUTES * 60,
        };
      }
    }

    await this.prisma.db.phoneOtp.update({
      where: { id: row.id },
      data: {
        attemptsLog: attempts as unknown as Prisma.InputJsonValue,
        deletedAt: new Date(),
      },
    });
    this.log.warn(
      `otp ${input.purpose} undeliverable — tried ${attempts.length} channel(s)`,
    );

    return {
      sent: false,
      via: null,
      to: null,
      expiresInSec: 0,
      error: input.email
        ? 'We could not reach that number or email. Please check them and try again.'
        : 'We could not reach that number. Add an email address and we will send it there.',
    };
  }

  /** The owner's routing rule, in one place so it reads like the rule. */
  private chain(local: boolean, email?: string | null): OtpChannel[] {
    const chain: OtpChannel[] = [OtpChannel.WHATSAPP];
    // Our SMS gateway is domestic; sending abroad through it fails, slowly.
    if (local) chain.push(OtpChannel.SMS);
    if (email?.trim()) chain.push(OtpChannel.EMAIL);
    return chain;
  }

  private async deliver(channel: OtpChannel, to: string, code: string) {
    try {
      if (channel === OtpChannel.WHATSAPP) {
        /*  sendRaw, not send: the reason matters here. "no WhatsApp on that
            number" and "our keys are wrong" both stop the send, and only the
            first should quietly move to the next channel.  */
        const r = await this.wa.sendRaw(to, this.wa.otpMessage(code));
        return { ok: r.ok, error: r.ok ? undefined : r.error };
      }
      if (channel === OtpChannel.SMS) {
        // No customerId — see the note at the top of this file.
        const r = await this.messaging.sendSms({
          to,
          text: `${code} is your Radian verification code. It expires in ${EXPIRY_MINUTES} minutes. Do not share it with anyone.`,
        });
        return { ok: r.ok, error: r.ok ? undefined : r.error };
      }
      const r = await this.messaging.sendEmail({
        to,
        subject: `${code} is your Radian verification code`,
        html:
          `<p style="font:16px system-ui">Your Radian verification code is</p>` +
          `<p style="font:700 32px system-ui;letter-spacing:4px">${code}</p>` +
          `<p style="font:14px system-ui;color:#666">It expires in ${EXPIRY_MINUTES} minutes. ` +
          `If you did not ask for this, you can ignore this email — nobody can use it without you.</p>`,
      });
      return { ok: r.ok, error: r.ok ? undefined : r.error };
    } catch (e) {
      /*  A channel that is switched off throws rather than returning false.
          That is not a failure worth stopping for — it is the next channel's
          turn.  */
      return { ok: false, error: e instanceof Error ? e.message : 'failed' };
    }
  }

  /* ---------------- checking ---------------- */

  /**
   * One answer for every kind of miss — wrong code, expired, never sent, too
   * many tries. Telling them apart tells an attacker which phone numbers have
   * live codes, and which guesses were close.
   */
  async verify(
    phone: string,
    purpose: OtpPurpose,
    code: string,
  ): Promise<{ ok: boolean }> {
    const e164 = this.e164(phone);
    const typed = (code ?? '').replace(/\D/g, '');
    if (!e164 || typed.length !== CODE_LENGTH) return { ok: false };

    const row = await this.prisma.db.phoneOtp.findFirst({
      where: { phone: e164, purpose, usedAt: null, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return { ok: false };

    if (row.expiresAt < new Date() || row.wrongTries >= MAX_WRONG_TRIES) {
      await this.prisma.db.phoneOtp.update({
        where: { id: row.id },
        data: { deletedAt: new Date() },
      });
      return { ok: false };
    }

    if (this.hash(typed, row.id) !== row.codeHash) {
      await this.prisma.db.phoneOtp.update({
        where: { id: row.id },
        data: { wrongTries: { increment: 1 } },
      });
      return { ok: false };
    }

    // Used exactly once — a code that still works after it worked is not one.
    await this.prisma.db.phoneOtp.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    return { ok: true };
  }

  /* ---------------- the small pieces ---------------- */

  /** randomInt, not Math.random: a guessable code is not a code. */
  private newCode() {
    return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
  }

  /** Salted with the row id, so identical codes do not share a hash. */
  private hash(code: string, id: string) {
    return createHash('sha256').update(`${code}:${id}`).digest('hex');
  }

  private async guardRate(phone: string, purpose: OtpPurpose) {
    const last = await this.prisma.db.phoneOtp.findFirst({
      where: { phone, purpose, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (
      last &&
      Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_SEC * 1000
    ) {
      const wait = Math.ceil(
        (RESEND_COOLDOWN_SEC * 1000 - (Date.now() - last.createdAt.getTime())) /
          1000,
      );
      throw new BadRequestException(
        `Please wait ${wait} seconds before asking for another code`,
      );
    }

    const hour = await this.prisma.db.phoneOtp.count({
      where: {
        phone,
        purpose,
        createdAt: { gt: new Date(Date.now() - 3_600_000) },
      },
    });
    if (hour >= MAX_PER_HOUR) {
      throw new BadRequestException(
        'Too many codes have been requested for this number. Please try again in an hour.',
      );
    }
  }

  /**
   * Bangladeshi numbers are stored as 01…; everything is compared in E.164, so
   * they become +8801…. A number already carrying + is taken as given.
   */
  private e164(raw: string) {
    const s = (raw ?? '').trim().replace(/[\s-()]/g, '');
    if (!s) return null;
    if (s.startsWith('+')) return /^\+\d{8,15}$/.test(s) ? s : null;
    const d = s.replace(/\D/g, '');
    if (/^01\d{9}$/.test(d)) return `+88${d}`;
    if (/^8801\d{9}$/.test(d)) return `+${d}`;
    return null;
  }

  private isBangladeshi(e164: string) {
    return e164.startsWith('+880');
  }

  /** Enough for the customer to recognise it, not enough to read it out. */
  private mask(to: string, channel: OtpChannel) {
    if (channel === OtpChannel.EMAIL) {
      const [user, domain] = to.split('@');
      if (!domain) return '***';
      return `${user.slice(0, 2)}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`;
    }
    return `${to.slice(0, 4)}${'*'.repeat(Math.max(0, to.length - 7))}${to.slice(-3)}`;
  }
}
