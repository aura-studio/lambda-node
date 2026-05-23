'use strict';

const path = require('path');
const { serve, server, dynamic } = require('../../src');

const greeterMod = require('./packages/greeter/v1');
const webMod = require('./packages/web/v1');

async function main() {
  const configFile = path.join(__dirname, 'lambda.yml');

  await serve(
    server.withServeConfigFile(configFile),
    server.withDynamicOptions(
      dynamic.withStaticPackage({ package: 'greeter', version: 'v1', handler: greeterMod }),
      dynamic.withStaticPackage({ package: 'web', version: 'v1', handler: webMod }),
    ),
  );

  console.log('[api]  curl -X POST http://127.0.0.1:3000/greet -H "content-type: application/json" -d "{\\"name\\":\\"Aura\\"}"');
  console.log('[wapi] curl "http://127.0.0.1:3000/web/hello?name=Aura"');
}

main().catch(console.error);
