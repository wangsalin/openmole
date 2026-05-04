# Contributing to OpenMole

Thanks for your interest in OpenMole. This project is an open-source backend foundation for multi-tenant AI SaaS platforms.

## Development Setup

```bash
cp .env.example .env
npm install
npm run docker:up
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

Open Swagger docs at:

```text
http://localhost:3000/docs
```

## Before Sending Changes

Run the baseline checks:

```bash
npm run build
npx tsc --noEmit -p tsconfig.json
npm run lint
npm run test:payment
npm run test:knowledge
```

If a change touches only documentation, explain that runtime checks were not needed.

## Engineering Rules

- Keep tenant isolation explicit. Do not trust `tenantId` from request bodies for tenant-scoped writes.
- Add RBAC permissions and seed updates for new admin operations.
- Add audit coverage for sensitive writes.
- Store secrets only through environment references such as `secretRef: env:OPENAI_API_KEY`.
- Do not commit `.env`, real API keys, payment secrets, object storage secrets, or generated build output.
- Prefer focused changes over broad refactors.

## Pull Request Shape

A useful PR should include:

- What changed.
- Why it changed.
- Affected modules.
- Tests run.
- Any migration or seed impact.
- Screenshots for UI changes once the admin UI exists.

## Project Roadmap

See:

```text
docs/DEVELOPMENT_WORKFLOW.md
docs/PROJECT_OVERVIEW.md
```
