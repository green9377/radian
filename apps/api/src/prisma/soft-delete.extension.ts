import { Prisma } from '@prisma/client';

/**
 * Soft-delete only (constitution core principle) — read queries are
 * auto-filtered with deletedAt: null, so a soft-deleted record is visible
 * nowhere.
 *
 * NO_SOFT_DELETE = append-only log tables (AuditLog, ActivityEvent) — these
 * have no deletedAt and are never deleted, so the filter is skipped (otherwise
 * the query would break on a column that does not exist).
 *
 * findUnique is filtered now too (REV-MKT-1, 30 July 2026) — not in the where,
 * but after the answer comes back. It was not before, and that was the biggest
 * silent gap of all: paying a deleted affiliate, accruing commission and points
 * on a deleted order — all of it was possible.
 *
 * The limit that remains: it does not reach into a nested include. deletedAt
 * has to be checked by hand there (example: OutreachService.occasions()).
 *
 * delete = update(deletedAt) + an audit event in each owning-module service
 * (never a hard DELETE). Restoring from Trash needs the RAW client — and that
 * is right.
 */
const NO_SOFT_DELETE = new Set([
  // Variant & Option master (D-CAT-01): a colour value is renamed or switched
  // off, never soft-deleted, so `VariantValue` has no `deletedAt` — while its
  // parent `VariantAttribute` does. AddOnGroupItem is a join row that lives and
  // dies with its group, like every other line table here.
  //
  // ⚠️ These two are what the LIST BELOW was meant to prevent and did not:
  // saving a product with a colour chosen 500'd with "Unknown argument
  // `deletedAt`" (1 Aug 2026). Adding names by hand has now failed six times in
  // this file, each time recorded as "the REV-RTN-4 lesson, learned again".
  // It is not a memory problem. So the list is no longer the thing that
  // decides — see DERIVED below. These names stay because they document why.
  'VariantValue',
  'AddOnGroupItem',
  'AuditLog',
  'ActivityEvent',
  // Inventory (DEC-INV-001/012): ledger is IMMUTABLE (never deleted), balances/
  // lots/settings are derived state, doc lines live+die with their parent doc —
  // none of these carry deletedAt, so the filter would break their queries.
  'InventoryMovement',
  'InventoryStock',
  'ItemExpiryLot',
  'InventorySetting',
  'StockTransferLine',
  'StockIssueLine',
  'StocktakeLine',
  // Assembly v2 (DEC-ASM-011…016): lines live+die with their parent and carry
  // no deletedAt of their own.
  'AssemblyTemplateLine',
  'AssemblyProductionLine',
  // POS: settings is a singleton with no deletedAt (same as InventorySetting).
  'PosSetting',
  // Returns: settings is a singleton with no deletedAt (same pattern). REV-RTN-4 —
  // without this the auto deletedAt:null filter hits a non-existent column and
  // every /returns/settings call 500s (and the demo seed aborts before creating returns).
  'ReturnSetting',
  // Offers: settings singleton, same pattern (REV-RTN-4 lesson applied up front).
  'OfferSetting',
  // Finance (DEC-FIN-014): the ledger is IMMUTABLE — a posted entry is never
  // deleted, only reversed, so JournalEntry/Line carry no deletedAt. The count
  // log, the recon record and the settings singleton are the same shape.
  // (Same trap as REV-RTN-4 — without this every /finance read 500s.)
  'JournalEntry',
  'JournalLine',
  'AccountReconciliation',
  'FinancePostingFailure',
  'FinanceSetting',
  'LoanPayment',
  // HR (HR-D04/HR-R07): a day sheet row is corrected by changing its status, and
  // a payslip lives and dies with its payroll run — neither carries deletedAt.
  // (Attendance also has a @@unique([employeeId, onDate]) that a soft-deleted
  // row would block for ever, so upsert is the only sane shape here.)
  'Attendance',
  'PayrollLine',
  // Marketing: settings singleton, same pattern as OfferSetting/FinanceSetting.
  // Without this every /marketing call would query a column that is not there
  // (the REV-RTN-4 trap, third time of asking).
  'MarketingSetting',
  // SEO: settings singleton, same pattern again.
  'SeoSetting',
  // Marketing tracking ids — singleton, no deletedAt.
  'TrackingSetting',
  // MKT-D16 — the points ledger is APPEND-ONLY, like JournalLine. A correction
  // is another row with a negative delta, so there is no deletedAt to filter.
  'LoyaltyPoint',
  'ReferralCode',
  // MKT-D19 — messaging keys are a singleton; the send log is append-only
  // evidence, like AuditLog. Neither carries deletedAt.
  'MessagingSetting',
  'MessageLog',
  // MKT-D20 — a cache of what Meta reported. Refreshed, never soft-deleted.
  'AdInsight',
  // Intelligence (DEC-INT-007): DailySnapshot is a CACHE of closed days — a row
  // is rebuilt from the source, never soft-deleted, so it carries no deletedAt.
  // IntelligenceSetting is a singleton, same as InventorySetting/PosSetting.
  // Without these two entries every /intelligence call 500s on a column that
  // does not exist — the ReturnSetting lesson, applied up front.
  'DailySnapshot',
  'IntelligenceSetting',
  // Administration (ADM-D05): AccessNode is a registry built from code — to
  // retire a row you set retiredAt, not deletedAt. PositionAccess and
  // UserAccessOverride are tick rows, born and dying with their parent
  // (onDelete: Cascade). AuthToken is a one-time link — it dies by
  // usedAt/expiresAt. None of them has deletedAt, so leaving a name off this
  // list makes every call 500 (the ReturnSetting lesson, applied up front).
  // Position DOES have deletedAt — it is deliberately outside this list.
  'AccessNode',
  'PositionAccess',
  'UserAccessOverride',
  'AuthToken',
  // CompanySetting is a singleton with no deletedAt — just like
  // InventorySetting/PosSetting. Leave the name off and every
  // /administration/company call 500s.
  'CompanySetting',
  /*  Storefront (31 Jul 2026) — the REV-RTN-4 lesson, learned again the hard way.
      A heading, an opening time and a closed day are never soft-deleted: they
      are edited or removed outright. So none of them carry `deletedAt`, and the
      auto-filter hits a column that does not exist — Prisma throws "Unknown
      argument `deletedAt`" and, because SectionText is read in onModuleInit,
      the whole API refuses to BOOT rather than merely 500-ing on one screen.

      ⚠️ Adding a table here is the fix, not adding a pointless `deletedAt`
      column. SectionText got the column before this list was noticed; it is
      harmless, so it stays, but nothing else needs to copy that.  */
  'ShopHour',
  'ShopClosure',
  'StorefrontSetting',
  // DEC-PRD-050 — the badge rules, one singleton row. Named here the day the
  // table was written, not after the API refused to boot.
  'MerchSetting',
  // DEC-SAL-013 — the cancellation refund ladder. Same shape, same reason.
  'SalesSetting',
  // membership rows live and die with their collection, like every other
  // parent-owned line table above
  'CollectionProduct',
  // DEC-PRD-045 — the values inside one variant combination. A tick row,
  // born and dying with its ProductVariant (onDelete: Cascade), so it has no
  // deletedAt. Named here the day the table was written, not after the API
  // refused to boot.
  'ProductVariantValue',
  // Footer & More panel (31 Jul 2026) — links, social profiles and payment
  // badges are edited or removed outright, never soft-deleted. Added here at
  // the same time as the tables, rather than after the API refused to boot.
  'LinkGroup',
  'NavLink',
  'SocialLink',
  'PaymentBadge',
  'PageSection',
  /*  ⚠️ AppSession — caught on 30 July 2026 during the Administration review.
   *
   *  A session row has no deletedAt and never had one. Yet nothing had broken
   *  until then, because this extension only filters findMany, findFirst,
   *  count and aggregate — and the auth module uses only create / deleteMany /
   *  findUnique, none of which is filtered.
   *
   *  The "Signed in now" screen was the first thing to call
   *  `appSession.findMany()`, and it sent a query against a column that does
   *  not exist — **500 every time**. Exactly the ReturnSetting trap, only it
   *  had been lying in wait for three months.
   *
   *  The lesson: a model can look safe purely because nobody has asked it the
   *  wrong question yet.
   */
  'AppSession',
  /*  ⚠️ Two that were already broken — found on 30 July 2026 while scanning the
   *  whole API during the Administration review. Nothing to do with
   *  Administration itself, but exactly the same trap, and both are live
   *  paths:
   *
   *    SupplierPaymentAllocation  finance-events.service.ts:457 — the record of
   *      which bill a supplier's money was applied to. A findFirst 500s.
   *    BroadcastTarget            whatsapp.service.ts:222/322/325/343 — who a
   *      broadcast goes to. In four places.
   *
   *  Neither has deletedAt, and neither was on this list.
   *
   *  There is only one reason they had not been caught: those two paths have
   *  probably not been exercised yet. AppSession stayed quiet for three months
   *  in exactly this way. **This list cannot be kept correct by hand** — it is
   *  a job for a machine to count, and that is what administration.selftest.ts
   *  now does.
   */
  'SupplierPaymentAllocation',
  'BroadcastTarget',
]);

/**
 * DERIVED — every model whose schema simply has no `deletedAt` field.
 *
 * ⚠️ WHY THIS EXISTS, 1 Aug 2026. The list above is a hand-kept copy of a fact
 * the schema already knows, and it has been wrong six times, each one recorded
 * in its own comment as "the REV-RTN-4 lesson, learned again". It was wrong
 * again today: `VariantValue` was missing, so saving a product with a colour
 * chosen returned "Internal server error" and nothing said why.
 *
 * A selftest catches these, but only when somebody runs it. This cannot be
 * missed, because there is nothing to remember: if the column is not in the
 * schema, the filter is not added. Prisma ships the schema as `Prisma.dmmf`,
 * so this is read from the same file the database was built from.
 *
 * The hand-written list STAYS. It no longer decides anything, but every entry
 * explains WHY that table has no `deletedAt` — an immutable ledger, a
 * singleton, a join row that dies with its parent — and that reasoning is
 * worth more than the enforcement it used to do.
 *
 * ⚠️ It does NOT cover the opposite case: a model that HAS the column but must
 * not be filtered anyway. There is one deliberate example — `Position` — and it
 * is correctly absent from the list above. Anything like that still has to be
 * named by hand.
 */
const NO_DELETED_AT_COLUMN = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => !m.fields.some((f) => f.name === 'deletedAt'))
    .map((m) => m.name),
);

/** true when this model must not have `deletedAt: null` folded into its where */
const skipFilter = (model: string) =>
  NO_SOFT_DELETE.has(model) || NO_DELETED_AT_COLUMN.has(model);

export const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete',
  query: {
    $allModels: {
      /*  findUnique / findUniqueOrThrow — REV-MKT-1, 30 Jul 2026.
       *
       *  Prisma will not accept a non-unique field in a findUnique `where`, so
       *  `deletedAt: null` cannot be pushed down the way it is everywhere else.
       *  For a long time the header above simply warned about that and told
       *  callers to use findFirst instead. They did not: a review of Marketing
       *  found 28 findUnique calls on soft-deletable models, and 113 across the
       *  whole API.
       *
       *  What that cost, in Marketing alone: an affiliate payout could be made
       *  to a deleted affiliate, commission and loyalty points could accrue on
       *  a deleted order, and an order could be attributed to a deleted
       *  campaign. Every one of those touches money.
       *
       *  So the filter is applied AFTER the query instead of before it. The row
       *  is fetched by its unique key, and if it turns out to be soft-deleted it
       *  is dropped — which is exactly what `prisma.db.*` has always claimed to
       *  mean. Anything that genuinely needs a deleted row (restore from trash,
       *  document numbering) already uses the RAW client and is untouched.
       *
       *  Note it does NOT reach inside a nested `include`. That limit is real
       *  and still has to be handled by hand — see OutreachService.occasions().
       */
      async findUnique({ model, args, query }) {
        const row = (await query(args)) as { deletedAt?: Date | null } | null;
        if (!row || skipFilter(model)) return row;
        return row.deletedAt ? null : row;
      },
      async findUniqueOrThrow({ model, args, query }) {
        const row = (await query(args)) as { deletedAt?: Date | null };
        if (skipFilter(model)) return row;
        if (row?.deletedAt) {
          /*  Same shape Prisma itself throws, so callers that already catch
              P2025 keep working. */
          throw Object.assign(
            new Error(`No ${model} found (it was deleted)`),
            { code: 'P2025', clientVersion: 'soft-delete-extension' },
          );
        }
        return row;
      },
      async findFirst({ model, args, query }) {
        if (!skipFilter(model))
          args.where = { deletedAt: null, ...((args.where ?? {}) as Record<string, unknown>) };
        return query(args);
      },
      async findFirstOrThrow({ model, args, query }) {
        if (!skipFilter(model))
          args.where = { deletedAt: null, ...((args.where ?? {}) as Record<string, unknown>) };
        return query(args);
      },
      async findMany({ model, args, query }) {
        if (!skipFilter(model))
          args.where = { deletedAt: null, ...((args.where ?? {}) as Record<string, unknown>) };
        return query(args);
      },
      async count({ model, args, query }) {
        if (!skipFilter(model))
          args.where = { deletedAt: null, ...((args.where ?? {}) as Record<string, unknown>) };
        return query(args);
      },
      async aggregate({ model, args, query }) {
        if (!skipFilter(model))
          args.where = { deletedAt: null, ...((args.where ?? {}) as Record<string, unknown>) };
        return query(args);
      },
      /*  ⚠️ groupBy WAS NOT HERE — audit 11 Sep 2026 #11.
       *
       *  Five of the six queries behind the Orders report are `groupBy`, and
       *  every one of them counted soft-deleted orders. The HEADLINE numbers
       *  beside them are `count` and `aggregate`, which this extension has
       *  always filtered. So the page showed "412 orders" over a set of bars
       *  that added up to 419, and nothing on it said which was right — the
       *  worst kind of wrong, because both halves look authoritative.
       *
       *  It is the same one-line filter as its four neighbours. It was missing
       *  for exactly the reason AppSession was: nobody had asked this model
       *  that particular question yet, until Reports did.
       */
      async groupBy({ model, args, query }) {
        if (!skipFilter(model))
          args.where = { deletedAt: null, ...((args.where ?? {}) as Record<string, unknown>) };
        return query(args);
      },
    },
  },
});
