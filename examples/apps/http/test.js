'use strict';

// Standalone HTTP-mode lambda-node example + e2e test.
//
// 4 cases = {api, wapi} x {full, bundle}. Each package is built into a
// libnode_<name>.zip, uploaded to LocalStack S3, then downloaded + loaded by
// dynamic-node at runtime and invoked through lambda-node's HTTP engine
// (/api for envelope packages, /wapi for native-handler packages).
//
// Fully self-contained: this file owns its LocalStack lifecycle and AWS calls
// and shares no code with the other example projects.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');

const AdmZip = require('adm-zip');
const { S3Client, CreateBucketCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const lambda = require('@aura-studio/lambda-node');

// --------------------------------------------------------------------------
// Config
// --------------------------------------------------------------------------
const CONTAINER = 'lambda-node-app-http';
const IMAGE = process.env.LOCALSTACK_IMAGE || 'localstack/localstack:3';
const PORT = Number(process.env.LOCALSTACK_PORT || 14566);
const ENDPOINT = `http://127.0.0.1:${PORT}`;
const REGION = 'us-east-1';
const CREDS = { accessKeyId: 'test', secretAccessKey: 'test' };
const BUCKET = 'lambda-node-app-http';
const NAMESPACE = 'app';
const VERSION = 'v1';
const OS = 'linux';
const ARCH = 'amd64';
const COMPILER = 'node';

const WAREHOUSE = path.join(__dirname, '.tmp', 'warehouse');
const PKG_DIR = path.join(__dirname, 'packages');

// case definition: name -> { variant, file(entry), mode }
const PACKAGES = {
  'api-full': { variant: 'full', file: 'index', mode: 'api' },
  'wapi-full': { variant: 'full', file: 'index', mode: 'wapi' },
  'api-bundle': { variant: 'bundle', file: 'bundle', mode: 'api' },
  'wapi-bundle': { variant: 'bundle', file: 'bundle', mode: 'wapi' },
};

// --------------------------------------------------------------------------
// LocalStack lifecycle (inline)
// --------------------------------------------------------------------------
function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function ensureDocker() {
  try { docker(['ps']); } catch (e) {
    throw new Error(`Docker is not available/running: ${e.message.split('\n')[0]}`);
  }
}
function isRunning() {
  try {
    return docker(['ps', '--filter', `name=^/${CONTAINER}$`, '--filter', 'status=running', '--format', '{{.Names}}'])
      .split('\n').map((s) => s.trim()).includes(CONTAINER);
  } catch (_) { return false; }
}
async function startLocalStack() {
  ensureDocker();
  if (isRunning()) { await waitHealthy(); return; }
  try { docker(['rm', '-f', CONTAINER]); } catch (_) {}
  console.log(`[http] starting LocalStack ${IMAGE} on ${ENDPOINT}`);
  docker(['run', '-d', '--rm', '--name', CONTAINER, '-p', `${PORT}:4566`,
    '-e', 'SERVICES=s3', '-e', 'EAGER_SERVICE_LOADING=1', IMAGE]);
  await waitHealthy();
}
function stopLocalStack() {
  try { docker(['rm', '-f', CONTAINER]); console.log('[http] LocalStack stopped'); } catch (_) {}
}
async function waitHealthy(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${ENDPOINT}/_localstack/health`);
      if (r.ok) { const b = await r.json(); if (b.services && b.services.s3) return; last = JSON.stringify(b.services); }
    } catch (e) { last = e.message; }
    await delay(1000);
  }
  throw new Error(`LocalStack not healthy in ${timeoutMs}ms (${last})`);
}

// --------------------------------------------------------------------------
// AWS / build / upload
// --------------------------------------------------------------------------
function applyAwsEnv() {
  process.env.AWS_ENDPOINT_URL = ENDPOINT;
  process.env.AWS_ENDPOINT_URL_S3 = ENDPOINT;
  process.env.AWS_REGION = REGION;
  process.env.AWS_ACCESS_KEY_ID = CREDS.accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = CREDS.secretAccessKey;
  process.env.AWS_S3_FORCE_PATH_STYLE = 'true';
}
function s3() {
  return new S3Client({ endpoint: ENDPOINT, region: REGION, forcePathStyle: true, credentials: CREDS });
}
async function ensureBucket() {
  try { await s3().send(new CreateBucketCommand({ Bucket: BUCKET })); }
  catch (e) { if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(e.name)) throw e; }
}
function toolchainStr(variant) { return `${OS}_${ARCH}_${COMPILER}_${variant}`; }
function dynName(name) { return `${NAMESPACE}_${name}_${VERSION}`; }
function buildZip(name) {
  const spec = PACKAGES[name];
  const dir = path.join(PKG_DIR, name);
  const zip = new AdmZip();
  if (spec.file === 'bundle') {
    zip.addLocalFile(path.join(dir, 'bundle.js'));
  } else {
    zip.addLocalFile(path.join(dir, 'index.js'));
    zip.addLocalFile(path.join(dir, 'package.json'));
  }
  return zip.toBuffer();
}
async function uploadAll() {
  const client = s3();
  for (const name of Object.keys(PACKAGES)) {
    const n = dynName(name);
    const key = `${toolchainStr(PACKAGES[name].variant)}/${n}/libnode_${n}.zip`;
    const body = buildZip(name);
    await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body }));
    console.log(`[http] uploaded s3://${BUCKET}/${key} (${body.length} bytes)`);
  }
}

// --------------------------------------------------------------------------
// lambda-node engine per variant
// --------------------------------------------------------------------------
function dynamicOptions(variant) {
  fs.mkdirSync(WAREHOUSE, { recursive: true });
  return [
    lambda.dynamic.withOs(OS),
    lambda.dynamic.withArch(ARCH),
    lambda.dynamic.withCompiler(COMPILER),
    lambda.dynamic.withVariant(variant),
    lambda.dynamic.withLocalWarehouse(WAREHOUSE),
    lambda.dynamic.withRemoteWarehouse(`s3://${BUCKET}`),
    lambda.dynamic.withPackageNamespace(NAMESPACE),
    lambda.dynamic.withPackageDefaultVersion(VERSION),
  ];
}
function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}
function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}
async function fetchText(url, opts) {
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`[http] ${r.status} ${url} -> ${text.slice(0, 120)}`);
  return { status: r.status, text };
}
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

// --------------------------------------------------------------------------
// Cases
// --------------------------------------------------------------------------
async function runVariant(variant) {
  const engine = new lambda.http.Engine([], dynamicOptions(variant));
  const server = http.createServer(engine.app);
  const baseUrl = await listen(server);
  try {
    // api case (envelope)
    const apiPkg = `api-${variant}`;
    const api = await fetchText(`${baseUrl}/api/${apiPkg}/v1/echo`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'app' }),
    });
    assert.equal(api.status, 200);
    assert.equal(JSON.parse(api.text).message, `hello app from http api (${variant})`);
    console.log(`[http] CASE api+${variant} PASS`);

    // wapi case (native handler)
    const wapiPkg = `wapi-${variant}`;
    const wapi = await fetchText(`${baseUrl}/wapi/${wapiPkg}/v1/hello?x=1`, {
      method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'wire-body',
    });
    assert.equal(wapi.status, 200);
    const wb = JSON.parse(wapi.text);
    assert.equal(wb.handler, `wapi-${variant}`);
    assert.equal(wb.url, '/hello?x=1');
    assert.equal(wb.body, 'wire-body');
    console.log(`[http] CASE wapi+${variant} PASS`);
  } finally {
    await closeServer(server);
  }
}

async function main() {
  fs.rmSync(WAREHOUSE, { recursive: true, force: true });
  await startLocalStack();
  applyAwsEnv();
  await ensureBucket();
  await uploadAll();

  await runVariant('full');    // cases: api+full, wapi+full
  await runVariant('bundle');  // cases: api+bundle, wapi+bundle

  console.log('\n[http] all 4 cases passed: api+full, wapi+full, api+bundle, wapi+bundle');
}

const keepUp = process.argv.includes('--keep-up');
main()
  .then(() => { if (!keepUp) stopLocalStack(); })
  .catch((err) => {
    console.error('[http] FAILED:', err && err.stack ? err.stack : err);
    if (!keepUp) stopLocalStack();
    process.exitCode = 1;
  });
