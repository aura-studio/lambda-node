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

const topLevelWithHelpers = {
  withLambdaType: server.withLambdaType,
  withHttpOptions: server.withHttpOptions,
  withSqsOptions: server.withSqsOptions,
  withReqRespOptions: server.withReqRespOptions,
  withEventOptions: server.withEventOptions,
  withDynamicOptions: server.withDynamicOptions,
  withServeConfig: server.withServeConfig,
  withServeConfigFile: server.withServeConfigFile,
  withDefaultServeConfigFile: server.withDefaultServeConfigFile,

  withOs: dynamic.withOs,
  withArch: dynamic.withArch,
  withCompiler: dynamic.withCompiler,
  withVariant: dynamic.withVariant,
  withLocalWarehouse: dynamic.withLocalWarehouse,
  withRemoteWarehouse: dynamic.withRemoteWarehouse,
  withPackageNamespace: dynamic.withPackageNamespace,
  withPackageDefaultVersion: dynamic.withPackageDefaultVersion,
  withStaticPackage: dynamic.withStaticPackage,
  withPreloadPackage: dynamic.withPreloadPackage,
  withDynamicConfig: dynamic.withConfig,
  withDynamicConfigFile: dynamic.withConfigFile,
  withDefaultDynamicConfigFile: dynamic.withDefaultConfigFile,

  withAddress: http.withAddress,
  withCorsMode: http.withCorsMode,
  withStaticLink: http.withStaticLink,
  withPrefixLink: http.withPrefixLink,
  withPageNotFoundPath: http.withPageNotFoundPath,
  withHttpDebugMode: http.withDebugMode,
  withHttpConfig: http.withConfig,
  withHttpConfigFile: http.withConfigFile,
  withDefaultHttpConfigFile: http.withDefaultConfigFile,

  withReqRespDebugMode: reqresp.withDebugMode,
  withReqRespConfig: reqresp.withConfig,
  withReqRespConfigFile: reqresp.withConfigFile,
  withDefaultReqRespConfigFile: reqresp.withDefaultConfigFile,

  withSQSClient: sqs.withSQSClient,
  withRunMode: sqs.withRunMode,
  withReplyMode: sqs.withReplyMode,
  withSqsDebugMode: sqs.withDebugMode,
  withSqsConfig: sqs.withConfig,
  withSqsConfigFile: sqs.withConfigFile,
  withDefaultSqsConfigFile: sqs.withDefaultConfigFile,

  withEventDebugMode: event.withDebugMode,
  withEventConfig: event.withConfig,
  withEventConfigFile: event.withConfigFile,
  withDefaultEventConfigFile: event.withDefaultConfigFile,
};

module.exports = {
  serve: server.serve,
  start: server.start,
  ...topLevelWithHelpers,
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
