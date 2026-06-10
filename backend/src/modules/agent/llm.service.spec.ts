import { HttpStatus } from '@nestjs/common';
import { LlmService } from './llm.service';
import { LlmProvider } from './llm/llm-provider.interface';
import { LlmResponse } from './llm/llm.types';
import { FriendlyException, ErrorKeys } from '../../common/errors';

function attachProvider(service: LlmService, provider: LlmProvider): void {
    // The provider is normally created in onModuleInit from config; inject
    // directly here to test chat() in isolation.
    (service as unknown as { provider: LlmProvider }).provider = provider;
}

describe('LlmService.chat', () => {
    let service: LlmService;

    beforeEach(() => {
        service = new LlmService({ get: () => undefined } as any);
    });

    it('passes through a successful provider response', async () => {
        const response: LlmResponse = {
            text: 'ok',
            toolCalls: [],
            stop: 'end'
        };
        attachProvider(service, {
            name: 'fake',
            chat: async () => response
        });

        await expect(
            service.chat({ system: 's', tools: [], messages: [] })
        ).resolves.toBe(response);
    });

    it('wraps provider errors in a FriendlyException (502, LLM_REQUEST_FAILED)', async () => {
        attachProvider(service, {
            name: 'fake',
            chat: async () => {
                throw new Error('rate limit exceeded');
            }
        });

        await expect(
            service.chat({ system: 's', tools: [], messages: [] })
        ).rejects.toBeInstanceOf(FriendlyException);

        // And the error carries the right status, key, and a readable message.
        try {
            await service.chat({ system: 's', tools: [], messages: [] });
            throw new Error('expected throw');
        } catch (err) {
            expect(err).toBeInstanceOf(FriendlyException);
            const ex = err as FriendlyException;
            expect(ex.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
            const body = ex.getResponse() as {
                message: string;
                data: { errors: ErrorKeys[] }[];
            };
            expect(body.message).toContain('rate limit exceeded');
            expect(body.data[0].errors).toContain(
                ErrorKeys.LLM_REQUEST_FAILED
            );
        }
    });
});
