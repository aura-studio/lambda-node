'use strict';

const { serve, server, http, dynamic } = require('../../src');

const webMod = require('./packages/web/v1');

async function main() {
  await serve(
    server.withLambdaType('http'),
    server.withHttpOptions(
      http.withAddress(':3000'),
      http.withDebugMode(),
      http.withCorsMode(),
      http.withPrefixLink('/web', '/wapi/web/v1'),
    ),
    server.withDynamicOptions(
      dynamic.withStaticPackage({ package: 'web', version: 'v1', handler: webMod }),
    ),
  );

  console.log('[wapi] curl "http://127.0.0.1:3000/wapi/web/v1/hello?name=Aura"');
  console.log('[wapi] curl -X POST http://127.0.0.1:3000/wapi/web/v1/echo -H "content-type: text/plain" -d "hello"');
  console.log('[wapi] curl "http://127.0.0.1:3000/web/hello?name=Aura"');
}

main().catch(console.error);
