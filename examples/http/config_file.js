'use strict';

const path = require('path');
const { serve, server, dynamic } = require('../../src');

async function main() {
  const configFile = path.join(__dirname, 'lambda.yml');

  await serve(
    server.withServeConfigFile(configFile),
    server.withDynamicOptions(
      dynamic.withBasePath(path.join(__dirname, 'packages')),
    ),
  );
}

main().catch(console.error);