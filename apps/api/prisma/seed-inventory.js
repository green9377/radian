// Inventory module seed — DEC-INV-014 (warehouses) + DEC-INV-003 (settings row)
// Idempotent: safe to run twice. JS on purpose (same reason as seed-orders.js).
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  const shop = await db.warehouse.upsert({
    where: { code: 'SHOP' },
    update: {},
    create: { code: 'SHOP', name: 'Shop' },
  });
  const store = await db.warehouse.upsert({
    where: { code: 'STORE' },
    update: {},
    create: { code: 'STORE', name: 'Storeroom' },
  });

  await db.inventorySetting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      defaultSaleWarehouseId: shop.id, // DEC-INV-003: all sales deduct from Shop by default
      defaultReceiveWarehouseId: store.id,
      allowPerOrderWarehouse: false,
      negativeStockPolicy: 'ALLOW_WARN', // DEC-INV-011
    },
  });

  console.log('Inventory seed OK:', shop.code, '+', store.code, '+ settings');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
