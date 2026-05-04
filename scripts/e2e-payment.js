const { PrismaClient } = require('@prisma/client');
const { spawn } = require('node:child_process');
const nodeCrypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');

const prisma = new PrismaClient();
const createdTenantIds = new Set();
const createdPlanIds = new Set();
const createdUserEmails = new Set();

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(250);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer() {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      PAYMENT_WEBHOOK_SECRET: 'payment-e2e-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode}\n${output}`);
    }
    if (await canConnect(port)) {
      return {
        baseUrl: `http://127.0.0.1:${port}`,
        stop: () => stopServer(child),
      };
    }
    await sleep(500);
  }
  await stopServer(child);
  throw new Error(`Server did not start on port ${port}\n${output}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function request(baseUrl, method, path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: response.ok, status: response.status, data, text };
}

async function requestOk(baseUrl, method, path, body, headers = {}) {
  const result = await request(baseUrl, method, path, body, headers);
  if (!result.ok) {
    throw new Error(`${method} ${path} ${result.status}: ${result.text}`);
  }
  return result.data;
}

async function login(
  baseUrl,
  email = process.env.DEFAULT_SUPER_ADMIN_EMAIL ?? 'admin@example.com',
  password = process.env.DEFAULT_SUPER_ADMIN_PASSWORD ?? 'ChangeMe123!',
) {
  const session = await requestOk(baseUrl, 'POST', '/auth/login', { email, password });
  return { authorization: `Bearer ${session.accessToken}` };
}

function signature(provider, body, secret = 'payment-e2e-secret') {
  const payload = [
    provider,
    body.orderNo,
    body.providerTradeNo ?? '',
    body.status,
    Number(body.amount).toFixed(2),
  ].join(':');
  return nodeCrypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function cleanup() {
  if (process.env.PAYMENT_E2E_KEEP_DATA === 'true') return;
  const tenantIds = [...createdTenantIds];
  const planIds = [...createdPlanIds];
  const userEmails = [...createdUserEmails];
  const roles = await prisma.role.findMany({
    where: { tenantId: { in: tenantIds } },
    select: { id: true },
  });
  const roleIds = roles.map((role) => role.id);
  const webhooks = await prisma.webhook.findMany({
    where: { tenantId: { in: tenantIds } },
    select: { id: true },
  });
  const webhookIds = webhooks.map((webhook) => webhook.id);

  await prisma.$transaction([
    prisma.webhookDelivery.deleteMany({ where: { webhookId: { in: webhookIds } } }),
    prisma.webhook.deleteMany({ where: { id: { in: webhookIds } } }),
    prisma.paymentTransaction.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.order.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.usageLedger.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.quotaBucket.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.subscription.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.apiKey.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.user.deleteMany({ where: { email: { in: userEmails } } }),
    prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } }),
    prisma.roleMenu.deleteMany({ where: { roleId: { in: roleIds } } }),
    prisma.role.deleteMany({ where: { id: { in: roleIds } } }),
    prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }),
    prisma.planFeature.deleteMany({ where: { planId: { in: planIds } } }),
    prisma.plan.deleteMany({ where: { id: { in: planIds } } }),
  ]);
}

async function main() {
  if (!fs.existsSync('dist/main.js')) {
    throw new Error('dist/main.js not found. Run npm run build first.');
  }

  const server = await startServer();
  try {
    const auth = await login(server.baseUrl);
    const apps = await requestOk(server.baseUrl, 'GET', '/admin/v1/apps', null, auth);
    const app = apps.find((item) => item.appKey === 'default') ?? apps[0];
    if (!app) throw new Error('No app found. Run npm run prisma:seed first.');

    const marker = `payment-${Date.now().toString(36)}`;
    const ownerAPassword = 'ChangeMe123!';
    const ownerBPassword = 'ChangeMe123!';
    const ownerAEmail = `owner-a-${marker}@example.com`;
    const ownerBEmail = `owner-b-${marker}@example.com`;
    const tenantResult = await requestOk(
      server.baseUrl,
      'POST',
      '/admin/v1/tenants',
      {
        appId: app.id,
        name: `Payment Tenant ${marker}`,
        status: 'active',
        owner: {
          email: ownerAEmail,
          displayName: `Owner A ${marker}`,
          password: ownerAPassword,
        },
      },
      auth,
    );
    const tenant = tenantResult.tenant;
    createdTenantIds.add(tenant.id);
    createdUserEmails.add(ownerAEmail);

    const tenantBResult = await requestOk(
      server.baseUrl,
      'POST',
      '/admin/v1/tenants',
      {
        appId: app.id,
        name: `Payment Tenant B ${marker}`,
        status: 'active',
        owner: {
          email: ownerBEmail,
          displayName: `Owner B ${marker}`,
          password: ownerBPassword,
        },
      },
      auth,
    );
    const tenantB = tenantBResult.tenant;
    createdTenantIds.add(tenantB.id);
    createdUserEmails.add(ownerBEmail);

    const features = await requestOk(server.baseUrl, 'GET', '/admin/v1/features', null, auth);
    const aiFeature = features.find((feature) => feature.featureKey === 'ai_text_generate');
    if (!aiFeature) throw new Error('ai_text_generate feature not found');
    const plan = await requestOk(
      server.baseUrl,
      'POST',
      '/admin/v1/plans',
      {
        appId: app.id,
        name: `Payment Plan ${marker}`,
        priceMonthly: 19,
        priceYearly: 190,
      },
      auth,
    );
    createdPlanIds.add(plan.id);
    await requestOk(
      server.baseUrl,
      'POST',
      `/admin/v1/plans/${plan.id}/features`,
      {
        featureId: aiFeature.id,
        enabled: true,
        quotaType: 'count',
        quotaLimit: 25,
      },
      auth,
    );

    const ownerAAuth = await login(server.baseUrl, ownerAEmail, ownerAPassword);
    const ownerBAuth = await login(server.baseUrl, ownerBEmail, ownerBPassword);

    const order = await requestOk(
      server.baseUrl,
      'POST',
      '/tenant/v1/orders',
      { planId: plan.id, currency: 'CNY' },
      ownerAAuth,
    );

    const apiKey = await requestOk(
      server.baseUrl,
      'POST',
      '/admin/v1/developer/api-keys',
      {
        appId: app.id,
        tenantId: tenantB.id,
        name: `Scoped API Key ${marker}`,
        scopes: ['ai:chat'],
      },
      ownerAAuth,
    );
    if (apiKey.tenantId !== tenant.id) {
      throw new Error(`Tenant API key create used body tenantId: ${JSON.stringify(apiKey)}`);
    }

    const crossTenantDisableApiKey = await request(
      server.baseUrl,
      'POST',
      `/admin/v1/developer/api-keys/${apiKey.id}/disable`,
      {},
      ownerBAuth,
    );
    if (crossTenantDisableApiKey.status !== 403) {
      throw new Error(
        `Expected cross-tenant API key disable 403, got ${crossTenantDisableApiKey.status}`,
      );
    }

    const crossTenantRead = await request(
      server.baseUrl,
      'GET',
      `/tenant/v1/orders/${order.id}`,
      null,
      ownerBAuth,
    );
    if (crossTenantRead.status !== 403) {
      throw new Error(`Expected cross-tenant read 403, got ${crossTenantRead.status}`);
    }

    const crossTenantPay = await request(
      server.baseUrl,
      'POST',
      `/tenant/v1/orders/${order.id}/pay`,
      { provider: 'mockpay' },
      ownerBAuth,
    );
    if (crossTenantPay.status !== 403) {
      throw new Error(`Expected cross-tenant pay 403, got ${crossTenantPay.status}`);
    }

    const crossTenantAdminOrders = await requestOk(
      server.baseUrl,
      'GET',
      `/admin/v1/orders?tenantId=${tenant.id}`,
      null,
      ownerBAuth,
    );
    if (crossTenantAdminOrders.some((item) => item.id === order.id)) {
      throw new Error('Cross-tenant admin order list leaked another tenant order');
    }

    const ownerAAdminOrders = await requestOk(
      server.baseUrl,
      'GET',
      `/admin/v1/orders?tenantId=${tenantB.id}`,
      null,
      ownerAAuth,
    );
    if (
      ownerAAdminOrders.length &&
      ownerAAdminOrders.some((item) => item.tenantId !== tenant.id)
    ) {
      throw new Error('Tenant admin order list used query tenantId outside context');
    }

    await requestOk(
      server.baseUrl,
      'POST',
      `/tenant/v1/orders/${order.id}/pay`,
      { provider: 'mockpay' },
      ownerAAuth,
    );

    const badSignatureBody = {
      orderNo: order.orderNo,
      providerTradeNo: `trade-bad-${marker}`,
      status: 'succeeded',
      amount: 19,
      months: 1,
    };
    const rejected = await request(
      server.baseUrl,
      'POST',
      '/payment/webhook/mockpay',
      badSignatureBody,
      { 'x-payment-signature': 'bad' },
    );
    if (rejected.status !== 403) {
      throw new Error(`Expected invalid signature 403, got ${rejected.status}`);
    }

    const webhookBody = {
      orderNo: order.orderNo,
      providerTradeNo: `trade-${marker}`,
      status: 'succeeded',
      amount: 19,
      months: 1,
    };
    const paid = await requestOk(
      server.baseUrl,
      'POST',
      '/payment/webhook/mockpay',
      webhookBody,
      { 'x-payment-signature': signature('mockpay', webhookBody) },
    );
    if (paid.order.status !== 'paid' || !paid.subscription?.subscription?.id) {
      throw new Error(`Payment did not open subscription: ${JSON.stringify(paid)}`);
    }

    const crossTenantAdminSubscriptions = await requestOk(
      server.baseUrl,
      'GET',
      `/admin/v1/subscriptions?tenantId=${tenant.id}`,
      null,
      ownerBAuth,
    );
    if (
      crossTenantAdminSubscriptions.some(
        (item) => item.id === paid.subscription.subscription.id,
      )
    ) {
      throw new Error('Cross-tenant admin subscription list leaked another tenant subscription');
    }

    const duplicate = await requestOk(
      server.baseUrl,
      'POST',
      '/payment/webhook/mockpay',
      webhookBody,
      { 'x-payment-signature': signature('mockpay', webhookBody) },
    );
    if (!duplicate.idempotent) {
      throw new Error(`Duplicate webhook was not idempotent: ${JSON.stringify(duplicate)}`);
    }

    const [subscriptions, quotas, transactions] = await Promise.all([
      prisma.subscription.count({ where: { tenantId: tenant.id, status: 'active' } }),
      prisma.quotaBucket.count({
        where: {
          tenantId: tenant.id,
          featureKey: 'ai_text_generate',
          limit: 25,
        },
      }),
      prisma.paymentTransaction.count({
        where: { tenantId: tenant.id, providerTradeNo: webhookBody.providerTradeNo },
      }),
    ]);
    if (subscriptions !== 1 || quotas !== 1 || transactions !== 1) {
      throw new Error(
        `Unexpected persisted state: ${JSON.stringify({ subscriptions, quotas, transactions })}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          orderId: order.id,
          subscriptionId: paid.subscription.subscription.id,
          duplicateIdempotent: duplicate.idempotent,
          invalidSignatureStatus: rejected.status,
          crossTenantReadStatus: crossTenantRead.status,
          crossTenantPayStatus: crossTenantPay.status,
          crossTenantAdminOrders: crossTenantAdminOrders.length,
          crossTenantAdminSubscriptions: crossTenantAdminSubscriptions.length,
          crossTenantDisableApiKeyStatus: crossTenantDisableApiKey.status,
        },
        null,
        2,
      ),
    );
  } finally {
    await server.stop();
  }
}

main()
  .finally(cleanup)
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
