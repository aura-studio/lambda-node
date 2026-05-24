'use strict';

const { SQSClient } = require('@aws-sdk/client-sqs');
const lambda = require('@aura-studio/lambda-node');
const { dynamicOptions } = require('../../_shared/warehouse');
const config = require('./config');

const engines = new Map();

function variantOf(event) {
  return event.variant || process.env.DYNAMIC_VARIANT || 'full';
}

function createSqsClient() {
  return new SQSClient({
    endpoint: process.env.AWS_ENDPOINT_URL || config.endpoint,
    region: process.env.AWS_REGION || config.region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || config.credentials.accessKeyId,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || config.credentials.secretAccessKey,
    },
  });
}

function engineFor(variant) {
  if (!engines.has(variant)) {
    engines.set(
      variant,
      new lambda.sqs.Engine(
        [
          lambda.sqs.withRunMode(lambda.sqs.RunModePartial),
          lambda.sqs.withReplyMode(true),
          lambda.sqs.withSQSClient(createSqsClient()),
        ],
        dynamicOptions(lambda, config, variant, {
          warehouse: process.env.LAMBDA_NODE_WAREHOUSE || config.warehouse,
        }),
      ),
    );
  }
  return engines.get(variant);
}

async function handler(event = {}) {
  if (event.warmup) {
    return { ok: true, app: config.name, mode: config.mode };
  }
  return engineFor(variantOf(event)).invoke(event);
}

module.exports = { handler };
