'use strict';

const { serve, server, http, dynamic } = require('../../src');

const greeterMod = require('./packages/greeter/v1');

async function main() {
  await serve(
    server.withLambdaType('http'),
    server.withHttpOptions(
      http.withAddress(':3000'),
      http.withDebugMode(),
      http.withCorsMode(),
      http.withStaticLink('/greet', '/api/greeter/v1/greet', 'POST'),
      http.withPrefixLink('/greeter', '/api/greeter/v1'),
    ),
    server.withDynamicOptions(
      dynamic.withStaticPackage({ package: 'greeter', version: 'v1', handler: greeterMod }),
    ),
  );

  console.log('[api] curl -X POST http://127.0.0.1:3000/api/greeter/v1/greet -H "content-type: application/json" -d "{\\"name\\":\\"Aura\\"}"');
  console.log('[api] curl -X POST http://127.0.0.1:3000/greet -H "content-type: application/json" -d "{\\"name\\":\\"Aura\\"}"');
  console.log('[api] curl -X POST http://127.0.0.1:3000/greeter/greet -H "content-type: application/json" -d "{\\"name\\":\\"Aura\\"}"');
}

main().catch(console.error);
