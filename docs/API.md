# API + WebSocket reference

Base URL: `/api` (dev: proxied by Vite to `http://localhost:4000`).
Send `Authorization: Bearer <token>` on everything except register/login.
Errors are `{ "error": "message" }`. Status codes: 400 validation, 401 not signed in, 403 role too low, 404 not found **or not yours**, 409 conflict.

## Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/register` | `{name,email,password}` | returns `{token,user}` |
| POST | `/auth/login` | `{email,password}` | returns `{token,user}` |
| GET | `/auth/me` | | `{user}` |

## Organizations
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/orgs` | any | orgs the user belongs to, each with `tenants[]` and the user's `role` |
| POST | `/orgs` | any | `{name, tenantName?}` creator becomes org admin; a first branch + board are created |
| PATCH | `/orgs/:orgId` | org admin | `{name}` |
| DELETE | `/orgs/:orgId` | org admin | deletes all branches and data |
| POST | `/orgs/:orgId/tenants` | org admin | `{name}` create branch (with starter board) |
| POST | `/orgs/:orgId/admins` | org admin | `{email}` |

## Tenant (branch) – everything below is `/tenants/:tenantId/...`
Access requires a membership; otherwise `404`.

| Method | Path | Min role | Notes |
|---|---|---|---|
| PATCH | `/tenants/:tenantId` | tenant admin | `{name}` |
| DELETE | `/tenants/:tenantId` | org admin | |
| GET | `/tenants/:tenantId/members` | member | branch members + org admins |
| POST | `/tenants/:tenantId/members` | tenant admin | `{email, role: member|tenant_admin}` |
| DELETE | `/tenants/:tenantId/members/:userId` | tenant admin | also kicks live sockets |
| GET | `/tenants/:tenantId/activity` | member | latest 100 log entries |

### Boards & columns
| Method | Path | Min role | Notes |
|---|---|---|---|
| GET | `…/boards` | member | |
| POST | `…/boards` | tenant admin | `{name}` creates To Do / In Progress / Done |
| GET | `…/boards/:boardId` | member | snapshot `{board, columns, tasks}` |
| PATCH | `…/boards/:boardId` | tenant admin | `{name}` |
| DELETE | `…/boards/:boardId` | tenant admin | |
| POST | `…/boards/:boardId/columns` | tenant admin | `{name, afterId?}` |
| PATCH | `…/columns/:columnId` | tenant admin | `{name}` |
| POST | `…/columns/:columnId/move` | tenant admin | `{afterId?, beforeId?}` |
| DELETE | `…/columns/:columnId` | tenant admin | deletes its tasks |

### Tasks (member+)
| Method | Path | Body |
|---|---|---|
| POST | `…/boards/:boardId/tasks` | `{columnId, title, description?, priority?, assigneeId?, dueDate?, afterId?, beforeId?}` (appends by default) |
| PATCH | `…/tasks/:taskId` | `{changes:{title?,description?,priority?,assigneeId?,dueDate?}, base:{<same keys>}}` |
| POST | `…/tasks/:taskId/move` | `{columnId, afterId?, beforeId?}` |
| DELETE | `…/tasks/:taskId` | soft delete |
| POST | `…/tasks/:taskId/restore` | undo of delete |

**Conflict response** (`PATCH`): `409 { error, code:"CONFLICT", fields:["title"], current:{…task} }`.
`base` holds the values the client saw before editing; only the fields in `changes` are compared.

Task shape: `{id, tenantId, boardId, columnId, title, description, priority, assigneeId, dueDate, position, version, createdAt, updatedAt}`.

## WebSocket (Socket.IO)

Connect with `io(url, { auth: { token } })`. Invalid token → `connect_error: unauthorized`.

**Client → server**

| Event | Args | Reply |
|---|---|---|
| `tenant:join` | `tenantId`, ack | ack `{ok:true, users:[{id,name,color}]}` or `{ok:false}`; the socket joins room `tenant:<id>` (only after a membership check) and leaves its previous tenant room |
| `tenant:leave` | | |

**Server → clients in the tenant room** (every payload also has `actorId`)

| Event | Payload |
|---|---|
| `task:created` `task:updated` `task:moved` `task:restored` | `{task}` (`task:moved` also `fromColumnId`) |
| `task:deleted` | `{id, columnId, boardId}` |
| `column:created` `column:updated` `column:moved` | `{column}` |
| `column:deleted` | `{id, boardId}` |
| `board:created` `board:updated` | `{board}` |
| `board:deleted` | `{id}` |
| `board:resync` | `{boardId}` – re-fetch the snapshot (after a renumbering) |
| `presence` | `{tenantId, users:[{id,name,color}]}` – a user with several tabs appears once |
| `activity` | activity log entry |
| `access:revoked` | `{tenantId}` – membership removed / tenant deleted |

Clients merge events idempotently (a task event with a lower `version` than the local copy is ignored), so receiving the echo of your own change is harmless. After a disconnect, the client re-joins and re-fetches the board.
