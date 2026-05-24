'use strict';

// WAPI mode e2e package. Loaded from LocalStack S3 and invoked through
// lambda-node's HTTP /wapi path as a NATIVE Express-style handler
// (req, res, next) — i.e. the package reads the request stream and writes the
// response itself, instead of the (req,res)=>void envelope contract.

const { makeHttpTunnel } = require('./tunnel-adapter');

function nativeHandler(req, res) {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({
      handler: 'wapi-app',
      method: req.method,
      url: req.url,
      body: Buffer.concat(chunks).toString('utf8'),
      loadedFrom: 's3+localstack',
    }));
  });
}

function meta() {
  return { name: 'wapi-app', version: 'v1', mode: 'wapi', loadedFrom: 's3' };
}

module.exports = makeHttpTunnel(nativeHandler, meta);
