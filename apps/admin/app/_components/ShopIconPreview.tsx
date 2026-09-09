/*
  Preview of the built-in storefront icon set, for the admin picker.

  ⚠️ DUPLICATED, KNOWINGLY — the same names and paths live in
  `apps/web/app/_components/ui/ShopIcon.tsx`, which is what actually renders on
  the site. There is no shared package: `shared/` at the repo root is empty,
  neither app's tsconfig maps to it, and each container mounts only its own app
  folder, so a cross-app import would not resolve at runtime either.

  A workspace package for twenty static `<path d="…">` strings costs more than
  the duplication does. **Add an icon in one file, add it in the other** — a
  name the picker offers but the site does not know renders as nothing on the
  live page, which is precisely the bug this note exists to prevent.
*/

export const ICON_NAMES = [
  "bolt", "heart", "lock", "truck", "gift", "store",
  "clock", "star", "shield", "leaf", "cake", "flower",
  "phone", "chat", "medal", "box", "calendar", "pin",
  "check", "globe",
  "rocket", "moon", "sun", "wallet", "card", "refresh",
  "thumbsup", "headset", "map", "camera", "home", "basket",
  "tag", "users", "sparkle", "droplet",
] as const;

const P: Record<string, React.ReactNode> = {
  bolt: <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13z" />,
  heart: <path d="M12 20.3S4 15 4 9.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8 2.9c0 5.4-8 10.7-8 10.7z" />,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2.4" /><path d="M8 10.5V7.7a4 4 0 0 1 8 0v2.8" /></>,
  truck: <><path d="M2 6h12v11H2zM14 10h4l3 3.4V17h-7" /><circle cx="6.5" cy="17.7" r="1.8" /><circle cx="17.5" cy="17.7" r="1.8" /></>,
  gift: <><rect x="4" y="9" width="16" height="4" /><path d="M5.5 13v7h13v-7M12 9v11M12 9C9 9 7.2 7.6 7.6 5.8 8 4.2 10.4 4 12 6.6 13.6 4 16 4.2 16.4 5.8 16.8 7.6 15 9 12 9z" /></>,
  store: <path d="M4 9.5 5.4 4h13.2L20 9.5M5.5 12v8h13v-8M10 20v-5h4v5" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  star: <path d="m12 3.5 2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z" />,
  shield: <path d="M12 3.2 19 6v6c0 4.2-3 7.3-7 8.8-4-1.5-7-4.6-7-8.8V6z" />,
  leaf: <><path d="M5 19c0-8 5.5-13 15-13 0 9-5 14-11.5 14A6 6 0 0 1 5 19z" /><path d="M9 15c2.5-3 5-4.5 8-5.5" /></>,
  cake: <><path d="M4 20h16v-6a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3z" /><path d="M4 15.5c1.6 1.4 3.2 1.4 4.8 0s3.2-1.4 4.8 0 3.2 1.4 4.8 0" /><path d="M12 8V5.5M9 8V6.5M15 8V6.5" /></>,
  flower: <><circle cx="12" cy="9" r="2.6" /><path d="M12 6.4c0-2.4-3.6-2.4-3.6 0S12 8.8 12 6.4zM12 11.6c0 2.4 3.6 2.4 3.6 0S12 9.2 12 11.6zM9.4 9c-2.4 0-2.4-3.6 0-3.6S11.8 9 9.4 9zM14.6 9c2.4 0 2.4 3.6 0 3.6S12.2 9 14.6 9z" /><path d="M12 12v8" /></>,
  phone: <path d="M6.8 3.5h2.9l1.4 3.9-2 1.5a12.5 12.5 0 0 0 5.9 5.9l1.5-2 3.9 1.4v2.9a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.8 5.7a2 2 0 0 1 2-2.2z" />,
  chat: <path d="M20 12.5c0 3.6-3.6 6.5-8 6.5a9.7 9.7 0 0 1-2.8-.4L4 20.5l1.4-3.5A6.2 6.2 0 0 1 4 12.5C4 8.9 7.6 6 12 6s8 2.9 8 6.5z" />,
  medal: <><circle cx="12" cy="14.5" r="5" /><path d="M8.5 9.8 6 3.5h12l-2.5 6.3" /></>,
  box: <><path d="M4 8.5 12 4.5l8 4v7l-8 4-8-4z" /><path d="M4 8.5 12 12.5l8-4M12 12.5v7" /></>,
  calendar: <><rect x="4" y="6" width="16" height="14" rx="2.2" /><path d="M4 10.5h16M8.5 4v4M15.5 4v4" /></>,
  pin: <><path d="M12 21s-7-5.3-7-11a7 7 0 0 1 14 0c0 5.7-7 11-7 11z" /><circle cx="12" cy="10" r="2.6" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.3 2.5 2.5 4.5-5" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5S14.2 18.2 12 20.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5z" /></>,

  /*  ═══ SIXTEEN MORE, 9 Sep 2026 ═══════════════════════════════════════════
      The owner had four promises wearing uploaded PHOTOGRAPHS, for one
      reason: the twenty above did not contain the symbol he wanted, so he
      drew one. A built-in is always the better answer — it takes the brand
      colour, it is drawn at the same weight as its neighbours, and it cannot
      arrive as a picture of a red car. So the set now covers what this shop
      actually promises: the three delivery speeds, money, returns, support,
      the country, the photo, freshness.  */
  rocket: <><path d="M12 3.2c3.4 2.3 5.3 5.8 5.3 9.4L14.8 15H9.2l-2.5-2.4c0-3.6 1.9-7.1 5.3-9.4z" /><circle cx="12" cy="9.6" r="1.7" /><path d="M9.2 15 7 18.4l3.2-1M14.8 15l2.2 3.4-3.2-1" /></>,
  moon: <path d="M20 13.5A8.3 8.3 0 0 1 10.5 4 8.3 8.3 0 1 0 20 13.5z" />,
  sun: <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.6V5M12 19v2.4M2.6 12H5M19 12h2.4M5.1 5.1l1.7 1.7M17.2 17.2l1.7 1.7M18.9 5.1l-1.7 1.7M6.8 17.2l-1.7 1.7" /></>,
  wallet: <><path d="M3.6 8.6A2.6 2.6 0 0 1 6.2 6H17a2 2 0 0 1 2 2v.6" /><rect x="3.6" y="8.6" width="16.8" height="10.4" rx="2.4" /><circle cx="16.2" cy="13.8" r="1.15" /></>,
  card: <><rect x="3" y="6" width="18" height="12" rx="2.4" /><path d="M3 10.2h18M6.6 14.6h3.2" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.5-5.8" /><path d="M20 3.8v4.7h-4.7" /></>,
  thumbsup: <><path d="M7 20.2V10.4l4.4-6c1.4 0 2.2 1 1.9 2.4l-.7 3.6h5.5a2 2 0 0 1 2 2.3l-1 5.4a2.4 2.4 0 0 1-2.4 2.1z" /><rect x="3.3" y="10.4" width="3.7" height="9.8" rx="1.2" /></>,
  headset: <><path d="M4.6 15v-3a7.4 7.4 0 0 1 14.8 0v3" /><rect x="2.9" y="13.4" width="3.6" height="5.6" rx="1.6" /><rect x="17.5" y="13.4" width="3.6" height="5.6" rx="1.6" /><path d="M19.3 19v.4a2.5 2.5 0 0 1-2.5 2.5H13" /></>,
  map: <><path d="M9 4 3.6 6.2v13.3L9 17.3l6 2.2 5.4-2.2V4L15 6.2z" /><path d="M9 4v13.3M15 6.2v13.3" /></>,
  camera: <><rect x="3.4" y="7.9" width="17.2" height="11.6" rx="2.4" /><path d="M8.6 7.9 10 5.4h4l1.4 2.5" /><circle cx="12" cy="13.7" r="3.3" /></>,
  home: <><path d="M3.8 11 12 4l8.2 7" /><path d="M6 10.2V20h12v-9.8" /><path d="M10 20v-5.6h4V20" /></>,
  basket: <><path d="M4 9.2h16l-1.4 10.1a2 2 0 0 1-2 1.7H7.4a2 2 0 0 1-2-1.7z" /><path d="M8.4 9.2 12 3.6l3.6 5.6" /><path d="M9.8 12.6v5M14.2 12.6v5" /></>,
  tag: <><path d="M4 4h7.2L20 12.8 12.8 20 4 11.2z" /><circle cx="8.4" cy="8.4" r="1.5" /></>,
  users: <><circle cx="9" cy="8.4" r="3.4" /><path d="M2.9 20c0-3.4 2.7-5.5 6.1-5.5s6.1 2.1 6.1 5.5" /><path d="M16.2 5.5a3.4 3.4 0 0 1 0 6.6M17.4 14.8c2.2.6 3.7 2.4 3.7 5.2" /></>,
  sparkle: <><path d="M11.4 3.6 13.2 9l5.4 1.8-5.4 1.8-1.8 5.5-1.8-5.5L4.2 10.8 9.6 9z" /><path d="M18.6 4v3M17.1 5.5h3" /></>,
  droplet: <><path d="M12 3.6c3.5 4.2 5.4 7 5.4 9.4a5.4 5.4 0 1 1-10.8 0c0-2.4 1.9-5.2 5.4-9.4z" /><path d="M9.6 14.2a2.6 2.6 0 0 0 2.6 2.6" /></>,
};

/*  The same rule the shop uses (`apps/web/.../ui/ShopIcon.tsx`): a file that
    is a SHAPE — an SVG, or a raster the uploader found genuinely transparent
    and named `.icon.` — is painted in the brand colour. Anything else is a
    picture and is placed as it is. This preview has to obey it or the admin
    shows one thing and the shop another, which is the whole reason the owner
    could not tell what an upload would look like until it was live. */
export const isShapeIcon = (url: string) =>
  /\.svg(\?|#|$)/i.test(url) || /\.icon\./i.test(url);

export default function ShopIconPreview({
  name, url, size = 22,
}: { name?: string | null; url?: string | null; size?: number }) {
  if (url) {
    if (isShapeIcon(url)) {
      const u = `url("${url}")`;
      return (
        <span
          aria-hidden
          className="inline-block bg-current"
          style={{
            width: size, height: size,
            WebkitMaskImage: u, maskImage: u,
            WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
            WebkitMaskPosition: "center", maskPosition: "center",
            WebkitMaskSize: "contain", maskSize: "contain",
          }}
        />
      );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={{ width: size, height: size }} className="object-contain" />;
  }
  const path = name ? P[name] : null;
  if (!path) return <span style={{ width: size, height: size }} className="inline-block" />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="stroke-current fill-none stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}
