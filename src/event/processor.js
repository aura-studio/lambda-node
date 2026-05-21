'use strict';

function doSafe(fn) {
  try {
    fn();
    return null;
  } catch (err) {
    if (err instanceof Error) return err;
    return new Error(`panic: ${err}`);
  }
}

async function doSafeAsync(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    if (err instanceof Error) return err;
    return new Error(`panic: ${err}`);
  }
}

function doDebug(fn) {
  const stdoutLines = [];
  const stderrLines = [];
  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;

  console.log = (...args) => { stdoutLines.push(args.map(String).join(' ')); origLog.apply(console, args); };
  console.error = (...args) => { stderrLines.push(args.map(String).join(' ')); origError.apply(console, args); };
  console.warn = (...args) => { stderrLines.push(args.map(String).join(' ')); origWarn.apply(console, args); };

  let error = null;
  try {
    fn();
  } catch (err) {
    error = err instanceof Error ? err : new Error(`panic: ${err}`);
  } finally {
    console.log = origLog;
    console.error = origError;
    console.warn = origWarn;
  }

  return { stdout: stdoutLines.join('\n'), stderr: stderrLines.join('\n'), error };
}

async function doDebugAsync(fn) {
  const stdoutLines = [];
  const stderrLines = [];
  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;

  console.log = (...args) => { stdoutLines.push(args.map(String).join(' ')); origLog.apply(console, args); };
  console.error = (...args) => { stderrLines.push(args.map(String).join(' ')); origError.apply(console, args); };
  console.warn = (...args) => { stderrLines.push(args.map(String).join(' ')); origWarn.apply(console, args); };

  let error = null;
  try {
    await fn();
  } catch (err) {
    error = err instanceof Error ? err : new Error(`panic: ${err}`);
  } finally {
    console.log = origLog;
    console.error = origError;
    console.warn = origWarn;
  }

  return { stdout: stdoutLines.join('\n'), stderr: stderrLines.join('\n'), error };
}

module.exports = { doSafe, doSafeAsync, doDebug, doDebugAsync };