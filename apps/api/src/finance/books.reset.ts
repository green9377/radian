/* eslint-disable no-console */
/**
 * Start the books again.
 *
 * Removes every TRADE and every LEDGER ENTRY, and keeps everything you set up.
 * Run with no argument to see exactly what would go; run with `--confirm` to
 * actually do it.
 *
 * Why this exists rather than a careful row-by-row cleanup: the finance doctor
 * found no trade in this ledger that survives inspection. Orders are numbered
 * RAD-D001…D012 by the demo seeder, seven of them share one day, there are two
 * customers, no purchases at all, a loan whose own note says "checked by drift
 * test" and an expense called "ACCESS TEST - delete me". Picking through 35
 * entries by hand to keep none of them is more risk than starting over.
 *
 * It also dissolves a problem that is otherwise awkward: the opening balance
 * has already been posted once with practice figures, and Finance will never
 * post a second one (same sourceKey, FIN-RULE-021). Clearing the ledger clears
 * that too, so the real opening balance can simply be entered.
 *
 * KEPT — everything that took thought to set up:
 *   chart of accounts · items · products · categories · brands · units · tags
 *   suppliers · delivery methods and slots · couriers · riders · offers
 *   employees and job roles · logins and PINs · every setting except the
 *   month-lock
 *
 * GONE — everything that describes trading that never happened:
 *   the whole ledger · expenses · income · transfers · partner movements
 *   assets · prepaid · loans · remittances · reconciliations
 *   orders and their payments · returns · POS shifts · purchases
 *   stock movements and balances · assembly runs · delivery assignments
 *   demo customers · payroll runs and attendance
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

const CONFIRM = process.argv.includes('--confirm');

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const p = app.get(PrismaService);

  /*  Order matters — children before parents, or a foreign key stops us
      halfway with the books in a state nobody planned. */
  const plan: { label: string; count: () => Promise<number>; wipe: () => Promise<unknown> }[] = [
    // ---- the ledger itself
    { label: 'journal lines', count: () => p.journalLine.count(), wipe: () => p.journalLine.deleteMany({}) },
    { label: 'journal entries', count: () => p.journalEntry.count(), wipe: () => p.journalEntry.deleteMany({}) },

    // ---- finance sub-records
    { label: 'expenses', count: () => p.expense.count(), wipe: () => p.expense.deleteMany({}) },
    { label: 'income', count: () => p.income.count(), wipe: () => p.income.deleteMany({}) },
    { label: 'transfers', count: () => p.transfer.count(), wipe: () => p.transfer.deleteMany({}) },
    { label: 'partner movements', count: () => p.partnerTransaction.count(), wipe: () => p.partnerTransaction.deleteMany({}) },
    { label: 'loan payments', count: () => p.loanPayment.count(), wipe: () => p.loanPayment.deleteMany({}) },
    { label: 'loans', count: () => p.loan.count(), wipe: () => p.loan.deleteMany({}) },
    { label: 'fixed assets', count: () => p.fixedAsset.count(), wipe: () => p.fixedAsset.deleteMany({}) },
    { label: 'prepaid items', count: () => p.prepaidItem.count(), wipe: () => p.prepaidItem.deleteMany({}) },
    { label: 'carrier remittances', count: () => p.carrierRemittance.count(), wipe: () => p.carrierRemittance.deleteMany({}) },
    { label: 'reconciliations', count: () => p.accountReconciliation.count(), wipe: () => p.accountReconciliation.deleteMany({}) },
    { label: 'posting failures', count: () => p.financePostingFailure.count(), wipe: () => p.financePostingFailure.deleteMany({}) },

    // ---- payroll (the runs, not the people)
    { label: 'payslips', count: () => p.payrollLine.count(), wipe: () => p.payrollLine.deleteMany({}) },
    { label: 'payroll runs', count: () => p.payroll.count(), wipe: () => p.payroll.deleteMany({}) },
    { label: 'attendance days', count: () => p.attendance.count(), wipe: () => p.attendance.deleteMany({}) },

    // ---- returns, before the orders they hang off
    { label: 'return lines', count: () => p.salesReturnLine.count(), wipe: () => p.salesReturnLine.deleteMany({}) },
    { label: 'returns', count: () => p.salesReturn.count(), wipe: () => p.salesReturn.deleteMany({}) },
    { label: 'customer credits', count: () => p.customerCredit.count(), wipe: () => p.customerCredit.deleteMany({}) },

    // ---- POS
    { label: 'POS cash movements', count: () => p.posCashMovement.count(), wipe: () => p.posCashMovement.deleteMany({}) },
    { label: 'POS held carts', count: () => p.posHeldCart.count(), wipe: () => p.posHeldCart.deleteMany({}) },
    { label: 'POS shifts', count: () => p.posShift.count(), wipe: () => p.posShift.deleteMany({}) },

    // ---- delivery + offers hanging off orders
    { label: 'delivery assignments', count: () => p.deliveryAssignment.count(), wipe: () => p.deliveryAssignment.deleteMany({}) },
    { label: 'offer redemptions', count: () => p.offerRedemption.count(), wipe: () => p.offerRedemption.deleteMany({}) },

    // ---- the orders
    { label: 'order photos', count: () => p.orderPhoto.count(), wipe: () => p.orderPhoto.deleteMany({}) },
    { label: 'order payments', count: () => p.paymentTransaction.count(), wipe: () => p.paymentTransaction.deleteMany({}) },
    { label: 'order lines', count: () => p.orderLine.count(), wipe: () => p.orderLine.deleteMany({}) },
    { label: 'orders', count: () => p.order.count(), wipe: () => p.order.deleteMany({}) },

    // ---- purchases
    { label: 'purchase return lines', count: () => p.purchaseReturnLine.count(), wipe: () => p.purchaseReturnLine.deleteMany({}) },
    { label: 'purchase returns', count: () => p.purchaseReturn.count(), wipe: () => p.purchaseReturn.deleteMany({}) },
    { label: 'supplier payment splits', count: () => p.supplierPaymentAllocation.count(), wipe: () => p.supplierPaymentAllocation.deleteMany({}) },
    { label: 'supplier payments', count: () => p.supplierPayment.count(), wipe: () => p.supplierPayment.deleteMany({}) },
    { label: 'supplier adjustments', count: () => p.supplierAdjustment.count(), wipe: () => p.supplierAdjustment.deleteMany({}) },
    { label: 'supplier credits', count: () => p.supplierCredit.count(), wipe: () => p.supplierCredit.deleteMany({}) },
    { label: 'purchase payments', count: () => p.purchasePayment.count(), wipe: () => p.purchasePayment.deleteMany({}) },
    { label: 'purchase lines', count: () => p.purchaseLine.count(), wipe: () => p.purchaseLine.deleteMany({}) },
    { label: 'purchases', count: () => p.purchase.count(), wipe: () => p.purchase.deleteMany({}) },

    // ---- stock: movements are the truth, balances are derived, both go
    { label: 'assembly production lines', count: () => p.assemblyProductionLine.count(), wipe: () => p.assemblyProductionLine.deleteMany({}) },
    { label: 'assembly runs', count: () => p.assemblyProduction.count(), wipe: () => p.assemblyProduction.deleteMany({}) },
    { label: 'stock transfer lines', count: () => p.stockTransferLine.count(), wipe: () => p.stockTransferLine.deleteMany({}) },
    { label: 'stock transfers', count: () => p.stockTransfer.count(), wipe: () => p.stockTransfer.deleteMany({}) },
    { label: 'stock issue lines', count: () => p.stockIssueLine.count(), wipe: () => p.stockIssueLine.deleteMany({}) },
    { label: 'stock issues', count: () => p.stockIssue.count(), wipe: () => p.stockIssue.deleteMany({}) },
    { label: 'stocktake lines', count: () => p.stocktakeLine.count(), wipe: () => p.stocktakeLine.deleteMany({}) },
    { label: 'stocktakes', count: () => p.stocktake.count(), wipe: () => p.stocktake.deleteMany({}) },
    { label: 'expiry lots', count: () => p.itemExpiryLot.count(), wipe: () => p.itemExpiryLot.deleteMany({}) },
    { label: 'stock movements', count: () => p.inventoryMovement.count(), wipe: () => p.inventoryMovement.deleteMany({}) },
    { label: 'stock balances', count: () => p.inventoryStock.count(), wipe: () => p.inventoryStock.deleteMany({}) },

    // ---- the practice customers, and what hangs off them
    { label: 'recipient occasions', count: () => p.recipientOccasion.count(), wipe: () => p.recipientOccasion.deleteMany({}) },
    { label: 'recipients', count: () => p.recipient.count(), wipe: () => p.recipient.deleteMany({}) },
    { label: 'customers', count: () => p.customer.count(), wipe: () => p.customer.deleteMany({}) },
  ];

  console.log('\n############################################################');
  console.log(CONFIRM ? '#  STARTING THE BOOKS AGAIN                                #'
                      : '#  PREVIEW ONLY — nothing will be changed                  #');
  console.log('############################################################\n');

  let total = 0;
  const rows: { label: string; n: number }[] = [];
  for (const step of plan) {
    const n = await step.count();
    total += n;
    rows.push({ label: step.label, n });
  }
  for (const r of rows) if (r.n > 0) console.log(`  ${String(r.n).padStart(6)}  ${r.label}`);
  console.log(`\n  ${total} rows in total.\n`);

  /* what stays, counted, so it is visible that it stays */
  const [accounts, items, products, suppliers, employees, users, offers, methods] = await Promise.all([
    p.financeAccount.count(), p.item.count(), p.product.count(), p.supplier.count(),
    p.employee.count(), p.appUser.count(), p.offer.count(), p.deliveryMethod.count(),
  ]);
  console.log('  KEPT, untouched:');
  console.log(`    ${accounts} accounts · ${items} items · ${products} products · ${suppliers} suppliers`);
  console.log(`    ${employees} employees · ${users} logins · ${offers} offers · ${methods} delivery methods\n`);

  if (!CONFIRM) {
    console.log('  This was a preview. Nothing was touched.');
    console.log('  Run the file again and type RESET when it asks, to go ahead.\n');
    await app.close();
    process.exit(0);
  }

  console.log('  Working...\n');
  for (const step of plan) {
    const before = await step.count();
    if (before === 0) continue;
    await step.wipe();
    console.log(`    cleared ${String(before).padStart(6)}  ${step.label}`);
  }

  /*  The month-lock has to go too: June was closed during testing, and a closed
      month refuses any entry dated inside it — including the real opening
      balance, if it is dated earlier than the lock. Everything else in settings
      is kept. */
  const setting = await p.financeSetting.findFirst();
  if (setting) {
    await p.financeSetting.update({
      where: { id: setting.id },
      data: { lastClosedDate: null },
    });
    console.log('\n    month-lock cleared (June had been closed during testing)');
  }

  const left = await p.journalEntry.count();
  console.log(`\n  Done. The ledger now holds ${left} entries.\n`);
  console.log('  Next, in this order:');
  console.log('    1. Finance → Settings → set the go-live date to the day you start');
  console.log('    2. Finance → Opening balances → enter the real cash, bKash, bank,');
  console.log('       stock, what customers owe you and what you owe suppliers, then Post');
  console.log('    3. Finance → Books vs reality → run it; everything should be green\n');

  await app.close();
  process.exit(0);
}

void main();
