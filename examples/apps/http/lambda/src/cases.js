'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const lambda = require('@aura-studio/lambda-node');
const { closeServer, fetchText, listen } = require('../../../_shared/http');
const { assertPackageBuildMeta, dynamicOptions } = require('../../../_shared/warehouse');
const config = require('./config');

async function runVariant(variant, opts = {}) {
  const engine = new lambda.http.Engine([], dynamicOptions(lambda, config, variant, opts));
  const server = http.createServer(engine.app);
  const baseUrl = await listen(server);

  try {
    const apiPkg = `api-${variant}`;
    const api = await fetchText(`${baseUrl}/api/${apiPkg}/v1/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'app' }),
    });
    assert.equal(api.status, 200);
    assert.equal(JSON.parse(api.text).message, `hello app from http api (${variant})`);
    await assertPackageBuildMeta(engine, config, apiPkg, variant);
    console.log(`[http] CASE api+${variant} PASS`);

    const wapiPkg = `wapi-${variant}`;
    const wapi = await fetchText(`${baseUrl}/wapi/${wapiPkg}/v1/hello?x=1`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'wire-body',
    });
    assert.equal(wapi.status, 200);
    const body = JSON.parse(wapi.text);
    assert.equal(body.handler, `wapi-${variant}`);
    assert.equal(body.url, '/hello?x=1');
    assert.equal(body.body, 'wire-body');
    await assertPackageBuildMeta(engine, config, wapiPkg, variant);
    console.log(`[http] CASE wapi+${variant} PASS`);
  } finally {
    await closeServer(server);
  }
}

async function runAll(opts = {}) {
  await runVariant('full', opts);
  await runVariant('bundle', opts);
  console.log('\n[http] all 4 cases passed: api+full, wapi+full, api+bundle, wapi+bundle');
}

module.exports = {
  runVariant,
  runAll,
};
