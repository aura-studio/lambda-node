'use strict';

function encodePayload(payload) {
  if (payload === undefined || payload === null) return '';
  if (Buffer.isBuffer(payload)) return payload.toString('base64');
  if (payload instanceof Uint8Array) return Buffer.from(payload).toString('base64');
  return Buffer.from(String(payload), 'utf8').toString('base64');
}

function isStrictBase64(value) {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  if (value.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return false;

  try {
    return Buffer.from(value, 'base64').toString('base64') === value;
  } catch (_) {
    return false;
  }
}

function decodePayload(payload) {
  if (payload === undefined || payload === null) return '';
  if (Buffer.isBuffer(payload)) return payload.toString('utf8');
  if (payload instanceof Uint8Array) return Buffer.from(payload).toString('utf8');
  if (Array.isArray(payload)) return Buffer.from(payload).toString('utf8');

  if (
    payload &&
    typeof payload === 'object' &&
    payload.type === 'Buffer' &&
    Array.isArray(payload.data)
  ) {
    return Buffer.from(payload.data).toString('utf8');
  }

  const value = String(payload);
  if (!isStrictBase64(value)) return value;
  return Buffer.from(value, 'base64').toString('utf8');
}

module.exports = {
  encodePayload,
  decodePayload,
  isStrictBase64,
};
