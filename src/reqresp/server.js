'use strict';

const { Engine } = require('./engine');

let engine = null;

/**
 * Serve starts the ReqResp Lambda handler.
 * In Node.js, this returns the handler function for use with
 * AWS Lambda runtime or compatible frameworks.
 *
 * Mirrors Go reqresp.Serve().
 *
 * @param {Function[]} reqrespOpts
 * @param {Function[]} dynamicOpts
 * @returns {Function} Lambda handler function
 */
function serve(reqrespOpts = [], dynamicOpts = []) {
  engine = new Engine(reqrespOpts, dynamicOpts);

  // Return the Lambda handler
  return async (event, context) => {
    return engine.invoke(event);
  };
}

function close() {
  engine = null;
}

module.exports = { serve, close, Engine };
