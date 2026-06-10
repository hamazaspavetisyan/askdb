import * as dotenv from 'dotenv';
import { AdapterFactory } from './database/adapter.factory';
import { parseConnectionFromEnv, parseServerConfig } from './mcp/mcp-env';
import { createMcpHttpApp } from './mcp/mcp-http';

/**
 * Standalone entrypoint: askdb as a Streamable-HTTP MCP server.
 *
 * Serves the read-only DB tools over `/mcp` so any MCP client (Claude, Cursor,
 * …) can query the configured database in a safe, read-only way. The target
 * connection comes from the environment; see README "Run as an MCP server".
 *
 *   npm run start:mcp   (after npm run build, or via ts-node in dev)
 */
dotenv.config();

async function main(): Promise<void> {
    const connection = parseConnectionFromEnv();
    const config = parseServerConfig();

    const adapter = new AdapterFactory().create(connection);
    await adapter.connect();

    if (!config.authToken) {
        // eslint-disable-next-line no-console
        console.warn(
            '[mcp] WARNING: MCP_AUTH_TOKEN is not set — the /mcp endpoint is ' +
                'UNAUTHENTICATED. Set it (and serve over TLS) before exposing ' +
                'beyond localhost.'
        );
    }

    const app = createMcpHttpApp(adapter, config);
    const server = app.listen(config.port, () => {
        // eslint-disable-next-line no-console
        console.log(
            `[mcp] askdb MCP server (${connection.dbType}) listening on ` +
                `http://localhost:${config.port}/mcp`
        );
    });

    const shutdown = async () => {
        server.close();
        await adapter.disconnect().catch(() => undefined);
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[mcp] failed to start:', (err as Error).message);
    process.exit(1);
});
