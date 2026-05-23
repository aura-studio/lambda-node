'use strict';

function handler(req, res) {
  const rawData = Buffer.from(req.data || '', 'base64').toString('utf8');

  let input;
  try {
    input = JSON.parse(rawData);
  } catch (_) {
    input = { message: rawData };
  }

  const name = input.name || 'World';
  const response = {
    greeting: `Hello, ${name}!`,
    route: req.meta.Path || req.meta.route || '',
  };

  res.data = Buffer.from(JSON.stringify(response)).toString('base64');
  res.meta = {};
}

function meta() {
  return JSON.stringify({
    name: 'greeter',
    version: 'v1',
  });
}

module.exports = handler;
module.exports.meta = meta;
