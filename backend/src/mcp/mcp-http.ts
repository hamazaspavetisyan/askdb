import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import express = require('express');
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { DatabaseAdapter } from '../database/database-adapter.interface';
import { McpServerConfig } from './mcp-env';
import { createMcpServer } from './mcp-server';

/**
 * Bearer-token check. With no token configured the endpoint is open (the
 * entrypoint warns loudly in that case).
 */
export function isAuthorized(
    authHeader: string | undefined,
    token?: string
): boolean {
    if (!token) return true;
    if (!authHeader) return false;
    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    return match?.[1] === token;
}

function jsonRpcError(res: Response, status: number, message: string): void {
    res.status(status).json({
        jsonrpc: '2.0',
        error: { code: -32000, message },
        id: null
    });
}

/**
 * Express app exposing a single Streamable-HTTP MCP endpoint at `/mcp`
 * (POST for messages, GET for the SSE stream, DELETE to end a session) plus a
 * `/healthz` probe. Sessions are managed by the SDK transport, keyed by the
 * `Mcp-Session-Id` header; all sessions share the one process-wide adapter.
 */
export function createMcpHttpApp(
    adapter: DatabaseAdapter,
    config: McpServerConfig
): Express {
    const app = express();
    app.use(express.json({ limit: '4mb' }));

    // CORS for browser-based MCP clients.
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header(
            'Access-Control-Allow-Headers',
            'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID'
        );
        res.header('Access-Control-Expose-Headers', 'Mcp-Session-Id');
        res.header(
            'Access-Control-Allow-Methods',
            'GET, POST, DELETE, OPTIONS'
        );
        if (req.method === 'OPTIONS') {
            res.sendStatus(204);
            return;
        }
        next();
    });

    app.get('/healthz', (_req, res) => res.json({ ok: true }));

    // Auth guard for the MCP endpoint only.
    app.use('/mcp', (req, res, next) => {
        if (!isAuthorized(req.headers.authorization, config.authToken)) {
            jsonRpcError(res, 401, 'Unauthorized');
            return;
        }
        next();
    });

    const transports: Record<string, StreamableHTTPServerTransport> = {};

    app.post('/mcp', async (req: Request, res: Response) => {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport = sessionId ? transports[sessionId] : undefined;

        if (!transport) {
            // A new session must begin with an initialize request.
            if (sessionId || !isInitializeRequest(req.body)) {
                jsonRpcError(
                    res,
                    400,
                    'No valid session. Send an initialize request first.'
                );
                return;
            }
            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                onsessioninitialized: (id) => {
                    transports[id] = transport as StreamableHTTPServerTransport;
                }
            });
            transport.onclose = () => {
                if (transport?.sessionId) delete transports[transport.sessionId];
            };
            await createMcpServer(adapter).connect(transport);
        }

        await transport.handleRequest(req, res, req.body);
    });

    const handleSessionRequest = async (req: Request, res: Response) => {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        const transport = sessionId ? transports[sessionId] : undefined;
        if (!transport) {
            res.status(400).send('Invalid or missing Mcp-Session-Id header.');
            return;
        }
        await transport.handleRequest(req, res);
    };

    app.get('/mcp', handleSessionRequest);
    app.delete('/mcp', handleSessionRequest);

    return app;
}
