import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { Roles } from '../auth/auth.guard';
import type { AuthedRequest } from '../auth/auth.guard';
import type {
  CreateReturnDto,
  CompleteReturnDto,
  ListReturnQuery,
  ReturnReasonDto,
  ReturnSettingsDto,
} from './return.dto';

@Controller('returns')
export class ReturnsController {
  constructor(private readonly svc: ReturnsService) {}

  /* static routes BEFORE :id (POS lesson) */
  @Get('analytics')
  analytics(@Query('days') days?: string) {
    return this.svc.analytics(days ? parseInt(days, 10) : 30);
  }
  @Get('reasons')
  reasons() {
    return this.svc.reasons();
  }
  @Post('reasons')
  createReason(@Body() dto: ReturnReasonDto) {
    return this.svc.createReason(dto);
  }
  @Patch('reasons/:id')
  updateReason(@Param('id') id: string, @Body() dto: ReturnReasonDto) {
    return this.svc.updateReason(id, dto);
  }
  @Roles('OWNER', 'MANAGER')
  @Delete('reasons/:id')
  deleteReason(@Param('id') id: string) {
    return this.svc.deleteReason(id);
  }

  @Get('settings')
  settings() {
    return this.svc.settings();
  }
  @Patch('settings')
  updateSettings(@Body() dto: ReturnSettingsDto) {
    return this.svc.updateSettings(dto);
  }

  @Get('eligible/:orderId')
  eligible(@Param('orderId') orderId: string) {
    return this.svc.eligibleOrder(orderId);
  }

  @Get('credit/:customerId')
  credit(@Param('customerId') customerId: string) {
    return this.svc.creditBalance(customerId);
  }

  /* list + create */
  @Get()
  list(@Query() q: ListReturnQuery) {
    return this.svc.list(q);
  }
  @Post()
  create(
    @Body() dto: CreateReturnDto,
    @Req() req: AuthedRequest,
    @Headers('x-actor-name') actor?: string,
  ) {
    /*  DEC-RTN-018 — the role decides whether credit may pass what was
        collected, so it is read off the session, not off the body.  */
    return this.svc.create({
      ...dto,
      actorName: dto.actorName ?? actor,
      actorRole: req.actor?.role,
    });
  }

  /* per-return */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }
  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.svc.timeline(id);
  }
  @Post(':id/approve')
  approve(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.approve(id, actor ?? 'Admin');
  }
  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.reject(id, actor ?? 'Admin', body?.note);
  }
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.cancel(id, actor ?? 'Admin');
  }
  @Post(':id/complete')
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteReturnDto,
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.complete(id, { ...dto, actorName: dto.actorName ?? actor });
  }
  /*  put the goods back when a completed return never reached the shelf
      (owner, 21 Aug) — guarded against a second press  */
  @Roles('OWNER', 'MANAGER')
  @Post(':id/repost-restock')
  repostRestock(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.repostRestock(id, actor ?? 'Admin');
  }
  @Roles('OWNER', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
}
