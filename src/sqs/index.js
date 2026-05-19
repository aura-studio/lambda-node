'use strict';

const { serve, close, Engine } = require('./server');
const options = require('./options');
const config = require('./config');
const defaultConfig = require('./default_config');

module.exports = {
  serve,
  close,
  Engine,
  ...options,
  ...config,
  ...defaultConfig,
};
