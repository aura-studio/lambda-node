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
 * HTTP mode starts the HTTP server (the Lambda Web Adapter extension polls
 * the Runtime API). Lambda modes (reqresp/sqs/event) run the Runtime API
 * loop in-process and never resolve under normal operation.
 *
 * @param {...Function} opts - server option functions
 * @returns {Promise<void>} For HTTP: resolves when the server is listening.
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
 * CreateHandler builds the mode handler without entering the Runtime API
 * loop — the embedding/test API. Not available in http mode.
 *
 * @param {...Function} opts - server option functions
 * @returns {Function} Lambda handler function
 */
function createHandler(...opts) {
  const options = newOptions(...opts);

  switch (options.lambda) {
    case 'event':
      return event.createHandler(options.event, options.dynamic);

    case 'sqs':
      return sqs.createHandler(options.sqs, options.dynamic);

    case 'reqresp':
      return reqresp.createHandler(options.reqresp, options.dynamic);

    case 'http':
    default:
      throw new Error('createHandler is not available in http mode; use serve()');
  }
}

/**
 * @deprecated Alias of serve(), kept for callers written before serve owned
 * the Runtime API loop.
 */
const start = serve;

module.exports = { serve, start, createHandler };
