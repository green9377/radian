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

// admin-configurable brand master (DEC-PRD-008). FLAT — no parent-child (unlike Category).
// Product ↔ Brand = SINGLE FK (one product, one brand — not m2m like Tag).
// `website` + OG fields intentionally omitted (locked 20 Jul, sobuj): outbound brand
// links are a conversion leak; logo + meta* is enough for a thin brand landing page.
interface BrandDto {
  slug: string;
  name: string;
  logoUrl?: string | null;
  description?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  isFeatured?: boolean;
  sortOrder?: number;
  isActive?: boolean;
  actorName?: string;
}

const ENTITY = 'Brand';

@Injectable()
export class BrandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(q: { search?: string }) {
    const where: Prisma.BrandWhereInput = {};
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };
    return this.prisma.db.brand.findMany({
      where,
      include: {
        _count: { select: { products: { where: { deletedAt: null } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const b = await this.prisma.db.brand.findFirst({
      where: { id },
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });
    if (!b) throw new NotFoundException('Brand not found');
    return b;
  }

  async create(dto: BrandDto) {
    await this.ensureSlugFree(dto.slug);
    const b = await this.prisma.db.brand.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        logoUrl: dto.logoUrl,
        description: dto.description,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        isFeatured: dto.isFeatured,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    await this.log(b.id, 'CREATE', dto.actorName, `Brand "${b.name}" created`);
    return b;
  }

  async update(id: string, dto: Partial<BrandDto>) {
    await this.ensureExists(id);
    if (dto.slug) await this.ensureSlugFree(dto.slug, id);
    const b = await this.prisma.db.brand.update({
      where: { id },
      data: {
        slug: dto.slug,
        name: dto.name,
        logoUrl: dto.logoUrl,
        description: dto.description,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        isFeatured: dto.isFeatured,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    await this.log(b.id, 'UPDATE', dto.actorName, `Brand "${b.name}" updated`);
    return b;
  }

  // Brand is an OPTIONAL attribute (nullable FK), so unlike Category we do NOT block
  // deletion when products are attached. Instead we un-brand those products
  // (brandId → null) so nothing points at a soft-deleted brand (DEC-PRD-008).
  async remove(id: string, actorName = 'Admin') {
    const b = await this.prisma.db.brand.findFirst({
      where: { id },
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });
    if (!b) throw new NotFoundException('Brand not found');
    const attached = b._count.products;
    if (attached > 0) {
      await this.prisma.db.product.updateMany({ where: { brandId: id }, data: { brandId: null } });
    }
    await this.prisma.db.brand.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.log(id, 'DELETE', actorName, `Brand "${b.name}" deleted (soft)${attached ? ` — ${attached} product(s) un-branded` : ''}`);
    return { id, deleted: true, unbranded: attached };
  }

  private async ensureExists(id: string) {
    const b = await this.prisma.db.brand.findFirst({ where: { id }, select: { id: true } });
    if (!b) throw new NotFoundException('Brand not found');
  }
  private async ensureSlugFree(slug: string, exceptId?: string) {
    const dupe = await this.prisma.db.brand.findFirst({ where: { slug }, select: { id: true } });
    if (dupe && dupe.id !== exceptId) throw new BadRequestException(`slug "${slug}" already in use`);
  }
  private async log(id: string, action: 'CREATE' | 'UPDATE' | 'DELETE', actorName = 'Admin', label: string) {
    await this.audit.record({ entityType: ENTITY, entityId: id, action, actorName });
    await this.audit.event({ entityType: ENTITY, entityId: id, kind: 'general', label, actorName });
  }
}

@Controller('brands')
export class BrandsController {
  constructor(private readonly svc: BrandsService) {}

  @Get()
  list(@Query('search') search?: string) {
    return this.svc.list({ search });
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }
  @Post()
  create(@Body() dto: BrandDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<BrandDto>, @Headers('x-actor-name') actor?: string) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
}

@Module({
  providers: [BrandsService],
  controllers: [BrandsController],
})
export class BrandsModule {}
