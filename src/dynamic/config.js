'use strict';

const fs = require('fs');
const yaml = require('js-yaml');

/**
 * Parse YAML bytes into a dynamic option function.
 *
 * YAML structure (dynamic.yml):
 *   environment:
 *     toolchain: { os, arch, compiler, variant }
 *     warehouse: { local, remote }
 *   package:
 *     namespace: string
 *     defaultVersion: string
 *     basePath: string
 *     preload: [{ package, version }]
 *
 * @param {string|Buffer} yamlContent
 * @returns {Function} option function
 */
function optionFromConfig(yamlContent) {
  const cfg = yaml.load(yamlContent) || {};
  const env = cfg.environment || {};
  const toolchain = env.toolchain || {};
  const warehouse = env.warehouse || {};
  const pkg = cfg.package || {};
  const preload = pkg.preload || [];

  return (o) => {
    if (toolchain.os) o.os = toolchain.os;
    if (toolchain.arch) o.arch = toolchain.arch;
    if (toolchain.compiler) o.compiler = toolchain.compiler;
    if (toolchain.variant) o.variant = toolchain.variant;
    if (warehouse.local) o.localWarehouse = warehouse.local;
    if (warehouse.remote) o.remoteWarehouse = warehouse.remote;
    if (pkg.namespace) o.packageNamespace = pkg.namespace;
    if (pkg.defaultVersion) o.packageDefaultVersion = pkg.defaultVersion;
    if (pkg.basePath) o.basePath = pkg.basePath;

    for (const p of preload) {
      if (!p.package) continue;
      o.preloadPackages.push({
        package: p.package,
        version: p.version || '',
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
      throw new Error(`dynamic.withConfig: ${err.message}`);
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
      throw new Error(`dynamic.withConfigFile(${filePath}): ${err.message}`);
    };
  }
}

module.exports = {
  optionFromConfig,
  withConfig,
  withConfigFile,
};
