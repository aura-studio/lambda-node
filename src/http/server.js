'use strict';

const { Engine } = require('./engine');

let server = null;

/**
 * Serve starts the HTTP server.
 * Mirrors Go http.Serve().
 *
 * @param {Function[]} httpOpts - HTTP option functions
 * @param {Function[]} dynamicOpts - Dynamic option functions
 * @returns {Promise<void>}
 */
function serve(httpOpts = [], dynamicOpts = []) {
  return new Promise((resolve, reject) => {
    const engine = new Engine(httpOpts, dynamicOpts);

    // Parse address - support ":8080" format
    let host = '0.0.0.0';
    let port = 8080;
    const addr = engine.options.address;
    if (addr) {
      const parts = addr.split(':');
      if (parts.length === 2) {
        if (parts[0]) host = parts[0];
        port = parseInt(parts[1], 10) || 8080;
      } else {
        port = parseInt(addr, 10) || 8080;
      }
    }

    server = engine.app.listen(port, host, () => {
      console.log(`[lambda-node] HTTP server listening on ${host}:${port}`);
      resolve();
    });

    server.on('error', reject);
  });
}

/**
 * Close gracefully shuts down the HTTP server.
 * @returns {Promise<void>}
 */
function close() {
  return new Promise((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = {
  serve,
  close,
  Engine,
};
