'use strict';

// LocalStack lifecycle + AWS helpers for the lambda-node e2e suite.
//
// Spins up a single LocalStack container exposing S3 + SQS on :4566, and wires
// dynamic-node / the AWS SDK clients to that endpoint. Everything is idempotent
// so each e2e step can be run independently from the Web UI.

const { execFileSync } = require('node:child_process');

const { S3Client, CreateBucketCommand } = require('@aws-sdk/client-s3');
const {
  SQSClient,
  CreateQueueCommand,
  GetQueueUrlCommand,
} = require('@aws-sdk/client-sqs');

const CONTAINER = 'lambda-node-e2e-localstack';
// Pin to the 3.x community image. The :latest tag now resolves to a Pro build
// that refuses to start without LOCALSTACK_AUTH_TOKEN. Override via LOCALSTACK_IMAGE.
const IMAGE = process.env.LOCALSTACK_IMAGE || 'localstack/localstack:3';
const PORT = Number(process.env.LOCALSTACK_PORT || 4566);
const ENDPOINT = `http://127.0.0.1:${PORT}`;
const REGION = 'us-east-1';
const CREDENTIALS = { accessKeyId: 'test', secretAccessKey: 'test' };

function docker(args, opts = {}) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

function ensureDocker() {
  try {
    docker(['ps']);
  } catch (err) {
    throw new Error(
      'Docker is not available/running. Start Docker Desktop and retry. ' +
      `(${err.message.split('\n')[0]})`,
    );
  }
}

function isRunning() {
  try {
    const out = docker(['ps', '--filter', `name=^/${CONTAINER}$`, '--filter', 'status=running', '--format', '{{.Names}}']);
    return out.split('\n').map((s) => s.trim()).includes(CONTAINER);
  } catch (_) {
    return false;
  }
}

async function startLocalStack() {
  ensureDocker();
  if (isRunning()) {
    console.log(`[localstack] container ${CONTAINER} already running`);
    await waitForHealth();
    return;
  }

  // Remove any stopped container with the same name.
  try {
    docker(['rm', '-f', CONTAINER]);
  } catch (_) {
    // ignore
  }

  console.log(`[localstack] starting ${IMAGE} on ${ENDPOINT} ...`);
  docker([
    'run', '-d', '--rm',
    '--name', CONTAINER,
    '-p', `${PORT}:4566`,
    '-e', 'SERVICES=s3,sqs',
    '-e', 'EAGER_SERVICE_LOADING=1',
    '-e', 'SQS_ENDPOINT_STRATEGY=path',
    IMAGE,
  ]);

  await waitForHealth();
  console.log('[localstack] ready');
}

function stopLocalStack() {
  try {
    docker(['rm', '-f', CONTAINER]);
    console.log(`[localstack] stopped ${CONTAINER}`);
  } catch (err) {
    console.log(`[localstack] nothing to stop (${err.message.split('\n')[0]})`);
  }
}

async function waitForHealth(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${ENDPOINT}/_localstack/health`);
      if (res.ok) {
        const body = await res.json();
        const services = body.services || {};
        if (services.s3 && services.sqs) {
          return;
        }
        last = JSON.stringify(services);
      }
    } catch (err) {
      last = err.message;
    }
    await delay(1000);
  }
  throw new Error(`LocalStack did not become healthy in ${timeoutMs}ms (last: ${last})`);
}

function applyAwsEnv() {
  // Point dynamic-node's S3 client (and our own SDK clients) at LocalStack.
  process.env.AWS_ENDPOINT_URL = ENDPOINT;
  process.env.AWS_ENDPOINT_URL_S3 = ENDPOINT;
  process.env.DYNAMIC_NODE_S3_ENDPOINT = ENDPOINT;
  process.env.AWS_REGION = REGION;
  process.env.AWS_DEFAULT_REGION = REGION;
  process.env.AWS_ACCESS_KEY_ID = CREDENTIALS.accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = CREDENTIALS.secretAccessKey;
  process.env.AWS_S3_FORCE_PATH_STYLE = 'true';
}

function s3Client() {
  return new S3Client({
    endpoint: ENDPOINT,
    region: REGION,
    forcePathStyle: true,
    credentials: CREDENTIALS,
  });
}

function sqsClient() {
  return new SQSClient({
    endpoint: ENDPOINT,
    region: REGION,
    credentials: CREDENTIALS,
  });
}

async function ensureBucket(bucket) {
  const client = s3Client();
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`[localstack] bucket ready: ${bucket}`);
  } catch (err) {
    if (['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(err.name)) {
      console.log(`[localstack] bucket exists: ${bucket}`);
      return;
    }
    throw err;
  }
}

async function ensureQueue(name) {
  const client = sqsClient();
  try {
    const out = await client.send(new CreateQueueCommand({ QueueName: name }));
    console.log(`[localstack] queue ready: ${name} -> ${out.QueueUrl}`);
    return out.QueueUrl;
  } catch (err) {
    if (err.name === 'QueueNameExists' || err.name === 'QueueAlreadyExists') {
      const got = await client.send(new GetQueueUrlCommand({ QueueName: name }));
      return got.QueueUrl;
    }
    throw err;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  CONTAINER,
  ENDPOINT,
  REGION,
  ensureDocker,
  isRunning,
  startLocalStack,
  stopLocalStack,
  waitForHealth,
  applyAwsEnv,
  s3Client,
  sqsClient,
  ensureBucket,
  ensureQueue,
  delay,
};
