'use strict';

/**
 * CORS middleware for Express.
 * Mirrors the Go http/cors.go Cors() handler.
 *
 * @returns {Function} Express middleware
 */
function cors() {
  return (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, PUT, DELETE, UPDATE');
    res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, ServerCategory');
    res.set('Access-Control-Expose-Headers', 'Content-Length, Access-Control-Allow-Origin, Access-Control-Allow-Headers, Cache-Control, Content-Language, Content-Type, ETag');
    res.set('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}

module.exports = { cors };
