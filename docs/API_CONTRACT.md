# API Contract Draft

## Platform

```text
GET /health
```

`GET /health` returns dependency health for PostgreSQL, Redis, and MinIO. It
returns `200` when all checks are healthy and `503` when any dependency is
degraded.

Every HTTP response includes `x-request-id`. Clients can also pass
`x-request-id` or `x-correlation-id`; the backend will echo it as
`x-request-id`.

HTTP access logs are emitted as single-line JSON records with `requestId`,
`method`, `path`, `statusCode`, `durationMs`, `userId`, `appId`, and
`tenantId`. Mutation audit logs and auth/security audit events include the same
`requestId` in their JSON metadata so operators can correlate API responses,
logs, and audit records.

Cross-origin requests are controlled by `CORS_ORIGINS`. Leave it empty for
local development. In shared or production environments, set it to a
comma-separated allowlist, for example
`https://admin.example.com,https://tenant.example.com`.

Request body size is controlled by `BODY_LIMIT`, defaulting to `1mb`.
Oversized or malformed JSON requests return the same stable error envelope.

Baseline security headers are set on API responses:

```text
x-content-type-options: nosniff
x-frame-options: DENY
referrer-policy: no-referrer
cross-origin-opener-policy: same-origin
permissions-policy: camera=(), microphone=(), geolocation=()
```

High-risk public entry points have in-process rate limits:

```text
POST /auth/login                       10/minute per client
POST /open/v1/ai/chat                  60/minute per API key or client
POST /open/v1/ai/generate              60/minute per API key or client
POST /open/v1/rag/query                60/minute per API key or client
POST /open/v1/knowledge-bases/:id/query 60/minute per API key or client
POST /payment/webhook/:provider        120/minute per client
```

Error responses use a stable shape:

```json
{
  "requestId": "uuid",
  "code": "VALIDATION_FAILED",
  "message": "Validation failed",
  "details": ["field must be a string"],
  "statusCode": 400,
  "timestamp": "2026-05-04T00:00:00.000Z",
  "path": "/admin/v1/example"
}
```

## Auth

```text
POST /auth/login
GET  /auth/me
GET  /auth/contexts
GET  /auth/menus
POST /auth/switch-context
POST /auth/logout
POST /auth/change-password
```

## Admin API

```text
GET    /admin/v1/apps
POST   /admin/v1/apps
GET    /admin/v1/apps/:id
PATCH  /admin/v1/apps/:id
POST   /admin/v1/apps/:id/disable

GET    /admin/v1/tenants
POST   /admin/v1/tenants
GET    /admin/v1/tenants/:id
PATCH  /admin/v1/tenants/:id
POST   /admin/v1/tenants/:id/approve
POST   /admin/v1/tenants/:id/disable
GET    /admin/v1/tenants/:id/roles
POST   /admin/v1/tenants/:id/initialize-roles
GET    /admin/v1/tenants/:id/members
POST   /admin/v1/tenants/:id/members
PATCH  /admin/v1/tenants/:id/members/:membershipId
POST   /admin/v1/tenants/:id/members/:membershipId/disable

GET    /admin/v1/users
POST   /admin/v1/users
GET    /admin/v1/users/:id
PATCH  /admin/v1/users/:id

GET    /admin/v1/permission/roles
POST   /admin/v1/permission/roles
GET    /admin/v1/permission/permissions
POST   /admin/v1/permission/permissions
POST   /admin/v1/permission/roles/:id/permissions

GET    /admin/v1/features
POST   /admin/v1/features
GET    /admin/v1/plans
POST   /admin/v1/plans
GET    /admin/v1/plans/:id/features
POST   /admin/v1/plans/:id/features
GET    /admin/v1/subscriptions
POST   /admin/v1/subscriptions
POST   /admin/v1/subscriptions/open
GET    /admin/v1/orders

GET    /admin/v1/usage/ledger
POST   /admin/v1/usage/ledger
GET    /admin/v1/usage/quotas
POST   /admin/v1/usage/entitlements/check

GET    /admin/v1/ai/providers
POST   /admin/v1/ai/providers
POST   /admin/v1/ai/providers/:id/disable
GET    /admin/v1/ai/models
POST   /admin/v1/ai/models
POST   /admin/v1/ai/routes
GET    /admin/v1/ai/calls

GET    /admin/v1/prompts
POST   /admin/v1/prompts
GET    /admin/v1/prompts/:id/versions
POST   /admin/v1/prompts/:id/versions
POST   /admin/v1/prompts/:id/publish

GET    /admin/v1/knowledge-bases
POST   /admin/v1/knowledge-bases
POST   /admin/v1/knowledge-bases/:id/files
POST   /admin/v1/knowledge-bases/:id/rebuild-index

GET    /admin/v1/developer/api-keys
POST   /admin/v1/developer/api-keys
POST   /admin/v1/developer/api-keys/:id/disable
GET    /admin/v1/developer/webhooks
POST   /admin/v1/developer/webhooks
GET    /admin/v1/developer/webhooks/:id/deliveries
POST   /admin/v1/developer/webhooks/:id/deliveries/:deliveryId/retry

GET    /admin/v1/tasks
POST   /admin/v1/tasks
GET    /admin/v1/audit-logs
GET    /admin/v1/system/settings
POST   /admin/v1/system/settings
GET    /admin/v1/system/dict-items
POST   /admin/v1/system/dict-items
GET    /admin/v1/dashboard/summary
```

`GET /admin/v1/audit-logs` supports:

```text
appId
tenantId
userId
action
resource
from
to
page
pageSize
```

For tenant-scoped admin data, `appId` and `tenantId` query parameters are
authoritative only for platform users. Tenant users are always scoped to their
current authenticated context, even when they submit another tenant in the
query. This applies to billing orders/subscriptions, usage ledgers/quotas,
developer API keys/webhooks, knowledge bases, AI call logs, audit logs, tasks,
dashboard summary, settings, and role lists.
Write endpoints follow the same rule: tenant users cannot choose another
tenant in request bodies or path parameters. Tenant-scoped creates derive scope
from the authenticated context, and updates/disables/retries verify that the
target resource belongs to the current tenant before mutating it.

`POST /admin/v1/tenants` supports optional owner bootstrapping:

```json
{
  "appId": "app_id",
  "name": "Demo Tenant",
  "status": "active",
  "initializeRoles": true,
  "owner": {
    "email": "owner@example.com",
    "displayName": "Owner",
    "password": "ChangeMe123!"
  }
}
```

`POST /admin/v1/subscriptions/open` activates a tenant subscription and creates
quota buckets for metered plan features:

```json
{
  "tenantId": "tenant_id",
  "planId": "plan_id",
  "months": 1
}
```

`POST /admin/v1/usage/entitlements/check` verifies the active subscription,
feature enablement, and current quota bucket:

```json
{
  "tenantId": "tenant_id",
  "featureKey": "ai_text_generate",
  "metric": "count",
  "quantity": 1
}
```

## Tenant API

```text
POST /tenant/v1/orders
GET  /tenant/v1/orders/:id
POST /tenant/v1/orders/:id/pay
POST /payment/webhook/:provider
```

`POST /tenant/v1/orders` uses the authenticated tenant context for `appId` and
`tenantId`; callers must not submit another tenant or arbitrary amount. The
request body is:

```json
{
  "planId": "plan_id",
  "currency": "CNY"
}
```

The order amount is derived from the selected plan. `GET
/tenant/v1/orders/:id` and `POST /tenant/v1/orders/:id/pay` only allow access
to orders in the current tenant context; cross-tenant access returns `403`.

`POST /payment/webhook/:provider` accepts provider callbacks with:

```json
{
  "orderNo": "ORD...",
  "providerTradeNo": "trade_123",
  "status": "succeeded",
  "amount": 99.0,
  "months": 1
}
```

When `PAYMENT_WEBHOOK_SECRET` or `PAYMENT_<PROVIDER>_WEBHOOK_SECRET` is set,
the callback must include `x-payment-signature`. The signature is HMAC-SHA256
over `provider:orderNo:providerTradeNo:status:amount`, with amount formatted to
two decimals, optionally prefixed by `sha256=`.

Successful payment callbacks mark the order as `paid`, create a
`payment_transactions` row, and, when the order has `planId`, open the
subscription and create quota buckets. Repeated callbacks for the same
`providerTradeNo` and final status are idempotent.

## Open API

```text
POST /open/v1/ai/chat
POST /open/v1/ai/generate
POST /open/v1/rag/query
POST /open/v1/knowledge-bases/:id/query
```

AI Open API authentication:

```text
x-api-key: sk_xxx
```

or:

```text
Authorization: Bearer sk_xxx
```

The API key must be tenant-bound. `POST /open/v1/ai/chat` and
`POST /open/v1/ai/generate` check the `ai_text_generate` entitlement, create an
`ai_call_logs` row, and write `usage_ledger` after a successful provider call.
The route must resolve through `AiModelRoute -> AiModel -> AiProvider`.
When `promptKey` is supplied, the runtime resolves the active tenant/app/global
prompt, loads the published version, renders `{{variable}}` placeholders from
`variables`, and injects it before calling the provider.

OpenAI-compatible provider setup:

```json
{
  "providerKey": "openai",
  "name": "OpenAI",
  "baseUrl": "https://api.openai.com/v1",
  "secretRef": "env:OPENAI_API_KEY"
}
```

Built-in test provider seed:

```text
npm run prisma:seed:ai
```

This creates:

```text
deepseek  -> routeKey deepseek-chat, secretRef env:DEEPSEEK_API_KEY
minimax   -> routeKey minimax-chat,  secretRef env:MINIMAX_API_KEY
```

AI admin permissions:

```text
ai.provider.read
ai.provider.create
ai.provider.update
ai.model.read
ai.model.create
ai.route.create
ai.call.read
ai.prompt.read
ai.prompt.create
ai.prompt.version.create
ai.prompt.publish
```

Developer API permissions:

```text
developer.api_key.read
developer.api_key.create
developer.api_key.disable
developer.webhook.read
developer.webhook.create
developer.webhook.delivery.read
developer.webhook.delivery.retry
```

API key scopes must be explicit and limited to:

```text
ai:*
ai:chat
ai:generate
rag:*
rag:query
knowledge:query
```

RAG query authentication uses the same API key headers. `rag:query`, `rag:*`, or
`knowledge:query` can query tenant knowledge chunks. `POST /open/v1/rag/query`
searches across the tenant's knowledge bases; `POST
/open/v1/knowledge-bases/:id/query` restricts retrieval to one knowledge base.
Retrieval uses `knowledge_chunks.embedding_vector` with pgvector cosine distance
when embeddings are available, and falls back to keyword matching otherwise.
Provider embeddings are resolved through AI routeKey `embedding` by default, or
`KNOWLEDGE_EMBEDDING_ROUTE_KEY` when set. The selected provider must expose an
OpenAI-compatible `/embeddings` endpoint.

Inline knowledge file ingestion accepts either `content` or `chunks`:

```json
{
  "fileName": "faq.txt",
  "content": "Long text to split into searchable chunks"
}
```

When `content`/`chunks` are omitted, a `knowledge.parse_file` queue job is
created. The current parser supports text from `metadata.content`,
`metadata.text`, `data:text/plain,...`, and HTTP-accessible text object URLs
including public MinIO-style URLs. It also supports PDF and DOCX files from data
URLs, HTTP URLs, or private MinIO/S3-compatible objects. Parsed files update
`knowledge_files` and the matching `tasks` row.
Private MinIO/S3-compatible objects are fetched with Signature V4 using
`MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_REGION`, `MINIO_ACCESS_KEY`,
`MINIO_SECRET_KEY`, and `MINIO_USE_SSL`. Legacy DOC files return explicit failed
task statuses until a dedicated parser is added.
Parser runtime limits are controlled by `KNOWLEDGE_MAX_PARSE_BYTES`,
`KNOWLEDGE_FETCH_TIMEOUT_MS`, and `KNOWLEDGE_PARSE_TIMEOUT_MS`. Worker retries
are controlled by `KNOWLEDGE_QUEUE_ATTEMPTS` and `KNOWLEDGE_QUEUE_BACKOFF_MS`.

Supported webhook events:

```text
subscription.opened
ai.call.succeeded
ai.call.failed
usage.quota.exceeded
api_key.disabled
```

Webhook delivery headers:

```text
x-webhook-id
x-webhook-delivery
x-webhook-event
x-webhook-timestamp
x-webhook-signature: sha256=<hmac>
```

Example body:

```json
{
  "routeKey": "chat",
  "messages": [
    {
      "role": "user",
      "content": "Hello"
    }
  ],
  "quantity": 1
}
```
