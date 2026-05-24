'use strict';

// Shared helpers for the LocalStack-backed e2e suite: build each mode package
// into a libnode_<name>.zip, upload it to LocalStack S3, then drive each
// lambda-node mode so dynamic-node downloads + loads the package from S3 and the
// engine invokes it. SQS additionally round-trips a reply through LocalStack SQS.
//
// Coverage matrix:
//   http    -> HTTP /api (envelope)            variant=generic (index.js)
//   wapi    -> HTTP /wapi (native handler)     variant=generic (index.js)
//   reqresp -> Lambda RequestResponse          variant=generic (index.js)
//   sqs     -> SQS + reply queue               variant=generic (index.js)
//   event   -> Lambda Event (fire-and-forget)  variant=generic (index.js)
//   bundle  -> HTTP /api via single bundle.js  variant=bundle  (bundle.js)

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const AdmZip = require('adm-zip');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');

const {
  lambda,
  assert,
  encodePayload,
  decodePayload,
  fetchText,
  listen,
  closeServer,
  ok,
} = require('../scripts/common');

const ls = require('./localstack');

const BUCKET = 'lambda-node-e2e';
const NAMESPACE = 'e2e';
const VERSION = 'v1';
const BASE_TOOLCHAIN = { os: 'linux', arch: 'amd64', compiler: 'node' };

// Per-mode package spec: which directory, which toolchain variant, and whether
// the zip carries a single bundle.js (variant=bundle) or index.js + adapter.
const PACKAGES = {
  http: { dir: 'http-app', variant: 'generic', bundle: false },
  wapi: { dir: 'wapi-app', variant: 'generic', bundle: false },
  reqresp: { dir: 'reqresp-app', variant: 'generic', bundle: false },
  sqs: { dir: 'sqs-app', variant: 'generic', bundle: false },
  event: { dir: 'event-app', variant: 'generic', bundle: false },
  bundle: { dir: 'bundle-app', variant: 'bundle', bundle: true },
};

const E2E_DIR = __dirname;
const EXAMPLES_DIR = path.dirname(E2E_DIR);
const PACKAGES_DIR = path.join(E2E_DIR, 'packages');
const TMP_DIR = path.join(EXAMPLES_DIR, '.tmp');
const WAREHOUSE_DIR = path.join(TMP_DIR, 'e2e-warehouse');

const REQUEST_QUEUE = 'lambda-node-e2e-request';
const RESPONSE_QUEUE = 'lambda-node-e2e-response';

const ALL_MODES = Object.keys(PACKAGES);

function spec(mode) {
  const s = PACKAGES[mode];
  if (!s) throw new Error(`unknown e2e mode: ${mode}`);
  return s;
}

function pkgName(mode) {
  return spec(mode).dir; // e.g. "http-app"
}

// dynamic-node addresses warehouse entries by "<namespace>_<package>_<version>".
function dynName(mode) {
  return `${NAMESPACE}_${pkgName(mode)}_${VERSION}`;
}

function toolchainStrFor(mode) {
  const { os, arch, compiler } = BASE_TOOLCHAIN;
  return `${os}_${arch}_${compiler}_${spec(mode).variant}`;
}

function s3KeyFor(mode) {
  const name = dynName(mode);
  return `${toolchainStrFor(mode)}/${name}/libnode_${name}.zip`;
}

function buildZip(mode) {
  const dir = path.join(PACKAGES_DIR, pkgName(mode));
  const zip = new AdmZip();
  if (spec(mode).bundle) {
    // variant=bundle: dynamic-node loads bundle.js directly.
    zip.addLocalFile(path.join(dir, 'bundle.js'));
  } else {
    zip.addLocalFile(path.join(dir, 'index.js'));
    zip.addLocalFile(path.join(dir, 'package.json'));
    // Bundle the shared envelope/native tunnel adapter so the zip is self-contained.
    zip.addLocalFile(path.join(PACKAGES_DIR, '_shared', 'tunnel-adapter.js'));
  }
  return zip.toBuffer();
}

async function uploadPackage(mode) {
  const key = s3KeyFor(mode);
  const body = buildZip(mode);
  const client = ls.s3Client();
  await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body }));
  console.log(`[e2e] uploaded s3://${BUCKET}/${key} (${body.length} bytes)`);
}

function clearLocalPackage(mode) {
  const dir = path.join(WAREHOUSE_DIR, toolchainStrFor(mode), dynName(mode));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`[e2e] cleared local cache: ${dir}`);
}

function dynamicOptions(mode) {
  fs.mkdirSync(WAREHOUSE_DIR, { recursive: true });
  return [
    lambda.dynamic.withOs(BASE_TOOLCHAIN.os),
    lambda.dynamic.withArch(BASE_TOOLCHAIN.arch),
    lambda.dynamic.withCompiler(BASE_TOOLCHAIN.compiler),
    lambda.dynamic.withVariant(spec(mode).variant),
    lambda.dynamic.withLocalWarehouse(WAREHOUSE_DIR),
    lambda.dynamic.withRemoteWarehouse(`s3://${BUCKET}`),
    lambda.dynamic.withPackageNamespace(NAMESPACE),
    lambda.dynamic.withPackageDefaultVersion(VERSION),
  ];
}

// Idempotent: start LocalStack, configure env, ensure the bucket exists and the
// requested mode packages are uploaded. Safe to call from any standalone step.
async function ensureReady(modes) {
  await ls.startLocalStack();
  ls.applyAwsEnv();
  await ls.ensureBucket(BUCKET);
  for (const mode of modes) {
    await uploadPackage(mode);
  }
}

async function runHttpE2E() {
  await ensureReady(['http']);
  clearLocalPackage('http');

  const engine = new lambda.http.Engine([], dynamicOptions('http'));
  const server = http.createServer(engine.app);
  const baseUrl = await listen(server);
  try {
    console.log('[e2e] POST /api/http-app/v1/echo (triggers S3 download + load)');
    const echo = await fetchText(`${baseUrl}/api/http-app/v1/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'localstack' }),
    });
    assert.equal(echo.response.status, 200);
    assert.equal(JSON.parse(echo.text).message, 'hello localstack from http e2e');

    const meta = await fetchText(`${baseUrl}/meta/http-app/v1`);
    assert.equal(meta.response.status, 200);
    assert.ok(JSON.parse(meta.text).service, 'meta should include service info');
  } finally {
    await closeServer(server);
  }
  ok('HTTP /api e2e via LocalStack S3 passed');
}

async function runWapiE2E() {
  await ensureReady(['wapi']);
  clearLocalPackage('wapi');

  const engine = new lambda.http.Engine([], dynamicOptions('wapi'));
  const server = http.createServer(engine.app);
  const baseUrl = await listen(server);
  try {
    console.log('[e2e] POST /wapi/wapi-app/v1/hello (native HTTP handler from S3)');
    const res = await fetchText(`${baseUrl}/wapi/wapi-app/v1/hello?x=1`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'wire-body',
    });
    assert.equal(res.response.status, 200);
    const body = JSON.parse(res.text);
    assert.equal(body.handler, 'wapi-app');
    assert.equal(body.url, '/hello?x=1');     // inner route + query, package-visible
    assert.equal(body.body, 'wire-body');     // raw request stream reached the package
  } finally {
    await closeServer(server);
  }
  ok('HTTP /wapi e2e via LocalStack S3 (native HTTP handler) passed');
}

async function runReqRespE2E() {
  await ensureReady(['reqresp']);
  clearLocalPackage('reqresp');

  const engine = new lambda.reqresp.Engine([], dynamicOptions('reqresp'));
  console.log('[e2e] reqresp invoke /api/reqresp-app/v1/echo (triggers S3 download + load)');
  const response = await engine.invoke({
    path: '/api/reqresp-app/v1/echo',
    payload: encodePayload(JSON.stringify({ name: 'localstack' })),
  });
  assert.equal(response.error, '');
  const decoded = JSON.parse(decodePayload(response.payload));
  console.log(JSON.stringify(decoded, null, 2));
  assert.equal(decoded.message, 'hello localstack from reqresp e2e');
  ok('ReqResp e2e via LocalStack S3 passed');
}

async function runSqsE2E() {
  await ensureReady(['sqs']);
  clearLocalPackage('sqs');

  const requestQueueUrl = await ls.ensureQueue(REQUEST_QUEUE);
  const responseQueueUrl = await ls.ensureQueue(RESPONSE_QUEUE);
  await drainQueue(responseQueueUrl);

  const sqs = ls.sqsClient();
  const engine = new lambda.sqs.Engine(
    [
      lambda.sqs.withRunMode(lambda.sqs.RunModePartial),
      lambda.sqs.withReplyMode(true),
      lambda.sqs.withSQSClient(sqs),
    ],
    dynamicOptions('sqs'),
  );

  console.log('[e2e] sqs invoke /api/sqs-app/v1/process (triggers S3 download + load + SQS reply)');
  const result = await engine.invoke({
    Records: [
      {
        messageId: 'e2e-sqs-1',
        body: JSON.stringify({
          request_sqs_id: requestQueueUrl,
          response_sqs_id: responseQueueUrl,
          correlation_id: 'corr-e2e',
          path: '/api/sqs-app/v1/process',
          payload: encodePayload(JSON.stringify({ name: 'localstack' })),
        }),
      },
    ],
  });
  assert.deepEqual(result, { batchItemFailures: [] });

  console.log('[e2e] receiving reply from LocalStack SQS response queue ...');
  const replyBody = await receiveOne(sqs, responseQueueUrl);
  assert.ok(replyBody, 'expected a reply message on the response queue');
  const reply = JSON.parse(replyBody);
  console.log(JSON.stringify(reply, null, 2));
  assert.equal(reply.correlation_id, 'corr-e2e');
  assert.equal(JSON.parse(decodePayload(reply.payload)).message, 'processed localstack via sqs e2e');
  ok('SQS e2e via LocalStack S3 + SQS reply passed');
}

async function runEventE2E() {
  await ensureReady(['event']);
  clearLocalPackage('event');

  fs.mkdirSync(TMP_DIR, { recursive: true });
  const marker = path.join(TMP_DIR, `event-marker-${Date.now()}.txt`);

  const engine = new lambda.event.Engine([], dynamicOptions('event'));
  console.log('[e2e] event invoke /api/event-app/v1/notify (triggers S3 download + load)');
  const response = await engine.invoke({
    path: '/api/event-app/v1/notify',
    payload: encodePayload(JSON.stringify({ name: 'localstack', markerFile: marker })),
  });
  assert.equal(response, null, 'event mode returns null');

  const content = fs.readFileSync(marker, 'utf8');
  console.log(`[e2e] marker file content: ${content.trim()}`);
  assert.match(content, /event:localstack/);
  fs.rmSync(marker, { force: true });
  ok('Event e2e via LocalStack S3 passed');
}

async function runBundleE2E() {
  await ensureReady(['bundle']);
  clearLocalPackage('bundle');

  const engine = new lambda.http.Engine([], dynamicOptions('bundle'));
  const server = http.createServer(engine.app);
  const baseUrl = await listen(server);
  try {
    console.log('[e2e] POST /api/bundle-app/v1/echo (variant=bundle -> loads bundle.js from S3)');
    const echo = await fetchText(`${baseUrl}/api/bundle-app/v1/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'localstack' }),
    });
    assert.equal(echo.response.status, 200);
    const body = JSON.parse(echo.text);
    assert.equal(body.message, 'hello localstack from bundle e2e');
    assert.equal(body.variant, 'bundle');
  } finally {
    await closeServer(server);
  }
  ok('Bundle-variant e2e via LocalStack S3 (bundle.js load path) passed');
}

async function receiveOne(sqs, queueUrl, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const out = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 2,
    }));
    const message = (out.Messages || [])[0];
    if (message) {
      await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
      return message.Body;
    }
  }
  return null;
}

async function drainQueue(queueUrl) {
  const sqs = ls.sqsClient();
  for (let i = 0; i < 5; i += 1) {
    const out = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 0,
    }));
    const messages = out.Messages || [];
    if (messages.length === 0) return;
    for (const m of messages) {
      await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: m.ReceiptHandle }));
    }
  }
}

function cleanWorkspace() {
  fs.rmSync(WAREHOUSE_DIR, { recursive: true, force: true });
  console.log(`[e2e] removed ${WAREHOUSE_DIR}`);
}

module.exports = {
  BUCKET,
  NAMESPACE,
  VERSION,
  BASE_TOOLCHAIN,
  WAREHOUSE_DIR,
  REQUEST_QUEUE,
  RESPONSE_QUEUE,
  ALL_MODES,
  pkgName,
  dynName,
  toolchainStrFor,
  s3KeyFor,
  buildZip,
  uploadPackage,
  clearLocalPackage,
  dynamicOptions,
  ensureReady,
  runHttpE2E,
  runWapiE2E,
  runReqRespE2E,
  runSqsE2E,
  runEventE2E,
  runBundleE2E,
  cleanWorkspace,
};
