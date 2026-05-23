'use strict';

const { serve, start, createHandler, close, Engine } = require('./server');
const options = require('./options');
const config = require('./config');
const defaultConfig = require('./default_config');

module.exports = {
  serve,
  start,
  createHandler,
  close,
  Engine,
  ...options,
  ...config,
  ...defaultConfig,
};
