'use strict';

// Event mode e2e package. Loaded from LocalStack S3 and invoked through
// lambda-node's Event engine (fire-and-forget). Because Event mode returns no
// response, the handler records a side effect (appends to a marker file whose
// path is provided in the request payload) so the e2e can prove the
// dynamically-loaded package actually executed.

const fs = require('fs');
const { makeTunnel } = require('./tunnel-adapter');

function handler(req, res) {
  const route = (req.meta && (req.meta.route || req.meta.Path)) || '';
  const payload = decode(req.data);

  if (payload.markerFile) {
    fs.appendFileSync(payload.markerFile, `event:${payload.name || ''}:${route}\n`);
  }

  // Event mode ignores the response, but we still fill it for completeness.
  res.meta = { handler: 'event-app', route, loadedFrom: 's3+localstack' };
  res.data = Buffer.from(JSON.stringify({ ok: true })).toString('base64');
}

handler.meta = () => ({
  name: 'event-app',
  version: 'v1',
  mode: 'event',
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

module.exports = makeTunnel(handler, handler.meta);
