import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Patch,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  WHAT IS INSIDE EACH HOMEPAGE SECTION.

  The owner, 3 Aug 2026:

    "amder jotogula section ache sob section amra ata control krte parsi na …
     ami catagory ata home page show krabo or krabo na ata control krte parsi
     na. abr samevabe occasion and person o same vabe … abr need section o
     same."

  He was right, and the gap was real. `PageSection` (layout.ts) answers
  *whether the section appears and where*. Nothing answered *what is inside
  it*. Three sections were picking their own contents from data written for
  another purpose entirely:

    · Shop by Category  → `Category.isFeatured`, which existed but was buried
                          three clicks inside one category's editor. There was
                          no screen that showed the rail as a rail.
    · Every Occasion…   → `TagGroup.displayStyle == CARD`. That column says HOW
                          a group draws, not whether it belongs on the front
                          page. Removing a tab changed the group everywhere.
    · Need It Today     → `DeliveryMethod.isActive`, which is whether the shop
                          SELLS that delivery. Taking a card off the homepage
                          meant refusing the service at checkout.

  ⚠️ THIS MODULE OWNS NO DATA. Not one table. It is a view assembled over
  Category, TagGroup, Tag and DeliveryMethod, and every write lands back on the
  owning table through the same columns their own screens use. One Data One
  Owner is intact — what is new is a place to stand where the owner can see a
  whole section at once instead of one row at a time.

  Why one endpoint rather than letting the screen call four:
   1. Reordering must renumber THE WHOLE LIST, not swap two rows. That lesson
      cost a round of "the arrows are broken" when the seed gave three zones
      their own 0,1,2 and rows shared positions. Renumbering belongs on the
      server, once, not in every screen that grows arrows later.
   2. Four calls means four half-loaded states on a Bangladeshi connection.
  ═══════════════════════════════════════════════════════════════════════════
*/

/** one tickable, movable thing inside a homepage section */
export interface HomeItem {
  id: string;
  name: string;
  /** the small grey line under the name — a count, a price, an ETA */
  note: string | null;
  imageUrl: string | null;
  /** is it on the homepage right now */
  shown: boolean;
  /** ⚠️ false = it is switched off entirely, so `shown` cannot help it */
  live: boolean;
  sortOrder: number;
  /** tabs carry their own cards; nothing else nests */
  children?: HomeItem[];
}

export interface HomeGroup {
  /** matches the section key in PAGE_SECTION_MANIFEST, so the two screens agree */
  key: string;
  /** the heading as it reads ON THE WEBSITE — the owner navigates by that, not by our names */
  title: string;
  hint: string;
  /** shown above the list when the choice has a consequence elsewhere */
  warning: string | null;
  items: HomeItem[];
}

type Kind = 'category' | 'taggroup' | 'tag' | 'delivery';

interface ToggleBody {
  kind: Kind;
  id: string;
  shown: boolean;
}

interface ReorderBody {
  kind: Kind;
  /** every id in the list, in the order they should end up */
  ids: string[];
}

@Injectable()
export class HomeContentService {
  constructor(private readonly prisma: PrismaService) {}

  async read(): Promise<HomeGroup[]> {
    const [categories, groups, dhaka, nationwide] = await Promise.all([
      this.prisma.db.category.findMany({
        where: { parentId: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true, name: true, imageUrl: true, isFeatured: true,
          isActive: true, sortOrder: true,
          /* children are selected for their COUNTS, not to be listed — a
             product filed under "Roses" must count towards "Fresh Flowers",
             or the owner reads "0 products" beside a category that is full and
             unticks it. shop.ts carries the same note for the same reason. */
          children: {
            where: { deletedAt: null },
            select: {
              _count: { select: { products: { where: { deletedAt: null, isPublished: true } } } },
            },
          },
          _count: { select: { products: { where: { deletedAt: null, isPublished: true } } } },
        },
      }),
      this.prisma.db.tagGroup.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true, name: true, isFeatured: true, isActive: true, sortOrder: true,
          tags: {
            where: { deletedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            select: {
              id: true, name: true, summary: true, imageUrl: true,
              isFeatured: true, isActive: true, sortOrder: true,
            },
          },
        },
      }),
      this.methods('DHAKA'),
      this.methods('BANGLADESH'),
    ]);

    return [
      {
        key: 'categories',
        title: 'Shop by Category',
        hint: 'The row of round cards. Tick the ones the homepage should show — the rest still exist, they just are not on the front page.',
        warning:
          'The order here is also the order of the top menu. They are one list, on purpose: a shopper who sees Flowers first on the homepage should not find it third in the menu.',
        items: categories.map((c) => {
          const n = c.children.reduce((sum, ch) => sum + ch._count.products, c._count.products);
          return {
          id: c.id,
          name: c.name,
          note: `${n} product${n === 1 ? '' : 's'}`,
          imageUrl: c.imageUrl,
          shown: c.isFeatured,
          live: c.isActive,
          sortOrder: c.sortOrder,
          };
        }),
      },
      {
        key: 'occasions',
        title: 'Every Occasion, Every Person',
        hint: 'The tabs, and the cards inside each tab. Untick a tab to remove it; open a tab to choose which cards it shows.',
        warning:
          'A tab with no ticked cards behind it does not appear at all — a tab that does nothing when pressed is worse than no tab.',
        items: groups.map((g) => ({
          id: g.id,
          name: g.name,
          note: `${g.tags.filter((t) => t.isFeatured && t.isActive).length} of ${g.tags.length} shown`,
          imageUrl: null,
          shown: g.isFeatured,
          live: g.isActive,
          sortOrder: g.sortOrder,
          children: g.tags.map((t) => ({
            id: t.id,
            name: t.name,
            note: t.summary,
            imageUrl: t.imageUrl,
            shown: t.isFeatured,
            live: t.isActive,
            sortOrder: t.sortOrder,
          })),
        })),
      },
      {
        key: 'delivery',
        title: "Need It Today? We've Got You",
        hint: 'The speed cards in the purple band. Untick one to stop advertising it on the homepage.',
        warning:
          'Unticking here does NOT stop you selling that delivery. Customers can still choose it at checkout — this only decides what the front page boasts about.',
        items: [...dhaka, ...nationwide],
      },
    ];
  }

  private async methods(zone: 'DHAKA' | 'BANGLADESH'): Promise<HomeItem[]> {
    const rows = await this.prisma.db.deliveryMethod.findMany({
      where: { zone },
      orderBy: [{ sortOrder: 'asc' }],
      select: {
        id: true, label: true, etaLabel: true, cutoffTime: true,
        isFeatured: true, isActive: true, sortOrder: true,
      },
    });
    const where = zone === 'DHAKA' ? 'Inside Dhaka' : 'Nationwide';
    return rows.map((m) => ({
      id: m.id,
      name: m.label,
      note: [where, m.etaLabel, m.cutoffTime ? `cut-off ${m.cutoffTime}` : null]
        .filter(Boolean)
        .join(' · '),
      imageUrl: null,
      shown: m.isFeatured,
      live: m.isActive,
      sortOrder: m.sortOrder,
    }));
  }

  async toggle(body: ToggleBody) {
    const { kind, id, shown } = body;
    if (!id) throw new BadRequestException('id is required');
    switch (kind) {
      case 'category':
        await this.prisma.db.category.update({ where: { id }, data: { isFeatured: shown } });
        break;
      case 'taggroup':
        await this.prisma.db.tagGroup.update({ where: { id }, data: { isFeatured: shown } });
        break;
      case 'tag':
        await this.prisma.db.tag.update({ where: { id }, data: { isFeatured: shown } });
        break;
      case 'delivery':
        await this.prisma.db.deliveryMethod.update({ where: { id }, data: { isFeatured: shown } });
        break;
      default:
        throw new BadRequestException(`Unknown kind "${String(kind)}"`);
    }
    return { ok: true };
  }

  /**
   * Write the order of a whole list.
   *
   * ⚠️ THE WHOLE LIST, RENUMBERED 0..n — never "swap these two".
   *
   * Rows arrive from seeds and from three different screens, and several of
   * them routinely share a sortOrder (three zones each seeded 0,1,2). Swapping
   * two numbers that were already equal moves nothing on screen, which reads
   * exactly like a broken button. Renumbering makes the positions true again
   * as a side effect of every reorder, so the fault cannot come back.
   */
  async reorder(body: ReorderBody) {
    const { kind, ids } = body;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('ids must be a non-empty list');
    }
    /* An explicit switch, not a lookup table of Prisma delegates. The delegates
       have four different `where` types and collapsing them into one variable
       needs a cast — which is exactly the cast that would stop TypeScript
       noticing the day one of these models loses its `sortOrder`. */
    const bump = (id: string, i: number) => {
      switch (kind) {
        case 'category':
          return this.prisma.db.category.update({ where: { id }, data: { sortOrder: i } });
        case 'taggroup':
          return this.prisma.db.tagGroup.update({ where: { id }, data: { sortOrder: i } });
        case 'tag':
          return this.prisma.db.tag.update({ where: { id }, data: { sortOrder: i } });
        case 'delivery':
          return this.prisma.db.deliveryMethod.update({ where: { id }, data: { sortOrder: i } });
        default:
          throw new BadRequestException(`Unknown kind "${String(kind)}"`);
      }
    };

    await Promise.all(ids.map((id, i) => bump(id, i)));
    return { ok: true };
  }
}

@Controller('storefront/home-content')
export class HomeContentController {
  constructor(private readonly svc: HomeContentService) {}

  @Get()
  read() {
    return this.svc.read();
  }

  @Patch('toggle')
  toggle(@Body() body: ToggleBody) {
    return this.svc.toggle(body);
  }

  @Patch('reorder')
  reorder(@Body() body: ReorderBody) {
    return this.svc.reorder(body);
  }
}

@Module({
  providers: [HomeContentService],
  controllers: [HomeContentController],
  exports: [HomeContentService],
})
export class HomeContentModule {}
