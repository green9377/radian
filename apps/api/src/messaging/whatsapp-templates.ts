import { Injectable, Logger } from '@nestjs/common';
import { IntegrationsService } from '../administration/integrations.service';
import { TPL } from '../common/whatsapp-cloud';

/*
  ═══════════════════════════════════════════════════════════════════════════
  TEMPLATE জমা দেওয়া — Meta-র কাছে, এক ক্লিকে।

  মালিকের কথা ৬ আগস্ট: "template তুমি বানাও, সব তো তোমার কাছে"। ঠিক কথা —
  লেখাগুলো কোডেই আছে, তাই WhatsApp Manager-এ ছয়বার ফর্ম ভরার কোনো মানে নেই।
  আর এটা অন্তত দুবার লাগবে: এখন test WABA-তে, পরে আসল WABA-তে।

  ⚠️ APPROVE করে META, আমরা নয়। এই ফাইল শুধু **জমা** দেয়। জমা পড়ার পর
  অবস্থা PENDING → APPROVED বা REJECTED হয়, আর সেটা Meta-র নিজের সময়ে।

  ⚠️ প্রতিটা ভেরিয়েবলের একটা নমুনা পাঠাতেই হয় (`example`)। নমুনা ছাড়া Meta
  template ফিরিয়ে দেয় — reviewer-কে দেখাতে হয় ঘরগুলোয় কী বসবে।

  ⚠️ {{1}} = নাম, {{2}} = order নম্বর — সব template-এ এক ক্রম। Meta-র নিয়মে
  লেখায় {{1}} অবশ্যই {{2}}-এর আগে আসতে হবে। ক্রম এদিক-ওদিক হলে একদিন কারও
  কাছে নামের জায়গায় order নম্বর চলে যেত।

  ⚠️ CATEGORY নিজেরা ঠিক করি না, প্রস্তাব করি। `checkout_abandoned`-কে Meta
  MARKETING-ই ধরবে (দাম বেশি, opt-out বাধ্যতামূলক) — Utility লিখে দিলেও।
  ═══════════════════════════════════════════════════════════════════════════
*/

const GRAPH = 'https://graph.facebook.com/v25.0';

/*  ⚠️ ইচ্ছাকৃতভাবে আসল domain, demo-রটা নয়। template-এ ঠিকানা **পাকা** হয়ে
    যায় — approve হওয়ার পর বদলাতে হলে নতুন template। demo থেকে পাঠানো
    বার্তার বোতাম আসল সাইটে নিয়ে যাবে (সেখানে demo-র order নেই), যা
    যাচাইয়ের সময় খানিক বিভ্রান্তিকর কিন্তু ক্ষতিকর নয়।  */
const WEB = process.env.WA_TPL_BASE_URL || 'https://radianbd.com';

interface TemplateDef {
  name: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  body: string;
  /** ভেরিয়েবলের নমুনা, ক্রম অনুযায়ী */
  example: string[];
  button?: { text: string; url: string; example: string };
}

export const TEMPLATES: TemplateDef[] = [
  {
    name: TPL.confirm,
    category: 'UTILITY',
    body:
      'Thank you, {{1}}. Your order {{2}} is confirmed and we are getting it ready. ' +
      'Total {{3}}. We will message you the moment it leaves our shop.',
    example: ['Sobuj', 'R-10428', '৳2,450'],
  },
  {
    name: TPL.confirmCod,
    category: 'UTILITY',
    body:
      'Thank you, {{1}}. We have received your order {{2}} — {{3}}, payable when it arrives. ' +
      'One of our team will call you shortly to confirm the details.',
    example: ['Sobuj', 'R-10428', '৳2,450'],
  },
  {
    name: TPL.out,
    category: 'UTILITY',
    body: 'Good news, {{1}} — order {{2}} has just left our shop and is on its way.',
    example: ['Sobuj', 'R-10428'],
  },
  {
    name: TPL.delivered,
    category: 'UTILITY',
    body:
      '{{1}}, your order {{2}} has been delivered. We hope it brought a smile. ' +
      'Thank you for trusting us with it.',
    example: ['Sobuj', 'R-10428'],
  },
  {
    name: TPL.paymentFailed,
    category: 'UTILITY',
    body:
      '{{1}}, we are holding your order {{2}} — the payment did not come through. ' +
      '{{3}} is still due. You can finish it below, or call {{4}} and we will take care of it for you.',
    example: ['Sobuj', 'R-10428', '৳2,450', '01519-779378'],
    button: { text: 'Complete payment', url: `${WEB}/pay/{{1}}`, example: `${WEB}/pay/R-10428` },
  },
  {
    name: TPL.abandoned,
    /*  Meta-র নিজের শ্রেণিবিভাগ — cart ফেরানো বিজ্ঞাপনের কাজ, রসিদের নয়।
        UTILITY লিখে দিলেও ওরা বদলে দেবে, তাই সৎভাবে MARKETING-ই দিচ্ছি।  */
    category: 'MARKETING',
    body:
      '{{1}}, what you chose is still waiting in your basket. ' +
      'Pick up where you left off below, or call {{2}} and we will help you finish it.',
    example: ['Sobuj', '01519-779378'],
    button: { text: 'Return to cart', url: `${WEB}/cart/{{1}}`, example: `${WEB}/cart/abc123` },
  },
];

export interface TemplateResult {
  name: string;
  ok: boolean;
  /** Meta-র উত্তর — PENDING / APPROVED, বা ব্যর্থতার কারণ */
  status?: string;
  error?: string;
}

@Injectable()
export class WhatsAppTemplatesService {
  private readonly log = new Logger('WhatsAppTemplates');

  constructor(private readonly integrations: IntegrationsService) {}

  /** Phone number ID নয় — template-এর কাজ WABA-র নিচে হয়, নম্বরের নিচে নয় */
  private async creds(): Promise<{ wabaId: string; token: string } | null> {
    try {
      const row = await this.integrations.credentials('MESSAGING', 'WHATSAPP');
      const wabaId = row?.username?.trim() || process.env.WHATSAPP_WABA_ID;
      const token = row?.apiKey?.trim() || process.env.WHATSAPP_ACCESS_TOKEN;
      if (wabaId && token) return { wabaId, token };
    } catch {
      /* integrations অগম্য — নিচে env */
    }
    const wabaId = process.env.WHATSAPP_WABA_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    return wabaId && token ? { wabaId, token } : null;
  }

  private payload(t: TemplateDef) {
    const components: Record<string, unknown>[] = [
      {
        type: 'BODY',
        text: t.body,
        example: { body_text: [t.example] },
      },
    ];
    if (t.button) {
      components.push({
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: t.button.text,
            url: t.button.url,
            example: [t.button.example],
          },
        ],
      });
    }
    return {
      name: t.name,
      language: 'en',
      category: t.category,
      components,
    };
  }

  /** ছয়টাই জমা দেয়। আগে থেকে থাকলে সেটা ব্যর্থতা নয় — বলে দেয় "আছে"। */
  async submitAll(): Promise<{ configured: boolean; results: TemplateResult[] }> {
    const c = await this.creds();
    if (!c) return { configured: false, results: [] };

    const results: TemplateResult[] = [];
    for (const t of TEMPLATES) {
      try {
        const res = await fetch(`${GRAPH}/${c.wabaId}/message_templates`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${c.token}`,
          },
          body: JSON.stringify(this.payload(t)),
        });
        const body = (await res.json()) as {
          id?: string;
          status?: string;
          error?: { message?: string; error_user_msg?: string; code?: number };
        };
        if (res.ok) {
          results.push({ name: t.name, ok: true, status: body.status ?? 'PENDING' });
        } else {
          /*  ⚠️ code 2388023 / "already exists" — এটা ব্যর্থতা নয়। বোতামটা
              দুবার চাপা খুব স্বাভাবিক, আর তখন লাল দেখানো মিথ্যে সংকেত।  */
          const msg = body.error?.error_user_msg || body.error?.message || `HTTP ${res.status}`;
          const exists = /already exists/i.test(msg);
          results.push({
            name: t.name,
            ok: exists,
            status: exists ? 'ALREADY EXISTS' : undefined,
            error: exists ? undefined : msg.slice(0, 300),
          });
        }
      } catch (e) {
        results.push({ name: t.name, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    this.log.log(`templates submitted: ${results.filter((r) => r.ok).length}/${results.length}`);
    return { configured: true, results };
  }

  /** Meta-তে এখন কোনটার কী অবস্থা — PENDING / APPROVED / REJECTED */
  async status(): Promise<{ configured: boolean; templates: TemplateResult[] }> {
    const c = await this.creds();
    if (!c) return { configured: false, templates: [] };
    try {
      const res = await fetch(
        `${GRAPH}/${c.wabaId}/message_templates?fields=name,status,category,language&limit=100`,
        { headers: { Authorization: `Bearer ${c.token}` } },
      );
      const body = (await res.json()) as {
        data?: { name: string; status: string; language: string }[];
        error?: { message?: string };
      };
      if (!res.ok) {
        return {
          configured: true,
          templates: [{ name: '—', ok: false, error: body.error?.message ?? `HTTP ${res.status}` }],
        };
      }
      const mine = new Set(TEMPLATES.map((t) => t.name));
      /*  শুধু আমাদের ছয়টা। WABA-তে Meta-র নিজের বা পুরনো template থাকতে
          পারে; সেগুলো দেখিয়ে পর্দাটা ভরিয়ে দেওয়ার মানে নেই।  */
      const found = (body.data ?? []).filter((t) => mine.has(t.name) && t.language === 'en');
      return {
        configured: true,
        templates: TEMPLATES.map((t) => {
          const f = found.find((x) => x.name === t.name);
          return {
            name: t.name,
            ok: f?.status === 'APPROVED',
            status: f?.status ?? 'NOT SUBMITTED',
          };
        }),
      };
    } catch (e) {
      return {
        configured: true,
        templates: [{ name: '—', ok: false, error: e instanceof Error ? e.message : String(e) }],
      };
    }
  }
}
