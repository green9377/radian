import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.guard';
import { AuditReadService } from './audit-read.service';

/*
  AUDIT — read only, and OWNER only.

  Read only because an audit trail somebody can edit is decoration. There is no
  POST, PATCH or DELETE anywhere in this file, and that is the point.

  OWNER only because this is the record that would catch a manager. Handing the
  accountability log to the people it holds accountable defeats it. A MANAGER
  still sees every per-record timeline inside their own module — what they do
  not get is the one screen that shows everything anybody did.

  ⚠️ ROUTE ORDER: `stats`, `facets`, `backups`, `activity` are static and must
  stay above `entity/:type/:id`.
*/
@Controller('audit')
@Roles('OWNER')
export class AuditController {
  constructor(private readonly audit: AuditReadService) {}

  @Get('stats')
  stats() {
    return this.audit.stats();
  }

  @Get('facets')
  facets() {
    return this.audit.facets();
  }

  @Get('backups')
  backups(@Query('limit') limit?: string) {
    return this.audit.backups(limit ? parseInt(limit, 10) : 30);
  }

  @Get('activity')
  activity(@Query() q: { days?: string; kind?: string }) {
    return this.audit.activity(q);
  }

  @Get('entity/:type/:id')
  forEntity(@Param('type') type: string, @Param('id') id: string) {
    return this.audit.forEntity(type, id);
  }

  @Get()
  list(
    @Query()
    q: {
      entityType?: string;
      action?: string;
      actor?: string;
      moneyOnly?: string;
      search?: string;
      from?: string;
      to?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    return this.audit.list(q);
  }
}
