import { Prisma } from '@prisma/client';

/**
 * Soft-delete only (constitution core principle) — read query-তে deletedAt: null
 * auto-filter হয়, ফলে soft-deleted রেকর্ড কোথাও দেখা যায় না।
 *
 * NO_SOFT_DELETE = append-only log table (AuditLog, ActivityEvent) — এদের deletedAt
 * নেই ও কখনো delete হয় না, তাই filter বাদ (নইলে অস্তিত্বহীন column-এ query ভাঙবে)।
 *
 * findUnique-ও এখন filter হয় (REV-MKT-1, ৩০ জুলাই ২০২৬) — where-এ নয়, উত্তর
 * আসার পর। আগে হতো না, আর সেটাই ছিল সবচেয়ে বড় নীরব ফাঁক: মুছে ফেলা affiliate-কে
 * টাকা দেওয়া, মুছে ফেলা order-এ commission ও points জমা — সবই সম্ভব ছিল।
 *
 * সীমা যা এখনো আছে: nested include-এ পৌঁছায় না। ওখানে হাতে deletedAt দেখতে হবে
 * (উদাহরণ: OutreachService.occasions())।
 *
 * delete = প্রতিটি owning-module service-এ update(deletedAt) + audit event
 * (hard DELETE কখনো নয়)। Trash থেকে ফেরাতে RAW client লাগে — সেটাই ঠিক।
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
  // Administration (ADM-D05): AccessNode হলো কোড থেকে তৈরি registry — সারি
  // মুছতে হলে retiredAt বসে, deletedAt নয়। PositionAccess ও UserAccessOverride
  // হলো টিকের সারি, বাবার সাথে জন্মায় ও মরে (onDelete: Cascade)। AuthToken
  // এককালীন লিংক — usedAt/expiresAt দিয়ে মরে। কারোরই deletedAt নেই, তাই এখানে
  // নাম না থাকলে প্রতিটা call ৫০০ দেবে (ReturnSetting-এর শিক্ষা, আগেভাগে প্রয়োগ)।
  // Position-এর deletedAt আছে — সে ইচ্ছে করেই এই তালিকার বাইরে।
  'AccessNode',
  'PositionAccess',
  'UserAccessOverride',
  'AuthToken',
  // CompanySetting হলো singleton, deletedAt নেই — InventorySetting/PosSetting-এর
  // মতোই। নাম না থাকলে প্রতিটা /administration/company call ৫০০ দেবে।
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
  // membership rows live and die with their collection, like every other
  // parent-owned line table above
  'CollectionProduct',
  // Footer & More panel (31 Jul 2026) — links, social profiles and payment
  // badges are edited or removed outright, never soft-deleted. Added here at
  // the same time as the tables, rather than after the API refused to boot.
  'LinkGroup',
  'NavLink',
  'SocialLink',
  'PaymentBadge',
  'PageSection',
  /*  ⚠️ AppSession — ৩০ জুলাই ২০২৬, Administration রিভিউতে ধরা পড়েছে।
   *
   *  সেশনের সারিতে deletedAt নেই, আর কখনো ছিল না। তবু আজ পর্যন্ত কিছু ভাঙেনি,
   *  কারণ এই extension শুধু findMany, findFirst, count আর aggregate-এ filter
   *  বসায় — আর auth module শুধু create / deleteMany / findUnique ব্যবহার করে,
   *  যার একটাও filter হয় না।
   *
   *  "Signed in now" পর্দাটাই প্রথম যে `appSession.findMany()` ডাকল, আর সেটা
   *  অস্তিত্বহীন column-এ query পাঠিয়ে **প্রতিবার ৫০০ দিত**। ঠিক
   *  ReturnSetting-এর ফাঁদ, শুধু তিন মাস ঘাপটি মেরে বসে ছিল।
   *
   *  শিক্ষা: একটা model নিরাপদ মনে হওয়ার কারণ হতে পারে শুধু এটাই যে তাকে এখনো
   *  ভুল ভাবে জিজ্ঞেস করা হয়নি।
   */
  'AppSession',
  /*  ⚠️ দুটো আগের থেকেই ভাঙা ছিল — ৩০ জুলাই ২০২৬, Administration রিভিউয়ের সময়
   *  পুরো API স্ক্যান করতে গিয়ে বেরিয়েছে। Administration-এর নিজের কোনো সম্পর্ক
   *  নেই, কিন্তু ঠিক একই ফাঁদ, আর দুটোই জ্যান্ত পথ:
   *
   *    SupplierPaymentAllocation  finance-events.service.ts:457 — সাপ্লায়ারের
   *      টাকা কোন বিলে বসল সেই হিসাব। findFirst করলেই ৫০০।
   *    BroadcastTarget            whatsapp.service.ts:222/322/325/343 — broadcast
   *      কাকে কাকে যাবে। চারটে জায়গায়।
   *
   *  কোনোটারই deletedAt নেই, আর কোনোটাই এই তালিকায় ছিল না।
   *
   *  একটাই কারণে এখনো ধরা পড়েনি: ওই দুটো পথ সম্ভবত এখনো চালানো হয়নি। AppSession
   *  তিন মাস চুপ ছিল ঠিক এভাবেই। **এই তালিকা হাতে ঠিক রাখা যায় না** — এটা যন্ত্রে
   *  গোনার কাজ, আর সেটাই এখন administration.selftest.ts করে।
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
    },
  },
});
