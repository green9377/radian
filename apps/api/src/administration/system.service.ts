import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

/**
 * SystemService — who is signed in, and whether the backups are actually running.
 *
 * Both of these existed as facts the system already held and could not be
 * looked at: `AppSession` has had a row per sign-in since day one, and
 * radian_backup_silent.bat has been writing an AuditLog row for every dump it
 * takes. Neither had a screen.
 */
@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------------------------------------------ *
   *  who is signed in
   * ------------------------------------------------------------------ */

  /**
   * ⚠️ The token itself is never returned, not even truncated. This screen is
   * for the OWNER, but a session token in a JSON response is a session token in
   * a browser cache, a screenshot and a log file. The id is enough to end it.
   */
  async sessions(currentToken?: string) {
    const rows = await this.prisma.db.appSession.findMany({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      include: { user: { include: { position: true } } },
    });
    return rows.map((s) => ({
      id: s.id,
      userId: s.userId,
      name: s.user.name,
      email: s.user.email,
      position: s.user.position?.name ?? s.user.role,
      startedAt: s.createdAt,
      expiresAt: s.expiresAt,
      /** so the screen can refuse to offer "sign out" for the chair you are in */
      isYou: !!currentToken && s.token === currentToken,
    }));
  }

  /**
   * End one session from here — the phone-left-in-a-rickshaw case.
   *
   * Signing yourself out from this screen is blocked: the button is one row away
   * from the others, and locking yourself out of the screen that manages access
   * is a mistake worth making impossible rather than recoverable. Use the normal
   * sign-out for that.
   */
  async endSession(id: string, currentToken: string | undefined, actorName: string) {
    const s = await this.prisma.db.appSession.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!s) throw new BadRequestException('That session has already ended');
    if (currentToken && s.token === currentToken)
      throw new BadRequestException(
        'That is the session you are using — sign out from the sidebar instead',
      );

    await this.prisma.db.appSession.delete({ where: { id } });
    await this.audit.record({
      entityType: 'AppUser',
      entityId: s.userId,
      action: 'UPDATE',
      actorName,
      changes: { signedOutRemotely: s.user.name, startedAt: s.createdAt },
    });
    return { ok: true };
  }

  /** everything for one person, when an account is known to be compromised */
  async endAllFor(userId: string, actorName: string) {
    const u = await this.prisma.db.appUser.findUnique({ where: { id: userId } });
    if (!u) throw new BadRequestException('That person does not exist');
    const { count } = await this.prisma.db.appSession.deleteMany({ where: { userId } });
    await this.audit.record({
      entityType: 'AppUser',
      entityId: userId,
      action: 'UPDATE',
      actorName,
      changes: { allSessionsEnded: count, who: u.name },
    });
    return { ok: true, ended: count };
  }

  /* ------------------------------------------------------------------ *
   *  backups
   * ------------------------------------------------------------------ */

  /**
   * Backup history, read from the AUDIT TRAIL rather than from the disk.
   *
   * The API runs in a container that mounts only apps/api, so it cannot see
   * D:\radian\backups and never will without a compose change. It does not need
   * to: radian_backup_silent.bat already writes an AuditLog row per dump, with
   * the filename and the byte count. The evidence was being collected all along
   * with nothing reading it.
   *
   * What this therefore CANNOT tell you, and says so on the screen: whether the
   * file is still on the disk today. It knows a backup was taken, not that it
   * survived. Only a restore proves that, which is why the screen ends by
   * telling the owner to try one.
   */
  async backups() {
    const rows = await this.prisma.db.auditLog.findMany({
      where: { entityType: 'Backup' },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    const list = rows.map((r) => {
      const c = (r.changes ?? {}) as { file?: string; bytes?: number | string };
      return {
        at: r.createdAt,
        file: c.file ?? null,
        bytes: c.bytes == null ? null : Number(c.bytes),
        by: r.actorName,
      };
    });

    const last = list[0] ?? null;
    const hoursSince = last
      ? Math.floor((Date.now() - last.at.getTime()) / 36e5)
      : null;

    /*  A backup routine that stopped a fortnight ago looks identical to one that
        works, right up until the day it is needed. So the screen gets a verdict,
        not just a list. 36 hours, not 24: a laptop that was off overnight and
        caught up in the morning is fine and should not cry wolf.  */
    const state =
      hoursSince === null ? 'never'
        : hoursSince <= 36 ? 'ok'
          : hoursSince <= 24 * 7 ? 'stale'
            : 'bad';

    return {
      state,
      hoursSince,
      last,
      count: list.length,
      /*  An empty dump is a file that looks like a backup and restores nothing.
          The .bat already deletes those, so one showing up here means the check
          was bypassed somewhere.  */
      suspicious: list.filter((b) => b.bytes != null && b.bytes < 10_000).length,
      history: list,
    };
  }

  /* ------------------------------------------------------------------ *
   *  where every setting lives
   * ------------------------------------------------------------------ */

  /**
   * The settings map. ⚠️ NOT one merged settings table — one DOOR.
   *
   * Ten singleton tables, each owned by its own module. Gathering them into one
   * table is the tempting mistake the kickoff warned about by name: the VAT rate
   * is a Finance business rule and the POS discount ceiling belongs to POS.
   * Merging them breaks One Data One Owner and makes every module reach into a
   * table it does not own.
   *
   * What was actually missing was a way to FIND them. The sidebar had a
   * "Settings" row with no href at all — a button that did nothing, since the
   * first build.
   *
   * `configured` is counted from the real rows, so this cannot claim a module is
   * set up when nobody has been near it.
   */
  async settingsMap() {
    const [
      finance, marketing, seo, tracking, messaging,
      intelligence, returns_, inventory, offers, pos, company,
    ] = await Promise.all([
      this.prisma.db.financeSetting.findFirst(),
      this.prisma.db.marketingSetting.findFirst(),
      this.prisma.db.seoSetting.findFirst(),
      this.prisma.db.trackingSetting.findFirst(),
      this.prisma.db.messagingSetting.findFirst(),
      this.prisma.db.intelligenceSetting.findFirst(),
      this.prisma.db.returnSetting.findFirst(),
      this.prisma.db.inventorySetting.findFirst(),
      this.prisma.db.offerSetting.findFirst(),
      this.prisma.db.posSetting.findFirst(),
      this.prisma.db.companySetting.findFirst(),
    ]);

    return [
      {
        key: 'company', label: 'Company', owner: 'Administration',
        href: '/administration/company', exists: !!company,
        what: 'Registered name, BIN, TIN, trade licence, logo, printed contact details',
      },
      {
        key: 'finance', label: 'Finance', owner: 'Finance',
        href: '/finance/settings', exists: !!finance,
        what: 'VAT rate, VAT-inclusive pricing, rider cash limit',
      },
      {
        key: 'pos', label: 'POS', owner: 'POS',
        href: '/pos/settings', exists: !!pos,
        what: 'Counter behaviour, discount ceiling, day-close rules',
      },
      {
        key: 'inventory', label: 'Inventory', owner: 'Inventory',
        href: '/inventory/settings', exists: !!inventory,
        what: 'Reorder points, wastage handling, expiry warnings',
      },
      {
        key: 'returns', label: 'Returns', owner: 'Returns',
        href: '/returns/settings', exists: !!returns_,
        what: 'Reasons, refund windows, restocking rules',
      },
      {
        key: 'offers', label: 'Offers', owner: 'Offers',
        href: '/offers/settings', exists: !!offers,
        what: 'Coupon limits, stacking rules, approval thresholds',
      },
      {
        key: 'marketing', label: 'Marketing', owner: 'Marketing',
        href: '/marketing/settings', exists: !!marketing,
        what: 'Loyalty switch, hold days, the WhatsApp message text',
      },
      {
        key: 'messaging', label: 'Messaging keys', owner: 'Marketing',
        href: '/marketing/messaging', exists: !!messaging,
        what: 'WhatsApp, email and SMS provider keys',
      },
      {
        key: 'tracking', label: 'Tracking', owner: 'Marketing',
        href: '/marketing/tracking', exists: !!tracking,
        what: 'Meta pixel, Google tags, conversion events',
      },
      {
        key: 'seo', label: 'SEO', owner: 'Marketing',
        href: '/marketing/seo', exists: !!seo,
        what: 'Titles, descriptions, sitemap defaults',
      },
      {
        key: 'intelligence', label: 'Intelligence', owner: 'Intelligence',
        href: '/intelligence/kpis', exists: !!intelligence,
        what: 'Green/amber/red bands, how much history the forecast needs',
      },
    ];
  }
}
