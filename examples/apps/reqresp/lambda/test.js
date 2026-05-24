'use strict';

const fs = require('node:fs');
const config = require('./src/config');
const { assertConfigFiles } = require('../../_shared/config-files');
const { applyAwsEnv, ensureBucket, startLocalStack, stopLocalStack } = require('../../_shared/localstack');
const { uploadAll } = require('../../_shared/warehouse');
const { runAll } = require('./src/cases');
const { runDockerCases } = require('./src/docker-cases');

async function main() {
  const keepUp = process.argv.includes('--keep-up');
  const dockerLambda = process.argv.includes('--docker-lambda');

  await assertConfigFiles(config);
  fs.rmSync(config.warehouse, { recursive: true, force: true });
  await startLocalStack(config);
  applyAwsEnv(config);

  try {
    await ensureBucket(config);
    await uploadAll(config);
    await runAll();

    if (dockerLambda) {
      await runDockerCases();
    }
  } finally {
    if (!keepUp) {
      stopLocalStack(config);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
