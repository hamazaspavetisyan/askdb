import Anthropic from '@anthropic-ai/sdk';
import { LlmProvider } from './llm-provider.interface';
import {
    LlmMessage,
    LlmRequest,
    LlmResponse,
    LlmStopReason,
    LlmToolSpec
} from './llm.types';

const DEFAULT_MAX_TOKENS = 2048;

export interface AnthropicProviderConfig {
    apiKey: string;
    model: string;
    maxTokens?: number;
}

// ---- pure mappers (exported for unit testing) ----

export function toAnthropicTools(tools: LlmToolSpec[]): Anthropic.Tool[] {
    return tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema
    }));
}

export function toAnthropicMessages(
    messages: LlmMessage[]
): Anthropic.MessageParam[] {
    return messages.map((m) => {
        if (m.role === 'assistant') {
            const content: Anthropic.ContentBlockParam[] = [];
            if (m.text) content.push({ type: 'text', text: m.text });
            for (const call of m.toolCalls ?? []) {
                content.push({
                    type: 'tool_use',
                    id: call.id,
                    name: call.name,
                    input: call.input
                });
            }
            return { role: 'assistant', content };
        }
        // user turn: either tool results or plain text
        if (m.toolResults?.length) {
            const content: Anthropic.ContentBlockParam[] = m.toolResults.map(
                (r) => ({
                    type: 'tool_result',
                    tool_use_id: r.toolCallId,
                    content: r.content,
                    is_error: r.isError
                })
            );
            return { role: 'user', content };
        }
        return { role: 'user', content: m.text ?? '' };
    });
}

export function mapStopReason(
    reason: Anthropic.Message['stop_reason']
): LlmStopReason {
    switch (reason) {
        case 'tool_use':
            return 'tool_use';
        case 'end_turn':
        case 'stop_sequence':
            return 'end';
        case 'max_tokens':
            return 'max';
        default:
            return 'other';
    }
}

export function fromAnthropicMessage(msg: Anthropic.Message): LlmResponse {
    const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
    const toolCalls = msg.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        .map((b) => ({
            id: b.id,
            name: b.name,
            input: (b.input ?? {}) as Record<string, unknown>
        }));
    return { text, toolCalls, stop: mapStopReason(msg.stop_reason) };
}

// ---- provider ----

export class AnthropicProvider implements LlmProvider {
    readonly name = 'anthropic';
    private readonly client: Anthropic;
    private readonly model: string;
    private readonly maxTokens: number;

    constructor(cfg: AnthropicProviderConfig) {
        this.client = new Anthropic({ apiKey: cfg.apiKey });
        this.model = cfg.model;
        this.maxTokens = cfg.maxTokens ?? DEFAULT_MAX_TOKENS;
    }

    async chat(req: LlmRequest): Promise<LlmResponse> {
        const msg = await this.client.messages.create({
            model: this.model,
            max_tokens: req.maxTokens ?? this.maxTokens,
            system: req.system,
            tools: toAnthropicTools(req.tools),
            messages: toAnthropicMessages(req.messages)
        });
        return fromAnthropicMessage(msg);
    }
}
