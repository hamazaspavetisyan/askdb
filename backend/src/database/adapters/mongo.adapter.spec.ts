import { MongoClient } from 'mongodb';
import { MongoAdapter } from './mongo.adapter';
import { FriendlyException } from '../../common/errors';

/**
 * Integration test against a real MongoDB.
 *
 * It uses, in order of preference:
 *   1. MONGO_TEST_URI env var (point at any reachable MongoDB), or
 *   2. an in-memory server via mongodb-memory-server (needs to download mongod).
 *
 * If neither is available (e.g. an offline CI sandbox with no mongod binary)
 * the whole suite is skipped instead of failing.
 */
async function resolveMongo(): Promise<{
    uri: string;
    teardown: () => Promise<void>;
}> {
    if (process.env.MONGO_TEST_URI) {
        return { uri: process.env.MONGO_TEST_URI, teardown: async () => {} };
    }
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create(
        process.env.MONGOMS_VERSION
            ? { binary: { version: process.env.MONGOMS_VERSION } }
            : undefined
    );
    return {
        uri: mongod.getUri(),
        teardown: async () => {
            await mongod.stop();
        }
    };
}

describe('MongoAdapter (integration)', () => {
    let available = true;
    let teardown: () => Promise<void> = async () => {};
    let uri: string;
    let adapter: MongoAdapter;
    const DB = 'shop';

    beforeAll(async () => {
        try {
            ({ uri, teardown } = await resolveMongo());
        } catch (err) {
            available = false;

            console.warn(
                `[mongo.adapter.spec] No MongoDB available, skipping integration tests: ${
                    (err as Error).message
                }`
            );
            return;
        }

        // Seed data via a separate client.
        const seed = new MongoClient(uri);
        await seed.connect();
        const db = seed.db(DB);
        await db.collection('users').insertMany([
            { name: 'Samuel', age: 30, active: true, tags: ['a', 'b'] },
            { name: 'Maria', age: 25, active: false },
            { name: 'Samuel', age: 41, active: true }
        ]);
        await db.collection('orders').insertMany([
            { total: 10, user: 'Samuel' },
            { total: 20, user: 'Maria' }
        ]);
        await seed.close();

        // host carries the full URI (supported by buildUri()).
        adapter = new MongoAdapter({ dbType: 'mongodb', host: uri });
        await adapter.connect();
    }, 60_000);

    afterAll(async () => {
        await adapter?.disconnect();
        await teardown();
    });

    it('lists databases and entities', async () => {
        if (!available) return;
        const dbs = await adapter.listDatabases();
        expect(dbs).toContain(DB);
        const entities = await adapter.listEntities(DB);
        expect(entities).toEqual(['orders', 'users']);
    });

    it('infers a schema by sampling', async () => {
        if (!available) return;
        const schema = await adapter.describeEntity(DB, 'users');
        expect(schema.source).toBe('sampled');
        const byName = Object.fromEntries(
            schema.fields.map((f) => [f.name, f])
        );
        expect(byName['name'].type).toBe('string');
        expect(byName['age'].type).toBe('number');
        expect(byName['active'].type).toBe('boolean');
        expect(byName['tags'].type).toBe('array');
        // `tags` only present on one of three docs.
        expect(byName['tags'].nullable).toBe(true);
        expect(byName['_id'].type).toBe('objectId');
    });

    it('runs a read-only find query with a filter', async () => {
        if (!available) return;
        const res = await adapter.runReadOnlyQuery(DB, {
            op: 'find',
            collection: 'users',
            filter: { name: 'Samuel' }
        });
        expect(res.rowCount).toBe(2);
        expect(res.rows.every((r) => r.name === 'Samuel')).toBe(true);
    });

    it('runs an aggregate query', async () => {
        if (!available) return;
        const res = await adapter.runReadOnlyQuery(DB, {
            op: 'aggregate',
            collection: 'users',
            pipeline: [{ $group: { _id: '$name', count: { $sum: 1 } } }]
        });
        const samuel = res.rows.find((r) => r._id === 'Samuel');
        expect(samuel?.count).toBe(2);
    });

    it('rejects write aggregation stages at execution time ($merge)', async () => {
        if (!available) return;
        await expect(
            adapter.runReadOnlyQuery(DB, {
                op: 'aggregate',
                collection: 'users',
                pipeline: [{ $merge: { into: 'copy' } }]
            })
        ).rejects.toBeInstanceOf(FriendlyException);
    });

    it('caps returned rows at the configured maxRows', async () => {
        if (!available) return;
        const capped = new MongoAdapter(
            { dbType: 'mongodb', host: uri },
            { maxRows: 1, maxTimeMs: 5000 }
        );
        await capped.connect();
        const res = await capped.runReadOnlyQuery(DB, {
            op: 'find',
            collection: 'users'
        });
        expect(res.rowCount).toBe(1);
        await capped.disconnect();
    });
});
