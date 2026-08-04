import type { Metadata } from "next";
import PolicyPageShell from "../_components/Policy/PolicyPageShell";
import { policyMeta } from "../_data/policies";

export const metadata: Metadata = policyMeta("refund-policy");

export default function RefundPolicyPage() {
  return <PolicyPageShell slug="refund-policy" />;
}
