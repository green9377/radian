import { AuditView } from "../../_components/AuditView";

/* /settings/audit — who did what, and when. OWNER only, read only.
   The trail has been collecting since the first module; this reads it. */
export default function AuditPage() {
  return <AuditView />;
}
