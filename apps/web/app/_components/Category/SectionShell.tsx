import type { ReactNode } from "react";

/*
  Category page-এর shared shell — সব section এগুলো ব্যবহার করে।
  এক জায়গায় spacing rhythm: প্রতি section 72px, heading-এর নিচে 38px.
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

export function SectionHead({
  eyebrow,
  heading,
  subheading,
  gold = false,
  onDark = false,
}: {
  eyebrow?: string;
  heading?: string;
  subheading?: string;
  gold?: boolean;
  onDark?: boolean;
}) {
  if (!eyebrow && !heading) return null;

  return (
    <div className="text-center mb-[38px]">
      {eyebrow && (
        <div
          className={`inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.22em] mb-[14px] ${
            onDark ? "text-orchid-mid" : "text-orchid"
          }`}
        >
          <Petal gold={gold} />
          {eyebrow}
        </div>
      )}
      {heading && (
        <h2
          className={`font-display text-[clamp(26px,3.4vw,40px)] font-medium leading-[1.15] ${
            onDark ? "text-white" : "text-purple"
          }`}
        >
          {heading}
        </h2>
      )}
      {subheading && (
        <p
          className={`mt-[10px] text-[16px] font-light ${
            onDark ? "text-white/70" : "text-body-soft"
          }`}
        >
          {subheading}
        </p>
      )}
    </div>
  );
}

/** tone="alt" → lavender full-bleed band */
export function Section({
  children,
  tone = "plain",
  id,
}: {
  children: ReactNode;
  tone?: "plain" | "alt";
  id?: string;
}) {
  if (tone === "alt") {
    return (
      <section id={id} className="mt-[72px] py-[72px] bg-lavender">
        <div className="max-w-[var(--page-w)] mx-auto px-6">{children}</div>
      </section>
    );
  }
  return (
    <section id={id} className="max-w-[var(--page-w)] mx-auto px-6 pt-[72px]">
      {children}
    </section>
  );
}

/** Photo না আসা পর্যন্ত gradient placeholder (Constitution: real photo = launch dependency) */
export function Tile({ bg, className = "" }: { bg: string; className?: string }) {
  return <div className={`relative overflow-hidden ${className}`} style={{ background: bg }} />;
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
