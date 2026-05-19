'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const httpConfig = require('../http/config');
const sqsConfig = require('../sqs/config');
const reqrespConfig = require('../reqresp/config');
const eventConfig = require('../event/config');
const dynamicConfig = require('../dynamic/config');

/**
 * Parse unified server YAML (lambda.yml) into option objects for each module.
 *
 * YAML structure:
 *   lambda: "http" | "sqs" | "reqresp" | "event"
 *   http: { ... }
 *   sqs: { ... }
 *   reqresp: { ... }
 *   event: { ... }
 *   dynamic: { ... }
 *
 * @param {string|Buffer} yamlContent
 * @returns {Function} option function for server Options
 */
function withServeConfig(yamlContent) {
  const cfg = yaml.load(yamlContent) || {};

  let httpOpt = null;
  let sqsOpt = null;
  let reqrespOpt = null;
  let eventOpt = null;
  let dynOpt = null;

  if (cfg.http) {
    const b = yaml.dump(cfg.http);
    httpOpt = httpConfig.withConfig(b);
  }

  if (cfg.sqs) {
    const b = yaml.dump(cfg.sqs);
    sqsOpt = sqsConfig.withConfig(b);
  }

  if (cfg.reqresp) {
    const b = yaml.dump(cfg.reqresp);
    reqrespOpt = reqrespConfig.withConfig(b);
  }

  if (cfg.event) {
    const b = yaml.dump(cfg.event);
    eventOpt = eventConfig.withConfig(b);
  }

  if (cfg.dynamic) {
    const b = yaml.dump(cfg.dynamic);
    dynOpt = dynamicConfig.withConfig(b);
  }

  return (o) => {
    if (cfg.lambda) o.lambda = cfg.lambda;
    if (httpOpt) o.http.push(httpOpt);
    if (sqsOpt) o.sqs.push(sqsOpt);
    if (reqrespOpt) o.reqresp.push(reqrespOpt);
    if (eventOpt) o.event.push(eventOpt);
    if (dynOpt) o.dynamic.push(dynOpt);
  };
}

/**
 * Load a YAML file and parse it as server config.
 * @param {string} filePath
 * @returns {Function}
 */
function withServeConfigFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return withServeConfig(content);
}

/**
 * Candidate file names for server config auto-discovery.
 */
function defaultServeConfigCandidates() {
  return [
    'lambda.yaml',
    'lambda.yml',
    'server.yaml',
    'server.yml',
    'bootstrap.yaml',
    'bootstrap.yml',
    'app.yaml',
    'app.yml',
    'config.yaml',
    'config.yml',
  ];
}

/**
 * Search for a default server config file.
 * @returns {string|null}
 */
function findDefaultServeConfigFile() {
  const candidates = defaultServeConfigCandidates();
  const dirs = [process.cwd()];

  if (require.main && require.main.filename) {
    dirs.push(path.dirname(require.main.filename));
  }

  for (const dir of dirs) {
    for (const rel of candidates) {
      const p = path.join(dir, rel);
      try {
        const st = fs.statSync(p);
        if (st.isFile()) return p;
      } catch (_) {
        // not found
      }
    }
  }

  return null;
}

/**
 * WithDefaultServeConfigFile - find and load the default server config file.
 * @returns {Function|null}
 */
function withDefaultServeConfigFile() {
  const p = findDefaultServeConfigFile();
  if (!p) return null;
  return withServeConfigFile(p);
}

module.exports = {
  withServeConfig,
  withServeConfigFile,
  defaultServeConfigCandidates,
  findDefaultServeConfigFile,
  withDefaultServeConfigFile,
};
