'use strict';

// HTTP api-mode package, "full" variant (loaded as index.js from a dir).
// Envelope handler (req,res)=>void wrapped inline as a dynamic-node Tunnel.

function handler(req, res) {
  const route = (req.meta && (req.meta.route || req.meta.Path)) || '';
  const text = Buffer.from(req.data || '', 'base64').toString('utf8');
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = { message: text }; }

  res.meta = { handler: 'api-full', route, mode: 'api', variant: 'full' };
  res.data = Buffer.from(JSON.stringify({
    message: `hello ${payload.name || 'world'} from http api (full)`,
    mode: 'api',
    variant: 'full',
    route,
  })).toString('base64');
}

function meta() {
  return { name: 'api-full', mode: 'api', variant: 'full' };
}

module.exports = {
  async init() {},
  async close() {},
  async invoke(route, request) {
    let r;
    try { r = JSON.parse(request); } catch (_) { r = { meta: {}, data: '' }; }
    if (!r || typeof r !== 'object') r = { meta: {}, data: '' };
    if (!r.meta || typeof r.meta !== 'object') r.meta = {};
    r.meta.route = route;
    if (r.meta.Path == null || r.meta.Path === '') r.meta.Path = route;
    const res = { meta: {}, data: '' };
    try { await handler(r, res); } catch (e) { res.meta.Error = e && e.message ? e.message : String(e); }
    return JSON.stringify(res);
  },
  async meta() { return JSON.stringify(meta()); },
};
