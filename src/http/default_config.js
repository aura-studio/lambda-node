'use strict';

const fs = require('fs');
const path = require('path');
const { withConfigFile } = require('./config');

/**
 * Candidate file names for HTTP config auto-discovery.
 */
function defaultConfigCandidates() {
  return [
    'http.yaml',
    'http.yml',
    path.join('http', 'http.yaml'),
    path.join('http', 'http.yml'),
  ];
}

/**
 * Search for a default HTTP config file.
 * @returns {string|null}
 */
function findDefaultConfigFile() {
  const candidates = defaultConfigCandidates();
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
 * WithDefaultConfigFile - find and load the default HTTP config file.
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
