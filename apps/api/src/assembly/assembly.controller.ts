import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.guard';
import { AssemblyService } from './assembly.service';
import type {
  ProductionFinishDto,
  ProductionStartDto,
  ProductionTransferDto,
  TemplateWriteDto,
} from './assembly.dto';

/*
  Assembly v2 — HTTP surface. RADIAN_ASSEMBLY_MODULE_ARCHITECTURE.md
  (redesign 23 Jul 2026, DEC-ASM-011…016).

  ⚠️ ROUTE ORDER: static paths above :id routes — the usual Nest trap.
  Productions are never edited after transfer; CANCELLED returns stock.
*/
@Controller('assembly')
export class AssemblyController {
  constructor(private readonly svc: AssemblyService) {}

  @Get('overview')
  overview() {
    return this.svc.overview();
  }

  @Get('wastage')
  wastage(@Query('days') days?: string) {
    return this.svc.wastageReport(parseInt(days ?? '30', 10) || 30);
  }

  /* ---- templates (DEC-ASM-011 — never touch stock) ---- */

  @Get('templates')
  listTemplates() {
    return this.svc.listTemplates();
  }

  @Post('templates')
  createTemplate(@Body() dto: TemplateWriteDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.createTemplate({ ...dto, actorName: dto.actorName ?? actor });
  }

  @Patch('templates/:id')
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: TemplateWriteDto,
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.updateTemplate(id, { ...dto, actorName: dto.actorName ?? actor });
  }

  @Roles('OWNER', 'MANAGER')
  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.deleteTemplate(id, actor ?? 'Admin');
  }

  /* ---- productions (pipeline) ---- */

  @Get('productions')
  listProductions(@Query('status') status?: string, @Query('take') take?: string) {
    return this.svc.listProductions(status || undefined, parseInt(take ?? '100', 10) || 100);
  }

  @Post('productions')
  startProduction(@Body() dto: ProductionStartDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.startProduction({ ...dto, actorName: dto.actorName ?? actor });
  }

  @Get('productions/:id')
  getProduction(@Param('id') id: string) {
    return this.svc.getProduction(id);
  }

  @Post('productions/:id/finish')
  finishProduction(
    @Param('id') id: string,
    @Body() dto: ProductionFinishDto,
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.finishProduction(id, { ...dto, actorName: dto.actorName ?? actor });
  }

  @Post('productions/:id/transfer')
  transferProduction(
    @Param('id') id: string,
    @Body() dto: ProductionTransferDto,
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.transferProduction(id, { ...dto, actorName: dto.actorName ?? actor });
  }

  @Post('productions/:id/cancel')
  cancelProduction(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.cancelProduction(id, actor ?? 'Admin');
  }
}
