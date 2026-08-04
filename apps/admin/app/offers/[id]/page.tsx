import { redirect } from "next/navigation";

/* moved under Marketing — see /marketing/offers/[id]. Old links keep working. */
export default async function OfferMoved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/marketing/offers/${id}`);
}
