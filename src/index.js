'use strict';

const server = require('./server');
const dynamic = require('./dynamic');
const http = require('./http');
const reqresp = require('./reqresp');
const sqs = require('./sqs');
const event = require('./event');
const client = require('./client');
const runtime = require('./runtime');

const { serve, start } = server;

module.exports = {
  serve,
  start,
  server,
  dynamic,
  http,
  reqresp,
  sqs,
  event,
  client,
  runtime,
};
