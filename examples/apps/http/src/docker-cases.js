'use strict';

const assert = require('node:assert/strict');
const {
  buildImage,
  invokeLambda,
  startLambdaContainer,
  stopLambdaContainer,
  waitForLambda,
} = require('../../_shared/docker-flow');
const config = require('./config');

async function runDockerCases() {
  buildImage(config);
  startLambdaContainer(config);
  try {
    await waitForLambda(config);

    const api = await invokeLambda(config, {
      variant: 'full',
      httpMethod: 'POST',
      path: '/api/api-full/v1/echo',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'docker' }),
    });
    assert.equal(api.status, 200);
    assert.equal(api.body.statusCode, 200);
    console.log('[http docker] api-full response:', api.body.body);
    assert.equal(JSON.parse(api.body.body).message, 'hello docker from http api (full)');

    const wapi = await invokeLambda(config, {
      variant: 'bundle',
      httpMethod: 'POST',
      path: '/wapi/wapi-bundle/v1/hello',
      rawQueryString: 'x=1',
      headers: { 'content-type': 'text/plain' },
      body: 'wire-docker',
    });
    assert.equal(wapi.status, 200);
    assert.equal(wapi.body.statusCode, 200);
    console.log('[http docker] wapi-bundle response:', wapi.body.body);
    const body = JSON.parse(wapi.body.body);
    assert.equal(body.handler, 'wapi-bundle');
    assert.equal(body.body, 'wire-docker');
  } finally {
    stopLambdaContainer(config);
  }

  console.log('[http docker] Dockerfile Lambda startup cases passed');
}

module.exports = { runDockerCases };
