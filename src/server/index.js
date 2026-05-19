'use strict';

const { serve } = require('./server');
const options = require('./options');
const config = require('./config');

module.exports = {
  serve,
  ...options,
  ...config,
};
