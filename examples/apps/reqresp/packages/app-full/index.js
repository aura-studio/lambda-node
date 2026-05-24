'use strict';

// ReqResp api-mode package, "full" variant (index.js). Envelope handler that
// supports two routes (/echo, /sum), wrapped inline as a dynamic-node Tunnel.

function handler(req, res) {
  const route = (req.meta && (req.meta.route || req.meta.Path)) || '';
  const text = Buffer.from(req.data || '', 'base64').toString('utf8');
  let p = {};
  try { p = text ? JSON.parse(text) : {}; } catch (_) { p = { message: text }; }

  let result;
  if (route === '/sum') {
    result = { op: 'sum', sum: (Number(p.a) || 0) + (Number(p.b) || 0), variant: 'full' };
  } else {
    result = { op: 'echo', message: `hello ${p.name || 'world'} from reqresp api (full)`, variant: 'full', route };
  }

  res.meta = { handler: 'app-full', route, variant: 'full' };
  res.data = Buffer.from(JSON.stringify(result)).toString('base64');
}

function meta() {
  return { name: 'app-full', mode: 'api', variant: 'full', routes: ['/echo', '/sum'] };
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
