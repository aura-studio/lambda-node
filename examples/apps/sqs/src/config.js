'use strict';

const path = require('node:path');

const appDir = path.resolve(__dirname, '..');
const name = 'app-sqs';

module.exports = {
  name,
  mode: 'sqs',
  logPrefix: 'sqs',
  appDir,
  container: 'lambda-node-app-sqs',
  image: process.env.LOCALSTACK_IMAGE || 'localstack/localstack:3',
  port: Number(process.env.LOCALSTACK_PORT || 14568),
  lambdaPort: Number(process.env.LAMBDA_NODE_APP_SQS_PORT || 19068),
  endpoint: `http://127.0.0.1:${Number(process.env.LOCALSTACK_PORT || 14568)}`,
  services: ['s3', 'sqs'],
  region: 'us-east-1',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  bucket: 'lambda-node-app-sqs',
  requestQueue: 'lambda-node-app-sqs-request',
  responseQueue: 'lambda-node-app-sqs-response',
  namespace: 'app',
  version: 'v1',
  toolchain: { os: 'linux', arch: 'amd64', compiler: 'node' },
  warehouse: process.env.LAMBDA_NODE_WAREHOUSE || path.join(appDir, '.tmp', 'warehouse'),
  packageDir: path.join(appDir, 'packages'),
  packages: {
    'app-full': { variant: 'full', file: 'index' },
    'app-bundle': { variant: 'bundle', file: 'bundle' },
  },
};
