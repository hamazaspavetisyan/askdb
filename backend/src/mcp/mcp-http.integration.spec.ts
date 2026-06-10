import request = require('supertest');
import { createMcpHttpApp } from './mcp-http';
import { DatabaseAdapter } from '../database/database-adapter.interface';

function adapterStub(): DatabaseAdapter {
    return {
        dbType: 'mongodb',
        connect: async () => {},
        disconnect: async () => {},
        listDatabases: async () => ['shop'],
        listEntities: async () => ['users'],
        describeEntity: async (_d, entity) => ({
            entity,
            fields: [],
            source: 'sampled'
        }),
        sampleData: async () => [],
        validateReadOnly: () => {},
        runReadOnlyQuery: async () => ({ rows: [], rowCount: 0 }),
        queryToolSpec: () => ({ description: '', inputSchema: {} }),
        formatQuery: () => ''
    };
}

describe('createMcpHttpApp (HTTP wiring)', () => {
    it('GET /healthz is open and returns ok', async () => {
        const app = createMcpHttpApp(adapterStub(), { port: 0 });
        await request(app).get('/healthz').expect(200, { ok: true });
    });

    it('rejects a POST /mcp with no session and no initialize request (400)', async () => {
        const app = createMcpHttpApp(adapterStub(), { port: 0 });
        const res = await request(app)
            .post('/mcp')
            .set('Accept', 'application/json, text/event-stream')
            .send({ jsonrpc: '2.0', method: 'tools/list', id: 1 });
        expect(res.status).toBe(400);
        expect(res.body?.error?.message).toMatch(/initialize/i);
    });

    it('blocks /mcp without a valid bearer token when one is configured', async () => {
        const app = createMcpHttpApp(adapterStub(), {
            port: 0,
            authToken: 'secret'
        });
        await request(app)
            .post('/mcp')
            .send({ jsonrpc: '2.0', method: 'initialize', id: 1 })
            .expect(401);
    });

    it('lets healthz through regardless of auth (no token leakage required)', async () => {
        const app = createMcpHttpApp(adapterStub(), {
            port: 0,
            authToken: 'secret'
        });
        await request(app).get('/healthz').expect(200);
    });
});
