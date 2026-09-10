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
  /**
   * AUTHENTICATION templates are not ordinary templates with a different
   * label. Meta writes the wording itself, in every language, and will only
   * accept a fixed shape: a body with no text of ours, a copy-code button,
   * and an expiry. Sending an OTP as UTILITY gets the template rejected.
   */
  otp?: { expiryMinutes: number };
  /** An IMAGE header: the picture is supplied at send time (the order's photo). */
  imageHeader?: boolean;
  footer?: string;
}

/*  Meta wants a sample picture for an IMAGE header before it will review the
    template. It is only looked at by the reviewer — never sent — so a small
    drawn bouquet is enough, and it is embedded here so the submit button
    works on a fresh server with nothing else uploaded.  */
const SAMPLE_IMAGE_B64 = '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';

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
    button: {
      text: 'Complete payment',
      url: `${WEB}/pay/{{1}}`,
      example: `${WEB}/pay/R-10428`,
    },
  },
  {
    name: TPL.abandoned,
    // Meta classifies cart recovery as marketing whatever we claim.
    category: 'MARKETING',
    body:
      'Hello {{1}}, what you chose is still waiting in your basket. Pick up where ' +
      'you left off below, or call {{2}} and we will help you finish it.',
    example: ['Sobuj', '01519-779378'],
    button: {
      text: 'Return to cart',
      url: `${WEB}/cart/{{1}}`,
      example: `${WEB}/cart/abc123`,
    },
  },
  {
    /*  The photograph before it leaves (owner, 10 Sep 2026). The picture is
        the header; {{1}} name, {{2}} order number as everywhere else.  */
    name: TPL.photo,
    category: 'UTILITY',
    imageHeader: true,
    body:
      'Hi {{1}}, here is a photo of your Radian order {{2}}, prepared and ready to go out. ' +
      'If you would like anything changed, just reply to this message before it leaves.',
    example: ['Ayesha', 'RD-10234'],
    footer: 'Radian Flower & Gift Shop',
  },
  {
    /*  The photograph at the door, after hand-over.  */
    name: TPL.deliveredPhoto,
    category: 'UTILITY',
    imageHeader: true,
    body:
      'Hi {{1}}, your Radian order {{2}} has been delivered. Here is the photo taken at the door. ' +
      'Thank you for choosing us, and we hope it brought a smile.',
    example: ['Ayesha', 'RD-10234'],
    footer: 'Radian Flower & Gift Shop',
  },
  {
    /*  The one-time code (DEC-WA-010). The body below is never sent — Meta
        supplies its own wording for AUTHENTICATION templates and only takes
        the code and the expiry from us. It is written here so that reading
        this list still tells you what the customer receives.  */
    name: TPL.otp,
    category: 'AUTHENTICATION',
    body: '{{1}} is your verification code. For your security, do not share this code.',
    example: ['123456'],
    otp: { expiryMinutes: 5 },
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

  /*  Resumable Upload API: the sample picture for an IMAGE header goes up
      under the app, and the handle it returns is what the template carries.
      The app is whichever one minted the token — Meta tells us via /app.  */
  private async headerHandle(token: string): Promise<string> {
    const appRes = await fetch(`${GRAPH}/app`, { headers: { Authorization: `Bearer ${token}` } });
    const app = (await appRes.json()) as { id?: string; error?: { message?: string } };
    if (!appRes.ok || !app.id) throw new Error(app.error?.message ?? 'could not read the app behind this token');
    const bytes = Buffer.from(SAMPLE_IMAGE_B64, 'base64');
    const openRes = await fetch(
      `${GRAPH}/${app.id}/uploads?file_length=${bytes.length}&file_type=image/jpeg`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
    );
    const open = (await openRes.json()) as { id?: string; error?: { message?: string } };
    if (!openRes.ok || !open.id) throw new Error(open.error?.message ?? 'could not open the upload');
    const upRes = await fetch(`${GRAPH}/${open.id}`, {
      method: 'POST',
      headers: { Authorization: `OAuth ${token}`, file_offset: '0', 'Content-Type': 'application/octet-stream' },
      body: bytes,
    });
    const up = (await upRes.json()) as { h?: string; error?: { message?: string } };
    if (!upRes.ok || !up.h) throw new Error(up.error?.message ?? 'the sample picture did not upload');
    return up.h;
  }

  private payload(t: TemplateDef, headerHandle?: string) {
    /*  AUTHENTICATION has its own shape entirely: no text of ours, a
        copy-code button, and add_security_recommendation — which is what puts
        "do not share this code" in the message, in the customer's language,
        without us writing it.  */
    if (t.otp) {
      return {
        name: t.name,
        language: 'en',
        category: t.category,
        message_send_ttl_seconds: t.otp.expiryMinutes * 60,
        components: [
          { type: 'BODY', add_security_recommendation: true },
          { type: 'FOOTER', code_expiration_minutes: t.otp.expiryMinutes },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'OTP', otp_type: 'COPY_CODE', text: 'Copy code' },
            ],
          },
        ],
      };
    }

    const components: Record<string, unknown>[] = [];
    if (t.imageHeader) {
      components.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [headerHandle ?? ''] } });
    }
    components.push({ type: 'BODY', text: t.body, example: { body_text: [t.example] } });
    if (t.footer) components.push({ type: 'FOOTER', text: t.footer });
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
    return { name: t.name, language: 'en', category: t.category, components };
  }

  async submitAll(): Promise<{
    configured: boolean;
    results: TemplateResult[];
  }> {
    const c = await this.creds();
    if (!c) return { configured: false, results: [] };

    const results: TemplateResult[] = [];
    let handle: string | undefined;
    for (const t of TEMPLATES) {
      try {
        if (t.imageHeader && !handle) handle = await this.headerHandle(c.token);
        const res = await fetch(`${GRAPH}/${c.wabaId}/message_templates`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${c.token}`,
          },
          body: JSON.stringify(this.payload(t, handle)),
        });
        const body = (await res.json()) as {
          status?: string;
          error?: { message?: string; error_user_msg?: string };
        };
        if (res.ok) {
          results.push({
            name: t.name,
            ok: true,
            status: body.status ?? 'PENDING',
          });
          continue;
        }
        /*
          Already there is not a failure — pressing the button twice is normal.
          Meta phrases this several ways, so match on the idea, not one string.
        */
        const msg =
          body.error?.error_user_msg ||
          body.error?.message ||
          `HTTP ${res.status}`;
        const exists =
          /already exists|already English content|already have.*template|duplicate/i.test(
            msg,
          );
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

  async status(): Promise<{
    configured: boolean;
    templates: TemplateResult[];
  }> {
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
          templates: [
            {
              name: '—',
              ok: false,
              error: body.error?.message ?? `HTTP ${res.status}`,
            },
          ],
        };
      }
      const mine = new Set(TEMPLATES.map((t) => t.name));
      const found = (body.data ?? []).filter(
        (t) => mine.has(t.name) && t.language === 'en',
      );
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
        templates: [
          {
            name: '—',
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          },
        ],
      };
    }
  }
}
