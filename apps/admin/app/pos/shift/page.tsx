import { redirect } from "next/navigation";

/*  /pos/shift — the shift board is gone (owner, 11 Sep 2026): this shop has one
    counter and one day, so the day's own screen answers everything the board
    used to. The route stays only so a bookmark still lands somewhere useful.  */
export default function PosShiftPage() {
  redirect("/pos/day-close");
}
