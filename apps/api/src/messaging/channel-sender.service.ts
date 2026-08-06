import { Injectable, Logger } from '@nestjs/common';
import { InboxChannel } from '@prisma/client';
import { IntegrationsService } from '../administration/integrations.service';
import { WhatsAppCloudService } from '../common/whatsapp-cloud';

/*
  One place that knows how to get a reply out to a customer, whatever channel
  the conversation arrived on.

  This exists because the same bug happened twice: outbound sending was wired
  into the staff reply path, and the AI's answers went nowhere. Web chat hides
  it — the customer's browser polls — so on every other channel a reply can be
  written, stored and never delivered. With one sender, adding a channel is one
  case here rather than a search for every place that writes a message.
*/

const GRAPH = 'https://graph.facebook.com/v25.0';

export interface SendOutcome {
  ok: boolean;
  /** Nothing to send over — web chat, or the channel is not connected. */
  skipped?: boolean;
  error?: string;
}

@Injectable()
export class ChannelSender {
  private readonly log = new Logger('ChannelSender');

  constructor(
    private readonly wa: WhatsAppCloudService,
    private readonly integrations: IntegrationsService,
  ) {}

  async send(
    convo: { id: string; channel: InboxChannel; externalIdentity: string | null },
    body: string,
  ): Promise<SendOutcome> {
    if (convo.channel === InboxChannel.WEB_CHAT) return { ok: true, skipped: true };
    if (!convo.externalIdentity) return { ok: false, error: 'no external identity on the thread' };

    switch (convo.channel) {
      case InboxChannel.WHATSAPP: {
        const r = await this.wa.sendRaw(convo.externalIdentity, {
          type: 'text',
          text: { body },
        });
        if (!r.ok && !r.configured) return { ok: false, skipped: true, error: r.error };
        return { ok: r.ok, error: r.error };
      }

      case InboxChannel.MESSENGER:
      case InboxChannel.INSTAGRAM:
        return this.sendMeta(convo.channel, convo.externalIdentity, body);

      default:
        return { ok: false, skipped: true, error: `no sender for ${convo.channel}` };
    }
  }

  /*
    Messenger and Instagram DMs both go out through the Page, so they share a
    token and an endpoint. Instagram only works while the account is linked to
    the Facebook Page — which is also the only way its messages reach us.
  */
  private async sendMeta(
    channel: InboxChannel,
    psid: string,
    body: string,
  ): Promise<SendOutcome> {
    const token = await this.pageToken();
    if (!token) return { ok: false, skipped: true, error: 'Facebook Page is not connected' };

    try {
      const res = await fetch(`${GRAPH}/me/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          recipient: { id: psid },
          message: { text: body.slice(0, 1000) },
          // RESPONSE keeps us inside the 24-hour window rules rather than
          // claiming a tag we do not have.
          messaging_type: 'RESPONSE',
        }),
      });
      if (res.ok) return { ok: true };
      const text = await res.text();
      this.log.warn(`${channel} send failed (${res.status}): ${text.slice(0, 300)}`);
      return { ok: false, error: `${res.status}: ${text.slice(0, 300)}` };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.log.warn(`${channel} send error: ${error}`);
      return { ok: false, error };
    }
  }

  private async pageToken(): Promise<string | null> {
    try {
      const row = await this.integrations.credentials('SOCIAL', 'FACEBOOK_PAGE');
      if (row?.isEnabled && row.apiKey?.trim()) return row.apiKey.trim();
    } catch {
      /* fall through to env */
    }
    return process.env.FACEBOOK_PAGE_TOKEN || null;
  }
}
