'use strict';

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
      payload: typeof payload === 'string' ? payload : payload.toString(),
    };

    const { InvokeCommand } = require('@aws-sdk/client-lambda');

    const output = await this.lambdaClient.send(new InvokeCommand({
      FunctionName: this.functionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(request)),
    }));

    if (output.FunctionError) {
      const errorPayload = output.Payload ? Buffer.from(output.Payload).toString() : '';
      return {
        payload: '',
        error: `${output.FunctionError}: ${errorPayload}`,
      };
    }

    const responseStr = output.Payload ? Buffer.from(output.Payload).toString() : '{}';
    return JSON.parse(responseStr);
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
