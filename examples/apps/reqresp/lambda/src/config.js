'use strict';

const path = require('node:path');
const { detectToolchain } = require('../../../_shared/toolchain');

const lambdaDir = path.resolve(__dirname, '..');
const appRoot = path.resolve(lambdaDir, '..');
const apiDir = path.join(appRoot, 'api');
const name = 'app-reqresp';

module.exports = {
  name,
  mode: 'reqresp',
  logPrefix: 'reqresp',
  appRoot,
  lambdaDir,
  apiDir,
  appDir: lambdaDir,
  lambdaConfig: path.join(lambdaDir, 'config', 'lambda.yaml'),
  dynamicCliConfig: path.join(apiDir, 'dynamic-cli.yaml'),
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
  toolchain: detectToolchain(),
  warehouse: process.env.LAMBDA_NODE_WAREHOUSE || path.join(lambdaDir, '.tmp', 'warehouse'),
  packageDir: path.join(apiDir, 'packages'),
  packages: {
    'appfull': { variant: 'full', file: 'index' },
    'appbundle': { variant: 'bundle', file: 'bundle' },
  },
};
