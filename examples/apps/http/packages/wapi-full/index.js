'use strict';

// HTTP wapi-mode package, "full" variant. NATIVE Express-style handler
// (req,res,next) wrapped inline as a Tunnel that runs against the live response.

function native(req, res) {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({
      handler: 'wapi-full',
      mode: 'wapi',
      variant: 'full',
      method: req.method,
      url: req.url,
      body: Buffer.concat(chunks).toString('utf8'),
    }));
  });
}

function meta() {
  return { name: 'wapi-full', mode: 'wapi', variant: 'full' };
}

module.exports = {
  async init() {},
  async close() {},
  async invoke(route, request) {
    const isHttp = request && typeof request === 'object'
      && (request.req || request.request) && (request.res || request.response);
    if (!isHttp) return '';
    const req = request.req || request.request;
    const res = request.res || request.response;
    const next = typeof request.next === 'function' ? request.next : undefined;
    const r = native(req, res, next);
    if (r && typeof r.then === 'function') await r;
    return r === undefined ? res : r;
  },
  async meta() { return JSON.stringify(meta()); },
};
