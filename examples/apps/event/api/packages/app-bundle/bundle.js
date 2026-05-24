'use strict';

const fs = require('fs');
const service = require('@aura-studio/service-node');

function mark(route, payload, variant) {
  if (payload.markerFile) {
    fs.appendFileSync(payload.markerFile, `${route}:${payload.name || ''}:${variant}\n`);
  }
  return { ok: true };
}

const app = {
  echo(ctx, payload) {
    return mark(ctx.route, payload, 'bundle');
  },

  notify(ctx, payload) {
    return mark(ctx.route, payload, 'bundle');
  },
};

module.exports = service.new(app);
