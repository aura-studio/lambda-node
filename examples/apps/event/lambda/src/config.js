'use strict';

const path = require('node:path');

const lambdaDir = path.resolve(__dirname, '..');
const appRoot = path.resolve(lambdaDir, '..');
const apiDir = path.join(appRoot, 'api');
const name = 'app-event';

module.exports = {
  name,
  mode: 'event',
  logPrefix: 'event',
  appRoot,
  lambdaDir,
  apiDir,
  appDir: lambdaDir,
  container: 'lambda-node-app-event',
  image: process.env.LOCALSTACK_IMAGE || 'localstack/localstack:3',
  port: Number(process.env.LOCALSTACK_PORT || 14569),
  lambdaPort: Number(process.env.LAMBDA_NODE_APP_EVENT_PORT || 19069),
  endpoint: `http://127.0.0.1:${Number(process.env.LOCALSTACK_PORT || 14569)}`,
  services: ['s3'],
  region: 'us-east-1',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  bucket: 'lambda-node-app-event',
  namespace: 'app',
  version: 'v1',
  toolchain: { os: 'linux', arch: 'amd64', compiler: 'node' },
  warehouse: process.env.LAMBDA_NODE_WAREHOUSE || path.join(lambdaDir, '.tmp', 'warehouse'),
  tmpDir: process.env.LAMBDA_NODE_APP_EVENT_TMP || path.join(lambdaDir, '.tmp'),
  packageDir: path.join(apiDir, 'packages'),
  packages: {
    'app-full': { variant: 'full', file: 'index' },
    'app-bundle': { variant: 'bundle', file: 'bundle' },
  },
};
