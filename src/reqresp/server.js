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
 * Serve preserves the package-friendly Node.js API: return a handler that can
 * be exported by the managed Lambda runtime.
 */
function serve(reqrespOpts = [], dynamicOpts = []) {
  return createHandler(reqrespOpts, dynamicOpts);
}

/**
 * Start runs the handler against the Lambda Runtime API. This mirrors Go's
 * lambda.Start path for custom runtime / CLI bootstrap usage.
 */
async function start(reqrespOpts = [], dynamicOpts = []) {
  if (!runtime.isRuntimeAvailable()) {
    throw new Error('AWS_LAMBDA_RUNTIME_API is not set; cannot start Lambda runtime');
  }
  return runtime.start(createHandler(reqrespOpts, dynamicOpts));
}

function close() {
  engine = null;
}

module.exports = { serve, start, createHandler, close, Engine };
