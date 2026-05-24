'use strict';

function encodeReqRespRequest(request = {}) {
  return encodeMessage([
    fieldString(1, request.path || ''),
    fieldBytes(2, request.payload),
  ]);
}

function decodeReqRespRequest(input) {
  const fields = decodeFields(input);
  return {
    path: fieldText(fields, 1),
    payload: fieldBuffer(fields, 2),
  };
}

function encodeReqRespResponse(response = {}) {
  return encodeMessage([
    fieldBytes(1, response.payload),
    fieldString(2, response.error || ''),
  ]);
}

function decodeReqRespResponse(input) {
  const fields = decodeFields(input);
  return {
    payload: fieldBuffer(fields, 1),
    error: fieldText(fields, 2),
  };
}

function encodeEventRequest(request = {}) {
  return encodeMessage([
    fieldString(1, request.path || ''),
    fieldBytes(2, request.payload),
  ]);
}

function decodeEventRequest(input) {
  const fields = decodeFields(input);
  return {
    path: fieldText(fields, 1),
    payload: fieldBuffer(fields, 2),
  };
}

function encodeSqsRequest(request = {}) {
  return encodeMessage([
    fieldString(1, request.request_sqs_id || request.requestSqsId || ''),
    fieldString(2, request.response_sqs_id || request.responseSqsId || ''),
    fieldString(3, request.correlation_id || request.correlationId || ''),
    fieldString(4, request.path || ''),
    fieldBytes(5, request.payload),
  ]);
}

function decodeSqsRequest(input) {
  const fields = decodeFields(input);
  return {
    request_sqs_id: fieldText(fields, 1),
    response_sqs_id: fieldText(fields, 2),
    correlation_id: fieldText(fields, 3),
    path: fieldText(fields, 4),
    payload: fieldBuffer(fields, 5),
  };
}

function encodeSqsResponse(response = {}) {
  return encodeMessage([
    fieldString(1, response.request_sqs_id || response.requestSqsId || ''),
    fieldString(2, response.response_sqs_id || response.responseSqsId || ''),
    fieldString(3, response.correlation_id || response.correlationId || ''),
    fieldBytes(4, response.payload),
    fieldString(5, response.error || ''),
  ]);
}

function decodeSqsResponse(input) {
  const fields = decodeFields(input);
  return {
    request_sqs_id: fieldText(fields, 1),
    response_sqs_id: fieldText(fields, 2),
    correlation_id: fieldText(fields, 3),
    payload: fieldBuffer(fields, 4),
    error: fieldText(fields, 5),
  };
}

function fieldString(number, value) {
  return fieldBytes(number, Buffer.from(String(value || ''), 'utf8'));
}

function fieldBytes(number, value) {
  const bytes = toBytes(value);
  if (bytes.length === 0) return null;
  return Buffer.concat([
    encodeVarint((number << 3) | 2),
    encodeVarint(bytes.length),
    bytes,
  ]);
}

function encodeMessage(parts) {
  return Buffer.concat(parts.filter(Boolean));
}

function decodeFields(input) {
  const buffer = toBytes(input);
  const fields = new Map();
  let offset = 0;

  while (offset < buffer.length) {
    const key = readVarint(buffer, offset);
    offset = key.offset;
    const fieldNumber = key.value >> 3;
    const wireType = key.value & 7;

    if (wireType === 2) {
      const length = readVarint(buffer, offset);
      offset = length.offset;
      const end = offset + length.value;
      if (end > buffer.length) {
        throw new Error('protobuf: truncated length-delimited field');
      }
      fields.set(fieldNumber, buffer.subarray(offset, end));
      offset = end;
      continue;
    }

    if (wireType === 0) {
      const value = readVarint(buffer, offset);
      fields.set(fieldNumber, Buffer.from(String(value.value), 'utf8'));
      offset = value.offset;
      continue;
    }

    throw new Error(`protobuf: unsupported wire type ${wireType}`);
  }

  return fields;
}

function fieldText(fields, number) {
  return fieldBuffer(fields, number).toString('utf8');
}

function fieldBuffer(fields, number) {
  return fields.get(number) || Buffer.alloc(0);
}

function encodeVarint(value) {
  const bytes = [];
  let current = Number(value);
  if (!Number.isSafeInteger(current) || current < 0) {
    throw new Error(`protobuf: invalid varint ${value}`);
  }

  while (current >= 0x80) {
    bytes.push((current & 0x7f) | 0x80);
    current = Math.floor(current / 0x80);
  }
  bytes.push(current);
  return Buffer.from(bytes);
}

function readVarint(buffer, offset) {
  let value = 0;
  let shift = 0;

  for (let i = offset; i < buffer.length; i++) {
    const byte = buffer[i];
    value += (byte & 0x7f) * (2 ** shift);
    if ((byte & 0x80) === 0) {
      return { value, offset: i + 1 };
    }
    shift += 7;
    if (shift > 53) {
      throw new Error('protobuf: varint is too large');
    }
  }

  throw new Error('protobuf: truncated varint');
}

function toBytes(value) {
  if (value == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value)) return Buffer.from(value);
  if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }
  return Buffer.from(String(value), 'utf8');
}

module.exports = {
  encodeReqRespRequest,
  decodeReqRespRequest,
  encodeReqRespResponse,
  decodeReqRespResponse,
  encodeEventRequest,
  decodeEventRequest,
  encodeSqsRequest,
  decodeSqsRequest,
  encodeSqsResponse,
  decodeSqsResponse,
};
