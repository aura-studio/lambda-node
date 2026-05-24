'use strict';

const wire = require('@aura-studio/wire-node');

function app(req, res) {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({
      handler: 'wapibundle',
      mode: 'wapi',
      variant: 'bundle',
      method: req.method,
      url: req.url,
      body: Buffer.concat(chunks).toString('utf8'),
    }));
  });
}

module.exports = wire.new(app);
