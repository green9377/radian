import type { Metadata } from "next";
import PolicyPageShell from "../_components/Policy/PolicyPageShell";
import { policyMeta } from "../_data/policies";

export const metadata: Metadata = policyMeta("terms");

export default function TermsPage() {
  return <PolicyPageShell slug="terms" />;
}
