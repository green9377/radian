import { ensureSingleton } from '../common/singleton';
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
} from '@nestjs/common';
import { TagDisplayStyle } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { eraseOrBury } from '../common/erase';

// dynamic tag-group master. Occasions & Recipients are seeded system groups
// (isSystem = true, cannot be deleted). Supersedes the fixed TagType enum. DEC-PRD-002 rev.
interface TagGroupDto {
  slug: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  isSystem?: boolean;
  displayStyle?: TagDisplayStyle; // CHIP | CARD
  /** is this one of the homepage tabs — separate from displayStyle, which is only how it draws */
  isFeatured?: boolean;
  actorName?: string;
}

const ENTITY = 'TagGroup';

// the two built-in groups + the legacy TagType they absorb during init/backfill
const SYSTEM_GROUPS = [
  { slug: 'occasions', name: 'Occasions', displayStyle: TagDisplayStyle.CHIP, legacyType: 'OCCASION' as const },
  { slug: 'recipients', name: 'Recipients', displayStyle: TagDisplayStyle.CARD, legacyType: 'RECIPIENT' as const },
];

@Injectable()
export class TagGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.db.tagGroup.findMany({
      include: { _count: { select: { tags: { where: { deletedAt: null } } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: TagGroupDto) {
    await this.ensureSlugFree(dto.slug);
    const g = await this.prisma.db.tagGroup.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
        isSystem: dto.isSystem ?? false,
        displayStyle: dto.displayStyle ?? TagDisplayStyle.CHIP,
        isFeatured: dto.isFeatured,
      },
    });
    await this.log(g.id, 'CREATE', dto.actorName, `Tag group "${g.name}" created`);
    return g;
  }

  async update(id: string, dto: Partial<TagGroupDto>) {
    await this.ensureExists(id);
    if (dto.slug) await this.ensureSlugFree(dto.slug, id);
    const g = await this.prisma.db.tagGroup.update({
      where: { id },
      data: {
        slug: dto.slug,
        name: dto.name,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
        displayStyle: dto.displayStyle,
        isFeatured: dto.isFeatured,
        // isSystem is intentionally NOT patchable via update — set only at seed time
      },
    });
    await this.log(g.id, 'UPDATE', dto.actorName, `Tag group "${g.name}" updated`);
    return g;
  }

  // delete a custom group → cascades a soft-delete to its tags (matches the admin UX).
  async remove(id: string, actorName = 'Admin') {
    const g = await this.prisma.db.tagGroup.findFirst({ where: { id } });
    if (!g) throw new NotFoundException('Tag group not found');
    if (g.isSystem) throw new BadRequestException('system group (Occasions / Recipients) cannot be deleted');
    await this.prisma.db.tag.updateMany({ where: { groupId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    await eraseOrBury(
      () => this.prisma.tagGroup.delete({ where: { id } }),
      () => this.prisma.db.tagGroup.update({ where: { id }, data: { deletedAt: new Date() } }),
      'Tag Group',
    );
    await this.log(id, 'DELETE', actorName, `Tag group "${g.name}" deleted (soft, with its tags)`);
    return { id, deleted: true };
  }

  // idempotent setup: ensure the two system groups exist, and pull any legacy
  // (ungrouped) tags into the matching group by their old OCCASION/RECIPIENT type.
  async init(actorName = 'System') {
    for (let i = 0; i < SYSTEM_GROUPS.length; i++) {
      const s = SYSTEM_GROUPS[i];
      /* CAT-REV-1 (30 Jul) — `TagGroup.slug` is @unique and this was `findFirst →
         create`, the shape `common/singleton.ts` exists to kill. `init()` is called to
         set the screen up, so in dev a React effect fires it twice on mount and one of
         the two 500s. Sixth of seven such rows found by the 30 Jul sweep; every one was
         missed on 29 Jul because that pass looked for `*Setting` accessors, i.e. the
         lesson was applied to the SHAPE and not to the HAZARD — any lazily-created row
         behind a @unique column. */
      const before = await this.prisma.db.tagGroup.findFirst({ where: { slug: s.slug } });
      const g = await ensureSingleton(
        () => this.prisma.db.tagGroup.findFirst({ where: { slug: s.slug } }),
        () => this.prisma.db.tagGroup.create({
          data: { slug: s.slug, name: s.name, sortOrder: i, isActive: true, isSystem: true, displayStyle: s.displayStyle },
        }),
      );
      if (!before) await this.log(g.id, 'CREATE', actorName, `System group "${g.name}" created`);
      await this.prisma.db.tag.updateMany({ where: { groupId: null, type: s.legacyType }, data: { groupId: g.id } });
    }
    return this.list();
  }

  private async ensureExists(id: string) {
    const g = await this.prisma.db.tagGroup.findFirst({ where: { id }, select: { id: true } });
    if (!g) throw new NotFoundException('Tag group not found');
  }
  private async ensureSlugFree(slug: string, exceptId?: string) {
    const dupe = await this.prisma.db.tagGroup.findFirst({ where: { slug }, select: { id: true } });
    if (dupe && dupe.id !== exceptId) throw new BadRequestException(`group slug "${slug}" already in use`);
  }
  private async log(id: string, action: 'CREATE' | 'UPDATE' | 'DELETE', actorName = 'Admin', label: string) {
    await this.audit.record({ entityType: ENTITY, entityId: id, action, actorName });
    await this.audit.event({ entityType: ENTITY, entityId: id, kind: 'general', label, actorName });
  }
}

@Controller('tag-groups')
export class TagGroupsController {
  constructor(private readonly svc: TagGroupsService) {}

  @Get()
  list() {
    return this.svc.list();
  }
  // POST /tag-groups/init — declared before POST /tag-groups so it isn't shadowed
  @Post('init')
  init(@Headers('x-actor-name') actor?: string) {
    return this.svc.init(actor ?? 'System');
  }
  @Post()
  create(@Body() dto: TagGroupDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<TagGroupDto>, @Headers('x-actor-name') actor?: string) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
}

@Module({
  providers: [TagGroupsService],
  controllers: [TagGroupsController],
})
export class TagGroupsModule {}
