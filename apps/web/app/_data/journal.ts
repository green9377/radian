/*
  ═══════════════════════════════════════════════════════════════════
  JOURNAL config — /journal (blog) + /journal/[slug]।

  ⚠️ draft: true — placeholder আর্টিকেল। কন্টেন্ট Radian-এর নিজের ভাষায় বসবে;
  page-এ banner ওঠে। তবু যা লেখা তা grounded (flower care, gifting, delivery)
  — কোনো বানানো পরিসংখ্যান/তারিখ-দাবি নয়। author = "Radian Team", তারিখ sample।

  একটাই generic /journal/[slug] route সব article দেখায়। নতুন লেখা যোগ করতে
  শুধু এখানে একটা object — page/view-এ হাত পড়বে না।

  ⇄ SWAP HERE — CMS এলে ভেতরটা fetch() হবে; view signature এক থাকবে।
  ═══════════════════════════════════════════════════════════════════
*/

export interface ArticleSection {
  heading?: string;
  paras: string[];
}

export interface Article {
  slug: string;
  category: string;
  title: string;
  excerpt: string;
  author: string;
  /** sample display date — Radian to set real publish date */
  date: string;
  readMins: number;
  /** index card gradient (placeholder until real cover photo) */
  cover: string;
  intro: string;
  sections: ArticleSection[];
}

export const JOURNAL_DRAFT = true;

const COVER_A = "linear-gradient(160deg,#F3E2FA 0%,#E3C4F3 55%,#D5A8EC 100%)";
const COVER_B = "linear-gradient(160deg,#FBEFF6 0%,#F1D3E6 55%,#E8C9CE 100%)";
const COVER_C = "linear-gradient(160deg,#F1ECFA 0%,#D9C7F0 55%,#C3A6E8 100%)";

export const ARTICLES: Article[] = [
  {
    slug: "how-to-keep-fresh-flowers-alive-longer",
    category: "Flower care",
    title: "How to keep fresh flowers alive longer",
    excerpt:
      "A few simple habits — clean water, a fresh cut, the right spot — can add days to any bouquet. Here's how.",
    author: "Radian Team",
    date: "10 July 2026",
    readMins: 4,
    cover: COVER_A,
    intro:
      "Fresh flowers are happiest when you treat them a little like you'd treat yourself on a hot day: clean water, a cool spot, and no crowding. Do these few things and most bouquets will look their best for noticeably longer.",
    sections: [
      {
        heading: "Start with a clean vase and fresh water",
        paras: [
          "Bacteria in the water is what shortens a bouquet's life fastest. Wash the vase before use, fill it with clean room-temperature water, and change the water every couple of days.",
          "If your flowers came with a sachet of flower food, use it — it feeds the stems and slows bacteria at the same time.",
        ],
      },
      {
        heading: "Cut the stems at an angle",
        paras: [
          "Before arranging, trim about a centimetre off each stem at a 45-degree angle with a clean, sharp knife or scissors. The angled cut gives the stem more surface to drink through and stops it sitting flat on the base of the vase.",
          "Remove any leaves that would sit below the waterline — submerged leaves rot quickly and cloud the water.",
        ],
      },
      {
        heading: "Keep them cool and out of direct sun",
        paras: [
          "Warmth and direct sunlight make flowers open — and fade — faster. A spot away from windows, heaters, and ripening fruit (which gives off ethylene gas) will keep them fresh longer.",
        ],
      },
    ],
  },
  {
    slug: "choosing-the-right-flowers-for-every-occasion",
    category: "Gifting guide",
    title: "Choosing the right flowers for every occasion",
    excerpt:
      "Birthday, anniversary, apology or just because — a quick guide to picking flowers that say the right thing.",
    author: "Radian Team",
    date: "3 July 2026",
    readMins: 5,
    cover: COVER_B,
    intro:
      "Flowers carry meaning, and the right choice can say what words sometimes can't. You don't need to memorise a rulebook — just a few gentle guidelines to help you pick with confidence.",
    sections: [
      {
        heading: "Romance and anniversaries",
        paras: [
          "Red roses remain the clearest way to say 'I love you', but they're not the only option. Soft pink roses, lilies, and orchids all read as romantic while feeling a little more personal.",
        ],
      },
      {
        heading: "Birthdays and celebrations",
        paras: [
          "Bright, mixed arrangements suit happy occasions best — think cheerful colours and a generous, full look. Pair with a cake or a small gift to make it feel like an event.",
        ],
      },
      {
        heading: "Sympathy and apologies",
        paras: [
          "Keep it soft and sincere: white and pastel flowers feel calm and respectful. A short, honest note matters more than the size of the bouquet.",
        ],
      },
    ],
  },
  {
    slug: "last-minute-gifting-done-right",
    category: "Delivery",
    title: "Last-minute gifting, done right",
    excerpt:
      "Forgot until today? You still have good options. Here's how to send something thoughtful, fast.",
    author: "Radian Team",
    date: "26 June 2026",
    readMins: 3,
    cover: COVER_C,
    intro:
      "Running late on a gift doesn't have to mean settling. With same-day and even midnight delivery inside Dhaka, a thoughtful surprise is still very much on the table.",
    sections: [
      {
        heading: "Use express and same-day delivery",
        paras: [
          "Inside Dhaka, a 2-hour express or same-day slot means an order placed in the morning can arrive the same afternoon. Check the delivery options at checkout for the fastest slot available to the recipient's area.",
        ],
      },
      {
        heading: "Add a message so it still feels personal",
        paras: [
          "A short, heartfelt note turns a quick order into a real gesture. You can also send it anonymously if you'd like the surprise to build.",
        ],
      },
      {
        heading: "Midnight delivery for birthdays",
        paras: [
          "Want to be the first to wish someone? A midnight delivery lands right as the day begins — a small touch people remember.",
        ],
      },
    ],
  },
  {
    slug: "corporate-gifting-that-people-remember",
    category: "For business",
    title: "Corporate gifting that people actually remember",
    excerpt:
      "Client thank-yous, team milestones, festive hampers — how to get corporate gifting right at any scale.",
    author: "Radian Team",
    date: "18 June 2026",
    readMins: 4,
    cover: COVER_A,
    intro:
      "Done well, a corporate gift strengthens a relationship. Done carelessly, it's forgotten by lunch. The difference usually comes down to thoughtfulness and reliable delivery — not spend.",
    sections: [
      {
        heading: "Match the gift to the relationship",
        paras: [
          "A key client and a new team member call for different gestures. Curated gift boxes work well for clients; flowers and cakes suit celebrations and milestones inside the team.",
        ],
      },
      {
        heading: "Plan bulk orders early",
        paras: [
          "For festive seasons or company-wide gifting, share your dates and quantities ahead of time so every delivery lands on schedule. Reach out and we'll help put a plan together.",
        ],
      },
    ],
  },
];

export const ARTICLE_SLUGS: string[] = ARTICLES.map((a) => a.slug);

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
