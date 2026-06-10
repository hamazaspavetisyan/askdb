import { LlmRequest, LlmResponse } from './llm.types';

/**
 * A chat-with-tools LLM backend. Implementations wrap a vendor SDK and
 * translate to/from the neutral {@link LlmRequest}/{@link LlmResponse} shapes.
 * Adding a provider means adding one class — the agent loop never changes.
 */
export interface LlmProvider {
    /** Stable identifier, e.g. "anthropic" | "openai". */
    readonly name: string;
    chat(req: LlmRequest): Promise<LlmResponse>;
}
