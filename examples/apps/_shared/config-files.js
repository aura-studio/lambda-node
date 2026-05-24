'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const yaml = require('js-yaml');
const lambda = require('../../../src');

async function assertConfigFiles(config) {
  assertLambdaYaml(config);
  await assertDynamicCliYaml(config);
}

function assertLambdaYaml(config) {
  const file = config.lambdaConfig || path.join(config.lambdaDir || config.appDir, 'config', 'lambda.yaml');
  const raw = fs.readFileSync(file, 'utf8');
  const cfg = yaml.load(raw) || {};

  assert.equal(cfg.lambda, config.mode);
  assert.ok(cfg.dynamic && cfg.dynamic.environment, 'lambda.yaml dynamic.environment is required');
  assert.ok(cfg.dynamic.package, 'lambda.yaml dynamic.package is required');
  assert.equal(cfg.dynamic.environment.warehouse.remote, `s3://${config.bucket}`);

  const serverOptions = lambda.server.newOptions(lambda.server.withServeConfig(raw));
  assert.equal(serverOptions.lambda, config.mode);

  const dyn = lambda.dynamic.newOptions(...serverOptions.dynamic);
  assert.equal(dyn.os, config.toolchain.os);
  assert.equal(dyn.arch, config.toolchain.arch);
  assert.equal(dyn.compiler, config.toolchain.compiler);
  assert.equal(dyn.variant, 'full');
  assert.equal(dyn.localWarehouse, `/tmp/${config.name}/warehouse`);
  assert.equal(dyn.remoteWarehouse, `s3://${config.bucket}`);
  assert.equal(dyn.packageNamespace, config.namespace);
  assert.equal(dyn.packageDefaultVersion, config.version);

  if (config.mode === 'sqs') {
    const sqs = lambda.sqs.newOptions(...serverOptions.sqs);
    assert.equal(sqs.runMode, lambda.sqs.RunModePartial);
    assert.equal(sqs.replyMode, true);
  }
}

async function assertDynamicCliYaml(config) {
  const file = config.dynamicCliConfig || path.join(config.apiDir, 'dynamic-cli.yaml');
  const { parseConfig, validateConfig } = await loadDynamicNodeCliConfig();
  const cfg = parseConfig(file);
  validateConfig(cfg);

  const procedureNames = new Set(cfg.procedures.map((procedure) => procedure.name));
  assert.deepEqual([...procedureNames].sort(), Object.keys(config.packages).sort());

  const envByName = new Map(cfg.environments.map((env) => [env.name, env]));
  const variants = new Set();
  for (const procedure of cfg.procedures) {
    const spec = config.packages[procedure.name];
    assert.ok(spec, `dynamic-cli.yaml unexpected procedure ${procedure.name}`);
    assert.equal(procedure.source.module, '.');
    assert.equal(procedure.source.package, `packages/${procedure.name}`);
    assert.equal(procedure.source.version, config.version);
    assert.equal(procedure.target.namespace, config.namespace);
    assert.equal(procedure.target.package, procedure.name);
    assert.equal(procedure.target.version, config.version);

    const env = envByName.get(procedure.environment);
    assert.ok(env, `dynamic-cli.yaml missing environment ${procedure.environment}`);
    assert.equal(env.toolchain.os, config.toolchain.os);
    assert.equal(env.toolchain.arch, config.toolchain.arch);
    assert.equal(env.toolchain.compiler, config.toolchain.compiler);
    assert.equal(env.toolchain.variant, spec.variant);
    assert.equal(env.warehouse.local, '../lambda/.tmp/warehouse');
    assert.deepEqual(env.warehouse.remote, [`s3://${config.bucket}`]);
    variants.add(env.toolchain.variant);
  }

  assert.deepEqual([...variants].sort(), ['bundle', 'full']);
}

async function loadDynamicNodeCliConfig() {
  const localPath = path.resolve(__dirname, '../../../../dynamic-node-cli/src/config/config.js');
  if (!fs.existsSync(localPath)) {
    throw new Error(`dynamic-node-cli config module not found: ${localPath}`);
  }
  return import(pathToFileURL(localPath).href);
}

module.exports = { assertConfigFiles };
