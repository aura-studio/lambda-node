'use strict';

// UI glue for the standalone example apps (examples/apps/<name>).
//
// Each app is split into a lambda host project and an api package project. This
// helper runs the lambda project the same way a developer would: ensure its deps
// are installed, then run lambda/test.js in that directory.
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

function runApp(name, args = []) {
  const appDir = path.join(APPS_DIR, name);
  const lambdaDir = path.join(appDir, 'lambda');
  if (!fs.existsSync(path.join(lambdaDir, 'test.js'))) {
    console.error(`run-app: unknown app "${name}" (${lambdaDir})`);
    process.exitCode = 1;
    return;
  }

  if (depsNeedInstall(lambdaDir)) {
    console.log(`[run-app] installing deps for ${name} ...`);
    const inst = npmInstall(lambdaDir);
    if (inst.status !== 0) {
      console.error(`[run-app] npm install failed for ${name}`);
      process.exitCode = inst.status || 1;
      return;
    }
  }

  const suffix = args.length ? ` ${args.join(' ')}` : '';
  console.log(`[run-app] running examples/apps/${name}/lambda/test.js${suffix} ...`);
  const res = spawnSync(process.execPath, ['test.js', ...args], { cwd: lambdaDir, stdio: 'inherit' });
  process.exitCode = res.status == null ? 1 : res.status;
}

function depsNeedInstall(cwd) {
  const nodeModules = path.join(cwd, 'node_modules');
  if (!fs.existsSync(nodeModules)) return true;

  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  for (const name of Object.keys(deps)) {
    if (!fs.existsSync(path.join(nodeModules, ...name.split('/')))) {
      return true;
    }
  }
  return false;
}

function main(name, args = process.argv.slice(3)) {
  runApp(name || process.argv[2], args);
}

if (require.main === module) {
  main();
}

module.exports = { runApp, main };
