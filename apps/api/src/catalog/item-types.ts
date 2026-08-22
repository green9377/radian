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
  OnModuleInit,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ItemType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { claimBuried } from '../common/revive-buried';
import { eraseOrBury } from '../common/erase';

/*
  ITEM TYPE master — DEC-ITM-017 (owner's ruling, 21 Jul: "type custom make korar option
  obossoi thakbe").

  The tension this model resolves:

    · Every business rule in the Item module branches on the TYPE. ITM-R03 refuses a
      recipe on a RAW item. ITM-R05 forces a SERVICE to be non-stock-tracked. If the
      owner could invent a sixth behaviour by typing a word into a box, none of those
      rules could be written.
    · But the owner's vocabulary is his own. "Dry Flower", "Imported Chocolate",
      "Rental Prop" are real distinctions in his shop and the five English words we
      picked are not enough.

  So: `Item.itemType` stays a fixed enum and remains the ONLY thing rules read. This
  table is the LABEL layer on top. Five rows are seeded with isSystem = true — they
  cannot be renamed into something else's behaviour, cannot change behaviour, cannot be
  deleted. Every custom row the owner adds must pick one of the five behaviours, and
  that behaviour is copied onto the Item when it is saved.

  Deleting: blocked while items point at it, same as Unit and ItemCategory. A type that
  silently vanishes takes its items out of every grouped report.
*/

interface TypeDto {
  name: string;
  behaviour?: ItemType;
  colour?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  actorName?: string;
}

const ENTITY = 'ItemTypeMaster';

/** the five, in the order they should appear on screen */
const SYSTEM: { name: string; behaviour: ItemType; colour: string }[] = [
  { name: 'Raw material', behaviour: 'RAW', colour: '#0e8f74' },
  { name: 'Finished', behaviour: 'FINISHED', colour: '#8b21c9' },
  { name: 'Packaging', behaviour: 'PACKAGING', colour: '#b5642f' },
  { name: 'Consumable', behaviour: 'CONSUMABLE', colour: '#8a6d1f' },
  { name: 'Service', behaviour: 'SERVICE', colour: '#2563a8' },
];

@Injectable()
export class ItemTypesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* The five must exist before anything can reference them, and they must survive a
     fresh database. Seeding on boot rather than in a migration means it also self-heals
     if someone soft-deletes one by hand. */
  async onModuleInit() {
    try {
      for (const [i, s] of SYSTEM.entries()) {
        const found = await this.prisma.itemTypeMaster.findUnique({ where: { name: s.name } });
        if (!found) {
          await this.prisma.itemTypeMaster.create({
            data: { ...s, isSystem: true, sortOrder: i },
          });
        } else if (!found.isSystem || found.deletedAt || found.behaviour !== s.behaviour) {
          await this.prisma.itemTypeMaster.update({
            where: { id: found.id },
            data: { isSystem: true, deletedAt: null, behaviour: s.behaviour, sortOrder: i },
          });
        }
      }
    } catch {
      /* table not pushed yet — the app must still boot so the dev route can fix it */
    }
  }

  async list(q: { search?: string; behaviour?: ItemType }) {
    const where: Prisma.ItemTypeMasterWhereInput = {};
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };
    if (q.behaviour) where.behaviour = q.behaviour;
    return this.prisma.db.itemTypeMaster.findMany({
      where,
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: TypeDto) {
    const name = (dto.name ?? '').trim();
    if (!name) throw new BadRequestException('name is required');
    if (!dto.behaviour) {
      throw new BadRequestException(
        'Pick which of the five built-in types this one behaves like — that is what the stock and costing rules read.',
      );
    }
    await this.ensureFreeName(name);

    /*  a removed type still holds its @unique name — revive it (revive-buried.ts)  */
    const buried = await claimBuried(
      this.prisma.itemTypeMaster,
      { name: { equals: name, mode: 'insensitive' } },
      'name',
      name,
    );
    if (buried) {
      const revived = await this.prisma.itemTypeMaster.update({
        where: { id: buried.id },
        data: {
          deletedAt: null,
          name,
          behaviour: dto.behaviour,
          colour: dto.colour ?? null,
          isActive: dto.isActive ?? true,
        },
      });
      await this.log(buried.id, 'UPDATE', dto.actorName, `Item type "${name}" restored`);
      return revived;
    }

    const max = await this.prisma.db.itemTypeMaster.aggregate({ _max: { sortOrder: true } });
    const t = await this.prisma.db.itemTypeMaster.create({
      data: {
        name,
        behaviour: dto.behaviour,
        colour: dto.colour ?? null,
        isSystem: false,
        sortOrder: dto.sortOrder ?? (max._max.sortOrder ?? 0) + 1,
        isActive: dto.isActive ?? true,
      },
    });
    await this.log(t.id, 'CREATE', dto.actorName, `Item type "${t.name}" created`);
    return t;
  }

  async update(id: string, dto: Partial<TypeDto>) {
    const current = await this.prisma.db.itemTypeMaster.findFirst({ where: { id } });
    if (!current) throw new NotFoundException('Item type not found');

    const name = dto.name === undefined ? undefined : dto.name.trim();
    if (dto.name !== undefined && !name) throw new BadRequestException('name cannot be empty');
    if (name) await this.ensureFreeName(name, id);

    // a system row is the anchor of the rules — its behaviour is not negotiable
    if (current.isSystem && dto.behaviour && dto.behaviour !== current.behaviour) {
      throw new BadRequestException(
        `"${current.name}" is a built-in type. Its behaviour cannot change — add your own type instead and pick a behaviour for it.`,
      );
    }
    if (current.isSystem && dto.isActive === false) {
      throw new BadRequestException(`"${current.name}" is a built-in type and cannot be switched off.`);
    }

    /* Changing behaviour re-stamps every item that carries this label, otherwise the
       label and the rules would disagree the moment the change was saved. */
    const t = await this.prisma.db.itemTypeMaster.update({
      where: { id },
      data: {
        name,
        behaviour: dto.behaviour,
        colour: dto.colour === undefined ? undefined : dto.colour,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    if (dto.behaviour && dto.behaviour !== current.behaviour) {
      await this.prisma.db.item.updateMany({
        where: { itemTypeId: id },
        data: { itemType: dto.behaviour },
      });
    }
    await this.log(id, 'UPDATE', dto.actorName, `Item type "${t.name}" updated`);
    return t;
  }

  async remove(id: string, actorName = 'Admin') {
    const t = await this.prisma.db.itemTypeMaster.findFirst({
      where: { id },
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
    });
    if (!t) throw new NotFoundException('Item type not found');
    if (t.isSystem) {
      throw new BadRequestException(`"${t.name}" is a built-in type and cannot be deleted.`);
    }
    if (t._count.items > 0) {
      throw new BadRequestException(
        `"${t.name}" is on ${t._count.items} item(s). Move them to another type first.`,
      );
    }

    await eraseOrBury(
      () => this.prisma.itemTypeMaster.delete({ where: { id } }),
      () => this.prisma.db.itemTypeMaster.update({ where: { id }, data: { deletedAt: new Date() } }),
      'Item Type Master',
    );
    await this.log(id, 'DELETE', actorName, `Item type "${t.name}" deleted`);
    return { id, deleted: true };
  }

  private async ensureFreeName(name: string, exceptId?: string) {
    const dupe = await this.prisma.db.itemTypeMaster.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (dupe && dupe.id !== exceptId) {
      throw new BadRequestException(`A type called "${name}" already exists.`);
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

@Controller('item-types')
export class ItemTypesController {
  constructor(private readonly svc: ItemTypesService) {}

  @Get()
  list(@Query('search') search?: string, @Query('behaviour') behaviour?: ItemType) {
    return this.svc.list({ search, behaviour });
  }
  @Post()
  create(@Body() dto: TypeDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<TypeDto>,
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
  providers: [ItemTypesService],
  controllers: [ItemTypesController],
  exports: [ItemTypesService],
})
export class ItemTypesModule {}
