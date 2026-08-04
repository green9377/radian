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
};

export default function ShopIconPreview({
  name, url, size = 22,
}: { name?: string | null; url?: string | null; size?: number }) {
  if (url) {
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
