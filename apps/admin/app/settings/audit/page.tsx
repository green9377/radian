import ActivityCenter from "../../_components/ActivityCenter";

/* /settings/audit — the audit trail AND the live sessions, one page with two
   tabs (owner, 18 Aug 2026). OWNER only. ?tab=sessions deep-links the live
   view; the old /administration/sessions address redirects here. */
export default function AuditPage() {
  return <ActivityCenter />;
}
