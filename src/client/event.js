'use strict';

/**
 * Event Client - invokes Lambda with Event type (fire-and-forget).
 * Mirrors Go event/client/client.go.
 *
 * Requires @aws-sdk/client-lambda as peer dependency.
 */
class EventClient {
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
   * Send an event to Lambda (fire-and-forget).
   * @param {string} path
   * @param {Buffer|string} payload
   */
  async send(path, payload) {
    if (!this.lambdaClient) {
      throw new Error('event client: lambdaClient is required');
    }

    const request = {
      path,
      payload: typeof payload === 'string' ? payload : payload.toString(),
    };

    const { InvokeCommand } = require('@aws-sdk/client-lambda');

    const output = await this.lambdaClient.send(new InvokeCommand({
      FunctionName: this.functionName,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify(request)),
    }));

    if (output.FunctionError) {
      const errorPayload = output.Payload ? Buffer.from(output.Payload).toString() : '';
      throw new Error(`${output.FunctionError}: ${errorPayload}`);
    }
  }

  /**
   * Async send with callback.
   * @param {string} path
   * @param {Buffer|string} payload
   * @param {Function} [callback] - (error) => void
   */
  sendAsync(path, payload, callback) {
    this.send(path, payload)
      .then(() => callback && callback(null))
      .catch((err) => callback && callback(err));
  }
}

module.exports = { EventClient };
