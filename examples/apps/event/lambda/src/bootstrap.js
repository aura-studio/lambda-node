'use strict';

const lambda = require('@aura-studio/lambda-node');
const { dynamicOptions } = require('../../../_shared/warehouse');
const config = require('./config');

const engines = new Map();

// Variant is fixed per function via DYNAMIC_VARIANT (one function = one variant),
// mirroring real Lambda where trigger events carry no variant.
function variantOf() {
  return process.env.DYNAMIC_VARIANT || 'full';
}

function engineFor(variant) {
  if (!engines.has(variant)) {
    engines.set(
      variant,
      new lambda.event.Engine(
        [],
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
  return engineFor(variantOf()).invoke(event);
}

module.exports = { handler };
