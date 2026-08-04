import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { OffersService } from './offers.service';
import { Roles } from '../auth/auth.guard';
import type {
  OfferWriteDto,
  ListOfferQuery,
  QuoteDto,
  OfferSettingsDto,
} from './offer.dto';

/*  ⚠ Nest route order: every static path (analytics/approvals/quote/settings)
    MUST be declared ABOVE ':id' or Nest will treat the word as an id. */
@Controller('offers')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Get()
  list(@Query() q: ListOfferQuery) {
    return this.offers.list(q);
  }

  @Get('analytics')
  analytics(@Query('days') days?: string) {
    return this.offers.analytics(days ? parseInt(days, 10) || 30 : 30);
  }

  @Get('approvals')
  approvals() {
    return this.offers.approvalsQueue();
  }

  @Get('settings')
  settings() {
    return this.offers.settings();
  }

  @Roles('OWNER', 'MANAGER')
  @Patch('settings')
  updateSettings(@Body() dto: OfferSettingsDto) {
    return this.offers.updateSettings(dto);
  }

  /** OFR-R10 preview — admin form (and later the storefront) both use this. */
  @Post('quote')
  quote(@Body() dto: QuoteDto) {
    return this.offers.quote(dto);
  }

  @Roles('OWNER', 'MANAGER')
  @Post()
  create(@Body() dto: OfferWriteDto) {
    return this.offers.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.offers.findOne(id);
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.offers.timeline(id);
  }

  @Get(':id/redemptions')
  redemptions(@Param('id') id: string) {
    return this.offers.redemptions(id);
  }

  @Roles('OWNER', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: OfferWriteDto) {
    return this.offers.update(id, dto);
  }

  @Roles('OWNER', 'MANAGER')
  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() b: { actorName?: string }) {
    return this.offers.approve(id, b?.actorName ?? 'Admin');
  }

  @Roles('OWNER', 'MANAGER')
  @Post(':id/decline')
  decline(@Param('id') id: string, @Body() b: { actorName?: string; note?: string }) {
    return this.offers.rejectToDraft(id, b?.actorName ?? 'Admin', b?.note);
  }

  @Roles('OWNER', 'MANAGER')
  @Post(':id/pause')
  pause(@Param('id') id: string, @Body() b: { actorName?: string }) {
    return this.offers.pause(id, b?.actorName ?? 'Admin');
  }

  @Roles('OWNER', 'MANAGER')
  @Post(':id/resume')
  resume(@Param('id') id: string, @Body() b: { actorName?: string }) {
    return this.offers.resume(id, b?.actorName ?? 'Admin');
  }

  @Roles('OWNER', 'MANAGER')
  @Post(':id/archive')
  archive(@Param('id') id: string, @Body() b: { actorName?: string }) {
    return this.offers.archive(id, b?.actorName ?? 'Admin');
  }

  @Roles('OWNER', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @Query('actorName') actorName?: string) {
    return this.offers.remove(id, actorName ?? 'Admin');
  }
}
