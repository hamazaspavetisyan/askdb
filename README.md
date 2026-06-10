# friendly-db-client

A natural language database explorer. Connect to MongoDB, MySQL, or PostgreSQL and query your data in plain English — no query language required. Powered by Claude AI.

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
ANTHROPIC_API_KEY=sk-ant-...
LISTENING_PORT=3000
# ANTHROPIC_MODEL=claude-sonnet-4-6   # optional
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

## Adding a new database type

1. Create `backend/src/database/adapters/yourdb.adapter.ts` implementing `BaseAdapter`.
2. Register it in `backend/src/database/adapter.factory.ts`.
3. Add the new type to `shared/src/connection.dto.ts` (`DbType`).
