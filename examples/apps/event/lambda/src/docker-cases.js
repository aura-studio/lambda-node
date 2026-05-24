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

async function invokeEvent(variant, route) {
  const pkg = `app${variant}`;
  const result = await invokeLambda(config, {
    path: `/api/${pkg}/v1${route}`,
    payload: enc({
      name: 'docker',
      markerFile: `/tmp/${config.name}-${variant}-${route.slice(1)}.txt`,
    }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.body, null);
  console.log(`[event docker] ${route.slice(1)}-${variant} response: null`);
}

// One container per variant, fixed via DYNAMIC_VARIANT; each loads only its own
// package path. Events carry no variant.
async function runVariantContainer(variant) {
  startLambdaContainer(config, { DYNAMIC_VARIANT: variant });
  try {
    await waitForLambda(config);
    await invokeEvent(variant, '/echo');
    await invokeEvent(variant, '/notify');
    console.log(`[event docker] CASE echo+${variant}, notify+${variant} PASS`);
  } finally {
    stopLambdaContainer(config);
  }
}

async function runDockerCases() {
  buildImage(config);
  await uploadPackagesForContainer(config);

  await runVariantContainer('full');
  await runVariantContainer('bundle');

  console.log('[event docker] Dockerfile Lambda startup cases passed (full + bundle containers)');
}

module.exports = { runDockerCases };
