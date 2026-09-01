import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Put, Req } from '@nestjs/common';
import { OutboundBreachAction, OutboundLimitMetric, OutboundLimitScope } from '@prisma/client';

import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { OutboundGuard } from '../common/outbound-guard';
import { OutboundSettingsService } from '../common/outbound-settings.service';

/*
  Administration → Outbound safety.

  Everything here is OWNER-only, and the three that change the shop's ability
  to speak also re-confirm the person with their PIN — the same PIN the money
  screens use (AuthService.checkPin), not a second mechanism.

  ⚠️ WHY TURNING THE KILL SWITCH *OFF* NEEDS THE PIN AND A REASON.
  Silencing the shop is cautious; letting it speak again is the act that can
  do damage, and it is the one somebody will want explained afterwards. So the
  reason is required, stored, and audited (owner, 2 Sep 2026).

  Turning the AI on and off is deliberately NOT here: that stays an ordinary
  authorised setting change on the inbox screen, with a full before → after
  audit. Making it harder to switch AI OFF would be exactly the wrong shape.
*/

interface PinBody {
  pin?: string;
  reason?: string;
  confirm?: boolean;
}

@Controller('administration/outbound')
export class OutboundLimitsController {
  constructor(
    private readonly settings: OutboundSettingsService,
    private readonly guard: OutboundGuard,
    private readonly auth: AuthService,
  ) {}

  private actor(req: AuthedRequest) {
    return { id: req.actor?.id, name: req.actor?.name ?? 'unknown' };
  }

  private async requirePin(req: AuthedRequest, pin?: string) {
    const id = req.actor?.id;
    if (!id) throw new ForbiddenException('Please sign in again');
    const ok = await this.auth.checkPin(id, pin);
    if (!ok) throw new ForbiddenException('That PIN is not right');
  }

  /** The rules in force, what they stopped, and both switches. */
  @Get()
  status() {
    return this.guard.status();
  }

  @Put('limits')
  @Roles('OWNER')
  async setLimit(
    @Req() req: AuthedRequest,
    @Body()
    dto: PinBody & {
      scope?: OutboundLimitScope;
      key?: string;
      metric?: OutboundLimitMetric;
      windowMinutes?: number;
      value?: number;
      onBreach?: OutboundBreachAction;
    },
  ) {
    await this.requirePin(req, dto.pin);
    if (!dto.scope || !dto.metric) throw new BadRequestException('scope and metric are required');
    if (typeof dto.value !== 'number' || typeof dto.windowMinutes !== 'number')
      throw new BadRequestException('value and windowMinutes are required');

    const out = await this.settings.setLimit(
      {
        scope: dto.scope,
        key: dto.key ?? '',
        metric: dto.metric,
        windowMinutes: dto.windowMinutes,
        value: dto.value,
        onBreach: dto.onBreach ?? OutboundBreachAction.TRIP,
      },
      this.actor(req),
    );

    /*  Said out loud rather than silently corrected: an administrator who
        typed 99,999 must learn that the boundary exists, or they will believe
        the shop is configured in a way it is not.  */
    return {
      ...out.stored,
      clampedByHardBoundary: out.clamped,
      note: out.clamped
        ? 'Stored inside the hard safety boundary — the value you asked for was outside it.'
        : undefined,
    };
  }

  /** Stops EVERYTHING, escalation SMS included. A person is choosing silence. */
  @Post('stop')
  @Roles('OWNER')
  async stop(@Req() req: AuthedRequest, @Body() dto: PinBody) {
    const reason = (dto.reason ?? '').trim();
    if (!reason) throw new BadRequestException('Say why, so the history can explain itself');
    await this.settings.stopAll(reason, this.actor(req));
    return this.guard.status();
  }

  /** OWNER + PIN + an explicit confirmation + a reason. */
  @Post('resume')
  @Roles('OWNER')
  async resume(@Req() req: AuthedRequest, @Body() dto: PinBody) {
    const reason = (dto.reason ?? '').trim();
    if (!reason) throw new BadRequestException('Say why the shop may speak again');
    if (dto.confirm !== true)
      throw new BadRequestException('Confirm that outbound messages should start again');
    await this.requirePin(req, dto.pin);
    await this.settings.resumeAll(reason, this.actor(req));
    return this.guard.status();
  }

  /** Never automatic — see outbound-settings.service.ts. */
  @Post('reset-breaker')
  @Roles('OWNER')
  async resetBreaker(@Req() req: AuthedRequest, @Body() dto: PinBody) {
    await this.requirePin(req, dto.pin);
    await this.settings.resetBreaker(this.actor(req));
    return this.guard.status();
  }
}
