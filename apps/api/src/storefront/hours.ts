import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  Shop opening hours — and the live "Open now" pill they drive.

  ⚠️ EVERYTHING HERE IS COMPUTED IN BANGLADESH TIME, ON THE SERVER.

  Two ways to get this wrong, both of which look fine in testing:

   1. Compute it in the browser. The visitor's clock and timezone are theirs,
      not the shop's — someone in Toronto would be told the Dhanmondi shop is
      shut at lunchtime.
   2. Compute it in the container's local time. Containers run UTC, which is six
      hours behind Dhaka. The pill would flip to "Closed" at 4 PM.

  `BD_OFFSET_MS` is the same constant `orders/promise.ts`, `delivery-analytics`
  and `finance-drift` use. Producer and consumer disagreeing about what "now"
  means is how a number becomes quietly wrong.
  ═══════════════════════════════════════════════════════════════════════════
*/

const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface HoursStatus {
  /** "Open every day, 9 AM – 10 PM" — generated, never typed */
  line: string;
  /** the second line the card shows underneath */
  note: string | null;
  isOpenNow: boolean;
  /** "Open now · till 10 PM" / "Closed · opens 9 AM tomorrow" */
  pill: string;
}

@Injectable()
export class HoursService {
  constructor(private readonly prisma: PrismaService) {}

  listHours() {
    return this.prisma.db.shopHour.findMany({ orderBy: { weekday: 'asc' } });
  }

  listClosures() {
    // Past closures are dropped from the screen — last Eid is not something the
    // owner needs to scroll past to reach next Eid. They stay in the table.
    const today = bdToday();
    return this.prisma.db.shopClosure.findMany({
      where: { date: { gte: today } },
      orderBy: { date: 'asc' },
    });
  }

  async setHour(weekday: number, dto: { isClosed?: boolean; openMin?: number | null; closeMin?: number | null }) {
    if (weekday < 0 || weekday > 6) throw new BadRequestException('weekday must be 0–6');
    const data = {
      isClosed: dto.isClosed,
      openMin: clampMin(dto.openMin),
      closeMin: clampMin(dto.closeMin),
    };
    return this.prisma.db.shopHour.upsert({
      where: { weekday },
      create: { weekday, ...data },
      update: data,
    });
  }

  async addClosure(dto: { date: string; reason?: string }) {
    if (!dto.date) throw new BadRequestException('A date is required');
    return this.prisma.db.shopClosure.upsert({
      // upsert, not create: adding the same day twice is a slip, not an error
      // worth showing the owner a red box for.
      where: { date: new Date(dto.date) },
      create: { date: new Date(dto.date), reason: dto.reason?.trim() || null },
      update: { reason: dto.reason?.trim() || null },
    });
  }

  async removeClosure(id: string) {
    await this.prisma.db.shopClosure.deleteMany({ where: { id } });
    return { ok: true };
  }

  /** what the storefront card shows — computed here, never in the browser */
  async status(): Promise<HoursStatus> {
    const [hours, closures] = await Promise.all([
      this.prisma.db.shopHour.findMany({ orderBy: { weekday: 'asc' } }),
      this.prisma.db.shopClosure.findMany({ where: { date: { gte: bdToday() } }, orderBy: { date: 'asc' } }),
    ]);

    const now = new Date(Date.now() + BD_OFFSET_MS);
    const weekday = now.getUTCDay();
    const minutesNow = now.getUTCHours() * 60 + now.getUTCMinutes();

    const todayClosed = closures.some((c) => sameDay(c.date, now));
    const today = hours.find((h) => h.weekday === weekday);

    let isOpenNow = false;
    let pill = 'Closed today';

    if (todayClosed) {
      const why = closures.find((c) => sameDay(c.date, now))?.reason;
      pill = why ? `Closed today · ${why}` : 'Closed today';
    } else if (today && !today.isClosed && today.openMin !== null && today.closeMin !== null) {
      if (minutesNow >= today.openMin && minutesNow < today.closeMin) {
        isOpenNow = true;
        pill = `Open now · till ${fmt(today.closeMin)}`;
      } else if (minutesNow < today.openMin) {
        pill = `Closed · opens ${fmt(today.openMin)}`;
      } else {
        pill = `Closed · opens ${fmt(today.openMin)} tomorrow`;
      }
    }

    return { line: summarise(hours), note: closureNote(closures, now), isOpenNow, pill };
  }
}

/** minutes since midnight, or null. Anything outside a day is a typo. */
function clampMin(v: number | null | undefined): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return Math.min(1440, Math.max(0, Math.round(v)));
}

function fmt(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ap = h24 < 12 ? 'AM' : 'PM';
  return m === 0 ? `${h12} ${ap}` : `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

const bdToday = () => {
  const n = new Date(Date.now() + BD_OFFSET_MS);
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};

const sameDay = (a: Date, b: Date) =>
  a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();

/**
 * Turn seven rows into the sentence a person would say.
 *
 * "Open every day, 9 AM – 10 PM" when all seven match; otherwise consecutive
 * days with identical hours are collapsed — "Sat–Thu 9 AM – 10 PM · Fri closed".
 * Listing seven identical lines is technically honest and nobody reads it.
 */
function summarise(hours: { weekday: number; isClosed: boolean; openMin: number | null; closeMin: number | null }[]): string {
  if (hours.length === 0) return '';
  const key = (h: (typeof hours)[number]) =>
    h.isClosed || h.openMin === null || h.closeMin === null ? 'closed' : `${h.openMin}-${h.closeMin}`;

  const ordered = [...hours].sort((a, b) => a.weekday - b.weekday);
  const allSame = ordered.every((h) => key(h) === key(ordered[0]));
  if (allSame) {
    const k = key(ordered[0]);
    return k === 'closed' ? 'Closed every day' : `Open every day, ${fmt(ordered[0].openMin!)} – ${fmt(ordered[0].closeMin!)}`;
  }

  const runs: { from: number; to: number; k: string }[] = [];
  for (const h of ordered) {
    const k = key(h);
    const last = runs[runs.length - 1];
    if (last && last.k === k && last.to === h.weekday - 1) last.to = h.weekday;
    else runs.push({ from: h.weekday, to: h.weekday, k });
  }

  return runs
    .map((r) => {
      const days = r.from === r.to ? DAY_SHORT[r.from] : `${DAY_SHORT[r.from]}–${DAY_SHORT[r.to]}`;
      if (r.k === 'closed') return `${days} closed`;
      const [o, c] = r.k.split('-').map(Number);
      return `${days} ${fmt(o)} – ${fmt(c)}`;
    })
    .join(' · ');
}

/** the upcoming-closure line — only ever mentions the next one */
function closureNote(closures: { date: Date; reason: string | null }[], now: Date): string | null {
  const next = closures.find((c) => !sameDay(c.date, now));
  if (!next) return null;
  const d = next.date;
  const label = `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
  return next.reason ? `Closed ${label} — ${next.reason}` : `Closed ${label}`;
}

@Controller('shop-hours')
export class HoursController {
  constructor(private readonly svc: HoursService) {}

  @Get()
  list() {
    return this.svc.listHours();
  }
  @Get('closures')
  closures() {
    return this.svc.listClosures();
  }
  @Get('status')
  status() {
    return this.svc.status();
  }
  @Patch(':weekday')
  setHour(@Param('weekday') weekday: string, @Body() dto: { isClosed?: boolean; openMin?: number | null; closeMin?: number | null }) {
    return this.svc.setHour(Number(weekday), dto);
  }
  @Post('closures')
  addClosure(@Body() dto: { date: string; reason?: string }) {
    return this.svc.addClosure(dto);
  }
  @Delete('closures/:id')
  removeClosure(@Param('id') id: string) {
    return this.svc.removeClosure(id);
  }
}

@Module({
  providers: [HoursService],
  controllers: [HoursController],
  exports: [HoursService],
})
export class HoursModule {}

export { DAY_NAMES };
