/*
  Provider seam — মালিকের রায় (৫ আগস্ট): "দুটোর জন্যই বানাও, আপাতত Anthropic।"

  দুটো client-ই খালি fetch — SDK ইচ্ছা করে নেই: container-এ নতুন dependency
  মানে নতুন build-ঝুঁকি, আর দুটো HTTP call-এর জন্য দুটো SDK টানা অপচয়।

  Switch = InboxSetting.aiProvider (admin থেকে বদলানো যায়, ঘরের নিয়ম)।
  Key কখনো DB-তে নয় — env-এ: ANTHROPIC_API_KEY / OPENAI_API_KEY।
  যে provider-এর key নেই সে "unconfigured" — AI চুপ, inbox মানুষের কাছে
  (AI মরলেও দোকান ভাঙে না — নকশার exception-পথ)।
*/

export interface AiToolDef {
  name: string;
  description: string;
  /** JSON Schema — দুই provider-ই এই এক রূপ থেকে নিজেরটা বানায় */
  parameters: Record<string, unknown>;
}

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AiTurn {
  /** model-এর লেখা (tool ডাকলে খালি হতে পারে) */
  text: string;
  toolCalls: AiToolCall[];
  stop: 'end' | 'tool_use' | 'length';
}

export interface AiProviderClient {
  readonly name: 'ANTHROPIC' | 'OPENAI';
  configured(): boolean;
  chat(args: {
    system: string;
    messages: AiMessage[];
    tools: AiToolDef[];
    /** আগের tool-call-এর ফলাফল ফেরত দেওয়ার ধারা — provider-নিজস্ব রূপে জমে */
    transcript?: unknown[];
    model: string;
    maxTokens: number;
  }): Promise<{ turn: AiTurn; transcript: unknown[] }>;
  /** tool-ফলাফল transcript-এ যোগ করা, পরের chat() call-এর জন্য */
  toolResult(transcript: unknown[], call: AiToolCall, result: unknown): unknown[];
}

const TIMEOUT_MS = 30_000;

/* ═══════════════════════════ Anthropic ═══════════════════════════ */

interface AnthropicBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export class AnthropicClient implements AiProviderClient {
  readonly name = 'ANTHROPIC' as const;

  configured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async chat(args: {
    system: string;
    messages: AiMessage[];
    tools: AiToolDef[];
    transcript?: unknown[];
    model: string;
    maxTokens: number;
  }): Promise<{ turn: AiTurn; transcript: unknown[] }> {
    const history =
      args.transcript ?? args.messages.map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: args.model,
        max_tokens: args.maxTokens,
        system: args.system,
        messages: history,
        tools: args.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        })),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      content: AnthropicBlock[];
      stop_reason: string;
    };

    const text = data.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    const toolCalls: AiToolCall[] = data.content
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ id: b.id ?? '', name: b.name ?? '', args: b.input ?? {} }));

    // assistant-এর পুরো block-তালিকা transcript-এ — tool_use id গুলো এখানেই থাকে
    const transcript = [...history, { role: 'assistant', content: data.content }];

    return {
      turn: {
        text,
        toolCalls,
        stop:
          data.stop_reason === 'tool_use' ? 'tool_use' : data.stop_reason === 'max_tokens' ? 'length' : 'end',
      },
      transcript,
    };
  }

  toolResult(transcript: unknown[], call: AiToolCall, result: unknown): unknown[] {
    return [
      ...transcript,
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: call.id,
            content: JSON.stringify(result).slice(0, 8000),
          },
        ],
      },
    ];
  }
}

/* ═══════════════════════════ OpenAI ═══════════════════════════ */

interface OpenAiToolCallRaw {
  id: string;
  function: { name: string; arguments: string };
}

export class OpenAiClient implements AiProviderClient {
  readonly name = 'OPENAI' as const;

  configured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async chat(args: {
    system: string;
    messages: AiMessage[];
    tools: AiToolDef[];
    transcript?: unknown[];
    model: string;
    maxTokens: number;
  }): Promise<{ turn: AiTurn; transcript: unknown[] }> {
    const history =
      args.transcript ??
      [
        { role: 'system', content: args.system },
        ...args.messages.map((m) => ({ role: m.role, content: m.content })),
      ];

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}`,
      },
      body: JSON.stringify({
        model: args.model,
        max_completion_tokens: args.maxTokens,
        messages: history,
        tools: args.tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices: {
        message: { content: string | null; tool_calls?: OpenAiToolCallRaw[] };
        finish_reason: string;
      }[];
    };
    const msg = data.choices[0]?.message;
    const toolCalls: AiToolCall[] = (msg?.tool_calls ?? []).map((t) => ({
      id: t.id,
      name: t.function.name,
      args: safeJson(t.function.arguments),
    }));

    const transcript = [...history, { role: 'assistant', content: msg?.content ?? null, tool_calls: msg?.tool_calls }];

    return {
      turn: {
        text: msg?.content ?? '',
        toolCalls,
        stop:
          data.choices[0]?.finish_reason === 'tool_calls'
            ? 'tool_use'
            : data.choices[0]?.finish_reason === 'length'
              ? 'length'
              : 'end',
      },
      transcript,
    };
  }

  toolResult(transcript: unknown[], call: AiToolCall, result: unknown): unknown[] {
    return [
      ...transcript,
      {
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 8000),
      },
    ];
  }
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function providerFor(name: string): AiProviderClient {
  return name === 'OPENAI' ? new OpenAiClient() : new AnthropicClient();
}
