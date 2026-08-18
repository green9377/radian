import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

/*  Same scheme as auth.service.ts — scrypt, salted per user, and the password
    itself is never stored. Duplicated deliberately rather than exported from
    there: this file must not become a second way to make a session.  */
function hashSecret(secret: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(secret, salt, 32).toString('hex')}`;
}

/** the token in the email is never stored — only this */
const fingerprint = (token: string) => createHash('sha256').update(token).digest('hex');

const INVITE_DAYS = 7;
const RESET_HOURS = 1;

/**
 * PeopleService — accounts, and the email-shaped way in.
 *
 * The owner's requirement, 30 July: give access by email, let the person set
 * their OWN password, and let them fix it themselves by email when they forget.
 *
 * Three things are deliberate and should not be quietly changed:
 *
 *   1. **An invited person has NO password.** `passwordHash` is null until they
 *      choose one. A generated password that gets read out over the phone is a
 *      password two people know, and it is never changed afterwards.
 *
 *   2. **The link is single-use and hashed at rest.** A forwarded email is
 *      already spent, and a leaked backup opens nobody's account.
 *
 *   3. **⚠️ The PIN is NOT on this path.** Money actions need the 4-digit PIN,
 *      and if a forgotten PIN could be reset from an inbox, then whoever holds
 *      the inbox holds the power to move money. PIN reset stays with the OWNER,
 *      face to face. (ADM-RULE-006)
 */
@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------------------------------------------ *
   *  reading
   * ------------------------------------------------------------------ */

  async people() {
    const rows = await this.prisma.db.appUser.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { position: true },
    });

    // an invite that is still open, so the screen can show "waiting" honestly
    const open = await this.prisma.authToken.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((u) => {
      const pending = open.find((t) => t.userId === u.id);
      return {
        id: u.id,
        name: u.name,
        username: u.username,
        email: u.email,
        positionId: u.positionId,
        positionName: u.position?.name ?? null,
        /** ADM-D02 bridge — still meaningful until the enum is dropped */
        legacyRole: u.role,
        isActive: u.isActive,
        hasPassword: !!u.passwordHash,
        hasPin: !!u.pinHash,
        lastLogin: u.lastLogin,
        pending: pending ? { kind: pending.kind, expiresAt: pending.expiresAt } : null,
      };
    });
  }

  /* ------------------------------------------------------------------ *
   *  inviting
   * ------------------------------------------------------------------ */

  /**
   * Add somebody by email. No password is set — they choose their own from the
   * link, so nobody but them ever knows it.
   *
   * The link is RETURNED as well as (later) emailed. That is on purpose: there
   * is no email provider key in the system yet, and an invite feature that
   * cannot invite anybody until a Brevo account exists would block the owner
   * for no good reason. He can copy the link and send it by WhatsApp today, and
   * the day a key is pasted in, the same call starts sending by itself.
   */
  async invite(
    dto: { name?: string; email?: string; positionId?: string | null },
    actorName: string,
  ) {
    const email = dto.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new BadRequestException('A valid email address is required');

    const name = dto.name?.trim() || email.split('@')[0];

    /*  ⚠️ RAW client, not `prisma.db` — 30 Jul 2026, found in review.
     *
     *  `AppUser_email_key` is a plain unique index: it counts SOFT-DELETED rows
     *  too. Checking through `prisma.db` hides exactly the row that is about to
     *  cause the collision, so inviting somebody who was removed six months ago
     *  sailed past this guard and died inside `create()` with a raw
     *  "Unique constraint failed on the fields: (`email`)" — which tells the
     *  owner nothing about what to do.
     *
     *  Same class of bug as document numbering (28 Jul): a soft-deleted row
     *  still holds its place in the unique index.
     */
    const clash = await this.prisma.appUser.findFirst({ where: { email } });
    if (clash) {
      if (clash.deletedAt)
        throw new BadRequestException(
          `${email} belonged to ${clash.name}, who was removed. That address cannot be reused — the audit trail still points at that account. Use a different address.`,
        );
      throw new BadRequestException(`${email} already has an account`);
    }

    /*  A template is REQUIRED (owner, 18 Aug 2026): an account that reaches
        nothing is a key ring with no keys — creating it is only confusion.
        The column stays nullable for old rows; new invites must choose.  */
    if (!dto.positionId)
      throw new BadRequestException('Pick a template first — an account with no template can reach nothing');
    const pos = await this.prisma.db.position.findUnique({ where: { id: dto.positionId } });
    if (!pos) throw new BadRequestException('That template does not exist');

    const user = await this.prisma.db.appUser.create({
      data: {
        name,
        username: await this.freeUsername(email),
        email,
        passwordHash: null, // they choose it — see the class comment
        positionId: dto.positionId ?? null,
        role: 'STAFF', // the enum still exists; the position is what counts
      },
    });

    const link = await this.issue(user.id, 'INVITE');

    await this.audit.record({
      entityType: 'AppUser',
      entityId: user.id,
      action: 'CREATE',
      actorName,
      changes: { email, invited: true, positionId: dto.positionId ?? null },
    });

    return { user: { id: user.id, name: user.name, email }, ...link };
  }

  /** a fresh invite link — the old one stops working the moment this is made */
  async resendInvite(userId: string, actorName: string) {
    const u = await this.mustFind(userId);
    if (u.hasPassword)
      throw new BadRequestException(
        `${u.name} has already set a password — send a password reset instead`,
      );
    const link = await this.issue(userId, 'INVITE');
    await this.audit.record({
      entityType: 'AppUser', entityId: userId, action: 'UPDATE',
      actorName, changes: { inviteResent: true },
    });
    return link;
  }

  /**
   * OWNER-triggered reset. The same link the person gets from "forgot password",
   * for when they cannot reach their own email either.
   *
   * ⚠️ This resets the PASSWORD ONLY. The PIN is untouched — see the class note.
   */
  async resetLink(userId: string, actorName: string) {
    await this.mustFind(userId);
    const link = await this.issue(userId, 'RESET');
    await this.audit.record({
      entityType: 'AppUser', entityId: userId, action: 'UPDATE',
      actorName, changes: { passwordResetIssued: true },
    });
    return link;
  }

  /**
   * "I forgot my password" — reachable without signing in.
   *
   * ⚠️ It answers the SAME WAY whether the address exists or not. Saying "no
   * such account" would turn this box into a way to find out who works here,
   * and for a shop with the owner's own email in it that is a real leak.
   */
  async forgot(email?: string) {
    const clean = email?.trim().toLowerCase();
    const vague = { ok: true, message: 'If that address has an account, a reset link is on its way' };
    if (!clean) return vague;

    const u = await this.prisma.db.appUser.findFirst({
      where: { email: clean, deletedAt: null, isActive: true },
    });
    if (!u) return vague;

    await this.issue(u.id, 'RESET');
    // the link is NOT returned here — that would hand it to whoever asked
    return vague;
  }

  /* ------------------------------------------------------------------ *
   *  using a link
   * ------------------------------------------------------------------ */

  /** what the link page shows before anything is typed */
  async checkToken(token?: string) {
    const row = await this.findLive(token);
    if (!row) return { valid: false as const };
    const u = await this.prisma.db.appUser.findUnique({ where: { id: row.userId } });
    return {
      valid: true as const,
      kind: row.kind,
      name: u?.name ?? '',
      email: u?.email ?? '',
    };
  }

  /**
   * The person sets their own password. Works for both an invite and a reset —
   * the difference is only what the screen says.
   *
   * Every open session for that user is dropped. If the reason for resetting
   * was that somebody else got in, leaving their session alive would make the
   * reset decorative.
   */
  async setPassword(token?: string, password?: string) {
    const row = await this.findLive(token);
    if (!row) throw new BadRequestException('That link has expired or has already been used');
    if (!password || password.length < 6)
      throw new BadRequestException('Choose a password of at least 6 characters');

    await this.prisma.db.appUser.update({
      where: { id: row.userId },
      data: { passwordHash: hashSecret(password) },
    });
    await this.prisma.authToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    await this.prisma.db.appSession.deleteMany({ where: { userId: row.userId } });

    const u = await this.prisma.db.appUser.findUnique({ where: { id: row.userId } });
    await this.audit.record({
      entityType: 'AppUser',
      entityId: row.userId,
      action: 'UPDATE',
      // their own doing, so the trail says so rather than naming an owner
      actorName: u?.name ?? 'unknown',
      changes: { passwordSetBySelf: true, via: row.kind },
    });
    return { ok: true };
  }

  /* ------------------------------------------------------------------ *
   *  position + per-person exceptions
   * ------------------------------------------------------------------ */

  async assignPosition(userId: string, positionId: string | null, actorName: string) {
    const u = await this.mustFind(userId);
    if (positionId) {
      const p = await this.prisma.db.position.findUnique({ where: { id: positionId } });
      if (!p) throw new BadRequestException('That position does not exist');
    }

    /*  ADM-RULE-004, the other half. Removing the last OWNER-position holder
        would leave a business nobody can administer, and the screen that would
        fix it is the one that just closed.  */
    if (u.positionId && !positionId) {
      const current = await this.prisma.db.position.findUnique({ where: { id: u.positionId } });
      if (current?.isOwner && (await this.ownerCount()) <= 1)
        throw new BadRequestException(
          'This is the last owner — somebody has to be able to let people back in',
        );
    }

    await this.prisma.db.appUser.update({ where: { id: userId }, data: { positionId } });
    await this.audit.record({
      entityType: 'AppUser', entityId: userId, action: 'UPDATE',
      actorName, changes: { positionId: { from: u.positionId, to: positionId } },
    });
    return { ok: true };
  }

  async overrides(userId: string) {
    const rows = await this.prisma.userAccessOverride.findMany({ where: { userId } });
    return Object.fromEntries(rows.map((r) => [r.nodeKey, r.allowed]));
  }

  /** allowed = null drops the exception, handing the person back to their position */
  async setOverride(
    userId: string, nodeKey: string, allowed: boolean | null, actorName: string,
  ) {
    await this.mustFind(userId);
    const node = await this.prisma.accessNode.findUnique({ where: { key: nodeKey } });
    if (!node) throw new NotFoundException(`There is no screen called "${nodeKey}"`);

    if (allowed === null) {
      await this.prisma.userAccessOverride.deleteMany({ where: { userId, nodeKey } });
    } else {
      await this.prisma.userAccessOverride.upsert({
        where: { userId_nodeKey: { userId, nodeKey } },
        create: { userId, nodeKey, allowed },
        update: { allowed },
      });
    }
    await this.audit.record({
      entityType: 'AppUser', entityId: userId, action: 'UPDATE',
      actorName, changes: { override: nodeKey, allowed },
    });
    return { ok: true };
  }

  /* ------------------------------------------------------------------ */

  private async ownerCount() {
    return this.prisma.db.appUser.count({
      where: { deletedAt: null, isActive: true, position: { isOwner: true } },
    });
  }

  private async mustFind(id: string) {
    const u = await this.prisma.db.appUser.findUnique({ where: { id } });
    if (!u || u.deletedAt) throw new NotFoundException('That person does not exist');
    return { ...u, hasPassword: !!u.passwordHash };
  }

  /** AppUser.username is still unique and required, so one is derived from the email */
  private async freeUsername(email: string): Promise<string> {
    const base = email.split('@')[0].replace(/[^a-z0-9._-]/gi, '').toLowerCase() || 'user';
    for (let n = 0; n < 50; n++) {
      const tryName = n === 0 ? base : `${base}${n + 1}`;
      const taken = await this.prisma.appUser.findFirst({ where: { username: tryName } });
      if (!taken) return tryName;
    }
    return `${base}-${randomBytes(3).toString('hex')}`;
  }

  /**
   * Mint a link. Any earlier unused token of the same kind is burned first —
   * two live links for one account means the older email in somebody's inbox
   * still works, which is exactly what a reset is supposed to end.
   */
  private async issue(userId: string, kind: 'INVITE' | 'RESET') {
    await this.prisma.authToken.updateMany({
      where: { userId, kind, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + (kind === 'INVITE' ? INVITE_DAYS * 864e5 : RESET_HOURS * 36e5),
    );
    await this.prisma.authToken.create({
      data: { kind, userId, tokenHash: fingerprint(token), expiresAt },
    });

    /*  The admin panel's own address. PUBLIC_ADMIN_URL is what the deployed
        environments actually set (Render env, also used for CORS); PANEL_URL
        stays first for anyone who had it. The localhost fallback is for local
        dev only — on 18 Aug an invite link on the live demo pointed at
        localhost:3001 because only PANEL_URL was read, and that name was set
        nowhere.  */
    const base =
      process.env.PANEL_URL || process.env.PUBLIC_ADMIN_URL || 'http://localhost:3001';
    return {
      /*  Handed back so the owner can send it himself while there is no email
          provider key. It is shown once and never stored in readable form —
          asking again mints a new one.  */
      link: `${base}/set-password?token=${token}`,
      expiresAt,
      emailSent: false,
      note:
        'No email provider key is saved yet, so nothing was sent. Copy the link and send it yourself.',
    };
  }

  private async findLive(token?: string) {
    if (!token) return null;
    const row = await this.prisma.authToken.findUnique({
      where: { tokenHash: fingerprint(token) },
    });
    if (!row || row.usedAt || row.expiresAt < new Date()) return null;
    return row;
  }
}
