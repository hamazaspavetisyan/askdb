import * as dotenv from 'dotenv';
import { Logger } from '@nestjs/common';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AdapterFactory } from './database/adapter.factory';
import { parseConnectionFromEnv } from './mcp/mcp-env';
import { createMcpServer } from './mcp/mcp-server';

/**
 * Stdio entrypoint: askdb as a local MCP server for desktop clients
 * (Claude Desktop, Cursor, …). The client launches this process directly and
 * speaks MCP over stdin/stdout — no HTTP, no auth token needed.
 *
 * CRITICAL: stdout is the MCP protocol channel, so nothing else may write to
 * it. We silence the Nest logger and only ever write diagnostics to stderr.
 *
 *   node dist/mcp-stdio.js        (after npm run build)
 */
dotenv.config();
Logger.overrideLogger(false); // keep stdout clean for the JSON-RPC stream

async function main(): Promise<void> {
    const adapter = new AdapterFactory().create(parseConnectionFromEnv());
    await adapter.connect();

    const server = createMcpServer(adapter);
    await server.connect(new StdioServerTransport());
    process.stderr.write('[mcp-stdio] askdb connected and ready\n');

    const shutdown = async () => {
        await adapter.disconnect().catch(() => undefined);
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((err) => {
    process.stderr.write(
        `[mcp-stdio] failed to start: ${(err as Error).message}\n`
    );
    process.exit(1);
});
