'use strict';

const assert = require('node:assert/strict');
const lambda = require('@aura-studio/lambda-node');
const {
  buildImage,
  invokeLambda,
  startLambdaContainer,
  stopLambdaContainer,
  waitForLambda,
} = require('../../_shared/docker-flow');
const config = require('./config');

const enc = (obj) => lambda.protocol.encodePayload(JSON.stringify(obj));

async function invokeEvent(variant, route) {
  const pkg = `app-${variant}`;
  const result = await invokeLambda(config, {
    variant,
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

async function runDockerCases() {
  buildImage(config);
  startLambdaContainer(config);
  try {
    await waitForLambda(config);
    await invokeEvent('full', '/echo');
    await invokeEvent('bundle', '/notify');
  } finally {
    stopLambdaContainer(config);
  }

  console.log('[event docker] Dockerfile Lambda startup cases passed');
}

module.exports = { runDockerCases };
