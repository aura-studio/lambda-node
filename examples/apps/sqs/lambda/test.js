'use strict';

const fs = require('node:fs');
const config = require('./src/config');
const { assertConfigFiles } = require('../../_shared/config-files');
const {
  applyAwsEnv,
  ensureBucket,
  ensureQueue,
  sqsClient,
  startLocalStack,
  stopLocalStack,
} = require('../../_shared/localstack');
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
    const queues = {
      request: await ensureQueue(config, config.requestQueue),
      response: await ensureQueue(config, config.responseQueue),
    };
    const client = sqsClient(config);

    await uploadAll(config);
    await runAll(queues, client);

    if (dockerLambda) {
      await runDockerCases(queues, client);
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
