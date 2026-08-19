"use client";

/*
  ACCESS GATE — the door the sidebar cannot close.

  Owner, 19 Aug 2026, testing rajib: "je sob module ar access dey nai but
  oitar link copy kre paste krle ta show kre" — the menu hid the row, but a
  pasted URL rendered the whole screen with every fetch failing 403 under it.
  A page full of broken boxes is not a closed door.

  This gate wraps the content pane in the root layout. On every navigation it
  asks nodeForPath (built from the sidebar's own lists, so the two can never
  disagree) which registry key answers for the path, then applies the exact
  predicate the sidebar applies: the server's my-access map first, the
  hand-written roles arrays for keys outside the registry, never
  blanket-visible. Blocked = a clean closed-door card instead of the page.

  OWNER skips all of it. The server's guard is still the real wall — this
  only makes the wall visible instead of letting a screen half-render.
*/

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMyAccess } from "../_data/api";
import { useAuth } from "./AuthGate";
import Icon from "./Icon";
import { nodeForPath, type Role } from "./AdminSidebar";

export default function AccessGate({ children }: { children: React.ReactNode }) {
  const { me } = useAuth();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [access, setAccess] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    if (!me || me.role === "OWNER") { setAccess(null); return; }
    let alive = true;
    getMyAccess()
      /* empty map = lookup failure, treated like a failed fetch (same rule
         as the sidebar): fall back to the roles arrays, never to visible */
      .then((a) => { if (alive) setAccess(a && Object.keys(a).length ? a : null); })
      .catch(() => { if (alive) setAccess(null); });
    return () => { alive = false; };
  }, [me]);

  if (!me || me.role === "OWNER") return <>{children}</>;

  const hit = nodeForPath(pathname);
  const role = me.role as Role;
  const allowed = !hit
    ? true
    : access
      ? (hit.key in access ? access[hit.key] : !hit.roles || hit.roles.includes(role))
      : !hit.roles || hit.roles.includes(role);

  if (allowed) return <>{children}</>;

  return (
    <div className="min-h-[80vh] grid place-items-center p-6">
      <div className="w-full max-w-[380px] rounded-[20px] bg-white border border-[#e9e2f2] p-7 text-center"
        style={{ boxShadow: "0 8px 30px rgba(70,0,102,0.10)" }}>
        <span className="w-[46px] h-[46px] rounded-[14px] grid place-items-center text-white mx-auto mb-4"
          style={{ background: "linear-gradient(135deg,#8a2bb0,#cf43ea)", display: "grid" }}>
          <Icon name="lock" size={20} strokeWidth={2.2} />
        </span>
        <h2 className="text-[16px] font-bold text-[#2d2838] m-0">
          This part is not open to your template
        </h2>
        <p className="text-[12.5px] text-body-soft mt-1.5 mb-5">
          Ask the owner if you need it.
        </p>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 rounded-[11px] text-[12.5px] font-bold text-white"
          style={{ background: "linear-gradient(135deg,#8a2bb0,#cf43ea)", boxShadow: "0 4px 12px rgba(138,43,176,0.35)" }}>
          Go to my work
        </button>
      </div>
    </div>
  );
}
