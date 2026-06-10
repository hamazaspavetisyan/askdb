import { ObjectId } from 'mongodb';
import { inferSchema, typeOf } from './schema-inference';
import { buildMongoUri, MongoAdapter, toBson } from './adapters/mongo.adapter';
import { FriendlyException } from '../common/errors';

/**
 * Server-free unit tests for the pure logic of the Mongo adapter:
 * URI building, schema inference, read-only validation and formatting.
 * These run anywhere. The full round-trip against a live server lives in
 * mongo.adapter.spec.ts, which auto-skips when no MongoDB is reachable.
 */
describe('toBson (Extended JSON → BSON)', () => {
    it('converts $oid to a real ObjectId', () => {
        const hex = '616954c4a26981cfa069ffda';
        const out = toBson({ _id: { $oid: hex } }) as unknown as {
            _id: ObjectId;
        };
        expect(out._id).toBeInstanceOf(ObjectId);
        expect(out._id.toString()).toBe(hex);
    });

    it('converts $date to a Date', () => {
        const out = toBson({
            createdAt: { $date: '2024-01-01T00:00:00Z' }
        }) as unknown as { createdAt: Date };
        expect(out.createdAt).toBeInstanceOf(Date);
    });

    it('leaves plain filters and nested operators unchanged', () => {
        expect(toBson({ name: 'Samuel', age: { $gt: 18 } })).toEqual({
            name: 'Samuel',
            age: { $gt: 18 }
        });
    });

    it('handles undefined/null and pipeline arrays', () => {
        expect(toBson(undefined)).toBeUndefined();
        const pipe = toBson([
            { $match: { _id: { $oid: '616954c4a26981cfa069ffda' } } }
        ]) as unknown as Array<{ $match: { _id: ObjectId } }>;
        expect(pipe[0].$match._id).toBeInstanceOf(ObjectId);
    });
});

describe('buildMongoUri', () => {
    it('uses a full connection string verbatim', () => {
        expect(
            buildMongoUri({ dbType: 'mongodb', host: 'mongodb://h:27017' })
        ).toBe('mongodb://h:27017');
        expect(
            buildMongoUri({
                dbType: 'mongodb',
                host: 'mongodb+srv://cluster.example.net'
            })
        ).toBe('mongodb+srv://cluster.example.net');
    });

    it('composes host + port', () => {
        expect(
            buildMongoUri({ dbType: 'mongodb', host: 'localhost', port: 27017 })
        ).toBe('mongodb://localhost:27017');
    });

    it('appends authSource when provided', () => {
        expect(
            buildMongoUri({
                dbType: 'mongodb',
                host: 'db',
                port: 27017,
                username: 'root',
                password: 'pw',
                authSource: 'admin'
            })
        ).toBe('mongodb://root:pw@db:27017/?authSource=admin');
    });

    it('applies host/port override (used for SSH tunnel) and keeps authSource', () => {
        expect(
            buildMongoUri(
                {
                    dbType: 'mongodb',
                    host: 'mongodb://remote:27017', // ignored when overridden
                    username: 'root',
                    password: 'pw',
                    authSource: 'admin'
                },
                { host: '127.0.0.1', port: 51234 }
            )
        ).toBe('mongodb://root:pw@127.0.0.1:51234/?authSource=admin');
    });

    it('URL-encodes credentials', () => {
        expect(
            buildMongoUri({
                dbType: 'mongodb',
                host: 'db',
                port: 27017,
                username: 'a b',
                password: 'p@ss:/'
            })
        ).toBe('mongodb://a%20b:p%40ss%3A%2F@db:27017');
    });
});

describe('typeOf / inferSchema', () => {
    it('labels primitive and container types', () => {
        expect(typeOf('x')).toBe('string');
        expect(typeOf(1)).toBe('number');
        expect(typeOf(true)).toBe('boolean');
        expect(typeOf(new Date())).toBe('date');
        expect(typeOf([1, 2])).toBe('array');
        expect(typeOf({ a: 1 })).toBe('object');
        expect(typeOf(null)).toBe('null');
    });

    it('marks fields absent in some docs as nullable and detects mixed types', () => {
        const fields = inferSchema([
            { name: 'Sam', age: 30 },
            { name: 'Mia' }, // no age
            { name: 'Al', age: '41' } // age as string -> mixed
        ]);
        const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
        expect(byName['name'].type).toBe('string');
        expect(byName['name'].nullable).toBe(false);
        expect(byName['age'].type).toBe('mixed');
        expect(byName['age'].nullable).toBe(true);
        expect(byName['name'].examples?.length).toBeGreaterThan(0);
    });
});

describe('MongoAdapter.validateReadOnly', () => {
    const adapter = new MongoAdapter({ dbType: 'mongodb', host: 'localhost' });

    it('accepts find and aggregate', () => {
        expect(() =>
            adapter.validateReadOnly({ op: 'find', collection: 'users' })
        ).not.toThrow();
        expect(() =>
            adapter.validateReadOnly({
                op: 'aggregate',
                collection: 'users',
                pipeline: [{ $match: { x: 1 } }]
            })
        ).not.toThrow();
    });

    it('rejects non-objects, bad ops and missing collection', () => {
        expect(() => adapter.validateReadOnly(null)).toThrow(FriendlyException);
        expect(() =>
            adapter.validateReadOnly({ op: 'delete', collection: 'u' })
        ).toThrow(FriendlyException);
        expect(() => adapter.validateReadOnly({ op: 'find' })).toThrow(
            FriendlyException
        );
    });

    it('rejects write aggregation stages', () => {
        expect(() =>
            adapter.validateReadOnly({
                op: 'aggregate',
                collection: 'u',
                pipeline: [{ $out: 'copy' }]
            })
        ).toThrow(FriendlyException);
        expect(() =>
            adapter.validateReadOnly({
                op: 'aggregate',
                collection: 'u',
                pipeline: [{ $merge: { into: 'copy' } }]
            })
        ).toThrow(FriendlyException);
    });
});

describe('MongoAdapter.formatQuery', () => {
    const adapter = new MongoAdapter({ dbType: 'mongodb', host: 'localhost' });

    it('formats find with sort/skip/limit', () => {
        const s = adapter.formatQuery({
            op: 'find',
            collection: 'users',
            filter: { name: 'Samuel' },
            sort: { age: -1 },
            skip: 2,
            limit: 5
        });
        expect(s).toBe(
            'db.users.find({"name":"Samuel"}).sort({"age":-1}).skip(2).limit(5)'
        );
    });

    it('formats aggregate', () => {
        const s = adapter.formatQuery({
            op: 'aggregate',
            collection: 'orders',
            pipeline: [{ $match: { total: { $gt: 10 } } }]
        });
        expect(s).toContain('db.orders.aggregate(');
        expect(s).toContain('$match');
    });
});
