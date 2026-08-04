import PosSellView from "../../_components/PosView";

/*
  /pos/sell — POS Sell screen (counter). RADIAN_POS_MODULE_ARCHITECTURE.md.
  UI-first mock; a completed sale becomes an Order (channel=POS, DEC-POS-001).
  ⇄ SWAP HERE: GET /products (live) + POST /pos/sales when the POS API lands.
*/
export default function PosSellPage() {
  return <PosSellView />;
}
