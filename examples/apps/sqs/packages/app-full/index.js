'use strict';

const service = require('@aura-studio/service-node');

const app = {
  echo(ctx, payload) {
    ctx.setResponseMeta('handler', 'app-full');
    ctx.setResponseMeta('variant', 'full');
    return {
      op: 'echo',
      message: `processed ${payload.name || 'world'} via sqs api (full)`,
      variant: 'full',
      route: ctx.route,
    };
  },

  sum(_ctx, payload) {
    return {
      op: 'sum',
      sum: (Number(payload.a) || 0) + (Number(payload.b) || 0),
      variant: 'full',
    };
  },
};

module.exports = service.new(app);
