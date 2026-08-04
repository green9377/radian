import { redirect } from "next/navigation";

/** split into two screens (sobuj, 21 Jul) — colours and sizes are separate now */
export default function ItemAttributesRedirect() {
  redirect("/items/colors");
}
