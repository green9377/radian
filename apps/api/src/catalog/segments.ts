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
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

// CRM segment master — admin-configurable, many-to-many with Customer (DEC-CUS-001)
interface SegmentDto {
  slug: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  actorName?: string;
}

const ENTITY = 'Segment';

@Injectable()
export class SegmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(q: { search?: string }) {
    const where: Prisma.SegmentWhereInput = {};
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };
    return this.prisma.db.segment.findMany({
      where,
      include: { _count: { select: { customers: { where: { deletedAt: null } } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: SegmentDto) {
    await this.ensureSlugFree(dto.slug);
    const s = await this.prisma.db.segment.create({
      data: { slug: dto.slug, name: dto.name, sortOrder: dto.sortOrder, isActive: dto.isActive },
    });
    await this.log(s.id, 'CREATE', dto.actorName, `Segment "${s.name}" created`);
    return s;
  }

  async update(id: string, dto: Partial<SegmentDto>) {
    await this.ensureExists(id);
    if (dto.slug) await this.ensureSlugFree(dto.slug, id);
    const s = await this.prisma.db.segment.update({
      where: { id },
      data: { slug: dto.slug, name: dto.name, sortOrder: dto.sortOrder, isActive: dto.isActive },
    });
    await this.log(s.id, 'UPDATE', dto.actorName, `Segment "${s.name}" updated`);
    return s;
  }

  async remove(id: string, actorName = 'Admin') {
    const s = await this.prisma.db.segment.findFirst({ where: { id } });
    if (!s) throw new NotFoundException('Segment not found');
    await this.prisma.db.segment.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.log(id, 'DELETE', actorName, `Segment "${s.name}" deleted (soft)`);
    return { id, deleted: true };
  }

  private async ensureExists(id: string) {
    const s = await this.prisma.db.segment.findFirst({ where: { id }, select: { id: true } });
    if (!s) throw new NotFoundException('Segment not found');
  }
  private async ensureSlugFree(slug: string, exceptId?: string) {
    const dupe = await this.prisma.db.segment.findFirst({ where: { slug }, select: { id: true } });
    if (dupe && dupe.id !== exceptId) throw new BadRequestException(`slug "${slug}" already in use`);
  }
  private async log(id: string, action: 'CREATE' | 'UPDATE' | 'DELETE', actorName = 'Admin', label: string) {
    await this.audit.record({ entityType: ENTITY, entityId: id, action, actorName });
    await this.audit.event({ entityType: ENTITY, entityId: id, kind: 'general', label, actorName });
  }
}

@Controller('segments')
export class SegmentsController {
  constructor(private readonly svc: SegmentsService) {}

  @Get()
  list(@Query('search') search?: string) {
    return this.svc.list({ search });
  }
  @Post()
  create(@Body() dto: SegmentDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<SegmentDto>, @Headers('x-actor-name') actor?: string) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
}

@Module({
  providers: [SegmentsService],
  controllers: [SegmentsController],
})
export class SegmentsModule {}
