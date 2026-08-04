# ⚠️ Item module is IN PROGRESS — read before touching the schema

_21 July 2026. Written for any other chat/session working on `D:\radian` at the same time._

> **DEC-ITM-021 (owner's ruling, 21 Jul):** TWO SKUs, on purpose. `Item.sku` = stockroom
> code — Inventory and Purchase connect through it. `Product.sku` = ecommerce code — the
> data layer / storefront speaks it. They are joined by the `Product.itemId` FK and
> NEVER by matching SKU text. This supersedes DEC-ITM-010's "one SKU everywhere" —
> do not "unify" them, and do not drop `Product.sku`.

The Item module (`RADIAN_ITEM_MODULE_ARCHITECTURE.md`) is **fully written and typecheck-clean,
but not yet migrated**. Its models are already sitting in `apps/api/prisma/schema.prisma`.

## What happened today (so it does not happen again)

Two sessions edited `schema.prisma` at the same time. One removed `Unit.baseUnitId` /
`Unit.baseQty`; the other then ran `prisma migrate dev`. Prisma correctly offered to **drop
those columns, which still held 6 rows of real conversion data**. The owner answered `N` and
nothing was lost — but it was one keystroke away.

**Rule agreed with the owner:** run `prisma migrate dev` **once**, only after the in-flight
work is finished. Never mid-way, and never from two sessions.

## Do NOT delete or rename these (Item module owns them)

Models in `schema.prisma`:

| Model | Why |
|---|---|
| `Item` | the master. DEC-ITM-001…016 |
| `ItemComponent` | the recipe (DEC-ITM-003) |
| `ItemCategory` | the Item module's OWN tree — **not** the storefront `Category` (DEC-ITM-007) |
| `ItemAttribute` / `ItemAttributeValue` | the Item module's OWN Colour/Size — **not** `VariantAttribute` (DEC-ITM-015) |
| enums `ItemType` · `AssemblyMode` · `CostMode` | DEC-ITM-001 / 004 / 008 |

Fields added to existing models — **leave them in place**:

- `Product.itemId` → every Product resolves to one Item (DEC-ITM-002)
- `Unit.items` and `Unit.itemLines` → back-relations; removing them breaks schema validation
- `Brand.items` → back-relation

Code: `apps/api/src/items/*`, `apps/api/src/catalog/item-categories.ts`,
`apps/api/src/catalog/item-attributes.ts`, `apps/admin/app/items/*`,
`apps/admin/app/_components/Item*.tsx`, `apps/admin/app/_data/itemDemo.ts`.

## What Item needs FROM Unit (and nothing more)

Only `Unit.id`, via the required `Item.unitId` FK (DEC-ITM-006). Whatever else happens to the
Unit model — conversion chains added, removed, reshaped — **Item is unaffected**. So Unit work
can finish freely; just do not delete the two back-relation lines.

## Before the next migration

1. Finish the Unit work.
2. Check `git diff` on `schema.prisma` — confirm nothing from the table above disappeared.
3. Run `radian_item_migrate.bat` **once**.
4. If Prisma warns about dropping a column that still holds values, **answer `N` and ask** —
   that is data loss, not a normal migration step.
