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

// tag master — each tag belongs to a TagGroup and may carry an image.
// Many-to-many with Product. DEC-PRD-002 rev (dynamic groups + per-tag image).
interface TagDto {
  slug: string;
  name: string;
  groupId: string;
  imageUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  /** show this tag's card on the homepage — see schema for why it is not isActive */
  isFeatured?: boolean;
  actorName?: string;
}

const ENTITY = 'Tag';

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(q: { groupId?: string; search?: string }) {
    const where: Prisma.TagWhereInput = {};
    if (q.groupId) where.groupId = q.groupId;
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };
    return this.prisma.db.tag.findMany({
      where,
      include: {
        group: { select: { id: true, name: true } },
        _count: { select: { products: { where: { deletedAt: null } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: TagDto) {
    if (!dto.groupId) throw new BadRequestException('groupId is required');
    await this.ensureGroup(dto.groupId);
    await this.ensureSlugFree(dto.groupId, dto.slug);
    const t = await this.prisma.db.tag.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        groupId: dto.groupId,
        imageUrl: dto.imageUrl,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
        isFeatured: dto.isFeatured,
      },
    });
    await this.log(t.id, 'CREATE', dto.actorName, `Tag "${t.name}" created`);
    return t;
  }

  async update(id: string, dto: Partial<TagDto>) {
    const existing = await this.prisma.db.tag.findFirst({ where: { id }, select: { id: true, groupId: true } });
    if (!existing) throw new NotFoundException('Tag not found');
    if (dto.groupId) await this.ensureGroup(dto.groupId);
    // slug must stay unique within its (new or current) group
    const groupId = dto.groupId ?? existing.groupId ?? null;
    if (dto.slug) await this.ensureSlugFree(groupId, dto.slug, id);
    const t = await this.prisma.db.tag.update({
      where: { id },
      data: {
        slug: dto.slug,
        name: dto.name,
        groupId: dto.groupId,
        imageUrl: dto.imageUrl,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
        isFeatured: dto.isFeatured,
      },
    });
    await this.log(t.id, 'UPDATE', dto.actorName, `Tag "${t.name}" updated`);
    return t;
  }

  // Tag DELETE is never blocked by product usage (unlike Category) — soft-delete anyway.
  async remove(id: string, actorName = 'Admin') {
    const t = await this.prisma.db.tag.findFirst({ where: { id } });
    if (!t) throw new NotFoundException('Tag not found');
    await this.prisma.db.tag.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.log(id, 'DELETE', actorName, `Tag "${t.name}" deleted (soft)`);
    return { id, deleted: true };
  }

  private async ensureGroup(groupId: string) {
    const g = await this.prisma.db.tagGroup.findFirst({ where: { id: groupId }, select: { id: true } });
    if (!g) throw new BadRequestException('tag group not found');
  }
  private async ensureSlugFree(groupId: string | null, slug: string, exceptId?: string) {
    const dupe = await this.prisma.db.tag.findFirst({ where: { groupId, slug }, select: { id: true } });
    if (dupe && dupe.id !== exceptId) throw new BadRequestException(`slug "${slug}" already in use in this group`);
  }
  private async log(id: string, action: 'CREATE' | 'UPDATE' | 'DELETE', actorName = 'Admin', label: string) {
    await this.audit.record({ entityType: ENTITY, entityId: id, action, actorName });
    await this.audit.event({ entityType: ENTITY, entityId: id, kind: 'general', label, actorName });
  }
}

@Controller('tags')
export class TagsController {
  constructor(private readonly svc: TagsService) {}

  @Get()
  list(@Query('groupId') groupId?: string, @Query('search') search?: string) {
    return this.svc.list({ groupId, search });
  }
  @Post()
  create(@Body() dto: TagDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<TagDto>, @Headers('x-actor-name') actor?: string) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
}

@Module({
  providers: [TagsService],
  controllers: [TagsController],
})
export class TagsModule {}
