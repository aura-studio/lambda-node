'use strict';

// ReqResp mode e2e package. Loaded from LocalStack S3 and invoked through
// lambda-node's ReqResp engine (path /api/reqresp-app/v1/<route>).

const { makeTunnel } = require('./tunnel-adapter');

function handler(req, res) {
  const route = (req.meta && (req.meta.route || req.meta.Path)) || '';
  const payload = decode(req.data);

  res.meta = { handler: 'reqresp-app', route, loadedFrom: 's3+localstack' };
  res.data = encodeJSON({
    message: `hello ${payload.name || 'world'} from reqresp e2e`,
    mode: 'reqresp',
    route,
    received: payload,
  });
}

handler.meta = () => ({
  name: 'reqresp-app',
  version: 'v1',
  mode: 'reqresp',
  loadedFrom: 's3',
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
  return Buffer.from(JSON.stringify(value)).toString('base64');
}

module.exports = makeTunnel(handler, handler.meta);
