/*
  One upload, three files (owner, 5 Sep 2026) — the API writes two WebP
  versions beside every uploaded picture:

      …/x.jpg → …/x.large.webp (≤1200px, the product page's main photo)
                …/x.card.webp  (≤600px)   …/x.thumb.webp (≤160px)

  The names are derived, nothing is stored, so a card asks for the size it
  needs by rewriting the URL. Only our own media files (a `/radian/` path,
  a raster extension) are rewritten; an SVG, an outside URL or a file that
  is already a version comes back untouched.
*/
export type MediaSize = "large" | "card" | "thumb";

export function mediaVariant(url: string | null | undefined, size: MediaSize): string | null {
  if (!url) return null;
  if (!/\/radian\/[^?#]+\.(jpe?g|png|webp|avif)$/i.test(url)) return url;
  if (/\.(large|card|thumb)\.webp$/i.test(url)) return url;
  return url.replace(/\.[a-z0-9]+$/i, `.${size}.webp`);
}

/** a CSS background for a picture at card size, or null when there is none */
export const mediaBg = (url: string | null | undefined, size: MediaSize = "card") => {
  const v = mediaVariant(url, size);
  return v ? `url(${v}) center/cover` : null;
};
