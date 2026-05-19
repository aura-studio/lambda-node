'use strict';

const { newOptions } = require('./options');
const http = require('../http/server');
const reqresp = require('../reqresp/server');
const sqs = require('../sqs/server');
const event = require('../event/server');

/**
 * Serve - unified entry point that dispatches to the correct mode.
 * Mirrors Go server.Serve().
 *
 * @param {...Function} opts - server option functions
 * @returns {Promise<Function|void>} For HTTP: resolves when server starts.
 *   For Lambda modes: returns the handler function.
 */
async function serve(...opts) {
  const options = newOptions(...opts);

  switch (options.lambda) {
    case 'event':
      return event.serve(options.event, options.dynamic);

    case 'sqs':
      return sqs.serve(options.sqs, options.dynamic);

    case 'reqresp':
      return reqresp.serve(options.reqresp, options.dynamic);

    case 'http':
    default:
      return http.serve(options.http, options.dynamic);
  }
}

module.exports = { serve };
