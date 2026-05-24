'use strict';

// Step runner for the LocalStack-backed e2e suite. Each step is independently
// runnable (idempotently starts LocalStack + uploads its package), so they can
// be driven one-by-one from the Web UI.

const ls = require('./localstack');
const e2e = require('./e2e-common');
const { ok } = require('../scripts/common');

const steps = new Map([
  ['10-localstack-up', stepUp],
  ['11-e2e-http', e2e.runHttpE2E],
  ['12-e2e-http-wapi', e2e.runWapiE2E],
  ['13-e2e-reqresp', e2e.runReqRespE2E],
  ['14-e2e-sqs', e2e.runSqsE2E],
  ['15-e2e-event', e2e.runEventE2E],
  ['16-e2e-bundle', e2e.runBundleE2E],
  ['17-localstack-down', stepDown],
  ['98-run-all-e2e', runAll],
]);

async function stepUp() {
  await e2e.ensureReady(e2e.ALL_MODES);
  await ls.ensureQueue(e2e.REQUEST_QUEUE);
  await ls.ensureQueue(e2e.RESPONSE_QUEUE);
  console.log(`[e2e] LocalStack ready at ${ls.ENDPOINT}`);
  console.log(`[e2e] bucket: ${e2e.BUCKET}  |  packages: ${e2e.ALL_MODES.map((m) => e2e.pkgName(m)).join(', ')}`);
  ok('LocalStack up and all e2e packages uploaded');
}

async function stepDown() {
  ls.stopLocalStack();
  e2e.cleanWorkspace();
  ok('LocalStack down and e2e workspace cleaned');
}

async function runAll() {
  await stepUp();
  await e2e.runHttpE2E();
  await e2e.runWapiE2E();
  await e2e.runReqRespE2E();
  await e2e.runSqsE2E();
  await e2e.runEventE2E();
  await e2e.runBundleE2E();
  await stepDown();
  ok('all LocalStack e2e steps passed');
}

async function runStep(name) {
  const step = steps.get(name);
  if (!step) {
    throw new Error(`unknown e2e step: ${name}`);
  }
  await step();
}

async function main(defaultStep) {
  const step = process.argv[2] || defaultStep;
  try {
    await runStep(step);
  } catch (err) {
    console.error('error:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main('98-run-all-e2e');
}

module.exports = { main, runStep, steps };
