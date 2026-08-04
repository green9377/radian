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

// online sub-channel master — admin-configurable + custom (DEC-SAL-001)
interface ChannelDto {
  slug: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  actorName?: string;
}

const ENTITY = 'Channel';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(q: { search?: string }) {
    const where: Prisma.ChannelWhereInput = {};
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };
    return this.prisma.db.channel.findMany({
      where,
      include: { _count: { select: { orders: { where: { deletedAt: null } } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: ChannelDto) {
    await this.ensureSlugFree(dto.slug);
    const c = await this.prisma.db.channel.create({
      data: { slug: dto.slug, name: dto.name, sortOrder: dto.sortOrder, isActive: dto.isActive },
    });
    await this.log(c.id, 'CREATE', dto.actorName, `Channel "${c.name}" created`);
    return c;
  }

  async update(id: string, dto: Partial<ChannelDto>) {
    await this.ensureExists(id);
    if (dto.slug) await this.ensureSlugFree(dto.slug, id);
    const c = await this.prisma.db.channel.update({
      where: { id },
      data: { slug: dto.slug, name: dto.name, sortOrder: dto.sortOrder, isActive: dto.isActive },
    });
    await this.log(c.id, 'UPDATE', dto.actorName, `Channel "${c.name}" updated`);
    return c;
  }

  async remove(id: string, actorName = 'Admin') {
    const c = await this.prisma.db.channel.findFirst({ where: { id } });
    if (!c) throw new NotFoundException('Channel not found');
    await this.prisma.db.channel.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.log(id, 'DELETE', actorName, `Channel "${c.name}" deleted (soft)`);
    return { id, deleted: true };
  }

  private async ensureExists(id: string) {
    const c = await this.prisma.db.channel.findFirst({ where: { id }, select: { id: true } });
    if (!c) throw new NotFoundException('Channel not found');
  }
  private async ensureSlugFree(slug: string, exceptId?: string) {
    const dupe = await this.prisma.db.channel.findFirst({ where: { slug }, select: { id: true } });
    if (dupe && dupe.id !== exceptId) throw new BadRequestException(`slug "${slug}" already in use`);
  }
  private async log(id: string, action: 'CREATE' | 'UPDATE' | 'DELETE', actorName = 'Admin', label: string) {
    await this.audit.record({ entityType: ENTITY, entityId: id, action, actorName });
    await this.audit.event({ entityType: ENTITY, entityId: id, kind: 'general', label, actorName });
  }
}

@Controller('channels')
export class ChannelsController {
  constructor(private readonly svc: ChannelsService) {}

  @Get()
  list(@Query('search') search?: string) {
    return this.svc.list({ search });
  }
  @Post()
  create(@Body() dto: ChannelDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<ChannelDto>, @Headers('x-actor-name') actor?: string) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
}

@Module({
  providers: [ChannelsService],
  controllers: [ChannelsController],
})
export class ChannelsModule {}
