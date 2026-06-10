import { createServer } from 'node:net';
import { HttpStatus, Logger } from '@nestjs/common';
import { MongoClient, Db, BSON, MongoClientOptions } from 'mongodb';
import { createTunnel } from 'tunnel-ssh';
import type { Server } from 'node:net';
import type { Client } from 'ssh2';
import { ConnectRequestDto, EntitySchemaDto, SshConfig } from '@mongo-mpc/shared';
import { FriendlyException, ErrorKeys } from '../../common/errors';
import {
    DatabaseAdapter,
    DEFAULT_EXECUTION_LIMITS,
    ExecutionLimits,
    QueryResult,
    QueryToolSpec
} from '../database-adapter.interface';
import { inferSchema } from '../schema-inference';

/** Stages that write data — forbidden under the read-only contract. */
const WRITE_AGGREGATION_STAGES = new Set(['$out', '$merge']);

/** How many documents to sample when inferring a schema. */
const SCHEMA_SAMPLE_SIZE = 50;

interface MongoFindQuery {
    op: 'find';
    collection: string;
    filter?: Record<string, unknown>;
    projection?: Record<string, unknown>;
    sort?: Record<string, 1 | -1>;
    limit?: number;
    skip?: number;
}

interface MongoAggregateQuery {
    op: 'aggregate';
    collection: string;
    pipeline: Record<string, unknown>[];
}

type MongoQuery = MongoFindQuery | MongoAggregateQuery;

/**
 * Build a MongoDB connection URI from connection params. If `host` already
 * contains a scheme (mongodb:// or mongodb+srv://) it is used verbatim;
 * otherwise a URI is composed from host/port and optional credentials.
 */
export function buildMongoUri(
    params: ConnectRequestDto,
    override?: { host?: string; port?: number }
): string {
    const host = override?.host ?? params.host;
    const port = override?.port ?? params.port;
    const { username, password, authSource } = params;

    // A full connection string is honored verbatim (unless tunneling, where
    // the caller passes an override host/port to reach the local tunnel).
    if (!override && host.includes('://')) return host;

    const auth = username
        ? `${encodeURIComponent(username)}:${encodeURIComponent(
              password ?? ''
          )}@`
        : '';
    const hostPort = port ? `${host}:${port}` : host;
    const query = authSource
        ? `/?authSource=${encodeURIComponent(authSource)}`
        : '';
    return `mongodb://${auth}${hostPort}${query}`;
}

/** Find a free local TCP port for the SSH tunnel to listen on. */
function findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = createServer();
        srv.once('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const addr = srv.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            srv.close(() => resolve(port));
        });
    });
}

/**
 * Convert any Extended JSON in a filter/pipeline (e.g. {"$oid": "..."},
 * {"$date": "..."}) into native BSON types (ObjectId, Date) so the driver
 * executes it correctly. Plain values pass through unchanged. Falls back to
 * the original value if deserialization fails.
 */
export function toBson<T>(value: T): T {
    if (value === undefined || value === null) return value;
    try {
        return BSON.EJSON.deserialize(value as object) as T;
    } catch {
        return value;
    }
}

export class MongoAdapter implements DatabaseAdapter {
    readonly dbType = 'mongodb' as const;

    private client?: MongoClient;
    private tunnelServer?: Server;
    private sshClient?: Client;
    private readonly limits: ExecutionLimits;
    private readonly logger = new Logger('MongoAdapter');
    /** Per-session schema cache, keyed by `${database}.${entity}`. */
    private readonly schemaCache = new Map<string, EntitySchemaDto>();

    constructor(
        private readonly params: ConnectRequestDto,
        limits: ExecutionLimits = DEFAULT_EXECUTION_LIMITS
    ) {
        this.limits = limits;
    }

    async connect(): Promise<void> {
        try {
            const options: MongoClientOptions = {
                serverSelectionTimeoutMS: 8_000
            };
            let uri: string;

            if (this.params.ssh) {
                // Open an SSH tunnel and connect Mongo through the local port.
                const localPort = await findFreePort();
                await this.openSshTunnel(
                    this.params.ssh,
                    localPort,
                    this.params.host,
                    this.params.port ?? 27017
                );
                uri = buildMongoUri(this.params, {
                    host: '127.0.0.1',
                    port: localPort
                });
                // The driver must not try to reach replica-set members by their
                // real (untunneled) addresses discovered via hello/isMaster.
                options.directConnection = true;
            } else {
                uri = buildMongoUri(this.params);
            }

            this.client = new MongoClient(uri, options);
            await this.client.connect();
            // Force a round-trip so bad credentials/hosts fail fast.
            await this.client.db('admin').command({ ping: 1 });
        } catch (err) {
            await this.disconnect();
            throw new FriendlyException(
                `Could not connect to MongoDB: ${(err as Error).message}`,
                this.params.ssh ? 'ssh' : 'host',
                ErrorKeys.DB_CONNECTION_FAILED,
                HttpStatus.BAD_GATEWAY
            );
        }
    }

    /** Establish an SSH tunnel forwarding 127.0.0.1:localPort → dstHost:dstPort. */
    private async openSshTunnel(
        ssh: SshConfig,
        localPort: number,
        dstHost: string,
        dstPort: number
    ): Promise<void> {
        const [server, client] = await createTunnel(
            { autoClose: false, reconnectOnError: false },
            { host: '127.0.0.1', port: localPort },
            {
                host: ssh.host,
                port: ssh.port ?? 22,
                username: ssh.username,
                privateKey: ssh.privateKey,
                passphrase: ssh.passphrase || undefined,
                readyTimeout: 15_000
            },
            { srcAddr: '127.0.0.1', srcPort: localPort, dstAddr: dstHost, dstPort }
        );
        this.tunnelServer = server;
        this.sshClient = client;
        this.logger.log(
            `SSH tunnel up: 127.0.0.1:${localPort} → ${dstHost}:${dstPort} via ${ssh.username}@${ssh.host}:${ssh.port ?? 22}`
        );
    }

    async disconnect(): Promise<void> {
        const client = this.client;
        const tunnelServer = this.tunnelServer;
        const sshClient = this.sshClient;
        this.client = undefined;
        this.tunnelServer = undefined;
        this.sshClient = undefined;
        this.schemaCache.clear();
        if (client) {
            try {
                await client.close();
            } catch {
                /* ignore close errors */
            }
        }
        // Tear down the SSH tunnel, if one was opened.
        try {
            tunnelServer?.close();
        } catch {
            /* ignore */
        }
        try {
            sshClient?.end();
        } catch {
            /* ignore */
        }
    }

    private requireClient(): MongoClient {
        if (!this.client) {
            throw new FriendlyException(
                'Not connected to a database.',
                'sessionId',
                ErrorKeys.SESSION_NOT_FOUND,
                HttpStatus.BAD_REQUEST
            );
        }
        return this.client;
    }

    private db(database: string): Db {
        return this.requireClient().db(database);
    }

    async listDatabases(): Promise<string[]> {
        const result = await this.requireClient()
            .db()
            .admin()
            .listDatabases({ nameOnly: true });
        return result.databases.map((d) => d.name);
    }

    async listEntities(database: string): Promise<string[]> {
        const cols = await this.db(database)
            .listCollections({}, { nameOnly: true })
            .toArray();
        return cols.map((c) => c.name).sort((a, b) => a.localeCompare(b));
    }

    async describeEntity(
        database: string,
        entity: string
    ): Promise<EntitySchemaDto> {
        const cacheKey = `${database}.${entity}`;
        const cached = this.schemaCache.get(cacheKey);
        if (cached) return cached;

        const docs = (await this.db(database)
            .collection(entity)
            .find({}, { limit: SCHEMA_SAMPLE_SIZE })
            .maxTimeMS(this.limits.maxTimeMs)
            .toArray()) as unknown as Record<string, unknown>[];

        const schema: EntitySchemaDto = {
            entity,
            fields: inferSchema(docs),
            source: 'sampled'
        };
        this.schemaCache.set(cacheKey, schema);
        return schema;
    }

    async sampleData(
        database: string,
        entity: string,
        limit: number
    ): Promise<Record<string, unknown>[]> {
        const capped = Math.max(1, Math.min(limit, this.limits.maxRows));
        return (await this.db(database)
            .collection(entity)
            .find({}, { limit: capped })
            .maxTimeMS(this.limits.maxTimeMs)
            .toArray()) as unknown as Record<string, unknown>[];
    }

    validateReadOnly(query: unknown): void {
        const q = query as Partial<MongoQuery> | null;
        if (!q || typeof q !== 'object') {
            throw this.invalidQuery('Query must be an object.');
        }
        if (q.op !== 'find' && q.op !== 'aggregate') {
            throw this.invalidQuery(
                `Unsupported op "${String(
                    (q as { op?: unknown }).op
                )}". Only "find" and "aggregate" are allowed.`
            );
        }
        if (typeof q.collection !== 'string' || q.collection.length === 0) {
            throw this.invalidQuery('A non-empty "collection" is required.');
        }
        if (q.op === 'aggregate') {
            const pipeline = (q as MongoAggregateQuery).pipeline;
            if (!Array.isArray(pipeline)) {
                throw this.invalidQuery('"pipeline" must be an array.');
            }
            for (const stage of pipeline) {
                if (!stage || typeof stage !== 'object') {
                    throw this.invalidQuery(
                        'Each pipeline stage must be an object.'
                    );
                }
                for (const key of Object.keys(stage)) {
                    if (WRITE_AGGREGATION_STAGES.has(key)) {
                        throw new FriendlyException(
                            `Stage "${key}" writes data and is not allowed (read-only).`,
                            'query',
                            ErrorKeys.READ_ONLY_VIOLATION,
                            HttpStatus.FORBIDDEN
                        );
                    }
                }
            }
        }
    }

    private invalidQuery(message: string): FriendlyException {
        return new FriendlyException(
            message,
            'query',
            ErrorKeys.INVALID_QUERY,
            HttpStatus.BAD_REQUEST
        );
    }

    async runReadOnlyQuery(
        database: string,
        query: unknown
    ): Promise<QueryResult> {
        this.validateReadOnly(query);
        const q = query as MongoQuery;
        const collection = this.db(database).collection(q.collection);
        this.logger.log(
            `runReadOnlyQuery ${database}.${q.collection}: ${JSON.stringify(
                query
            )}`
        );

        try {
            let rows: Record<string, unknown>[];
            if (q.op === 'find') {
                const limit = Math.min(
                    q.limit ?? this.limits.maxRows,
                    this.limits.maxRows
                );
                rows = (await collection
                    .find(toBson(q.filter) ?? {}, {
                        projection: q.projection
                    })
                    .sort(q.sort ?? {})
                    .skip(q.skip ?? 0)
                    .limit(limit)
                    .maxTimeMS(this.limits.maxTimeMs)
                    .toArray()) as unknown as Record<string, unknown>[];
            } else {
                const pipeline = [
                    ...(toBson(q.pipeline) ?? []),
                    { $limit: this.limits.maxRows }
                ];
                rows = (await collection
                    .aggregate(pipeline, { maxTimeMS: this.limits.maxTimeMs })
                    .toArray()) as unknown as Record<string, unknown>[];
            }
            this.logger.log(
                `runReadOnlyQuery ${database}.${q.collection} → ${rows.length} row(s)`
            );
            return { rows, rowCount: rows.length };
        } catch (err) {
            if (err instanceof FriendlyException) throw err;
            this.logger.warn(
                `runReadOnlyQuery ${database}.${q.collection} failed: ${
                    (err as Error).message
                }`
            );
            throw new FriendlyException(
                `Query execution failed: ${(err as Error).message}`,
                'query',
                ErrorKeys.QUERY_EXECUTION_FAILED,
                HttpStatus.BAD_REQUEST
            );
        }
    }

    queryToolSpec(): QueryToolSpec {
        return {
            description:
                'Execute a READ-ONLY MongoDB query. Use op "find" for simple lookups ' +
                '(filter, projection, sort, limit, skip) or op "aggregate" for grouping/' +
                'joins/computed results (pipeline). Write stages like $out and $merge are ' +
                'rejected. Results are capped server-side. ' +
                'IMPORTANT: to match a field of type "objectId" (such as _id), pass it as ' +
                'Extended JSON, e.g. {"_id": {"$oid": "616954c4a26981cfa069ffda"}}. ' +
                'For dates use {"$date": "2024-01-01T00:00:00Z"}. Do not use $oid or ' +
                '$toString as query operators.',
            inputSchema: {
                type: 'object',
                properties: {
                    op: { type: 'string', enum: ['find', 'aggregate'] },
                    collection: { type: 'string' },
                    filter: {
                        type: 'object',
                        description: 'MongoDB filter document (find only).'
                    },
                    projection: {
                        type: 'object',
                        description: 'Fields to include/exclude (find only).'
                    },
                    sort: {
                        type: 'object',
                        description: 'Sort spec, e.g. { "createdAt": -1 }.'
                    },
                    limit: { type: 'number' },
                    skip: { type: 'number' },
                    pipeline: {
                        type: 'array',
                        items: { type: 'object' },
                        description: 'Aggregation pipeline (aggregate only).'
                    }
                },
                required: ['op', 'collection']
            }
        };
    }

    formatQuery(query: unknown): string {
        const q = query as MongoQuery;
        if (!q || typeof q !== 'object') return String(query);
        if (q.op === 'aggregate') {
            return `db.${q.collection}.aggregate(${JSON.stringify(
                q.pipeline ?? [],
                null,
                2
            )})`;
        }
        const args: string[] = [JSON.stringify(q.filter ?? {})];
        if (q.projection) args.push(JSON.stringify(q.projection));
        let out = `db.${q.collection}.find(${args.join(', ')})`;
        if (q.sort) out += `.sort(${JSON.stringify(q.sort)})`;
        if (q.skip) out += `.skip(${q.skip})`;
        if (q.limit) out += `.limit(${q.limit})`;
        return out;
    }
}
