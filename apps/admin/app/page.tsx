import { redirect } from "next/navigation";

/*  Signing in lands on the Business Dashboard (owner, 8 Sep 2026) — the
    whole business on one screen, before any module.  */
export default function AdminHome() {
  redirect("/intelligence");
}
