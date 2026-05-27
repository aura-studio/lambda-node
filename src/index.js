'use strict';

const server = require('./server');
const dynamic = require('./dynamic');
const http = require('./http');
const reqresp = require('./reqresp');
const sqs = require('./sqs');
const event = require('./event');
const client = require('./client');
const runtime = require('./runtime');
const protocol = require('./protocol');

const {
  serve,
  start,
  withServeConfig,
  withServeConfigFile,
  withDefaultServeConfigFile,
} = server;

module.exports = {
  serve,
  start,
  withServeConfig,
  withServeConfigFile,
  withDefaultServeConfigFile,
  server,
  dynamic,
  http,
  reqresp,
  sqs,
  event,
  client,
  runtime,
  protocol,
};
