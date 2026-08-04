import NewOrderForm from "../../_components/NewOrderForm";

/*
  /orders/new — staff-created order (phone / Facebook / WhatsApp).
  Same Sales model as a website order; only the channel differs.
  ⇄ SWAP HERE: POST /orders (staff-created) when the Sales API lands.
*/
export default function NewOrderPage() {
  return <NewOrderForm />;
}
