'use strict';

class Tunnel {
  async invoke(route, request) {
    throw new Error('Tunnel.invoke(route, request) is not implemented');
  }

  async meta() {
    return '';
  }

  async close() {}
}

class EnvelopeTunnel extends Tunnel {
  constructor(handler, metaFn = null) {
    super();
    this.handler = handler;
    this.metaFn = metaFn;
  }

  async invoke(route, request) {
    let reqObj;
    try {
      reqObj = JSON.parse(request);
    } catch (_) {
      reqObj = { meta: {}, data: '' };
    }

    if (!reqObj || typeof reqObj !== 'object') {
      reqObj = { meta: {}, data: '' };
    }
    if (!reqObj.meta || typeof reqObj.meta !== 'object') {
      reqObj.meta = {};
    }
    reqObj.meta.Path = route;
    reqObj.meta.route = route;

    const resObj = { meta: {}, data: '' };

    try {
      await this.handler(reqObj, resObj, { route });
    } catch (err) {
      resObj.meta.Error = err && err.message ? err.message : String(err);
    }

    return JSON.stringify(resObj);
  }

  async meta() {
    if (!this.metaFn) return '';

    try {
      const result = await this.metaFn();
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (_) {
      return '';
    }
  }
}

function envelopeHandlerFromModule(mod, pkg, version) {
  if (typeof mod === 'function') return mod;
  if (mod && typeof mod.default === 'function') return mod.default;
  if (mod && typeof mod.handler === 'function') return mod.handler;

  throw new Error(`package ${pkg}@${version} does not export an envelope handler`);
}

function metaFromModule(mod) {
  if (mod && typeof mod.meta === 'function') return mod.meta;
  if (mod && typeof mod.meta === 'string') return () => mod.meta;
  return null;
}

function nativeHTTPHandlerFromModule(mod, pkg, version) {
  const candidates = [
    mod,
    mod && mod.default,
    mod && mod.handler,
    mod && mod.app,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === 'function') return candidate;
    if (typeof candidate.callback === 'function') return candidate.callback();
    if (typeof candidate.handle === 'function') {
      return (req, res, next) => candidate.handle(req, res, next);
    }
  }

  throw new Error(`package ${pkg}@${version} does not export a native HTTP handler`);
}

module.exports = {
  Tunnel,
  EnvelopeTunnel,
  envelopeHandlerFromModule,
  metaFromModule,
  nativeHTTPHandlerFromModule,
};
