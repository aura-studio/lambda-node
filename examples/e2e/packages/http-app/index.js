'use strict';

// HTTP mode e2e package. Built into libnode_e2e_http-app_v1.zip, uploaded to
// LocalStack S3, then downloaded + loaded by dynamic-node at runtime and invoked
// through lambda-node's HTTP engine (/api/http-app/v1/<route>).
//
// Envelope contract: (req, res) => void, where req/res are { meta, data(base64) }.
// The handler is wrapped into a dynamic-node Tunnel by the bundled adapter.

const { makeTunnel } = require('./tunnel-adapter');

function handler(req, res) {
  const route = (req.meta && (req.meta.route || req.meta.Path)) || '';
  const payload = decode(req.data);

  if (route === '/plain') {
    res.meta = { ContentType: 'text/plain', Status: 201 };
    res.data = encodeText(`plain:${payload.name || 'anonymous'}`);
    return;
  }

  res.meta = { handler: 'http-app', route, loadedFrom: 's3+localstack' };
  res.data = encodeJSON({
    message: `hello ${payload.name || 'world'} from http e2e`,
    mode: 'http',
    route,
    received: payload,
  });
}

handler.meta = () => ({
  name: 'http-app',
  version: 'v1',
  mode: 'http',
  loadedFrom: 's3',
  routes: ['/echo', '/plain'],
});

function decode(data) {
  const text = Buffer.from(data || '', 'base64').toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return { message: text };
  }
}

function encodeJSON(value) {
  return encodeText(JSON.stringify(value));
}

function encodeText(value) {
  return Buffer.from(String(value)).toString('base64');
}

module.exports = makeTunnel(handler, handler.meta);
