'use strict';

const { execFileSync } = require('node:child_process');
const { S3Client, CreateBucketCommand } = require('@aws-sdk/client-s3');

function docker(args) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function ensureDocker() {
  try {
    docker(['ps']);
  } catch (err) {
    throw new Error(`Docker is not available/running: ${firstLine(err.message)}`);
  }
}

function isRunning(container) {
  try {
    return docker([
      'ps',
      '--filter',
      `name=^/${container}$`,
      '--filter',
      'status=running',
      '--format',
      '{{.Names}}',
    ])
      .split('\n')
      .map((s) => s.trim())
      .includes(container);
  } catch (_) {
    return false;
  }
}

async function startLocalStack(config) {
  ensureDocker();
  if (isRunning(config.container)) {
    await waitHealthy(config);
    return;
  }

  try {
    docker(['rm', '-f', config.container]);
  } catch (_) {}

  console.log(`[${config.logPrefix}] starting LocalStack ${config.image} on ${config.endpoint}`);
  docker([
    'run',
    '-d',
    '--rm',
    '--name',
    config.container,
    '-p',
    `${config.port}:4566`,
    '-e',
    `SERVICES=${config.services.join(',')}`,
    '-e',
    'EAGER_SERVICE_LOADING=1',
    ...(config.services.includes('sqs') ? ['-e', 'SQS_ENDPOINT_STRATEGY=path'] : []),
    config.image,
  ]);
  await waitHealthy(config);
}

function stopLocalStack(config) {
  try {
    docker(['rm', '-f', config.container]);
    console.log(`[${config.logPrefix}] LocalStack stopped`);
  } catch (_) {}
}

async function waitHealthy(config, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${config.endpoint}/_localstack/health`);
      if (response.ok) {
        const body = await response.json();
        const services = body.services || {};
        if (config.services.every((name) => Boolean(services[name]))) {
          return;
        }
        last = JSON.stringify(services);
      }
    } catch (err) {
      last = err.message;
    }
    await delay(1000);
  }

  throw new Error(`LocalStack not healthy in ${timeoutMs}ms (${last})`);
}

function applyAwsEnv(config, endpoint = config.endpoint) {
  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_ENDPOINT_URL_S3 = endpoint;
  process.env.AWS_REGION = config.region;
  process.env.AWS_ACCESS_KEY_ID = config.credentials.accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = config.credentials.secretAccessKey;
  process.env.AWS_S3_FORCE_PATH_STYLE = 'true';
}

function s3Client(config, endpoint = config.endpoint) {
  return new S3Client({
    endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: config.credentials,
  });
}

function sqsClient(config, endpoint = config.endpoint) {
  const { SQSClient } = sqsSdk();
  return new SQSClient({
    endpoint,
    region: config.region,
    credentials: config.credentials,
  });
}

async function ensureBucket(config) {
  try {
    await s3Client(config).send(new CreateBucketCommand({ Bucket: config.bucket }));
  } catch (err) {
    if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(err.name)) {
      throw err;
    }
  }
}

async function ensureQueue(config, name) {
  const { CreateQueueCommand, GetQueueUrlCommand } = sqsSdk();
  const client = sqsClient(config);
  try {
    return (await client.send(new CreateQueueCommand({ QueueName: name }))).QueueUrl;
  } catch (err) {
    if (err.name === 'QueueNameExists' || err.name === 'QueueAlreadyExists') {
      return (await client.send(new GetQueueUrlCommand({ QueueName: name }))).QueueUrl;
    }
    throw err;
  }
}

async function receiveOne(client, queueUrl, timeoutMs = 15000) {
  const { DeleteMessageCommand, ReceiveMessageCommand } = sqsSdk();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const out = await client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 2,
      }),
    );
    const message = (out.Messages || [])[0];
    if (message) {
      await client.send(
        new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }),
      );
      return message.Body;
    }
  }
  return null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstLine(value) {
  return String(value || '').split('\n')[0];
}

function sqsSdk() {
  return require('@aws-sdk/client-sqs');
}

module.exports = {
  docker,
  ensureDocker,
  startLocalStack,
  stopLocalStack,
  applyAwsEnv,
  s3Client,
  sqsClient,
  ensureBucket,
  ensureQueue,
  receiveOne,
  delay,
};
