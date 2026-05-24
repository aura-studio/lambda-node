'use strict';

class Tunnel {
  async init() {}

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
    // Expose the inner route to the handler (lambda-node convention). Do NOT
    // clobber meta.Path when the framework already set it (HTTP mode sets it to
    // the full URL path, matching Go's reqMeta["Path"]); only fall back to route
    // when Path is absent (reqresp/sqs/event envelopes without a Path).
    reqObj.meta.route = route;
    if (reqObj.meta.Path == null || reqObj.meta.Path === '') {
      reqObj.meta.Path = route;
    }

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

class LambdaPackageTunnel extends Tunnel {
  constructor(mod, pkg, version) {
    super();
    this.mod = mod;
    this.pkg = pkg;
    this.version = version;
    this.envelope = new EnvelopeTunnel(
      envelopeHandlerFromModule(mod, pkg, version),
      metaFromModule(mod)
    );
  }

  async invoke(route, request) {
    if (isHTTPExchange(request)) {
      const handler = nativeHTTPHandlerFromModule(this.mod, this.pkg, this.version);
      const req = request.req || request.request;
      const res = request.res || request.response;
      const next = typeof request.next === 'function' ? request.next : undefined;
      const result = handler(req, res, next);
      if (result && typeof result.then === 'function') {
        await result;
      }
      return result === undefined ? res : result;
    }

    return this.envelope.invoke(route, request);
  }

  async meta() {
    return this.envelope.meta();
  }
}

function isHTTPExchange(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value.req || value.request) &&
    (value.res || value.response)
  );
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

function isTunnelLike(value) {
  if (!value) return false;
  const lower =
    typeof value.init === 'function' &&
    typeof value.invoke === 'function' &&
    typeof value.meta === 'function' &&
    typeof value.close === 'function';
  const upper =
    typeof value.Init === 'function' &&
    typeof value.Invoke === 'function' &&
    typeof value.Meta === 'function' &&
    typeof value.Close === 'function';
  return lower || upper;
}

function tunnelFromModule(mod, pkg, version) {
  if (isTunnelLike(mod)) return mod;
  if (mod && isTunnelLike(mod.Tunnel)) return mod.Tunnel;
  if (mod && typeof mod.New === 'function') return mod.New();
  return new LambdaPackageTunnel(mod, pkg, version);
}

module.exports = {
  Tunnel,
  EnvelopeTunnel,
  LambdaPackageTunnel,
  envelopeHandlerFromModule,
  metaFromModule,
  nativeHTTPHandlerFromModule,
  tunnelFromModule,
};
