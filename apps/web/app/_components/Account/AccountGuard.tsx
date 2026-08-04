"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuthHydrated, useAuthStore } from "../../_store/useAuthStore";

/*
  Auth guard — logged-out হলে /account/login-এ পাঠায় (redirect back সহ)।

  ⚠️ client-side guard, নিরাপত্তা নয় — backend এলে middleware/server
     session আসল রক্ষা দেবে।
*/
export default function AccountGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const hydrated = useAuthHydrated();
  const customer = useAuthStore((s) => s.customer);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (hydrated && !customer) {
      router.replace(`/account/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [hydrated, customer, pathname, router]);

  if (!hydrated || !customer) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <span className="text-[13.5px] text-body-soft">Loading your account…</span>
      </div>
    );
  }

  return <>{children}</>;
}
