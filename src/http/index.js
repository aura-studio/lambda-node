'use strict';

const { serve, close, Engine } = require('./server');
const options = require('./options');
const config = require('./config');
const defaultConfig = require('./default_config');
const { cors } = require('./cors');

module.exports = {
  serve,
  close,
  Engine,
  cors,
  ...options,
  ...config,
  ...defaultConfig,
};
