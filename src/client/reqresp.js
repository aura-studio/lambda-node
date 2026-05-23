'use strict';

const { encodePayload, decodePayload } = require('../protocol/payload');
const { runWithTimeout } = require('./timeout');

function createInvokeCommand(input) {
  try {
    const { InvokeCommand } = require('@aws-sdk/client-lambda');
    return new InvokeCommand(input);
  } catch (_) {
    return { input, commandName: 'InvokeCommand' };
  }
}

/**
 * ReqResp Client - invokes Lambda with RequestResponse type.
 * Mirrors Go reqresp/client/client.go.
 *
 * Requires @aws-sdk/client-lambda as peer dependency.
 */
class ReqRespClient {
  /**
   * @param {object} opts
   * @param {string} opts.functionName - Lambda function name/ARN
   * @param {object} opts.lambdaClient - AWS Lambda client instance
   * @param {number} [opts.timeout=30000] - default timeout in ms
   */
  constructor(opts = {}) {
    this.functionName = opts.functionName || '';
    this.lambdaClient = opts.lambdaClient || null;
    this.timeout = opts.timeout || 30000;
  }

  /**
   * Synchronous Lambda invoke (RequestResponse).
   * @param {string} path
   * @param {Buffer|string} payload
   * @returns {Promise<{ payload: string, error: string }>}
   */
  async call(path, payload) {
    if (!this.lambdaClient) {
      throw new Error('reqresp client: lambdaClient is required');
    }

    const request = {
      path,
      payload: encodePayload(payload),
    };

    const command = createInvokeCommand({
      FunctionName: this.functionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(request)),
    });

    const output = await runWithTimeout(
      (abortSignal) => this.lambdaClient.send(command, { abortSignal }),
      this.timeout
    );

    if (output.FunctionError) {
      const errorPayload = output.Payload ? Buffer.from(output.Payload).toString() : '';
      return {
        payload: '',
        error: `${output.FunctionError}: ${errorPayload}`,
      };
    }

    const responseStr = output.Payload ? Buffer.from(output.Payload).toString() : '{}';
    const response = JSON.parse(responseStr);
    return {
      payload: decodePayload(response.payload),
      error: response.error || '',
    };
  }

  /**
   * Async Lambda invoke with callback.
   * @param {string} path
   * @param {Buffer|string} payload
   * @param {Function} [callback] - (response, error) => void
   */
  callAsync(path, payload, callback) {
    this.call(path, payload)
      .then((resp) => callback && callback(resp, null))
      .catch((err) => callback && callback(null, err));
  }
}

module.exports = { ReqRespClient };
