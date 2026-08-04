import { redirect } from "next/navigation";

/* /pricing retired — module renamed, and it now lives under Marketing at /marketing/offers. */
export default function PricingRetired() {
  redirect("/marketing/offers");
}
