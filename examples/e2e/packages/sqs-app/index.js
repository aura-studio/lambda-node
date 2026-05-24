'use strict';

// SQS mode e2e package. Loaded from LocalStack S3 and invoked through
// lambda-node's SQS engine. The engine sends the reply envelope to a real
// LocalStack SQS response queue (path /api/sqs-app/v1/<route>).

const { makeTunnel } = require('./tunnel-adapter');

function handler(req, res) {
  const route = (req.meta && (req.meta.route || req.meta.Path)) || '';
  const payload = decode(req.data);

  if (payload.fail) {
    throw new Error('sqs-app forced failure');
  }

  res.meta = { handler: 'sqs-app', route, loadedFrom: 's3+localstack' };
  res.data = encodeJSON({
    message: `processed ${payload.name || 'world'} via sqs e2e`,
    mode: 'sqs',
    route,
    received: payload,
  });
}

handler.meta = () => ({
  name: 'sqs-app',
  version: 'v1',
  mode: 'sqs',
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
