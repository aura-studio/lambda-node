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
    variant,
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

async function runDockerCases(queues, client) {
  buildImage(config);
  await uploadPackagesForContainer(config);
  startLambdaContainer(config);
  try {
    await waitForLambda(config);

    const echo = await invokeAndRead('full', '/echo', { name: 'docker' }, queues, client);
    console.log('[sqs docker] echofull response:', JSON.stringify(echo));
    assert.equal(echo.message, 'processed docker via sqs api (full)');

    const sum = await invokeAndRead('bundle', '/sum', { a: 4, b: 6 }, queues, client);
    console.log('[sqs docker] sumbundle response:', JSON.stringify(sum));
    assert.equal(sum.sum, 10);
  } finally {
    stopLambdaContainer(config);
  }

  console.log('[sqs docker] Dockerfile Lambda startup cases passed');
}

module.exports = { runDockerCases };
