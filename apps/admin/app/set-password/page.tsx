import SetPassword from "../_components/SetPassword";

export const metadata = { title: "Choose your password — Radian" };

/*  Deliberately OUTSIDE the signed-in area. Somebody following an invite has no
    account password yet, and somebody who forgot theirs cannot sign in to fix
    it — a reset page behind the sign-in wall is a locked door with the key
    inside.  */
export default function Page() {
  return <SetPassword />;
}
