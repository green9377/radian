import { redirect } from "next/navigation";

/**
 * The Recipes board left the Item module on 21 Jul — combining many items into one
 * thing is the Assembly module's job (DEC-ITM-011 phase 3). Until Assembly exists this
 * points at the item list rather than 404-ing, so nobody following an old link is left
 * staring at an error page.
 */
export default function ItemRecipesRedirect() {
  redirect("/items/list");
}
