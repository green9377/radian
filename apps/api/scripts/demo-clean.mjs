/*
  DEMO CLEAN — wipe every piece of business/demo data from the DEMO database,
  keeping configuration, so the owner can rebuild the catalog for real.
  (Owner's order, 6 Aug 2026: "joto demo data ache ... sob kichu clean koro,
  ami akdom sob new kore upload kore ek ek kore sob check korbo".)

  WIPED   orders · POS sales/shifts · returns · customers · conversations ·
          reviews · products (incl. trash) and every product child · items ·
          inventory · purchases · suppliers · categories · tags · brands ·
          collections · banners · offers · campaigns · finance transactions ·
          loyalty/referral/outreach history · analytics snapshots
  KEPT    staff & sign-ins · access control · integration keys (SSLCommerz,
          WhatsApp…) · delivery zones/methods/slots/riders/couriers · company
          settings · trust badges · content pages/FAQ/journal · SEO ·
          WhatsApp templates · chart of accounts · every *Setting table ·
          masters that are seeded (units, tag groups, supplier types,
          variant attributes, item categories) · audit trail

  HOW IT RUNS
    Dry-run by default — prints the row counts it WOULD delete and exits.
    Add --yes to actually delete. Always in one transaction: all or nothing.

    DATABASE_URL must point at the DEMO database (the .bat wrapper loads
    NEON_DIRECT_URL from .env.secrets.local). As a guard, the script REFUSES
    to run against a URL that does not contain "neon" unless --force is given
    — the local Docker DB and the future production DB are not demo.
*/

import { PrismaClient } from '@prisma/client';

const YES = process.argv.includes('--yes');
const FORCE = process.argv.includes('--force');

const url = process.env.DATABASE_URL || '';
if (!url) {
  console.error('DATABASE_URL is not set. Run through RADIAN_DEMO_CLEAN.bat.');
  process.exit(1);
}
if (!/neon/i.test(url) && !FORCE) {
  console.error('DATABASE_URL does not look like the Neon demo database.');
  console.error('Refusing to run. If you are absolutely sure, add --force.');
  process.exit(1);
}

/*  Children before parents. The order below is FK-safe for the current
    schema; if a future table blocks a delete, the transaction rolls back
    and the failing table is printed — nothing half-deletes.  */
const WIPE = [
  // inbox
  'EscalationEvent', 'Message', 'Conversation',
  // messaging history
  'MessageLog', 'BroadcastTarget', 'Broadcast',
  // marketing history
  'Outreach', 'MarketingOptOut', 'OrderAttribution',
  'AffiliateCommission', 'AffiliatePayout', 'Affiliate',
  'LoyaltyPoint', 'Referral', 'ReferralCode',
  'AdInsight', 'DailySnapshot',
  // Campaign moved down to the finance block: Expense.campaignId points here.
  // offers
  'OfferRedemption', 'Offer',
  // orders & payments
  /*  Two children added in Aug 2026, after this list was first written, and both
      hold a foreign key into rows deleted a few lines below — so they have to go
      first or the whole transaction rolls back:
        ReviewInvite          -> Order, Customer, Product
        CarrierRemittanceLine -> CarrierRemittance, DeliveryAssignment
      Caught by the dry run, which is exactly what the dry run is for.  */
  'ReviewInvite', 'CarrierRemittanceLine',
  'OrderPhoto', 'PaymentTransaction', 'PaymentSession',
  'SalesReturnLine', 'SalesReturn', 'CustomerCredit',
  'OrderMessage', 'OrderLine', 'DeliveryAssignment', 'CapacityBooking',
  'CheckoutLead', 'Order',
  // POS
  'PosCashMovement', 'PosHeldCart', 'PosShift',
  // reviews — before Customer: Review.customerId points at it
  'Review',
  // customers
  'RecipientOccasion', 'Recipient', 'Customer',
  // assembly
  'AssemblyProductionLine', 'AssemblyProduction',
  'AssemblyTemplateLine', 'AssemblyTemplate',
  // product children, then products
  'CollectionProduct', 'ProductVariant',
  'BundleComboItem', 'BundleCombo', 'BundleItem', 'Bundle', 'CraftPoint',
  'ProductImage', 'ProductSize', 'ProductSpec', 'ProductFaq', 'ProductTrustBadge',
  'ProductDeliveryType',
  'AddOnRule', 'AddOnGroupItem', 'AddOnGroup', 'AddOn',
  'Product',
  // inventory
  'ItemExpiryLot', 'StocktakeLine', 'Stocktake',
  'StockIssueLine', 'StockIssue', 'StockTransferLine', 'StockTransfer',
  'InventoryMovement', 'InventoryStock',
  // purchases & suppliers (types kept)
  'SupplierPaymentAllocation', 'SupplierPayment', 'SupplierAdjustment', 'SupplierCredit',
  'PurchaseReturnLine', 'PurchaseReturn', 'PurchasePayment', 'PurchaseLine', 'Purchase',
  // items (masters kept) — before Supplier: Item.supplierId points at it
  'ItemComponent', 'Item',
  'Supplier',
  // finance transactions (chart of accounts + settings kept)
  'JournalLine', 'JournalEntry', 'Expense', 'Campaign', 'Income', 'Transfer',
  'PartnerTransaction', 'Partner', 'CarrierRemittance', 'AccountReconciliation',
  'LoanPayment', 'Loan', 'PrepaidItem', 'FixedAsset', 'FinancePostingFailure',
  'RecurringExpense',
  // catalog last (products pointed at these)
  'Tag',
  'CategoryTrustBadge', 'CategorySpec', 'CategoryFaq', 'Category',
  // capacity groups sit on products — and Category.capacityGroupId points here,
  // so this has to come after Category, not before it.
  'CapacityGroup',
  'Brand', 'Collection', 'Banner',
];

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  console.log(YES ? '\n⚠ LIVE RUN — deleting.\n' : '\nDRY RUN — nothing will be deleted. Add --yes to delete.\n');

  const counts = [];
  for (const t of WIPE) {
    const [{ n }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${t}"`);
    if (n > 0) counts.push([t, n]);
  }

  if (counts.length === 0) {
    console.log('Already clean — nothing to delete.');
    return;
  }
  const width = Math.max(...counts.map(([t]) => t.length));
  for (const [t, n] of counts) console.log(`  ${t.padEnd(width)}  ${n}`);
  const total = counts.reduce((s, [, n]) => s + n, 0);
  console.log(`\n  ${counts.length} tables, ${total} rows${YES ? '' : ' would be deleted'}.`);

  if (!YES) return;

  await prisma.$transaction(
    async (tx) => {
      for (const t of WIPE) {
        await tx.$executeRawUnsafe(`DELETE FROM "${t}"`);
      }
    },
    { timeout: 120000 },
  );
  console.log('\nDone. The demo database now holds configuration only.');
}

main()
  .catch((e) => {
    console.error('\nFailed — nothing was deleted (single transaction).');
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
