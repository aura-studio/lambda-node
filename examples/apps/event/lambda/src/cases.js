'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lambda = require('@aura-studio/lambda-node');
const { assertPackageBuildMeta, dynamicOptions } = require('../../../_shared/warehouse');
const config = require('./config');

const enc = (obj) => lambda.protocol.encodePayload(JSON.stringify(obj));

async function runCase(variant, route, opts = {}) {
  const pkg = `app${variant}`;
  const marker = path.join(config.tmpDir, `marker-${variant}-${route.slice(1)}-${Date.now()}.txt`);
  const engine = new lambda.event.Engine([], dynamicOptions(lambda, config, variant, opts));
  const response = await engine.invoke({
    path: `/api/${pkg}/v1${route}`,
    payload: enc({ name: 'app', markerFile: marker }),
  });
  assert.equal(response, null, 'event returns null');
  const content = fs.readFileSync(marker, 'utf8').trim();
  console.log(`[event] ${route}+${variant} marker: ${content}`);
  assert.equal(content, `${route}:app:${variant}`);
  await assertPackageBuildMeta(engine, config, pkg, variant);
  fs.rmSync(marker, { force: true });
  console.log(`[event] CASE ${route.slice(1)}+${variant} PASS`);
}

async function runAll(opts = {}) {
  fs.mkdirSync(config.tmpDir, { recursive: true });
  for (const variant of ['full', 'bundle']) {
    await runCase(variant, '/echo', opts);
    await runCase(variant, '/notify', opts);
  }
  console.log('\n[event] all 4 cases passed: echo+full, notify+full, echo+bundle, notify+bundle');
}

module.exports = {
  runCase,
  runAll,
};
