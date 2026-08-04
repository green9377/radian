import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Roles, type AppRoleName, type AuthedRequest } from '../auth/auth.guard';
import { IntelligenceService } from './intelligence.service';
import { IntelligenceAutomationService } from './intelligence.automation';
import { IntelligenceKpiService } from './intelligence.kpi.service';
import { IntelligenceLensService, LENSES, type LensKey, type RangeKey } from './intelligence.lens.service';
import { IntelligenceReportsService } from './intelligence.reports.service';
import { IntelligenceForecastService } from './intelligence.forecast.service';

/*  INTELLIGENCE — HTTP surface.
    RADIAN_INTELLIGENCE_MODULE_ARCHITECTURE.md (29 Jul 2026).

    ⚠️ ROUTE ORDER: this controller has no `:id` route at all, and it should stay
    that way. If one is ever added it goes BELOW every static path — the Nest
    trap that has already caught /purchases, /products, /suppliers, /hr and
    /marketing five separate times.

    ⚠️ ROLES (DEC-INT-005): the controller is open to everyone signed in, because
    STAFF is meant to see the Today section — that is their own work. The money
    is withheld INSIDE the service, per figure, from the payload itself. Hiding a
    section in the browser while still sending it is not a restriction; it is a
    rumour. Finance closes its whole module to STAFF on purpose, and Intelligence
    reads from everywhere, so this is exactly where that fence leaks if nobody
    holds it.  */
@Controller('intelligence')
export class IntelligenceController {
  constructor(
    private readonly intelligence: IntelligenceService,
    private readonly automation: IntelligenceAutomationService,
    private readonly kpi: IntelligenceKpiService,
    private readonly lens: IntelligenceLensService,
    private readonly reportsCentre: IntelligenceReportsService,
    private readonly forecast: IntelligenceForecastService,
  ) {}

  /* ---- dashboard ---- */

  @Get('dashboard')
  dashboard(@Req() req: AuthedRequest) {
    const role = (req.actor?.role ?? 'STAFF') as AppRoleName;
    return this.intelligence.dashboard(role);
  }

  /** the history strip — read from DailySnapshot, never recomputed */
  @Get('history')
  @Roles('OWNER', 'MANAGER')
  history(@Query('days') days?: string) {
    const n = Number(days);
    return this.intelligence.history(Number.isFinite(n) && n > 0 ? Math.min(n, 365) : 30);
  }

  /* ---- Analytics & KPIs (DEC-INT-003) ----

     Money-shaped, so OWNER and MANAGER only — a margin target is a cost figure
     and STAFF does not get cost figures (DEC-INT-005 / INT-R08). Setting a
     target is OWNER alone: deciding what "a good month" means is not a
     delegated job. */

  /** the nine lenses, and which one is which */
  @Get('lenses')
  @Roles('OWNER', 'MANAGER')
  lenses() {
    return { lenses: LENSES };
  }

  /*  One lens, one period. Every lens answers in the SAME shape — cards and
      charts — so a single renderer draws all nine and a tenth is a method, not
      a screen. */
  @Get('analytics')
  @Roles('OWNER', 'MANAGER')
  analytics(@Query('lens') lens?: string, @Query('range') range?: string) {
    const key = (LENSES.find((l) => l.key === lens)?.key ?? 'sales') as LensKey;
    const r: RangeKey =
      range === 'today' || range === 'month' || range === 'year' ? range : '30d';
    return this.lens.lens(key, r);
  }

  /** the year, month by month — target vs actual vs colour */
  @Get('kpis')
  @Roles('OWNER', 'MANAGER')
  kpis(@Query('year') year?: string) {
    return this.kpi.year(this.yearOr(year));
  }

  /** why the month moved — volume vs basket, split exactly */
  @Get('kpis/movement')
  @Roles('OWNER', 'MANAGER')
  movement(@Query('year') year?: string, @Query('month') month?: string) {
    const now = new Date();
    const m = Number(month);
    return this.kpi.movement(
      this.yearOr(year),
      Number.isInteger(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1,
    );
  }

  /** which days of the week actually sell */
  @Get('kpis/weekdays')
  @Roles('OWNER', 'MANAGER')
  weekdays(@Query('days') days?: string) {
    const n = Number(days);
    return this.kpi.weekdayPattern(Number.isFinite(n) && n > 0 ? Math.min(n, 730) : 90);
  }

  @Get('targets')
  @Roles('OWNER', 'MANAGER')
  targets(@Query('year') year?: string) {
    return this.intelligence.listTargets(this.yearOr(year));
  }

  @Post('targets')
  @Roles('OWNER')
  setTarget(
    @Req() req: AuthedRequest,
    @Body()
    body: {
      year: number;
      month: number;
      kpi: 'MONTHLY_SALES' | 'GROSS_MARGIN' | 'ON_TIME_DELIVERY';
      targetValue: number;
      note?: string;
    },
  ) {
    return this.kpi.setTarget({ ...body, actorName: req.actor?.name ?? 'Admin' });
  }

  /*  Clearing and copying are POSTs to STATIC paths on purpose. A
      `DELETE /targets/:id` would put the controller's first dynamic segment
      right where `kpis`, `targets` and `sweep` live — the Nest ordering trap
      that has already caught five modules. There is still no `:id` route in
      this file, and keeping it that way is cheaper than remembering the rule. */
  @Post('targets/clear')
  @Roles('OWNER')
  clearTarget(
    @Req() req: AuthedRequest,
    @Body()
    body: { year: number; month: number; kpi: 'MONTHLY_SALES' | 'GROSS_MARGIN' | 'ON_TIME_DELIVERY' },
  ) {
    return this.kpi.clearTarget({ ...body, actorName: req.actor?.name ?? 'Admin' });
  }

  @Post('targets/copy')
  @Roles('OWNER')
  copyTargets(
    @Req() req: AuthedRequest,
    @Body() body: { fromYear: number; fromMonth: number; toYear: number; months: number[] },
  ) {
    return this.kpi.copyTargets({ ...body, actorName: req.actor?.name ?? 'Admin' });
  }

  private yearOr(year?: string) {
    const y = Number(year);
    return Number.isInteger(y) && y > 2000 && y < 2100 ? y : new Date().getFullYear();
  }

  /* ---- Reports centre (DEC-INT-004) ----

     ⚠️ The report is picked with `?key=`, NOT `/reports/:key`. That keeps this
     controller free of any dynamic segment, so the Nest route-ordering trap has
     nothing to catch — and it matches `analytics?lens=`. */

  @Get('reports')
  @Roles('OWNER', 'MANAGER')
  reportList() {
    return this.reportsCentre.list();
  }

  @Get('report')
  @Roles('OWNER', 'MANAGER')
  report(@Query('key') key?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsCentre.run(key ?? 'pnl', from, to);
  }

  /* ---- Forecasting & market (DEC-INT-006) ----

     Money-shaped, so OWNER and MANAGER. Every figure carries its own REAL/DEMO
     label, decided HERE and not by the screen. */
  @Get('forecast')
  @Roles('OWNER', 'MANAGER')
  forecasts() {
    return this.forecast.forecast();
  }

  /* ---- settings ---- */

  @Get('settings')
  @Roles('OWNER', 'MANAGER')
  settings() {
    return this.intelligence.settings();
  }

  /* ---- the snapshot sweep ---- */

  @Get('sweep')
  @Roles('OWNER', 'MANAGER')
  lastSweep() {
    return { last: this.automation.lastRun() };
  }

  /** it runs by itself; this is only for anyone who wants it this second */
  @Post('sweep')
  @Roles('OWNER')
  runSweep() {
    return this.automation.runNow();
  }
}
