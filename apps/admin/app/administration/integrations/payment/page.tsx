import Integrations from "../../../_components/Integrations";

export const metadata = { title: "Payment gateways — Radian Admin" };

/*  A page of its own, not a tab. The owner asked for payment and courier as
    separate places: one list of keys makes "this moves money" and "this moves a
    parcel" look identical.  */
export default function Page() {
  return <Integrations only="PAYMENT" />;
}
