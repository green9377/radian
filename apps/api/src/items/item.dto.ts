import { ItemType, AssemblyMode, CostMode } from '@prisma/client';

/*
  Item Management DTOs — Master Data.
  Architecture + reasoning: RADIAN_ITEM_MODULE_ARCHITECTURE.md (locked 21 Jul 2026).

  Note what is deliberately ABSENT: any stock quantity (DEC-ITM-005), any supplier
  (Purchase module), and — DEC-ITM-018 — any SELLING price. Item owns the buy side and
  a price FLOOR; Product / POS own what the customer actually pays.
*/

export interface ItemDto {
  /// DEC-ITM-021 — this is the STOCKROOM code (Inventory/Purchase). Product keeps its
  /// own ecommerce SKU; the two link via Product.itemId, never by SKU text.
  sku?: string; // auto-derived from name when omitted
  name: string;

  /// DEC-ITM-017 — behaviour + label. Send `itemTypeId` (the row the owner picked) and
  /// the service copies its behaviour onto `itemType`; sending `itemType` alone still
  /// works, so nothing that already calls this API breaks.
  itemType: ItemType;
  itemTypeId?: string | null;

  itemCategoryId?: string | null; // DEC-ITM-007 — the Item module's own tree
  brandId?: string | null;
  /// DEC-SUP-004 — primary/usual supplier; labels vendor products on the website
  supplierId?: string | null;
  unitId: string; // REQUIRED — DEC-ITM-006

  imageUrl?: string | null; // DEC-ITM-012 — one warehouse mugshot (data URL interim)

  isStockTracked?: boolean;
  assemblyMode?: AssemblyMode;

  // DEC-ITM-013 — not derivable from itemType, so they are their own flags
  isSaleable?: boolean;
  isPurchasable?: boolean;
  isReturnable?: boolean;

  weightGram?: number | null; // DEC-ITM-014 — courier pricing is by weight

  /// DEC-ITM-015 — Colour / Size labels, taken from the shared VariantValue master.
  /// Descriptive only: "Red Rose" and "White Rose" stay two separate Items.
  /// Sending the array REPLACES the whole set (simplest honest semantics for a m2m).
  attributeValueIds?: string[];

  costMode?: CostMode;
  standardCostPaisa?: number; // the purchase rate — what we pay, in paisa

  /// DEC-ITM-018 — the floor, not the price. Percent wins when both are sent.
  minMarginBp?: number | null; // 1500 = 15% minimum profit
  minMarginPaisa?: number | null; // …or a flat taka figure, in paisa

  /// DEC-ITM-022/023 — the counter price OVERRIDE. Null = follow cost + markup.
  sellingPricePaisa?: number | null;
  /// this item's own profit percent in basis points; null = the shop default
  markupBp?: number | null;

  /// DEC-ITM-019 — defaults the Sales module starts from, never the final figure
  vatRateBp?: number | null; // 750 = 7.5%
  maxDiscountBp?: number | null; // the most any seller may knock off

  isPerishable?: boolean;
  shelfLifeDays?: number | null;
  reorderLevel?: number | null;
  description?: string | null;

  isActive?: boolean;
  actorName?: string;
}

export type ItemPatch = Partial<ItemDto>;

/** one recipe line — quantities are integer thousandths, percentages are basis points */
export interface ComponentDto {
  componentItemId: string;
  qtyMilli: number; // 24 stems = 24000
  unitId?: string; // defaults to the component's own unit
  wastageBp?: number; // 500 = 5%
  isOptional?: boolean;
  displayText?: string | null;
  sortOrder?: number;
  actorName?: string;
}

export type ComponentPatch = Partial<Omit<ComponentDto, 'componentItemId'>>;

/**
 * DEC-ITM-016 — create a whole variant family in one go.
 * "Rose" + Colour[Red, Yellow, White] → three REAL, independent Items:
 *   Rose — Red · Rose — Yellow · Rose — White
 * Each gets its own SKU, its own cost and (later) its own stock, and they all sit in
 * the same ItemCategory. There is deliberately NO parent record: a "Rose" that is
 * never bought, never counted and never sold would be a ghost row.
 */
export interface VariantGenerateDto {
  baseName: string; // "Rose"
  itemType: ItemType;
  unitId: string;
  itemCategoryId?: string | null;
  brandId?: string | null;
  /** one array per attribute — the cartesian product is generated */
  valueIdGroups: string[][];

  /**
   * The GROUP photo — used for every generated item that has no photo of its own
   * (sobuj, 21 Jul: "group item image dewar option lagbe"). Data URL, like Item.imageUrl.
   */
  imageUrl?: string | null;

  /**
   * Per-variant overrides. The admin previews the exact combinations before creating
   * them, so it can send the ones that need their own photo — "Rose — Red" gets a red
   * rose picture even though the family photo is a mixed bouquet.
   * `valueIds` must match a generated combination; anything else is ignored.
   */
  variantImages?: { valueIds: string[]; imageUrl: string | null }[];
  standardCostPaisa?: number;
  isPerishable?: boolean;
  shelfLifeDays?: number | null;
  weightGram?: number | null;
  isSaleable?: boolean;
  isPurchasable?: boolean;
  isReturnable?: boolean;
  skuPrefix?: string;
  actorName?: string;
}

export interface ItemListQuery {
  search?: string;
  type?: string; // ItemType, or "ALL"
  groupId?: string;
  assembly?: string; // AssemblyMode, or "ALL"
  status?: 'all' | 'active' | 'hidden';
  sort?: 'name' | 'sku' | 'cost' | 'created';
  dir?: 'asc' | 'desc';
}
