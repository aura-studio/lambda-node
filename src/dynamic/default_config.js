'use strict';

const fs = require('fs');
const path = require('path');
const { withConfigFile } = require('./config');

/**
 * Candidate file names for dynamic config auto-discovery.
 */
function defaultConfigCandidates() {
  return [
    'dynamic.yaml',
    'dynamic.yml',
    path.join('dynamic', 'dynamic.yaml'),
    path.join('dynamic', 'dynamic.yml'),
  ];
}

/**
 * Search for a default dynamic config file in CWD and __dirname.
 * @returns {string|null} file path or null
 */
function findDefaultConfigFile() {
  const candidates = defaultConfigCandidates();
  const dirs = [process.cwd()];

  // Also search the directory of the main module
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
        // file not found, continue
      }
    }
  }

  return null;
}

/**
 * WithDefaultConfigFile - find and load the default dynamic config file.
 * Returns null if no config file is found (non-fatal).
 * @returns {Function|null}
 */
function withDefaultConfigFile() {
  const p = findDefaultConfigFile();
  if (!p) return null;
  return withConfigFile(p);
}

module.exports = {
  defaultConfigCandidates,
  findDefaultConfigFile,
  withDefaultConfigFile,
};
