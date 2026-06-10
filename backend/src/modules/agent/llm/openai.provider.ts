import OpenAI from 'openai';
import { LlmProvider } from './llm-provider.interface';
import {
    LlmMessage,
    LlmRequest,
    LlmResponse,
    LlmStopReason,
    LlmToolSpec
} from './llm.types';

const DEFAULT_MAX_TOKENS = 2048;

export interface OpenAiProviderConfig {
    apiKey: string;
    model: string;
    maxTokens?: number;
}

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatTool = OpenAI.Chat.Completions.ChatCompletionTool;

// ---- pure mappers (exported for unit testing) ----

export function toOpenAiTools(tools: LlmToolSpec[]): ChatTool[] {
    return tools.map((t) => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema
        }
    }));
}

/**
 * Flatten neutral messages into OpenAI's chat format. A `system` prompt is
 * prepended as a system message; a single neutral user turn carrying tool
 * results expands into one `role:"tool"` message per result.
 */
export function toOpenAiMessages(
    system: string,
    messages: LlmMessage[]
): ChatMessage[] {
    const out: ChatMessage[] = [{ role: 'system', content: system }];

    for (const m of messages) {
        if (m.role === 'assistant') {
            const toolCalls = (m.toolCalls ?? []).map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: {
                    name: c.name,
                    arguments: JSON.stringify(c.input ?? {})
                }
            }));
            out.push({
                role: 'assistant',
                content: m.text ?? '',
                ...(toolCalls.length ? { tool_calls: toolCalls } : {})
            });
            continue;
        }
        // user turn
        if (m.toolResults?.length) {
            for (const r of m.toolResults) {
                out.push({
                    role: 'tool',
                    tool_call_id: r.toolCallId,
                    content: r.content
                });
            }
        } else {
            out.push({ role: 'user', content: m.text ?? '' });
        }
    }
    return out;
}

export function mapFinishReason(reason: string | null | undefined): LlmStopReason {
    switch (reason) {
        case 'tool_calls':
        case 'function_call':
            return 'tool_use';
        case 'stop':
            return 'end';
        case 'length':
            return 'max';
        default:
            return 'other';
    }
}

/** Parse tool-call argument JSON, tolerating empty/malformed strings. */
export function parseArgs(raw: string | undefined): Record<string, unknown> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object'
            ? (parsed as Record<string, unknown>)
            : {};
    } catch {
        return {};
    }
}

export function fromOpenAiCompletion(
    completion: OpenAI.Chat.Completions.ChatCompletion
): LlmResponse {
    const choice = completion.choices[0];
    const message = choice?.message;
    const text = (message?.content ?? '').trim();
    const toolCalls = (message?.tool_calls ?? [])
        .filter((c) => c.type === 'function')
        .map((c) => ({
            id: c.id,
            name: c.function.name,
            input: parseArgs(c.function.arguments)
        }));
    return { text, toolCalls, stop: mapFinishReason(choice?.finish_reason) };
}

// ---- provider ----

export class OpenAiProvider implements LlmProvider {
    readonly name = 'openai';
    private readonly client: OpenAI;
    private readonly model: string;
    private readonly maxTokens: number;

    constructor(cfg: OpenAiProviderConfig) {
        this.client = new OpenAI({ apiKey: cfg.apiKey });
        this.model = cfg.model;
        this.maxTokens = cfg.maxTokens ?? DEFAULT_MAX_TOKENS;
    }

    async chat(req: LlmRequest): Promise<LlmResponse> {
        const completion = await this.client.chat.completions.create({
            model: this.model,
            max_tokens: req.maxTokens ?? this.maxTokens,
            tools: toOpenAiTools(req.tools),
            messages: toOpenAiMessages(req.system, req.messages)
        });
        return fromOpenAiCompletion(completion);
    }
}
