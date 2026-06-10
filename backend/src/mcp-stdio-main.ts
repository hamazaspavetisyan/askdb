import * as dotenv from 'dotenv';
import { Logger } from '@nestjs/common';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AdapterFactory } from './database/adapter.factory';
import { parseConnectionFromEnv } from './mcp/mcp-env';
import { createMcpServer } from './mcp/mcp-server';

/**
 * Standalone entrypoint: askdb as a STDIO MCP server.
 *
 * This is what local MCP clients (Claude Desktop, Cursor, …) launch as a
 * subprocess. The target DB connection comes from the environment provided by
 * the client's MCP config. See README "Connect to Claude Desktop (stdio)".
 *
 *   node dist/mcp-stdio-main.js     (after npm run build)
 *
 * IMPORTANT: on stdio, stdout is the JSON-RPC channel — nothing else may write
 * to it, so we silence the Nest logger and redirect console.log to stderr.
 */
// stdout is the JSON-RPC channel — redirect/silence everything else FIRST,
// before dotenv (which may print a banner) or any logger runs.
// eslint-disable-next-line no-console
console.log = (...args: unknown[]) => console.error(...args);
// eslint-disable-next-line no-console
console.info = (...args: unknown[]) => console.error(...args);
Logger.overrideLogger(false);
dotenv.config({ quiet: true });

async function main(): Promise<void> {
    const connection = parseConnectionFromEnv();
    const adapter = new AdapterFactory().create(connection);
    await adapter.connect();

    const server = createMcpServer(adapter);
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // eslint-disable-next-line no-console
    console.error(
        `[mcp-stdio] askdb MCP server ready (${connection.dbType}); ` +
            'waiting for client on stdio.'
    );

    const shutdown = async () => {
        await adapter.disconnect().catch(() => undefined);
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[mcp-stdio] failed to start:', (err as Error).message);
    process.exit(1);
});
