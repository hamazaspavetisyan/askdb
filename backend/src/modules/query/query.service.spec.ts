import { QueryService } from './query.service';
import { SessionStore } from '../connection/session.store';
import { QueryAgentService } from '../agent/query-agent.service';
import { DatabaseAdapter } from '../../database/database-adapter.interface';
import { FriendlyException } from '../../common/errors';

function adapterStub(): DatabaseAdapter {
    return {
        dbType: 'mongodb',
        connect: async () => {},
        disconnect: async () => {},
        listDatabases: async () => ['shop'],
        listEntities: async () => ['users', 'orders'],
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

describe('QueryService', () => {
    let store: SessionStore;
    let service: QueryService;

    beforeEach(() => {
        store = new SessionStore();
    });
    afterEach(async () => {
        await store.onModuleDestroy();
    });

    function seedSession(id = 's1') {
        store.set({
            id,
            dbType: 'mongodb',
            adapter: adapterStub(),
            createdAt: Date.now(),
            lastUsedAt: Date.now()
        });
        return id;
    }

    it('runs the agent and returns a populated response with timing', async () => {
        const id = seedSession();
        const agent = {
            run: async () => ({
                generatedQuery: 'db.users.find({"name":"Samuel"})',
                explanation: 'Found Samuel.',
                rows: [{ name: 'Samuel' }]
            })
        } as unknown as QueryAgentService;
        service = new QueryService(store, agent);

        const res = await service.query({
            sessionId: id,
            database: 'shop',
            naturalLanguage: 'find Samuel'
        });

        expect(res.generatedQuery).toContain('db.users.find');
        expect(res.explanation).toBe('Found Samuel.');
        expect(res.result).toEqual([{ name: 'Samuel' }]);
        expect(res.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('lists collections for a session', async () => {
        const id = seedSession();
        service = new QueryService(store, {} as QueryAgentService);
        const res = await service.listCollections({
            sessionId: id,
            database: 'shop'
        });
        expect(res.collections).toEqual(['users', 'orders']);
    });

    it('throws when the session is unknown', async () => {
        service = new QueryService(store, {} as QueryAgentService);
        await expect(
            service.query({
                sessionId: 'missing',
                database: 'shop',
                naturalLanguage: 'x'
            })
        ).rejects.toBeInstanceOf(FriendlyException);
    });
});
