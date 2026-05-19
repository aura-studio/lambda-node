'use strict';

/**
 * doSafe - wraps a function in try/catch, returns any caught error.
 * Mirrors the Go Engine.doSafe() pattern.
 *
 * @param {Function} fn
 * @returns {Error|null}
 */
function doSafe(fn) {
  try {
    fn();
    return null;
  } catch (err) {
    if (err instanceof Error) {
      return err;
    }
    return new Error(`panic: ${err}`);
  }
}

/**
 * doSafeAsync - async version of doSafe.
 *
 * @param {Function} fn - async function
 * @returns {Promise<Error|null>}
 */
async function doSafeAsync(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    if (err instanceof Error) {
      return err;
    }
    return new Error(`panic: ${err}`);
  }
}

/**
 * doDebug - wraps a function, captures console output and errors.
 * In Node.js we intercept console.log/console.error instead of
 * redirecting OS-level stdout/stderr file descriptors.
 *
 * @param {Function} fn
 * @returns {{ stdout: string, stderr: string, error: Error|null }}
 */
function doDebug(fn) {
  const stdoutLines = [];
  const stderrLines = [];

  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;

  console.log = (...args) => {
    const line = args.map(String).join(' ');
    stdoutLines.push(line);
    origLog.apply(console, args);
  };
  console.error = (...args) => {
    const line = args.map(String).join(' ');
    stderrLines.push(line);
    origError.apply(console, args);
  };
  console.warn = (...args) => {
    const line = args.map(String).join(' ');
    stderrLines.push(line);
    origWarn.apply(console, args);
  };

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

  return {
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n'),
    error,
  };
}

/**
 * doDebugAsync - async version of doDebug.
 *
 * @param {Function} fn - async function
 * @returns {Promise<{ stdout: string, stderr: string, error: Error|null }>}
 */
async function doDebugAsync(fn) {
  const stdoutLines = [];
  const stderrLines = [];

  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;

  console.log = (...args) => {
    const line = args.map(String).join(' ');
    stdoutLines.push(line);
    origLog.apply(console, args);
  };
  console.error = (...args) => {
    const line = args.map(String).join(' ');
    stderrLines.push(line);
    origError.apply(console, args);
  };
  console.warn = (...args) => {
    const line = args.map(String).join(' ');
    stderrLines.push(line);
    origWarn.apply(console, args);
  };

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

  return {
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n'),
    error,
  };
}

module.exports = {
  doSafe,
  doSafeAsync,
  doDebug,
  doDebugAsync,
};
