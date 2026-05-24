'use strict';

// Event api-mode package, "full" variant (index.js). Event invocation is
// fire-and-forget (no response), so the handler records a side effect — it
// appends "<route>:<name>:<variant>" to the marker file given in the payload —
// which the test reads back to prove the dynamically loaded package ran.

const fs = require('fs');

function handler(req, res) {
  const route = (req.meta && (req.meta.route || req.meta.Path)) || '';
  const text = Buffer.from(req.data || '', 'base64').toString('utf8');
  let p = {};
  try { p = text ? JSON.parse(text) : {}; } catch (_) { p = { message: text }; }

  if (p.markerFile) {
    fs.appendFileSync(p.markerFile, `${route}:${p.name || ''}:full\n`);
  }

  res.meta = { handler: 'app-full', route, variant: 'full' };
  res.data = Buffer.from(JSON.stringify({ ok: true })).toString('base64');
}

function meta() {
  return { name: 'app-full', mode: 'api', variant: 'full', routes: ['/echo', '/notify'] };
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
