'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const lambda = require('../src');

const exampleMod = require('./packages/example/v1');

// Test 1: Dynamic package loading
describe('Dynamic', () => {
  it('should load a registered package and invoke it', async () => {
    const dyn = new lambda.dynamic.Dynamic(
      lambda.dynamic.withStaticPackage({ package: 'example', version: 'v1', handler: exampleMod }),
    );

    const tunnel = await dyn.getPackage('example', 'v1');
    assert.ok(tunnel, 'tunnel should not be null');

    const reqEnvelope = JSON.stringify({
      meta: { route: '/test' },
      data: Buffer.from('hello world').toString('base64'),
    });

    const rsp = tunnel.invoke('/test', reqEnvelope);
    const parsed = JSON.parse(rsp);
    assert.ok(parsed.data, 'response should have data');

    const decoded = Buffer.from(parsed.data, 'base64').toString('utf8');
    const body = JSON.parse(decoded);
    assert.strictEqual(body.echo, 'hello world');
  });

  it('should return meta from the package', async () => {
    const dyn = new lambda.dynamic.Dynamic(
      lambda.dynamic.withStaticPackage({ package: 'example', version: 'v1', handler: exampleMod }),
    );

    const tunnel = await dyn.getPackage('example', 'v1');
    const metaStr = tunnel.meta();
    const metaObj = JSON.parse(metaStr);
    assert.strictEqual(metaObj.name, 'example');
    assert.strictEqual(metaObj.version, 'v1');
  });
});

// Test 2: ReqResp Engine
describe('ReqResp Engine', () => {
  it('should invoke and return response', async () => {
    const engine = new lambda.reqresp.Engine(
      [],
      [lambda.dynamic.withStaticPackage({ package: 'example', version: 'v1', handler: exampleMod })],
    );

    const resp = await engine.invoke({
      path: '/api/example/v1/test',
      payload: JSON.stringify({ message: 'hello' }),
    });

    assert.ok(resp, 'response should not be null');
    assert.strictEqual(resp.error, '');
    assert.ok(resp.payload, 'payload should not be empty');
  });
});

// Test 3: Event Engine
describe('Event Engine', () => {
  it('should invoke without error', async () => {
    const engine = new lambda.event.Engine(
      [],
      [lambda.dynamic.withStaticPackage({ package: 'example', version: 'v1', handler: exampleMod })],
    );

    await engine.invoke({
      path: '/api/example/v1/test',
      payload: JSON.stringify({ message: 'hello' }),
    });
  });
});

// Test 4: HTTP Engine integration
describe('HTTP Server', () => {
  let server;
  const port = 18901;

  before(async () => {
    const engine = new lambda.http.Engine(
      [lambda.http.withAddress(`:${port}`)],
      [lambda.dynamic.withStaticPackage({ package: 'example', version: 'v1', handler: exampleMod })],
    );
    server = engine.app.listen(port);
  });

  after(() => {
    if (server) server.close();
  });

  it('should respond to health check', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/health-check`);
    assert.strictEqual(resp.status, 200);
    const text = await resp.text();
    assert.strictEqual(text, 'OK');
  });

  it('should handle API requests', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/api/example/v1/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello from test' }),
    });
    assert.strictEqual(resp.status, 200);
    const body = await resp.text();
    assert.ok(body.length > 0, 'body should not be empty');
  });

  it('should return 404 for unknown paths', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/unknown`);
    assert.strictEqual(resp.status, 404);
  });

  it('should handle meta requests', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/meta/example/v1`);
    assert.strictEqual(resp.status, 200);
    const body = await resp.json();
    assert.ok(body.service, 'should have service info');
    assert.ok(body.lambda, 'should have lambda info');
  });
});