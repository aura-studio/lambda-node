'use strict';

const http = require('node:http');
const lambda = require('@aura-studio/lambda-node');
const { closeServer, listen } = require('../../_shared/http');
const { dynamicOptions } = require('../../_shared/warehouse');
const config = require('./config');

function variantOf(event) {
  return event.variant || process.env.DYNAMIC_VARIANT || 'full';
}

function requestMethod(event) {
  return event.httpMethod || (event.requestContext && event.requestContext.http && event.requestContext.http.method) || event.method || 'GET';
}

function requestPath(event) {
  const path = event.rawPath || event.path || '/';
  if (path.includes('?') || !event.rawQueryString) return path;
  return `${path}?${event.rawQueryString}`;
}

function requestBody(event) {
  if (event.body == null) return undefined;
  if (event.isBase64Encoded) return Buffer.from(event.body, 'base64');
  return event.body;
}

async function handler(event = {}) {
  if (event.warmup) {
    return { ok: true, app: config.name, mode: config.mode };
  }

  const variant = variantOf(event);
  const engine = new lambda.http.Engine(
    [],
    dynamicOptions(lambda, config, variant, {
      warehouse: process.env.LAMBDA_NODE_WAREHOUSE || config.warehouse,
    }),
  );

  const server = http.createServer(engine.app);
  const baseUrl = await listen(server);
  try {
    const method = requestMethod(event);
    const init = {
      method,
      headers: event.headers || {},
    };
    const body = requestBody(event);
    if (body != null && method !== 'GET' && method !== 'HEAD') {
      init.body = body;
    }

    const response = await fetch(`${baseUrl}${requestPath(event)}`, init);
    const text = await response.text();
    return {
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: text,
    };
  } finally {
    await closeServer(server);
  }
}

module.exports = { handler };
