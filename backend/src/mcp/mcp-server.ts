import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { DatabaseAdapter } from '../database/database-adapter.interface';
import { buildToolDefinitions, executeMcpTool } from './mcp-tools';

/**
 * Build a low-level MCP server that exposes the read-only DB tools backed by
 * the given (already-connected) adapter. One server instance is created per
 * transport/session, but all share the single process-wide adapter.
 */
export function createMcpServer(adapter: DatabaseAdapter): Server {
    const server = new Server(
        { name: 'askdb', version: '0.1.0' },
        { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: buildToolDefinitions(adapter)
    }));

    server.setRequestHandler(CallToolRequestSchema, async (req) => {
        const { name, arguments: args } = req.params;
        const outcome = await executeMcpTool(
            adapter,
            name,
            (args ?? {}) as Record<string, unknown>
        );
        return {
            content: [{ type: 'text', text: outcome.text }],
            isError: outcome.isError ?? false
        };
    });

    return server;
}
