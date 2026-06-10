import { DatabaseAdapter } from '../database/database-adapter.interface';
import { FriendlyException } from '../common/errors';

/** Rows returned to the MCP client are already capped by the adapter. */

export interface McpToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export interface McpToolOutcome {
    text: string;
    isError?: boolean;
}

const DATABASE_PROP = {
    database: {
        type: 'string',
        description: 'Database name to operate on.'
    }
} as const;

/**
 * The read-only tool surface exposed over MCP. Mirrors the internal agent's
 * primitives so any MCP client's model can drive the queries itself.
 */
export function buildToolDefinitions(
    adapter: DatabaseAdapter
): McpToolDefinition[] {
    const querySpec = adapter.queryToolSpec();
    return [
        {
            name: 'list_databases',
            description: 'List databases available on the connected server.',
            inputSchema: { type: 'object', properties: {} }
        },
        {
            name: 'list_entities',
            description:
                'List the collections/tables in a database.',
            inputSchema: {
                type: 'object',
                properties: { ...DATABASE_PROP },
                required: ['database']
            }
        },
        {
            name: 'describe_entity',
            description:
                'Get the inferred field/column schema for one entity. Use ' +
                'this before writing a query so you use real field names.',
            inputSchema: {
                type: 'object',
                properties: {
                    ...DATABASE_PROP,
                    entity: { type: 'string' }
                },
                required: ['database', 'entity']
            }
        },
        {
            name: 'sample_data',
            description:
                'Fetch a few real rows from an entity to understand its shape and values.',
            inputSchema: {
                type: 'object',
                properties: {
                    ...DATABASE_PROP,
                    entity: { type: 'string' },
                    limit: { type: 'number' }
                },
                required: ['database', 'entity']
            }
        },
        {
            name: 'run_query',
            description: `READ-ONLY query execution. ${querySpec.description}`,
            inputSchema: {
                type: 'object',
                properties: {
                    ...DATABASE_PROP,
                    query: querySpec.inputSchema
                },
                required: ['database', 'query']
            }
        }
    ];
}

/**
 * Execute one MCP tool call against the shared adapter. Adapter errors
 * (including read-only violations) are returned as a tool error so the calling
 * model can read and correct them, rather than crashing the request.
 */
export async function executeMcpTool(
    adapter: DatabaseAdapter,
    name: string,
    args: Record<string, unknown>
): Promise<McpToolOutcome> {
    try {
        switch (name) {
            case 'list_databases': {
                const databases = await adapter.listDatabases();
                return { text: safeJson({ databases }) };
            }
            case 'list_entities': {
                const entities = await adapter.listEntities(
                    requireString(args, 'database')
                );
                return { text: safeJson({ entities }) };
            }
            case 'describe_entity': {
                const schema = await adapter.describeEntity(
                    requireString(args, 'database'),
                    requireString(args, 'entity')
                );
                return { text: safeJson(schema) };
            }
            case 'sample_data': {
                const rows = await adapter.sampleData(
                    requireString(args, 'database'),
                    requireString(args, 'entity'),
                    Number(args.limit) || 5
                );
                return { text: safeJson({ rows }) };
            }
            case 'run_query': {
                const result = await adapter.runReadOnlyQuery(
                    requireString(args, 'database'),
                    args.query
                );
                return {
                    text: safeJson({
                        rowCount: result.rowCount,
                        rows: result.rows
                    })
                };
            }
            default:
                return { text: `Unknown tool "${name}".`, isError: true };
        }
    } catch (err) {
        const message =
            err instanceof FriendlyException
                ? (err.getResponse() as { message?: string }).message ||
                  err.message
                : (err as Error).message;
        return { text: `Error: ${message}`, isError: true };
    }
}

function requireString(args: Record<string, unknown>, key: string): string {
    const v = args[key];
    if (typeof v !== 'string' || v.length === 0) {
        throw new Error(`Missing required string argument "${key}".`);
    }
    return v;
}

/**
 * JSON stringify tolerant of BSON values (ObjectId, Date, bigint); never throws.
 */
export function safeJson(value: unknown): string {
    return JSON.stringify(
        value,
        (_key, val) => {
            if (typeof val === 'bigint') return val.toString();
            if (val && typeof val === 'object') {
                const ctor = (val as { constructor?: { name?: string } })
                    .constructor?.name;
                if (ctor === 'ObjectId') return val.toString();
            }
            return val;
        },
        2
    );
}
