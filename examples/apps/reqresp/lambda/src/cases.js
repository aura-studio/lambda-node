'use strict';

const assert = require('node:assert/strict');
const lambda = require('@aura-studio/lambda-node');
const { assertPackageBuildMeta, dynamicOptions } = require('../../../_shared/warehouse');
const config = require('./config');

const enc = (obj) => lambda.protocol.encodePayload(JSON.stringify(obj));
const dec = (payload) => JSON.parse(lambda.protocol.decodePayload(payload));

async function runVariant(variant, opts = {}) {
  const pkg = `app-${variant}`;
  const engine = new lambda.reqresp.Engine([], dynamicOptions(lambda, config, variant, opts));

  const echo = await engine.invoke({
    path: `/api/${pkg}/v1/echo`,
    payload: enc({ name: 'app' }),
  });
  assert.equal(echo.error, '');
  const echoBody = dec(echo.payload);
  console.log(`[reqresp] echo+${variant}:`, JSON.stringify(echoBody));
  assert.equal(echoBody.op, 'echo');
  assert.equal(echoBody.message, `hello app from reqresp api (${variant})`);
  console.log(`[reqresp] CASE echo+${variant} PASS`);

  const sum = await engine.invoke({
    path: `/api/${pkg}/v1/sum`,
    payload: enc({ a: 2, b: 3 }),
  });
  assert.equal(sum.error, '');
  const sumBody = dec(sum.payload);
  console.log(`[reqresp] sum+${variant}:`, JSON.stringify(sumBody));
  assert.equal(sumBody.op, 'sum');
  assert.equal(sumBody.sum, 5);
  await assertPackageBuildMeta(engine, config, pkg, variant);
  console.log(`[reqresp] CASE sum+${variant} PASS`);
}

async function runAll(opts = {}) {
  await runVariant('full', opts);
  await runVariant('bundle', opts);
  console.log('\n[reqresp] all 4 cases passed: echo+full, sum+full, echo+bundle, sum+bundle');
}

module.exports = {
  runVariant,
  runAll,
};
