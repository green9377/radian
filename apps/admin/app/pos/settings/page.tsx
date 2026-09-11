import { PosSettings } from "../../_components/PosViews";

/*  /pos/settings — POS settings: discount rules (read-only), the opening float,
    the credit limit, what is printed on the receipt, the methods the counter
    takes (DEC-POS-021) and the list of counters.
    (POS audit 11 Sep 2026 §3 #27 — the comment used to promise "methods,
    registers" and neither had a screen. Both are on it now; counters are still
    read-only, because nothing can create one but the first sale.)  */
export default function PosSettingsPage() {
  return <PosSettings />;
}
