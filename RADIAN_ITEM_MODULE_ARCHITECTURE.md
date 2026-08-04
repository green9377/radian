# Radian — Item (Master Item) Module — Architecture Lock

_Locked with sobuj: 21 July 2026. Skills applied: radian-business-context · radian-development-context · architecture-review · module-design-template · business-rules-writing · decision-log-writing._

> Read this before touching Item, Product composition, or Inventory.
> Companion docs: `RADIAN_ADMIN_PROGRESS.md` (§2 Product, §10, §12) · `RADIAN_PENDING.md`.

---

## 1. Overview — why Item exists

Radian's `Product` table is entirely **eCommerce-facing** (slug, images, PDP story, SEO, selling price, zone).
It is a *sales listing*, not a physical thing.

The physical things Radian buys, stores and consumes are **Items**: rose stems, lilies, ribbon,
wrapping paper, gift boxes, chocolate, teddy bears, glue, gift-wrapping service.

Today `Product.stockQty` pretends a crafted bouquet has stock. It does not.
Real stock is 120 rose stems — from which 5 bouquets *could* be made.

**Item Management owns every physical/sellable thing. Product is a marketing skin over an Item.**

Locked build_sequence puts Item first: `Item → Category → Unit → Brand → Product`.
Product was built early for eCommerce speed; Item is now being brought back to its correct place.

---

## 2. The core model (owner-approved, 21 Jul)

> **Everything Radian sells is an Item. Several Items together can also form one Item.**
> **A Product always points at exactly one Item's SKU.**

### Two shapes of Item

| | Simple Item | Finished (assembled) Item |
|---|---|---|
| Example | Red Rose Stem · Satin Ribbon · Teddy Bear | "Romantic Red Rose Bouquet" |
| Where it comes from | Purchased as-is | Assembled from other Items |
| Recipe | none | rose ×24 + ribbon ×1 + paper ×1 |
| Can back a Product? | Yes, if it is sellable (Teddy) | Yes — this is the normal case for bouquets |

**Consequence — and the reason this model was chosen:** from Product's point of view there is
**no readymade/crafted branching at all**. The rule is always `Product → Item.sku`.
All assembly complexity lives inside Item Management, where it belongs.

**Second benefit:** one recipe, many Products. The same bouquet Item can back a normal PDP,
a Valentine campaign Product and a corporate Product — the recipe is written once and is
correct in all three (One Data One Owner).

---

## 3. Module Responsibilities

### Item Management OWNS
- `Item` — the master record for every physical or service thing.
- `ItemComponent` — the recipe/composition lines of a finished Item.
- `ItemGroup` — internal classification tree for items (NOT the storefront Category tree).

### Item Management does NOT own
| Thing | Owner |
|---|---|
| Stock quantity, per-warehouse balances, stock movements | **Inventory** (not built yet) |
| Selling price, discount, PDP story, SEO, images | **Product** |
| Supplier, purchase price, lead time, PO | **Purchase** |
| Moving/FIFO valuation cost | **Inventory** (later) |
| Unit definitions (kg / stem / piece) | **Unit master** (exists) |
| Brand | **Brand master** (exists) |
| Tax rate | **Tax Management** (later) |
| Order lines, sales counters | **Sales** |

---

## 4. Locked decisions

### DEC-ITM-001 — Item type set = 5 values
**Decision:** `RAW · FINISHED · PACKAGING · CONSUMABLE · SERVICE`.
**Reason:** `SEMI_FINISHED` implies a production stage with work orders and material
consumption. `core_principles.md` states Radian **assembles, does not manufacture**, and
Manufacturing is not a locked module. An unused enum value invites misuse.
**Alternative rejected:** including SEMI_FINISHED now.
**Reversibility:** adding a Prisma enum value later is a non-breaking migration.
**Impact:** Item, Inventory, Purchase.

### DEC-ITM-002 — Product → Item is a mandatory many-to-one FK
**Decision:** `Product.itemId` (many Products → one Item). Every Product resolves to exactly one Item.
**Reason:** owner's model. Uniform rule for all Products; no readymade/crafted branching in
Product or Inventory. Also allows one Item to back several marketing Products.
**Migration note:** `itemId` ships **nullable**, becomes required after the backfill in DEC-ITM-009.
**Impact:** Product, Sales, Inventory, Ecommerce.

### DEC-ITM-003 — Composition lives on **Item**, not on Product
**Decision:** `ItemComponent(parentItemId, componentItemId, qty, unitId, …)`.
Only `FINISHED` items may have components.
**Reason:** the recipe describes the physical thing, not the listing. Putting it on Product would
duplicate the recipe across every marketing variant of the same bouquet.
**Alternative rejected:** `ProductComposition` (Claude's first proposal — owner corrected it).
**Not a separate BOM module:** composition has no independent lifecycle and there are no
work orders in Radian. It is an Item-owned child table.
**Impact:** Item, Inventory, Product PDP.

### DEC-ITM-004 — Assembly mode is per-Item (both patterns exist)
**Decision:** `Item.assemblyMode = NONE | MAKE_TO_ORDER | MAKE_TO_STOCK`.
- `NONE` — simple purchased item (rose stem, teddy). No recipe.
- `MAKE_TO_ORDER` — fresh flower bouquets. **No own stock.** Availability is *derived*:
  `min(component stock ÷ component qty)`. On order preparing, the **components** deduct.
- `MAKE_TO_STOCK` — pre-assembled gift boxes, artificial arrangements. **Has own stock.**
  An Assembly event consumes components and adds finished units. On order preparing, the
  **finished item** deducts.
**Reason:** owner confirmed Radian does both. Fresh/perishable = make-to-order; artificial and
gift boxes = made ahead.
**Impact:** Item, Inventory (deduction path branches here), Delivery (DEC-MOD-003).

### DEC-ITM-005 — Item ships with **no stock field**; stock stays where it is
**Decision:** the Item module stores **zero** stock quantities. `Product.stockQty` and the existing
`DEC-MOD-003` deduction (stock −1 at Delivery "preparing") remain **completely untouched**.
**Reason:** Warehouse/Branch and Inventory do not exist yet. Any stock number placed on Item now
would become a second owner the moment Inventory arrives — repeating the exact mistake being fixed.
The current deduction is live and test-verified; replacing it with nothing is pure risk.
**Migration path (Inventory phase, written down so it is not lost):**
1. Build Warehouse/Branch → `InventoryStock(itemId, warehouseId, qtyMilli)`.
2. Backfill `InventoryStock` from `Product.stockQty` via each Product's `itemId`.
3. Repoint DEC-MOD-003 deduction at Item level, branching on `assemblyMode` (DEC-ITM-004).
4. `Product.stockQty` becomes derived read-only, then dropped.
**Impact:** Item, Inventory, Sales, Delivery.

### DEC-ITM-006 — `Item.unitId` is required, single FK
**Decision:** required FK to the existing `Unit` master. Purchase-unit ↔ stock-unit conversion
(buy a box, consume in stems) is **deferred to the Purchase module**.
**Reason:** without a unit, stock and cost are meaningless. Product's `unitId` stays optional —
that one is cosmetic ("/ bunch").
**Impact:** Item, Unit, Purchase.

### DEC-ITM-007 — Item classification uses a separate `ItemGroup` tree
**Decision:** new `ItemGroup` table (name, parent, sortOrder, isActive). The existing `Category`
tree is **not** reused.
**Reason:** `Category` is a storefront CMS/SEO tree (metaTitle, OG tags, showOnNavbar, banner).
"Fresh Flowers → Rose Stems" is a warehouse concept and must never reach the storefront navbar
or sitemap.
**Impact:** Item, Category (untouched).

### DEC-ITM-008 — Finished item cost = auto-computed from recipe, with manual override
**Decision:** `Item.costMode = AUTO | MANUAL`.
- `AUTO` (default for FINISHED with components): `computedCostPaisa = Σ(component effective cost × qty × (1 + wastage))`.
- `MANUAL`: staff-entered `standardCostPaisa` (used to add labour/wastage not in the recipe).
- `effectiveCost(item)` = `costMode == AUTO ? computedCostPaisa : standardCostPaisa`.
- Recompute triggers: component cost change, recipe line change, unit change. Recursive, depth-limited.
**Reason:** owner's choice. When the rose price rises, margin updates itself instead of silently
going stale. Override preserved for real-world labour cost.
**Note:** the generator (DEC-ITM-009) seeds `standardCostPaisa` from `Product.costPaisa` and
starts every item in `MANUAL`; an item only flips to `AUTO` once its recipe is filled in.
**Caveat:** this is a **reference/standard cost**, explicitly **not** an accounting valuation.
Real moving/FIFO cost arrives with Inventory and will supersede it for reporting.
**Impact:** Item, Product margin board, future Inventory/Finance.

### DEC-ITM-009 — Existing Products get their Items via a one-click generator
**Decision:** an admin action "Generate items from products" creates one `FINISHED` Item per
Product (name, sku, cost, unit copied; `assemblyMode = MAKE_TO_ORDER` for CRAFTED,
`NONE` for READYMADE; empty recipe) and links `Product.itemId`. Idempotent — never creates a
duplicate for an already-linked Product.
**Reason:** ~100+ live Products; hand-entry would stall the module. Recipes get filled in gradually.
**Impact:** Item, Product.

### DEC-ITM-010 — ONE SKU everywhere; `Item.sku` is the single source of truth
**Decision (owner, 21 Jul — supersedes the earlier "both" answer):** there is exactly **one SKU
per physical thing**, stored on `Item.sku` (`@unique`, required). Every module — Product, Sales,
phone orders, packing slips, Purchase, Inventory — reads that same value. `Product.sku` is
**not a second code**; it is retired.
**Reason:** one thing, one code. Two codes for the same rose bouquet means a phone order and a
packing slip can quote different strings — a real operational failure, and a direct
One-Data-One-Owner violation.
**Retirement plan for the existing `Product.sku` column (it holds live data like "ROSE-78"):**
1. In the generator (DEC-ITM-009), the existing `Product.sku` value is **copied into**
   `Item.sku` — nothing is lost, staff's familiar codes survive.
2. Products with no `sku` get a generated one (`slug`-derived, collision-checked).
3. All admin/API/PDP reads switch to `product.item.sku`. The SKU field on the Product editor
   edits the linked Item's SKU (with a note saying so).
4. `Product.sku` is dropped in a separate follow-up migration, only after step 3 is verified live.
**Impact:** Item, Product, Sales (phone orders), packing slips, Purchase, Inventory.

### DEC-ITM-011 — PDP "What's inside" migrates in two phases
**Decision:** Phase 1 — `ProductSpec` (free text `item` / `qty`) stays exactly as-is and is marked
deprecated; nothing on the live PDP or Sales path is touched. Phase 2 — backfill from
`ItemComponent` and render "What's inside" from the recipe (`component.name + qty + unit`), with
an optional `displayText` marketing override per line.
**Reason:** `getProductDetail().spec` is consumed by the live storefront and Sales. Breaking it to
gain tidiness now is a bad trade.
**Impact:** Product, Ecommerce (locked module — read-only until unlocked).

### DEC-ITM-012 — every Item carries ONE identification photo
**Decision (owner, 21 Jul):** `Item.imageUrl` — a single photo. Data URL interim (same as
`Brand.logoUrl`), downscaled to 256px JPEG in the browser before it is sent. Where no photo
exists yet, the screen renders a **stable colour tile derived from the SKU** plus the item's
initials, so every row is still visually distinct from day one.
**Reason:** owner's words — *"ছবি না হলে visually কাজ করতে time লাগবে"*. Reading "Artificial
Gypsy" and guessing is slow; recognising a picture is instant. This matters most on the recipe
picker, where staff choose from a long ingredient list.
**Why ONE and not a gallery:** the marketing gallery belongs to Product (One Data One Owner).
This is a warehouse mugshot, not a PDP asset.
**Impact:** Item, later the media library.

### DEC-ITM-013 — three behaviour flags that the type cannot express
**Decision:** `isSaleable` · `isPurchasable` · `isReturnable`, each independently editable.
Sensible defaults per type; staff override freely.
**Reason:** found during the Biznify audit (21 Jul). None of these follow from `itemType`:
a rose stem is *purchasable* but never *saleable* on its own; gift wrapping is *saleable* but
never *purchasable*; fresh flowers can never be *returnable*. Inferring them from the type
would be wrong in all three cases.
**Impact:** Item, Purchase (what can go on a PO), Product (what can be listed), Returns.

### DEC-ITM-014 — `weightGram` on the Item
**Decision:** integer grams, optional.
**Reason:** Bangladeshi couriers price by weight. Without it the Delivery module cannot quote a
real shipping cost, and a bouquet's weight can only be derived by rolling up its recipe — which
requires the ingredient weights to exist first. Missed in the original design; caught by the
Biznify audit.
**Impact:** Item, Delivery, Purchase.

### DEC-ITM-005 addendum — the Item screen SHOWS stock, but never stores it
**Confirmed by owner, 21 Jul:** *"inventory থেকেই সে data টেনে item-এ stock দেখাবে"*.
There is a Stock column on the Items screen from day one, driven by `itemStockLabel()`:
- today it renders `—` with a tooltip explaining Inventory does not exist yet
- `SERVICE` renders `n/a` (nothing physical to count)
- once Inventory exists, the same helper returns real per-warehouse numbers, and for a
  `MAKE_TO_ORDER` item it returns **"can build N"** = `min(component stock ÷ qty)` instead of a
  fictional balance
The screen does not change; only the helper's data source does. Item still owns no quantity.

---

## 4b. Competitor audit — Biznify (the owner's current ERP), 21 Jul 2026

Reviewed live with the owner's own login: Item list, Add-Item form, Manufacturing templates,
Inventory stock summary.

**What they do that confirms this design**
- `Unit` is a required field on the item (matches DEC-ITM-006)
- one code per item, auto-generated (`I-001968`) — no second product-level SKU (DEC-ITM-010)
- stock is `Item × Warehouse`, filterable by warehouse (exactly the DEC-ITM-005 target)
- Low Stock Point per item (`reorderLevel`)
- Track Inventory / Non-Stockable flags (`isStockTracked`)
- no `SEMI_FINISHED` concept anywhere (DEC-ITM-001)
- Item Group is separate from Category (DEC-ITM-007)

**The decisive finding — their BOM is unused.**
Their recipe lives in *Manufacturing → Production Plan Template*, and requires a Team, a
Responsible Person, start/end dates and a planned quantity. **Exactly one template exists**
(`TEMP-2025-000001`, "Fresh Flower Bouquet Classic Red Roses Black Wrapper", 19 Mar 2025:
PVC Paper ×2, Red Rose ×15) and none has been created since. The concept was right; the
weight of the wrapper killed it. This is direct field evidence for DEC-ITM-003 (recipe lives
*inside* Item, one click away) and for keeping Assembly as a **later, separate** module.

**Where their model is weaker than ours**
- No Product layer at all — marketing text is crammed into the item name
  (`Fresh Flower Bouquet Classic Red Roses Black Wrapper 1 Piece` is simultaneously the
  warehouse name and the shop name). Unworkable for Radian's eCommerce ambitions.
- No make-to-order vs make-to-stock distinction, so an assembled item's stock can never be honest.
- Costs are hand-entered per item; no roll-up from the recipe.

**Data-health warning observed:** 638 items total, 103 active, 184 flagged low-stock (more
low-stock rows than active items — the count is including dead records). ~500 dead rows in the
master. This is why `ITM-R07` (blocked delete with named blockers) + soft-delete + a Trash
screen matter.

**Adopted from them:** DEC-ITM-013 and DEC-ITM-014 above.
**Deliberately NOT adopted:** their "Use Fractional Units" toggle — Radian keeps quantities as
integer thousandths (`qtyMilli`), because repeated float arithmetic drifts.

---

## 5. Schema draft (Prisma, apps/api)

```prisma
enum ItemType     { RAW FINISHED PACKAGING CONSUMABLE SERVICE }   // DEC-ITM-001
enum AssemblyMode { NONE MAKE_TO_ORDER MAKE_TO_STOCK }            // DEC-ITM-004
enum CostMode     { AUTO MANUAL }                                 // DEC-ITM-008

/// internal warehouse classification — NOT the storefront Category tree (DEC-ITM-007)
model ItemGroup {
  id        String      @id @default(cuid())
  name      String
  parentId  String?
  parent    ItemGroup?  @relation("ItemGroupTree", fields: [parentId], references: [id])
  children  ItemGroup[] @relation("ItemGroupTree")
  sortOrder Int         @default(0)
  isActive  Boolean     @default(true)
  items     Item[]
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  deletedAt DateTime?
}

/// the single master for every physical or service thing Radian handles
model Item {
  id          String     @id @default(cuid())
  sku         String     @unique          // THE single SKU, used by every module (DEC-ITM-010)
  name        String
  itemType    ItemType                    // DEC-ITM-001
  itemGroupId String?
  itemGroup   ItemGroup? @relation(fields: [itemGroupId], references: [id])
  brandId     String?
  brand       Brand?     @relation(fields: [brandId], references: [id])
  unitId      String                      // REQUIRED (DEC-ITM-006)
  unit        Unit       @relation(fields: [unitId], references: [id])

  isStockTracked Boolean      @default(true)  // forced false for SERVICE/CONSUMABLE
  assemblyMode   AssemblyMode @default(NONE)  // DEC-ITM-004

  costMode          CostMode @default(MANUAL) // DEC-ITM-008
  standardCostPaisa Int      @default(0)      // manual reference cost
  computedCostPaisa Int?                      // derived from recipe, null if no recipe

  isPerishable Boolean @default(false)   // fresh flowers
  shelfLifeDays Int?
  reorderLevel  Int?                     // advisory only until Inventory exists
  description   String?

  isActive  Boolean   @default(true)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?                     // soft delete only

  components ItemComponent[] @relation("ItemRecipe")     // what THIS item is made of
  usedIn     ItemComponent[] @relation("ItemUsedIn")     // recipes THIS item appears in
  products   Product[]                                   // DEC-ITM-002

  @@index([itemType])
  @@index([itemGroupId])
}

/// one recipe line of a FINISHED item (DEC-ITM-003)
model ItemComponent {
  id              String   @id @default(cuid())
  parentItemId    String
  parentItem      Item     @relation("ItemRecipe", fields: [parentItemId], references: [id])
  componentItemId String
  componentItem   Item     @relation("ItemUsedIn", fields: [componentItemId], references: [id])
  qtyMilli        Int                       // integer-safe: 24 stems = 24000, 0.5 kg = 500
  unitId          String
  unit            Unit     @relation(fields: [unitId], references: [id])
  wastageBp       Int      @default(0)      // basis points, 500 = 5% — never a float
  isOptional      Boolean  @default(false)
  displayText     String?                   // marketing override for PDP (DEC-ITM-011 phase 2)
  sortOrder       Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  @@index([parentItemId])
  @@index([componentItemId])
}

// Product gains, in the same migration:
//   itemId String?           // nullable now, required after DEC-ITM-009 backfill
//   item   Item?  @relation(fields: [itemId], references: [id])
// Product.sku stays in place for now but is DEPRECATED — its values are copied into
// Item.sku by the generator, reads move to product.item.sku, then the column is dropped
// in a follow-up migration (DEC-ITM-010).
```

**Numeric conventions:** money = paisa Int · quantity = `qtyMilli` Int (thousandths) ·
percentage = basis points Int. No floats anywhere.

---

## 6. Business rules (enforced in service layer, `DEC-` cited in code)

| # | Rule | Cite |
|---|---|---|
| ITM-R01 | Only `itemType = FINISHED` may have `ItemComponent` rows. Others → 400. | DEC-ITM-003 |
| ITM-R02 | `assemblyMode != NONE` requires ≥1 component. `NONE` must have zero. | DEC-ITM-004 |
| ITM-R03 | An Item can never be its own component, directly or transitively. Cycle check on every recipe write; max depth 5. | DEC-ITM-003 |
| ITM-R04 | `itemType = SERVICE` → `isStockTracked` forced `false`, `assemblyMode = NONE`. | DEC-ITM-001 |
| ITM-R05 | `costMode = AUTO` is only allowed when a recipe exists; otherwise fall back to MANUAL. | DEC-ITM-008 |
| ITM-R06 | Any change to a component's effective cost recomputes every ancestor's `computedCostPaisa` (recursive, depth-limited). | DEC-ITM-008 |
| ITM-R07 | Soft-delete is blocked while the Item is (a) linked to a non-deleted Product, or (b) used in a non-deleted recipe. Error must name the blockers. | core_principles |
| ITM-R08 | `Item.sku` unique, required — the only SKU in the system. Editable until the first Purchase/Inventory reference, then immutable. No module may store its own copy. | DEC-ITM-010 |
| ITM-R09 | The Item module writes no stock quantity anywhere. Any stock display is read-only "not enabled yet". | DEC-ITM-005 |
| ITM-R10 | Every create/update/soft-delete writes `AuditLog` + `ActivityEvent` via the shared `AuditService`. | core_principles |
| ITM-R11 | `generateItemsFromProducts` is idempotent — skips Products that already have `itemId`. | DEC-ITM-009 |

---

## 7. Build steps (each reviewed live on localhost:3001 before the next)

| # | Step | Deliverable |
|---|---|---|
| 1 | Prisma `Item` · `ItemComponent` · `ItemGroup` + `Product.itemId?` | migration `item_module` (Docker two-step) |
| 2 | `/items` API | CRUD · list (search, type filter, sort, pagination) · soft-delete + restore · `/items/:id/components` · cost recompute · `/items/generate-from-products` |
| 3 | Admin list screen | `/items` — colourful KPI cards by type, search (`ipt ipt-icon`), type tabs, CSS-grid rows, active toggle, "Demo data" badge fallback |
| 4 | Sidebar + route | "Items" entry, `app/items/page.tsx` |
| 5 | Item editor | basics · recipe builder (visual item picker + qty + unit, live cost roll-up) · cost panel |
| 6 | Product link | Item selector on Product editor + single shared SKU field (edits `item.sku`) + generator button |

**Not in this module:** stock quantities · warehouses · supplier/purchase price · valuation ·
`ProductSpec` removal · anything in the Ecommerce module.

---

## 7a. Item module — the sub-module list (locked 21 Jul, sobuj)

**Built**

| Sub-module | Route | What it is for |
|---|---|---|
| Overview | `/items` | decision-first landing: what needs doing, then the numbers |
| All items | `/items/list` | the table — photo, type tabs, search, sort, "needs attention" |
| New item | `/items/new` | single item **or** a whole variant family (DEC-ITM-016) |
| Item detail | `/items/[id]` | edit + the recipe builder |
| Item categories | `/items/categories` | the Item module's own tree (DEC-ITM-007) |
| Colour & size | `/items/attributes` | the Item module's own labels (DEC-ITM-015) |
| Units | `/items/units` | lives inside Items — a unit exists to serve an item |

**Still to build, in this order**

1. **Trash** — restore a soft-deleted item. Without it soft-delete reads as permanent loss.
2. **Recipe board** — every assembled item on one page: empty recipes, recipes that cost more
   than the product sells for, the most expensive ingredients.
3. **Where-used** — "this rose is in 7 recipes and 3 products". API (`GET /items/:id/usage`)
   already exists; only the screen is missing.
4. **Cost & margin board** — no-cost items, cost changes over time, auto vs manual.
5. **Item timeline** — who changed what. API (`GET /items/:id/timeline`) already exists.

**Explicitly dropped**

- **Bulk import / CSV** — owner's call, 21 Jul: not wanted. (Noted risk: ~638 items exist in the
  current ERP and will have to be keyed in by hand. Revisit if that becomes painful.)
- **Price List** — that is a selling price, so it belongs to Pricing & Offers, not here.
- **Manufacturer** — the audited ERP keeps it separate from Brand; Brand is enough for Radian
  until warranty/compliance needs it.

**Arrives with other modules** (Item *shows* it, another module *owns* it): Stock board →
Inventory · Purchase history & supplier price → Purchase · Assembly log → Assembly ·
Batch/expiry → Inventory.

## 7b. The next module — **Assembly** (separate module, confirmed by owner 21 Jul)

Owner's instruction: finish Item first, then build Assembly as its **own module**, not as a
sub-page of Items. Recording the boundary so it is not re-litigated.

**Why separate is right:** Item is master data — written once, changed rarely, touched by the
owner. Assembly is a daily transaction — written every morning, touched by whoever builds the
bouquets. Folding the second into the first would bury the master data under operational noise,
and it is the same mistake in reverse that the audited ERP made by burying the *recipe* inside
Manufacturing.

**Recipe ≠ Assembly.** The recipe ("a bouquet is 24 roses + ribbon") is written once and lives
on the Item. Assembly ("this morning we built 5, wasted 2 roses, Rifat did it") is an event that
happens daily and belongs to its own module.

Assembly will own: the build event · actual vs recipe consumption · wastage · who/when/which
branch · adding finished units to stock · actual-vs-standard cost variance.

**It cannot be built before Inventory**, because its entire job is to move stock. Sequence:
`Item → Warehouse/Branch → Purchase → Inventory → Assembly`.

**It is only needed for `MAKE_TO_STOCK` items.** A `MAKE_TO_ORDER` bouquet consumes its
components at order-preparing time via the existing DEC-MOD-003 path — no build event, no
paperwork. That is deliberately the cheap path, because it is the common one.

**Name:** "Assembly", not "Manufacturing" (factory language, and `core_principles` states Radian
assembles rather than manufactures) and not "BOM" (a BOM *is* the recipe, which lives on Item).

## 8. Open items carried forward

- **Purchase-unit ↔ stock-unit conversion** (buy a box of 50 stems, consume per stem) — Purchase module.
- **Batch / lot / expiry tracking** for perishables — Inventory module. `isPerishable` + `shelfLifeDays` are placeholders now.
- **`ProductSpec` retirement** — DEC-ITM-011 phase 2.
- **DEC-ITM-001..011 registration** in the architecture project's master Decision Log (these IDs are provisional until then), together with the still-unregistered DEC-PRD/CUS/SAL IDs noted in `RADIAN_ADMIN_PROGRESS.md` §7.

## 9. ⚠️ Conflict flagged to the architecture project (mandatory sync rule)

`radian-business-context/references/02_architecture.md` lists **Manufacturing Management** as a
module and names Production Template / Work Order / Material Consumption as core entities.
`radian-development-context/references/core_principles.md` states Radian **assembles, not
manufactures — no manufacturing/BOM-production tables needed**, and `build_status.md` does not
list Manufacturing as locked.

These contradict. This design follows the development-context (assembly only, no work orders).
If Manufacturing is later locked, `SEMI_FINISHED` and a work-order layer sit cleanly on top of
`ItemComponent` — nothing here needs to be undone.
