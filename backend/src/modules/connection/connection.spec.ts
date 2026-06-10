import { SessionStore } from './session.store';
import { ConnectionService } from './connection.service';
import { AdapterFactory } from '../../database/adapter.factory';
import { DatabaseAdapter } from '../../database/database-adapter.interface';
import { FriendlyException } from '../../common/errors';

/** Minimal in-memory adapter double — no real database involved. */
function fakeAdapter(): DatabaseAdapter & { connected: boolean } {
    return {
        dbType: 'mongodb',
        connected: false,
        async connect() {
            this.connected = true;
        },
        async disconnect() {
            this.connected = false;
        },
        async listDatabases() {
            return ['shop', 'analytics'];
        },
        async listEntities() {
            return ['users'];
        },
        async describeEntity(_db, entity) {
            return { entity, fields: [], source: 'sampled' as const };
        },
        async sampleData() {
            return [];
        },
        validateReadOnly() {},
        async runReadOnlyQuery() {
            return { rows: [], rowCount: 0 };
        },
        queryToolSpec() {
            return { description: '', inputSchema: {} };
        },
        formatQuery() {
            return '';
        }
    };
}

describe('SessionStore', () => {
    let store: SessionStore;

    beforeEach(() => {
        store = new SessionStore();
    });
    afterEach(async () => {
        await store.onModuleDestroy();
    });

    it('stores and retrieves sessions, refreshing lastUsedAt', () => {
        const adapter = fakeAdapter();
        store.set({
            id: 's1',
            dbType: 'mongodb',
            adapter,
            createdAt: 0,
            lastUsedAt: 0
        });
        const got = store.get('s1');
        expect(got.adapter).toBe(adapter);
        expect(got.lastUsedAt).toBeGreaterThan(0);
        expect(store.size).toBe(1);
    });

    it('throws SESSION_NOT_FOUND for unknown ids', () => {
        expect(() => store.get('nope')).toThrow(FriendlyException);
    });

    it('disconnects the adapter on remove', async () => {
        const adapter = fakeAdapter();
        adapter.connected = true;
        store.set({
            id: 's1',
            dbType: 'mongodb',
            adapter,
            createdAt: 0,
            lastUsedAt: Date.now()
        });
        await store.remove('s1');
        expect(adapter.connected).toBe(false);
        expect(store.has('s1')).toBe(false);
    });

    it('appends history and caps it at 100 entries', () => {
        store.set({
            id: 's1',
            dbType: 'mongodb',
            adapter: fakeAdapter(),
            createdAt: 0,
            lastUsedAt: Date.now(),
            history: []
        });
        for (let i = 0; i < 130; i++) {
            store.appendHistory('s1', {
                question: `q${i}`,
                generatedQuery: 'db.x.find({})',
                explanation: 'ok',
                rowCount: i,
                at: Date.now()
            });
        }
        const history = store.get('s1').history!;
        expect(history.length).toBe(100);
        // Oldest dropped: should start at q30 and end at q129.
        expect(history[0].question).toBe('q30');
        expect(history[99].question).toBe('q129');
    });

    it('caps history by byte size (~1MB), dropping oldest', () => {
        store.set({
            id: 's1',
            dbType: 'mongodb',
            adapter: fakeAdapter(),
            createdAt: 0,
            lastUsedAt: Date.now(),
            history: []
        });
        const big = 'x'.repeat(200_000); // ~200 KB each
        for (let i = 0; i < 10; i++) {
            store.appendHistory('s1', {
                question: `q${i}`,
                generatedQuery: big,
                explanation: '',
                rowCount: 0,
                at: Date.now()
            });
        }
        const history = store.get('s1').history!;
        const bytes = Buffer.byteLength(JSON.stringify(history), 'utf8');
        expect(bytes).toBeLessThanOrEqual(1_000_000);
        // Most recent entry must always survive.
        expect(history[history.length - 1].question).toBe('q9');
    });

    it('evicts and disconnects idle sessions past the TTL', async () => {
        const fresh = fakeAdapter();
        const stale = fakeAdapter();
        fresh.connected = stale.connected = true;
        const now = Date.now();
        store.set({
            id: 'fresh',
            dbType: 'mongodb',
            adapter: fresh,
            createdAt: now,
            lastUsedAt: now
        });
        store.set({
            id: 'stale',
            dbType: 'mongodb',
            adapter: stale,
            createdAt: 0,
            lastUsedAt: now - 60 * 60 * 1000 // 1h idle
        });

        await store.evictIdle(now);

        expect(store.has('fresh')).toBe(true);
        expect(store.has('stale')).toBe(false);
        expect(stale.connected).toBe(false);
    });
});

describe('ConnectionService', () => {
    let store: SessionStore;
    let service: ConnectionService;
    let adapter: ReturnType<typeof fakeAdapter>;

    beforeEach(() => {
        store = new SessionStore();
        adapter = fakeAdapter();
        const factory = {
            create: () => adapter
        } as unknown as AdapterFactory;
        service = new ConnectionService(factory, store);
    });
    afterEach(async () => {
        await store.onModuleDestroy();
    });

    it('connects, registers a session, and returns databases', async () => {
        const res = await service.connect({
            dbType: 'mongodb',
            host: 'localhost',
            port: 27017
        });
        expect(res.sessionId).toBeTruthy();
        expect(res.dbType).toBe('mongodb');
        expect(res.databases).toEqual(['shop', 'analytics']);
        expect(adapter.connected).toBe(true);
        expect(store.has(res.sessionId)).toBe(true);
    });

    it('disconnects on listDatabases failure and does not leak a session', async () => {
        adapter.listDatabases = async () => {
            throw new Error('boom');
        };
        await expect(
            service.connect({ dbType: 'mongodb', host: 'localhost' })
        ).rejects.toThrow('boom');
        expect(adapter.connected).toBe(false);
        expect(store.size).toBe(0);
    });

    it('disconnect removes the session', async () => {
        const res = await service.connect({
            dbType: 'mongodb',
            host: 'localhost'
        });
        await service.disconnect(res.sessionId);
        expect(store.has(res.sessionId)).toBe(false);
        expect(adapter.connected).toBe(false);
    });
});
