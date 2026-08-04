# Unit of Measure — ownership ruling (21 Jul 2026, sobuj)

Written from the **Units module** chat, for the **Item module** chat. Read this before
touching `Item`, `ItemComponent`, or stock.

> **Final version.** This file was rewritten three times on 21 Jul as the owner worked
> through the problem. Ignore anything you remember from earlier drafts — §1 is what is
> in the code.

---

## 1. The ruling — conversion lives on `Unit`

A unit points at a smaller unit and says how many of it make one.

```
Papri        base unit                                   (baseUnitId null, baseQty 1)
Lily Stick   baseUnit Papri,      baseQty 4       →   4 papri
Gypsy Stick  baseUnit Papri,      baseQty 2       →   2 papri
Lily Bunch   baseUnit Lily Stick, baseQty 10      →  40 papri   (chain resolved)
Gram         base unit  ·  Kg  baseUnit Gram, baseQty 1000  →  1,000 gram
```

Chains are allowed and resolved to the base. The API returns `rootUnitCode` and
`rootFactor` on every row, so **Item, Sales and Purchase never multiply by hand** — read
`rootFactor` and divide or multiply.

`Item.unitId` (required, DEC-ITM-006) stays exactly as it is. **The Item module needs no
conversion table.** Set an item's unit to whatever it is counted in; if that unit has a
chain, the factor is already there.

### ⚠ The trade-off, stated plainly

This is only correct because the **name is specific**: "Lily Stick", not a bare "Stick" —
a gypsy stick is 2 papri, not 4. The owner chose this knowing the cost:

1. The unit list **grows with the catalogue** (one "… Stick" per flower).
2. Someone must **remember** to create "Gypsy Stick" when gypsy is added.
3. **Nothing ties a unit to a flower**, so staff can pick "Lily Stick" on a gypsy item
   and no rule objects.

The alternative (a conversion table per item, so one generic "Stick" serves everything)
was designed and then rejected. Two mitigations are built into the admin screen, and
neither fully closes gap 3:

- **Duplicate** — copy an existing conversion into a new name in one click.
- **Generic-name warning** — a bare measure word ("Stick", "Bunch", "Box", "Set",
  "Pair", "Bundle", "Packet", "Pack") is flagged on the row and in the dialog, plus a
  count at the top of the page.

If wrong-unit mistakes start showing up in real stock counts, the fix is the rejected
design: keep `Unit` generic and move the factor to a per-item table. Revisit then.

---

## 2. What this supersedes

| Decision | Was | Now |
|---|---|---|
| `DEC-ITM-006` | "Purchase-unit ↔ stock-unit conversion → Purchase module" | **Superseded.** Conversion is on `Unit` and covers buying *and* selling. `Item.unitId` unchanged. |
| `DEC-ITM-005` | "NO stock field on Item — Product.stockQty stays until Inventory" | Owner ruled **stock belongs to Item**. Not implemented — see §5. |
| `DEC-PRD-009` | "Product ↔ Unit = single FK — one product, one unit" | Owner ruled one Product may offer several selling units via a PDP dropdown. Not implemented — see §5. |

All three need Decision Log entries in the architecture project.

---

## 3. Units module — DONE, do not rebuild

`apps/api/prisma/schema.prisma` · `apps/api/src/catalog/units.ts` ·
`apps/admin/app/_components/UnitsView.tsx` · `apps/admin/app/items/units/page.tsx`
Nav: **Items → Units**. The old `/units` route redirects there.

```prisma
model Unit {
  id        String @id @default(cuid())
  name      String @unique   // "Lily Stick", "Papri", "Kg" — SPECIFIC, not generic
  shortCode String @unique   // "lilystick", "papri", "kg" — price suffix + packing slip

  baseUnitId   String?       // null = base unit (nothing smaller)
  baseUnit     Unit?  @relation("UnitBase", fields: [baseUnitId], references: [id])
  derivedUnits Unit[] @relation("UnitBase")
  baseQty      Int    @default(1)   // whole number >= 1; always 1 for a base unit

  sortOrder Int      @default(0)
  isActive  Boolean  @default(true)
  products  Product[]        // Product.unitId
  items     Item[]           // Item.unitId — REQUIRED (DEC-ITM-006)
  itemLines ItemComponent[]  // ItemComponent.unitId — recipe lines (DEC-ITM-003)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  @@index([baseUnitId])
}
```

| Route | Notes |
|---|---|
| `GET /units` | `baseUnit`, `_count` (products · items · itemLines · derivedUnits), and resolved `rootUnitCode` / `rootFactor` / `chainBroken` |
| `GET /units/:id/usage` | the real rows still pointing at it, so they can be moved |
| `POST` · `PATCH` · `DELETE` | soft-delete + audit |

**Enforced**

- `baseQty` is a whole number ≥ 1; a base unit is forced to 1. Fractions are impossible
  by construction — the fix is always "make the smaller unit the base", and the error
  message says so.
- **Cycle guard** on save. If a loop still reaches the reader (direct DB edit), the
  resolver returns `rootFactor: null` + `chainBroken: true` and the screen shows "Chain
  broken" instead of a wrong number — a silently wrong factor corrupts stock maths.
- **Delete blocked** while a derived Unit, an Item, a recipe line, or a Product points at
  it — four separate messages naming what to fix.
- **Changing a live conversion** asks for confirmation and writes a ⚠ audit entry.

**Admin screen** — read-only list; add / edit / duplicate share one dialog with a live
preview ("1 Lily Stick = 4 papri"); "Breaks into" is a custom picker (type to filter,
arrow keys, and "Create «name»" for a unit that doesn't exist yet); "Used by" counts are
clickable and move records in bulk **through each owning module's own endpoint**
(`/items/:id`, `/products/:id`, `/units/:id`). Recipe lines are listed but not movable —
they belong to the Item composition editor.

---

## 4. What the Item module should do

Nothing structural. Do **not** build `ItemUnit`.

- `Item.unitId` = the unit the item is counted in. Pick the level you actually count at.
- To show "how many sticks do we have", read `rootFactor` from `/units` and divide. Do
  not store a second copy of that number anywhere.
- When creating an item for a new flower, check a matching unit exists ("Gypsy Stick").
  If not, the Units screen's **Duplicate** makes one in seconds. A link from the item
  editor's unit picker to Items → Units would help here.

---

## 5. Open — needs an owner

1. 🔴 **Stock is still on `Product.stockQty`.** The owner ruled it belongs to Item, but
   `DEC-ITM-005` deliberately left it off Item until Inventory exists. Until resolved,
   "stock owner is Item" is a decision, not a fact in the code.
2. 🟠 **Selling one product in several units is not built.** Needs a price per selling
   unit on the Product side — price only, never a factor (bulk is cheaper, so 1 stick is
   not 4 × 1 petal): `ProductUnitPrice { productId, unitId, sellingPricePaisa, isDefault, isActive }`.
3. 🟠 **`OrderLine` needs `unitId` + a factor snapshot** taken at order time, same
   discipline as the price snapshot. If someone later edits `baseQty`, past orders must
   not silently re-interpret how much stock they consumed.
4. 🟠 **Nothing ties a unit to a flower** — see §1. Watch for wrong-unit mistakes in real
   stock counts; that is the signal to move the factor per-item.
5. 🟡 **PDP unit selector** behaves like the locked **Upgrade** pattern, not Variant —
   selecting a unit changes price in place and must NOT navigate (see
   `RADIAN_ADMIN_PROGRESS.md`, "LOCKED — Variant vs Upgrade", 19 Jul). Ecommerce is not a
   locked module; do not build it until it is.
6. 🟢 **No restore for a soft-deleted unit.** Brand and Tag have the same gap — solve it
   once for all master data rather than per module.

---

## 6. Migration and a warning

```
cd D:\radian                       # PowerShell: no /d
docker compose up -d postgres api
docker compose run --rm api npx prisma migrate dev --name unit_base_conversion
docker compose exec api npx prisma generate
docker compose up -d --build api
```

⚠ The API container runs compiled `dist/`, **not** live source — after any backend
change you must `--build`, or the container keeps serving the old routes (this cost an
hour on 21 Jul, showing up as a 404 on `/units/:id/usage`).

⚠ `Unit` migrates **before** `Item` (`Item.unitId` points at it). Two chats were editing
`schema.prisma` at the same time on 21 Jul and broke each other's schema twice — only
one chat should hold the migration at a time.
