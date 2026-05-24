'use strict';

const path = require('node:path');

const appDir = path.resolve(__dirname, '..');
const name = 'app-reqresp';

module.exports = {
  name,
  mode: 'reqresp',
  logPrefix: 'reqresp',
  appDir,
  container: 'lambda-node-app-reqresp',
  image: process.env.LOCALSTACK_IMAGE || 'localstack/localstack:3',
  port: Number(process.env.LOCALSTACK_PORT || 14567),
  lambdaPort: Number(process.env.LAMBDA_NODE_APP_REQRESP_PORT || 19067),
  endpoint: `http://127.0.0.1:${Number(process.env.LOCALSTACK_PORT || 14567)}`,
  services: ['s3'],
  region: 'us-east-1',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  bucket: 'lambda-node-app-reqresp',
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
