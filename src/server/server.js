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

/**
 * Start - unified entry point for executable bootstraps.
 *
 * HTTP mode starts the HTTP server. Lambda modes start a Runtime API loop,
 * matching Go's lambda.Start-based entrypoint behavior.
 *
 * @param {...Function} opts - server option functions
 * @returns {Promise<void>}
 */
async function start(...opts) {
  const options = newOptions(...opts);

  switch (options.lambda) {
    case 'event':
      return event.start(options.event, options.dynamic);

    case 'sqs':
      return sqs.start(options.sqs, options.dynamic);

    case 'reqresp':
      return reqresp.start(options.reqresp, options.dynamic);

    case 'http':
    default:
      return http.serve(options.http, options.dynamic);
  }
}

module.exports = { serve, start };
