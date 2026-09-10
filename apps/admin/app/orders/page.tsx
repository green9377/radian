import OrdersOverviewView from "../_components/OrdersOverviewView";

export const metadata = { title: "Orders — Radian Admin" };

/* /orders — the overview: today's slots, the month's money, a watch list. The full list lives at /orders/list. */
export default function OrdersPage() {
  return <OrdersOverviewView />;
}
