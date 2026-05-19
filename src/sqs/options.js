'use strict';

// Run mode constants - mirrors Go sqs.RunMode
const RunModeStrict = 'strict';
const RunModePartial = 'partial';
const RunModeBatch = 'batch';
const RunModeReentrant = 'reentrant';

const validRunModes = [RunModeStrict, RunModePartial, RunModeBatch, RunModeReentrant];

const defaultOptions = {
  sqsClient: null,
  runMode: RunModeBatch,
  replyMode: false,
  debugMode: false,
};

function newOptions(...opts) {
  const options = JSON.parse(JSON.stringify(defaultOptions));
  // sqsClient is not JSON-serializable
  options.sqsClient = null;
  for (const opt of opts) {
    if (opt) opt(options);
  }
  return options;
}

function withSQSClient(client) {
  return (o) => { o.sqsClient = client; };
}

function withRunMode(mode) {
  return (o) => {
    if (!validRunModes.includes(mode)) {
      throw new Error(`sqs: unrecognized run mode: "${mode}"`);
    }
    o.runMode = mode;
  };
}

function withReplyMode(reply) {
  return (o) => { o.replyMode = !!reply; };
}

function withDebugMode(debug) {
  return (o) => { o.debugMode = !!debug; };
}

module.exports = {
  RunModeStrict,
  RunModePartial,
  RunModeBatch,
  RunModeReentrant,
  defaultOptions,
  newOptions,
  withSQSClient,
  withRunMode,
  withReplyMode,
  withDebugMode,
};
