'use strict';

// UI glue for the standalone example apps (examples/apps/<name>).
//
// Each app is an independent project with its own package.json / node_modules /
// test.js. This helper runs one app the same way a developer would: ensure its
// deps are installed, then run its test.js in the app's own directory (so module
// resolution and relative paths resolve against the app, not this script).
//
// Output is inherited so the Web UI streams it live; the exit code is propagated
// so the UI shows the correct [exit N].

const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const APPS_DIR = path.join(__dirname, '..', 'apps');

function npmInstall(cwd) {
  if (process.platform === 'win32') {
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm', 'install'], { cwd, stdio: 'inherit' });
  }
  return spawnSync('npm', ['install'], { cwd, stdio: 'inherit' });
}

function runApp(name) {
  const appDir = path.join(APPS_DIR, name);
  if (!fs.existsSync(path.join(appDir, 'test.js'))) {
    console.error(`run-app: unknown app "${name}" (${appDir})`);
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(path.join(appDir, 'node_modules'))) {
    console.log(`[run-app] installing deps for ${name} ...`);
    const inst = npmInstall(appDir);
    if (inst.status !== 0) {
      console.error(`[run-app] npm install failed for ${name}`);
      process.exitCode = inst.status || 1;
      return;
    }
  }

  console.log(`[run-app] running examples/apps/${name}/test.js ...`);
  const res = spawnSync(process.execPath, ['test.js'], { cwd: appDir, stdio: 'inherit' });
  process.exitCode = res.status == null ? 1 : res.status;
}

function main(name) {
  runApp(name || process.argv[2]);
}

if (require.main === module) {
  main();
}

module.exports = { runApp, main };
