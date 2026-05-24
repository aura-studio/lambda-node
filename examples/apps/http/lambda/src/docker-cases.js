'use strict';

const assert = require('node:assert/strict');
const {
  buildImage,
  invokeLambda,
  startLambdaContainer,
  stopLambdaContainer,
  uploadPackagesForContainer,
  waitForLambda,
} = require('../../../_shared/docker-flow');
const config = require('./config');

async function runDockerCases() {
  buildImage(config);
  // Build + upload packages at the container's auto-detected toolchain so the
  // runtime container can download them from S3.
  await uploadPackagesForContainer(config);
  startLambdaContainer(config);
  try {
    await waitForLambda(config);

    const api = await invokeLambda(config, {
      variant: 'full',
      httpMethod: 'POST',
      path: '/api/apifull/v1/echo',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'docker' }),
    });
    assert.equal(api.status, 200);
    assert.equal(api.body.statusCode, 200);
    console.log('[http docker] apifull response:', api.body.body);
    assert.equal(JSON.parse(api.body.body).message, 'hello docker from http api (full)');

    const wapi = await invokeLambda(config, {
      variant: 'bundle',
      httpMethod: 'POST',
      path: '/wapi/wapibundle/v1/hello',
      rawQueryString: 'x=1',
      headers: { 'content-type': 'text/plain' },
      body: 'wire-docker',
    });
    assert.equal(wapi.status, 200);
    assert.equal(wapi.body.statusCode, 200);
    console.log('[http docker] wapibundle response:', wapi.body.body);
    const body = JSON.parse(wapi.body.body);
    assert.equal(body.handler, 'wapibundle');
    assert.equal(body.body, 'wire-docker');
  } finally {
    stopLambdaContainer(config);
  }

  console.log('[http docker] Dockerfile Lambda startup cases passed');
}

module.exports = { runDockerCases };
