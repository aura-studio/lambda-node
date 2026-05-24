'use strict';

// Standalone ReqResp-mode lambda-node example + e2e test.
//
// 4 cases = {/echo, /sum} x {full, bundle}, all api (envelope) mode (reqresp has
// no wapi route). Each package is built into a libnode_<name>.zip, uploaded to
// LocalStack S3, downloaded + loaded by dynamic-node, and invoked through the
// lambda-node ReqResp engine. Fully self-contained; shares no code.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const AdmZip = require('adm-zip');
const { S3Client, CreateBucketCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const lambda = require('@aura-studio/lambda-node');

const CONTAINER = 'lambda-node-app-reqresp';
const IMAGE = process.env.LOCALSTACK_IMAGE || 'localstack/localstack:3';
const PORT = Number(process.env.LOCALSTACK_PORT || 14567);
const ENDPOINT = `http://127.0.0.1:${PORT}`;
const REGION = 'us-east-1';
const CREDS = { accessKeyId: 'test', secretAccessKey: 'test' };
const BUCKET = 'lambda-node-app-reqresp';
const NAMESPACE = 'app';
const VERSION = 'v1';
const OS = 'linux';
const ARCH = 'amd64';
const COMPILER = 'node';

const WAREHOUSE = path.join(__dirname, '.tmp', 'warehouse');
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
  console.log(`[reqresp] starting LocalStack ${IMAGE} on ${ENDPOINT}`);
  docker(['run', '-d', '--rm', '--name', CONTAINER, '-p', `${PORT}:4566`,
    '-e', 'SERVICES=s3', '-e', 'EAGER_SERVICE_LOADING=1', IMAGE]);
  await waitHealthy();
}
function stopLocalStack() {
  try { docker(['rm', '-f', CONTAINER]); console.log('[reqresp] LocalStack stopped'); } catch (_) {}
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
    console.log(`[reqresp] uploaded s3://${BUCKET}/${key} (${body.length} bytes)`);
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
const dec = (payload) => JSON.parse(lambda.protocol.decodePayload(payload));
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function runVariant(variant) {
  const pkg = `app-${variant}`;
  const engine = new lambda.reqresp.Engine([], dynamicOptions(variant));

  // case 1: /echo
  const echo = await engine.invoke({ path: `/api/${pkg}/v1/echo`, payload: enc({ name: 'app' }) });
  assert.equal(echo.error, '');
  const echoBody = dec(echo.payload);
  console.log(`[reqresp] echo+${variant}:`, JSON.stringify(echoBody));
  assert.equal(echoBody.op, 'echo');
  assert.equal(echoBody.message, `hello app from reqresp api (${variant})`);
  console.log(`[reqresp] CASE echo+${variant} PASS`);

  // case 2: /sum
  const sum = await engine.invoke({ path: `/api/${pkg}/v1/sum`, payload: enc({ a: 2, b: 3 }) });
  assert.equal(sum.error, '');
  const sumBody = dec(sum.payload);
  console.log(`[reqresp] sum+${variant}:`, JSON.stringify(sumBody));
  assert.equal(sumBody.op, 'sum');
  assert.equal(sumBody.sum, 5);
  console.log(`[reqresp] CASE sum+${variant} PASS`);
}

async function main() {
  fs.rmSync(WAREHOUSE, { recursive: true, force: true });
  await startLocalStack();
  applyAwsEnv();
  await ensureBucket();
  await uploadAll();

  await runVariant('full');    // cases: echo+full, sum+full
  await runVariant('bundle');  // cases: echo+bundle, sum+bundle

  console.log('\n[reqresp] all 4 cases passed: echo+full, sum+full, echo+bundle, sum+bundle');
}

const keepUp = process.argv.includes('--keep-up');
main()
  .then(() => { if (!keepUp) stopLocalStack(); })
  .catch((err) => {
    console.error('[reqresp] FAILED:', err && err.stack ? err.stack : err);
    if (!keepUp) stopLocalStack();
    process.exitCode = 1;
  });
