'use strict';

const { ContextPath, ContextError } = require('./context');

/**
 * Pattern matching for routes.
 * Supports exact match and wildcard *path suffix.
 *
 * Examples:
 *   "/api/*path" matches "/api/foo/bar" => param = "/foo/bar"
 *   "/health-check" matches "/health-check" => param = ""
 *
 * @param {string} pattern
 * @param {string} path
 * @returns {{ param: string, ok: boolean }}
 */
function matchPattern(pattern, path) {
  if (pattern.includes('*path')) {
    let prefix = pattern.replace('*path', '');
    if (!prefix.endsWith('/')) {
      prefix += '/';
    }
    if (!path.startsWith(prefix)) {
      return { param: '', ok: false };
    }
    const rest = path.slice(prefix.length);
    if (rest === '') {
      return { param: '/', ok: true };
    }
    return { param: '/' + rest, ok: true };
  }
  return { param: '', ok: pattern === path };
}

/**
 * Prepend a handler that sets ContextPath to the matched param.
 */
function withParam(handlers, param) {
  if (handlers.length === 0) {
    return handlers;
  }
  return [
    (c) => { c.set(ContextPath, param); },
    ...handlers,
  ];
}

/**
 * Router - lightweight pattern-matching router for non-HTTP modes.
 * Mirrors the Go reqresp/sqs/event Router struct.
 */
class Router {
  constructor() {
    this._pre = [];
    this._routes = [];
    this._noRoute = [];
  }

  /**
   * Register middleware handlers that run before route matching.
   * @param {...Function} handlers
   */
  use(...handlers) {
    this._pre.push(...handlers);
  }

  /**
   * Register a route pattern with one or more handlers.
   * @param {string} pattern
   * @param {...Function} handlers
   */
  handle(pattern, ...handlers) {
    this._routes.push({ pattern, handlers });
  }

  /**
   * Register fallback handlers when no route matches.
   * @param {...Function} handlers
   */
  noRoute(...handlers) {
    this._noRoute = handlers;
  }

  /**
   * Dispatch a context through middleware, route matching, and handlers.
   * @param {import('./context').Context} ctx
   */
  dispatch(ctx) {
    // Run pre-middleware
    for (const h of this._pre) {
      if (!h) continue;
      h(ctx);
      if (ctx.aborted) return;
    }

    // Match route
    const path = ctx.getString(ContextPath);
    let handlers = null;
    for (const rt of this._routes) {
      const { param, ok } = matchPattern(rt.pattern, path);
      if (ok) {
        handlers = withParam(rt.handlers, param);
        break;
      }
    }

    if (!handlers) {
      handlers = this._noRoute;
    }

    if (!handlers || handlers.length === 0) {
      ctx.set(ContextError, new Error(`no route for path: "${path}"`));
      return;
    }

    // Run matched handlers
    for (const h of handlers) {
      if (!h) continue;
      h(ctx);
      if (ctx.aborted) return;
      if (ctx.getError()) return;
    }
  }
}

module.exports = {
  Router,
  matchPattern,
};
