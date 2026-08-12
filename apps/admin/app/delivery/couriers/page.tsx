import { redirect } from "next/navigation";

/*  Couriers moved to Administration on 12 Aug 2026 — one screen, not two.
    The owner had to remember that courier NAMES were here and courier KEYS
    were there, and said so: keeping couriers in Delivery breaks the flow.
    The redirect stays because this address is in the browser history, in
    bookmarks, and in older notes. */
export default function Page() {
  redirect("/administration/integrations/courier");
}
