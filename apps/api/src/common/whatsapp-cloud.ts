import { Injectable, Logger, Module } from '@nestjs/common';
import { AdministrationModule } from '../administration/administration.module';
import { IntegrationsService } from '../administration/integrations.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  WHATSAPP CLOUD — order-এর নিজের বার্তা (transactional), Meta Cloud API দিয়ে।

  সাইট জুড়ে লেখা "confirmation on WhatsApp", "we send the delivery photo
  there" — আর পাঠানোর কোনো ব্যবস্থাই ছিল না। এই service সেই ফাঁক বন্ধ করে:
  order → confirmation, out-for-delivery আর delivered → status বার্তা।

  ⚠️ MARKETING-এর WhatsappService এর জায়গা এটা নয়, নেয়ও না। ওটা broadcast —
  opt-out, one-per-occasion, Outreach খাতা (MKT-D07/D18)। এটা রসিদের বার্তা:
  গ্রাহক এইমাত্র নিজে order দিয়েছেন, তাঁকে তাঁর নিজের order-এর খবর দেওয়া।
  দুটো মেশালে একদিন কেউ opt-out-করা গ্রাহককে promo পাঠিয়ে ফেলত — বা উল্টোটা,
  opt-out-এর ভয়ে রসিদই আটকে যেত।

  ⚠️ চাবি ADMIN থেকে (মালিকের নিয়ম: সব customizable) —
  Administration → Integrations → Messaging → WhatsApp Business API:
  Phone number ID (clientId) + Permanent access token (apiKey), `isEnabled`
  টিক সহ। `.env`-এর WHATSAPP_* ঘরগুলো fallback মাত্র।

  ⚠️ TEMPLATE বাধ্যতামূলক, Meta-র নিয়মে। ব্যবসা আগ বাড়িয়ে বার্তা পাঠালে সেটা
  Meta-অনুমোদিত template হতেই হয় — সাধারণ text কেবল গ্রাহকের বার্তার ২৪
  ঘণ্টার মধ্যে চলে। তাই template-এর নামগুলো config (env WA_TPL_*), আর Meta
  console-এ ওই নামে template approve করাতে হবে। `hello_world` টা Meta নিজেই
  সব account-এ আগে থেকে approve করে রাখে — test বোতাম ওটাই পাঠায়, যাতে
  চাবি বসানোর ৩০ সেকেন্ডের মধ্যে মালিক নিজের ফোনে প্রমাণ পান।

  ⚠️ FAIL-SOFT, সর্বত্র। বার্তা একটা সৌজন্য; order-টা চুক্তি। WhatsApp-এর
  কোনো ব্যর্থতা কখনো order আটকাবে না — log-এ পড়বে, timeline-এ উঠবে, ব্যস।
  ═══════════════════════════════════════════════════════════════════════════
*/

const GRAPH = 'https://graph.facebook.com/v20.0';

/** Meta console-এ এই নামে template approve করাতে হবে (ভাষা: en) */
const TPL = {
  confirm: process.env.WA_TPL_ORDER_CONFIRM || 'order_confirmation',
  out: process.env.WA_TPL_ORDER_OUT || 'order_out_for_delivery',
  delivered: process.env.WA_TPL_ORDER_DELIVERED || 'order_delivered',
};

@Injectable()
export class WhatsAppCloudService {
  private readonly log = new Logger('WhatsAppCloud');

  constructor(private readonly integrations: IntegrationsService) {}

  /** admin-এর Integrations সারি; না পেলে env; দুটোই না থাকলে null = নীরব */
  private async creds(): Promise<{ phoneId: string; token: string } | null> {
    try {
      const row = await this.integrations.credentials('MESSAGING', 'WHATSAPP');
      if (row?.isEnabled && row.clientId && row.apiKey) {
        return { phoneId: row.clientId, token: row.apiKey };
      }
    } catch {
      /* integrations table unreachable — env fallback below */
    }
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    return phoneId && token ? { phoneId, token } : null;
  }

  /** "+8801712…" / "01712…" → "8801712…" — Graph API চায় দেশকোড, চিহ্নহীন */
  private msisdn(phone: string): string | null {
    const d = phone.replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('01')) return '88' + d;
    if (d.length >= 11) return d;
    return null;
  }

  private async send(to: string, payload: Record<string, unknown>): Promise<boolean> {
    const c = await this.creds();
    if (!c) return false; // চাবি নেই = feature বন্ধ, error নয়
    const msisdn = this.msisdn(to);
    if (!msisdn) return false;

    try {
      const res = await fetch(`${GRAPH}/${c.phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${c.token}`,
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: msisdn, ...payload }),
      });
      if (!res.ok) {
        const body = await res.text();
        this.log.warn(`send failed (${res.status}) to ${msisdn.slice(0, 6)}…: ${body.slice(0, 300)}`);
        return false;
      }
      return true;
    } catch (e) {
      this.log.warn(`send error: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

  private template(name: string, params: string[], lang = 'en') {
    return {
      type: 'template',
      template: {
        name,
        language: { code: lang },
        ...(params.length
          ? {
              components: [
                {
                  type: 'body',
                  parameters: params.map((text) => ({ type: 'text', text })),
                },
              ],
            }
          : {}),
      },
    };
  }

  /** মালিকের test বোতাম — Meta-র pre-approved hello_world, ভাষা en_US */
  async sendTest(to: string): Promise<{ sent: boolean; configured: boolean }> {
    const configured = (await this.creds()) !== null;
    if (!configured) return { sent: false, configured };
    const sent = await this.send(to, this.template('hello_world', [], 'en_US'));
    return { sent, configured };
  }

  /** order placed — {{1}} নাম · {{2}} order নম্বর · {{3}} মোট (৳) */
  orderConfirmation(o: { senderPhone: string; senderName: string; orderNo: string; totalPaisa: number }) {
    return this.send(
      o.senderPhone,
      this.template(TPL.confirm, [o.senderName, o.orderNo, `৳${(o.totalPaisa / 100).toLocaleString('en-IN')}`]),
    );
  }

  /** out for delivery — {{1}} order নম্বর */
  orderOut(o: { senderPhone: string; orderNo: string }) {
    return this.send(o.senderPhone, this.template(TPL.out, [o.orderNo]));
  }

  /** delivered — {{1}} order নম্বর */
  orderDelivered(o: { senderPhone: string; orderNo: string }) {
    return this.send(o.senderPhone, this.template(TPL.delivered, [o.orderNo]));
  }
}

@Module({
  imports: [AdministrationModule],
  providers: [WhatsAppCloudService],
  exports: [WhatsAppCloudService],
})
export class WhatsAppCloudModule {}
