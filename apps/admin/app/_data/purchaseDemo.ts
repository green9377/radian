import type { ApiPurchase, PurchaseStats } from "./api";

/*
  Demo purchases — shown ONLY when the API (:4000) is unreachable, so every screen
  still demonstrates itself (§১০.৪ pattern). Deliberately messy on purpose: paid,
  part-paid, unpaid, an advance waiting for goods, a return with a credit — the
  same mix the owner's real Biznify data showed on 22 Jul.
  Supplier names mirror his real world: Kamal Mama, DCC, Ajghor vai, Paper Tarek.
*/

const day = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();

function shape(
  p: Omit<
    ApiPurchase,
    "paidPaisa" | "duePaisa" | "payablePaisa" | "returnedPaisa" | "partiallyReceived" | "fullyReceived" | "paymentState"
  >,
): ApiPurchase {
  const paidPaisa = p.payments.reduce((s, x) => s + x.amountPaisa, 0);
  const dueCut = p.returns.reduce((s, r) => s + r.dueCutPaisa, 0);
  const payablePaisa = Math.max(p.grandTotalPaisa - dueCut, 0);
  const duePaisa = Math.max(payablePaisa - paidPaisa, 0);
  const ordered = p.lines.reduce((s, l) => s + l.qtyMilli, 0);
  const received = p.lines.reduce((s, l) => s + l.receivedQtyMilli, 0);
  return {
    ...p,
    paidPaisa,
    duePaisa,
    payablePaisa,
    returnedPaisa: p.returns.reduce((s, r) => s + r.totalPaisa, 0),
    partiallyReceived: p.status !== "RECEIVED" && received > 0 && received < ordered,
    fullyReceived: p.status === "RECEIVED",
    paymentState: duePaisa === 0 && payablePaisa > 0 ? "PAID" : paidPaisa > 0 ? "PARTIAL" : "UNPAID",
  };
}

const L = (
  id: string,
  name: string,
  sku: string,
  unit: string,
  qtyMilli: number,
  receivedQtyMilli: number,
  unitPricePaisa: number,
) => ({
  id,
  itemId: `demo-item-${sku}`,
  item: { id: `demo-item-${sku}`, sku, name, imageUrl: null },
  unitId: `demo-unit-${unit}`,
  unit: { id: `demo-unit-${unit}`, name: unit, shortCode: unit.toLowerCase() },
  factorSnapshot: 1,
  qtyMilli,
  receivedQtyMilli,
  unitPricePaisa,
  lineTotalPaisa: Math.round((qtyMilli * unitPricePaisa) / 1000),
});

export const DEMO_PURCHASES: ApiPurchase[] = [
  // this morning's market run — the everyday case: quick entry, cash, done
  shape({
    id: "dp1",
    purchaseNo: "PUR-000006",
    status: "RECEIVED",
    supplierName: "Shahbagh bazar",
    purchaseDate: iso(0),
    receivedAt: iso(0),
    supplierReceiptNo: null,
    attachmentUrl: null,
    notes: "Morning flowers",
    subTotalPaisa: 810_000,
    discountPaisa: 0,
    grandTotalPaisa: 810_000,
    lines: [
      L("dp1l1", "Red Rose Stem", "RED-ROSE-STEM", "Stem", 500_000, 500_000, 1_500),
      L("dp1l2", "Rajanigandha Stick", "RAJANI-STICK", "Stick", 200_000, 200_000, 300),
    ],
    payments: [{ id: "dp1p1", amountPaisa: 810_000, method: "CASH", paidAt: iso(0), note: null }],
    returns: [],
  }),
  // part-paid teddy order — due hanging, exactly the Kamal Mama pattern
  shape({
    id: "dp2",
    purchaseNo: "PUR-000005",
    status: "RECEIVED",
    supplierName: "Kamal Mama",
    purchaseDate: iso(2),
    receivedAt: iso(1),
    supplierReceiptNo: "KM-4471",
    attachmentUrl: null,
    notes: null,
    subTotalPaisa: 3_480_000,
    discountPaisa: 0,
    grandTotalPaisa: 3_480_000,
    lines: [L("dp2l1", "Teddy Bear 30cm", "TEDDY-30", "Piece", 100_000, 100_000, 34_800)],
    payments: [{ id: "dp2p1", amountPaisa: 1_360_000, method: "BKASH", paidAt: iso(1), note: "advance" }],
    returns: [],
  }),
  // advance paid, goods still on the road — the Valentine pattern
  shape({
    id: "dp3",
    purchaseNo: "PUR-000004",
    status: "ADVANCE_PAID",
    supplierName: "AB Flower",
    purchaseDate: iso(3),
    receivedAt: null,
    supplierReceiptNo: null,
    attachmentUrl: null,
    notes: "Imported lilies for the weekend",
    subTotalPaisa: 2_000_000,
    discountPaisa: 0,
    grandTotalPaisa: 2_000_000,
    lines: [L("dp3l1", "White Lily Stick", "LILY-WHITE", "Stick", 200_000, 0, 10_000)],
    payments: [{ id: "dp3p1", amountPaisa: 500_000, method: "NAGAD", paidAt: iso(3), note: "advance" }],
    returns: [],
  }),
  // packaging restock — unpaid, supplier bills monthly
  shape({
    id: "dp4",
    purchaseNo: "PUR-000003",
    status: "RECEIVED",
    supplierName: "Paper Tarek",
    purchaseDate: iso(6),
    receivedAt: iso(6),
    supplierReceiptNo: "PT-2107",
    attachmentUrl: null,
    notes: null,
    subTotalPaisa: 350_000,
    discountPaisa: 10_000,
    grandTotalPaisa: 340_000,
    lines: [
      L("dp4l1", "Wrapping Paper (black)", "WRAP-BLACK", "Sheet", 100_000, 100_000, 2_500),
      L("dp4l2", "Satin Ribbon Roll", "RIBBON-SATIN", "Roll", 10_000, 10_000, 10_000),
    ],
    payments: [],
    returns: [],
  }),
  // the post-Valentine return: due cut first, the rest became credit
  shape({
    id: "dp5",
    purchaseNo: "PUR-000002",
    status: "RECEIVED",
    supplierName: "Kamal Mama",
    purchaseDate: iso(14),
    receivedAt: iso(14),
    supplierReceiptNo: null,
    attachmentUrl: null,
    notes: "Valentine bulk",
    subTotalPaisa: 3_620_000,
    discountPaisa: 0,
    grandTotalPaisa: 3_620_000,
    lines: [L("dp5l1", "Red Rose Stem", "RED-ROSE-STEM", "Stem", 2_000_000, 2_000_000, 1_810)],
    payments: [{ id: "dp5p1", amountPaisa: 3_400_000, method: "CASH", paidAt: iso(13), note: null }],
    returns: [
      {
        id: "dp5r1",
        returnNo: "PRT-000001",
        returnDate: iso(12),
        reason: "Wilted on arrival",
        totalPaisa: 362_000,
        dueCutPaisa: 220_000,
        creditPaisa: 142_000,
        lines: [{ id: "dp5rl1", purchaseLineId: "dp5l1", qtyMilli: 200_000, valuePaisa: 362_000 }],
      },
    ],
  }),
  // a cancelled order — supplier could not deliver
  shape({
    id: "dp6",
    purchaseNo: "PUR-000001",
    status: "CANCELLED",
    supplierName: "DCC",
    purchaseDate: iso(20),
    receivedAt: null,
    supplierReceiptNo: null,
    attachmentUrl: null,
    notes: "Supplier out of stock — cancelled before any payment",
    subTotalPaisa: 92_000,
    discountPaisa: 0,
    grandTotalPaisa: 92_000,
    lines: [L("dp6l1", "Gypsy Bunch", "GYPSY-BUNCH", "Bunch", 40_000, 0, 2_300)],
    payments: [],
    returns: [],
  }),
];

const live = DEMO_PURCHASES.filter((p) => p.status !== "CANCELLED");
export const DEMO_PURCHASE_STATS: PurchaseStats = {
  totalBoughtPaisa: live.reduce((s, p) => s + p.grandTotalPaisa, 0),
  totalPaidPaisa: live.reduce((s, p) => s + p.paidPaisa, 0),
  totalDuePaisa: live.reduce((s, p) => s + p.duePaisa, 0),
  monthBoughtPaisa: live.filter((p) => new Date(p.purchaseDate).getMonth() === new Date().getMonth()).reduce((s, p) => s + p.grandTotalPaisa, 0),
  monthCount: live.filter((p) => new Date(p.purchaseDate).getMonth() === new Date().getMonth()).length,
  dueCount: live.filter((p) => p.duePaisa > 0).length,
  advanceWaiting: live
    .filter((p) => p.status === "ADVANCE_PAID")
    .map((p) => ({
      id: p.id,
      purchaseNo: p.purchaseNo,
      supplierName: p.supplierName,
      paidPaisa: p.paidPaisa,
      grandTotalPaisa: p.grandTotalPaisa,
      purchaseDate: p.purchaseDate,
    })),
  openCreditPaisa: 142_000,
  count: live.length,
};
