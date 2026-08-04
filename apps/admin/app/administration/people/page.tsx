import { redirect } from "next/navigation";

/*  The working People & access screen lives at /settings/people. This path was
    created while the module was being laid out, then pointed back at the real
    thing rather than becoming a second, emptier copy of it. It moves here for
    real when the email invite and PIN reset land.  */
export default function Page() {
  redirect("/settings/people");
}
