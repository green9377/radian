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

/* v25: Meta keeps each version about two years and v20 is near its end. */
const GRAPH = 'https://graph.facebook.com/v25.0';

/** Template names as approved in Meta (language: en). */
export const TPL = {
  confirm: process.env.WA_TPL_ORDER_CONFIRM || 'order_confirmation',
  confirmCod: process.env.WA_TPL_ORDER_CONFIRM_COD || 'order_confirmation_cod',
  out: process.env.WA_TPL_ORDER_OUT || 'order_out_for_delivery',
  delivered: process.env.WA_TPL_ORDER_DELIVERED || 'order_delivered',
  paymentFailed: process.env.WA_TPL_PAYMENT_FAILED || 'payment_failed',
  abandoned: process.env.WA_TPL_CHECKOUT_ABANDONED || 'checkout_abandoned',
};

/** Send result: whether it went, why not, and Meta's message id. */
export interface SendResult {
  ok: boolean;
  /** No keys saved — the feature is off, not broken. */
  configured: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class WhatsAppCloudService {
  private readonly log = new Logger('WhatsAppCloud');

  constructor(private readonly integrations: IntegrationsService) {}

  /** Admin first, env as fallback; null means the feature is simply off. */
  private async creds(): Promise<{ phoneId: string; token: string } | null> {
    try {
      const row = await this.integrations.credentials('MESSAGING', 'WHATSAPP');
      if (row?.isEnabled && row.clientId && row.apiKey) {
        return { phoneId: row.clientId, token: row.apiKey };
      }
    } catch {
      /* integrations unreachable — env fallback below */
    }
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    return phoneId && token ? { phoneId, token } : null;
  }

  /** Graph wants a country code and no punctuation. */
  private msisdn(phone: string): string | null {
    const d = phone.replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('01')) return '88' + d;
    if (d.length >= 11) return d;
    return null;
  }

  /*
    Returns the Meta message id and the failure reason, not just a boolean —
    "did the customer get their confirmation" needs an answer somewhere.
  */
  async sendRaw(
    to: string,
    payload: Record<string, unknown>,
  ): Promise<SendResult> {
    const c = await this.creds();
    if (!c) return { ok: false, configured: false, error: 'WhatsApp keys not set' };
    const msisdn = this.msisdn(to);
    if (!msisdn) return { ok: false, configured: true, error: `unusable phone: ${to}` };

    try {
      const res = await fetch(`${GRAPH}/${c.phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${c.token}`,
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: msisdn, ...payload }),
      });
      const body = await res.text();
      if (!res.ok) {
        this.log.warn(`send failed (${res.status}) to ${msisdn.slice(0, 6)}…: ${body.slice(0, 300)}`);
        return { ok: false, configured: true, error: `${res.status}: ${body.slice(0, 300)}` };
      }
      let messageId: string | undefined;
      try {
        messageId = (JSON.parse(body) as { messages?: { id?: string }[] })?.messages?.[0]?.id;
      } catch {
        /* sent, but the id could not be read */
      }
      return { ok: true, configured: true, messageId };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.log.warn(`send error: ${error}`);
      return { ok: false, configured: true, error };
    }
  }

  /** For call sites where a boolean is enough. */
  private async send(to: string, payload: Record<string, unknown>): Promise<boolean> {
    return (await this.sendRaw(to, payload)).ok;
  }

  /**
   * @param urlSuffix goes into the template's first URL button. Meta accepts
   *   only the last segment of the address, not the whole URL.
   */
  template(name: string, params: string[], lang = 'en', urlSuffix?: string) {
    const components: Record<string, unknown>[] = [];
    if (params.length) {
      components.push({
        type: 'body',
        parameters: params.map((text) => ({ type: 'text', text })),
      });
    }
    if (urlSuffix) {
      components.push({
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: urlSuffix }],
      });
    }
    return {
      type: 'template',
      template: {
        name,
        language: { code: lang },
        ...(components.length ? { components } : {}),
      },
    };
  }

  /** The admin test button. hello_world is pre-approved on every account. */
  async sendTest(to: string): Promise<{ sent: boolean; configured: boolean }> {
    const configured = (await this.creds()) !== null;
    if (!configured) return { sent: false, configured };
    const sent = await this.send(to, this.template('hello_world', [], 'en_US'));
    return { sent, configured };
  }

  /** {{1}} name, {{2}} order number, {{3}} total */
  orderConfirmation(o: { senderPhone: string; senderName: string; orderNo: string; totalPaisa: number }) {
    return this.send(
      o.senderPhone,
      this.template(TPL.confirm, [o.senderName, o.orderNo, `৳${(o.totalPaisa / 100).toLocaleString('en-IN')}`]),
    );
  }

  /** {{1}} name, {{2}} order number */
  orderOut(o: { senderPhone: string; senderName: string; orderNo: string }) {
    return this.send(o.senderPhone, this.template(TPL.out, [o.senderName, o.orderNo]));
  }

  /** {{1}} name, {{2}} order number */
  orderDelivered(o: { senderPhone: string; senderName: string; orderNo: string }) {
    return this.send(o.senderPhone, this.template(TPL.delivered, [o.senderName, o.orderNo]));
  }
}

@Module({
  imports: [AdministrationModule],
  providers: [WhatsAppCloudService],
  exports: [WhatsAppCloudService],
})
export class WhatsAppCloudModule {}
