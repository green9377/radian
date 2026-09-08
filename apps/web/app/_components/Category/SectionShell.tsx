import type { ReactNode } from "react";
import SiteSectionHead from "../ui/SectionHead";

/*
  The category page's shared shell. One rhythm for the whole site: every
  section is `--section-y` tall at top and bottom and its heading sits
  `--section-gap` above its content — the same tokens the homepage uses
  (globals.css). The page used to run on its own 72px; it no longer does.
*/

export function Petal({ gold = false }: { gold?: boolean }) {
  return (
    <span
      className={`inline-block w-[9px] h-[9px] rounded-[50%_50%_50%_0] -rotate-45 ${
        gold ? "bg-rosegold" : "bg-orchid"
      }`}
    />
  );
}

export function ArrowIcon() {
  return (
    <svg className="w-4 h-4 stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
      <path d="M4 12h16m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The category page's heading is the site's one heading (`ui/SectionHead`)
 * with the words already resolved by the server — one shape on every page
 * (owner, 6 Sep 2026). `sectionKey` is null on purpose: the per-category
 * override was applied before the words got here.
 */
export function SectionHead({
  eyebrow,
  heading,
  subheading,
  gold = false,
  onDark = false,
  align = "center",
  className = "",
}: {
  eyebrow?: string;
  heading?: string;
  subheading?: string;
  gold?: boolean;
  onDark?: boolean;
  /*  the delivery band sits its heading on the left with the countdown beside
      it, the way the homepage's band does (owner, 9 Sep 2026)  */
  align?: "center" | "left";
  className?: string;
}) {
  if (!eyebrow && !heading) return null;
  return (
    <SiteSectionHead
      sectionKey={null}
      eyebrow={eyebrow ?? ""}
      title={heading ?? ""}
      subtitle={subheading ?? ""}
      tone={onDark ? "dark" : "light"}
      petal={gold ? "gold" : "orchid"}
      align={align}
      className={className}
    />
  );
}

/** tone="alt" → lavender full-bleed band */
export function Section({
  children,
  tone = "plain",
  id,
  ref,
}: {
  children: ReactNode;
  tone?: "plain" | "alt";
  id?: string;
  ref?: React.Ref<HTMLElement>;
}) {
  return (
    <section id={id} ref={ref} className={`py-[var(--section-y)] ${tone === "alt" ? "bg-lavender" : ""}`}>
      <div className="max-w-[var(--page-w)] mx-auto px-6">{children}</div>
    </section>
  );
}

export function ViewAll({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div className="flex justify-center mt-11">
      <a
        href={href}
        className="inline-flex items-center gap-[10px] px-11 py-[15px] rounded-full border-[1.5px] border-purple text-purple text-[15px] font-medium tracking-[0.04em] whitespace-nowrap transition-all duration-300 hover:bg-purple hover:text-white hover:shadow-lift"
      >
        {children} <ArrowIcon />
      </a>
    </div>
  );
}
