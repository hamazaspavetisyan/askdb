import OpenAI from 'openai';
import {
    fromOpenAiCompletion,
    mapFinishReason,
    parseArgs,
    toOpenAiMessages,
    toOpenAiTools
} from './openai.provider';
import { LlmMessage } from './llm.types';

describe('OpenAiProvider mappers', () => {
    it('maps tool specs to OpenAI function tools', () => {
        const tools = toOpenAiTools([
            {
                name: 'run_query',
                description: 'run it',
                inputSchema: { type: 'object', properties: {} }
            }
        ]);
        expect(tools[0]).toEqual({
            type: 'function',
            function: {
                name: 'run_query',
                description: 'run it',
                parameters: { type: 'object', properties: {} }
            }
        });
    });

    it('prepends system and flattens messages (assistant tool calls, tool results)', () => {
        const messages: LlmMessage[] = [
            { role: 'user', text: 'find Samuel' },
            {
                role: 'assistant',
                text: 'looking',
                toolCalls: [
                    { id: 't1', name: 'run_query', input: { op: 'find' } }
                ]
            },
            {
                role: 'user',
                toolResults: [{ toolCallId: 't1', content: '{"rows":[]}' }]
            }
        ];
        const out = toOpenAiMessages('SYS', messages);

        expect(out[0]).toEqual({ role: 'system', content: 'SYS' });
        expect(out[1]).toEqual({ role: 'user', content: 'find Samuel' });

        const assistant = out[2] as any;
        expect(assistant.role).toBe('assistant');
        expect(assistant.tool_calls[0]).toEqual({
            id: 't1',
            type: 'function',
            function: { name: 'run_query', arguments: '{"op":"find"}' }
        });

        expect(out[3]).toEqual({
            role: 'tool',
            tool_call_id: 't1',
            content: '{"rows":[]}'
        });
    });

    it('normalizes finish reasons', () => {
        expect(mapFinishReason('tool_calls')).toBe('tool_use');
        expect(mapFinishReason('stop')).toBe('end');
        expect(mapFinishReason('length')).toBe('max');
        expect(mapFinishReason('content_filter')).toBe('other');
        expect(mapFinishReason(null)).toBe('other');
    });

    it('parses tool-call argument JSON safely', () => {
        expect(parseArgs('{"a":1}')).toEqual({ a: 1 });
        expect(parseArgs('')).toEqual({});
        expect(parseArgs(undefined)).toEqual({});
        expect(parseArgs('not json')).toEqual({});
    });

    it('extracts text and tool calls (parsing string args) from a completion', () => {
        const completion = {
            choices: [
                {
                    finish_reason: 'tool_calls',
                    message: {
                        role: 'assistant',
                        content: 'sure',
                        tool_calls: [
                            {
                                id: 'c1',
                                type: 'function',
                                function: {
                                    name: 'run_query',
                                    arguments:
                                        '{"op":"find","collection":"users"}'
                                }
                            }
                        ]
                    }
                }
            ]
        } as unknown as OpenAI.Chat.Completions.ChatCompletion;

        const res = fromOpenAiCompletion(completion);
        expect(res.text).toBe('sure');
        expect(res.stop).toBe('tool_use');
        expect(res.toolCalls).toEqual([
            {
                id: 'c1',
                name: 'run_query',
                input: { op: 'find', collection: 'users' }
            }
        ]);
    });
});
