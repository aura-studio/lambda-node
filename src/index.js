'use strict';

const server = require('./server');
const dynamic = require('./dynamic');
const http = require('./http');
const reqresp = require('./reqresp');
const sqs = require('./sqs');
const event = require('./event');
const client = require('./client');

const { serve } = server;

module.exports = {
  serve,
  server,
  dynamic,
  http,
  reqresp,
  sqs,
  event,
  client,
};