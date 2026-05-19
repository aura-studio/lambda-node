'use strict';

const fs = require('fs');
const yaml = require('js-yaml');
const { RunModeStrict, RunModePartial, RunModeBatch, RunModeReentrant } = require('./options');

const validRunModes = [RunModeStrict, RunModePartial, RunModeBatch, RunModeReentrant];

function optionFromConfig(yamlContent) {
  const cfg = yaml.load(yamlContent) || {};
  const mode = cfg.mode || {};

  return (o) => {
    if (mode.debug !== undefined) o.debugMode = !!mode.debug;
    if (mode.reply !== undefined) o.replyMode = !!mode.reply;
    if (mode.run) {
      if (!validRunModes.includes(mode.run)) {
        throw new Error(`sqs: unrecognized run mode: "${mode.run}"`);
      }
      o.runMode = mode.run;
    }
  };
}

function withConfig(yamlContent) {
  try {
    return optionFromConfig(yamlContent);
  } catch (err) {
    return () => { throw new Error(`sqs.withConfig: ${err.message}`); };
  }
}

function withConfigFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return withConfig(content);
  } catch (err) {
    return () => { throw new Error(`sqs.withConfigFile(${filePath}): ${err.message}`); };
  }
}

module.exports = { optionFromConfig, withConfig, withConfigFile };
