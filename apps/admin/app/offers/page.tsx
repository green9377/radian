import { redirect } from "next/navigation";

/* /offers moved — Offers & Promotions is now a sub-module of Marketing
   (owner's call, 28 Jul 2026). The Offer entity is still OWNED by the Offers
   module; only where it sits in the panel changed. Old links keep working. */
export default function OffersMoved() {
  redirect("/marketing/offers");
}
