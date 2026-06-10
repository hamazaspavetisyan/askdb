import { DbType, EntitySchemaDto } from '@mongo-mpc/shared';

/**
 * Result of executing a read-only query, in a DB-neutral shape.
 */
export interface QueryResult {
    rows: Record<string, unknown>[];
    rowCount: number;
}

/**
 * Describes the JSON shape the agent must produce for `run_query`, so the
 * tool definition handed to the LLM can stay adapter-specific while the
 * agent code stays generic.
 */
export interface QueryToolSpec {
    /** Human/LLM-facing description of how to express a query for this DB. */
    description: string;
    /** JSON Schema for the `run_query` tool input. */
    inputSchema: Record<string, unknown>;
}

/**
 * Caps applied to every executed query, regardless of what the model asks for.
 */
export interface ExecutionLimits {
    /** Hard cap on rows returned to the caller. */
    maxRows: number;
    /** Wall-clock cap for a single query, in milliseconds. */
    maxTimeMs: number;
}

export const DEFAULT_EXECUTION_LIMITS: ExecutionLimits = {
    maxRows: 200,
    maxTimeMs: 15_000
};

/**
 * The single seam that decouples everything above it from the concrete
 * database. MongoDB implements it today; MySQL/Postgres later with no
 * changes to the agent, controllers, or session layer.
 *
 * Vocabulary is intentionally DB-neutral: an "entity" is a MongoDB
 * collection or a SQL table.
 *
 * One adapter instance is created per session, so any per-session caching
 * (e.g. inferred schemas) lives inside the implementation.
 */
export interface DatabaseAdapter {
    readonly dbType: DbType;

    /** Open the underlying connection. Throws on failure. */
    connect(): Promise<void>;

    /** Close the underlying connection. Safe to call more than once. */
    disconnect(): Promise<void>;

    /** Databases visible to the connected principal. */
    listDatabases(): Promise<string[]>;

    /** Collections / tables within a database. */
    listEntities(database: string): Promise<string[]>;

    /**
     * Field-level schema for an entity. For schemaless stores this is
     * inferred by sampling; results are cached per session.
     */
    describeEntity(database: string, entity: string): Promise<EntitySchemaDto>;

    /** A handful of real rows to help the agent ground its query. */
    sampleData(
        database: string,
        entity: string,
        limit: number
    ): Promise<Record<string, unknown>[]>;

    /**
     * Throws an FriendlyException if the query would mutate data or is otherwise
     * disallowed. Enforced server-side independent of the LLM.
     */
    validateReadOnly(query: unknown): void;

    /** Validate, cap, and execute a read-only query. */
    runReadOnlyQuery(database: string, query: unknown): Promise<QueryResult>;

    /** Adapter-specific description of the `run_query` tool input. */
    queryToolSpec(): QueryToolSpec;

    /**
     * Render a query into a readable, DB-native string for display
     * (e.g. `db.users.find({ "name": "Samuel" })`).
     */
    formatQuery(query: unknown): string;
}
