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
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { eraseOrBury } from '../common/erase';

/*
  DEC-PRD-044 — Nature master (owner, 23 Aug 2026).

  The "nature line" is the one-line promise at the top of a product page:
  "100% Fresh Flowers". It used to be five words hardcoded in the product form
  next to a free-text box, so the sentence was retyped — and reworded — on
  every single product, and no sixth kind could ever be added.

  A kind now carries its own line. Picking it in the product form fills the
  line in; the product may still overwrite it for itself, because one bouquet
  in the fresh list might want "Cut This Morning".
*/

interface NatureDto {
  name: string;
  label: string;
  sortOrder?: number;
  isActive?: boolean;
  actorName?: string;
}

const ENTITY = 'NatureMaster';

type NatureRow = { id: string; name: string; label: string; isActive: boolean; sortOrder: number };
type NatureDelegate = {
  findMany: (a?: unknown) => Promise<NatureRow[]>;
  findFirst: (a: unknown) => Promise<NatureRow | null>;
  create: (a: unknown) => Promise<NatureRow>;
  update: (a: unknown) => Promise<NatureRow>;
  delete: (a: unknown) => Promise<unknown>;
};

@Injectable()
export class NatureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /*  ⚠️ Cast, on purpose — the same shape `isOnline` (DEC-ITM-024) and
      `canSeeCost` (DEC-ADM-012) already use in this codebase. A generated
      Prisma client that predates this model does not know `natureMaster`, so
      a machine that has not run `prisma generate` since the migration cannot
      compile the typed call. The Docker build runs generate before build, so
      the real client always has it.

      Remove the cast once every working copy has regenerated.  */
  private get rows(): NatureDelegate {
    return (this.prisma.db as unknown as { natureMaster: NatureDelegate }).natureMaster;
  }
  private get raw(): NatureDelegate {
    return (this.prisma as unknown as { natureMaster: NatureDelegate }).natureMaster;
  }

  list() {
    return this.rows.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async create(dto: NatureDto) {
    const name = dto.name?.trim();
    const label = dto.label?.trim();
    if (!name) throw new BadRequestException('A nature needs a name');
    if (!label) throw new BadRequestException('A nature needs the line the customer reads');
    const row = await this.rows.create({
      data: { name, label, sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true },
    });
    await this.log(row.id, 'CREATE', dto.actorName, `Nature "${row.name}" created`);
    return row;
  }

  async update(id: string, dto: Partial<NatureDto>) {
    await this.ensure(id);
    const row = await this.rows.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        label: dto.label?.trim(),
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    await this.log(row.id, 'UPDATE', dto.actorName, `Nature "${row.name}" updated`);
    return row;
  }

  /*  Nothing points at a nature by id — a product keeps the WORDS it was given
      (`typeText` / `natureLabel`), not a link. So removing one changes no
      product that already used it; it only stops being offered. That is the
      right shape here: the line is a sentence the shop chose, not a
      classification anything reports on.  */
  async remove(id: string, actorName = 'Admin') {
    const row = await this.rows.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Nature not found');
    await eraseOrBury(
      () => this.raw.delete({ where: { id } }),
      () => this.rows.update({ where: { id }, data: { deletedAt: new Date() } }),
      'Nature',
    );
    await this.log(id, 'DELETE', actorName, `Nature "${row.name}" deleted`);
    return { id, deleted: true };
  }

  private async ensure(id: string) {
    const r = await this.rows.findFirst({ where: { id } });
    if (!r) throw new NotFoundException('Nature not found');
  }
  private async log(id: string, action: 'CREATE' | 'UPDATE' | 'DELETE', actorName = 'Admin', label: string) {
    await this.audit.record({ entityType: ENTITY, entityId: id, action, actorName });
    await this.audit.event({ entityType: ENTITY, entityId: id, kind: 'general', label, actorName });
  }
}

@Controller('nature')
export class NatureController {
  constructor(private readonly svc: NatureService) {}

  @Get() list() {
    return this.svc.list();
  }
  @Post() create(@Body() dto: NatureDto, @Headers('x-actor-name') a?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? a });
  }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: Partial<NatureDto>, @Headers('x-actor-name') a?: string) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? a });
  }
  @Delete(':id') remove(@Param('id') id: string, @Headers('x-actor-name') a?: string) {
    return this.svc.remove(id, a ?? 'Admin');
  }
}

@Module({
  providers: [NatureService],
  controllers: [NatureController],
})
export class NatureModule {}
