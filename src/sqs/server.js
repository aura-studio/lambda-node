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

function serve(sqsOpts = [], dynamicOpts = []) {
  return createHandler(sqsOpts, dynamicOpts);
}

async function start(sqsOpts = [], dynamicOpts = []) {
  if (!runtime.isRuntimeAvailable()) {
    throw new Error('AWS_LAMBDA_RUNTIME_API is not set; cannot start Lambda runtime');
  }
  return runtime.start(createHandler(sqsOpts, dynamicOpts));
}

function close() {
  engine = null;
}

module.exports = { serve, start, createHandler, close, Engine };
