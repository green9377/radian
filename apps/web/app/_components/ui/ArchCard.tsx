import Link from "next/link";
import TileImage from "./TileImage";

/*
  The arch card — one shape for every "pick a thing" tile on the site
  (owner, 7 Sep 2026, after FlowerAura's occasion / combo / budget tiles):
  a tall arch, the picture filling it edge to edge, and a white band at the
  foot with the name. The shape is the card; the name sits inside it, never
  floating under a separate blob.

  Used by: occasion tiles, sub-category tiles, combo / cross-sell tiles and
  the budget cards, on the homepage and the category page alike. Sizes and
  the photo variant are the caller's; the shape is not.
*/
export default function ArchCard({
  href,
  title,
  sub,
  imageUrl,
  variant = "card",
  aspect = "aspect-[1/1.08]",
  /** what fills the arch when there is no picture — the budget cards draw their range here */
  panel,
  className = "",
}: {
  href: string;
  title: string;
  sub?: string | null;
  imageUrl?: string | null;
  variant?: "card" | "thumb";
  aspect?: string;
  panel?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group block overflow-hidden bg-white border border-lavender-deep shadow-soft transition-all duration-300 hover:-translate-y-[6px] hover:shadow-lift ${className}`}
      style={{ borderRadius: "50% 50% 22px 22px / 38% 38% 22px 22px" }}
    >
      {imageUrl || !panel ? (
        <TileImage src={imageUrl} alt={title} variant={variant} className={aspect} />
      ) : (
        <div className={`relative ${aspect}`}>{panel}</div>
      )}
      {/* the band keeps one height with or without a second line, so tiles in different sections line up */}
      <div className="px-3 py-3 text-center min-h-[68px] flex flex-col justify-center">
        <h3 className="font-display text-[16px] lg:text-[17px] font-medium text-purple leading-tight truncate">{title}</h3>
        {sub && <span className="block text-[12px] text-body-soft truncate mt-0.5">{sub}</span>}
      </div>
    </Link>
  );
}

/** the budget card's own arch filling: the range, large, on the brand's soft tint */
export function RangePanel({ kicker, label, accent }: { kicker?: string | null; label: string; accent?: boolean }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center text-center px-4"
      style={{
        background: accent
          ? "linear-gradient(170deg,#F7ECEE 0%,#EAD3D6 60%,#DDBDC2 100%)"
          : "linear-gradient(170deg,#F5EEFA 0%,#E9DCF5 60%,#DCC8EE 100%)",
      }}
    >
      {kicker && (
        <span className={`text-[11px] tracking-[0.22em] uppercase font-semibold mb-2 ${accent ? "text-rosegold" : "text-orchid"}`}>
          {kicker}
        </span>
      )}
      <span className={`font-display font-semibold leading-[1.05] text-[clamp(24px,2.4vw,34px)] ${accent ? "text-[#6B3A44]" : "text-purple"}`}>
        {label}
      </span>
    </div>
  );
}
