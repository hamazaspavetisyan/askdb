/**
 * Live smoke test for the provider-agnostic LLM layer.
 *
 * Runs a tiny 2-turn tool-calling loop (an `echo` tool) against a REAL provider
 * to prove the neutral request/response mapping round-trips end to end:
 *   1. the model calls the tool,
 *   2. we feed a tool result back,
 *   3. the model replies with final text.
 *
 * Usage (from backend/):
 *   LLM_PROVIDER=openai    OPENAI_API_KEY=sk-...    npx ts-node scripts/llm-smoke.ts
 *   LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-... npx ts-node scripts/llm-smoke.ts
 *
 * It makes real API calls (and costs a few tokens). Nothing here runs in CI.
 */
import * as dotenv from 'dotenv';
import { LlmProvider } from '../src/modules/agent/llm/llm-provider.interface';
import {
    LlmMessage,
    LlmToolSpec
} from '../src/modules/agent/llm/llm.types';
import { AnthropicProvider } from '../src/modules/agent/llm/anthropic.provider';
import { OpenAiProvider } from '../src/modules/agent/llm/openai.provider';

dotenv.config();

function buildProvider(): LlmProvider {
    const name = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
    if (name === 'anthropic') {
        return new AnthropicProvider({
            apiKey: required('ANTHROPIC_API_KEY'),
            model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
        });
    }
    if (name === 'openai') {
        return new OpenAiProvider({
            apiKey: required('OPENAI_API_KEY'),
            model: process.env.OPENAI_MODEL || 'gpt-4o'
        });
    }
    throw new Error(`Unknown LLM_PROVIDER "${name}"`);
}

function required(key: string): string {
    const v = process.env[key];
    if (!v) throw new Error(`${key} is not set`);
    return v;
}

const echoTool: LlmToolSpec = {
    name: 'echo',
    description: 'Echo a message back. Call this to fulfill the request.',
    inputSchema: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message']
    }
};

async function main(): Promise<void> {
    const provider = buildProvider();
    const system =
        'You are a test harness. When asked to echo something, you MUST call ' +
        'the `echo` tool with the exact message. After the tool result, reply ' +
        'with a one-line confirmation.';
    const messages: LlmMessage[] = [
        { role: 'user', text: 'Please echo the word: pong' }
    ];

    console.log(`\n[smoke] provider = ${provider.name}`);

    // Turn 1 — expect a tool call.
    const first = await provider.chat({ system, tools: [echoTool], messages });
    console.log('[turn 1] stop =', first.stop);
    console.log('[turn 1] toolCalls =', JSON.stringify(first.toolCalls));
    if (first.toolCalls.length === 0) {
        console.error('❌ FAIL: model did not call the echo tool.');
        process.exit(1);
    }
    const call = first.toolCalls[0];
    console.log(
        `[turn 1] tool "${call.name}" input =`,
        JSON.stringify(call.input)
    );

    // Feed the assistant turn + a tool result back.
    messages.push({
        role: 'assistant',
        text: first.text,
        toolCalls: first.toolCalls
    });
    messages.push({
        role: 'user',
        toolResults: [
            { toolCallId: call.id, content: JSON.stringify({ echoed: 'pong' }) }
        ]
    });

    // Turn 2 — expect a final text answer (no tool calls).
    const second = await provider.chat({
        system,
        tools: [echoTool],
        messages
    });
    console.log('[turn 2] stop =', second.stop);
    console.log('[turn 2] text =', JSON.stringify(second.text));

    if (second.text.trim().length === 0) {
        console.error('❌ FAIL: model produced no final text.');
        process.exit(1);
    }
    console.log('\n✅ PASS: tool-calling round-trip works for', provider.name);
}

main().catch((err) => {
    console.error('❌ ERROR:', err?.message ?? err);
    process.exit(1);
});
