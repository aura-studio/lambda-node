'use strict';

const { newOptions, RunModeStrict, RunModePartial, RunModeBatch, RunModeReentrant } = require('./options');
const { Router } = require('./router');
const { Dynamic } = require('../dynamic/dynamic');
const { Context, ContextPath, ContextRequest, ContextResponse, ContextPanic } = require('./context');
const { installHandlers } = require('./handlers');

class Engine {
  constructor(sqsOpts = [], dynamicOpts = []) {
    this.options = newOptions(...sqsOpts);
    this.dynamic = new Dynamic(...dynamicOpts);
    this.router = new Router();
    this.sqsClient = this.options.sqsClient || null;
    installHandlers(this);
  }

  async invoke(event) {
    const records = (event && event.Records) || [];
    const runMode = this.options.runMode;

    if (runMode === RunModeStrict || runMode === RunModePartial) {
      return this._handleWithResponse(records);
    }
    const resp = await this._handleWithoutResponse(records);
    return resp;
  }

  async _handleWithResponse(records) {
    const batchItemFailures = [];
    const runMode = this.options.runMode;

    for (let i = 0; i < records.length; i++) {
      const msg = records[i];

      if (this.options.debugMode) {
        console.log(`[SQS] Message ${msg.messageId} body: ${msg.body}`);
      }

      let request;
      try {
        request = JSON.parse(msg.body);
      } catch (unmarshalErr) {
        console.error(`[SQS] Unmarshal message ${msg.messageId} body error: ${unmarshalErr.message}`);
        if (runMode === RunModeStrict) {
          for (let j = i; j < records.length; j++) {
            batchItemFailures.push({ itemIdentifier: records[j].messageId });
          }
          return { batchItemFailures };
        }
        batchItemFailures.push({ itemIdentifier: msg.messageId });
        continue;
      }

      const result = this._dispatchMessage(request, msg.messageId);

      if (result.error) {
        console.error(`[SQS] Dispatch message ${msg.messageId} error: ${result.error.message}`);
        if (runMode === RunModeStrict) {
          for (let j = i; j < records.length; j++) {
            batchItemFailures.push({ itemIdentifier: records[j].messageId });
          }
          return { batchItemFailures };
        }
        batchItemFailures.push({ itemIdentifier: msg.messageId });
        continue;
      }

      await this._sendReply(request, result.response, msg.messageId, batchItemFailures);
    }

    return { batchItemFailures };
  }

  async _handleWithoutResponse(records) {
    const batchItemFailures = [];
    const runMode = this.options.runMode;
    let lastError = null;

    for (let i = 0; i < records.length; i++) {
      const msg = records[i];

      if (this.options.debugMode) {
        console.log(`[SQS] Message ${msg.messageId} body: ${msg.body}`);
      }

      let request;
      try {
        request = JSON.parse(msg.body);
      } catch (unmarshalErr) {
        console.error(`[SQS] Unmarshal message ${msg.messageId} body error: ${unmarshalErr.message}`);
        if (runMode === RunModeBatch) {
          throw unmarshalErr;
        }
        batchItemFailures.push({ itemIdentifier: msg.messageId });
        lastError = unmarshalErr;
        continue;
      }

      const result = this._dispatchMessage(request, msg.messageId);

      if (result.error) {
        console.error(`[SQS] Dispatch message ${msg.messageId} error: ${result.error.message}`);
        if (runMode === RunModeBatch) {
          throw result.error;
        }
        batchItemFailures.push({ itemIdentifier: msg.messageId });
        lastError = result.error;
        continue;
      }

      await this._sendReply(request, result.response, msg.messageId, batchItemFailures);
    }

    if (lastError) {
      throw lastError;
    }

    return { batchItemFailures };
  }

  _dispatchMessage(request, messageId) {
    const c = new Context();
    c.set(ContextPath, request.path || '');
    c.set(ContextRequest, typeof request.payload === 'string' ? request.payload : String(request.payload || ''));

    if (this.options.debugMode) {
      console.log(`[SQS] Request: ${c.getString(ContextPath)} ${c.getString(ContextRequest)}`);
    }

    this.router.dispatch(c);

    if (this.options.debugMode) {
      console.log(`[SQS] Response: ${c.getString(ContextPath)} ${c.getString(ContextResponse)}`);
    }

    let error = null;
    const [panicVal] = c.get(ContextPanic);
    if (panicVal) {
      error = panicVal instanceof Error ? panicVal : new Error(String(panicVal));
    } else {
      error = c.getError();
    }

    return {
      response: c.getString(ContextResponse),
      error,
    };
  }

  async _sendReply(request, response, messageId, batchItemFailures) {
    if (!request.responseSqsId || !request.requestSqsId) return;
    if (!this.options.replyMode) return;
    if (!this.sqsClient) return;

    const rsp = {
      requestSqsId: request.requestSqsId,
      responseSqsId: request.responseSqsId,
      correlationId: request.correlationId || '',
      payload: response,
      error: '',
    };

    try {
      await this.sqsClient.sendMessage({
        MessageBody: JSON.stringify(rsp),
        QueueUrl: request.responseSqsId,
      });
    } catch (sendErr) {
      console.error(`[SQS] Send response for message ${messageId} error: ${sendErr.message}`);
      batchItemFailures.push({ itemIdentifier: messageId });
    }
  }
}

module.exports = { Engine };