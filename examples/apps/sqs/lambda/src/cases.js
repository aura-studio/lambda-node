'use strict';

const assert = require('node:assert/strict');
const lambda = require('@aura-studio/lambda-node');
const { receiveOne } = require('../../../_shared/localstack');
const { assertPackageBuildMeta, dynamicOptions } = require('../../../_shared/warehouse');
const config = require('./config');

const enc = (obj) => lambda.protocol.encodePayload(JSON.stringify(obj));
const dec = (payload) => JSON.parse(lambda.protocol.decodePayload(payload));

async function runCase(variant, route, payload, expect, queues, client, opts = {}) {
  const pkg = `app-${variant}`;
  const engine = new lambda.sqs.Engine(
    [
      lambda.sqs.withRunMode(lambda.sqs.RunModePartial),
      lambda.sqs.withReplyMode(true),
      lambda.sqs.withSQSClient(client),
    ],
    dynamicOptions(lambda, config, variant, opts),
  );

  const corr = `corr-${variant}-${route.slice(1)}`;
  const result = await engine.invoke({
    Records: [
      {
        messageId: `${variant}-${route.slice(1)}`,
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
  assert.deepEqual(result, { batchItemFailures: [] });

  const replyBody = await receiveOne(client, queues.response);
  assert.ok(replyBody, `expected a reply for ${route}+${variant}`);
  const reply = JSON.parse(replyBody);
  assert.equal(reply.correlation_id, corr);
  const out = dec(reply.payload);
  console.log(`[sqs] ${route}+${variant} reply:`, JSON.stringify(out));
  expect(out);
  await assertPackageBuildMeta(engine, config, pkg, variant);
  console.log(`[sqs] CASE ${route.slice(1)}+${variant} PASS`);
}

async function runAll(queues, client, opts = {}) {
  for (const variant of ['full', 'bundle']) {
    await runCase(
      variant,
      '/echo',
      { name: 'app' },
      (out) => {
        assert.equal(out.op, 'echo');
        assert.equal(out.message, `processed app via sqs api (${variant})`);
      },
      queues,
      client,
      opts,
    );
    await runCase(
      variant,
      '/sum',
      { a: 2, b: 3 },
      (out) => {
        assert.equal(out.op, 'sum');
        assert.equal(out.sum, 5);
      },
      queues,
      client,
      opts,
    );
  }

  console.log('\n[sqs] all 4 cases passed: echo+full, sum+full, echo+bundle, sum+bundle');
}

module.exports = {
  runCase,
  runAll,
};
