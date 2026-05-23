'use strict';

const { Engine } = require('./engine');
const runtime = require('../runtime');

let engine = null;

/**
 * Create the Event Lambda handler.
 *
 * @param {Function[]} eventOpts
 * @param {Function[]} dynamicOpts
 * @returns {Function} Lambda handler function
 */
function createHandler(eventOpts = [], dynamicOpts = []) {
  engine = new Engine(eventOpts, dynamicOpts);

  return async (event, context) => {
    return engine.invoke(event);
  };
}

function serve(eventOpts = [], dynamicOpts = []) {
  return createHandler(eventOpts, dynamicOpts);
}

async function start(eventOpts = [], dynamicOpts = []) {
  if (!runtime.isRuntimeAvailable()) {
    throw new Error('AWS_LAMBDA_RUNTIME_API is not set; cannot start Lambda runtime');
  }
  return runtime.start(createHandler(eventOpts, dynamicOpts));
}

function close() {
  engine = null;
}

module.exports = { serve, start, createHandler, close, Engine };
