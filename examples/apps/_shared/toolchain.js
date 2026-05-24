'use strict';

// Detect the real toolchain (os / arch / compiler) of the current environment,
// using the SAME rules as dynamic-node-cli's env.js and dynamic-node's runtime
// toolchain. The build (dynamic-node-cli Builder) and the runtime (lambda-node
// dynamic options) both consume this single derived value, so the S3 / warehouse
// path computed at build time always matches the one computed at load time.
//
//   os       linux  -> "<id><version_id>" from /etc/os-release (e.g. ubuntu24.04, amzn2023)
//            win32  -> "windows<version>"
//            darwin -> "darwin<version>"
//   arch     x64 -> amd64v1, arm64 -> arm64v8, arm -> armv<n>, ia32 -> 386
//   compiler "node<process.version>" (e.g. node20.18.1)

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

function detectOS() {
  const platform = process.platform.toLowerCase().trim();
  switch (platform) {
    case 'linux':
      return detectLinuxDescriptor() || 'linux';
    case 'win32': {
      const v = detectWindowsVersion();
      return v ? `windows${v}` : 'windows';
    }
    case 'darwin': {
      const v = detectDarwinVersion();
      return v ? `darwin${v}` : 'darwin';
    }
    default:
      return platform;
  }
}

function detectLinuxDescriptor() {
  let data;
  try {
    data = fs.readFileSync('/etc/os-release', 'utf8');
  } catch {
    return '';
  }
  const values = new Map();
  for (const rawLine of data.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    values.set(line.slice(0, idx), line.slice(idx + 1).replace(/^"|"$/g, ''));
  }
  const id = (values.get('ID') ?? '').toLowerCase().trim();
  const version = (values.get('VERSION_ID') ?? '').trim();
  if (!id || !version) return '';
  return id + version;
}

function detectWindowsVersion() {
  try {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', '[System.Environment]::OSVersion.Version.ToString()'],
      { encoding: 'utf8' },
    );
    const v = out.trim();
    if (v) return v;
  } catch {
    // fall through
  }
  try {
    const out = execFileSync('cmd', ['/c', 'ver'], { encoding: 'utf8' });
    const m = out.trim().match(/\d[\d.]*/);
    return m ? m[0] : '';
  } catch {
    return '';
  }
}

function detectDarwinVersion() {
  try {
    const v = execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim();
    if (v) return v;
  } catch {
    // fall through
  }
  try {
    return execFileSync('uname', ['-r'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function detectArch() {
  switch (process.arch) {
    case 'x64':
      return 'amd64v1';
    case 'arm64':
      return 'arm64v8';
    case 'arm': {
      const armVersion = process.config && process.config.variables && process.config.variables.arm_version;
      return armVersion ? `armv${armVersion}` : 'arm';
    }
    case 'ia32':
      return '386';
    default:
      return process.arch.toLowerCase().trim();
  }
}

function detectCompiler() {
  const version = process.version.replace(/^v/, '').trim();
  return version ? `node${version}` : 'node';
}

function detectToolchain() {
  return { os: detectOS(), arch: detectArch(), compiler: detectCompiler() };
}

module.exports = { detectToolchain, detectOS, detectArch, detectCompiler };
