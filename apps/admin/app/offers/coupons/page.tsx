import { redirect } from "next/navigation";

/* moved under Marketing — see /marketing/offers. Old links keep working. */
export default function OffersMoved() {
  redirect("/marketing/offers/coupons");
}
