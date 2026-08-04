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
import { VariantKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

// colour/flavour sibling group (DEC-PRD-003) — Product.variantGroupId এতে connect করে
interface VariantGroupDto {
  kind: VariantKind; // COLOUR | FLAVOUR
  label: string;
  actorName?: string;
}

const ENTITY = 'VariantGroup';

@Injectable()
export class VariantGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.db.variantGroup.findMany({
      include: {
        products: {
          where: { deletedAt: null },
          select: { id: true, name: true, slug: true, variantLabel: true, variantSwatch: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: VariantGroupDto) {
    if (dto.kind !== VariantKind.COLOUR && dto.kind !== VariantKind.FLAVOUR)
      throw new BadRequestException('kind must be COLOUR or FLAVOUR');
    const g = await this.prisma.db.variantGroup.create({
      data: { kind: dto.kind, label: dto.label },
    });
    await this.log(g.id, 'CREATE', dto.actorName, `VariantGroup "${g.label}" created`);
    return g;
  }

  async update(id: string, dto: Partial<VariantGroupDto>) {
    await this.ensureExists(id);
    const g = await this.prisma.db.variantGroup.update({
      where: { id },
      data: { kind: dto.kind, label: dto.label },
    });
    await this.log(g.id, 'UPDATE', dto.actorName, `VariantGroup "${g.label}" updated`);
    return g;
  }

  async remove(id: string, actorName = 'Admin') {
    const g = await this.prisma.db.variantGroup.findFirst({
      where: { id },
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });
    if (!g) throw new NotFoundException('VariantGroup not found');
    if (g._count.products > 0)
      throw new BadRequestException('variant group still linked to products — unlink first');
    await this.prisma.db.variantGroup.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.log(id, 'DELETE', actorName, `VariantGroup "${g.label}" deleted (soft)`);
    return { id, deleted: true };
  }

  private async ensureExists(id: string) {
    const g = await this.prisma.db.variantGroup.findFirst({ where: { id }, select: { id: true } });
    if (!g) throw new NotFoundException('VariantGroup not found');
  }
  private async log(id: string, action: 'CREATE' | 'UPDATE' | 'DELETE', actorName = 'Admin', label: string) {
    await this.audit.record({ entityType: ENTITY, entityId: id, action, actorName });
    await this.audit.event({ entityType: ENTITY, entityId: id, kind: 'general', label, actorName });
  }
}

@Controller('variant-groups')
export class VariantGroupsController {
  constructor(private readonly svc: VariantGroupsService) {}

  @Get()
  list() {
    return this.svc.list();
  }
  @Post()
  create(@Body() dto: VariantGroupDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<VariantGroupDto>, @Headers('x-actor-name') actor?: string) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
}

@Module({
  providers: [VariantGroupsService],
  controllers: [VariantGroupsController],
})
export class VariantGroupsModule {}
