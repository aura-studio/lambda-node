'use strict';

const express = require('express');
const { newOptions } = require('./options');
const { cors } = require('./cors');
const { installRewriteHandlers, installRawHandlers, installHandlers } = require('./handlers');
const { Dynamic } = require('../dynamic/dynamic');

/**
 * Engine - HTTP mode engine.
 * Mirrors the Go http.Engine struct (Options + gin.Engine + Dynamic).
 *
 * @property {object} options - HTTP options
 * @property {express.Express} app - Express application
 * @property {Dynamic} dynamic - Dynamic package loader
 */
class Engine {
  /**
   * @param {Function[]} httpOpts - HTTP option functions
   * @param {Function[]} dynamicOpts - Dynamic option functions
   */
  constructor(httpOpts = [], dynamicOpts = []) {
    this.options = newOptions(...httpOpts);
    this.app = express();
    this.dynamic = new Dynamic(...dynamicOpts);

    if (this.options.corsMode) {
      this.app.use(cors());
    }

    installRewriteHandlers(this);
    installRawHandlers(this);

    // Capture the request body as raw bytes for envelope-mode (/api) handlers.
    // This mirrors Go's genPostReq (io.ReadAll of the body), preserving the
    // exact bytes — required for signature/HMAC verification and binary bodies.
    // Native /wapi packages are mounted before this parser so their own handler
    // can read the request stream directly.
    this.app.use(express.raw({ type: () => true, limit: '50mb' }));

    installHandlers(this);
  }
}

module.exports = {
  Engine,
};
