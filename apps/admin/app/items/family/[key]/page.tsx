import ItemFamilyEditor from "../../../_components/ItemFamilyEditor";

/** DEC-ITM-016 — a variant family has no row of its own, so the key IS the address */
export default async function ItemFamilyPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <ItemFamilyEditor familyKey={decodeURIComponent(key)} />;
}
