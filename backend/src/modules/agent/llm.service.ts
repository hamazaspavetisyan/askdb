import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

/** Default model; override with ANTHROPIC_MODEL. */
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 2048;

export interface LlmCallParams {
    system: string;
    tools: Anthropic.Tool[];
    messages: Anthropic.MessageParam[];
}

/**
 * Thin wrapper around the Anthropic SDK so the agent depends on a small,
 * mockable surface rather than the client directly.
 */
@Injectable()
export class LlmService implements OnModuleInit {
    private client!: Anthropic;
    private model = DEFAULT_MODEL;

    constructor(private readonly config: ConfigService) {}

    onModuleInit(): void {
        const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
        if (!apiKey) {
            // Surface a clear error at boot rather than a cryptic 401 later.
            throw new Error(
                'ANTHROPIC_API_KEY is not set. Add it to your .env file.'
            );
        }
        this.client = new Anthropic({ apiKey });
        this.model =
            this.config.get<string>('ANTHROPIC_MODEL') || DEFAULT_MODEL;
    }

    createMessage(params: LlmCallParams): Promise<Anthropic.Message> {
        return this.client.messages.create({
            model: this.model,
            max_tokens: DEFAULT_MAX_TOKENS,
            system: params.system,
            tools: params.tools,
            messages: params.messages
        });
    }
}
