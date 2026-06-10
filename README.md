# friendly-db-client

A natural language database explorer. Connect to MongoDB, MySQL, or PostgreSQL and query your data in plain English — no query language required. Powered by your choice of LLM (Anthropic Claude or OpenAI).

## Project structure

```
mongo-mpc/
├── shared/       # Shared TypeScript DTOs (used by both backend and frontend)
├── backend/      # NestJS API server (port 3000)
└── frontend/     # Angular app (port 4200)
```

## Prerequisites

- Node.js 20+
- An [Anthropic API key](https://console.anthropic.com)
- A running MongoDB, MySQL, or PostgreSQL instance to query

## Setup

**1. Install dependencies** (each package is its own npm project):

```bash
cd shared && npm install && npm run build && cd ..
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

> `shared` must be built once so `backend` and `frontend` can resolve
> `@mongo-mpc/shared`. Re-run `npm run build` in `shared` after changing a DTO.

**2. Configure environment:**

```bash
cd backend && cp .env.example .env
```

Open `backend/.env` and set your API key:

```
LISTENING_PORT=3000
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
# ANTHROPIC_MODEL=claude-sonnet-4-6   # optional
```

### Choosing an LLM provider

The query agent is provider-agnostic. Pick the backend with `LLM_PROVIDER` and
supply that provider's key:

| `LLM_PROVIDER` | Required | Optional model override |
|----------------|----------|-------------------------|
| `anthropic` (default) | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`) |
| `openai` | `OPENAI_API_KEY` | `OPENAI_MODEL` (default `gpt-4o`) |

Adding another provider is one class implementing `LlmProvider` plus a case in
`LlmService` — the agent loop and the read-only safeguards don't change.

To verify a provider end to end with a real API call (a tiny tool-calling
round-trip), from `backend/`:

```bash
LLM_PROVIDER=openai OPENAI_API_KEY=sk-... npm run llm:smoke
# or: LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-... npm run llm:smoke
```

## Running

Open two terminal tabs from the repo root.

**Terminal 1 — backend:**

```bash
cd backend
npm run start:dev
```

The API will be available at `http://localhost:3000/api`.

**Terminal 2 — frontend:**

```bash
cd frontend
npm run start
```

Open `http://localhost:4200` in your browser.

## Building for production

**Backend:**

```bash
cd backend
npm run build
# Output: backend/dist/
npm run start   # runs the compiled output
```

**Frontend:**

```bash
cd frontend
npm run build:prod
# Output: frontend/dist/
```

## How it works

1. Enter your database connection details (host, port, credentials) in the Connect screen.
2. Select a database and type a question in plain English, e.g. *"get me the user named Samuel"* or *"show orders placed in the last 7 days"*.
3. The backend sends your question to Claude, which inspects the schema and generates the correct query (MQL for MongoDB, SQL for MySQL/Postgres), executes it, and returns the results.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/connection` | Connect to a database, returns `sessionId` |
| `DELETE` | `/api/connection/:sessionId` | Disconnect |
| `POST` | `/api/query` | Run a natural language query |
| `GET` | `/api/query/collections?sessionId=&database=` | List collections/tables |

## Run as an MCP server (HTTP)

Expose your database to MCP clients (Claude, Cursor, …) as **read-only** tools,
so the client's own model can explore and query it. This is a separate process
from the web app; it reuses the same read-only adapter and safeguards.

The target connection is fixed via environment (it is **not** taken from the web
UI) — credentials live in your env/MCP config, never in the chat:

```bash
cd backend
npm run build
DB_HOST=localhost DB_PORT=27017 DB_USER=root DB_PASS=... DB_AUTH_SOURCE=admin \
MCP_AUTH_TOKEN=change-me MCP_PORT=3001 \
npm run start:mcp
# dev (no build): npm run start:mcp:dev
```

(See `backend/.env.example` for all `DB_*` / `SSH_*` / `MCP_*` variables — an SSH
tunnel is supported via `SSH_HOST` etc.) The server listens on
`http://localhost:3001/mcp`.

**Tools exposed:** `list_databases`, `list_entities`, `describe_entity`,
`sample_data`, `run_query` (read-only — writes/`$out`/`$merge` are rejected and
result sizes are capped).

**Client config** (e.g. an `mcp.json` / custom connector):

```json
{
  "mcpServers": {
    "askdb": {
      "url": "http://localhost:3001/mcp",
      "headers": { "Authorization": "Bearer change-me" }
    }
  }
}
```

> Security: the endpoint gives read access to your database. Always set
> `MCP_AUTH_TOKEN` and serve over TLS before exposing it beyond localhost. Prefer
> connecting with a read-only DB account as defense in depth.

> Client compatibility: works with local/desktop and self-hosted MCP clients
> (Claude Desktop, Cursor, etc.) via the bearer token. Registering as a connector
> inside hosted **claude.ai** additionally needs a public HTTPS URL and OAuth,
> which is not implemented yet.

### Connect to Claude Desktop (stdio)

Claude Desktop launches MCP servers as a local subprocess over stdio (no auth
token or TLS needed — the trust boundary is your machine).

1. Build once: `cd backend && npm run build`.
2. Find your Node path (GUI apps don't inherit your shell PATH): `which node`.
3. Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
   (macOS) and add an entry under `mcpServers` (see the snippet below), filling
   in your Node path, the absolute path to `backend/dist/mcp-stdio-main.js`, and
   your DB connection in `env`.
4. Fully quit and reopen Claude Desktop. The `askdb` tools then appear in the
   tools menu; ask questions like *"using askdb, list the collections in shop"*.

```json
{
  "mcpServers": {
    "askdb": {
      "command": "/usr/local/bin/node",
      "args": ["/absolute/path/to/backend/dist/mcp-stdio-main.js"],
      "env": {
        "DB_TYPE": "mongodb",
        "DB_HOST": "localhost",
        "DB_PORT": "27017",
        "DB_USER": "root",
        "DB_PASS": "...",
        "DB_AUTH_SOURCE": "admin"
      }
    }
  }
}
```

For a remote DB over SSH, add `SSH_HOST`, `SSH_PORT`, `SSH_USER`, and
`SSH_PRIVATE_KEY_PATH` (and `SSH_PASSPHRASE` if needed) to `env` — same variables
as the HTTP server. Run `npm run start:mcp:stdio` in a terminal to test it
standalone before wiring Claude Desktop.

## Adding a new database type

1. Create `backend/src/database/adapters/yourdb.adapter.ts` implementing `BaseAdapter`.
2. Register it in `backend/src/database/adapter.factory.ts`.
3. Add the new type to `shared/src/connection.dto.ts` (`DbType`).
