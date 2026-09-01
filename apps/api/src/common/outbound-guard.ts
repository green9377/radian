import { Controller, Get, Injectable, Logger, Optional, Post } from '@nestjs/common';
import { ActivityKind } from '@prisma/client';
import { AuditService } from './audit.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  OUTBOUND GUARD — the last thing a message passes before it leaves the shop.

  WHY IT EXISTS (owner, 1 Sep 2026). Development is not a sandbox here: it
  holds the real SMS gateway, real WhatsApp credentials and, until the second
  Meta app exists, the real Page. It also holds real customers' phone numbers.
  So the danger is not that development is fake - it is that development is
  REAL and pointed at people who never asked to be part of a test.

  The answer is not to take the feature away. It is to say WHO a development
  build may reach.

  ── WHERE IT SITS ───────────────────────────────────────────────────────────
  Three doors actually call a provider, and the guard sits inside each one,
  immediately before the fetch:

    A  common/whatsapp-cloud.ts        sendRaw()   -> graph.facebook.com
    B  messaging/channel-sender.ts     post()      -> Messenger + Instagram
    C  marketing/messaging.service.ts  sendSms/sendEmail -> SMS + email

  ⚠️ IT IS DELIBERATELY NOT AT THE CALLERS. OtpService, OrderMessagesService,
  the sweeper, the AI agent, the inbox reply button and the admin's test button
  are all callers, and a guard placed there is a guard a new caller can forget.
  At the door, a new caller inherits it for free. This is the same lesson that
  produced ChannelSender: one door, or one of them will be silent.

  ── HOW IT DECIDES ──────────────────────────────────────────────────────────
    1. kill switch  - OUTBOUND_DISABLED=true, or the runtime switch below,
                      stops everything at once and without a deploy
    2. allowlist    - OUTBOUND_ALLOWLIST, comma separated. What an EMPTY list
                      means depends on the stack, and that is the whole point
                      of the next paragraph
    3. rate limit   - OUTBOUND_MAX_PER_HOUR. 0 or unset means unlimited
    4. redirect     - OUTBOUND_REDIRECT_TO sends everything to one test
                      number instead of blocking it. Off unless set

  ── AN EMPTY ALLOWLIST IS NOT THE SAME ANSWER IN BOTH STACKS ────────────────
  (owner, 1 Sep 2026.) On the LIVE stack an empty list means "no restriction" -
  the shop must be able to message its customers, and that is the behaviour
  that existed before this file.

  Anywhere else an empty list means **BLOCK EVERYTHING**. A development stack
  must never become unrestricted because somebody forgot to fill a variable in,
  or copied an env file, or a deploy dropped it. Forgetting must fail towards
  silence, not towards thirty real customers.

  "Live" is `STACK=live` (or prod/production). Anything else, INCLUDING AN
  UNSET STACK, is treated as development. A live shop that forgets to set STACK
  therefore goes quiet and somebody notices within minutes; the opposite
  mistake cannot be undone.
*/

export type OutboundChannel =
  | 'SMS'
  | 'EMAIL'
  | 'WHATSAPP'
  | 'MESSENGER'
  | 'INSTAGRAM';

export interface GuardVerdict {
  allowed: boolean;
  /** Plain English, shown to a person. Never a code. */
  reason?: string;
  /** Set only in redirect mode: send here instead. */
  redirectTo?: string;
}

interface BlockedNote {
  at: string;
  channel: OutboundChannel;
  /** Masked - a blocked-message list is not a place to keep phone numbers. */
  recipient: string;
  purpose: string;
  reason: string;
}

const HOUR_MS = 3_600_000;
const KEEP_NOTES = 50;

/** A number is the same number however it was typed. */
export function normaliseRecipient(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  if (s.includes('@')) return s.toLowerCase();
  const digits = s.replace(/\D/g, '');
  if (!digits) return s.toLowerCase();
  // Bangladesh: 01712345678 / 8801712345678 / +8801712345678 are one person.
  if (digits.length === 13 && digits.startsWith('880')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('01')) return digits;
  if (digits.length === 10 && digits.startsWith('1')) return '0' + digits;
  return digits;
}

/** Enough to recognise a number in a log, not enough to message it. */
export function maskRecipient(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '(none)';
  if (s.includes('@')) {
    const [user, domain] = s.split('@');
    return `${user.slice(0, 2)}***@${domain ?? ''}`;
  }
  return s.length <= 6 ? s : `${s.slice(0, 4)}***${s.slice(-2)}`;
}

@Injectable()
export class OutboundGuard {
  private readonly log = new Logger('OutboundGuard');

  /*  Optional on purpose: the guard has to work in a unit test and at startup
      before anything else is ready. Without it the block is still logged and
      still returned - it simply is not written down.  */
  constructor(@Optional() private readonly audit?: AuditService) {}

  /** Flipped from the admin. Env is the floor; this can only tighten. */
  private runtimeKill = false;

  /** Timestamps of what was allowed out, for the per-hour ceiling. */
  private sent: number[] = [];

  private readonly notes: BlockedNote[] = [];

  private env(key: string): string {
    return (process.env[key] ?? '').trim();
  }

  private allowlist(): string[] {
    return this.env('OUTBOUND_ALLOWLIST')
      .split(',')
      .map((x) => normaliseRecipient(x))
      .filter(Boolean);
  }

  private maxPerHour(): number {
    const n = Number.parseInt(this.env('OUTBOUND_MAX_PER_HOUR'), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  private killed(): boolean {
    return this.runtimeKill || this.env('OUTBOUND_DISABLED').toLowerCase() === 'true';
  }

  /** Only a stack that says it is live gets "empty means everyone". */
  private isLiveStack(): boolean {
    const s = this.env('STACK').toLowerCase();
    return s === 'live' || s === 'prod' || s === 'production';
  }

  /**
   * The whole decision. Call it immediately before the provider call, never
   * earlier - anything between the check and the fetch is a gap.
   */
  check(
    channel: OutboundChannel,
    recipient: string,
    purpose = 'message',
  ): GuardVerdict {
    const who = normaliseRecipient(recipient);

    if (this.killed()) {
      return this.deny(channel, who, purpose, 'all outbound messages are switched off');
    }

    const allow = this.allowlist();
    if (!allow.length && !this.isLiveStack()) {
      return this.deny(
        channel,
        who,
        purpose,
        'this is not the live stack and no OUTBOUND_ALLOWLIST is set, so nothing may be messaged from it',
      );
    }
    if (allow.length && !allow.includes(who)) {
      return this.deny(
        channel,
        who,
        purpose,
        'this recipient is not on the allowlist for this environment',
      );
    }

    const max = this.maxPerHour();
    if (max) {
      const cut = Date.now() - HOUR_MS;
      this.sent = this.sent.filter((t) => t > cut);
      if (this.sent.length >= max) {
        return this.deny(
          channel,
          who,
          purpose,
          `the hourly limit for this environment (${max}) has been reached`,
        );
      }
    }

    this.sent.push(Date.now());

    const redirect = this.env('OUTBOUND_REDIRECT_TO');
    if (redirect && !who.includes('@')) {
      return { allowed: true, redirectTo: redirect };
    }
    return { allowed: true };
  }

  private deny(
    channel: OutboundChannel,
    who: string,
    purpose: string,
    reason: string,
  ): GuardVerdict {
    const note: BlockedNote = {
      at: new Date().toISOString(),
      channel,
      recipient: maskRecipient(who),
      purpose,
      reason,
    };
    this.notes.unshift(note);
    if (this.notes.length > KEEP_NOTES) this.notes.length = KEEP_NOTES;

    /*  PERSISTENT TRAIL. The in-memory list above dies with the process, and
        "which messages did development stop last week" is a real question.
        ActivityEvent already exists for exactly this - a free-text timeline
        with a `system` kind - so this needs no new table and no migration, and
        it survives a restart and is shared by every container.

        Fired and forgotten: the decision is synchronous because all three
        doors call it that way, and AuditService.event() already swallows its
        own failures. A trail that cannot be written must never stop a block
        from being applied.  */
    void this.audit?.event({
      entityType: 'OutboundGuard',
      entityId: channel,
      kind: ActivityKind.system,
      label: `Blocked ${channel} to ${note.recipient}`,
      actorName: 'OutboundGuard',
      note: `${reason} · purpose=${purpose}`,
    });
    /* Loud on purpose. A message that does not arrive and says nothing is the
       failure this whole file is here to prevent. */
    this.log.warn(
      `BLOCKED ${channel} to ${note.recipient} (${purpose}): ${reason}`,
    );
    return { allowed: false, reason };
  }

  /** What the admin screen shows: the rules in force and what they stopped. */
  status() {
    const allow = this.allowlist();
    const cut = Date.now() - HOUR_MS;
    return {
      killSwitch: this.killed(),
      killSwitchFromEnv: this.env('OUTBOUND_DISABLED').toLowerCase() === 'true',
      stack: this.env('STACK') || '(unset)',
      liveStack: this.isLiveStack(),
      allowlistCount: allow.length,
      allowlist: allow.map(maskRecipient),
      /*  What an empty list means here, said out loud, because it is the one
          thing somebody reading this screen must not have to guess.  */
      restricted: allow.length > 0 || !this.isLiveStack(),
      emptyAllowlistMeans: this.isLiveStack() ? 'everyone (live stack)' : 'nobody (not the live stack)',
      maxPerHour: this.maxPerHour(),
      sentLastHour: this.sent.filter((t) => t > cut).length,
      redirectTo: this.env('OUTBOUND_REDIRECT_TO') ? maskRecipient(this.env('OUTBOUND_REDIRECT_TO')) : null,
      recentlyBlocked: this.notes,
    };
  }

  setKill(on: boolean) {
    this.runtimeKill = on;
    this.log.warn(`kill switch turned ${on ? 'ON' : 'OFF'} from the admin`);
    return this.status();
  }
}

/*
  Read and one switch. Behind the global AuthGuard like everything else, so
  only a signed-in staff member reaches it.
*/
@Controller('administration/outbound')
export class OutboundGuardController {
  constructor(private readonly guard: OutboundGuard) {}

  @Get()
  status() {
    return this.guard.status();
  }

  @Post('stop')
  stop() {
    return this.guard.setKill(true);
  }

  @Post('resume')
  resume() {
    return this.guard.setKill(false);
  }
}
