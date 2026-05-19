'use strict';

const path = require('path');
const fs = require('fs');

/**
 * Parse service info from AWS_LAMBDA_FUNCTION_NAME.
 * Format: business-framework-component-runtime-resource-instance
 */
function parseServiceInfo() {
  const funcName = process.env.AWS_LAMBDA_FUNCTION_NAME || '';
  const parts = funcName.split('-');
  return {
    business: parts[0] || '',
    framework: parts[1] || '',
    component: parts[2] || '',
    runtime: parts[3] || '',
    resource: parts[4] || '',
    instance: parts.slice(5).join('-') || '',
  };
}

/**
 * Get lambda info from the nearest package.json.
 */
function getLambdaInfo() {
  let module_ = '';
  let version = '';

  // Try to read the main project's package.json
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    module_ = pkg.name || '';
    version = pkg.version || '';
  } catch (_) {
    // Ignore
  }

  return {
    module: module_,
    version,
    runtime: `node ${process.version}`,
  };
}

/**
 * MetaGenerator - generates service metadata JSON.
 * Mirrors the Go dynamic.MetaGenerator.
 */
class MetaGenerator {
  constructor() {
    this._lambdaInfo = getLambdaInfo();
  }

  /**
   * Generate meta JSON string, merging optional package meta.
   * @param {string} [packageMeta=''] - JSON string from package's meta() export
   * @returns {string} JSON string
   */
  generate(packageMeta) {
    const meta = {
      service: parseServiceInfo(),
      lambda: this._lambdaInfo,
    };

    if (!packageMeta) {
      return JSON.stringify(meta, null, 2);
    }

    // Try to merge package meta (non-overlapping keys)
    try {
      const pkgMap = JSON.parse(packageMeta);
      if (pkgMap && typeof pkgMap === 'object') {
        const baseMap = JSON.parse(JSON.stringify(meta));
        for (const [k, v] of Object.entries(pkgMap)) {
          if (!(k in baseMap)) {
            baseMap[k] = v;
          }
        }
        return JSON.stringify(baseMap, null, 2);
      }
    } catch (_) {
      // packageMeta is not valid JSON, return base meta
    }

    return JSON.stringify(meta, null, 2);
  }
}

module.exports = {
  MetaGenerator,
  parseServiceInfo,
  getLambdaInfo,
};
