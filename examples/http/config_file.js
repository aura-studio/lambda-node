'use strict';

const path = require('path');
const { serve, server, dynamic } = require('../../src');

const greeterMod = require('./packages/greeter/v1');

async function main() {
  const configFile = path.join(__dirname, 'lambda.yml');

  await serve(
    server.withServeConfigFile(configFile),
    server.withDynamicOptions(
      dynamic.withStaticPackage({ package: 'greeter', version: 'v1', handler: greeterMod }),
    ),
  );
}

main().catch(console.error);