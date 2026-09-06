import { mediaVariant } from "../../_data/media";

/*
  The one picture-in-a-card, site-wide (owner, 6 Sep 2026).

  A real <img>, never a CSS background: it carries an alt for Google and
  screen readers, loads lazily below the fold, and asks for the right size
  (`card` ≤600px WebP, `thumb` ≤160px) from the media host. Nothing that
  used to be painted with `background: url(...)` on a card should be again.

  NO PICTURE = ONE QUIET PLACEHOLDER. Not a random gradient per tile — the
  same soft lavender with a faint petal everywhere, so a page with a few
  missing pictures still looks like one page. The fix for a placeholder is a
  picture in the admin, not a prettier placeholder.
*/
/**
 * A picture address from either shape the codebase still carries: a plain
 * URL, or the legacy CSS value `url(...) center/cover`. A gradient — the old
 * "no photo yet" tint — is NOT a picture and comes back null, so it draws the
 * placeholder like every other missing photo.
 */
export function imageSrc(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /^url\((['"]?)(.+?)\1\)/.exec(v.trim());
  if (m) return m[2];
  return /^(https?:)?\//.test(v) || v.startsWith("data:") ? v : null;
}

export default function TileImage({
  src,
  alt,
  variant = "card",
  className = "",
  imgClassName = "",
  eager = false,
  children,
}: {
  /** a URL, or the legacy `url(...)` CSS value; a gradient counts as no picture */
  src?: string | null;
  alt: string;
  variant?: "card" | "thumb" | "original";
  /** the frame: size, radius, shadow — the caller's */
  className?: string;
  imgClassName?: string;
  /** above the fold: no lazy loading, higher fetch priority */
  eager?: boolean;
  /** overlays — badges, gradients — drawn on top of the picture */
  children?: React.ReactNode;
}) {
  const real = imageSrc(src);
  const url = real ? (variant === "original" ? real : mediaVariant(real, variant)) : null;
  return (
    <div className={`relative overflow-hidden bg-[#F3EDF8] ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={eager ? "high" : "auto"}
          className={`absolute inset-0 w-full h-full object-cover ${imgClassName}`}
        />
      ) : (
        <span aria-hidden className="absolute inset-0 grid place-items-center">
          <span className="w-[22%] max-w-[56px] aspect-square rounded-[50%_50%_50%_0] -rotate-45 bg-orchid/15" />
        </span>
      )}
      {children}
    </div>
  );
}
