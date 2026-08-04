"use client";

import { useEffect, useState } from "react";
import { getShopBrand } from "../../_data/shop";

/*
  The shop's name and logo — one component for the header and the footer.

  Both had the word RADIAN typed into them. The owner asked for the logo to be
  his on 30 Jul, I agreed, and then built everything else on that list except
  this. Written here rather than twice, so the two can never disagree about the
  shop's own name.

  Until an image is uploaded it renders exactly what it rendered before: the
  petal mark and the letter-spaced name. That is the design, not a placeholder,
  and a shop with no logo file should not have a hole in its header.
*/
export default function ShopLogo({
  tone = "dark",
  size = 25,
}: {
  /** dark = purple text for the white header, light = white for the footer */
  tone?: "dark" | "light";
  size?: number;
}) {
  const [brand, setBrand] = useState<{ name: string; logoUrl: string | null }>({
    name: "RADIAN",
    logoUrl: null,
  });

  useEffect(() => {
    let alive = true;
    getShopBrand().then((b) => { if (alive && b) setBrand(b); });
    return () => { alive = false; };
  }, []);

  if (brand.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.logoUrl}
        alt={brand.name}
        style={{ height: size * 1.4 }}
        className="w-auto object-contain"
      />
    );
  }

  return (
    <span
      className={`flex items-center gap-[10px] font-ui font-semibold tracking-[0.34em] ${tone === "light" ? "text-white" : "text-purple"}`}
      style={{ fontSize: size }}
    >
      <span className="w-3 h-3 bg-orchid rounded-[50%_50%_50%_0] -rotate-45 inline-block shrink-0" />
      {brand.name}
    </span>
  );
}
