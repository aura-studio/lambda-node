'use strict';

const { newOptions } = require('./options');
const { Router } = require('../router');
const { Dynamic } = require('../dynamic/dynamic');
const { Context, ContextPath, ContextRequest, ContextResponse, ContextPanic } = require('../context');
const { installHandlers } = require('./handlers');

/**
 * Engine - Event mode engine (fire-and-forget).
 * Mirrors Go event.Engine (Options + Router + Dynamic).
 *
 * Unlike ReqResp, Event mode only returns an error (no response payload).
 */
class Engine {
  /**
   * @param {Function[]} eventOpts
   * @param {Function[]} dynamicOpts
   */
  constructor(eventOpts = [], dynamicOpts = []) {
    this.options = newOptions(...eventOpts);
    this.dynamic = new Dynamic(...dynamicOpts);
    this.router = new Router();
    installHandlers(this);
  }

  /**
   * Invoke processes an Event request.
   * Input: { path: string, payload: string }
   * Returns: error or null (fire-and-forget)
   *
   * Mirrors Go event.Engine.Invoke().
   *
   * @param {object} event - Lambda event
   * @returns {null} - throws on error
   */
  invoke(event) {
    const req = event || {};
    const c = new Context();
    c.set(ContextPath, req.path || '');
    c.set(ContextRequest, typeof req.payload === 'string' ? req.payload : String(req.payload || ''));

    if (this.options.debugMode) {
      console.log(`[Event] Request: ${c.getString(ContextPath)} ${c.getString(ContextRequest)}`);
    }

    this.router.dispatch(c);

    if (this.options.debugMode) {
      console.log(`[Event] Response: ${c.getString(ContextPath)} ${c.getString(ContextResponse)}`);
    }

    // Check for errors
    const [panicVal] = c.get(ContextPanic);
    if (panicVal) {
      throw panicVal instanceof Error ? panicVal : new Error(String(panicVal));
    }

    const err = c.getError();
    if (err) {
      throw err;
    }

    return null;
  }
}

module.exports = { Engine };
