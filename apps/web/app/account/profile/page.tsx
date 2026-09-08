import { redirect } from "next/navigation";

/*  /account IS the profile now (owner's design, 8 Sep 2026). The old
    /account/profile address is kept alive rather than broken — it is in
    people's history and in the header menu of older builds.  */
export default function ProfileRedirect() {
  redirect("/account");
}
