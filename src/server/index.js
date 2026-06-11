'use strict';

const { serve, start, createHandler } = require('./server');
const options = require('./options');
const config = require('./config');

module.exports = {
  serve,
  start,
  createHandler,
  ...options,
  ...config,
};
