'use strict';

const {
  ContextPath,
  ContextHeader,
  ContextRequest,
  ContextResponse,
  ContextRequestMeta,
  ContextResponseMeta,
  ContextError,
  ContextPanic,
  ContextDebug,
  ContextStdout,
  ContextStderr,
  ReqMetaHost,
  ReqMetaRemoteAddr,
  ReqMetaPath,
  RspMetaError,
  RspMetaContentType,
  RspMetaStatus,
  HeaderOriginalPath,
} = require('../context');
const { normalizePath, matchMethod } = require('./options');
const { doSafe, doDebug } = require('../processor');

/**
 * Install all route handlers on the Engine.
 * Mirrors Go http/handlers.go InstallHandlers().
 *
 * @param {import('./engine').Engine} engine
 */
function installHandlers(engine) {
  const app = engine.app;
  const opts = engine.options;

  // Middleware: static link + prefix link rewriting
  app.use((req, res, next) => {
    req.url = normalizePath(req.url);

    // Static link rewrite
    if (opts.staticLinkMap[req.url]) {
      const rule = opts.staticLinkMap[req.url];
      if (matchMethod(rule, req.method)) {
        req.headers[HeaderOriginalPath.toLowerCase()] = req.url;
        req.url = rule.dst;
        // Re-enter the Express router
        app.handle(req, res);
        return;
      }
    }

    // Prefix link rewrite
    for (const [oldPrefix, rule] of Object.entries(opts.prefixLinkMap)) {
      if (req.url.startsWith(oldPrefix) && matchMethod(rule, req.method)) {
        req.headers[HeaderOriginalPath.toLowerCase()] = req.url;
        req.url = req.url.replace(oldPrefix, rule.dst);
        app.handle(req, res);
        return;
      }
    }

    next();
  });

  // Health check / root
  app.all('/', (req, res) => { res.status(200).send('OK'); });
  app.all('/health-check', (req, res) => { res.status(200).send('OK'); });

  // API routes: /api/{package}/{version}/{route...}
  app.all('/api/*', (req, res) => {
    handleAPI(engine, req, res, false);
  });

  // Debug API routes: /_/api/{package}/{version}/{route...}
  app.all('/_/api/*', (req, res) => {
    handleAPI(engine, req, res, true);
  });

  // Wire API routes: /wapi/{package}/{version}/{route...}
  app.all('/wapi/*', (req, res) => {
    handleWAPI(engine, req, res, false);
  });

  // Debug Wire API routes: /_/wapi/{package}/{version}/{route...}
  app.all('/_/wapi/*', (req, res) => {
    handleWAPI(engine, req, res, true);
  });

  // Meta routes: /meta/{package}/{version}
  app.all('/meta/*', (req, res) => {
    handleMeta(engine, req, res);
  });

  // 404 fallback
  app.use((req, res) => {
    handlePageNotFound(engine, req, res);
  });
}

/**
 * Handle API request with envelope encoding.
 */
function handleAPI(engine, req, res, debug) {
  // Extract wildcard path
  const apiPath = '/' + (req.params[0] || '');

  // Build request meta
  const reqMeta = genReqMeta(req);

  // Build request body
  let reqBody;
  if (req.method === 'GET' || req.method === 'HEAD') {
    reqBody = JSON.stringify(req.query || {});
  } else {
    reqBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  }

  // Context object to track state through processing
  const ctx = {
    [ContextPath]: apiPath,
    [ContextHeader]: req.headers,
    [ContextRequestMeta]: reqMeta,
    [ContextRequest]: reqBody,
    [ContextResponse]: '',
    [ContextResponseMeta]: null,
    [ContextError]: null,
    [ContextPanic]: null,
    [ContextDebug]: debug,
    [ContextStdout]: '',
    [ContextStderr]: '',
  };

  // Process
  const processFn = () => doProcessor(engine, ctx);

  if (debug) {
    const result = doDebug(processFn);
    ctx[ContextStdout] = result.stdout;
    ctx[ContextStderr] = result.stderr;
    ctx[ContextPanic] = result.error;
  } else {
    ctx[ContextPanic] = doSafe(processFn);
  }

  // Format response
  if (debug) {
    res.status(200).type('text/plain').send(formatDebug(req, ctx));
    return;
  }

  if (ctx[ContextPanic]) {
    console.error(ctx[ContextPanic].message || ctx[ContextPanic]);
    res.status(500).send('Internal Server Error');
    return;
  }

  if (ctx[ContextError]) {
    console.error(ctx[ContextError].message || ctx[ContextError]);
    res.status(500).send('Internal Server Error');
    return;
  }

  const rspMeta = ctx[ContextResponseMeta];
  let contentType = 'application/json';
  let statusCode = 200;

  if (rspMeta) {
    if (rspMeta[RspMetaError]) {
      res.status(500).send(String(rspMeta[RspMetaError]));
      return;
    }
    if (rspMeta[RspMetaContentType]) {
      contentType = String(rspMeta[RspMetaContentType]);
    }
    if (rspMeta[RspMetaStatus]) {
      statusCode = Number(rspMeta[RspMetaStatus]) || 200;
    }
  }

  res.status(statusCode).type(contentType).send(ctx[ContextResponse]);
}

/**
 * Handle WAPI (wire API) request - raw request/response passthrough.
 */
function handleWAPI(engine, req, res, debug) {
  const apiPath = '/' + (req.params[0] || '');

  const ctx = {
    [ContextPath]: apiPath,
    [ContextHeader]: req.headers,
    [ContextRequest]: '',
    [ContextResponse]: '',
    [ContextError]: null,
    [ContextPanic]: null,
    [ContextDebug]: debug,
    [ContextStdout]: '',
    [ContextStderr]: '',
  };

  // For WAPI, pass raw body as request
  const processFn = () => {
    const reqBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    ctx[ContextRequest] = reqBody;
    const rsp = handlePath(engine, apiPath, reqBody);
    ctx[ContextResponse] = rsp;
  };

  if (debug) {
    const result = doDebug(processFn);
    ctx[ContextStdout] = result.stdout;
    ctx[ContextStderr] = result.stderr;
    ctx[ContextPanic] = result.error;
  } else {
    ctx[ContextPanic] = doSafe(processFn);
  }

  if (debug) {
    res.status(200).type('text/plain').send(formatDebug(req, ctx));
    return;
  }

  if (ctx[ContextPanic]) {
    console.error(ctx[ContextPanic].message || ctx[ContextPanic]);
    res.status(500).send('Internal Server Error');
    return;
  }

  if (ctx[ContextError]) {
    console.error(ctx[ContextError].message || ctx[ContextError]);
    res.status(500).send('Internal Server Error');
    return;
  }

  res.status(200).type('application/json').send(ctx[ContextResponse]);
}

/**
 * Handle Meta request.
 */
function handleMeta(engine, req, res) {
  const metaPath = '/' + (req.params[0] || '');

  let response = '';
  let error = null;

  const panicErr = doSafe(() => {
    const result = metaHandler(engine, metaPath);
    response = result;
  });

  if (panicErr) {
    console.error(panicErr.message || panicErr);
    res.status(500).send('Internal Server Error');
    return;
  }

  if (error) {
    console.error(error.message || error);
    res.status(500).send('Internal Server Error');
    return;
  }

  res.status(200).type('application/json').send(response);
}

/**
 * Handle 404 page not found with optional rewrite rules.
 */
function handlePageNotFound(engine, req, res) {
  const opts = engine.options;

  for (const rule of opts.pageNotFoundRules) {
    if (rule.dst && matchMethod(rule, req.method)) {
      req.headers[HeaderOriginalPath.toLowerCase()] = req.url;
      req.url = rule.dst;
      engine.app.handle(req, res);
      return;
    }
  }

  res.status(404).send('Not Found');
}

// ==================== Internal functions ====================

/**
 * Process an API request through envelope encoding.
 */
function doProcessor(engine, ctx) {
  const path_ = ctx[ContextPath];
  const req = ctx[ContextRequest];
  const reqMeta = ctx[ContextRequestMeta] || {};

  // Encode request envelope: { meta: {}, data: base64(req) }
  const reqEnvelope = {
    meta: reqMeta,
    data: Buffer.from(req, 'utf8').toString('base64'),
  };

  const rsp = handlePath(engine, path_, JSON.stringify(reqEnvelope));

  // Decode response envelope
  let rspEnvelope;
  try {
    rspEnvelope = JSON.parse(rsp);
  } catch (_) {
    ctx[ContextResponse] = rsp;
    return;
  }

  if (rspEnvelope.meta && Object.keys(rspEnvelope.meta).length > 0) {
    ctx[ContextResponseMeta] = rspEnvelope.meta;
  }

  if (rspEnvelope.meta && rspEnvelope.meta[RspMetaError]) {
    ctx[ContextError] = new Error(String(rspEnvelope.meta[RspMetaError]));
    return;
  }

  if (rspEnvelope.data) {
    try {
      ctx[ContextResponse] = Buffer.from(rspEnvelope.data, 'base64').toString('utf8');
    } catch (err) {
      ctx[ContextError] = err;
    }
  } else {
    ctx[ContextResponse] = '';
  }
}

/**
 * Route a path to the correct package and invoke it.
 * Path format: /{package}/{version}/{route...}
 *
 * @param {import('./engine').Engine} engine
 * @param {string} path_
 * @param {string} req
 * @returns {string}
 */
function handlePath(engine, path_, req) {
  const parts = path_.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length < 2) {
    throw new Error(`invalid path: "${path_}"`);
  }

  const pkg = parts[0];
  const version = parts[1];
  const route = '/' + parts.slice(2).join('/');

  const tunnel = engine.dynamic.getPackage(pkg, version);
  return tunnel.invoke(route, req);
}

/**
 * Get meta information for a package.
 */
function metaHandler(engine, path_) {
  let tunnelMeta = '';
  const parts = path_.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length >= 2) {
    const pkg = parts[0];
    const version = parts[1];
    try {
      const tunnel = engine.dynamic.getPackage(pkg, version);
      tunnelMeta = tunnel.meta();
    } catch (_) {
      // Package not found, return base meta
    }
  }

  return engine.dynamic.metaGenerator.generate(tunnelMeta);
}

/**
 * Build request meta from Express request.
 */
function genReqMeta(req) {
  const meta = {};

  // Resolve host
  let host = req.hostname || req.headers.host || '';
  if (req.headers['x-forwarded-host']) {
    host = req.headers['x-forwarded-host'];
  }
  meta[ReqMetaHost] = host.split(',')[0].split(':')[0].trim();

  // Resolve remote address
  let remoteAddr = req.ip || req.connection?.remoteAddress || '';
  if (req.headers['cloudfront-viewer-address']) {
    remoteAddr = req.headers['cloudfront-viewer-address'];
  } else if (req.headers['x-forwarded-for']) {
    remoteAddr = req.headers['x-forwarded-for'];
  }
  meta[ReqMetaRemoteAddr] = remoteAddr.split(',')[0].trim();

  // Path
  meta[ReqMetaPath] = req.url;

  return meta;
}

/**
 * Format debug output.
 */
function formatDebug(req, ctx) {
  const lines = [];
  lines.push(`Schema: ${req.protocol || ''}`);
  lines.push(`Method: ${req.method}`);
  lines.push(`Host: ${req.hostname || ''}`);
  lines.push(`Path: ${ctx[ContextPath]}`);
  lines.push(`Header: ${JSON.stringify(ctx[ContextHeader] || {})}`);
  lines.push(`Request Meta: ${JSON.stringify(ctx[ContextRequestMeta] || {})}`);
  lines.push(`Response Meta: ${JSON.stringify(ctx[ContextResponseMeta] || {})}`);
  lines.push(`Stdout: ${ctx[ContextStdout] || ''}`);
  lines.push(`Stderr: ${ctx[ContextStderr] || ''}`);
  lines.push(`Error: ${ctx[ContextError] ? (ctx[ContextError].message || ctx[ContextError]) : ''}`);
  lines.push(`Panic: ${ctx[ContextPanic] ? (ctx[ContextPanic].message || ctx[ContextPanic]) : ''}`);
  lines.push(`Request: ${ctx[ContextRequest] || ''}`);
  lines.push(`Response: ${ctx[ContextResponse] || ''}`);
  return lines.join('\n') + '\n';
}

module.exports = {
  installHandlers,
};
