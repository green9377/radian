import { ChannelsView } from "../../_components/ChannelsView";

/* /orders/channels — where an order came in through (DEC-SAL-001).
   Sales owns this master; Marketing only reads it. */
export default function ChannelsPage() {
  return <ChannelsView />;
}
