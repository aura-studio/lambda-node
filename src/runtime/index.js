'use strict';

const http = require('http');

const RUNTIME_API_VERSION = '2018-06-01';

function runtimeApiHost() {
  return process.env.AWS_LAMBDA_RUNTIME_API || '';
}

function isRuntimeAvailable() {
  return runtimeApiHost() !== '';
}

function runtimePath(path) {
  return `/${RUNTIME_API_VERSION}/runtime${path}`;
}

function requestRuntime(method, path, body) {
  const host = runtimeApiHost();
  if (!host) {
    return Promise.reject(
      new Error('AWS_LAMBDA_RUNTIME_API is not set; cannot start Lambda runtime')
    );
  }

  const payload = body === undefined ? null : Buffer.from(body);
  const url = new URL(`http://${host}`);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        method,
        path: runtimePath(path),
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': payload.length,
            }
          : undefined,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 400) {
            reject(
              new Error(
                `Lambda runtime ${method} ${path} failed with ${res.statusCode}: ${rawBody}`
              )
            );
            return;
          }
          resolve({ headers: res.headers, body: rawBody });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function parseEvent(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch (_) {
    return body;
  }
}

function buildContext(headers) {
  const deadlineMs = Number(headers['lambda-runtime-deadline-ms'] || 0);

  return {
    awsRequestId: headers['lambda-runtime-aws-request-id'] || '',
    invokedFunctionArn: headers['lambda-runtime-invoked-function-arn'] || '',
    traceId: headers['lambda-runtime-trace-id'] || '',
    deadlineMs,
    callbackWaitsForEmptyEventLoop: true,
    getRemainingTimeInMillis() {
      if (!deadlineMs) return 0;
      return Math.max(0, deadlineMs - Date.now());
    },
  };
}

function errorPayload(err) {
  const error = err instanceof Error ? err : new Error(String(err));
  return JSON.stringify({
    errorMessage: error.message,
    errorType: error.name || 'Error',
    stackTrace: error.stack ? error.stack.split('\n') : [],
  });
}

async function start(handler, opts = {}) {
  if (typeof handler !== 'function') {
    throw new TypeError('runtime.start requires a handler function');
  }

  if (!isRuntimeAvailable()) {
    throw new Error('AWS_LAMBDA_RUNTIME_API is not set; cannot start Lambda runtime');
  }

  const maxInvocations = opts.maxInvocations || 0;
  let handled = 0;

  while (!maxInvocations || handled < maxInvocations) {
    const next = await requestRuntime('GET', '/invocation/next');
    const requestId = next.headers['lambda-runtime-aws-request-id'];
    const event = parseEvent(next.body);
    const context = buildContext(next.headers);

    try {
      const result = await handler(event, context);
      await requestRuntime(
        'POST',
        `/invocation/${requestId}/response`,
        JSON.stringify(result === undefined ? null : result)
      );
    } catch (err) {
      await requestRuntime('POST', `/invocation/${requestId}/error`, errorPayload(err));
    }

    handled += 1;
  }
}

module.exports = {
  start,
  isRuntimeAvailable,
  parseEvent,
  buildContext,
};
