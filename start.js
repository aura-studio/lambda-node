'use strict';

const path = require('path');
const { start, server } = require('./src');

const configFile = process.argv[2] || path.join(process.cwd(), 'lambda.yml');
const fs = require('fs');

if (!fs.existsSync(configFile)) {
  console.error(`[lambda-node] config file not found: ${configFile}`);
  console.error('Usage: node start.js [config.yml]');
  process.exit(1);
}

console.log(`[lambda-node] loading config: ${configFile}`);

start(
  server.withServeConfigFile(configFile),
).catch((err) => {
  console.error(`[lambda-node] failed to start: ${err.message}`);
  process.exit(1);
});
