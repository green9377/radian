/*
  ═══ DEC-DLV-011 · কোন delivery-তে পুরো cart যেতে পারে ═══════════════════════

  মালিকের নিয়ম (৫ আগস্ট ২০২৬, হুবহু):
    "checkout a just zone wise delivery method asa thik na. prthome zone check
     kre dkhbe ki ki method ache and se method theke cart je product ache se
     product kon kon gula select ache just segulai dekhabe. …multi product
     thake cart… tahole akhane win hobe se method, je method win hole sobgula
     product delivery possible. akhane order kon vag hobe na."

  অনুবাদ: গ্রাহক দেখবে = zone-এর method ∩ (cart-এর *প্রতিটা* product-এ
  টিক-দেওয়া DeliveryType)। order কখনো ভাগ হয় না — সবচেয়ে ধীর সাধারণ পথই জেতে।

  দুটো টিক-নিরপেক্ষ ভিত্তি (baseline) — admin-এর নিজের কথার সাথে মিলিয়ে
  ("Nothing picked — this product will only go out on a scheduled day"):

    PICK_DATE_SLOT (Schedule It)   সবকিছুই ঠিক-করা দিনে যেতে পারে; এটাও
                                   টিক-নির্ভর হলে ফাঁকা-টিক product কেনাই যেত না
    LEAD_DAYS (Nationwide Courier) বাইরের zone-এর একমাত্র পথ; product.zone =
                                   NATIONWIDE নিজেই "courier-safe" ঘোষণা

  বাকি সব গতির প্রতিশ্রুতি (2-Hour, Same Day, Midnight) টিক ছাড়া কখনো আসে না।

  এক নিয়ম, দুই দরজা: /shop/delivery-options (checkout-এর পর্দা) আর
  checkout-এর quote/place (server-side পাহারা) — দুটোই এই ফাইল পড়ে, তাই
  পর্দা আর রসিদ কখনো দুই কথা বলে না।
*/

export const BASELINE_TIMINGS: ReadonlySet<string> = new Set([
  'PICK_DATE_SLOT',
  'LEAD_DAYS',
]);

/**
 * এই method-টা কি cart-এর সব product-এ চলে?
 *
 * ⚠️ type-ছাড়া (legacy) method মূল্যায়নই করা যায় না — দেখানো হয়, লুকানো নয়।
 * লুকালে মালিক বুঝতেন না delivery-টা কোথায় গেল।
 */
export function methodOkForCart(
  timing: string | null | undefined,
  typeId: string | null | undefined,
  productTypeSets: ReadonlyArray<ReadonlySet<string>>,
): boolean {
  if (timing && BASELINE_TIMINGS.has(timing)) return true;
  if (!typeId) return true;
  return productTypeSets.every((s) => s.has(typeId));
}

/** cart-এর প্রতিটা product-এর টিক-দেওয়া DeliveryType id-র set */
export async function cartTypeSets(
  db: {
    product: {
      findMany(args: {
        where: { slug: { in: string[] }; deletedAt: null };
        select: { deliveryTypes: { select: { typeId: true } } };
      }): Promise<{ deliveryTypes: { typeId: string }[] }[]>;
    };
  },
  slugs: string[],
): Promise<Set<string>[]> {
  const unique = [...new Set(slugs)].filter(Boolean);
  if (!unique.length) return [];
  const rows = await db.product.findMany({
    where: { slug: { in: unique }, deletedAt: null },
    select: { deliveryTypes: { select: { typeId: true } } },
  });
  return rows.map((r) => new Set(r.deliveryTypes.map((d) => d.typeId)));
}
