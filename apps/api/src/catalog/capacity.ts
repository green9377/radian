import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { eraseOrBury } from '../common/erase';

/*
  ═══════════════════════════════════════════════════════════════════════════
  Daily capacity — "how much more can we make today?"

  Owner's decisions, 1 Aug 2026, reached after trying two other shapes:

   1. MEASURED IN TIME, NOT IN COUNTS. "50 a day" assumes every job costs the
      same effort. A 15-minute bunch and a 6-hour installation are both "1", so
      the number is wrong the moment the day's mix is not the assumed one —
      either the shop turns away work it could do, or takes work it cannot.

   2. THE DAY IS WHATEVER THE OWNER SAYS. `workers × hoursEach`. Nothing here
      believes a day is 24 hours. When staff changes he edits one number.

   3. THE WORK IS BOOKED ON THE DAY IT HAPPENS, not the day the order came in.
      A bouquet ordered today for Friday is Friday's problem. Two-hour,
      same-day and midnight delivery are all today's.

  RESET: there is none, and that is deliberate. Each day's bookings are their
  own rows, so tomorrow starts empty by construction. A nightly job that clears
  a counter is a job that one day does not run, and the failure is invisible
  until the shop has overbooked a Friday.
  ═══════════════════════════════════════════════════════════════════════════
*/

interface GroupDto {
  name: string;
  workers?: number;
  hoursEach?: number;
  isActive?: boolean;
  sortOrder?: number;
  actorName?: string;
}

/** "2026-08-01" → a Date at midnight UTC, which is how `@db.Date` stores it */
function asDate(v?: string): Date {
  const s = (v ?? '').trim();
  const d = s ? new Date(`${s}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(d.getTime())) throw new BadRequestException('date must be YYYY-MM-DD');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const hhmm = (mins: number) => {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  const sign = mins < 0 ? '-' : '';
  return m === 0 ? `${sign}${h}h` : h === 0 ? `${sign}${m}m` : `${sign}${h}h ${m}m`;
};

@Injectable()
export class CapacityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** every team, with how much of the chosen day is already spoken for */
  async board(dateStr?: string) {
    const onDate = asDate(dateStr);
    const groups = await this.prisma.db.capacityGroup.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        workers: true,
        hoursEach: true,
        categories: { where: { deletedAt: null }, select: { id: true, name: true } },
      },
    });

    const booked = await this.prisma.db.capacityBooking.groupBy({
      by: ['groupId'],
      where: { onDate },
      _sum: { minutes: true },
    });
    const usedBy = new Map(booked.map((b) => [b.groupId, b._sum.minutes ?? 0]));

    return {
      date: onDate.toISOString().slice(0, 10),
      groups: groups.map((g) => {
        const total = g.workers * g.hoursEach * 60;
        const used = usedBy.get(g.id) ?? 0;
        return {
          id: g.id,
          name: g.name,
          workers: g.workers,
          hoursEach: g.hoursEach,
          totalMinutes: total,
          usedMinutes: used,
          /*  may go NEGATIVE and is left that way on purpose. Capacity can be
              overrun by a manual order or an edit, and a floor at zero would
              hide exactly the day somebody needs to see.  */
          freeMinutes: total - used,
          freeLabel: hhmm(total - used),
          categories: g.categories,
        };
      }),
    };
  }

  /**
   * Can this product still be made on this date?
   *
   * The one call Sales needs before promising a delivery date. Answers with
   * the reason, not just a boolean — "no" and "no because there is no team for
   * this category" need different actions from the shop.
   */
  async check(productId: string, dateStr?: string) {
    const onDate = asDate(dateStr);
    const p = await this.prisma.db.product.findFirst({
      where: { id: productId },
      select: {
        id: true,
        makeMinutes: true,
        leadTimeDays: true,
        category: {
          select: {
            capacityGroupId: true,
            parent: { select: { capacityGroupId: true } },
          },
        },
      },
    });
    if (!p) throw new NotFoundException('Product not found');

    /*  Nothing to make → nothing to book. A readymade box off the shelf costs
        the workshop no time and must not be refused because a busy day of
        bouquets filled the hours.  */
    if (!p.makeMinutes || p.makeMinutes <= 0) {
      return {
        ok: true as const,
        reason: 'NO_MAKE_TIME' as const,
        days: [],
        nextAvailable: onDate.toISOString().slice(0, 10),
      };
    }

    /*  A sub-category inherits its parent's team — "Roses" is made by whoever
        makes Fresh Flowers, and nobody should have to say so forty-four times. */
    const groupId = p.category.capacityGroupId ?? p.category.parent?.capacityGroupId ?? null;
    if (!groupId) {
      return {
        ok: true as const,
        reason: 'NO_GROUP' as const,
        days: [],
        nextAvailable: onDate.toISOString().slice(0, 10),
      };
    }

    /*
      A job longer than a day is spread across the days it is actually being
      made, ending on the delivery date — not piled onto one day. Booking ten
      hours on Friday for a piece built Wednesday to Friday would leave
      Wednesday looking free and the workshop drowning.
    */
    const days = Math.max(1, p.leadTimeDays ?? 1);
    const perDay = Math.ceil(p.makeMinutes / days);
    const wanted: Date[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(onDate);
      d.setUTCDate(d.getUTCDate() - i);
      wanted.push(d);
    }

    const group = await this.prisma.db.capacityGroup.findFirst({
      where: { id: groupId },
      select: { id: true, name: true, workers: true, hoursEach: true },
    });
    if (!group) {
      return {
        ok: true as const,
        reason: 'NO_GROUP' as const,
        days: [],
        nextAvailable: onDate.toISOString().slice(0, 10),
      };
    }
    const total = group.workers * group.hoursEach * 60;

    const rows = await this.prisma.db.capacityBooking.groupBy({
      by: ['onDate'],
      where: { groupId, onDate: { in: wanted } },
      _sum: { minutes: true },
    });
    const usedOn = new Map(
      rows.map((r) => [r.onDate.toISOString().slice(0, 10), r._sum.minutes ?? 0]),
    );

    const detail = wanted.map((d) => {
      const key = d.toISOString().slice(0, 10);
      const used = usedOn.get(key) ?? 0;
      return { date: key, freeMinutes: total - used, needMinutes: perDay, fits: total - used >= perDay };
    });

    const ok = detail.every((d) => d.fits);

    return {
      ok,
      reason: 'CHECKED' as const,
      group: { id: group.id, name: group.name },
      needMinutes: p.makeMinutes,
      days: detail,
      /*
        ⚠️ NEVER "NO" — owner's ruling, 1 Aug 2026. A full day is not a refused
        order, it is a later one. A shop that says "sorry, not available" loses
        the sale; one that says "Thursday" keeps it.

        So the answer to "can you make this on Friday?" always carries the
        first date the shop CAN, and checkout offers that instead of an error.
        Null only when nothing within the search window fits, which for a
        workshop means the settings are wrong, not that the customer should be
        turned away.
      */
      nextAvailable: ok ? onDate.toISOString().slice(0, 10) : await this.firstFreeDay(groupId, onDate, perDay, days, total),
    };
  }

  /**
   * The first day from `from` onwards where this job fits, days spread and all.
   *
   * Walks forward one day at a time. Bounded at 60 — beyond that the shop is
   * not busy, its capacity is set wrong, and quietly offering a date four
   * months out would hide that.
   */
  private async firstFreeDay(
    groupId: string,
    from: Date,
    perDay: number,
    spanDays: number,
    totalMinutes: number,
  ): Promise<string | null> {
    const HORIZON = 60;

    const last = new Date(from);
    last.setUTCDate(last.getUTCDate() + HORIZON);
    const earliest = new Date(from);
    earliest.setUTCDate(earliest.getUTCDate() - (spanDays - 1));

    /*  One query for the whole window rather than sixty. A day with no
        bookings has no row, so `used` defaults to zero.  */
    const rows = await this.prisma.db.capacityBooking.groupBy({
      by: ['onDate'],
      where: { groupId, onDate: { gte: earliest, lte: last } },
      _sum: { minutes: true },
    });
    const used = new Map(rows.map((r) => [r.onDate.toISOString().slice(0, 10), r._sum.minutes ?? 0]));
    const freeOn = (d: Date) => totalMinutes - (used.get(d.toISOString().slice(0, 10)) ?? 0);

    for (let offset = 1; offset <= HORIZON; offset++) {
      const candidate = new Date(from);
      candidate.setUTCDate(candidate.getUTCDate() + offset);

      let fits = true;
      for (let i = spanDays - 1; i >= 0; i--) {
        const d = new Date(candidate);
        d.setUTCDate(d.getUTCDate() - i);
        if (freeOn(d) < perDay) {
          fits = false;
          break;
        }
      }
      if (fits) return candidate.toISOString().slice(0, 10);
    }
    return null;
  }

  /* ---------------- what Sales calls ---------------- */

  /**
   * Take this order's making time out of the days it will be made on.
   *
   * ⚠️ CALLED AT **CONFIRM**, not when the order arrives — owner's ruling,
   * 1 Aug 2026. An unconfirmed order is a request; holding the workshop's day
   * open for one that is never answered would starve the orders that are.
   *
   * ⚠️ IDEMPOTENT. It clears this order's bookings before writing new ones, so
   * confirming twice, or re-confirming after an edit, cannot book the same
   * work a second time. That mattered more than it sounds: double-booking is
   * invisible — the day simply looks busier than it is and the shop turns away
   * work it could have done.
   */
  async bookForOrder(orderId: string) {
    const order = await this.prisma.db.order.findFirst({
      where: { id: orderId },
      select: {
        id: true,
        promisedBy: true,
        lines: {
          where: { deletedAt: null },
          select: {
            qty: true,
            productId: true,
            product: {
              select: {
                id: true,
                makeMinutes: true,
                leadTimeDays: true,
                category: {
                  select: {
                    capacityGroupId: true,
                    parent: { select: { capacityGroupId: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!order) return { booked: 0 };

    await this.releaseForOrder(orderId);

    /*
      The day the work HAPPENS. `promisedBy` is the frozen promise; the display
      strings beside it ("10:00–13:00") are for reading, not comparing.
      No promise yet — a walk-in, a phone order — means today.

      ⚠️ Bangladesh time, the same +6h the shop's opening hours and the
      finance drift checker use. The container runs UTC, so a 1 AM order would
      otherwise book the previous day.
    */
    const BD = 6 * 60 * 60 * 1000;
    const base = order.promisedBy ?? new Date();
    const bd = new Date(base.getTime() + BD);
    const deliveryDay = new Date(Date.UTC(bd.getUTCFullYear(), bd.getUTCMonth(), bd.getUTCDate()));

    const rows: { groupId: string; onDate: Date; minutes: number; orderId: string; productId: string }[] = [];

    for (const line of order.lines) {
      const p = line.product;
      if (!p?.makeMinutes || p.makeMinutes <= 0) continue;

      const groupId = p.category.capacityGroupId ?? p.category.parent?.capacityGroupId ?? null;
      if (!groupId) continue;

      const total = p.makeMinutes * line.qty;
      const days = Math.max(1, p.leadTimeDays ?? 1);
      const perDay = Math.ceil(total / days);

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(deliveryDay);
        d.setUTCDate(d.getUTCDate() - i);
        rows.push({ groupId, onDate: d, minutes: perDay, orderId, productId: p.id });
      }
    }

    if (rows.length > 0) await this.prisma.db.capacityBooking.createMany({ data: rows });
    return { booked: rows.length };
  }

  /**
   * Give the time back.
   *
   * A cancelled order that keeps its hours is a workshop that looks full and
   * is not — the most expensive kind of wrong, because nobody goes looking for
   * capacity they believe is gone.
   */
  async releaseForOrder(orderId: string) {
    const r = await this.prisma.db.capacityBooking.deleteMany({ where: { orderId } });
    return { released: r.count };
  }

  /* ---------------- teams ---------------- */

  list() {
    return this.prisma.db.capacityGroup.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { categories: { where: { deletedAt: null }, select: { id: true, name: true } } },
    });
  }

  async create(dto: GroupDto) {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    const g = await this.prisma.db.capacityGroup.create({
      data: {
        name: dto.name.trim(),
        workers: dto.workers ?? 1,
        hoursEach: dto.hoursEach ?? 8,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.log(g.id, 'CREATE', dto.actorName, `Capacity team "${g.name}" created`);
    return g;
  }

  async update(id: string, dto: Partial<GroupDto>) {
    await this.ensure(id);
    return this.prisma.db.capacityGroup.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        workers: dto.workers,
        hoursEach: dto.hoursEach,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string, actorName = 'Admin') {
    await this.ensure(id);
    await eraseOrBury(
      () => this.prisma.capacityGroup.delete({ where: { id } }),
      () => this.prisma.db.capacityGroup.update({ where: { id }, data: { deletedAt: new Date() } }),
      'Capacity Group',
    );
    await this.log(id, 'DELETE', actorName, 'Capacity team removed (soft)');
    return { id, deleted: true };
  }

  /** which categories a team covers — replaced whole, like every other list */
  async setCategories(groupId: string, categoryIds: string[]) {
    await this.ensure(groupId);
    await this.prisma.db.category.updateMany({
      where: { capacityGroupId: groupId },
      data: { capacityGroupId: null },
    });
    if (categoryIds.length > 0) {
      await this.prisma.db.category.updateMany({
        where: { id: { in: categoryIds } },
        data: { capacityGroupId: groupId },
      });
    }
    return { groupId, count: categoryIds.length };
  }

  private async ensure(id: string) {
    const row = await this.prisma.db.capacityGroup.findFirst({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('capacity team not found');
  }

  private async log(
    entityId: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    actorName = 'Admin',
    label: string,
  ) {
    await this.audit.record({ entityType: 'CapacityGroup', entityId, action, actorName });
    await this.audit.event({
      entityType: 'CapacityGroup',
      entityId,
      kind: 'general',
      label,
      actorName,
    });
  }
}

@Controller('capacity')
export class CapacityController {
  constructor(private readonly svc: CapacityService) {}

  /* static routes above the parameterised one */

  @Get('board')
  board(@Query('date') date?: string) {
    return this.svc.board(date);
  }

  @Get('check')
  check(@Query('productId') productId: string, @Query('date') date?: string) {
    return this.svc.check(productId, date);
  }

  @Get()
  list() {
    return this.svc.list();
  }

  @Post()
  create(@Body() dto: GroupDto, @Headers('x-actor-name') a?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? a });
  }

  @Post(':id/categories')
  setCategories(@Param('id') id: string, @Body() body: { categoryIds: string[] }) {
    return this.svc.setCategories(id, body.categoryIds ?? []);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<GroupDto>) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') a?: string) {
    return this.svc.remove(id, a ?? 'Admin');
  }
}

@Module({
  providers: [CapacityService],
  controllers: [CapacityController],
  /*  Sales books and releases through this — see `bookForOrder`.  */
  exports: [CapacityService],
})
export class CapacityModule {}
