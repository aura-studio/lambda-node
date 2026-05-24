'use strict';

// Standalone SQS-mode lambda-node example + e2e test.
//
// 4 cases = {/echo, /sum} x {full, bundle}, all api (envelope) mode. Each
// package is built into a libnode_<name>.zip, uploaded to LocalStack S3,
// downloaded + loaded by dynamic-node, and driven through the lambda-node SQS
// engine, which sends each response to a real LocalStack SQS reply queue that
// this test then reads back. Fully self-contained; shares no code.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const AdmZip = require('adm-zip');
const { S3Client, CreateBucketCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const {
  SQSClient, CreateQueueCommand, GetQueueUrlCommand,
  ReceiveMessageCommand, DeleteMessageCommand,
} = require('@aws-sdk/client-sqs');
const lambda = require('@aura-studio/lambda-node');

const CONTAINER = 'lambda-node-app-sqs';
const IMAGE = process.env.LOCALSTACK_IMAGE || 'localstack/localstack:3';
const PORT = Number(process.env.LOCALSTACK_PORT || 14568);
const ENDPOINT = `http://127.0.0.1:${PORT}`;
const REGION = 'us-east-1';
const CREDS = { accessKeyId: 'test', secretAccessKey: 'test' };
const BUCKET = 'lambda-node-app-sqs';
const REQUEST_QUEUE = 'lambda-node-app-sqs-request';
const RESPONSE_QUEUE = 'lambda-node-app-sqs-response';
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
  console.log(`[sqs] starting LocalStack ${IMAGE} on ${ENDPOINT}`);
  docker(['run', '-d', '--rm', '--name', CONTAINER, '-p', `${PORT}:4566`,
    '-e', 'SERVICES=s3,sqs', '-e', 'EAGER_SERVICE_LOADING=1', '-e', 'SQS_ENDPOINT_STRATEGY=path', IMAGE]);
  await waitHealthy();
}
function stopLocalStack() {
  try { docker(['rm', '-f', CONTAINER]); console.log('[sqs] LocalStack stopped'); } catch (_) {}
}
async function waitHealthy(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${ENDPOINT}/_localstack/health`);
      if (r.ok) { const b = await r.json(); if (b.services && b.services.s3 && b.services.sqs) return; last = JSON.stringify(b.services); }
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
function sqs() { return new SQSClient({ endpoint: ENDPOINT, region: REGION, credentials: CREDS }); }
async function ensureBucket() {
  try { await s3().send(new CreateBucketCommand({ Bucket: BUCKET })); }
  catch (e) { if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(e.name)) throw e; }
}
async function ensureQueue(name) {
  const c = sqs();
  try { return (await c.send(new CreateQueueCommand({ QueueName: name }))).QueueUrl; }
  catch (e) {
    if (e.name === 'QueueNameExists' || e.name === 'QueueAlreadyExists') {
      return (await c.send(new GetQueueUrlCommand({ QueueName: name }))).QueueUrl;
    }
    throw e;
  }
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
    console.log(`[sqs] uploaded s3://${BUCKET}/${key} (${body.length} bytes)`);
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

async function receiveOne(client, queueUrl, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const out = await client.send(new ReceiveMessageCommand({ QueueUrl: queueUrl, MaxNumberOfMessages: 1, WaitTimeSeconds: 2 }));
    const m = (out.Messages || [])[0];
    if (m) { await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: m.ReceiptHandle })); return m.Body; }
  }
  return null;
}

async function runCase(variant, route, payload, expect, queues, client) {
  const pkg = `app-${variant}`;
  const engine = new lambda.sqs.Engine(
    [lambda.sqs.withRunMode(lambda.sqs.RunModePartial), lambda.sqs.withReplyMode(true), lambda.sqs.withSQSClient(client)],
    dynamicOptions(variant),
  );
  const corr = `corr-${variant}-${route.slice(1)}`;
  const result = await engine.invoke({
    Records: [{
      messageId: `${variant}-${route.slice(1)}`,
      body: JSON.stringify({
        request_sqs_id: queues.request,
        response_sqs_id: queues.response,
        correlation_id: corr,
        path: `/api/${pkg}/v1${route}`,
        payload: enc(payload),
      }),
    }],
  });
  assert.deepEqual(result, { batchItemFailures: [] });
  const replyBody = await receiveOne(client, queues.response);
  assert.ok(replyBody, `expected a reply for ${route}+${variant}`);
  const reply = JSON.parse(replyBody);
  assert.equal(reply.correlation_id, corr);
  const out = dec(reply.payload);
  console.log(`[sqs] ${route}+${variant} reply:`, JSON.stringify(out));
  expect(out);
  console.log(`[sqs] CASE ${route.slice(1)}+${variant} PASS`);
}

async function main() {
  fs.rmSync(WAREHOUSE, { recursive: true, force: true });
  await startLocalStack();
  applyAwsEnv();
  await ensureBucket();
  await uploadAll();

  const queues = { request: await ensureQueue(REQUEST_QUEUE), response: await ensureQueue(RESPONSE_QUEUE) };
  const client = sqs();

  for (const variant of ['full', 'bundle']) {
    await runCase(variant, '/echo', { name: 'app' }, (o) => {
      assert.equal(o.op, 'echo');
      assert.equal(o.message, `processed app via sqs api (${variant})`);
    }, queues, client);
    await runCase(variant, '/sum', { a: 2, b: 3 }, (o) => {
      assert.equal(o.op, 'sum');
      assert.equal(o.sum, 5);
    }, queues, client);
  }

  console.log('\n[sqs] all 4 cases passed: echo+full, sum+full, echo+bundle, sum+bundle');
}

const keepUp = process.argv.includes('--keep-up');
main()
  .then(() => { if (!keepUp) stopLocalStack(); })
  .catch((err) => {
    console.error('[sqs] FAILED:', err && err.stack ? err.stack : err);
    if (!keepUp) stopLocalStack();
    process.exitCode = 1;
  });
