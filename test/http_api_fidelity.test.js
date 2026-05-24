'use strict';

// Regression tests for HTTP /api request/response byte fidelity, matching the
// Go lambda http handlers:
//   - GET (and empty method): query map, first value per key, sorted keys
//   - POST: raw body bytes forwarded verbatim (no re-serialization / no drop)
//   - other methods (PUT/DELETE/PATCH/HEAD): empty request
//   - response body bytes written back verbatim
//   - reqMeta.Path is the full URL path without the query string

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');

const lambda = require('../src');

// echo package: reflect the exact decoded request bytes back as the response
function echoPkg(req, res) {
  res.data = req.data; // identity passthrough of the base64 payload
  res.meta = {};
}

// reflect package: return the request meta as JSON so we can inspect it
function reflectPkg(req, res) {
  res.data = Buffer.from(JSON.stringify({ meta: req.meta }), 'utf8').toString('base64');
  res.meta = {};
}

// native package for WAPI: writes stdout/stderr and a response directly
function nativeDebugPkg(req, res) {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    console.log('native-stdout-marker');
    console.error('native-stderr-marker');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, url: req.url, body: Buffer.concat(chunks).toString('utf8') }));
  });
}

const port = 18931;
let server;

function request(method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    });
    r.on('error', reject);
    if (body != null) r.write(body);
    r.end();
  });
}

describe('HTTP /api fidelity', () => {
  before(async () => {
    const engine = new lambda.http.Engine(
      [lambda.http.withAddress(`:${port}`)],
      [
        lambda.dynamic.withStaticPackage({ package: 'echo', version: 'v1', handler: echoPkg }),
        lambda.dynamic.withStaticPackage({ package: 'reflect', version: 'v1', handler: reflectPkg }),
        lambda.dynamic.withStaticPackage({ package: 'natdbg', version: 'v1', handler: nativeDebugPkg }),
      ],
    );
    await new Promise((resolve) => { server = engine.app.listen(port, resolve); });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('POST application/json forwards the raw body verbatim (whitespace preserved)', async () => {
    const body = '{"b":2,  "a":1}'; // deliberate key order + extra spaces
    const { buf } = await request('POST', '/api/echo/v1/x', body, { 'content-type': 'application/json' });
    assert.strictEqual(buf.toString('utf8'), body);
  });

  it('POST application/octet-stream forwards raw bytes (not dropped)', async () => {
    const body = Buffer.from([0x00, 0x01, 0xff, 0x80, 0x25, 0x23, 0x7e]); // includes NUL + high bytes
    const { buf } = await request('POST', '/api/echo/v1/x', body, { 'content-type': 'application/octet-stream' });
    assert.ok(buf.equals(body), `expected verbatim bytes, got ${buf.toString('hex')}`);
  });

  it('GET builds a query map with first value per key and sorted keys', async () => {
    const { buf } = await request('GET', '/api/echo/v1/x?b=2&a=1&a=9&c=3');
    assert.strictEqual(buf.toString('utf8'), '{"a":"1","b":"2","c":"3"}');
  });

  it('PUT forwards an empty request body (matches Go default branch)', async () => {
    const { buf } = await request('PUT', '/api/echo/v1/x', 'putbody', { 'content-type': 'text/plain' });
    assert.strictEqual(buf.toString('utf8'), '');
  });

  it('DELETE forwards an empty request body', async () => {
    const { buf } = await request('DELETE', '/api/echo/v1/x', 'delbody', { 'content-type': 'text/plain' });
    assert.strictEqual(buf.toString('utf8'), '');
  });

  it('reqMeta.Path is the full URL path without the query string', async () => {
    const { buf } = await request('GET', '/api/reflect/v1/sub/route?z=1');
    const out = JSON.parse(buf.toString('utf8'));
    assert.strictEqual(out.meta.Path, '/api/reflect/v1/sub/route');
    assert.strictEqual(out.meta.route, '/sub/route');
  });

  it('/_/wapi debug returns a dump capturing stdout/stderr and the response', async () => {
    const { status, buf } = await request('POST', '/_/wapi/natdbg/v1/run', 'wbody', { 'content-type': 'text/plain' });
    const dump = buf.toString('utf8');
    assert.strictEqual(status, 200);
    // captured streams
    assert.match(dump, /Stdout: .*native-stdout-marker/s);
    assert.match(dump, /Stderr: .*native-stderr-marker/s);
    // captured native response body (not flushed directly to the client)
    assert.match(dump, /Response: .*"ok":true/s);
    // the native handler still saw the request body via the tee
    assert.match(dump, /"body":"wbody"/);
    // debug path is the inner route
    assert.match(dump, /Path: \/run/);
  });

  it('/wapi (non-debug) still streams the native response directly', async () => {
    const { status, buf } = await request('POST', '/wapi/natdbg/v1/run', 'plainbody', { 'content-type': 'text/plain' });
    const out = JSON.parse(buf.toString('utf8'));
    assert.strictEqual(status, 200);
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.body, 'plainbody');
  });

  it('standard methods are routed to /api handlers (not 404)', async () => {
    // GET/HEAD/DELETE carry no body here; POST/PUT/PATCH carry a body. The point
    // is that each standard method is registered (matches Go HandleAllMethods)
    // and therefore does NOT fall through to the 404 page-not-found handler.
    const cases = [
      ['GET', null], ['HEAD', null], ['DELETE', null], ['OPTIONS', null],
      ['POST', 'x'], ['PUT', 'x'], ['PATCH', 'x'],
    ];
    for (const [method, body] of cases) {
      const { status } = await request(method, '/api/echo/v1/x', body);
      assert.notStrictEqual(status, 404, `${method} should be routed, got 404`);
      assert.ok(status < 500, `${method} should not 5xx, got ${status}`);
    }
  });

  it('non-standard HTTP methods fall through to 404 (matches Go 7-method registration)', async () => {
    const { status } = await request('TRACE', '/api/echo/v1/x');
    assert.strictEqual(status, 404);
  });
});
