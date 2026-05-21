'use strict';

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

module.exports = {
  doSafe,
  doDebug,
};