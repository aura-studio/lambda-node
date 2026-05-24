'use strict';

const path = require('node:path');
const { docker } = require('./localstack');

function imageName(config) {
  return `lambda-node-${config.name}`;
}

function lambdaContainerName(config) {
  return `${config.container}-lambda`;
}

function dockerEndpoint(config) {
  return `http://host.docker.internal:${config.port}`;
}

function buildImage(config) {
  const image = imageName(config);
  const appRoot = config.appRoot || config.appDir;
  const lambdaDir = config.lambdaDir || config.appDir;
  const context = path.resolve(appRoot, '..', '..', '..', '..');
  console.log(`[${config.logPrefix}] docker build ${image}`);
  docker(['build', '-t', image, '-f', path.join(lambdaDir, 'Dockerfile'), context]);
  return image;
}

function startLambdaContainer(config, extraEnv = {}) {
  const container = lambdaContainerName(config);
  const image = imageName(config);

  try {
    docker(['rm', '-f', container]);
  } catch (_) {}

  const env = {
    AWS_ENDPOINT_URL: dockerEndpoint(config),
    AWS_ENDPOINT_URL_S3: dockerEndpoint(config),
    AWS_REGION: config.region,
    AWS_ACCESS_KEY_ID: config.credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: config.credentials.secretAccessKey,
    AWS_S3_FORCE_PATH_STYLE: 'true',
    LAMBDA_NODE_WAREHOUSE: `/tmp/${config.name}/warehouse`,
    ...extraEnv,
  };

  const args = [
    'run',
    '-d',
    '--rm',
    '--name',
    container,
    '--add-host',
    'host.docker.internal:host-gateway',
    '-p',
    `${config.lambdaPort}:8080`,
  ];
  for (const [key, value] of Object.entries(env)) {
    args.push('-e', `${key}=${value}`);
  }
  args.push(image);

  console.log(`[${config.logPrefix}] docker run ${container} on http://127.0.0.1:${config.lambdaPort}`);
  docker(args);
  return container;
}

function stopLambdaContainer(config) {
  try {
    docker(['rm', '-f', lambdaContainerName(config)]);
  } catch (_) {}
}

async function invokeLambda(config, event) {
  const response = await fetch(`http://127.0.0.1:${config.lambdaPort}/2015-03-31/functions/function/invocations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
  });
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch (_) {}
  console.log(`[${config.logPrefix}] lambda ${response.status}: ${text.slice(0, 180)}`);
  return { status: response.status, body };
}

async function waitForLambda(config, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const response = await invokeLambda(config, { warmup: true });
      if (response.status < 500) return;
      last = JSON.stringify(response.body);
    } catch (err) {
      last = err.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Lambda container did not become ready: ${last}`);
}

module.exports = {
  imageName,
  lambdaContainerName,
  dockerEndpoint,
  buildImage,
  startLambdaContainer,
  stopLambdaContainer,
  invokeLambda,
  waitForLambda,
};
