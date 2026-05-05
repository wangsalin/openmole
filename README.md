# OpenMole

OpenMole is an open-source backend foundation for multi-tenant AI SaaS
platforms. It provides reusable backend capabilities for auth, RBAC, tenant
isolation, billing, AI gateway, PromptOps, RAG, API keys, webhooks, usage
tracking, and audit logs.

> Status: alpha. The core backend loops are usable for development and
> evaluation, but production hardening is still in progress.

Project overview:

```text
docs/PROJECT_OVERVIEW.md
```

This repository is the backend implementation starter for the document
`通用型AI_SaaS管理端后端落地方案.md`.

## What It Is

OpenMole is not a generic admin template. It is a modular monolith backend for
building SaaS control planes and AI runtime gateways:

- Control plane: apps, tenants, users, roles, permissions, plans, AI routes,
  prompts, knowledge bases, settings, and audit logs.
- Runtime plane: Open API authentication, AI calls, RAG queries, quota checks,
  usage ledgers, and webhook delivery.
- Data plane: subscriptions, orders, payment transactions, AI call logs,
  knowledge chunks, vector search, tasks, and audit history.

## Key Features

- Multi-tenant app and tenant context.
- JWT auth, context switching, menu loading, RBAC permissions.
- Tenant-scoped data isolation for reads and writes.
- Apps, tenants, users, roles, permissions, settings, tasks, and audit logs.
- Billing primitives: features, plans, plan entitlements, orders,
  subscriptions, payment webhook verification, and quota buckets.
- Usage and entitlement checks for metered features.
- AI provider/model/route management with OpenAI-compatible calls.
- Prompt versioning, publishing, variable rendering, and runtime injection.
- Knowledge bases, PDF/DOCX parsing, pgvector indexing, and RAG query APIs.
- Developer API keys, scopes, signed webhooks, delivery logs, and retry.
- E2E scripts for payment/subscription and knowledge/RAG flows.

## Stack

- NestJS + TypeScript
- PostgreSQL + Prisma
- Redis + BullMQ
- MinIO-compatible object storage
- Modular monolith architecture

## Local Start

```bash
cp .env.example .env
npm install
npm run docker:up
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run test:knowledge
npm run test:payment
npm run start:dev
```

Admin web:

```bash
npm install
npm run admin:dev
```

The admin console is located in `apps/admin-web`. By default Vite proxies API
requests to `http://localhost:3000` in dev. Preview/production builds use
`VITE_API_BASE_URL`; without it, the built console tries `http://localhost:3000`
and then `http://localhost:3200`.

If Windows blocks npm cache or dependency scripts, use:

```bash
npm install --cache .npm-cache --ignore-scripts
npm run prisma:generate
```

If port `3000` is already used locally, run with another port:

```bash
set PORT=3200&& npm run start:dev
```

Then open:

```text
http://localhost:3200/docs
```

API docs are exposed at:

```text
http://localhost:3000/docs
```

Health check:

```text
GET http://localhost:3000/health
```

Every response includes `x-request-id`. Error responses use the stable shape
`requestId/code/message/details/statusCode/timestamp/path`, which makes UI
error handling and log correlation predictable.

HTTP access logs are emitted as single-line JSON and audit events include the
same `requestId` in metadata, so an API response can be traced through logs and
audit history.

Set `CORS_ORIGINS` to a comma-separated allowlist before exposing the API to a
shared environment. Leave it empty for local development.

`BODY_LIMIT` defaults to `1mb`. Login, Open API, RAG, and payment webhook
endpoints include baseline in-process rate limits, and API responses include
basic security headers.

Development flow and UI plan:

```text
docs/DEVELOPMENT_WORKFLOW.md
```

Open-source note: do not commit `.env`, real API keys, payment secrets, object
storage credentials, JWT production secrets, or webhook secrets. Use
`.env.example` and `secretRef: env:...` placeholders only.

Default seeded admin:

```text
admin@example.com
ChangeMe123!
```

Change these values in `.env` before running seed in a shared environment.

Auth endpoints include login, current user, context/menu loading, context
switching, logout, and password change:

```text
POST /auth/login
GET  /auth/me
GET  /auth/contexts
GET  /auth/menus
POST /auth/switch-context
POST /auth/logout
POST /auth/change-password
```

Useful first checks:

```bash
curl -X POST http://localhost:3200/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@example.com\",\"password\":\"ChangeMe123!\"}"

curl http://localhost:3200/auth/menus ^
  -H "Authorization: Bearer <accessToken>"
```

Tenant member management endpoints:

```text
GET   /admin/v1/tenants/:id/roles
POST  /admin/v1/tenants/:id/initialize-roles
GET   /admin/v1/tenants/:id/members
POST  /admin/v1/tenants/:id/members
PATCH /admin/v1/tenants/:id/members/:membershipId
POST  /admin/v1/tenants/:id/members/:membershipId/disable
```

Creating a tenant can also initialize roles and bind an owner in one request by
passing `initializeRoles` and `owner`.

Billing and usage endpoints now cover the first subscription loop:

```text
POST /admin/v1/features
POST /admin/v1/plans
POST /admin/v1/plans/:id/features
POST /admin/v1/subscriptions/open
POST /admin/v1/usage/entitlements/check
POST /admin/v1/usage/ledger
```

Opening a subscription updates the tenant plan status and creates quota buckets
for metered plan features. Recording usage increments the matching active quota
bucket, so entitlement checks can reject over-limit requests.
Payment callbacks are available at `POST /payment/webhook/:provider`. When
`PAYMENT_WEBHOOK_SECRET` or a provider-specific
`PAYMENT_<PROVIDER>_WEBHOOK_SECRET` is set, callbacks must include an
`x-payment-signature` HMAC. A successful callback marks the order paid, records
the payment transaction, and opens the plan subscription once; repeated final
callbacks are treated idempotently. Tenant order APIs derive `appId` and
`tenantId` from the logged-in tenant context; clients only submit the selected
plan and optional currency, while the amount is calculated from the plan price.
Run `npm run test:payment` after migrations and seed data are applied to verify
invalid signature rejection, paid-order state transition, automatic subscription
opening, quota creation, duplicate callback idempotency, and cross-tenant order
access rejection.

Open AI runtime endpoints are wired to API keys and quota accounting:

```text
POST /open/v1/ai/chat
POST /open/v1/ai/generate
```

Use a tenant-bound key from `POST /admin/v1/developer/api-keys` as `x-api-key`
or `Authorization: Bearer <apiKey>`. The runtime resolves `AiModelRoute` to an
OpenAI-compatible provider, calls `<baseUrl>/chat/completions`, writes
`ai_call_logs`, and records usage after success. Configure provider secrets with
an environment reference such as `secretRef: "env:OPENAI_API_KEY"`.

AI provider, model, route, and call-log admin endpoints are protected by RBAC
permissions. Route creation validates referenced models, and provider disable is
blocked while non-archived models still reference that provider.
Prompt admin endpoints are also RBAC-protected. Published prompt versions can be
used from Open AI calls via `promptKey`; the runtime renders `{{variable}}`
placeholders from the request `variables` before calling the provider.

Developer API key and webhook endpoints are also RBAC-protected. API keys must
be tenant-bound, use explicit scopes such as `ai:*` or `ai:chat`, and can be
disabled through `POST /admin/v1/developer/api-keys/:id/disable`.
Webhook delivery supports signed HTTP POSTs, persisted delivery attempts, and
manual retry through
`POST /admin/v1/developer/webhooks/:id/deliveries/:deliveryId/retry`.

DeepSeek and MiniMax OpenAI-compatible providers can be seeded without storing
secrets in the database:

```bash
set DEEPSEEK_API_KEY=...
set MINIMAX_API_KEY=...
npm run prisma:seed:ai
```

The seeded routes are `deepseek-chat` and `minimax-chat`; provider secrets are
referenced as `env:DEEPSEEK_API_KEY` and `env:MINIMAX_API_KEY`.

Knowledge bases now support an inline first-pass RAG flow. Add a knowledge file
with `content` or `chunks`, then query through `POST /open/v1/rag/query` or
`POST /open/v1/knowledge-bases/:id/query` using a tenant API key with
`rag:query`, `rag:*`, or `knowledge:query`. Chunks are embedded into a pgvector
`embedding_vector` column with a deterministic local embedding function for now;
this is enough to exercise vector retrieval and can be replaced by a provider
embedding model later. To use a provider, create an AI route with routeKey
`embedding` or set `KNOWLEDGE_EMBEDDING_ROUTE_KEY` to another route key; the
target model is called through the provider's OpenAI-compatible `/embeddings`
endpoint.
If a knowledge file is submitted without inline `content` or `chunks`, a
`knowledge.parse_file` worker job is queued. The first parser supports text from
`metadata.content`, `metadata.text`, `data:text/plain,...`, and HTTP-accessible
text/PDF object URLs; parsed chunks are embedded and indexed automatically.
Private MinIO/S3-compatible objects are read through Signature V4 using the
configured MinIO credentials. PDF files are parsed with `pdf-parse`; DOCX files
are parsed with `mammoth`; legacy DOC files are still detected but intentionally
fail with clear task errors until a dedicated parser is added.
Parsing is bounded by `KNOWLEDGE_MAX_PARSE_BYTES`,
`KNOWLEDGE_FETCH_TIMEOUT_MS`, and `KNOWLEDGE_PARSE_TIMEOUT_MS`. Queue retries
use `KNOWLEDGE_QUEUE_ATTEMPTS` with exponential backoff from
`KNOWLEDGE_QUEUE_BACKOFF_MS`.
Run `npm run test:knowledge` after migrations and seed data are applied to
exercise the parser size guard plus PDF/DOCX worker parsing and RAG retrieval.
The test creates temporary tenants and removes them by default; set
`KNOWLEDGE_E2E_KEEP_DATA=true` to keep the records for inspection.

Audit logs include write operations plus security events such as login success,
login failure, context switch success/failure, and permission denial.
Tenant-scoped admin endpoints now resolve data scope from the authenticated
context. Platform users can filter by `appId` and `tenantId`; tenant users have
those filters forced to their current app/tenant context across billing, usage,
developer, knowledge, AI call-log, audit, task, dashboard, settings, and role
list APIs. Tenant-scoped write endpoints use the same rule: request bodies
cannot select another tenant, and updates/disables/retries verify the target
resource before mutating it.

## First Development Scope

The project is intentionally structured as a modular monolith. The first
production-quality milestone should harden:

- login and JWT session
- app and tenant context
- RBAC permissions and data scope
- tenant isolation in every query
- audit logging for sensitive operations
- usage and entitlement checks

Payment, AI provider adapters, file parsing, embedding, and RAG are exposed as
stable module boundaries and can be completed provider by provider.
