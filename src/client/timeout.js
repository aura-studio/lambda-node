'use strict';

async function runWithTimeout(fn, timeoutMs, timeoutMessage = 'request timeout') {
  if (!timeoutMs || timeoutMs <= 0) {
    return fn(undefined);
  }

  const controller = new AbortController();
  let timer = null;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(timeoutMessage);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = { runWithTimeout };
