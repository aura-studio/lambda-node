'use strict';

const assert = require('node:assert/strict');
const lambda = require('@aura-studio/lambda-node');
const {
  buildImage,
  invokeLambda,
  startLambdaContainer,
  stopLambdaContainer,
  uploadPackagesForContainer,
  waitForLambda,
} = require('../../../_shared/docker-flow');
const { receiveOne } = require('../../../_shared/localstack');
const config = require('./config');

const enc = (obj) => lambda.protocol.encodePayload(JSON.stringify(obj));
const dec = (payload) => JSON.parse(lambda.protocol.decodePayload(payload));

async function invokeAndRead(variant, route, payload, queues, client) {
  const pkg = `app${variant}`;
  const corr = `docker-${variant}-${route.slice(1)}`;
  const result = await invokeLambda(config, {
    Records: [
      {
        messageId: corr,
        body: JSON.stringify({
          request_sqs_id: queues.request,
          response_sqs_id: queues.response,
          correlation_id: corr,
          path: `/api/${pkg}/v1${route}`,
          payload: enc(payload),
        }),
      },
    ],
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { batchItemFailures: [] });

  const replyBody = await receiveOne(client, queues.response);
  assert.ok(replyBody, `expected docker reply for ${route}+${variant}`);
  const reply = JSON.parse(replyBody);
  assert.equal(reply.correlation_id, corr);
  return dec(reply.payload);
}

// One container per variant, fixed via DYNAMIC_VARIANT; each loads only its own
// package path. Events carry no variant.
async function runVariantContainer(variant, queues, client) {
  startLambdaContainer(config, { DYNAMIC_VARIANT: variant });
  try {
    await waitForLambda(config);

    const echo = await invokeAndRead(variant, '/echo', { name: 'docker' }, queues, client);
    console.log(`[sqs docker] app${variant} echo:`, JSON.stringify(echo));
    assert.equal(echo.message, `processed docker via sqs api (${variant})`);

    const sum = await invokeAndRead(variant, '/sum', { a: 4, b: 6 }, queues, client);
    console.log(`[sqs docker] app${variant} sum:`, JSON.stringify(sum));
    assert.equal(sum.sum, 10);
    console.log(`[sqs docker] CASE echo+${variant}, sum+${variant} PASS`);
  } finally {
    stopLambdaContainer(config);
  }
}

async function runDockerCases(queues, client) {
  buildImage(config);
  await uploadPackagesForContainer(config);

  await runVariantContainer('full', queues, client);
  await runVariantContainer('bundle', queues, client);

  console.log('[sqs docker] Dockerfile Lambda startup cases passed (full + bundle containers)');
}

module.exports = { runDockerCases };
