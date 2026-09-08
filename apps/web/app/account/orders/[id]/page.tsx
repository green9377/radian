import type { Metadata } from "next";

import AccountGuard from "../../../_components/Account/AccountGuard";
import AccountShell from "../../../_components/Account/AccountShell";
import OrderDetailView from "../../../_components/Account/OrderDetailView";

/*
  /account/orders/[id] — one order's detail (logged-in only).

  The id is resolved on the client (seed plus live orders), so there is no
  generateStaticParams — a live order sits in localStorage, the server does
  not know it. A quiet page (owner, 8 Sep 2026): no reviews, no store
  block, no footer.

  SWAP HERE — once Ecommerce is locked this becomes a server component
  doing GET /orders/:id, and notFound() moves server-side.
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

    </main>
  );
}
