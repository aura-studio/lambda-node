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

// Each variant is a separate function/container fixed via DYNAMIC_VARIANT (one
// function = one variant), loading its own S3 path. We run two containers to
// cover both variants; events never carry a variant.
async function runVariantContainer(variant) {
  startLambdaContainer(config, { DYNAMIC_VARIANT: variant });
  try {
    await waitForLambda(config);

    const api = await invokeLambda(config, {
      httpMethod: 'POST',
      path: `/api/api${variant}/v1/echo`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'docker' }),
    });
    assert.equal(api.status, 200);
    assert.equal(api.body.statusCode, 200);
    console.log(`[http docker] api${variant} response:`, api.body.body);
    assert.equal(JSON.parse(api.body.body).message, `hello docker from http api (${variant})`);

    const wapi = await invokeLambda(config, {
      httpMethod: 'POST',
      path: `/wapi/wapi${variant}/v1/hello`,
      rawQueryString: 'x=1',
      headers: { 'content-type': 'text/plain' },
      body: 'wire-docker',
    });
    assert.equal(wapi.status, 200);
    assert.equal(wapi.body.statusCode, 200);
    console.log(`[http docker] wapi${variant} response:`, wapi.body.body);
    const body = JSON.parse(wapi.body.body);
    assert.equal(body.handler, `wapi${variant}`);
    assert.equal(body.body, 'wire-docker');
    console.log(`[http docker] CASE api+${variant}, wapi+${variant} PASS`);
  } finally {
    stopLambdaContainer(config);
  }
}

async function runDockerCases() {
  buildImage(config);
  // Build + upload packages at the container's auto-detected toolchain so the
  // runtime container can download them from S3.
  await uploadPackagesForContainer(config);

  await runVariantContainer('full');
  await runVariantContainer('bundle');

  console.log('[http docker] Dockerfile Lambda startup cases passed (full + bundle containers)');
}

module.exports = { runDockerCases };
