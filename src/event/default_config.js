'use strict';

const fs = require('fs');
const path = require('path');
const { withConfigFile } = require('./config');

function defaultConfigCandidates() {
  return [
    'event.yaml',
    'event.yml',
    path.join('event', 'event.yaml'),
    path.join('event', 'event.yml'),
  ];
}

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
        if (fs.statSync(p).isFile()) return p;
      } catch (_) { /* not found */ }
    }
  }
  return null;
}

function withDefaultConfigFile() {
  const p = findDefaultConfigFile();
  if (!p) return null;
  return withConfigFile(p);
}

module.exports = { defaultConfigCandidates, findDefaultConfigFile, withDefaultConfigFile };
