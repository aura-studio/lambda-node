'use strict';

// Context key constants (shared across all modes)
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
const ContextProcessor = 'Processor';

// Request meta keys
const ReqMetaHost = 'Host';
const ReqMetaRemoteAddr = 'RemoteAddr';
const ReqMetaPath = 'Path';

// Response meta keys
const RspMetaError = 'Error';
const RspMetaContentType = 'ContentType';
const RspMetaStatus = 'Status';

// Header constants
const HeaderOriginalPath = 'X-Original-Path';

/**
 * Context - lightweight key-value context for non-HTTP modes.
 * Mirrors the Go reqresp/sqs/event Context struct.
 */
class Context {
  constructor() {
    this._keys = {};
    this._aborted = false;
  }

  set(key, value) {
    this._keys[key] = value;
  }

  get(key) {
    if (key in this._keys) {
      return [this._keys[key], true];
    }
    return [undefined, false];
  }

  getString(key) {
    const [v, ok] = this.get(key);
    if (ok && typeof v === 'string') {
      return v;
    }
    return '';
  }

  getBool(key) {
    const [v, ok] = this.get(key);
    if (ok && typeof v === 'boolean') {
      return v;
    }
    return false;
  }

  getStringMap(key) {
    const [v, ok] = this.get(key);
    if (ok && v !== null && typeof v === 'object' && !Array.isArray(v)) {
      return v;
    }
    return null;
  }

  getError() {
    const [v, ok] = this.get(ContextError);
    if (ok && v instanceof Error) {
      return v;
    }
    if (ok && typeof v === 'string' && v !== '') {
      return new Error(v);
    }
    return null;
  }

  abort() {
    this._aborted = true;
  }

  get aborted() {
    return this._aborted;
  }
}

module.exports = {
  Context,
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
  ContextProcessor,
  ReqMetaHost,
  ReqMetaRemoteAddr,
  ReqMetaPath,
  RspMetaError,
  RspMetaContentType,
  RspMetaStatus,
  HeaderOriginalPath,
};
