'use strict';

const { Engine } = require('./engine');
const runtime = require('../runtime');

let engine = null;

/**
 * Create the ReqResp Lambda handler.
 *
 * @param {Function[]} reqrespOpts
 * @param {Function[]} dynamicOpts
 * @returns {Function} Lambda handler function
 */
function createHandler(reqrespOpts = [], dynamicOpts = []) {
  engine = new Engine(reqrespOpts, dynamicOpts);

  return async (event, context) => {
    return engine.invoke(event);
  };
}

/**
 * Serve builds the engine and runs the Lambda Runtime API loop, mirroring
 * Go's reqresp.Serve (lambda.Start). The reqresp container image has no
 * other Runtime API poller (no RIC, no Web Adapter), so the entrypoint
 * process must poll itself. Never resolves under normal operation.
 *
 * For embedding/tests use createHandler() instead — it never touches the
 * Runtime API.
 */
async function serve(reqrespOpts = [], dynamicOpts = []) {
  if (!runtime.isRuntimeAvailable()) {
    throw new Error('AWS_LAMBDA_RUNTIME_API is not set; cannot start Lambda runtime');
  }
  return runtime.start(createHandler(reqrespOpts, dynamicOpts));
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
