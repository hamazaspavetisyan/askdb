import Anthropic from '@anthropic-ai/sdk';
import {
    fromAnthropicMessage,
    mapStopReason,
    toAnthropicMessages,
    toAnthropicTools
} from './anthropic.provider';
import { LlmMessage } from './llm.types';

describe('AnthropicProvider mappers', () => {
    it('maps tool specs to Anthropic tools', () => {
        const tools = toAnthropicTools([
            {
                name: 'run_query',
                description: 'run it',
                inputSchema: { type: 'object', properties: {} }
            }
        ]);
        expect(tools[0]).toEqual({
            name: 'run_query',
            description: 'run it',
            input_schema: { type: 'object', properties: {} }
        });
    });

    it('maps neutral messages (text, tool calls, tool results) to Anthropic params', () => {
        const messages: LlmMessage[] = [
            { role: 'user', text: 'find Samuel' },
            {
                role: 'assistant',
                text: 'let me look',
                toolCalls: [
                    { id: 't1', name: 'run_query', input: { op: 'find' } }
                ]
            },
            {
                role: 'user',
                toolResults: [
                    { toolCallId: 't1', content: '{"rows":[]}', isError: false }
                ]
            }
        ];
        const out = toAnthropicMessages(messages);

        expect(out[0]).toEqual({ role: 'user', content: 'find Samuel' });

        const assistant = out[1];
        expect(assistant.role).toBe('assistant');
        const blocks = assistant.content as Anthropic.ContentBlockParam[];
        expect(blocks[0]).toEqual({ type: 'text', text: 'let me look' });
        expect(blocks[1]).toEqual({
            type: 'tool_use',
            id: 't1',
            name: 'run_query',
            input: { op: 'find' }
        });

        const toolResultMsg = out[2];
        const trBlocks =
            toolResultMsg.content as Anthropic.ContentBlockParam[];
        expect(trBlocks[0]).toEqual({
            type: 'tool_result',
            tool_use_id: 't1',
            content: '{"rows":[]}',
            is_error: false
        });
    });

    it('normalizes stop reasons', () => {
        expect(mapStopReason('tool_use')).toBe('tool_use');
        expect(mapStopReason('end_turn')).toBe('end');
        expect(mapStopReason('stop_sequence')).toBe('end');
        expect(mapStopReason('max_tokens')).toBe('max');
        expect(mapStopReason(null)).toBe('other');
    });

    it('extracts text and tool calls from an Anthropic message', () => {
        const msg = {
            content: [
                { type: 'text', text: 'here you go' },
                {
                    type: 'tool_use',
                    id: 't9',
                    name: 'list_entities',
                    input: { x: 1 }
                }
            ],
            stop_reason: 'tool_use'
        } as unknown as Anthropic.Message;

        const res = fromAnthropicMessage(msg);
        expect(res.text).toBe('here you go');
        expect(res.toolCalls).toEqual([
            { id: 't9', name: 'list_entities', input: { x: 1 } }
        ]);
        expect(res.stop).toBe('tool_use');
    });
});
