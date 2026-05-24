'use strict';

// Standalone Event-mode lambda-node example + e2e test.
//
// 4 cases = {/echo, /notify} x {full, bundle}, all api (envelope) mode. Each
// package is built into a libnode_<name>.zip, uploaded to LocalStack S3,
// downloaded + loaded by dynamic-node, and invoked through the lambda-node Event
// engine (fire-and-forget). Because event returns no response, each invocation's
// effect is verified via a marker file the loaded package appends to.
// Fully self-contained; shares no code.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const AdmZip = require('adm-zip');
const { S3Client, CreateBucketCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const lambda = require('@aura-studio/lambda-node');

const CONTAINER = 'lambda-node-app-event';
const IMAGE = process.env.LOCALSTACK_IMAGE || 'localstack/localstack:3';
const PORT = Number(process.env.LOCALSTACK_PORT || 14569);
const ENDPOINT = `http://127.0.0.1:${PORT}`;
const REGION = 'us-east-1';
const CREDS = { accessKeyId: 'test', secretAccessKey: 'test' };
const BUCKET = 'lambda-node-app-event';
const NAMESPACE = 'app';
const VERSION = 'v1';
const OS = 'linux';
const ARCH = 'amd64';
const COMPILER = 'node';

const WAREHOUSE = path.join(__dirname, '.tmp', 'warehouse');
const TMP = path.join(__dirname, '.tmp');
const PKG_DIR = path.join(__dirname, 'packages');

const PACKAGES = {
  'app-full': { variant: 'full', file: 'index' },
  'app-bundle': { variant: 'bundle', file: 'bundle' },
};

// ---- LocalStack lifecycle (inline) ----
function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function ensureDocker() {
  try { docker(['ps']); } catch (e) { throw new Error(`Docker not available/running: ${e.message.split('\n')[0]}`); }
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
  console.log(`[event] starting LocalStack ${IMAGE} on ${ENDPOINT}`);
  docker(['run', '-d', '--rm', '--name', CONTAINER, '-p', `${PORT}:4566`,
    '-e', 'SERVICES=s3', '-e', 'EAGER_SERVICE_LOADING=1', IMAGE]);
  await waitHealthy();
}
function stopLocalStack() {
  try { docker(['rm', '-f', CONTAINER]); console.log('[event] LocalStack stopped'); } catch (_) {}
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

// ---- AWS / build / upload ----
function applyAwsEnv() {
  process.env.AWS_ENDPOINT_URL = ENDPOINT;
  process.env.AWS_ENDPOINT_URL_S3 = ENDPOINT;
  process.env.AWS_REGION = REGION;
  process.env.AWS_ACCESS_KEY_ID = CREDS.accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = CREDS.secretAccessKey;
  process.env.AWS_S3_FORCE_PATH_STYLE = 'true';
}
function s3() { return new S3Client({ endpoint: ENDPOINT, region: REGION, forcePathStyle: true, credentials: CREDS }); }
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
    console.log(`[event] uploaded s3://${BUCKET}/${key} (${body.length} bytes)`);
  }
}

// ---- engine per variant ----
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
const enc = (obj) => lambda.protocol.encodePayload(JSON.stringify(obj));
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function runCase(variant, route) {
  const pkg = `app-${variant}`;
  const marker = path.join(TMP, `marker-${variant}-${route.slice(1)}-${Date.now()}.txt`);
  const engine = new lambda.event.Engine([], dynamicOptions(variant));
  const response = await engine.invoke({
    path: `/api/${pkg}/v1${route}`,
    payload: enc({ name: 'app', markerFile: marker }),
  });
  assert.equal(response, null, 'event returns null');
  const content = fs.readFileSync(marker, 'utf8').trim();
  console.log(`[event] ${route}+${variant} marker: ${content}`);
  assert.equal(content, `${route}:app:${variant}`);
  fs.rmSync(marker, { force: true });
  console.log(`[event] CASE ${route.slice(1)}+${variant} PASS`);
}

async function main() {
  fs.rmSync(WAREHOUSE, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  await startLocalStack();
  applyAwsEnv();
  await ensureBucket();
  await uploadAll();

  for (const variant of ['full', 'bundle']) {
    await runCase(variant, '/echo');
    await runCase(variant, '/notify');
  }

  console.log('\n[event] all 4 cases passed: echo+full, notify+full, echo+bundle, notify+bundle');
}

const keepUp = process.argv.includes('--keep-up');
main()
  .then(() => { if (!keepUp) stopLocalStack(); })
  .catch((err) => {
    console.error('[event] FAILED:', err && err.stack ? err.stack : err);
    if (!keepUp) stopLocalStack();
    process.exitCode = 1;
  });
