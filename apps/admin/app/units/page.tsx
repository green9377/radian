import { redirect } from "next/navigation";

/*
  Units moved under Items (owner's call, 21 Jul). This route is kept so older links,
  bookmarks and any hardcoded hrefs still land in the right place instead of 404-ing.
*/
export default function UnitsPage() {
  redirect("/items/units");
}
