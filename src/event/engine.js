'use strict';

const { newOptions } = require('./options');
const { Router } = require('./router');
const { Dynamic } = require('../dynamic/dynamic');
const { Context, ContextPath, ContextRequest, ContextResponse, ContextPanic } = require('./context');
const { installHandlers } = require('./handlers');
const { decodePayload } = require('../protocol/payload');

class Engine {
  constructor(eventOpts = [], dynamicOpts = []) {
    this.options = newOptions(...eventOpts);
    this.dynamic = new Dynamic(...dynamicOpts);
    this.router = new Router();
    installHandlers(this);
  }

  async invoke(event) {
    const req = event || {};
    const c = new Context();
    c.set(ContextPath, req.path || '');
    c.set(ContextRequest, decodePayload(req.payload));

    if (this.options.debugMode) console.log(`[Event] Request: ${c.getString(ContextPath)} ${c.getString(ContextRequest)}`);

    await this.router.dispatch(c);

    if (this.options.debugMode) console.log(`[Event] Response: ${c.getString(ContextPath)} ${c.getString(ContextResponse)}`);

    const [panicVal] = c.get(ContextPanic);
    if (panicVal) throw panicVal instanceof Error ? panicVal : new Error(String(panicVal));

    const err = c.getError();
    if (err) throw err;

    return null;
  }
}

module.exports = { Engine };
