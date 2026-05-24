'use strict';

const service = require('@aura-studio/service-node');

const app = {
  echo(ctx, payload) {
    ctx.setResponseMeta('handler', 'api-full');
    ctx.setResponseMeta('mode', 'api');
    ctx.setResponseMeta('variant', 'full');
    return {
      message: `hello ${payload.name || 'world'} from http api (full)`,
      mode: 'api',
      variant: 'full',
      route: ctx.route,
    };
  },
};

module.exports = service.new(app);
