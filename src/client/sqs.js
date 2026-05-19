'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * SQS Client - sends messages to SQS and optionally waits for replies.
 * Mirrors Go sqs/client/client.go.
 *
 * Requires @aws-sdk/client-sqs as peer dependency.
 */
class SqsClient {
  /**
   * @param {object} opts
   * @param {string} opts.requestSqsId - request queue URL
   * @param {string} [opts.responseSqsId] - response queue URL (for Call)
   * @param {object} opts.sqsClient - AWS SQS client instance
   * @param {number} [opts.timeout=30000] - default timeout in ms
   */
  constructor(opts = {}) {
    this.requestSqsId = opts.requestSqsId || '';
    this.responseSqsId = opts.responseSqsId || '';
    this.sqsClient = opts.sqsClient || null;
    this.timeout = opts.timeout || 30000;
    this._pendingRequests = new Map(); // correlationId -> { resolve, reject, timer }
    this._listening = false;
    this._stopSignal = false;

    // Start listener if response queue is configured
    if (this.responseSqsId && this.sqsClient) {
      this._startListener();
    }
  }

  /**
   * Stop the background listener.
   */
  close() {
    this._stopSignal = true;
    // Reject all pending requests
    for (const [, pending] of this._pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('client closed'));
    }
    this._pendingRequests.clear();
  }

  /**
   * Send and wait for a response (synchronous pattern via SQS).
   * @param {string} path
   * @param {Buffer|string} payload
   * @returns {Promise<object>} response
   */
  async call(path, payload) {
    if (!this.sqsClient) {
      throw new Error('sqs client: sqsClient is required');
    }

    const correlationId = uuidv4();
    const request = {
      requestSqsId: this.requestSqsId,
      responseSqsId: this.responseSqsId,
      correlationId,
      path,
      payload: typeof payload === 'string' ? payload : payload.toString(),
    };

    // Create pending response channel
    const responsePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingRequests.delete(correlationId);
        reject(new Error('request timeout'));
      }, this.timeout);

      this._pendingRequests.set(correlationId, { resolve, reject, timer });
    });

    // Send message
    const { SendMessageCommand } = require('@aws-sdk/client-sqs');
    await this.sqsClient.send(new SendMessageCommand({
      QueueUrl: this.requestSqsId,
      MessageBody: JSON.stringify(request),
    }));

    return responsePromise;
  }

  /**
   * Send a message without waiting for response (fire-and-forget).
   * @param {string} path
   * @param {Buffer|string} payload
   */
  async send(path, payload) {
    if (!this.sqsClient) {
      throw new Error('sqs client: sqsClient is required');
    }

    const request = {
      path,
      payload: typeof payload === 'string' ? payload : payload.toString(),
    };

    const { SendMessageCommand } = require('@aws-sdk/client-sqs');
    await this.sqsClient.send(new SendMessageCommand({
      QueueUrl: this.requestSqsId,
      MessageBody: JSON.stringify(request),
    }));
  }

  /**
   * Async call with callback.
   * @param {string} path
   * @param {Buffer|string} payload
   * @param {Function} [callback]
   */
  callAsync(path, payload, callback) {
    this.call(path, payload)
      .then((resp) => callback && callback(resp, null))
      .catch((err) => callback && callback(null, err));
  }

  /**
   * Background listener for response messages.
   */
  async _startListener() {
    if (this._listening) return;
    this._listening = true;

    const { ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');

    while (!this._stopSignal) {
      try {
        const output = await this.sqsClient.send(new ReceiveMessageCommand({
          QueueUrl: this.responseSqsId,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20,
        }));

        if (output.Messages) {
          for (const msg of output.Messages) {
            this._handleIncomingMessage(msg);
            // Delete processed message
            try {
              await this.sqsClient.send(new DeleteMessageCommand({
                QueueUrl: this.responseSqsId,
                ReceiptHandle: msg.ReceiptHandle,
              }));
            } catch (_) {
              // Ignore delete errors
            }
          }
        }
      } catch (err) {
        if (!this._stopSignal) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    this._listening = false;
  }

  /**
   * Handle an incoming response message.
   */
  _handleIncomingMessage(msg) {
    if (!msg.Body) return;

    let resp;
    try {
      resp = JSON.parse(msg.Body);
    } catch (_) {
      return;
    }

    const correlationId = resp.correlationId;
    const pending = this._pendingRequests.get(correlationId);
    if (pending) {
      clearTimeout(pending.timer);
      this._pendingRequests.delete(correlationId);
      pending.resolve(resp);
    }
  }
}

module.exports = { SqsClient };
