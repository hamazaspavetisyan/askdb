/**
 * DB-neutral description of a single field/column within an entity
 * (a MongoDB collection or a SQL table). Inferred by sampling for
 * schemaless stores, read from metadata for relational ones.
 */
export interface FieldInfo {
  name: string;
  /** Normalized type label, e.g. 'string' | 'number' | 'boolean' | 'date' | 'objectId' | 'array' | 'object' | 'null' | 'mixed' */
  type: string;
  /** True if the field was absent in at least one sampled document/row. */
  nullable?: boolean;
  /** A few example values, stringified and truncated, to help the agent ground itself. */
  examples?: string[];
}

export interface EntitySchemaDto {
  entity: string;
  fields: FieldInfo[];
  /** How the schema was derived: 'sampled' (NoSQL) or 'metadata' (relational). */
  source: 'sampled' | 'metadata';
}
