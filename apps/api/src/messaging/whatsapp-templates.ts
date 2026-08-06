import { Injectable, Logger } from '@nestjs/common';
import { IntegrationsService } from '../administration/integrations.service';
import { TPL } from '../common/whatsapp-cloud';

/*
  Submits Radian's message templates to Meta. Meta approves them, not us —
  everything here only puts them in the queue.

  Meta's rules that bit us on 6 Aug: a body may not start or end with a
  variable, every variable needs a sample, and variables must appear in
  ascending order. {{1}} is always the name, {{2}} always the order number.
*/

const GRAPH = 'https://graph.facebook.com/v25.0';

// The live domain, not demo — a template's URL is fixed once approved.
const WEB = process.env.WA_TPL_BASE_URL || 'https://radianbd.com';

interface TemplateDef {
  name: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  body: string;
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
      'Thank you, {{1}}. Your order {{2}} has been delivered — we hope it brought ' +
      'a smile. Thank you for trusting us with it.',
    example: ['Sobuj', 'R-10428'],
  },
  {
    name: TPL.paymentFailed,
    category: 'UTILITY',
    body:
      'Hello {{1}}, your order {{2}} is still with us — the payment did not come ' +
      'through. {{3}} is due. You can finish it below, or call {{4}} and we will ' +
      'take care of it for you.',
    example: ['Sobuj', 'R-10428', '৳2,450', '01519-779378'],
    button: { text: 'Complete payment', url: `${WEB}/pay/{{1}}`, example: `${WEB}/pay/R-10428` },
  },
  {
    name: TPL.abandoned,
    // Meta classifies cart recovery as marketing whatever we claim.
    category: 'MARKETING',
    body:
      'Hello {{1}}, what you chose is still waiting in your basket. Pick up where ' +
      'you left off below, or call {{2}} and we will help you finish it.',
    example: ['Sobuj', '01519-779378'],
    button: { text: 'Return to cart', url: `${WEB}/cart/{{1}}`, example: `${WEB}/cart/abc123` },
  },
];

export interface TemplateResult {
  name: string;
  ok: boolean;
  status?: string;
  error?: string;
}

@Injectable()
export class WhatsAppTemplatesService {
  private readonly log = new Logger('WhatsAppTemplates');

  constructor(private readonly integrations: IntegrationsService) {}

  // Templates live under the business account, not the phone number.
  private async creds(): Promise<{ wabaId: string; token: string } | null> {
    try {
      const row = await this.integrations.credentials('MESSAGING', 'WHATSAPP');
      const wabaId = row?.username?.trim() || process.env.WHATSAPP_WABA_ID;
      const token = row?.apiKey?.trim() || process.env.WHATSAPP_ACCESS_TOKEN;
      if (wabaId && token) return { wabaId, token };
    } catch {
      /* fall through to env */
    }
    const wabaId = process.env.WHATSAPP_WABA_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    return wabaId && token ? { wabaId, token } : null;
  }

  private payload(t: TemplateDef) {
    const components: Record<string, unknown>[] = [
      { type: 'BODY', text: t.body, example: { body_text: [t.example] } },
    ];
    if (t.button) {
      components.push({
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: t.button.text, url: t.button.url, example: [t.button.example] },
        ],
      });
    }
    return { name: t.name, language: 'en', category: t.category, components };
  }

  async submitAll(): Promise<{ configured: boolean; results: TemplateResult[] }> {
    const c = await this.creds();
    if (!c) return { configured: false, results: [] };

    const results: TemplateResult[] = [];
    for (const t of TEMPLATES) {
      try {
        const res = await fetch(`${GRAPH}/${c.wabaId}/message_templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.token}` },
          body: JSON.stringify(this.payload(t)),
        });
        const body = (await res.json()) as {
          status?: string;
          error?: { message?: string; error_user_msg?: string };
        };
        if (res.ok) {
          results.push({ name: t.name, ok: true, status: body.status ?? 'PENDING' });
          continue;
        }
        /*
          Already there is not a failure — pressing the button twice is normal.
          Meta phrases this several ways, so match on the idea, not one string.
        */
        const msg = body.error?.error_user_msg || body.error?.message || `HTTP ${res.status}`;
        const exists =
          /already exists|already English content|already have.*template|duplicate/i.test(msg);
        results.push({
          name: t.name,
          ok: exists,
          status: exists ? 'ALREADY EXISTS' : 'FAILED',
          error: exists ? undefined : msg.slice(0, 300),
        });
      } catch (e) {
        results.push({
          name: t.name,
          ok: false,
          status: 'FAILED',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    for (const r of results.filter((x) => !x.ok)) {
      this.log.warn(`template ${r.name} refused: ${r.error}`);
    }
    return { configured: true, results };
  }

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
      const found = (body.data ?? []).filter((t) => mine.has(t.name) && t.language === 'en');
      return {
        configured: true,
        templates: TEMPLATES.map((t) => {
          const f = found.find((x) => x.name === t.name);
          return { name: t.name, ok: f?.status === 'APPROVED', status: f?.status ?? 'NOT SUBMITTED' };
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
