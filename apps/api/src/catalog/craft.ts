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
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

/*
  Craft points — the three "why buy from us" cards. Owner decision, 31 Jul 2026.

  Written once on a CATEGORY, overridden on a PRODUCT that has its own story.
  Same ownership rule as `Bundle`, on purpose: one inheritance idea on this
  page rather than two.
*/

interface CraftDto {
  categoryId?: string | null;
  productId?: string | null;
  icon: string;
  title: string;
  text: string;
  sortOrder?: number;
  isActive?: boolean;
  actorName?: string;
}

@Injectable()
export class CraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(q: { categoryId?: string; productId?: string }) {
    if (!q.categoryId && !q.productId) {
      throw new BadRequestException('categoryId or productId is required');
    }
    return this.prisma.db.craftPoint.findMany({
      where: q.productId ? { productId: q.productId } : { categoryId: q.categoryId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        categoryId: true,
        productId: true,
        icon: true,
        title: true,
        text: true,
        sortOrder: true,
        isActive: true,
      },
    });
  }

  async create(dto: CraftDto) {
    const owner = this.owner(dto);
    const c = await this.prisma.db.craftPoint.create({
      data: {
        ...owner,
        icon: dto.icon,
        /*  Created empty on purpose — the owner adds a card and then writes in
            it, which is how the screen reads. The STOREFRONT is what refuses to
            draw a half-filled one, so an unfinished card costs nothing but a
            warning line on the admin screen.  */
        title: dto.title ?? '',
        text: dto.text ?? '',
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.log(c.id, 'CREATE', dto.actorName, 'Craft card created');
    return c;
  }

  async update(id: string, dto: Partial<CraftDto>) {
    await this.ensure(id);
    return this.prisma.db.craftPoint.update({
      where: { id },
      data: {
        icon: dto.icon,
        title: dto.title,
        text: dto.text,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string, actorName = 'Admin') {
    await this.ensure(id);
    await this.prisma.db.craftPoint.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.log(id, 'DELETE', actorName, 'Craft card deleted (soft)');
    return { id, deleted: true };
  }

  private owner(dto: CraftDto) {
    const categoryId = dto.categoryId || null;
    const productId = dto.productId || null;
    if (Boolean(categoryId) === Boolean(productId)) {
      throw new BadRequestException(
        'A craft card belongs either to a category (the default for everything in it) or to one product — not both, and not neither.',
      );
    }
    return { categoryId, productId };
  }

  private async ensure(id: string) {
    const row = await this.prisma.db.craftPoint.findFirst({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('craft point not found');
  }

  private async log(
    entityId: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    actorName = 'Admin',
    label: string,
  ) {
    await this.audit.record({ entityType: 'CraftPoint', entityId, action, actorName });
    await this.audit.event({
      entityType: 'CraftPoint',
      entityId,
      kind: 'general',
      label,
      actorName,
    });
  }
}

@Controller('craft-points')
export class CraftController {
  constructor(private readonly svc: CraftService) {}

  @Get()
  list(@Query('categoryId') categoryId?: string, @Query('productId') productId?: string) {
    return this.svc.list({ categoryId, productId });
  }

  @Post()
  create(@Body() dto: CraftDto, @Headers('x-actor-name') a?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? a });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CraftDto>) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') a?: string) {
    return this.svc.remove(id, a ?? 'Admin');
  }
}

@Module({ providers: [CraftService], controllers: [CraftController] })
export class CraftModule {}
