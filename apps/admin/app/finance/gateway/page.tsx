import { GatewaySettlementLive } from "../../_components/FinanceGateway";

/* /finance/gateway — what the payment gateway still owes, and paying it over
   into the bank (DEC-FIN-030). */
export default function FinanceGatewayPage() {
  return <GatewaySettlementLive />;
}
