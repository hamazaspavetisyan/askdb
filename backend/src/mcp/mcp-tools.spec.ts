import { HttpStatus } from '@nestjs/common';
import {
    buildToolDefinitions,
    executeMcpTool,
    safeJson
} from './mcp-tools';
import { DatabaseAdapter } from '../database/database-adapter.interface';
import { FriendlyException, ErrorKeys } from '../common/errors';

function adapterStub(overrides: Partial<DatabaseAdapter> = {}): DatabaseAdapter {
    return {
        dbType: 'mongodb',
        connect: async () => {},
        disconnect: async () => {},
        listDatabases: async () => ['shop', 'analytics'],
        listEntities: async () => ['users', 'orders'],
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
            description: 'Mongo find/aggregate.',
            inputSchema: { type: 'object', properties: { op: {} } }
        }),
        formatQuery: () => 'db.users.find({})',
        ...overrides
    };
}

describe('buildToolDefinitions', () => {
    it('exposes the five read-only tools with database args', () => {
        const tools = buildToolDefinitions(adapterStub());
        const names = tools.map((t) => t.name);
        expect(names).toEqual([
            'list_databases',
            'list_entities',
            'describe_entity',
            'sample_data',
            'run_query'
        ]);
        const runQuery = tools.find((t) => t.name === 'run_query')!;
        const props = (runQuery.inputSchema as any).properties;
        expect(props.database).toBeDefined();
        expect(props.query).toBeDefined();
        expect((runQuery.inputSchema as any).required).toEqual([
            'database',
            'query'
        ]);
    });
});

describe('executeMcpTool', () => {
    it('list_databases returns the databases', async () => {
        const out = await executeMcpTool(adapterStub(), 'list_databases', {});
        expect(out.isError).toBeUndefined();
        expect(JSON.parse(out.text)).toEqual({
            databases: ['shop', 'analytics']
        });
    });

    it('list_entities requires a database arg', async () => {
        const out = await executeMcpTool(adapterStub(), 'list_entities', {});
        expect(out.isError).toBe(true);
        expect(out.text).toContain('database');
    });

    it('run_query returns rows and rowCount', async () => {
        const out = await executeMcpTool(adapterStub(), 'run_query', {
            database: 'shop',
            query: { op: 'find', collection: 'users' }
        });
        expect(out.isError).toBeUndefined();
        expect(JSON.parse(out.text)).toEqual({
            rowCount: 1,
            rows: [{ name: 'Samuel', age: 30 }]
        });
    });

    it('surfaces read-only violations as a tool error (not a crash)', async () => {
        const adapter = adapterStub({
            runReadOnlyQuery: async () => {
                throw new FriendlyException(
                    'Stage "$merge" writes data and is not allowed (read-only).',
                    'query',
                    ErrorKeys.READ_ONLY_VIOLATION,
                    HttpStatus.FORBIDDEN
                );
            }
        });
        const out = await executeMcpTool(adapter, 'run_query', {
            database: 'shop',
            query: { op: 'aggregate', collection: 'users' }
        });
        expect(out.isError).toBe(true);
        expect(out.text).toContain('read-only');
    });

    it('returns an error for unknown tools', async () => {
        const out = await executeMcpTool(adapterStub(), 'drop_everything', {});
        expect(out.isError).toBe(true);
        expect(out.text).toContain('Unknown tool');
    });
});

describe('safeJson', () => {
    it('stringifies BSON-like ObjectId via toString', () => {
        class ObjectId {
            constructor(private hex: string) {}
            toString() {
                return this.hex;
            }
        }
        const text = safeJson({ _id: new ObjectId('abc123') });
        expect(JSON.parse(text)).toEqual({ _id: 'abc123' });
    });
});
