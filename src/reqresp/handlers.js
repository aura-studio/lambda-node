'use strict';

const {
  ContextPath, ContextRequest, ContextResponse, ContextRequestMeta, ContextResponseMeta,
  ContextError, ContextPanic, ContextDebug, ContextStdout, ContextStderr,
  RspMetaError,
} = require('./context');
const { doSafeAsync, doDebugAsync } = require('./processor');

function installHandlers(engine) {
  const r = engine.router;

  r.handle('/', (c) => okHandler(c));
  r.handle('/health-check', (c) => okHandler(c));
  r.handle('/api/*path', (c) => apiHandler(engine, c));
  r.handle('/_/api/*path', (c) => debugMiddleware(c), (c) => apiHandler(engine, c));
  r.handle('/meta/*path', (c) => metaHandlerFn(engine, c));
  r.noRoute((c) => pageNotFoundHandler(c));
}

function okHandler(c) { c.set(ContextResponse, 'OK'); }
function debugMiddleware(c) { c.set(ContextDebug, true); }
function pageNotFoundHandler(c) { c.set(ContextError, new Error(`404 page not found: ${c.getString(ContextPath)}`)); }

async function apiHandler(engine, c) {
  const path_ = c.getString(ContextPath);
  if (!path_) { c.set(ContextError, new Error('missing api path')); return; }

  if (c.getBool(ContextDebug)) {
    const { stdout, stderr, error } = await doDebugAsync(() => doProcessorFn(engine, c));
    c.set(ContextStdout, stdout);
    c.set(ContextStderr, stderr);
    c.set(ContextPanic, error);
  } else {
    const err = await doSafeAsync(() => doProcessorFn(engine, c));
    c.set(ContextPanic, err);
  }

  if (c.getBool(ContextDebug)) { c.set(ContextResponse, formatDebug(c)); }
}

async function metaHandlerFn(engine, c) {
  const path_ = c.getString(ContextPath);
  if (!path_) { c.set(ContextError, new Error('missing meta path')); return; }

  const err = await doSafeAsync(() => doMetaProcessorFn(engine, c));
  c.set(ContextPanic, err);

  if (c.getBool(ContextDebug)) { c.set(ContextResponse, formatDebug(c)); }
}

async function doProcessorFn(engine, c) {
  const path_ = c.getString(ContextPath);
  const req = c.getString(ContextRequest);
  const reqMeta = c.getStringMap(ContextRequestMeta) || {};

  const reqEnvelope = { meta: reqMeta, data: Buffer.from(req, 'utf8').toString('base64') };
  const rsp = await handlePath(engine, path_, JSON.stringify(reqEnvelope));

  let rspEnvelope;
  try { rspEnvelope = JSON.parse(rsp); } catch (_) { c.set(ContextResponse, rsp); return; }
  if (rspEnvelope.meta && Object.keys(rspEnvelope.meta).length > 0) { c.set(ContextResponseMeta, rspEnvelope.meta); }
  if (rspEnvelope.meta && rspEnvelope.meta[RspMetaError]) { c.set(ContextError, new Error(String(rspEnvelope.meta[RspMetaError]))); return; }
  if (rspEnvelope.data) {
    try { c.set(ContextResponse, Buffer.from(rspEnvelope.data, 'base64').toString('utf8')); } catch (err) { c.set(ContextError, err); }
  } else { c.set(ContextResponse, ''); }
}

async function doMetaProcessorFn(engine, c) {
  const path_ = c.getString(ContextPath);
  const rsp = await metaHandler(engine, path_);
  c.set(ContextResponse, rsp);
}

async function handlePath(engine, path_, req) {
  const parts = path_.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length < 2) throw new Error(`invalid path: "${path_}"`);
  const tunnel = await engine.dynamic.getPackage(parts[0], parts[1]);
  return await tunnel.invoke('/' + parts.slice(2).join('/'), req);
}

async function metaHandler(engine, path_) {
  let tunnelMeta = '';
  const parts = path_.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length >= 2) {
    try {
      const tunnel = await engine.dynamic.getPackage(parts[0], parts[1]);
      tunnelMeta = await tunnel.meta();
    } catch (_) {}
  }
  return engine.dynamic.metaGenerator.generate(tunnelMeta);
}

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
