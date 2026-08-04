import { redirect } from "next/navigation";

/*  Same as /administration/people — the audit screen that works is at
    /settings/audit, and pointing at it beats standing a hollow copy in front
    of it. It moves here when search and filtering are added.  */
export default function Page() {
  redirect("/settings/audit");
}
