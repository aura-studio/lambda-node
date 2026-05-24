'use strict';

// Minimal lambda-node-compatible envelope tunnel, bundled into each warehouse
// package zip. dynamic-node loads a warehouse module and resolves it to a Tunnel
// (it requires init/invoke/meta/close), so a (req,res) envelope handler must be
// wrapped. In a real deployment the build tool (lambda-node-cli / dynamic-cli)
// generates an equivalent wrapper; here we inline it so the package zip is
// self-contained.

function makeTunnel(handler, metaFn) {
  return {
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
      if (!metaFn) return '';
      try {
        const result = await metaFn();
        return typeof result === 'string' ? result : JSON.stringify(result);
      } catch (_) {
        return '';
      }
    },
  };
}

// makeHttpTunnel wraps a native Express-style handler (req, res, next) so it can
// be loaded from the warehouse as a Tunnel and driven through lambda-node's
// /wapi path. lambda-node calls invoke(route, { req, res, next }); we detect the
// HTTP exchange and run the native handler directly against the live res.
function makeHttpTunnel(nativeHandler, metaFn) {
  return {
    async init() {},
    async close() {},
    async invoke(route, request) {
      const isHttp =
        request &&
        typeof request === 'object' &&
        (request.req || request.request) &&
        (request.res || request.response);
      if (!isHttp) return '';

      const req = request.req || request.request;
      const res = request.res || request.response;
      const next = typeof request.next === 'function' ? request.next : undefined;
      const result = nativeHandler(req, res, next);
      if (result && typeof result.then === 'function') await result;
      return result === undefined ? res : result;
    },
    async meta() {
      if (!metaFn) return '';
      try {
        const result = await metaFn();
        return typeof result === 'string' ? result : JSON.stringify(result);
      } catch (_) {
        return '';
      }
    },
  };
}

module.exports = { makeTunnel, makeHttpTunnel };
