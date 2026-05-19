'use strict';

const { Engine } = require('./engine');

let engine = null;

/**
 * Serve starts the SQS Lambda handler.
 * Returns the handler function for AWS Lambda runtime.
 *
 * Mirrors Go sqs.Serve().
 *
 * @param {Function[]} sqsOpts
 * @param {Function[]} dynamicOpts
 * @returns {Function} Lambda handler function
 */
function serve(sqsOpts = [], dynamicOpts = []) {
  engine = new Engine(sqsOpts, dynamicOpts);

  return async (event, context) => {
    return engine.invoke(event);
  };
}

function close() {
  engine = null;
}

module.exports = { serve, close, Engine };
