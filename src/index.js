'use strict';

const server = require('./server');
const dynamic = require('./dynamic');
const http = require('./http');
const reqresp = require('./reqresp');
const sqs = require('./sqs');
const event = require('./event');
const client = require('./client');
const { Context } = require('./context');
const { Router } = require('./router');

// Re-export the top-level serve function
const { serve } = server;

module.exports = {
  // Top-level serve entry point
  serve,

  // Sub-modules
  server,
  dynamic,
  http,
  reqresp,
  sqs,
  event,
  client,

  // Shared types
  Context,
  Router,
};
