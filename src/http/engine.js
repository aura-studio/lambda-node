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

    // Parse request bodies for envelope-mode handlers only. Native /wapi
    // packages are mounted before these parsers so their own app can read req.
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    this.app.use(express.text({ limit: '50mb' }));

    installHandlers(this);
  }
}

module.exports = {
  Engine,
};
