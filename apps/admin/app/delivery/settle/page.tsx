import { DeliverySettle } from "../../_components/DeliverySettle";

export const metadata = { title: "Settle a carrier — Radian Admin" };

/* /delivery/settle — cost per parcel + COD reconciliation (DEC-DLV-016/017). */
export default function Page() {
  return <DeliverySettle />;
}
