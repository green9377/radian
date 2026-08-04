/*
  Country dial codes — checkout Q1-এর ফোন নম্বরের জন্য।

  ⚠️ কেন লাগে: Radian-এর অনেক customer দেশের বাইরে থাকেন — প্রবাসী ছেলে
  ঢাকায় মায়ের জন্য ফুল পাঠান। তাঁর নিজের নম্বর +880 নয়, আর আমরা সব
  update WhatsApp-এ পাঠাই। তাই **sender-এর নম্বরে country code বাধ্যতামূলক**।

  Receiver-এর নম্বরে নয় — উপহার ঢাকায় যাচ্ছে, প্রাপক বাংলাদেশেই।

  তালিকাটা বাংলাদেশি প্রবাসী যেসব দেশে সবচেয়ে বেশি — সেই ক্রমে।
*/

export interface Country {
  code: string; // ISO
  dial: string; // "+880"
  name: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { code: "BD", dial: "+880", name: "Bangladesh", flag: "🇧🇩" },
  { code: "SA", dial: "+966", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "AE", dial: "+971", name: "UAE", flag: "🇦🇪" },
  { code: "MY", dial: "+60", name: "Malaysia", flag: "🇲🇾" },
  { code: "US", dial: "+1", name: "USA", flag: "🇺🇸" },
  { code: "GB", dial: "+44", name: "UK", flag: "🇬🇧" },
  { code: "IT", dial: "+39", name: "Italy", flag: "🇮🇹" },
  { code: "QA", dial: "+974", name: "Qatar", flag: "🇶🇦" },
  { code: "KW", dial: "+965", name: "Kuwait", flag: "🇰🇼" },
  { code: "OM", dial: "+968", name: "Oman", flag: "🇴🇲" },
  { code: "SG", dial: "+65", name: "Singapore", flag: "🇸🇬" },
  { code: "AU", dial: "+61", name: "Australia", flag: "🇦🇺" },
  { code: "CA", dial: "+1", name: "Canada", flag: "🇨🇦" },
  { code: "IN", dial: "+91", name: "India", flag: "🇮🇳" },
];

export const DEFAULT_DIAL = "+880";

export function countryByDial(dial: string): Country {
  return COUNTRIES.find((c) => c.dial === dial) ?? COUNTRIES[0];
}
