import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { eraseOrBury } from '../common/erase';
import { AuditService } from '../common/audit.service';

/*  ACCESS — closes DEC-FIN-028.

    Two separate questions, two separate answers:
      login  → who is at the keyboard today
      PIN    → is that still true at the moment money moves

    A shop shares one screen all day, so a session alone cannot prove who
    approved an expense. Every money action therefore re-asks for a 4-digit PIN
    and the ledger records the SESSION's user — never a name typed into a box.

    No new dependency: scrypt from node's own crypto, salted per user.
*/

const SESSION_DAYS = 7;

function hash(secret: string): string {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(secret, salt, 32).toString('hex');
  return `${salt}:${key}`;
}

function verify(secret: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const test = scryptSync(secret, salt, 32);
  const known = Buffer.from(key, 'hex');
  return test.length === known.length && timingSafeEqual(test, known);
}

export interface LoginDto {
  username?: string;
  password?: string;
}
export interface SetupDto {
  name?: string;
  username?: string;
  password?: string;
  pin?: string;
}
export interface UserWriteDto {
  name?: string;
  username?: string;
  password?: string;
  pin?: string;
  role?: 'OWNER' | 'MANAGER' | 'STAFF';
  isActive?: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** is anybody set up yet? the admin screen shows a first-run form when not */
  async status() {
    const count = await this.prisma.db.appUser.count({ where: { deletedAt: null } });
    return { needsSetup: count === 0, userCount: count };
  }

  /** first run only — creates the first OWNER. Refuses once anyone exists. */
  async setup(dto: SetupDto) {
    const { needsSetup } = await this.status();
    if (!needsSetup) throw new BadRequestException('Already set up — sign in instead');
    if (!dto.username?.trim() || !dto.password || dto.password.length < 6)
      throw new BadRequestException('Username and a password of at least 6 characters are required');
    if (dto.pin && !/^\d{4}$/.test(dto.pin)) throw new BadRequestException('The PIN must be 4 digits');

    const user = await this.prisma.db.appUser.create({
      data: {
        name: dto.name?.trim() || dto.username.trim(),
        username: dto.username.trim().toLowerCase(),
        role: 'OWNER',
        passwordHash: hash(dto.password),
        pinHash: dto.pin ? hash(dto.pin) : null,
      },
    });
    return this.issue(user.id);
  }

  private async issue(userId: string) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
    await this.prisma.db.appSession.create({ data: { token, userId, expiresAt } });
    await this.prisma.db.appUser.update({ where: { id: userId }, data: { lastLogin: new Date() } });
    const user = await this.prisma.db.appUser.findUnique({ where: { id: userId } });
    return {
      token,
      expiresAt,
      user: user && {
        id: user.id, name: user.name, username: user.username,
        role: user.role, hasPin: !!user.pinHash,
      },
    };
  }

  /**
   * Sign in with EITHER the username or the email address (30 Jul 2026).
   *
   * The owner's requirement is that access is handed out by email, so the thing
   * people are told to type is their email. The username still works: every
   * account created before today has one and no email, and a migration that
   * locks the existing staff out on the morning it lands is not a migration.
   *
   * ⚠️ `verify` returns false for a null hash, which is what an invited person
   * who has not chosen a password yet has. So they cannot sign in until they
   * follow their link — correct, and it needs no extra branch to be true.
   */
  async login(dto: LoginDto) {
    const who = dto.username?.trim().toLowerCase();
    if (!who || !dto.password) throw new BadRequestException('Enter your name and password');
    const user = await this.prisma.db.appUser.findFirst({
      where: {
        deletedAt: null,
        OR: [{ username: who }, { email: who }],
      },
    });
    // same message either way — never reveal which half was wrong
    if (!user || !user.isActive || !verify(dto.password, user.passwordHash))
      throw new UnauthorizedException('Wrong username or password');
    await this.audit.record({
      entityType: 'AppUser', entityId: user.id, action: 'UPDATE',
      actorName: user.name, changes: { event: 'signed in' },
    });
    return this.issue(user.id);
  }

  async logout(token?: string) {
    if (token) await this.prisma.db.appSession.deleteMany({ where: { token } });
    return { ok: true };
  }

  /** the guard's lookup — returns null for a missing, unknown or expired token */
  async userForToken(token?: string) {
    if (!token) return null;
    const s = await this.prisma.db.appSession.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!s || s.expiresAt < new Date()) return null;
    if (!s.user || !s.user.isActive || s.user.deletedAt) return null;
    return s.user;
  }

  /**
   * DEC-ADM-012 — may this person see buying prices?
   *
   * It rides on the access TEMPLATE, not the person, so moving somebody between
   * templates moves what they can see with them. The owner always can
   * (ADM-RULE-004), and anybody with no template at all cannot: a cost figure
   * is not something to hand out by accident.
   */
  async canSeeCost(userId: string): Promise<boolean> {
    const u = await this.prisma.db.appUser.findUnique({
      where: { id: userId },
      /*  canSeeCost cast: the client on a machine that has not regenerated since
          DEC-ADM-012 does not know the column yet.  */
      select: {
        role: true,
        position: { select: { isOwner: true, ...({ canSeeCost: true } as object) } },
      },
    });
    if (!u) return false;
    if (u.position?.isOwner) return true;
    if (u.position) return (u.position as { canSeeCost?: boolean }).canSeeCost === true;
    /*  No template yet — fall back to the role while the migration to templates
        finishes (DEC-FIN-028 note): OWNER and MANAGER buy things, STAFF does not.  */
    return u.role === 'OWNER' || u.role === 'MANAGER';
  }

  /** money actions re-confirm the person behind the open session */
  async checkPin(userId: string, pin?: string): Promise<boolean> {
    if (!pin) return false;
    const u = await this.prisma.db.appUser.findUnique({ where: { id: userId } });
    if (!u?.pinHash) return false;
    return verify(pin, u.pinHash);
  }

  async me(userId: string) {
    const u = await this.prisma.db.appUser.findUnique({ where: { id: userId } });
    if (!u) return null;
    return {
      id: u.id, name: u.name, username: u.username, role: u.role, hasPin: !!u.pinHash,
      // DEC-ADM-012 — the screens read this to know whether to draw cost at all
      canSeeCost: await this.canSeeCost(u.id),
    };
  }

  /** change my own password / PIN — current password proves it is really me */
  async changeOwn(
    userId: string,
    dto: { currentPassword?: string; password?: string; pin?: string },
  ) {
    const u = await this.prisma.db.appUser.findUnique({ where: { id: userId } });
    if (!u) throw new BadRequestException('User not found');
    if (!dto.currentPassword || !verify(dto.currentPassword, u.passwordHash))
      throw new UnauthorizedException('Your current password is not right');
    if (dto.password && dto.password.length < 6)
      throw new BadRequestException('A password needs at least 6 characters');
    if (dto.pin && !/^\d{4}$/.test(dto.pin)) throw new BadRequestException('The PIN must be 4 digits');
    if (!dto.password && !dto.pin) throw new BadRequestException('Nothing to change');

    await this.prisma.db.appUser.update({
      where: { id: userId },
      data: {
        passwordHash: dto.password ? hash(dto.password) : undefined,
        pinHash: dto.pin ? hash(dto.pin) : undefined,
      },
    });
    // changing the password ends every other open session — a stolen tab dies
    if (dto.password) await this.prisma.db.appSession.deleteMany({ where: { userId } });
    return { ok: true, signedOutEverywhere: !!dto.password };
  }

  /* ---------------- users (OWNER only, enforced in the controller) ---------------- */

  async users() {
    const rows = await this.prisma.db.appUser.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((u) => ({
      id: u.id, name: u.name, username: u.username, role: u.role,
      isActive: u.isActive, hasPin: !!u.pinHash, lastLogin: u.lastLogin,
    }));
  }

  async createUser(dto: UserWriteDto) {
    if (!dto.username?.trim() || !dto.password || dto.password.length < 6)
      throw new BadRequestException('Username and a password of at least 6 characters are required');
    if (dto.pin && !/^\d{4}$/.test(dto.pin)) throw new BadRequestException('The PIN must be 4 digits');
    const exists = await this.prisma.db.appUser.findFirst({
      where: { username: dto.username.trim().toLowerCase(), deletedAt: null },
    });
    if (exists) throw new BadRequestException('That username is taken');
    return this.prisma.db.appUser.create({
      data: {
        name: dto.name?.trim() || dto.username.trim(),
        username: dto.username.trim().toLowerCase(),
        role: dto.role ?? 'STAFF',
        passwordHash: hash(dto.password),
        pinHash: dto.pin ? hash(dto.pin) : null,
      },
      select: { id: true, name: true, username: true, role: true },
    });
  }

  async updateUser(id: string, dto: UserWriteDto) {
    const u = await this.prisma.db.appUser.findUnique({ where: { id } });
    if (!u || u.deletedAt) throw new BadRequestException('User not found');
    if (dto.pin && !/^\d{4}$/.test(dto.pin)) throw new BadRequestException('The PIN must be 4 digits');
    if (dto.password && dto.password.length < 6)
      throw new BadRequestException('A password needs at least 6 characters');
    return this.prisma.db.appUser.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        role: dto.role ?? undefined,
        isActive: dto.isActive ?? undefined,
        passwordHash: dto.password ? hash(dto.password) : undefined,
        pinHash: dto.pin ? hash(dto.pin) : undefined,
      },
      select: { id: true, name: true, username: true, role: true, isActive: true },
    });
  }

  async removeUser(id: string) {
    const owners = await this.prisma.db.appUser.count({
      where: { role: 'OWNER', deletedAt: null, isActive: true },
    });
    const u = await this.prisma.db.appUser.findUnique({ where: { id } });
    if (u?.role === 'OWNER' && owners <= 1)
      throw new BadRequestException('The last owner cannot be removed — someone has to hold the keys');
    await this.prisma.db.appSession.deleteMany({ where: { userId: id } });
    /*  DEC-GBL-007 — an account that never did anything goes for real, so its
        email is free again the same minute. One that wrote a message, took an
        order or is tied to an employee record cannot go (the database refuses)
        and is buried instead — and `invite()` then takes that buried row over
        rather than refusing the address.  */
    await eraseOrBury(
      () => this.prisma.appUser.delete({ where: { id } }),
      () =>
        this.prisma.db.appUser.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false },
        }),
      'Account',
    );
    return { ok: true };
  }
}
