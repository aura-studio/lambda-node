'use strict';

const path = require('node:path');
const { detectToolchain } = require('../../../_shared/toolchain');

const lambdaDir = path.resolve(__dirname, '..');
const appRoot = path.resolve(lambdaDir, '..');
const apiDir = path.join(appRoot, 'api');
const name = 'app-http';

module.exports = {
  name,
  mode: 'http',
  logPrefix: 'http',
  appRoot,
  lambdaDir,
  apiDir,
  appDir: lambdaDir,
  lambdaConfig: path.join(lambdaDir, 'config', 'lambda.yaml'),
  dynamicCliConfig: path.join(apiDir, 'dynamic-cli.yaml'),
  container: 'lambda-node-app-http',
  image: process.env.LOCALSTACK_IMAGE || 'localstack/localstack:3',
  port: Number(process.env.LOCALSTACK_PORT || 14566),
  lambdaPort: Number(process.env.LAMBDA_NODE_APP_HTTP_PORT || 19066),
  endpoint: `http://127.0.0.1:${Number(process.env.LOCALSTACK_PORT || 14566)}`,
  services: ['s3'],
  region: 'us-east-1',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  bucket: 'lambda-node-app-http',
  namespace: 'app',
  version: 'v1',
  toolchain: detectToolchain(),
  warehouse: process.env.LAMBDA_NODE_WAREHOUSE || path.join(lambdaDir, '.tmp', 'warehouse'),
  packageDir: path.join(apiDir, 'packages'),
  packages: {
    'apifull': { variant: 'full', file: 'index', mode: 'api' },
    'wapifull': { variant: 'full', file: 'index', mode: 'wapi' },
    'apibundle': { variant: 'bundle', file: 'bundle', mode: 'api' },
    'wapibundle': { variant: 'bundle', file: 'bundle', mode: 'wapi' },
  },
};
