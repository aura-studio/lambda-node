'use strict';

const fs = require('fs');
const yaml = require('js-yaml');
const { normalizePath } = require('./options');

/**
 * Parse YAML content into an HTTP option function.
 *
 * YAML structure (http.yml):
 *   address: ":8080"
 *   mode:
 *     debug: true
 *     cors: true
 *   staticLink: [{ srcPath, dstPath, methods }]
 *   prefixLink: [{ srcPrefix, dstPrefix, methods }]
 *   pageNotFound: [{ path, methods }]
 *
 * @param {string|Buffer} yamlContent
 * @returns {Function} option function
 */
function optionFromConfig(yamlContent) {
  const cfg = yaml.load(yamlContent) || {};
  const mode = cfg.mode || {};
  const staticLink = cfg.staticLink || [];
  const prefixLink = cfg.prefixLink || [];
  const pageNotFound = cfg.pageNotFound || [];

  return (o) => {
    if (cfg.address) o.address = cfg.address;
    if (mode.debug !== undefined) o.debugMode = !!mode.debug;
    if (mode.cors !== undefined) o.corsMode = !!mode.cors;

    for (const link of staticLink) {
      if (!link.srcPath || !link.dstPath) continue;
      o.staticLinkMap[normalizePath(link.srcPath)] = {
        dst: normalizePath(link.dstPath),
        methods: link.methods || [],
      };
    }

    for (const link of prefixLink) {
      if (!link.srcPrefix || !link.dstPrefix) continue;
      o.prefixLinkMap[normalizePath(link.srcPrefix)] = {
        dst: normalizePath(link.dstPrefix),
        methods: link.methods || [],
      };
    }

    for (const nf of pageNotFound) {
      if (!nf.path) continue;
      o.pageNotFoundRules.push({
        dst: normalizePath(nf.path),
        methods: nf.methods || [],
      });
    }
  };
}

/**
 * WithConfig - parse YAML string/buffer and return option function.
 * @param {string|Buffer} yamlContent
 * @returns {Function}
 */
function withConfig(yamlContent) {
  try {
    return optionFromConfig(yamlContent);
  } catch (err) {
    return () => {
      throw new Error(`http.withConfig: ${err.message}`);
    };
  }
}

/**
 * WithConfigFile - load YAML file and return option function.
 * @param {string} filePath
 * @returns {Function}
 */
function withConfigFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return withConfig(content);
  } catch (err) {
    return () => {
      throw new Error(`http.withConfigFile(${filePath}): ${err.message}`);
    };
  }
}

module.exports = {
  optionFromConfig,
  withConfig,
  withConfigFile,
};
