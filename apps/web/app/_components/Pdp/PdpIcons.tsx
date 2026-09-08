import type { IconName } from "../../_data/productDetails";

/*
  PDP icon set — একটাই component, name দিয়ে path বদলায়।
  Board-এর SVG symbol গুলোর React রূপ।
*/

const PATHS: Record<IconName, React.ReactNode> = {
  bolt: <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19" />
    </>
  ),
  moon: <path d="M20 13.5A8.3 8.3 0 0 1 10.5 4 8.3 8.3 0 1 0 20 13.5z" />,
  truck: (
    <>
      <path d="M2 6h12v11H2zM14 10h4l3 3.4V17h-7" />
      <circle cx="6.5" cy="17.7" r="1.8" />
      <circle cx="17.5" cy="17.7" r="1.8" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  star: (
    <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z" />
  ),
  leaf: <path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19c2-5 6-9 10-11" />,
  sparkle: (
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.2 6.2l2.8 2.8M15 15l2.8 2.8M17.8 6.2 15 9M9 15l-2.8 2.8" />
  ),
  gift: (
    <>
      <rect x="4" y="9" width="16" height="4" />
      <path d="M5.5 13v7h13v-7M12 9v11M12 9C9 9 7.2 7.6 7.6 5.8 8 4.2 10.4 4 12 6.6 13.6 4 16 4.2 16.4 5.8 16.8 7.6 15 9 12 9z" />
    </>
  ),
  store: (
    <path d="M4 9.5 5.4 4h13.2L20 9.5M4 9.5a2.4 2.4 0 0 0 4.5 1.2 2.4 2.4 0 0 0 4 0 2.4 2.4 0 0 0 4 0A2.4 2.4 0 0 0 20 9.5M5.5 12v8h13v-8M10 20v-5h4v5" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  pen: <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />,
  check: <path d="m5 12.5 5 5L19.5 7" />,
  chev: <path d="m6 9 6 6 6-6" />,
  cart: (
    <>
      <circle cx="9" cy="20" r="1.6" />
      <circle cx="17" cy="20" r="1.6" />
      <path d="M3 4h2l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6" />
    </>
  ),
  heart: (
    <path d="M12 20.3S4 15 4 9.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8 2.9c0 5.4-8 10.7-8 10.7z" />
  ),
  tag: (
    <>
      <path d="m3.5 12.5 8-8H20v8.5l-8 8z" />
      <circle cx="16" cy="8" r="1.3" />
    </>
  ),
  play: <path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none" />,
  upload: <path d="M12 16V5M7 9.5 12 4.5l5 5M5 19h14" />,
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  camera: (
    <>
      <path d="M3 8.5h3.2L8 6h8l1.8 2.5H21V19H3z" />
      <circle cx="12" cy="13.5" r="3.4" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.4" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  phone: (
    <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z" />
  ),
  /* the card that goes with the flowers — a folded note with two written lines */
  note: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.4" />
      <path d="M7.5 10h9M7.5 13.5h5.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5.5" width="17" height="14" rx="2.4" />
      <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.3A9.7 9.7 0 0 1 12 6.2c5 0 9 5.8 9 5.8a17 17 0 0 1-3 3.5M6.6 7.6A17.4 17.4 0 0 0 3 12s4 5.8 9 5.8a9.4 9.4 0 0 0 3.4-.65" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20.5 20.5 16 16M8.5 11h5M11 8.5v5" />
    </>
  ),
  wa: (
    <>
      <path d="M12 3.5a8.4 8.4 0 0 0-7.2 12.8L3.5 20.5l4.3-1.2A8.5 8.5 0 1 0 12 3.5z" />
      <path d="M9 8.8c-.3 1.9 2.4 5.6 5.4 6.3.9.2 1.9-.5 2-1.3l-2-1.2-1 .8a5.9 5.9 0 0 1-2.4-2.4l.8-1-1.2-2z" />
    </>
  ),
};

export default function Icon({
  name,
  className = "w-[1em] h-[1em]",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} stroke-current fill-none stroke-[1.8]`}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
