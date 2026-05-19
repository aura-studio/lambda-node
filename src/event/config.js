'use strict';

const fs = require('fs');
const yaml = require('js-yaml');

function optionFromConfig(yamlContent) {
  const cfg = yaml.load(yamlContent) || {};
  const mode = cfg.mode || {};

  return (o) => {
    if (mode.debug !== undefined) o.debugMode = !!mode.debug;
  };
}

function withConfig(yamlContent) {
  try {
    return optionFromConfig(yamlContent);
  } catch (err) {
    return () => { throw new Error(`event.withConfig: ${err.message}`); };
  }
}

function withConfigFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return withConfig(content);
  } catch (err) {
    return () => { throw new Error(`event.withConfigFile(${filePath}): ${err.message}`); };
  }
}

module.exports = { optionFromConfig, withConfig, withConfigFile };
