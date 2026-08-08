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
const IG_GRAPH = 'https://graph.instagram.com/v23.0';

export interface SendOutcome {
  ok: boolean;
  /** Nothing to send over — web chat, or the channel is not connected. */
  skipped?: boolean;
  error?: string;
  /** Meta's id for the message just sent — lets the webhook's echo of THIS
      exact send recognise itself and not save a second copy. */
  providerMessageId?: string;
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
        return this.sendMessenger(convo.externalIdentity, body);

      case InboxChannel.INSTAGRAM:
        return this.sendInstagram(convo.externalIdentity, body);

      default:
        return { ok: false, skipped: true, error: `no sender for ${convo.channel}` };
    }
  }

  /** Messenger goes out through the Facebook Page. */
  private async sendMessenger(psid: string, body: string): Promise<SendOutcome> {
    const creds = await this.creds('FACEBOOK_PAGE', 'FACEBOOK_PAGE_TOKEN');
    if (!creds.token) return { ok: false, skipped: true, error: 'Facebook Page is not connected' };
    return this.post(InboxChannel.MESSENGER, `${GRAPH}/me/messages`, creds.token, psid, body);
  }

  /*
    Instagram does NOT go through the Page. Meta offers two setups and they are
    not interchangeable: with Instagram login the account holds its own token
    and its own host, which is the one Radian uses because connecting an
    account there is a single click rather than a login flow we would have to
    build.

    The recipient id is scoped to the Instagram account, so a Page token here
    would be refused even though both are "Meta".
  */
  private async sendInstagram(igsid: string, body: string): Promise<SendOutcome> {
    const creds = await this.creds('INSTAGRAM', 'INSTAGRAM_TOKEN', 'INSTAGRAM_ACCOUNT_ID');
    if (!creds.token) return { ok: false, skipped: true, error: 'Instagram is not connected' };
    const account = creds.accountId || 'me';
    return this.post(
      InboxChannel.INSTAGRAM, `${IG_GRAPH}/${account}/messages`, creds.token, igsid, body,
    );
  }

  private async post(
    channel: InboxChannel,
    url: string,
    token: string,
    recipient: string,
    body: string,
  ): Promise<SendOutcome> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          recipient: { id: recipient },
          message: { text: body.slice(0, 1000) },
          // RESPONSE keeps us inside the 24-hour window rules rather than
          // claiming a tag we do not have.
          messaging_type: 'RESPONSE',
        }),
      });
      if (res.ok) {
        const j = (await res.json().catch(() => null)) as { message_id?: string } | null;
        return { ok: true, providerMessageId: j?.message_id };
      }
      const text = await res.text();
      this.log.warn(`${channel} send failed (${res.status}): ${text.slice(0, 300)}`);
      return { ok: false, error: `${res.status}: ${text.slice(0, 300)}` };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.log.warn(`${channel} send error: ${error}`);
      return { ok: false, error };
    }
  }

  /** Admin first, environment second — so a key can be changed without a deploy. */
  private async creds(provider: string, tokenEnv: string, idEnv?: string) {
    try {
      const row = await this.integrations.credentials('SOCIAL', provider);
      if (row?.isEnabled && row.apiKey?.trim()) {
        return { token: row.apiKey.trim(), accountId: row.clientId?.trim() || null };
      }
    } catch {
      /* fall through to env */
    }
    return {
      token: process.env[tokenEnv] || null,
      accountId: (idEnv && process.env[idEnv]) || null,
    };
  }
}
