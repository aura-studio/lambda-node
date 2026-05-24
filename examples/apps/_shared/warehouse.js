'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

function toolchainString(config, variant) {
  return `${config.toolchain.os}_${config.toolchain.arch}_${config.toolchain.compiler}_${variant}`;
}

function dynamicName(config, name) {
  return `${config.namespace}_${name}_${config.version}`;
}

async function buildZip(config, name) {
  const zipPath = await buildPackage(config, name);
  return fs.readFileSync(zipPath);
}

async function buildPackage(config, name) {
  const { Builder } = await loadDynamicNodeCliBuilder();
  const spec = config.packages[name];
  const dir = path.join(config.packageDir, name);
  const sourceModule = config.apiDir || config.appDir;
  const dynamic = dynamicName(config, name);
  const environment = toolchainString(config, spec.variant);
  const outDir = path.join(config.warehouse, environment, dynamic);
  const entry = spec.entry || (spec.file === 'bundle' ? 'bundle.js' : 'index.js');

  await withNpmInstallEnv(async () => {
    await new Builder({
      name: dynamic,
      sourcePath: dir,
      sourceModule,
      sourcePackage: path.relative(sourceModule, dir) || '.',
      sourceVersion: config.version,
      entry,
      version: config.version,
      house: config.warehouse,
      environment,
      variant: spec.variant,
      os: config.toolchain.os,
      arch: config.toolchain.arch,
      compiler: config.toolchain.compiler,
      dir: outDir,
    }).build();
  });

  return path.join(outDir, `libnode_${dynamic}.zip`);
}

async function loadDynamicNodeCliBuilder() {
  const localPath = path.resolve(__dirname, '../../../../dynamic-node-cli/src/build/builder.js');
  if (!fs.existsSync(localPath)) {
    throw new Error(`dynamic-node-cli builder not found: ${localPath}`);
  }

  return import(pathToFileURL(localPath).href);
}

async function withNpmInstallEnv(fn) {
  const overrides = {
    npm_config_package_lock: 'false',
    NPM_CONFIG_PACKAGE_LOCK: 'false',
    npm_config_audit: 'false',
    NPM_CONFIG_AUDIT: 'false',
    npm_config_fund: 'false',
    NPM_CONFIG_FUND: 'false',
  };
  const previous = {};

  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }

  try {
    return await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (previous[key] == null) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

async function uploadAll(config, endpoint = config.endpoint) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const { s3Client } = require('./localstack');
  const client = s3Client(config, endpoint);
  for (const name of Object.keys(config.packages)) {
    const dynamic = dynamicName(config, name);
    const key = `${toolchainString(config, config.packages[name].variant)}/${dynamic}/libnode_${dynamic}.zip`;
    const body = await buildZip(config, name);
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
      }),
    );
    console.log(`[${config.logPrefix}] uploaded s3://${config.bucket}/${key} (${body.length} bytes)`);
  }
}

function dynamicOptions(lambda, config, variant, overrides = {}) {
  const warehouse = overrides.warehouse || config.warehouse;
  fs.mkdirSync(warehouse, { recursive: true });
  return [
    lambda.dynamic.withOs(config.toolchain.os),
    lambda.dynamic.withArch(config.toolchain.arch),
    lambda.dynamic.withCompiler(config.toolchain.compiler),
    lambda.dynamic.withVariant(variant),
    lambda.dynamic.withLocalWarehouse(warehouse),
    lambda.dynamic.withRemoteWarehouse(`s3://${config.bucket}`),
    lambda.dynamic.withPackageNamespace(config.namespace),
    lambda.dynamic.withPackageDefaultVersion(config.version),
  ];
}

async function assertPackageBuildMeta(engine, config, pkg, variant) {
  const raw = await engine.dynamic.metaPackage(pkg, config.version);
  const meta = JSON.parse(raw || '{}');
  const sourceModule = config.apiDir || config.appDir;
  const appPackage = JSON.parse(fs.readFileSync(path.join(sourceModule, 'package.json'), 'utf8'));

  assert.deepEqual(Object.keys(meta.dynamic || {}).sort(), ['built', 'module', 'version']);
  assert.deepEqual(Object.keys(meta.toolchain || {}).sort(), ['arch', 'compiler', 'os', 'variant']);
  assert.equal(meta.dynamic.module, sourceModule);
  assert.equal(meta.dynamic.version, appPackage.version || 'unknown');
  assert.match(meta.dynamic.built, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(meta.toolchain.os, config.toolchain.os);
  assert.equal(meta.toolchain.arch, config.toolchain.arch);
  assert.equal(meta.toolchain.compiler, config.toolchain.compiler);
  assert.equal(meta.toolchain.variant, variant);

  console.log(`[${config.logPrefix}] meta ${pkg}@${config.version}: ${JSON.stringify(meta)}`);
  return meta;
}

module.exports = {
  toolchainString,
  dynamicName,
  buildZip,
  uploadAll,
  dynamicOptions,
  assertPackageBuildMeta,
};
