## Summary

What changed?

## Motivation

Why is this change needed?

## Affected Areas

- [ ] Auth / RBAC
- [ ] Tenant isolation
- [ ] Billing / Usage
- [ ] AI Gateway / PromptOps
- [ ] Knowledge / RAG
- [ ] Developer API / Webhook
- [ ] UI
- [ ] Operations / Docs

## Testing

- [ ] `npm run build`
- [ ] `npx tsc --noEmit -p tsconfig.json`
- [ ] `npm run lint`
- [ ] `npm run test:payment`
- [ ] `npm run test:knowledge`

If any check was not run, explain why.

## Security Checklist

- [ ] No secrets, tokens, API keys, or customer data are committed.
- [ ] Tenant-scoped reads/writes preserve tenant isolation.
- [ ] New admin endpoints have RBAC permissions.
- [ ] Sensitive writes are auditable.
- [ ] API keys and provider secrets are referenced through environment variables.
