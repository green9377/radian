import { OnlinePaymentsLive } from "../../_components/OnlinePayments";

/* /orders/online-payments — every trip a customer made to the gateway, so
   "I paid but it says I owe you" has an answer that is not SQL. Read-only. */
export default function OrdersOnlinePaymentsPage() {
  return <OnlinePaymentsLive />;
}
