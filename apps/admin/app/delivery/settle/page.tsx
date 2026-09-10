import SettleView from "../../_components/SettleView";

export const metadata = { title: "Settle — Radian Admin" };

/* /delivery/settle — cost per parcel + COD cash, own riders / couriers / one-time riders (DEC-DLV-016/017). */
export default function Page() {
  return <SettleView />;
}
