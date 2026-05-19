'use strict';

/**
 * Example package handler.
 * Receives an envelope { meta, data } and returns an envelope { meta, data }.
 */
function handler(req, res) {
  // Decode request data from base64
  const rawData = Buffer.from(req.data || '', 'base64').toString('utf8');

  // Process: echo back with prefix
  const response = JSON.stringify({ echo: rawData, route: req.meta.route || '' });

  // Encode response
  res.data = Buffer.from(response).toString('base64');
  res.meta = {};
}

function meta() {
  return JSON.stringify({
    name: 'example',
    version: 'v1',
    description: 'Example test package',
  });
}

module.exports = handler;
module.exports.meta = meta;
