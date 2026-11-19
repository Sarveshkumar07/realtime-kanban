# Database schema (MongoDB / Mongoose)

GitHub renders the diagram below.

```mermaid
erDiagram
  ORGANIZATIONS ||--o{ TENANTS : has
  ORGANIZATIONS ||--o{ MEMBERSHIPS : has
  TENANTS ||--o{ MEMBERSHIPS : "branch role"
  USERS ||--o{ MEMBERSHIPS : has
  TENANTS ||--o{ BOARDS : owns
  BOARDS ||--o{ COLUMNS : has
  COLUMNS ||--o{ TASKS : holds
  TENANTS ||--o{ ACTIVITY_LOGS : records
  USERS ||--o{ TASKS : "assigned to"

  ORGANIZATIONS {
    ObjectId _id PK
    string name
    ObjectId createdBy FK
  }
  TENANTS {
    ObjectId _id PK
    ObjectId orgId FK "indexed"
    string name
  }
  USERS {
    ObjectId _id PK
    string name
    string email UK
    string passwordHash
    string color
  }
  MEMBERSHIPS {
    ObjectId _id PK
    ObjectId userId FK
    ObjectId orgId FK
    ObjectId tenantId FK "null = organization-level"
    enum role "org_admin | tenant_admin | member"
  }
  BOARDS {
    ObjectId _id PK
    ObjectId tenantId FK "indexed"
    ObjectId orgId FK
    string name
  }
  COLUMNS {
    ObjectId _id PK
    ObjectId tenantId FK
    ObjectId boardId FK
    string name
    number position "fractional index"
  }
  TASKS {
    ObjectId _id PK
    ObjectId tenantId FK
    ObjectId boardId FK
    ObjectId columnId FK
    string title
    string description
    enum priority
    ObjectId assigneeId FK
    date dueDate
    number position "fractional index"
    number version "optimistic concurrency"
    date deletedAt "soft delete, enables undo"
  }
  ACTIVITY_LOGS {
    ObjectId _id PK
    ObjectId tenantId FK
    ObjectId orgId FK
    ObjectId userId FK
    string action
    string entityType
    string entityId
    string summary
    date createdAt
  }
```

## Indexes

| Collection | Index | Why |
|---|---|---|
| memberships | unique `(userId, orgId, tenantId)` | one role per user per scope |
| memberships | `(tenantId)` | list a tenant's people |
| boards | `(tenantId)` | list boards of a tenant |
| columns | `(tenantId, boardId, position)` | ordered columns |
| tasks | `(tenantId, columnId, position)` | ordered cards, neighbour lookups for moves |
| tasks | `(tenantId, boardId, deletedAt)` | board snapshot |
| activity_logs | `(tenantId, createdAt desc)` | newest-first feed |

## Isolation rule

`boards`, `columns`, `tasks` and `activity_logs` all carry `tenantId`, and no query is ever issued without it.
