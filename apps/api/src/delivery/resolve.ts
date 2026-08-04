/* ═══════════════════════════════════════════════════════════════════════════
   কোন দামটা খাটবে — DEC-DLV-009

   মালিক, ১ আগস্ট ২০২৬: *"এখানে বেশি নির্দিষ্টতাই জিতবে।"*

   একই নামের delivery-র দাম দুই জায়গায় বসানো থাকতে পারে:

       Same day · পুরো ঢাকা      · ৳১০০      ← সাধারণ নিয়ম
       Same day · Dhanmondi      · ৳৮০       ← ওই এলাকার নিজের নিয়ম

   Dhanmondi-র গ্রাহক ৳৮০ পাবেন। এলাকার সারি না থাকলে zone-এর সারি।

   ⚠️ কেন একটাই function, আর কেন এটা কোনো পর্দার ভেতরে নেই।
   এই উত্তরটা অন্তত চার জায়গায় লাগবে — checkout-এর তালিকা, order-এর মোট
   টাকা, admin-এর নতুন order form, আর POS। চারটা জায়গায় চারবার লিখলে একদিন
   একটা জায়গা ভুলে যাবে যে এলাকা জিনিসটা আছে, আর গ্রাহককে ৳১০০ দেখিয়ে
   ৳৮০ কাটা হবে — বা উল্টোটা। দামের হিসাব একবারই লেখা হয়।

   ⚠️ এটা "কোনটা দেখাব" ঠিক করে, "কত নেব" নয়। order তৈরি হওয়ার সময়
   দাম আর নাম **snapshot** হয়ে order-এ বসে যায় (DEC-DLV-002)। তাই মালিক
   কাল দাম বদালেও গতকালের receipt বদলায় না।
   ═══════════════════════════════════════════════════════════════════════════ */

/** যতটুকু জানলে দাম বাছা যায় — পুরো Prisma row লাগে না */
export interface RateRow {
  id: string;
  typeId: string | null;
  areaId: string | null;
  feePaisa: number;
}

/**
 * এক নামের জন্য যে সারিগুলো আছে, তার মধ্যে কোনটা খাটবে।
 *
 * @param rows   একই `typeId`-র সব সারি (এলাকার + zone-এর)
 * @param areaId গ্রাহক যে এলাকায়। `null` = এলাকা জানা নেই।
 */
export function pickRate<T extends RateRow>(rows: T[], areaId: string | null): T | null {
  if (rows.length === 0) return null;

  /*  ১. ঠিক এই এলাকার সারি — সবচেয়ে নির্দিষ্ট, তাই সবার আগে।  */
  if (areaId) {
    const exact = rows.find((r) => r.areaId === areaId);
    if (exact) return exact;
  }

  /*  ২. এলাকা ছাড়া সারি — পুরো zone-এর সাধারণ নিয়ম।  */
  const zoneWide = rows.find((r) => r.areaId === null);
  if (zoneWide) return zoneWide;

  /*  ৩. অন্য কোনো এলাকার সারি আছে, কিন্তু এই এলাকার নেই, আর সাধারণ নিয়মও
      নেই। মানে দোকান বলেছে এই delivery শুধু ওই কয়েকটা এলাকায় চলে।

      ⚠️ এখানে **null**, সবচেয়ে সস্তাটা নয়। অন্য এলাকার দাম ধার করে দেখানো
      মানে এমন জায়গায় delivery-র প্রতিশ্রুতি দেওয়া যেখানে দোকান যায়ই না —
      আর সেটা গ্রাহক জানবে অর্ডারের পরে, ফোনে।  */
  return null;
}

/**
 * পুরো তালিকা — গ্রাহকের এলাকায় যে delivery-গুলো সত্যিই চলে, প্রতিটার
 * সঠিক দাম সহ।
 *
 * ⚠️ যে নামের কোনো সারি খাটে না, সেটা তালিকা থেকে **বাদ পড়ে**, ধূসর হয়ে
 * বসে থাকে না। ধূসর জিনিস মানুষ চাপে; যে delivery ওই ঠিকানায় যায়ই না তার
 * জন্য "কেন যাবে না" বোঝানোর কিছু নেই — সেটা শুধু নেই।
 */
export function ratesForArea<T extends RateRow>(
  all: T[],
  areaId: string | null,
): Map<string, T> {
  const byType = new Map<string, T[]>();
  for (const r of all) {
    if (!r.typeId) continue; // পুরনো সারি, নামের সাথে যুক্ত নয়
    const list = byType.get(r.typeId);
    if (list) list.push(r);
    else byType.set(r.typeId, [r]);
  }

  const out = new Map<string, T>();
  for (const [typeId, rows] of byType) {
    const hit = pickRate(rows, areaId);
    if (hit) out.set(typeId, hit);
  }
  return out;
}
