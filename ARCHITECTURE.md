# friendly-db-client — Architecture Plan

A natural-language database explorer. The user supplies a DB host + optional auth,
picks a database, and asks questions in plain English ("get me the user named Samuel").
An AI agent inspects the schema and runs the right **read-only** query. MongoDB first,
MySQL later behind the same abstraction.

## Decisions (locked for v1)

| Area | Decision |
|------|----------|
| NL → query | **Agentic tool-loop** — Claude is given tools and decides the steps |
| Query safety | **Read-only** — only find/aggregate/SELECT, validated before execution |
| LLM provider | **Anthropic / Claude** via the official SDK with tool-use |
| Connections | **In-memory session pool**, keyed by `sessionId`, TTL eviction; creds never persisted |
| DB support | MongoDB now; MySQL later behind a `DatabaseAdapter` interface |

## What already exists

- **`shared/`** — DTO package consumed by both apps. `ConnectRequestDto`,
  `ConnectResponseDto`, `QueryRequestDto`, `QueryResponseDto`,
  `ListCollections*Dto`. This is the contract; both ends import it.
- **`backend/`** — NestJS 11 boilerplate: config, Winston logger, throttler + guards,
  global exception filter, HTTP logging middleware, Swagger, schedule module, JWT/passport
  scaffolding. **No feature modules yet** (`modules/` and `database/` are empty/absent).
- **`frontend/`** — Angular app shell only.

So the foundation is in place; the feature slices are greenfield.

## Layered design

```
Angular (Connect form, Query console, Results viewer, ApiService)
        │  HTTP/JSON, typed by shared DTOs
NestJS API (ConnectionController, QueryController)
        │
QueryAgentService  ⇄  Anthropic API        ← agent tool-loop, read-only guardrails
        │  tool calls
DatabaseAdapter (listEntities · describeEntity · sampleData · runReadOnlyQuery · validate)
        │
MongoAdapter → MongoDB        MysqlAdapter → MySQL (future)
        ▲
SessionStore (in-memory connection pool, TTL eviction)
```

## Backend modules

```
backend/src/
├── modules/
│   ├── connection/
│   │   ├── connection.controller.ts   # POST /connection, DELETE /connection/:id
│   │   ├── connection.service.ts      # opens adapter, returns databases[]
│   │   └── session.store.ts           # Map<sessionId, Session>, TTL cron eviction
│   ├── query/
│   │   ├── query.controller.ts        # POST /query, GET /query/collections
│   │   └── query.service.ts           # orchestrates agent + adapter, times execution
│   └── agent/
│       ├── query-agent.service.ts     # the Claude tool-loop
│       ├── llm.service.ts             # thin Anthropic SDK wrapper
│       └── tools/                     # tool definitions handed to the model
└── database/
    ├── database-adapter.interface.ts  # the abstraction (see below)
    ├── adapter.factory.ts             # dbType → adapter instance
    └── adapters/
        ├── mongo.adapter.ts
        └── mysql.adapter.ts           # later
```

### The abstraction layer

The single seam that makes MySQL a drop-in later. Use DB-neutral vocabulary
("entity" not "collection"/"table") so the interface and the agent's tools don't
leak MongoDB concepts.

```ts
export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface DatabaseAdapter {
  readonly dbType: DbType;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listDatabases(): Promise<string[]>;

  // Schema introspection — the agent's eyes
  listEntities(database: string): Promise<string[]>;              // collections / tables
  describeEntity(database: string, entity: string): Promise<FieldInfo[]>; // inferred/declared schema
  sampleData(database: string, entity: string, n: number): Promise<Record<string, unknown>[]>;

  // Execution — read-only, validated
  validateReadOnly(query: NativeQuery): void;   // throws if mutating
  runReadOnlyQuery(database: string, query: NativeQuery): Promise<QueryResult>;
}
```

- **Mongo:** `listEntities` = collections; `describeEntity` infers fields by sampling N docs;
  `runReadOnlyQuery` accepts a `find`/`aggregate` spec; `validateReadOnly` rejects write ops and
  `$out`/`$merge` stages.
- **MySQL (later):** same methods over `information_schema` and `SELECT`; `validateReadOnly`
  parses the SQL and rejects anything but a single `SELECT`.

`AdapterFactory` maps `dbType` → concrete adapter so nothing above the factory knows the DB.

### The agent tool-loop

Why agentic over single-shot: ambiguous questions ("recent orders", "active users") need
the model to look at the schema and sample data before committing to a query, and to recover
when an entity name doesn't match. The loop:

1. **System prompt** — role, the connected `dbType`, the **read-only** constraint, and the tool list.
2. **User turn** — the natural-language question + database name.
3. **Loop** — the model calls tools; the backend executes each against the adapter and feeds
   results back, until the model returns a final query + answer:
   - `list_entities()` — what collections/tables exist
   - `describe_entity(name)` — fields and types
   - `sample_data(name, n)` — a few real rows to ground itself
   - `run_query(spec)` — the read-only query; backend validates before running
4. **Final response** → `QueryResponseDto { generatedQuery, explanation, result, executionTimeMs }`.

**Guardrails:** max iterations (e.g. 6), wall-clock timeout, a row/`maxTimeMS` cap on every query,
and `validateReadOnly` enforced server-side regardless of what the model emits. Treat DB rows
as untrusted data, not instructions (prompt-injection hygiene): keep tool output in tool-result
turns, never splice it into the system prompt.

### Session & security model

- `POST /connection` opens an adapter, lists databases, stores the live connection in
  `SessionStore` under a generated `sessionId`, returns `{ sessionId, dbType, databases }`.
- Subsequent `/query` calls pass `sessionId`; the service looks up the adapter from the pool.
- Credentials live only in memory for the session's lifetime, are **redacted from logs**, and are
  evicted on idle TTL or explicit `DELETE`.
- Recommend (doc for users): connect with a **read-only DB account** as defense in depth.
- Existing throttler guard already rate-limits; keep it on the query route.

### Frontend

Three views over the existing Angular shell, plus a typed `ApiService` that imports the
`shared` DTOs so the contract is compile-checked end to end:

- **Connect** — form for dbType/host/port/auth → calls `/connection`, stores `sessionId`,
  shows the returned database list.
- **Query console** — database selector + plain-English input → `/query`.
- **Results** — render `result` as a table, plus collapsible panels for the
  `generatedQuery` and the model's `explanation`, and `executionTimeMs`.

Optional later: stream the agent's intermediate steps over the already-present Socket.IO so the
user sees "looking at schema… sampling… running query" instead of a spinner.

## Build order (incremental, each step demoable)

1. **Deps + contract** — add `@anthropic-ai/sdk` and `mongodb` to backend; confirm/extend shared DTOs.
2. **Abstraction + Mongo adapter** — `DatabaseAdapter`, `AdapterFactory`, `MongoAdapter`
   (connect, list, describe-by-sampling, read-only validate + execute).
3. **Connection module** — controller, service, `SessionStore` with TTL eviction.
4. **Agent module** — `LlmService` (Anthropic), `QueryAgentService` tool-loop, tool definitions.
5. **Query module** — wire agent + adapter end to end; return the full `QueryResponseDto`.
6. **Frontend** — Connect → Query console → Results, typed via shared DTOs.
7. **Polish** — error surfaces, streaming steps over Socket.IO, query caps, log redaction tests.
8. **Future: MySQL** — implement `MysqlAdapter`, register in factory, add `'mysql'` paths. No
   changes above the adapter layer.

## Open questions to settle before/while building

- Schema introspection cost: cache `describe_entity` results per session so the agent doesn't
  re-sample on every turn.
- Result size: cap rows returned to the UI and paginate (DTO already has room to extend).
- Multi-instance deploy: the in-memory pool is single-instance by design; revisit (sticky
  sessions or a connection broker) only if you scale horizontally.
