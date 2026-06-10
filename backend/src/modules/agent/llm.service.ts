import {
    HttpStatus,
    Injectable,
    Logger,
    OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FriendlyException, ErrorKeys } from '../../common/errors';
import { LlmProvider } from './llm/llm-provider.interface';
import { LlmRequest, LlmResponse } from './llm/llm.types';
import { AnthropicProvider } from './llm/anthropic.provider';
import { OpenAiProvider } from './llm/openai.provider';

/** Default model per provider; override with <PROVIDER>_MODEL. */
const DEFAULT_MODELS: Record<string, string> = {
    anthropic: 'claude-sonnet-4-6',
    openai: 'gpt-4o'
};

/**
 * Provider-agnostic entry point for the agent. Selects a concrete
 * {@link LlmProvider} from `LLM_PROVIDER` (default "anthropic") and forwards
 * neutral chat requests to it. Adding a provider is a new class + a case here.
 */
@Injectable()
export class LlmService implements OnModuleInit {
    private readonly logger = new Logger('LlmService');
    private provider!: LlmProvider;

    constructor(private readonly config: ConfigService) {}

    onModuleInit(): void {
        this.provider = this.createProvider();
        this.logger.log(`LLM provider: ${this.provider.name}`);
    }

    async chat(req: LlmRequest): Promise<LlmResponse> {
        try {
            return await this.provider.chat(req);
        } catch (err) {
            // Surface upstream LLM failures (auth, rate limit, network, 5xx)
            // as a clean, consistent error instead of leaking SDK internals.
            const message = (err as Error)?.message ?? 'unknown error';
            this.logger.error(
                `LLM provider "${this.provider.name}" request failed: ${message}`
            );
            throw new FriendlyException(
                `The AI provider (${this.provider.name}) request failed: ${message}`,
                'llm',
                ErrorKeys.LLM_REQUEST_FAILED,
                HttpStatus.BAD_GATEWAY
            );
        }
    }

    private createProvider(): LlmProvider {
        const name = (
            this.config.get<string>('LLM_PROVIDER') || 'anthropic'
        ).toLowerCase();

        switch (name) {
            case 'anthropic':
                return new AnthropicProvider({
                    apiKey: this.requireKey('ANTHROPIC_API_KEY'),
                    model:
                        this.config.get<string>('ANTHROPIC_MODEL') ||
                        DEFAULT_MODELS.anthropic
                });
            case 'openai':
                return new OpenAiProvider({
                    apiKey: this.requireKey('OPENAI_API_KEY'),
                    model:
                        this.config.get<string>('OPENAI_MODEL') ||
                        DEFAULT_MODELS.openai
                });
            default:
                throw new Error(
                    `Unknown LLM_PROVIDER "${name}". Supported: anthropic, openai.`
                );
        }
    }

    private requireKey(envVar: string): string {
        const key = this.config.get<string>(envVar);
        if (!key) {
            // Surface a clear error at boot rather than a cryptic 401 later.
            throw new Error(`${envVar} is not set. Add it to your .env file.`);
        }
        return key;
    }
}
