'use strict';

async function handler(req, res) {
  const url = new URL(req.url, 'http://lambda-node.local');
  const body = await readBody(req);

  res.setHeader('content-type', 'application/json');

  if (req.method === 'GET' && url.pathname === '/hello') {
    res.end(JSON.stringify({
      greeting: `Hello, ${url.searchParams.get('name') || 'World'}!`,
      url: req.url,
    }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/echo') {
    res.end(JSON.stringify({
      method: req.method,
      url: req.url,
      body,
    }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({
    error: 'not found',
    method: req.method,
    url: req.url,
  }));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('error', reject);
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function meta() {
  return JSON.stringify({
    name: 'web',
    version: 'v1',
  });
}

module.exports = handler;
module.exports.meta = meta;
