import { OrdersActionQueue } from "../../_components/OrderViews";

/* /orders/action — orders waiting on staff: verify paid, call COD, then confirm. */
export default function OrdersActionPage() {
  return <OrdersActionQueue />;
}
