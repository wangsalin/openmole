# Security Policy

## Supported Versions

OpenMole is currently in alpha. Security fixes target the `main` branch until stable releases are introduced.

## Reporting a Vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub private vulnerability reporting if it is enabled for the repository. If it is not enabled yet, contact the repository owner and provide:

- A concise description of the issue.
- Affected endpoints or modules.
- Reproduction steps.
- Impact assessment.
- Any suggested mitigation.

## Secret Handling

Never commit:

- `.env`
- Real API keys
- Payment provider secrets
- JWT production secrets
- Object storage credentials
- Webhook secrets
- Private customer data

Use `.env.example` and environment references such as:

```text
secretRef: env:OPENAI_API_KEY
```

If a secret was accidentally exposed, rotate it immediately before opening a public issue or pull request.

## Security Design Priorities

OpenMole is a multi-tenant SaaS backend. Security-sensitive changes must preserve:

- Tenant data isolation
- RBAC checks
- API key hashing and scope checks
- Payment webhook signature validation
- Webhook signing
- Audit logging for sensitive mutations
- Bounded file parsing and queue retries

## Recommended Production Hardening

Before production use, add or verify:

- Strong `JWT_SECRET`
- HTTPS-only deployment
- CORS allowlist
- Rate limits for auth, Open API, file parsing, and payment callbacks
- Centralized logs with request IDs
- Database backups
- Queue failure monitoring
- AI cost anomaly alerts
