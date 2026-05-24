'use strict';

const path = require('node:path');
const { detectToolchain } = require('../../../_shared/toolchain');

const lambdaDir = path.resolve(__dirname, '..');
const appRoot = path.resolve(lambdaDir, '..');
const apiDir = path.join(appRoot, 'api');
const name = 'app-sqs';

module.exports = {
  name,
  mode: 'sqs',
  logPrefix: 'sqs',
  appRoot,
  lambdaDir,
  apiDir,
  appDir: lambdaDir,
  lambdaConfig: path.join(lambdaDir, 'config', 'lambda.yaml'),
  dynamicCliConfig: path.join(apiDir, 'dynamic-cli.yaml'),
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
  toolchain: detectToolchain(),
  warehouse: process.env.LAMBDA_NODE_WAREHOUSE || path.join(lambdaDir, '.tmp', 'warehouse'),
  packageDir: path.join(apiDir, 'packages'),
  packages: {
    'appfull': { variant: 'full', file: 'index' },
    'appbundle': { variant: 'bundle', file: 'bundle' },
  },
};
