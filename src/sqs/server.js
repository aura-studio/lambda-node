'use strict';

const { Engine } = require('./engine');
const runtime = require('../runtime');

let engine = null;

/**
 * Create the SQS Lambda handler.
 *
 * @param {Function[]} sqsOpts
 * @param {Function[]} dynamicOpts
 * @returns {Function} Lambda handler function
 */
function createHandler(sqsOpts = [], dynamicOpts = []) {
  engine = new Engine(sqsOpts, dynamicOpts);

  return async (event, context) => {
    return engine.invoke(event);
  };
}

/**
 * Serve builds the engine and runs the Lambda Runtime API loop, mirroring
 * Go's sqs.Serve. The sqs container image has no other Runtime API poller,
 * so the entrypoint process must poll itself. Never resolves under normal
 * operation. For embedding/tests use createHandler() instead.
 */
async function serve(sqsOpts = [], dynamicOpts = []) {
  if (!runtime.isRuntimeAvailable()) {
    throw new Error('AWS_LAMBDA_RUNTIME_API is not set; cannot start Lambda runtime');
  }
  return runtime.start(createHandler(sqsOpts, dynamicOpts));
}

/**
 * @deprecated Alias of serve(), kept for callers written before serve owned
 * the Runtime API loop.
 */
const start = serve;

function close() {
  engine = null;
}

module.exports = { serve, start, createHandler, close, Engine };
