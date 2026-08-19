import { DeliveryMasters } from "../../_components/ZonesAvailability";

/* /delivery/zones — the delivery MASTERS: methods, time slots, zones.
   Each is made once here; /delivery/setup connects them (DEC-DLV-018). */
export default function MethodsPage() {
  return <DeliveryMasters />;
}
