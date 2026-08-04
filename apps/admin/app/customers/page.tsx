import CustomerOverview from "../_components/CustomerOverview";

/*
  /customers — Customer Management overview (KPIs, occasion radar, segments, top customers).
  Reads :4000 /customers + /segments. Orders/LTV = Sales-owned, read-only here.
*/
export default function CustomersPage() {
  return <CustomerOverview />;
}
