/*
  Country dial codes for the phone picker (admin).
  Bangladesh first, then common NRB markets, then others.
  The stored phone value stays a single E.164-ish string ("+8801712345678");
  the picker just splits/combines the dial code so staff never re-type it.

  ⇄ SWAP HERE: real app can use a full ITU list + libphonenumber validation.
*/

export interface CountryCode {
  iso: string;
  name: string;
  dial: string; // "+880"
  flag: string;
}

export const COUNTRY_CODES: CountryCode[] = [
  { iso: "BD", name: "Bangladesh", dial: "+880", flag: "🇧🇩" },
  { iso: "US", name: "United States", dial: "+1", flag: "🇺🇸" },
  { iso: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧" },
  { iso: "SA", name: "Saudi Arabia", dial: "+966", flag: "🇸🇦" },
  { iso: "AE", name: "United Arab Emirates", dial: "+971", flag: "🇦🇪" },
  { iso: "QA", name: "Qatar", dial: "+974", flag: "🇶🇦" },
  { iso: "KW", name: "Kuwait", dial: "+965", flag: "🇰🇼" },
  { iso: "OM", name: "Oman", dial: "+968", flag: "🇴🇲" },
  { iso: "BH", name: "Bahrain", dial: "+973", flag: "🇧🇭" },
  { iso: "MY", name: "Malaysia", dial: "+60", flag: "🇲🇾" },
  { iso: "SG", name: "Singapore", dial: "+65", flag: "🇸🇬" },
  { iso: "CA", name: "Canada", dial: "+1", flag: "🇨🇦" },
  { iso: "AU", name: "Australia", dial: "+61", flag: "🇦🇺" },
  { iso: "IT", name: "Italy", dial: "+39", flag: "🇮🇹" },
  { iso: "IN", name: "India", dial: "+91", flag: "🇮🇳" },
  { iso: "DE", name: "Germany", dial: "+49", flag: "🇩🇪" },
  { iso: "FR", name: "France", dial: "+33", flag: "🇫🇷" },
  { iso: "ES", name: "Spain", dial: "+34", flag: "🇪🇸" },
  { iso: "SE", name: "Sweden", dial: "+46", flag: "🇸🇪" },
  { iso: "JP", name: "Japan", dial: "+81", flag: "🇯🇵" },
  { iso: "KR", name: "South Korea", dial: "+82", flag: "🇰🇷" },
  { iso: "ZA", name: "South Africa", dial: "+27", flag: "🇿🇦" },
  { iso: "TR", name: "Turkey", dial: "+90", flag: "🇹🇷" },
  { iso: "CN", name: "China", dial: "+86", flag: "🇨🇳" },
];

export const DEFAULT_DIAL = "+880";

/** unique dial codes, longest first (so "+880" wins over "+8") */
const DIALS_BY_LEN = Array.from(
  new Set(COUNTRY_CODES.map((c) => c.dial)),
).sort((a, b) => b.length - a.length);

/** split a stored phone into { dial, local } for the picker */
export function splitPhone(value: string): { dial: string; local: string } {
  const v = (value ?? "").replace(/\s/g, "");
  if (!v) return { dial: DEFAULT_DIAL, local: "" };
  for (const d of DIALS_BY_LEN) {
    if (v.startsWith(d)) return { dial: d, local: v.slice(d.length) };
  }
  // unknown / no "+": drop a leading + and keep digits, default BD dial
  return { dial: DEFAULT_DIAL, local: v.replace(/^\+/, "") };
}

/** combine dial + local back into a single stored value */
export function joinPhone(dial: string, local: string): string {
  const digits = local.replace(/[^\d]/g, "");
  return digits ? `${dial}${digits}` : "";
}
