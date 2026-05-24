'use strict';

const assert = require('node:assert/strict');
const lambda = require('@aura-studio/lambda-node');
const {
  buildImage,
  invokeLambda,
  startLambdaContainer,
  stopLambdaContainer,
  uploadPackagesForContainer,
  waitForLambda,
} = require('../../../_shared/docker-flow');
const config = require('./config');

const enc = (obj) => lambda.protocol.encodePayload(JSON.stringify(obj));
const dec = (payload) => JSON.parse(lambda.protocol.decodePayload(payload));

// One container per variant, fixed via DYNAMIC_VARIANT (one function = one
// variant); each loads only its own package path. Events carry no variant.
async function runVariantContainer(variant) {
  const pkg = `app${variant}`;
  startLambdaContainer(config, { DYNAMIC_VARIANT: variant });
  try {
    await waitForLambda(config);

    const echo = await invokeLambda(config, {
      path: `/api/${pkg}/v1/echo`,
      payload: enc({ name: 'docker' }),
    });
    assert.equal(echo.status, 200);
    assert.equal(echo.body.error, '');
    const echoBody = dec(echo.body.payload);
    console.log(`[reqresp docker] ${pkg} echo:`, JSON.stringify(echoBody));
    assert.equal(echoBody.message, `hello docker from reqresp api (${variant})`);

    const sum = await invokeLambda(config, {
      path: `/api/${pkg}/v1/sum`,
      payload: enc({ a: 4, b: 6 }),
    });
    assert.equal(sum.status, 200);
    assert.equal(sum.body.error, '');
    const sumBody = dec(sum.body.payload);
    console.log(`[reqresp docker] ${pkg} sum:`, JSON.stringify(sumBody));
    assert.equal(sumBody.sum, 10);
    console.log(`[reqresp docker] CASE echo+${variant}, sum+${variant} PASS`);
  } finally {
    stopLambdaContainer(config);
  }
}

async function runDockerCases() {
  buildImage(config);
  await uploadPackagesForContainer(config);

  await runVariantContainer('full');
  await runVariantContainer('bundle');

  console.log('[reqresp docker] Dockerfile Lambda startup cases passed (full + bundle containers)');
}

module.exports = { runDockerCases };
