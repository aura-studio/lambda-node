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

const serverHelpers = {
  withLambdaType: server.withLambdaType,
  withHttpOptions: server.withHttpOptions,
  withSqsOptions: server.withSqsOptions,
  withReqRespOptions: server.withReqRespOptions,
  withEventOptions: server.withEventOptions,
  withDynamicOptions: server.withDynamicOptions,
  withServeConfig: server.withServeConfig,
  withServeConfigFile: server.withServeConfigFile,
  withDefaultServeConfigFile: server.withDefaultServeConfigFile,
};

module.exports = {
  serve: server.serve,
  start: server.start,
  ...serverHelpers,
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
