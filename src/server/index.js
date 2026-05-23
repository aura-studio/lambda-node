'use strict';

const { serve, start } = require('./server');
const options = require('./options');
const config = require('./config');

module.exports = {
  serve,
  start,
  ...options,
  ...config,
};
