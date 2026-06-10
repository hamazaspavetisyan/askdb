import Anthropic from '@anthropic-ai/sdk';
import { QueryAgentService } from './query-agent.service';
import { LlmService } from './llm.service';
import { DatabaseAdapter } from '../../database/database-adapter.interface';
import { FriendlyException, ErrorKeys } from '../../common/errors';
import { HttpStatus } from '@nestjs/common';

const noopLogger = { warn: () => {}, log: () => {}, error: () => {} } as any;

function adapterStub(
    overrides: Partial<DatabaseAdapter> = {}
): DatabaseAdapter {
    return {
        dbType: 'mongodb',
        connect: async () => {},
        disconnect: async () => {},
        listDatabases: async () => ['shop'],
        listEntities: async () => ['users'],
        describeEntity: async (_d, entity) => ({
            entity,
            fields: [{ name: 'name', type: 'string' }],
            source: 'sampled'
        }),
        sampleData: async () => [{ name: 'Samuel' }],
        validateReadOnly: () => {},
        runReadOnlyQuery: async () => ({
            rows: [{ name: 'Samuel', age: 30 }],
            rowCount: 1
        }),
        queryToolSpec: () => ({
            description: 'run-only',
            inputSchema: { type: 'object', properties: {} }
        }),
        formatQuery: () => 'db.users.find({"name":"Samuel"})',
        ...overrides
    };
}

/** Build a fake Anthropic.Message. */
function msg(
    content: Anthropic.ContentBlock[],
    stop: Anthropic.Message['stop_reason']
): Anthropic.Message {
    return {
        id: 'm',
        type: 'message',
        role: 'assistant',
        model: 'test',
        content,
        stop_reason: stop,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 } as any
    } as Anthropic.Message;
}

function toolUse(
    name: string,
    input: unknown,
    id = name
): Anthropic.ToolUseBlock {
    return { type: 'tool_use', id, name, input } as Anthropic.ToolUseBlock;
}
function text(t: string): Anthropic.TextBlock {
    return { type: 'text', text: t } as Anthropic.TextBlock;
}

/** LlmService double that replays a scripted sequence of responses. */
function scriptedLlm(responses: Anthropic.Message[]): LlmService {
    let i = 0;
    return {
        createMessage: async () => {
            if (i >= responses.length)
                throw new Error('no more scripted responses');
            return responses[i++];
        }
    } as unknown as LlmService;
}

describe('QueryAgentService', () => {
    it('drives tools then returns query, explanation and rows', async () => {
        const llm = scriptedLlm([
            msg([toolUse('list_entities', {})], 'tool_use'),
            msg([toolUse('describe_entity', { entity: 'users' })], 'tool_use'),
            msg(
                [toolUse('run_query', { op: 'find', collection: 'users' })],
                'tool_use'
            ),
            msg([text('Found 1 user named Samuel.')], 'end_turn')
        ]);
        const agent = new QueryAgentService(llm, noopLogger);
        const result = await agent.run(adapterStub(), 'shop', 'find Samuel');

        expect(result.generatedQuery).toContain('db.users.find');
        expect(result.explanation).toBe('Found 1 user named Samuel.');
        expect(result.rows).toEqual([{ name: 'Samuel', age: 30 }]);
    });

    it('feeds tool errors back so the model can self-correct', async () => {
        let calls = 0;
        const adapter = adapterStub({
            runReadOnlyQuery: async (_db, q: any) => {
                calls++;
                if (q.collection === 'user') {
                    throw new FriendlyException(
                        'Entity not found',
                        'query',
                        ErrorKeys.ENTITY_NOT_FOUND,
                        HttpStatus.NOT_FOUND
                    );
                }
                return { rows: [{ name: 'Samuel' }], rowCount: 1 };
            }
        });
        const llm = scriptedLlm([
            msg(
                [toolUse('run_query', { op: 'find', collection: 'user' })],
                'tool_use'
            ),
            msg(
                [toolUse('run_query', { op: 'find', collection: 'users' })],
                'tool_use'
            ),
            msg([text('Corrected the collection name.')], 'end_turn')
        ]);
        const agent = new QueryAgentService(llm, noopLogger);
        const result = await agent.run(adapter, 'shop', 'find Samuel');

        expect(calls).toBe(2);
        expect(result.rows).toEqual([{ name: 'Samuel' }]);
    });

    it('errors if the model finishes without ever running a query', async () => {
        const llm = scriptedLlm([
            msg([text('I am not going to query anything.')], 'end_turn')
        ]);
        const agent = new QueryAgentService(llm, noopLogger);
        await expect(
            agent.run(adapterStub(), 'shop', 'hello')
        ).rejects.toBeInstanceOf(FriendlyException);
    });

    it('stops after the iteration cap when the model never finishes', async () => {
        const loop = Array.from({ length: 20 }, () =>
            msg([toolUse('list_entities', {})], 'tool_use')
        );
        const agent = new QueryAgentService(scriptedLlm(loop), noopLogger);
        await expect(
            agent.run(adapterStub(), 'shop', 'loop forever')
        ).rejects.toBeInstanceOf(FriendlyException);
    });

    it('includes prior session history in the first prompt', async () => {
        const seen: any[] = [];
        const llm = {
            createMessage: async (params: any) => {
                seen.push(params);
                return msg([text('done')], 'end_turn');
            }
        } as unknown as LlmService;
        // No query runs, so this rejects — we only care about the prompt.
        const agent = new QueryAgentService(llm, noopLogger);
        await agent
            .run(adapterStub(), 'shop', 'now include their email', [
                {
                    question: 'get the user named Samuel',
                    generatedQuery: 'db.users.find({"name":"Samuel"})',
                    explanation: 'found 1',
                    rowCount: 1,
                    at: Date.now()
                }
            ])
            .catch(() => undefined);

        const firstUserMsg = String(seen[0].messages[0].content);
        expect(firstUserMsg).toContain('Earlier requests in this session');
        expect(firstUserMsg).toContain('get the user named Samuel');
        expect(firstUserMsg).toContain('now include their email');
    });
});
