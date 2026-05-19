'use strict';

const express = require('express');
const { newOptions } = require('./options');
const { cors } = require('./cors');
const { installHandlers } = require('./handlers');
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

    // Parse JSON and raw bodies
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    this.app.use(express.text({ limit: '50mb' }));

    // Enable CORS if configured
    if (this.options.corsMode) {
      this.app.use(cors());
    }

    // Install route handlers
    installHandlers(this);
  }
}

module.exports = {
  Engine,
};
