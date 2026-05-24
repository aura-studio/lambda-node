'use strict';

const service = require('@aura-studio/service-node');

const app = {
  echo(ctx, payload) {
    ctx.setResponseMeta('handler', 'app-bundle');
    ctx.setResponseMeta('variant', 'bundle');
    return {
      op: 'echo',
      message: `hello ${payload.name || 'world'} from reqresp api (bundle)`,
      variant: 'bundle',
      route: ctx.route,
    };
  },

  sum(_ctx, payload) {
    return {
      op: 'sum',
      sum: (Number(payload.a) || 0) + (Number(payload.b) || 0),
      variant: 'bundle',
    };
  },
};

module.exports = service.new(app);
