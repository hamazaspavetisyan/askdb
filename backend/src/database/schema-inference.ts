import { FieldInfo } from '@mongo-mpc/shared';

/** Max example values retained per field. */
const MAX_EXAMPLES = 3;
/** Max length of a stringified example before truncation. */
const MAX_EXAMPLE_LEN = 80;

interface FieldAccumulator {
    types: Set<string>;
    presentCount: number;
    examples: string[];
}

/** Normalize a JS/BSON value to a coarse type label. */
export function typeOf(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Date) return 'date';
    const t = typeof value;
    if (t === 'object') {
        const ctor = (value as { constructor?: { name?: string } }).constructor
            ?.name;
        // BSON ObjectId and friends expose a constructor name we can surface.
        if (ctor === 'ObjectId') return 'objectId';
        if (ctor && ctor !== 'Object') return ctor;
        return 'object';
    }
    return t; // 'string' | 'number' | 'boolean' | 'bigint' | 'symbol' | 'function'
}

function stringifyExample(value: unknown): string {
    let s: string;
    try {
        s = typeof value === 'object' ? JSON.stringify(value) : String(value);
    } catch {
        s = String(value);
    }
    if (s.length > MAX_EXAMPLE_LEN) s = s.slice(0, MAX_EXAMPLE_LEN) + '…';
    return s;
}

/**
 * Infer a flat, top-level field schema from a set of sampled documents.
 * Nested objects/arrays are reported by their container type rather than
 * being recursively expanded, which keeps the schema compact for the agent.
 */
export function inferSchema(documents: Record<string, unknown>[]): FieldInfo[] {
    const acc = new Map<string, FieldAccumulator>();
    const total = documents.length;

    for (const doc of documents) {
        if (!doc || typeof doc !== 'object') continue;
        for (const [key, value] of Object.entries(doc)) {
            let entry = acc.get(key);
            if (!entry) {
                entry = { types: new Set(), presentCount: 0, examples: [] };
                acc.set(key, entry);
            }
            entry.presentCount += 1;
            entry.types.add(typeOf(value));
            if (
                entry.examples.length < MAX_EXAMPLES &&
                value !== null &&
                value !== undefined
            ) {
                entry.examples.push(stringifyExample(value));
            }
        }
    }

    const fields: FieldInfo[] = [];
    for (const [name, entry] of acc) {
        const types = [...entry.types].filter((t) => t !== 'null');
        const type =
            types.length === 0
                ? 'null'
                : types.length === 1
                  ? types[0]
                  : 'mixed';
        fields.push({
            name,
            type,
            nullable: entry.presentCount < total || entry.types.has('null'),
            examples: entry.examples
        });
    }
    // Stable, readable ordering.
    fields.sort((a, b) => a.name.localeCompare(b.name));
    return fields;
}
