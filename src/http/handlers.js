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

function installHandlers(engine) {
  const app = engine.app;
  const opts = engine.options;

  app.use((req, res, next) => {
    req.url = normalizePath(req.url);

    if (opts.staticLinkMap[req.url]) {
      const rule = opts.staticLinkMap[req.url];
      if (matchMethod(rule, req.method)) {
        req.headers[HeaderOriginalPath.toLowerCase()] = req.url;
        req.url = rule.dst;
        app.handle(req, res);
        return;
      }
    }

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

  app.all('/', (req, res) => { res.status(200).send('OK'); });
  app.all('/health-check', (req, res) => { res.status(200).send('OK'); });

  app.all('/api/*', async (req, res) => { await handleAPI(engine, req, res, false); });
  app.all('/_/api/*', async (req, res) => { await handleAPI(engine, req, res, true); });
  app.all('/wapi/*', async (req, res) => { await handleWAPI(engine, req, res, false); });
  app.all('/_/wapi/*', async (req, res) => { await handleWAPI(engine, req, res, true); });
  app.all('/meta/*', async (req, res) => { await handleMeta(engine, req, res); });

  app.use((req, res) => { handlePageNotFound(engine, req, res); });
}

async function handleAPI(engine, req, res, debug) {
  const apiPath = '/' + (req.params[0] || '');
  const reqMeta = genReqMeta(req);

  let reqBody;
  if (req.method === 'GET' || req.method === 'HEAD') {
    reqBody = JSON.stringify(req.query || {});
  } else {
    reqBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  }

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

async function handleWAPI(engine, req, res, debug) {
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

  const processFn = () => {
    const reqBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    ctx[ContextRequest] = reqBody;
    return handlePath(engine, apiPath, reqBody).then((rsp) => { ctx[ContextResponse] = rsp; });
  };

  if (debug) {
    const { stdout, stderr, error } = await doDebugAsync(processFn);
    ctx[ContextStdout] = stdout;
    ctx[ContextStderr] = stderr;
    ctx[ContextPanic] = error;
  } else {
    ctx[ContextPanic] = await doSafeAsync(processFn);
  }

  if (debug) { res.status(200).type('text/plain').send(formatDebug(req, ctx)); return; }
  if (ctx[ContextPanic]) { console.error(ctx[ContextPanic].message || ctx[ContextPanic]); res.status(500).send('Internal Server Error'); return; }
  if (ctx[ContextError]) { console.error(ctx[ContextError].message || ctx[ContextError]); res.status(500).send('Internal Server Error'); return; }

  res.status(200).type('application/json').send(ctx[ContextResponse]);
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

  const reqEnvelope = { meta: reqMeta, data: Buffer.from(req, 'utf8').toString('base64') };
  const rsp = await handlePath(engine, path_, JSON.stringify(reqEnvelope));

  let rspEnvelope;
  try { rspEnvelope = JSON.parse(rsp); } catch (_) { ctx[ContextResponse] = rsp; return; }

  if (rspEnvelope.meta && Object.keys(rspEnvelope.meta).length > 0) ctx[ContextResponseMeta] = rspEnvelope.meta;
  if (rspEnvelope.meta && rspEnvelope.meta[RspMetaError]) { ctx[ContextError] = new Error(String(rspEnvelope.meta[RspMetaError])); return; }
  if (rspEnvelope.data) {
    try { ctx[ContextResponse] = Buffer.from(rspEnvelope.data, 'base64').toString('utf8'); } catch (err) { ctx[ContextError] = err; }
  } else { ctx[ContextResponse] = ''; }
}

async function handlePath(engine, path_, req) {
  const parts = path_.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length < 2) throw new Error(`invalid path: "${path_}"`);
  const tunnel = await engine.dynamic.getPackage(parts[0], parts[1]);
  return tunnel.invoke('/' + parts.slice(2).join('/'), req);
}

async function metaHandler(engine, path_) {
  let tunnelMeta = '';
  const parts = path_.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length >= 2) {
    try {
      const tunnel = await engine.dynamic.getPackage(parts[0], parts[1]);
      tunnelMeta = tunnel.meta();
    } catch (_) {}
  }
  return engine.dynamic.metaGenerator.generate(tunnelMeta);
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

  meta[ReqMetaPath] = req.url;

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
  lines.push(`Request: ${ctx[ContextRequest] || ''}`);
  lines.push(`Response: ${ctx[ContextResponse] || ''}`);
  return lines.join('\n') + '\n';
}

module.exports = { installHandlers };