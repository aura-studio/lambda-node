'use strict';

// HTTP api-mode package, "bundle" variant (loaded as a single self-contained
// bundle.js — no external require). Envelope handler wrapped inline as a Tunnel.

function handler(req, res) {
  const route = (req.meta && (req.meta.route || req.meta.Path)) || '';
  const text = Buffer.from(req.data || '', 'base64').toString('utf8');
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = { message: text }; }

  res.meta = { handler: 'api-bundle', route, mode: 'api', variant: 'bundle' };
  res.data = Buffer.from(JSON.stringify({
    message: `hello ${payload.name || 'world'} from http api (bundle)`,
    mode: 'api',
    variant: 'bundle',
    route,
  })).toString('base64');
}

function meta() {
  return { name: 'api-bundle', mode: 'api', variant: 'bundle' };
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
