'use strict';

const path = require('path');
const { serve, server, http, dynamic } = require('../../src');

const greeterMod = require('./packages/greeter/v1');

async function main() {
  await serve(
    server.withLambdaType('http'),
    server.withHttpOptions(
      http.withAddress(':3000'),
      http.withDebugMode(),
      http.withCorsMode(),
    ),
    server.withDynamicOptions(
      dynamic.withStaticPackage({ package: 'greeter', version: 'v1', handler: greeterMod }),
    ),
  );
}

main().catch(console.error);