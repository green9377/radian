# Radian — Assembly Module — Architecture Lock

> ⚠️ **v2 REDESIGN (23 Jul 2026) — read §V2 at the BOTTOM first.** After reviewing
> Biznify's Manufacturing module, the owner redesigned the flow: standalone
> Templates → Production pipeline (WIP = "Assembly floor" warehouse) → Finished
> goods → Transfer. DEC-ASM-002/005/006/009 are superseded there; the code
> implements v2. §1–9 below are kept for the reasoning history.

_Locked with sobuj: 22 July 2026 (Assembly chat). Skills applied: radian-business-context ·
radian-development-context · architecture-review · module-design-template ·
business-rules-writing · decision-log-writing._

> Read this before touching builds, recipes-at-build-time, or the ASSEMBLY/UNBUILD
> movement reasons. Companion docs: `RADIAN_INVENTORY_MODULE_ARCHITECTURE.md`
> (DEC-INV-001…015) · `RADIAN_ITEM_MODULE_ARCHITECTURE.md` §7b (the locked boundary) ·
> `RADIAN_PURCHASE_MODULE_ARCHITECTURE.md` (AVCO chain) · `RADIAN_UOM_OWNERSHIP_RULING.md`
> (rootFactor discipline) · `RADIAN_ADMIN_PROGRESS.md` §14.

---

## 1. Overview — why Assembly exists

Item §7b locked the boundary: the **recipe** ("a gift box is 24 roses + ribbon") is master
data and lives on Item (`ItemComponent`); **Assembly** is the daily **event** — "this
morning we built 5, Rifat did it, it actually took 26 roses". This module records that
event and moves the stock: components OUT, finished units IN, at honest AVCO money.

Only `MAKE_TO_STOCK` items are ever built here. A `MAKE_TO_ORDER` bouquet consumes its
components at order-preparing time through the existing DEC-MOD-003 / INV-RULE-005 path —
no build event, no paperwork, deliberately the cheap path.

## 2. Module Responsibilities

### Assembly OWNS
- `AssemblyBuild` (+lines) — the build event: who/when/what/how many, recipe vs actual.
- `AssemblyUnbuild` (+lines) — dismantling a built item back into components.
- The actual-vs-standard **cost variance** view.

### Assembly does NOT own
| Thing | Owner |
|---|---|
| The recipe (`ItemComponent`) | **Item** — Assembly only reads it and snapshots qty at build time |
| Stock quantities / balances / ledger | **Inventory** — every write goes through `InventoryService` (INV-RULE-001) |
| Item cost field / AVCO | **Item** (updated by Purchase per DEC-PUR-005/DEC-INV-013) — Assembly reads `effectiveCost`, never writes it |
| Wastage documents | **Inventory** (`StockIssue`) — un-build's auto-wastage creates a real StockIssue through Inventory's own flow |
| Accounting entries | **Finance** (later) — consumes completed events |

## 3. Locked decisions

### DEC-ASM-001 — Entry any time + soft day-end reminder
**Decision (owner):** builds are entered whenever they happen — any time of day, multiple
documents per day, multiple builds per document not required (one finished item per
document; several documents are cheap). Backdating via `builtAt` is allowed. The Assembly
Overview shows a soft "No build entry today" nudge; nothing is forced.
**Reason:** same logic as DEC-INV-005 — a forced morning routine breeds fake data; the
shop builds bouquets at noon and in the evening too.
**Impact:** Assembly, Overview screen.

### DEC-ASM-002 — Actual consumption editable; breakage stays manual
**Decision (owner):** the build form auto-loads the recipe (qty × builds, converted to
each component's own unit) and every line's **actual used qty is editable** — that edited
figure is what the ledger consumes. Broken/spoiled components are **NOT auto-posted**:
staff record them separately on the Wastage screen (`/inventory/issue`). The build save
screen offers a "Broken items? → Record wastage" shortcut link (navigation only, never an
auto entry).
**Trade-off accepted by the owner (recorded plainly, UOM-ruling style):** if staff forget
the separate wastage entry, the stock গরমিল only surfaces at the next stocktake, and the
build→wastage link is not recorded. If that starts happening in real counts, the fix is
the rejected alternative: a per-line wasted-qty column posting WASTAGE in the same
transaction. Revisit then.
**Impact:** Assembly, Inventory (WASTAGE stays a manual flow for builds).

### DEC-ASM-003 — Warehouses are settings-driven
**Decision (owner):** `InventorySetting` gains `defaultAssemblyComponentWarehouseId` and
`defaultAssemblyFinishedWarehouseId` (both fall back to `defaultSaleWarehouseId`, then the
first active warehouse — day 1 that resolves to Shop). The build form pre-fills both and
lets staff override per build (e.g. building straight from the Storeroom).
**Reason:** DEC-INV-003's admin-configurable principle; hardcoding Shop would force a
Transfer before every storeroom build.
**Impact:** Assembly, Inventory settings screen.

### DEC-ASM-004 — Finished units enter the ledger at ACTUAL build cost
**Decision (owner):** finished IN value = Σ(actual qty × that component's AVCO at post
time). Component OUT money always equals finished IN money — the build leaks no paisa.
`unitCost` of the finished IN movement = total ÷ built qty. The Item master's cost is NOT
touched: a MAKE_TO_STOCK item's `computedCostPaisa` stays recipe-driven AUTO
(DEC-ITM-008), and AVCO recompute remains PURCHASE-only (INV-RULE-007) — Assembly never
calls Item's cost endpoint.
**Consequence:** actual − standard difference is visible per build and aggregated on the
Variance report (which recipes don't match reality), instead of silently vanishing.
**Impact:** Assembly, Inventory valuation, future Finance.

### DEC-ASM-005 — Un-build flow exists from day 1; unreturned portion auto-wastes
**Decision (owner):** a dismantle document: pick the finished item + qty → recipe expected
components load → per line staff set the **returned qty** (default = expected). Posting,
in ONE transaction: finished OUT (`UNBUILD`), full expected components IN (`UNBUILD`),
then a real `StockIssue(kind=WASTAGE, reason "Un-build")` posts WASTAGE OUT for every
unreturned remainder — so the wilted-flower money lands in the existing wastage reports
with zero extra entry.
**⚠ Deliberate exception to DEC-ASM-002:** here the wastage IS auto-posted, because the
form already states exactly what did not come back — making staff re-type it in a second
screen would double-count or get skipped. The owner approved this asymmetry knowingly.
**Money note:** finished OUT is valued at the item's current effective cost; components
IN at their current AVCO. If costs drifted since the build, a small residual can exist in
the ledger totals — accepted; the variance report and audit rows keep it visible.
**Also covers corrections:** a mistaken build is undone by an un-build with full return
(no separate "reverse build" endpoint in v1).
**Impact:** Assembly, Inventory (StockIssue), wastage reports.

### DEC-ASM-006 — Screens: five, decision-first
**Decision (owner — asked for the full set including Overview):**

| Sub-module | Route | What it is for |
|---|---|---|
| Overview | `/assembly` | today's builds + money, "no entry today" nudge, month totals, recent builds |
| Build | `/assembly/build` | entry form on top (recipe auto-load · per-component stock · actual edit · live cost), history below (Biznify shape) |
| Un-build | `/assembly/unbuild` | dismantle form + history |
| History | `/assembly/history` | all build/un-build documents, filters, expandable lines |
| Variance | `/assembly/variance` | actual vs recipe per item — which recipes lie |

UI conventions unchanged: English-only text, item photo/SKU tiles (DEC-ITM-012),
`QuickSelect` pickers (no native select), CSS-grid line editors (the `.ipt` flex trap),
demo-fallback + "Demo data" badge, রঙিন decision-first.

### DEC-ASM-007 — Two new MovementReasons; enum addition is non-breaking
**Decision:** `MovementReason` gains `ASSEMBLY` (build: component OUT + finished IN, one
`groupId`) and `UNBUILD` (dismantle: finished OUT + component IN, one `groupId`). The
un-build's wastage rows use the existing `WASTAGE` reason via StockIssue.
**Flag to the architecture project:** this amends DEC-INV-002's day-1 reason list.

### DEC-ASM-009 — Template composable FROM the Build screen (owner review, 22 Jul)
**Decision (owner):** his flow is "name first, contents later": the finished item is
created with just a name (assembly mode Made in advance); the **template is composed on
the Build screen the first time** the item is picked — a blank template builder opens,
components + qty are added, Save writes each line **through Item's own endpoint**
(`addItemComponent`), then the build proceeds. Ownership unchanged: the recipe still
lives on `ItemComponent` (Item-owned); Assembly never writes it directly — same
via-the-owner discipline as the Units screen's bulk moves. `GET /assembly/recipe/:id`
returns `hasRecipe:false` + empty lines instead of erroring for a template-less item.
**Reason:** forcing a round-trip to the Item page's recipe builder before the first
build was dead friction; the owner thinks in "template → check stock → build → finished
into item" order and the screen now follows it.
**Impact:** Assembly UI, Item (writes via its endpoint), none on schema.

### DEC-ASM-010 — Who built + how long: recorded and reported (owner review, 22 Jul)
**Decision (owner):** the build form carries **Built by** (free text until Roles &
Permissions) and **Time (min)**. Schema: `AssemblyBuild.durationMin Int?`; actor was
already stored. Reporting: Overview gains "Who is building (this month)" — per person:
builds, pieces, money, average minutes; history rows show the duration.
**Reason:** owner: "ke banacche koto time lagtche egular kono reporting nai".
**Impact:** Assembly (schema addition — rerun the migrate bat), Overview, History.

### DEC-ASM-008 — Sequential numbers, immutable documents
**Decision:** `ASM-000001` / `UNB-000001` via the same lastNo+1 discipline as PUR-R09.
Posted documents are never edited or deleted (ledger discipline, INV-RULE-002);
corrections go through un-build (DEC-ASM-005) or stocktake.

## 4. Business rules (service layer; cite in code)

| # | Rule | Cite |
|---|---|---|
| ASM-RULE-001 | Only a non-deleted, active, `isStockTracked`, `MAKE_TO_STOCK` item with a non-empty recipe may be built or un-built. | DEC-ITM-004, §7b |
| ASM-RULE-002 | Every stock write goes through `InventoryService.postAssemblyBuild` / `postAssemblyUnbuild` — one transaction: document + ledger + balances. Assembly never touches `InventoryStock`. | INV-RULE-001 |
| ASM-RULE-003 | Recipe quantities are converted line-unit → component-own-unit through resolved root factors and SNAPSHOTTED on the build line (`recipeQtyMilli`); later recipe edits never re-interpret old builds. | DEC-PUR-009 discipline |
| ASM-RULE-004 | Consumption uses the line's `actualQtyMilli` (staff-edited); must be ≥ 0; a line may be zeroed but not negative. | DEC-ASM-002 |
| ASM-RULE-005 | Finished IN value = Σ(actual × component AVCO); component OUT and finished IN post in one `groupId`. No paisa leaks on build. | DEC-ASM-004 |
| ASM-RULE-006 | Insufficient component stock WARNS (red) but never blocks — unless `negativeStockPolicy = BLOCK`, which the ledger already enforces. | DEC-INV-011 |
| ASM-RULE-007 | Un-build: returned ≤ expected per line; unreturned remainder posts a real WASTAGE StockIssue in the same transaction. | DEC-ASM-005 |
| ASM-RULE-008 | Quantities `qtyMilli` Int, money paisa Int, no floats; every post writes AuditLog + ActivityEvent with actor. | core_principles |
| ASM-RULE-009 | Documents immutable after post; no update/delete endpoints exist. | DEC-ASM-008 |

## 5. Schema (Prisma, apps/api) — see `schema.prisma` for the authoritative text

- `enum MovementReason` += `ASSEMBLY`, `UNBUILD` (DEC-ASM-007)
- `InventorySetting` += `defaultAssemblyComponentWarehouseId?`, `defaultAssemblyFinishedWarehouseId?` (DEC-ASM-003)
- `AssemblyBuild` — buildNo · itemId(FK) · qtyMilli · component/finished warehouse ids ·
  totalCostPaisa · unitCostPaisa · standardCostPaisa (recipe cost at build time — the
  variance basis) · note · status POSTED · actor · builtAt (backdate) · soft-delete cols
- `AssemblyBuildLine` — componentItemId(FK) · recipeQtyMilli (snapshot) · actualQtyMilli ·
  unitCostPaisa · valuePaisa
- `AssemblyUnbuild` — unbuildNo · itemId(FK) · qtyMilli · warehouseId · finishedValuePaisa ·
  returnedValuePaisa · wastedValuePaisa · issueId (the auto StockIssue) · note · status · actor
- `AssemblyUnbuildLine` — componentItemId(FK) · expectedQtyMilli · returnedQtyMilli ·
  unitCostPaisa · returnedValuePaisa · wastedValuePaisa

## 6. API surface (`/assembly`)

| Route | What |
|---|---|
| `GET /assembly/overview` | KPIs + "no entry today" flag + recent builds |
| `GET /assembly/recipe/:itemId?warehouseId=` | build-form payload: recipe lines converted to component units, per-line stock at the chosen warehouse, AVCO costs, can-build-N |
| `GET /assembly/builds` · `POST /assembly/builds` · `GET /assembly/builds/:id` | list / create / detail |
| `GET /assembly/unbuilds` · `POST /assembly/unbuilds` | list / create |
| `GET /assembly/variance?days=` | actual vs standard per item |

⚠️ Route order: static (`overview`, `recipe`, `variance`) above any `:id` — the same Nest
trap as `/products/analytics`.

## 7. Build steps (each reviewed live on localhost:3001)

| # | Step | Deliverable |
|---|---|---|
| 1 | Schema + bat | migration `assembly_module` — `radian_assembly_migrate.bat` (Docker two-step; also creates Item/Purchase/Inventory tables if their bats were never run — prisma diffs the whole schema) |
| 2 | Inventory consumer methods | `postAssemblyBuild` / `postAssemblyUnbuild` in `InventoryService` |
| 3 | `/assembly` API | overview · recipe · builds · unbuilds · variance |
| 4 | Screens | Overview · Build · Un-build · History · Variance + sidebar |

**Not in this module:** MAKE_TO_ORDER anything (Sales path) · recipe editing (Item) ·
work orders / multi-stage manufacturing (deliberately absent, §7b naming ruling) ·
approval gates (Roles & Permissions) · accounting entries (Finance).

## 8. Open items carried forward

- Per-line wasted-qty column on the build form — trigger: real stocktakes showing
  forgotten breakage entries (DEC-ASM-002 trade-off).
- Reverse endpoint with `reversesId` chaining for builds — v1 uses full-return un-build.
- DEC-ASM-001…008 registration in the architecture project's master Decision Log
  (provisional ids, same as DEC-ITM/PUR/INV).

## 9. ⚠️ Flags to the architecture project (mandatory sync rule)

1. **DEC-INV-002 amended** — MovementReason gains ASSEMBLY + UNBUILD (DEC-ASM-007).
2. **INV-RULE-007 clarified** — ASSEMBLY/UNBUILD movements are valued at actual build
   cost / current AVCO; AVCO **recompute** stays PURCHASE-only; MAKE_TO_STOCK item master
   cost stays recipe-AUTO (DEC-ITM-008 untouched).
3. **DEC-ASM-005's auto-wastage** is a deliberate exception to the "wastage is manual"
   ruling of DEC-ASM-002 — owner approved the asymmetry.

---

# §V2 — REDESIGN, locked with the owner 23 Jul 2026 (THIS is what the code does)

After a live audit of Biznify's Manufacturing module (his own data: 1 plan / 1
template / 1 pipeline / 1 finished-good-never-transferred / 0 waste in 1.5 years),
the owner specified his own flow. It keeps Biznify's stage visibility but fixes
what killed it there: honest inventory at every stage + a quick path.

## V2 flow

**Templates → Production pipeline → Finished goods → Transfer**, plus Overview ·
Wastage · Settings. Sidebar: Operations → Assembly.

## V2 decisions

### DEC-ASM-011 — Template is STANDALONE; the finished Item is chosen at transfer
Template = its own name + product photo + component list (`AssemblyTemplate` +
lines). Creating/editing it never checks or moves stock and is NOT tied to an
Item. At transfer time the owner picks which "Made in advance" Item receives the
pieces. (Assistant recommended auto-creating the item at template save; owner
chose standalone, twice — recorded.)
**⚠ Flag to architecture project:** composition now lives in TWO homes by role —
`AssemblyTemplate` for produced goods, `ItemComponent` for MAKE_TO_ORDER
order-time recipes (DEC-MOD-003 path unchanged).

### DEC-ASM-012 — WIP is a real warehouse: "Assembly floor" (code ASSEMBLY)
Start of production TRANSFERs components source→floor (ledger rows, refType
PRODUCTION). The stock board itself shows what sits in production. Lazily
created on first run; id cached in `InventorySetting.assemblyFloorWarehouseId`.
Double inventory is impossible: a thing is either a component (some warehouse),
or consumed into a FINISHED production (value held on the document), or the
transferred finished item's stock. Between FINISHED and TRANSFERRED the value
sits on the production document — the item doesn't exist yet (DEC-ASM-011);
the Finished-goods screen shows it loudly.

### DEC-ASM-013 — Pipeline states
`IN_PROGRESS → FINISHED → TRANSFERRED`; `CANCELLED` returns all picked
components floor→source. Stock check at start WARNS on shortage (list returned
to the UI), never blocks (DEC-INV-011). Finish: per line used + wasted;
leftovers (picked − used − wasted) auto-return to source. Finished pieces'
value = Σ(used × pick-time AVCO); unit cost = value ÷ finished qty.

### DEC-ASM-014 — Who + how long (supersedes DEC-ASM-010's shape)
`assignedTo` (কাকে বানাতে দেওয়া হলো), `startedAt`/`finishedAt`, `durationMin`
(manual override, else derived). Overview reports per-person runs · pieces ·
money · avg minutes.

### DEC-ASM-015 — Wastage lives on the finish form (supersedes DEC-ASM-002)
Used + wasted are entered while finishing; wasted posts a real WASTAGE
StockIssue (reason "Production") from the floor in the same transaction — shows
on Assembly → Wastage AND Inventory's money reports. Shelf rot stays on
Inventory → Wastage & Gift.

### DEC-ASM-016 — Quick build (the Biznify dead-chain antidote)
One checkbox on the pipeline form posts start+finish in one save for the daily
small batches. Transfer stays a separate, deliberate step (owner's ruling).

### Superseded / dropped in v2
- DEC-ASM-002 (manual wastage) → DEC-ASM-015.
- DEC-ASM-005 (un-build flow) → dropped; corrections = CANCEL before transfer;
  after transfer use Inventory Adjust/Wastage. Re-add a dismantle flow if real
  need appears (trigger recorded).
- DEC-ASM-006 (five v1 screens) → v2 screens above; v1 routes redirect.
- DEC-ASM-009 (template composed on Item recipe) → DEC-ASM-011.
- `UNBUILD` MovementReason stays in the enum (harmless, reserved).

## V2 schema / API / screens

- Models: `AssemblyTemplate(+Line)` · `AssemblyProduction(+Line)` ·
  `enum ProductionStatus`; numbers `PRD-000001`.
- InventoryService consumers (INV-RULE-001, one tx with the document):
  `postAssemblyPick` · `postAssemblyFinish` · `postAssemblyTransfer` ·
  `postAssemblyReturn` · `assemblyFloorWarehouseId()`.
- API `/assembly`: overview · wastage?days= · templates CRUD ·
  productions (list/start/:id/finish/transfer/cancel). Static above :id.
- Screens: `/assembly` (Overview: awaiting-transfer first, running, by-person,
  top templates) · `/assembly/templates` · `/assembly/pipeline` (start form +
  Quick build + list with Finish/Cancel) · `/assembly/finished` (transfer with
  item picker) · `/assembly/wastage` · `/assembly/settings`.
  Old v1 routes (`build`/`unbuild`/`history`/`variance`) redirect.
- Migration: rerun `radian_assembly_migrate.bat`. If v1 Assembly tables were
  ever created, prisma will ask to DROP AssemblyBuild/AssemblyUnbuild — they
  are empty, answer yes; every other drop still means STOP and paste the message.
