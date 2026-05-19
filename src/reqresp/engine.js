'use strict';

const { newOptions } = require('./options');
const { Router } = require('../router');
const { Dynamic } = require('../dynamic/dynamic');
const { Context, ContextPath, ContextRequest, ContextResponse, ContextPanic } = require('../context');
const { installHandlers } = require('./handlers');

/**
 * Engine - ReqResp mode engine.
 * Mirrors Go reqresp.Engine (Options + Router + Dynamic).
 */
class Engine {
  /**
   * @param {Function[]} reqrespOpts
   * @param {Function[]} dynamicOpts
   */
  constructor(reqrespOpts = [], dynamicOpts = []) {
    this.options = newOptions(...reqrespOpts);
    this.dynamic = new Dynamic(...dynamicOpts);
    this.router = new Router();
    installHandlers(this);
  }

  /**
   * Invoke processes a ReqResp request.
   * Input: { path: string, payload: Buffer|string }
   * Output: { payload: string, error: string }
   *
   * Mirrors Go reqresp.Engine.Invoke().
   *
   * @param {object} event - Lambda event
   * @returns {object} response
   */
  invoke(event) {
    const req = event || {};
    const c = new Context();
    c.set(ContextPath, req.path || '');
    c.set(ContextRequest, typeof req.payload === 'string' ? req.payload : String(req.payload || ''));

    if (this.options.debugMode) {
      console.log(`[ReqResp] Request: ${c.getString(ContextPath)} ${c.getString(ContextRequest)}`);
    }

    this.router.dispatch(c);

    if (this.options.debugMode) {
      console.log(`[ReqResp] Response: ${c.getString(ContextPath)} ${c.getString(ContextResponse)}`);
    }

    const resp = {
      payload: c.getString(ContextResponse),
      error: '',
    };

    const [panicVal] = c.get(ContextPanic);
    if (panicVal) {
      resp.error = panicVal.message || String(panicVal);
    } else {
      const err = c.getError();
      if (err) {
        resp.error = err.message || String(err);
      }
    }

    if (resp.error && this.options.debugMode) {
      console.log(`[ReqResp] Error: ${resp.error}`);
    }

    return resp;
  }
}

module.exports = { Engine };
