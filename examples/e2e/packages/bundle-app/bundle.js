'use strict';

// Bundle-variant e2e package. Built/uploaded under toolchain variant "bundle",
// so dynamic-node loads THIS single self-contained `bundle.js` (not index.js +
// package.json). It must therefore inline its own envelope-tunnel wrapper with
// no external require — exactly what a real bundler (esbuild) would emit.

function handler(req, res) {
  const route = (req.meta && (req.meta.route || req.meta.Path)) || '';
  const text = Buffer.from(req.data || '', 'base64').toString('utf8');
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_) {
    payload = { message: text };
  }

  res.meta = { handler: 'bundle-app', route, variant: 'bundle', loadedFrom: 's3+localstack' };
  res.data = Buffer.from(JSON.stringify({
    message: `hello ${payload.name || 'world'} from bundle e2e`,
    variant: 'bundle',
    route,
    received: payload,
  })).toString('base64');
}

function meta() {
  return { name: 'bundle-app', version: 'v1', variant: 'bundle', loadedFrom: 's3' };
}

// Inlined envelope tunnel (self-contained — no require of ./tunnel-adapter).
module.exports = {
  async init() {},
  async close() {},
  async invoke(route, request) {
    let reqObj;
    try {
      reqObj = JSON.parse(request);
    } catch (_) {
      reqObj = { meta: {}, data: '' };
    }
    if (!reqObj || typeof reqObj !== 'object') reqObj = { meta: {}, data: '' };
    if (!reqObj.meta || typeof reqObj.meta !== 'object') reqObj.meta = {};
    reqObj.meta.route = route;
    if (reqObj.meta.Path == null || reqObj.meta.Path === '') reqObj.meta.Path = route;

    const resObj = { meta: {}, data: '' };
    try {
      await handler(reqObj, resObj);
    } catch (err) {
      resObj.meta.Error = err && err.message ? err.message : String(err);
    }
    return JSON.stringify(resObj);
  },
  async meta() {
    return JSON.stringify(meta());
  },
};
