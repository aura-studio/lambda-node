'use strict';

const { Engine } = require('./engine');

let engine = null;

/**
 * Serve starts the Event Lambda handler.
 * Returns the handler function for AWS Lambda runtime.
 *
 * Mirrors Go event.Serve().
 *
 * @param {Function[]} eventOpts
 * @param {Function[]} dynamicOpts
 * @returns {Function} Lambda handler function
 */
function serve(eventOpts = [], dynamicOpts = []) {
  engine = new Engine(eventOpts, dynamicOpts);

  return async (event, context) => {
    engine.invoke(event);
  };
}

function close() {
  engine = null;
}

module.exports = { serve, close, Engine };
