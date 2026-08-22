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
import { eraseOrBury } from '../common/erase';

/*
  ITEM CATEGORY master — DEC-ITM-007.

  The WAREHOUSE tree: "Fresh Flowers → Roses", "Packaging → Ribbon".
  Deliberately NOT the storefront `Category` tree, which carries metaTitle / OG tags /
  showOnNavbar / banner. "Rose Stems" is a stockroom concept and must never reach the
  site navigation or the sitemap.

  Two levels, same shape as Category: parent → child. No SEO fields, no slug — a group
  has no landing page; it only groups rows on an admin screen and drives reports
  ("how much did we spend on packaging this month").

  It is also the answer to "Red Rose vs White Rose": those stay two separate Items
  (separate stock, separate cost, bought separately) and the group ties the family
  together — the same thing Biznify does with its "Fresh Rose" / "Chocolate" groups.

  Delete rule: BLOCKED while items are attached (same strictness as Unit) — an item
  that silently loses its group disappears from every grouped report.
*/

interface CategoryDto {
  name: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  actorName?: string;
}

const ENTITY = 'ItemCategory';

@Injectable()
export class ItemCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** flat list with counts — the admin builds the tree client-side (same as Category) */
  async list(q: { search?: string }) {
    const where: Prisma.ItemCategoryWhereInput = {};
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };
    return this.prisma.db.itemCategory.findMany({
      where,
      include: {
        _count: {
          select: {
            items: { where: { deletedAt: null } },
            children: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const g = await this.prisma.db.itemCategory.findFirst({
      where: { id },
      include: {
        _count: {
          select: {
            items: { where: { deletedAt: null } },
            children: { where: { deletedAt: null } },
          },
        },
      },
    });
    if (!g) throw new NotFoundException('Item category not found');
    return g;
  }

  async create(dto: CategoryDto) {
    const name = (dto.name ?? '').trim();
    if (!name) throw new BadRequestException('name is required');
    await this.ensureFreeName(name, dto.parentId ?? null);
    if (dto.parentId) await this.ensureNotNested(dto.parentId);

    const g = await this.prisma.db.itemCategory.create({
      data: {
        name,
        parentId: dto.parentId ?? null,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    await this.log(g.id, 'CREATE', dto.actorName, `Item category "${g.name}" created`);
    return g;
  }

  async update(id: string, dto: Partial<CategoryDto>) {
    const current = await this.prisma.db.itemCategory.findFirst({ where: { id } });
    if (!current) throw new NotFoundException('Item category not found');

    const name = dto.name === undefined ? undefined : dto.name.trim();
    if (dto.name !== undefined && !name) throw new BadRequestException('name cannot be empty');
    if (name) await this.ensureFreeName(name, dto.parentId ?? current.parentId, id);

    if (dto.parentId) {
      if (dto.parentId === id) throw new BadRequestException('A category cannot be its own parent.');
      await this.ensureNotNested(dto.parentId);
      // a group with children cannot itself become a child — two levels only
      const kids = await this.prisma.db.itemCategory.count({ where: { parentId: id } });
      if (kids > 0) {
        throw new BadRequestException(
          `"${current.name}" has sub-categories, so it cannot be moved under another group. Item categories are two levels deep.`,
        );
      }
    }

    const g = await this.prisma.db.itemCategory.update({
      where: { id },
      data: {
        name,
        parentId: dto.parentId === undefined ? undefined : dto.parentId,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    await this.log(id, 'UPDATE', dto.actorName, `Item category "${g.name}" updated`);
    return g;
  }

  async remove(id: string, actorName = 'Admin') {
    const g = await this.prisma.db.itemCategory.findFirst({
      where: { id },
      include: {
        _count: {
          select: {
            items: { where: { deletedAt: null } },
            children: { where: { deletedAt: null } },
          },
        },
      },
    });
    if (!g) throw new NotFoundException('Item category not found');

    const blockers: string[] = [];
    if (g._count.items > 0) blockers.push(`${g._count.items} item(s) are in it`);
    if (g._count.children > 0) blockers.push(`it has ${g._count.children} sub-category(s)`);
    if (blockers.length) {
      throw new BadRequestException(
        `"${g.name}" cannot be deleted — ${blockers.join(' and ')}. Move them somewhere else first.`,
      );
    }

    await eraseOrBury(
      () => this.prisma.itemCategory.delete({ where: { id } }),
      () => this.prisma.db.itemCategory.update({ where: { id }, data: { deletedAt: new Date() } }),
      'Item Category',
    );
    await this.log(id, 'DELETE', actorName, `Item category "${g.name}" deleted`);
    return { id, deleted: true };
  }

  /** two levels only — a parent must itself be top-level */
  private async ensureNotNested(parentId: string) {
    const parent = await this.prisma.db.itemCategory.findFirst({
      where: { id: parentId },
      select: { id: true, parentId: true, name: true },
    });
    if (!parent) throw new BadRequestException('That parent category does not exist.');
    if (parent.parentId) {
      throw new BadRequestException(
        `"${parent.name}" is already a sub-category. Item categories are two levels deep — pick a top-level category.`,
      );
    }
  }

  private async ensureFreeName(name: string, parentId: string | null, exceptId?: string) {
    const dupe = await this.prisma.db.itemCategory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, parentId },
      select: { id: true },
    });
    if (dupe && dupe.id !== exceptId) {
      throw new BadRequestException(`A category called "${name}" already exists here.`);
    }
  }

  private async log(
    id: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    actorName = 'Admin',
    label: string,
  ) {
    await this.audit.record({ entityType: ENTITY, entityId: id, action, actorName });
    await this.audit.event({ entityType: ENTITY, entityId: id, kind: 'general', label, actorName });
  }
}

@Controller('item-categories')
export class ItemCategoriesController {
  constructor(private readonly svc: ItemCategoriesService) {}

  @Get()
  list(@Query('search') search?: string) {
    return this.svc.list({ search });
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }
  @Post()
  create(@Body() dto: CategoryDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CategoryDto>,
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
}

@Module({
  providers: [ItemCategoriesService],
  controllers: [ItemCategoriesController],
})
export class ItemCategoriesModule {}
