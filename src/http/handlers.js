'use strict';

const ContextPath = 'Path';
const ContextHeader = 'Header';
const ContextRequest = 'Request';
const ContextResponse = 'Response';
const ContextRequestMeta = 'RequestMeta';
const ContextResponseMeta = 'ResponseMeta';
const ContextError = 'Error';
const ContextPanic = 'Panic';
const ContextDebug = 'Debug';
const ContextStdout = 'Stdout';
const ContextStderr = 'Stderr';

const ReqMetaHost = 'Host';
const ReqMetaRemoteAddr = 'RemoteAddr';
const ReqMetaPath = 'Path';

const RspMetaError = 'Error';
const RspMetaContentType = 'ContentType';
const RspMetaStatus = 'Status';

const HeaderOriginalPath = 'X-Original-Path';

const { normalizePath, matchMethod } = require('./options');
const { doSafeAsync, doDebugAsync } = require('./processor');

// Mirror Go's http.methods / HandleAllMethods: register exactly these standard
// methods per route so that any non-standard method (e.g. TRACE, PROPFIND) falls
// through to the page-not-found handler and yields 404, matching Go (whose
// MethodNotAllowed handler is registered but unreachable — HandleMethodNotAllowed
// is never enabled, so gin routes unmatched methods to NoRoute → 404).
const METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];

function handleMethods(app, path, handler) {
  for (const method of METHODS) {
    app[method](path, handler);
  }
}

function installRewriteHandlers(engine) {
  const app = engine.app;
  const opts = engine.options;

  app.use((req, res, next) => {
    // Don't mutate req.url to the normalized form — normalizePath strips
    // trailing slashes which makes /foo/ indistinguishable from /foo by the
    // time handleWAPI sees req.params[0]. Compute a normalized pathname only
    // for match comparisons; rewrite preserves the original trailing slash.
    const originalUrl = req.url || '/';
    const { pathname, search } = splitURL(originalUrl);
    const originalPathPart = originalUrl.split(/[?#]/)[0] || '/';
    const hadTrailingSlash = originalPathPart.length > 1 && originalPathPart.endsWith('/');

    if (opts.staticLinkMap[pathname]) {
      const rule = opts.staticLinkMap[pathname];
      if (matchMethod(rule, req.method)) {
        req.headers[HeaderOriginalPath.toLowerCase()] = originalUrl;
        req.url = rule.dst + search;
        app.handle(req, res);
        return;
      }
    }

    for (const [oldPrefix, rule] of Object.entries(opts.prefixLinkMap)) {
      if (pathname.startsWith(oldPrefix) && matchMethod(rule, req.method)) {
        req.headers[HeaderOriginalPath.toLowerCase()] = originalUrl;
        let rewritten = pathname.replace(oldPrefix, rule.dst);
        if (hadTrailingSlash && !rewritten.endsWith('/')) {
          rewritten += '/';
        }
        req.url = rewritten + search;
        app.handle(req, res);
        return;
      }
    }

    next();
  });
}

function installRawHandlers(engine) {
  const app = engine.app;

  handleMethods(app, /^\/wapi(?:\/(.*))?$/, async (req, res) => {
    await handleWAPI(engine, req, res, false, req.params[0] || '');
  });
  handleMethods(app, /^\/_\/wapi(?:\/(.*))?$/, async (req, res) => {
    await handleWAPI(engine, req, res, true, req.params[0] || '');
  });
}

function installHandlers(engine) {
  const app = engine.app;

  handleMethods(app, '/', (req, res) => { res.status(200).send('OK'); });
  handleMethods(app, '/health-check', (req, res) => { res.status(200).send('OK'); });

  handleMethods(app, '/api/*', async (req, res) => { await handleAPI(engine, req, res, false); });
  handleMethods(app, '/_/api/*', async (req, res) => { await handleAPI(engine, req, res, true); });
  handleMethods(app, '/meta/*', async (req, res) => { await handleMeta(engine, req, res); });

  app.use((req, res) => { handlePageNotFound(engine, req, res); });
}

function splitURL(url) {
  const idx = url.indexOf('?');
  if (idx < 0) return { pathname: normalizePath(url), search: '' };
  return {
    pathname: normalizePath(url.slice(0, idx)),
    search: url.slice(idx),
  };
}

function normalizeURL(url) {
  const { pathname, search } = splitURL(url || '/');
  return pathname + search;
}

async function handleAPI(engine, req, res, debug) {
  const apiPath = '/' + (req.params[0] || '');
  const reqMeta = genReqMeta(req);

  // Mirror Go http.handlers: GET (and empty method) -> query map (first value
  // per key); POST -> raw body bytes; any other method -> empty. The request is
  // carried as a Buffer so binary/exact bytes survive the base64 envelope.
  const method = (req.method || 'GET').toUpperCase();
  let reqBuf;
  if (method === 'GET' || method === '') {
    reqBuf = Buffer.from(genGetReq(req), 'utf8');
  } else if (method === 'POST') {
    reqBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  } else {
    reqBuf = Buffer.alloc(0);
  }

  const ctx = {
    [ContextPath]: apiPath,
    [ContextHeader]: req.headers,
    [ContextRequestMeta]: reqMeta,
    [ContextRequest]: reqBuf,
    [ContextResponse]: '',
    [ContextResponseMeta]: null,
    [ContextError]: null,
    [ContextPanic]: null,
    [ContextDebug]: debug,
    [ContextStdout]: '',
    [ContextStderr]: '',
  };

  if (debug) {
    const { stdout, stderr, error } = await doDebugAsync(() => doProcessor(engine, ctx));
    ctx[ContextStdout] = stdout;
    ctx[ContextStderr] = stderr;
    ctx[ContextPanic] = error;
  } else {
    ctx[ContextPanic] = await doSafeAsync(() => doProcessor(engine, ctx));
  }

  if (debug) { res.status(200).type('text/plain').send(formatDebug(req, ctx)); return; }
  if (ctx[ContextPanic]) { console.error(ctx[ContextPanic].message || ctx[ContextPanic]); res.status(500).send('Internal Server Error'); return; }
  if (ctx[ContextError]) { console.error(ctx[ContextError].message || ctx[ContextError]); res.status(500).send('Internal Server Error'); return; }

  const rspMeta = ctx[ContextResponseMeta];
  let contentType = 'application/json';
  let statusCode = 200;

  if (rspMeta) {
    if (rspMeta[RspMetaError]) { res.status(500).send(String(rspMeta[RspMetaError])); return; }
    if (rspMeta[RspMetaContentType]) contentType = String(rspMeta[RspMetaContentType]);
    if (rspMeta[RspMetaStatus]) statusCode = Number(rspMeta[RspMetaStatus]) || 200;
  }

  res.status(statusCode).type(contentType).send(ctx[ContextResponse]);
}

async function handleWAPI(engine, req, res, debug, rawPath) {
  const hadTrailingSlash = rawPath.length > 0 && rawPath.endsWith('/');
  const parts = rawPath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (parts.length < 2) {
    res.status(404).send('Not Found');
    return;
  }

  const pkg = parts[0];
  const version = parts[1];
  let innerPath = '/' + parts.slice(2).join('/');
  // Preserve trailing slash so inner routers can distinguish /foo from /foo/
  // (express treats them as distinct, and /foo -> 302 /foo/ redirects loop
  // forever otherwise).
  if (hadTrailingSlash && parts.length > 2 && !innerPath.endsWith('/')) {
    innerPath += '/';
  }
  const search = splitURL(req.url).search;
  // Skip normalizeURL — it would re-strip the trailing slash we just preserved.
  const innerURL = innerPath + search;

  let handler;
  try {
    handler = await engine.dynamic.getHTTPHandler(pkg, version);
  } catch (err) {
    console.error(err.message || err);
    res.status(500).send('Internal Server Error');
    return;
  }

  delete req.headers[HeaderOriginalPath.toLowerCase()];
  req.url = innerURL;
  req.originalUrl = innerURL;
  req.baseUrl = '';
  req.params = {};

  // Non-debug: delegate the live request/response to the native handler.
  if (!debug) {
    const next = (err) => {
      if (!err) return;
      console.error(err.message || err);
      if (!res.headersSent) res.status(500).send('Internal Server Error');
    };

    try {
      const result = handler(req, res, next);
      if (result && typeof result.then === 'function') {
        await result;
      }
    } catch (err) {
      next(err);
    }
    return;
  }

  // Debug (/_/wapi): mirror Go debugWireProcessor — capture stdout/stderr, run
  // the handler against a buffered response, then return a formatDebug dump
  // (text/plain) instead of the real response.
  req.headers['x-lambda-node-debug'] = 'true';
  const debugPath = '/' + parts.slice(2).join('/');

  // Tee the request body so it can be shown in the dump without preventing the
  // native handler from reading the same stream (multiple 'data' listeners all
  // receive the chunks).
  const reqChunks = [];
  req.on('data', (c) => { reqChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); });

  const capture = captureResponse(res);
  let handlerErr = null;
  const next = (err) => { if (err) handlerErr = err; };

  const { stdout, stderr, error } = await doDebugAsync(async () => {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.then === 'function') await result;
    } catch (err) {
      handlerErr = err;
    }
    if (!capture.isEnded() && !handlerErr) {
      await new Promise((resolve) => {
        let timer = setTimeout(() => { timer = null; resolve(); }, 30000);
        capture.waitEnd().then(() => { if (timer) clearTimeout(timer); resolve(); });
      });
    }
  });

  capture.restore();

  const ctx = {
    [ContextPath]: debugPath,
    [ContextHeader]: req.headers,
    [ContextRequestMeta]: {},
    [ContextResponseMeta]: {},
    [ContextStdout]: stdout,
    [ContextStderr]: stderr,
    [ContextError]: handlerErr,
    [ContextPanic]: error,
    [ContextRequest]: reconstructWireRequest(req, Buffer.concat(reqChunks)),
    [ContextResponse]: capture.body(),
  };

  res.status(200).type('text/plain').send(formatDebug(req, ctx));
}

// captureResponse intercepts the low-level writes on an Express/Node response so
// a native handler's output can be buffered (for the /_/wapi debug dump) instead
// of being flushed to the client. Call restore() before sending the real reply.
function captureResponse(res) {
  const chunks = [];
  let ended = false;
  let resolveEnd;
  const endPromise = new Promise((resolve) => { resolveEnd = resolve; });

  const origWrite = res.write;
  const origEnd = res.end;
  const origWriteHead = res.writeHead;

  function pushChunk(chunk, enc) {
    if (chunk == null || typeof chunk === 'function') return;
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof enc === 'string' ? enc : 'utf8'));
  }

  res.write = function (chunk, enc, cb) {
    pushChunk(chunk, enc);
    const done = typeof enc === 'function' ? enc : cb;
    if (typeof done === 'function') done();
    return true;
  };

  res.end = function (chunk, enc, cb) {
    pushChunk(chunk, enc);
    if (!ended) { ended = true; resolveEnd(); }
    const done = typeof chunk === 'function' ? chunk : (typeof enc === 'function' ? enc : cb);
    if (typeof done === 'function') done();
    return res;
  };

  res.writeHead = function (status) {
    if (typeof status === 'number') res.statusCode = status;
    return res;
  };

  return {
    restore() {
      res.write = origWrite;
      res.end = origEnd;
      res.writeHead = origWriteHead;
    },
    body() { return Buffer.concat(chunks); },
    isEnded() { return ended; },
    waitEnd() { return endPromise; },
  };
}

// reconstructWireRequest approximates Go's c.Request.Write(&buf): request line +
// headers + body, for display in the debug dump.
function reconstructWireRequest(req, bodyBuf) {
  const target = req.originalUrl || req.url || '/';
  const lines = [`${req.method || 'GET'} ${target} HTTP/1.1`];
  for (const [k, v] of Object.entries(req.headers || {})) {
    lines.push(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
  }
  const head = Buffer.from(lines.join('\r\n') + '\r\n\r\n', 'utf8');
  return bodyBuf && bodyBuf.length ? Buffer.concat([head, bodyBuf]) : head;
}

async function handleMeta(engine, req, res) {
  const metaPath = '/' + (req.params[0] || '');
  let response = '';

  const err = await doSafeAsync(async () => {
    response = await metaHandler(engine, metaPath);
  });

  if (err) { console.error(err.message || err); res.status(500).send('Internal Server Error'); return; }

  res.status(200).type('application/json').send(response);
}

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

async function doProcessor(engine, ctx) {
  const path_ = ctx[ContextPath];
  const req = ctx[ContextRequest];
  const reqMeta = ctx[ContextRequestMeta] || {};

  const reqBuf = Buffer.isBuffer(req) ? req : Buffer.from(String(req == null ? '' : req), 'utf8');
  const reqEnvelope = { meta: reqMeta, data: reqBuf.toString('base64') };
  const rsp = await handlePath(engine, path_, JSON.stringify(reqEnvelope));

  let rspEnvelope;
  try { rspEnvelope = JSON.parse(rsp); } catch (_) { ctx[ContextResponse] = rsp; return; }

  if (rspEnvelope.meta && Object.keys(rspEnvelope.meta).length > 0) ctx[ContextResponseMeta] = rspEnvelope.meta;
  if (rspEnvelope.meta && rspEnvelope.meta[RspMetaError]) { ctx[ContextError] = new Error(String(rspEnvelope.meta[RspMetaError])); return; }
  if (rspEnvelope.data) {
    // Keep the decoded response as raw bytes (Buffer) so binary/exact bytes are
    // written back verbatim, matching Go's c.Data(status, ct, []byte(rspBody)).
    try { ctx[ContextResponse] = Buffer.from(rspEnvelope.data, 'base64'); } catch (err) { ctx[ContextError] = err; }
  } else { ctx[ContextResponse] = ''; }
}

async function handlePath(engine, path_, req) {
  const parts = path_.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length < 2) throw new Error(`invalid path: "${path_}"`);
  return engine.dynamic.invokePackage(parts[0], parts[1], '/' + parts.slice(2).join('/'), req);
}

async function metaHandler(engine, path_) {
  let tunnelMeta = '';
  const parts = path_.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length >= 2) {
    try {
      tunnelMeta = await engine.dynamic.metaPackage(parts[0], parts[1]);
    } catch (_) {}
  }
  return engine.dynamic.metaGenerator.generate(tunnelMeta);
}

function pathnameOf(req) {
  const u = req.url || '';
  const i = u.indexOf('?');
  return i < 0 ? u : u.slice(0, i);
}

// genGetReq mirrors Go's genGetReq: build a {key: firstValue} map from the
// query string (first value per key, like url.Query()[k][0]) and JSON-encode it
// with sorted keys (Go marshals maps with sorted keys).
function genGetReq(req) {
  const u = req.url || '';
  const i = u.indexOf('?');
  const qs = i < 0 ? '' : u.slice(i + 1);
  const params = new URLSearchParams(qs);
  const dataMap = {};
  for (const key of params.keys()) {
    if (!Object.prototype.hasOwnProperty.call(dataMap, key)) {
      dataMap[key] = params.get(key);
    }
  }
  const sorted = {};
  for (const key of Object.keys(dataMap).sort()) sorted[key] = dataMap[key];
  return JSON.stringify(sorted);
}

function genReqMeta(req) {
  const meta = {};

  let host = req.hostname || req.headers.host || '';
  if (req.headers['x-forwarded-host']) host = req.headers['x-forwarded-host'];
  meta[ReqMetaHost] = host.split(',')[0].split(':')[0].trim();

  let remoteAddr = req.ip || req.connection?.remoteAddress || '';
  if (req.headers['cloudfront-viewer-address']) remoteAddr = req.headers['cloudfront-viewer-address'];
  else if (req.headers['x-forwarded-for']) remoteAddr = req.headers['x-forwarded-for'];
  meta[ReqMetaRemoteAddr] = remoteAddr.split(',')[0].trim();

  meta[ReqMetaPath] = pathnameOf(req);

  return meta;
}

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
  lines.push(`Request: ${Buffer.isBuffer(ctx[ContextRequest]) ? ctx[ContextRequest].toString('utf8') : (ctx[ContextRequest] || '')}`);
  lines.push(`Response: ${Buffer.isBuffer(ctx[ContextResponse]) ? ctx[ContextResponse].toString('utf8') : (ctx[ContextResponse] || '')}`);
  return lines.join('\n') + '\n';
}

module.exports = { installRewriteHandlers, installRawHandlers, installHandlers };
