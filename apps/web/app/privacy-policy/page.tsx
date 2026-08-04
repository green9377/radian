import type { Metadata } from "next";
import PolicyPageShell from "../_components/Policy/PolicyPageShell";
import { policyMeta } from "../_data/policies";

export const metadata: Metadata = policyMeta("privacy-policy");

export default function PrivacyPolicyPage() {
  return <PolicyPageShell slug="privacy-policy" />;
}
