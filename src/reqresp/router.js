'use strict';

const { ContextPath, ContextError } = require('./context');

function matchPattern(pattern, path) {
  if (pattern.includes('*path')) {
    let prefix = pattern.replace('*path', '');
    if (!prefix.endsWith('/')) prefix += '/';
    if (!path.startsWith(prefix)) return { param: '', ok: false };
    const rest = path.slice(prefix.length);
    if (rest === '') return { param: '/', ok: true };
    return { param: '/' + rest, ok: true };
  }
  return { param: '', ok: pattern === path };
}

function withParam(handlers, param) {
  if (handlers.length === 0) return handlers;
  return [(c) => { c.set(ContextPath, param); }, ...handlers];
}

class Router {
  constructor() {
    this._pre = [];
    this._routes = [];
    this._noRoute = [];
  }

  use(...handlers) { this._pre.push(...handlers); }

  handle(pattern, ...handlers) {
    this._routes.push({ pattern, handlers });
  }

  noRoute(...handlers) { this._noRoute = handlers; }

  async dispatch(ctx) {
    for (const h of this._pre) {
      if (!h) continue;
      await h(ctx);
      if (ctx.aborted) return;
    }

    const path = ctx.getString(ContextPath);
    let handlers = null;
    for (const rt of this._routes) {
      const { param, ok } = matchPattern(rt.pattern, path);
      if (ok) { handlers = withParam(rt.handlers, param); break; }
    }

    if (!handlers) handlers = this._noRoute;

    if (!handlers || handlers.length === 0) {
      ctx.set(ContextError, new Error(`no route for path: "${path}"`));
      return;
    }

    for (const h of handlers) {
      if (!h) continue;
      await h(ctx);
      if (ctx.aborted) return;
      if (ctx.getError()) return;
    }
  }
}

module.exports = { Router, matchPattern };