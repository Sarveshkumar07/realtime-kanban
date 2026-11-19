# Livewall: Real-Time Collaborative Kanban Board

A multi-organization, multi-tenant Kanban board. Teams in different organizations and branches share live boards with strict data isolation, role-based access and instant synchronization.


## Demo accounts

All passwords are `password123`.

| Email | Role | Can see |
|---|---|---|
| alice@acme.com | Org admin (Acme Corp) | every Acme branch |
| bob@acme.com | Branch admin | Mumbai Branch |
| carol@acme.com | Member | Mumbai Branch |
| dave@acme.com | Member | Delhi Branch |
| eve@globex.com | Org admin (Globex Inc) | only Globex HQ |

**Try it:** sign in as bob in one window and carol in a private window. Drag cards, edit a task, and watch the board, presence avatars and activity log update live. Sign in as eve to confirm Acme's data is invisible to another organization.

## Features

- Organization selector and branch (tenant) switcher
- CRUD for organizations, tenants, boards, columns and tasks
- Role-based access: Org Admin, Branch (Tenant) Admin, Member
- Drag-and-drop Kanban board and a task detail panel
- Real-time sync over WebSockets (Socket.IO), one room per tenant
- Presence indicators per tenant
- Optimistic UI with automatic rollback on failure
- Undo / redo for tasks (buttons and Ctrl/Cmd+Z)
- Activity log per tenant, streamed live
- Conflict resolution for concurrent edits and drag-and-drop
- Network recovery: auto-reconnect, re-join the tenant room, re-fetch the board

## Tech stack

MongoDB (Mongoose) · Express · React (Vite) · Node.js · Socket.IO · JWT

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173.

With no configuration, the backend starts an in-memory MongoDB and loads the demo data on every start. The first run downloads a MongoDB binary, so it takes a minute. Data resets on restart.

To use a persistent database, copy `backend/.env.example` to `backend/.env` and set `MONGO_URI`.

## Environment variables

| Variable | Where | Required | Description |
|---|---|---|---|
| `MONGO_URI` | backend | production | MongoDB connection string (Atlas). Empty in development means in-memory DB. |
| `JWT_SECRET` | backend | production | Long random string used to sign login tokens. |
| `CLIENT_URL` | backend | production | Allowed frontend origin(s), comma separated. Example: `https://my-app.vercel.app` |
| `PORT` | backend | no | Defaults to 4000. Render sets it automatically. |
| `SEED` | backend | no | `true` wipes the database and loads demo data on start. Use once, then remove. |
| `VITE_API_URL` | frontend | production | Public URL of the backend, no trailing slash. |

## Deployment

The backend needs long-lived WebSocket connections, which Vercel's serverless functions cannot hold. So the app deploys in three parts, all with free tiers.

1. **MongoDB Atlas:** create an M0 cluster, add a database user, allow `0.0.0.0/0` under Network Access, and copy the connection string with `/livewall` as the database name.
2. **Render (backend):** New Web Service from this repo. Root Directory `backend`, build `npm install`, start `npm start`. Set `MONGO_URI`, `JWT_SECRET`, `NODE_VERSION=20`, `CLIENT_URL`, and `SEED=true` for the first start only.
3. **Vercel (frontend):** import this repo. Root Directory `frontend`. Set `VITE_API_URL` to the Render URL.

Then set `CLIENT_URL` on Render to the Vercel URL and delete `SEED`.

## Project structure

```
.
├── package.json              single `npm install` / `npm run dev` for both apps
├── backend/
│   └── src/
│       ├── server.js         HTTP + Socket.IO bootstrap
│       ├── app.js            Express app and route mounting
│       ├── realtime.js       socket auth, tenant rooms, presence
│       ├── models/           Mongoose schemas (8 collections)
│       ├── middleware/       JWT auth, tenant scoping, role checks
│       ├── lib/              access rules, ordering, activity log, provisioning
│       ├── routes/           auth, orgs, tenants, boards/columns, tasks
│       └── seed.js           demo data
├── frontend/
│   └── src/
│       ├── hooks/useBoard.js board state, optimistic updates, sockets, undo/redo
│       └── components/       Workspace, BoardView, Board, TaskPanel, ActivityPanel, AdminPanel
└── docs/
    ├── API.md                REST + WebSocket reference
    └── ER-DIAGRAM.md         database schema (Mermaid)
```

## Architecture

```
React (Vite) ── HTTP /api ──▶ Express routes ──▶ Mongoose ──▶ MongoDB
     │                              │
     └──── Socket.IO rooms ◀────────┘   emitToTenant(tenantId, event, payload)
```

- **Routes** are a thin HTTP layer. **Middleware** handles authentication and tenant scoping. **lib/** holds the business rules.
- `realtime.js` is the only module that knows about Socket.IO.
- On the frontend, `useBoard.js` owns all board state; components only render.

See [docs/API.md](docs/API.md) for every endpoint and WebSocket event, and [docs/ER-DIAGRAM.md](docs/ER-DIAGRAM.md) for the schema and indexes.

## Tenancy model

Organization → Tenants (branches) → Boards → Columns → Tasks.

Users connect to this hierarchy through **memberships**: `{ userId, orgId, tenantId, role }`.

- `tenantId = null` with `org_admin`: access to every tenant in that organization.
- `tenantId = X` with `tenant_admin` or `member`: access to tenant X only.

**Isolation is structural, not a convention:**

1. All business routes live under `/api/tenants/:tenantId/...`. One middleware resolves the caller's membership for that tenant. No membership returns **404** (not 403), so tenant ids cannot be probed.
2. Boards, columns, tasks and activity logs all store `tenantId`, and every query includes it. An id from another tenant simply does not exist.
3. Ids sent in request bodies (column, assignee, neighbour ids) are validated against the same tenant. Assigning someone who is not in the tenant is rejected.
4. WebSockets require a valid JWT, and `tenant:join` re-checks membership. Events are only emitted to the `tenant:<id>` room. Removing a member kicks their live sockets.
5. Cross-organization isolation follows from the same rules, because tenants are only reachable through memberships of their organization.

| Action | Member | Branch admin | Org admin |
|---|:-:|:-:|:-:|
| View boards, create/edit/move/delete tasks | yes | yes | yes |
| Create/rename/delete boards and columns | | yes | yes |
| Add/remove branch members | | yes | yes |
| Create/delete branches, add org admins, delete org | | | yes |

## Concurrency and conflict resolution

1. **Task ordering uses fractional indexing.** Each task has a numeric `position`. A move sends its neighbours (`afterId` / `beforeId`), never an index, and the server computes the midpoint. One move updates one document. If two people drop into the same gap, both land. If a neighbour was deleted meanwhile, the task lands next to the other neighbour or at the end. If gaps get too small, the column is renumbered once and clients are told to re-sync.
2. **Edits use field-level optimistic concurrency.** The client sends `changes` and `base` (the values it saw). The server compares `base` only for the fields being changed:
   - Two people editing different fields: both edits are merged.
   - Same field changed in between: the server returns **409** with the latest task, the client shows the server copy and tells the user.
   - The write is guarded by the current values, so two simultaneous requests cannot both win.
3. **`version`** increments on every change; clients ignore stale socket events.
4. **Soft delete** gives a clean 404 for edits to deleted tasks and makes undo possible.

## Frontend behavior

- **Optimistic UI:** create, edit, move and delete apply instantly and roll back with a message if the server rejects them.
- **Undo / redo:** covers create, edit, move and delete. Undoing an edit uses the same conflict check, so it cannot silently overwrite a teammate.
- **Network recovery:** the socket reconnects automatically, an offline banner is shown, then the client re-joins the tenant room and re-fetches the board. Changes made while offline are rejected rather than queued.
- **Touch devices** have no HTML5 drag-and-drop, so the task panel has a Column selector as an alternative.

## Trade-offs and future work

- **Single server process.** Presence and rooms are in memory. To scale horizontally, add the Socket.IO Redis adapter and keep presence in Redis.
- **No offline write queue.** Simpler and predictable, but edits made offline are rejected.
- **Column drag-and-drop** is supported by the API but not exposed in the UI. Undo covers tasks, not columns.
- **Invites** work for already-registered users only (no email sending).
- **No automated tests yet.** The first candidates are `lib/ordering.js` and the task update merge rules.
- **JWT in localStorage** for simplicity; httpOnly cookies would be stricter.
- **Free-tier hosting:** the backend sleeps when idle, so the first request is slow.
