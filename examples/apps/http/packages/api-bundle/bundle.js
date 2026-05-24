'use strict';

const service = require('@aura-studio/service-node');

const app = {
  echo(ctx, payload) {
    ctx.setResponseMeta('handler', 'api-bundle');
    ctx.setResponseMeta('mode', 'api');
    ctx.setResponseMeta('variant', 'bundle');
    return {
      message: `hello ${payload.name || 'world'} from http api (bundle)`,
      mode: 'api',
      variant: 'bundle',
      route: ctx.route,
    };
  },
};

module.exports = service.new(app);
