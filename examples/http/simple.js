'use strict';

const path = require('path');
const { serve, server, http, dynamic } = require('../../src');

async function main() {
  await serve(
    server.withLambdaType('http'),
    server.withHttpOptions(
      http.withAddress(':3000'),
      http.withDebugMode(),
      http.withCorsMode(),
    ),
    server.withDynamicOptions(
      dynamic.withBasePath(path.join(__dirname, 'packages')),
    ),
  );
}

main().catch(console.error);