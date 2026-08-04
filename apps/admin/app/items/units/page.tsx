import UnitsView from "../../_components/UnitsView";

/*
  Units live INSIDE the Item module (owner, 21 Jul): a unit exists to serve an item, so
  that is where people look for it. `/units` still works — same screen, one nav entry.
*/
export default function ItemUnitsPage() {
  return <UnitsView />;
}
