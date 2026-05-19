'use strict';

const {
  ContextPath,
  ContextRequest,
  ContextResponse,
  ContextRequestMeta,
  ContextResponseMeta,
  ContextError,
  ContextPanic,
  ContextDebug,
  ContextStdout,
  ContextStderr,
  ContextProcessor,
  RspMetaError,
} = require('../context');
const { doSafe, doDebug } = require('../processor');

/**
 * Install default handlers on the engine's router.
 * Mirrors Go event/handlers.go InstallHandlers().
 */
function installHandlers(engine) {
  const r = engine.router;

  r.handle('/', (c) => okHandler(c));
  r.handle('/health-check', (c) => okHandler(c));
  r.handle('/api/*path', (c) => apiHandler(engine, c));
  r.handle('/_/api/*path',
    (c) => debugMiddleware(c),
    (c) => apiHandler(engine, c),
  );
  r.handle('/meta/*path', (c) => metaHandlerFn(engine, c));
  r.noRoute((c) => pageNotFoundHandler(c));
}

function okHandler(c) {
  c.set(ContextResponse, 'OK');
}

function debugMiddleware(c) {
  c.set(ContextDebug, true);
}

function apiHandler(engine, c) {
  const path_ = c.getString(ContextPath);
  if (!path_) {
    c.set(ContextError, new Error('missing api path'));
    return;
  }

  if (c.getBool(ContextDebug)) {
    c.set(ContextProcessor, (ctx) => debugProcessor(engine, ctx));
  } else {
    c.set(ContextProcessor, (ctx) => safeProcessor(engine, ctx));
  }

  const [procFn] = c.get(ContextProcessor);
  if (procFn) procFn(c);

  if (c.getBool(ContextDebug)) {
    c.set(ContextResponse, formatDebug(c));
  }
}

function metaHandlerFn(engine, c) {
  const path_ = c.getString(ContextPath);
  if (!path_) {
    c.set(ContextError, new Error('missing meta path'));
    return;
  }
  safeMetaProcessor(engine, c);
}

function pageNotFoundHandler(c) {
  c.set(ContextError, new Error(`404 page not found: ${c.getString(ContextPath)}`));
}

// ==================== Processors ====================

function doProcessorFn(engine, c) {
  const path_ = c.getString(ContextPath);
  const req = c.getString(ContextRequest);
  const reqMeta = c.getStringMap(ContextRequestMeta) || {};

  const reqEnvelope = {
    meta: reqMeta,
    data: Buffer.from(req, 'utf8').toString('base64'),
  };

  const rsp = handlePath(engine, path_, JSON.stringify(reqEnvelope));

  let rspEnvelope;
  try {
    rspEnvelope = JSON.parse(rsp);
  } catch (_) {
    c.set(ContextResponse, rsp);
    return;
  }

  if (rspEnvelope.meta && Object.keys(rspEnvelope.meta).length > 0) {
    c.set(ContextResponseMeta, rspEnvelope.meta);
  }

  if (rspEnvelope.meta && rspEnvelope.meta[RspMetaError]) {
    c.set(ContextError, new Error(String(rspEnvelope.meta[RspMetaError])));
    return;
  }

  if (rspEnvelope.data) {
    try {
      c.set(ContextResponse, Buffer.from(rspEnvelope.data, 'base64').toString('utf8'));
    } catch (err) {
      c.set(ContextError, err);
    }
  } else {
    c.set(ContextResponse, '');
  }
}

function safeProcessor(engine, c) {
  const err = doSafe(() => doProcessorFn(engine, c));
  c.set(ContextPanic, err);
}

function debugProcessor(engine, c) {
  const result = doDebug(() => doProcessorFn(engine, c));
  c.set(ContextStdout, result.stdout);
  c.set(ContextStderr, result.stderr);
  c.set(ContextPanic, result.error);
}

function doMetaProcessorFn(engine, c) {
  const path_ = c.getString(ContextPath);
  const rsp = metaHandler(engine, path_);
  c.set(ContextResponse, rsp);
}

function safeMetaProcessor(engine, c) {
  const err = doSafe(() => doMetaProcessorFn(engine, c));
  c.set(ContextPanic, err);
}

// ==================== Handle / Meta ====================

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

function metaHandler(engine, path_) {
  let tunnelMeta = '';
  const parts = path_.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length >= 2) {
    try {
      const tunnel = engine.dynamic.getPackage(parts[0], parts[1]);
      tunnelMeta = tunnel.meta();
    } catch (_) { /* not found */ }
  }
  return engine.dynamic.metaGenerator.generate(tunnelMeta);
}

// ==================== Debug format ====================

function formatDebug(c) {
  const lines = [];
  lines.push(`Path: ${c.getString(ContextPath)}`);
  lines.push(`Request Meta: ${JSON.stringify(c.getStringMap(ContextRequestMeta) || {})}`);
  lines.push(`Response Meta: ${JSON.stringify(c.getStringMap(ContextResponseMeta) || {})}`);
  lines.push(`Stdout: ${c.getString(ContextStdout)}`);
  lines.push(`Stderr: ${c.getString(ContextStderr)}`);
  const err = c.getError();
  lines.push(`Error: ${err ? err.message : ''}`);
  const [panic_] = c.get(ContextPanic);
  lines.push(`Panic: ${panic_ ? (panic_.message || panic_) : ''}`);
  lines.push(`Request: ${c.getString(ContextRequest)}`);
  lines.push(`Response: ${c.getString(ContextResponse)}`);
  return lines.join('\n') + '\n';
}

module.exports = { installHandlers };
