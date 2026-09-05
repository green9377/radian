import type { Metadata } from "next";

import AccountGuard from "../../../_components/Account/AccountGuard";
import AccountShell from "../../../_components/Account/AccountShell";
import OrderDetailView from "../../../_components/Account/OrderDetailView";
import Reviews from "../../../_components/GBE/Reviews";
import VisitStore from "../../../_components/GBE/VisitStore";

/*
  /account/orders/[id] — এক order-এর detail (logged-in only)।

  id client-এ resolve হয় (seed ∪ live), তাই generateStaticParams নেই —
  live order localStorage-এ, server জানে না। GBE order (locked) নিচে।

  ⇄ SWAP HERE — Ecommerce lock হলে server component হয়ে GET /orders/:id,
  তখন notFound() server-side হবে।
*/

type Params = { id: string };

export const metadata: Metadata = {
  title: "Order Details | Radian",
  robots: { index: false },
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;

  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6 pb-16">
        <AccountGuard>
          <AccountShell>
            <OrderDetailView id={id} />
          </AccountShell>
        </AccountGuard>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
