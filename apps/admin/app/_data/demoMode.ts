/*
  Customer module data source switch.

  Default is DEMO so every screen (occasions, segments, duplicates, consent, risk)
  is fully populated and explorable straight away. Flip to live from the bar at the
  top of any Customer screen — the choice is remembered in the browser.

  ⇄ SWAP HERE: once the database holds real customers with recipients and segments,
  change DEFAULT_DEMO to false (or delete this file and the demo dataset).
*/

const KEY = "radian-customer-demo";
const DEFAULT_DEMO = true;

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return DEFAULT_DEMO;
  const v = window.localStorage.getItem(KEY);
  return v === null ? DEFAULT_DEMO : v === "1";
}

export function setDemoMode(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, on ? "1" : "0");
}
