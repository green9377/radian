"use client";

import { genBg } from "../_data/api";

/*
  ═══════════════════════════════════════════════════════════════════════════
  ONE PRODUCT THUMBNAIL, EVERYWHERE A PRODUCT IS LISTED.

  Owner, 24 August 2026, after being told about a missing photo one screen at
  a time: *"image show kre na. thik kro amn joto jaygay ache sob jaygay thik
  kro — akekbar akekta bola biroktikor."* Fair. Four different pickers were
  drawing a product with no picture, each in its own way, and each was going
  to be reported separately.

  So this exists to be imported rather than re-typed. The rule it carries is
  the one `ProductViews` settled on 9 August: the REAL photo when the product
  has one, and the tinted tile only when it truly has none — never a grey
  square while the photograph sits in the database.

  `slug` only feeds the fallback colour, so the tile of a product stays the
  same colour on every screen instead of being random per render.
  ═══════════════════════════════════════════════════════════════════════════
*/

export default function ProductThumb({
  slug,
  imageUrl,
  size = 34,
  radius,
}: {
  /** used only for the fallback tint, so one product keeps one colour */
  slug?: string | null;
  imageUrl?: string | null;
  size?: number;
  radius?: number;
}) {
  return (
    <span
      className="shrink-0 block shadow-soft"
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.28),
        background: imageUrl
          ? `url(${imageUrl}) center/cover no-repeat`
          : genBg(slug || "product"),
      }}
    />
  );
}
