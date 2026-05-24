'use strict';

const assert = require('node:assert/strict');
const lambda = require('@aura-studio/lambda-node');
const {
  buildImage,
  invokeLambda,
  startLambdaContainer,
  stopLambdaContainer,
  waitForLambda,
} = require('../../../_shared/docker-flow');
const config = require('./config');

const enc = (obj) => lambda.protocol.encodePayload(JSON.stringify(obj));
const dec = (payload) => JSON.parse(lambda.protocol.decodePayload(payload));

async function runDockerCases() {
  buildImage(config);
  startLambdaContainer(config);
  try {
    await waitForLambda(config);

    const echo = await invokeLambda(config, {
      variant: 'full',
      path: '/api/app-full/v1/echo',
      payload: enc({ name: 'docker' }),
    });
    assert.equal(echo.status, 200);
    assert.equal(echo.body.error, '');
    const echoBody = dec(echo.body.payload);
    console.log('[reqresp docker] echo-full response:', JSON.stringify(echoBody));
    assert.equal(echoBody.message, 'hello docker from reqresp api (full)');

    const sum = await invokeLambda(config, {
      variant: 'bundle',
      path: '/api/app-bundle/v1/sum',
      payload: enc({ a: 4, b: 6 }),
    });
    assert.equal(sum.status, 200);
    assert.equal(sum.body.error, '');
    const sumBody = dec(sum.body.payload);
    console.log('[reqresp docker] sum-bundle response:', JSON.stringify(sumBody));
    assert.equal(sumBody.sum, 10);
  } finally {
    stopLambdaContainer(config);
  }

  console.log('[reqresp docker] Dockerfile Lambda startup cases passed');
}

module.exports = { runDockerCases };
