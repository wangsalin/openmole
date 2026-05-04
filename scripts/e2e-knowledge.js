const { PrismaClient } = require('@prisma/client');
const { spawn } = require('node:child_process');
const net = require('node:net');
const JSZip = require('jszip');

const prisma = new PrismaClient();
const createdTenantIds = new Set();

function xmlEscape(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapePdfText(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function makePdf(text) {
  const objects = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
  );
  objects.push(
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  );
  const stream = `BT\n/F1 16 Tf\n72 720 Td\n(${escapePdfText(text)}) Tj\nET`;
  objects.push(
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
  );

  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(output));
    output += object;
  }
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, 'binary');
}

async function makeDocx(text) {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  );
  zip.folder('_rels').file(
    '.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  zip.folder('word').file(
    'document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body><w:p><w:r><w:t>${xmlEscape(text)}</w:t></w:r></w:p><w:sectPr/></w:body>` +
      '</w:document>',
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

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

async function startServer(extraEnv = {}) {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  for (let index = 0; index < 60; index += 1) {
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
  if (child.exitCode === null) {
    child.kill('SIGKILL');
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  return {
    ok: response.ok,
    status: response.status,
    data,
    text,
  };
}

async function requestOk(baseUrl, method, path, body, headers = {}) {
  const result = await request(baseUrl, method, path, body, headers);
  if (!result.ok) {
    throw new Error(`${method} ${path} ${result.status}: ${result.text}`);
  }
  return result.data;
}

async function login(baseUrl) {
  const email = process.env.DEFAULT_SUPER_ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.DEFAULT_SUPER_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const session = await requestOk(baseUrl, 'POST', '/auth/login', { email, password });
  return { authorization: `Bearer ${session.accessToken}` };
}

async function defaultApp(baseUrl, auth) {
  const apps = await requestOk(baseUrl, 'GET', '/admin/v1/apps', null, auth);
  const app = apps.find((item) => item.appKey === 'default') ?? apps[0];
  if (!app) throw new Error('No app found. Run npm run prisma:seed first.');
  return app;
}

async function createTenant(baseUrl, auth, appId, name) {
  const result = await requestOk(
    baseUrl,
    'POST',
    '/admin/v1/tenants',
    { appId, name, status: 'active' },
    auth,
  );
  createdTenantIds.add(result.tenant.id);
  return result.tenant;
}

async function createApiKey(baseUrl, auth, appId, tenantId, name) {
  return requestOk(
    baseUrl,
    'POST',
    '/admin/v1/developer/api-keys',
    {
      appId,
      tenantId,
      name,
      scopes: ['rag:*', 'knowledge:query'],
    },
    auth,
  );
}

async function testParseSizeLimit() {
  const server = await startServer({ KNOWLEDGE_MAX_PARSE_BYTES: '20' });
  try {
    const auth = await login(server.baseUrl);
    const app = await defaultApp(server.baseUrl, auth);
    const marker = `limit-${Date.now()}`;
    const tenant = await createTenant(server.baseUrl, auth, app.id, `Limit Tenant ${marker}`);
    const knowledgeBase = await requestOk(
      server.baseUrl,
      'POST',
      '/admin/v1/knowledge-bases',
      { appId: app.id, tenantId: tenant.id, name: `Limit KB ${marker}` },
      auth,
    );
    const result = await request(
      server.baseUrl,
      'POST',
      `/admin/v1/knowledge-bases/${knowledgeBase.id}/files`,
      {
        fileName: 'too-large.txt',
        mimeType: 'text/plain',
        content: 'this inline content is intentionally longer than twenty bytes',
      },
      auth,
    );
    if (result.status !== 400 || !JSON.stringify(result.data).includes('maximum parse size')) {
      throw new Error(`Expected size limit 400, got ${result.status}: ${result.text}`);
    }
    return { name: 'parse size limit', status: result.status };
  } finally {
    await server.stop();
  }
}

async function addFileAndQuery(baseUrl, auth, input) {
  const knowledgeBase = await requestOk(
    baseUrl,
    'POST',
    '/admin/v1/knowledge-bases',
    {
      appId: input.app.id,
      tenantId: input.tenant.id,
      name: `${input.kind} KB ${input.marker}`,
    },
    auth,
  );
  const apiKey = await createApiKey(
    baseUrl,
    auth,
    input.app.id,
    input.tenant.id,
    `${input.kind} Key ${input.marker}`,
  );
  const added = await requestOk(
    baseUrl,
    'POST',
    `/admin/v1/knowledge-bases/${knowledgeBase.id}/files`,
    {
      bucket: 'inline',
      objectKey: input.objectKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    },
    auth,
  );

  let query = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    query = await requestOk(
      baseUrl,
      'POST',
      `/open/v1/knowledge-bases/${knowledgeBase.id}/query`,
      { query: input.expected, topK: 3 },
      { 'x-api-key': apiKey.apiKey },
    );
    if (query.sources?.some((source) => source.content.includes(input.expected))) {
      return {
        kind: input.kind,
        taskId: added.taskId,
        matchedContent: query.sources[0].content,
      };
    }
    await sleep(1000);
  }
  throw new Error(`${input.kind} content was not retrieved: ${JSON.stringify(query)}`);
}

async function testPdfAndDocxParsing() {
  const server = await startServer();
  try {
    const auth = await login(server.baseUrl);
    const app = await defaultApp(server.baseUrl, auth);
    const marker = `parse-${Date.now().toString(36)}`;
    const tenant = await createTenant(server.baseUrl, auth, app.id, `Parse Tenant ${marker}`);

    const pdfExpected = `PDF parser regression ${marker}`;
    const pdf = makePdf(pdfExpected);
    const pdfResult = await addFileAndQuery(server.baseUrl, auth, {
      kind: 'PDF',
      marker,
      app,
      tenant,
      expected: pdfExpected,
      objectKey: `data:application/pdf;base64,${pdf.toString('base64')}`,
      fileName: `${marker}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: pdf.length,
    });

    const docxExpected = `DOCX parser regression ${marker}`;
    const docx = await makeDocx(docxExpected);
    const docxResult = await addFileAndQuery(server.baseUrl, auth, {
      kind: 'DOCX',
      marker,
      app,
      tenant,
      expected: docxExpected,
      objectKey:
        'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' +
        docx.toString('base64'),
      fileName: `${marker}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: docx.length,
    });

    return { name: 'PDF/DOCX parse and RAG query', pdf: pdfResult, docx: docxResult };
  } finally {
    await server.stop();
  }
}

async function cleanup() {
  if (process.env.KNOWLEDGE_E2E_KEEP_DATA === 'true') return;
  const tenantIds = [...createdTenantIds];
  if (!tenantIds.length) return;

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
    prisma.webhook.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.ragQueryLog.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.knowledgeChunk.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.knowledgeFile.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.knowledgeBase.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.fileAsset.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.apiKey.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.task.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } }),
    prisma.roleMenu.deleteMany({ where: { roleId: { in: roleIds } } }),
    prisma.role.deleteMany({ where: { id: { in: roleIds } } }),
    prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }),
  ]);
}

async function main() {
  if (!require('node:fs').existsSync('dist/main.js')) {
    throw new Error('dist/main.js not found. Run npm run build first.');
  }

  const results = [];
  results.push(await testParseSizeLimit());
  results.push(await testPdfAndDocxParsing());
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main()
  .finally(cleanup)
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
