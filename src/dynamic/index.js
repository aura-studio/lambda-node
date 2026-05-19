'use strict';

const { Dynamic } = require('./dynamic');
const options = require('./options');
const config = require('./config');
const defaultConfig = require('./default_config');
const { MetaGenerator } = require('./meta');

module.exports = {
  Dynamic,
  MetaGenerator,
  ...options,
  ...config,
  ...defaultConfig,
};
