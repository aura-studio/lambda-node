'use strict';

const { newOptions, RunModeStrict, RunModePartial, RunModeBatch, RunModeReentrant } = require('./options');
const { Router } = require('./router');
const { Dynamic } = require('../dynamic/dynamic');
const { Context, ContextPath, ContextRequest, ContextResponse, ContextPanic } = require('./context');
const { installHandlers } = require('./handlers');
const { encodePayload, decodePayload } = require('../protocol/payload');

function requestSqsId(request) {
  return request.request_sqs_id || request.requestSqsId || '';
}

function responseSqsId(request) {
  return request.response_sqs_id || request.responseSqsId || '';
}

function correlationId(request) {
  return request.correlation_id || request.correlationId || '';
}

function failRest(records, startIndex, batchItemFailures) {
  for (let j = startIndex; j < records.length; j++) {
    batchItemFailures.push({ itemIdentifier: records[j].messageId });
  }
}

class Engine {
  constructor(sqsOpts = [], dynamicOpts = []) {
    this.options = newOptions(...sqsOpts);
    this.dynamic = new Dynamic(...dynamicOpts);
    this.router = new Router();
    this.sqsClient = this.options.sqsClient || null;
    if (!this.sqsClient && this.options.replyMode) {
      this.sqsClient = this._createDefaultSQSClient();
    }
    installHandlers(this);
  }

  _createDefaultSQSClient() {
    try {
      const { SQSClient } = require('@aws-sdk/client-sqs');
      return new SQSClient({});
    } catch (_) {
      return null;
    }
  }

  async invoke(event) {
    const records = (event && event.Records) || [];
    const runMode = this.options.runMode;

    if (runMode === RunModeStrict || runMode === RunModePartial) {
      return this._handleWithResponse(records);
    }
    return this._handleWithoutResponse(records);
  }

  async _handleWithResponse(records) {
    const batchItemFailures = [];
    const runMode = this.options.runMode;

    for (let i = 0; i < records.length; i++) {
      const msg = records[i];
      if (this.options.debugMode) console.log(`[SQS] Message ${msg.messageId} body: ${msg.body}`);

      let request;
      try { request = JSON.parse(msg.body); } catch (unmarshalErr) {
        console.error(`[SQS] Unmarshal message ${msg.messageId} body error: ${unmarshalErr.message}`);
        if (runMode === RunModeStrict) {
          failRest(records, i, batchItemFailures);
          return { batchItemFailures };
        }
        batchItemFailures.push({ itemIdentifier: msg.messageId });
        continue;
      }

      const result = await this._dispatchMessage(request, msg.messageId);
      if (result.error) {
        console.error(`[SQS] Dispatch message ${msg.messageId} error: ${result.error.message}`);
        if (runMode === RunModeStrict) {
          failRest(records, i, batchItemFailures);
          return { batchItemFailures };
        }
        batchItemFailures.push({ itemIdentifier: msg.messageId });
        continue;
      }

      const replyErr = await this._sendReply(request, result.response, msg.messageId);
      if (replyErr) {
        console.error(`[SQS] Send response for message ${msg.messageId} error: ${replyErr.message}`);
        if (runMode === RunModeStrict) {
          failRest(records, i, batchItemFailures);
          return { batchItemFailures };
        }
        batchItemFailures.push({ itemIdentifier: msg.messageId });
      }
    }

    return { batchItemFailures };
  }

  async _handleWithoutResponse(records) {
    const batchItemFailures = [];
    const runMode = this.options.runMode;
    let lastError = null;

    for (let i = 0; i < records.length; i++) {
      const msg = records[i];
      if (this.options.debugMode) console.log(`[SQS] Message ${msg.messageId} body: ${msg.body}`);

      let request;
      try { request = JSON.parse(msg.body); } catch (unmarshalErr) {
        console.error(`[SQS] Unmarshal message ${msg.messageId} body error: ${unmarshalErr.message}`);
        if (runMode === RunModeBatch) throw unmarshalErr;
        batchItemFailures.push({ itemIdentifier: msg.messageId });
        lastError = unmarshalErr;
        continue;
      }

      const result = await this._dispatchMessage(request, msg.messageId);
      if (result.error) {
        console.error(`[SQS] Dispatch message ${msg.messageId} error: ${result.error.message}`);
        if (runMode === RunModeBatch) throw result.error;
        batchItemFailures.push({ itemIdentifier: msg.messageId });
        lastError = result.error;
        continue;
      }

      const replyErr = await this._sendReply(request, result.response, msg.messageId);
      if (replyErr) {
        console.error(`[SQS] Send response for message ${msg.messageId} error: ${replyErr.message}`);
        if (runMode === RunModeBatch) throw replyErr;
        batchItemFailures.push({ itemIdentifier: msg.messageId });
        lastError = replyErr;
      }
    }

    if (lastError) throw lastError;
    return { batchItemFailures };
  }

  async _dispatchMessage(request, messageId) {
    const c = new Context();
    c.set(ContextPath, request.path || '');
    c.set(ContextRequest, decodePayload(request.payload));

    if (this.options.debugMode) console.log(`[SQS] Request: ${c.getString(ContextPath)} ${c.getString(ContextRequest)}`);

    await this.router.dispatch(c);

    if (this.options.debugMode) console.log(`[SQS] Response: ${c.getString(ContextPath)} ${c.getString(ContextResponse)}`);

    let error = null;
    const [panicVal] = c.get(ContextPanic);
    if (panicVal) error = panicVal instanceof Error ? panicVal : new Error(String(panicVal));
    else error = c.getError();

    return { response: c.getString(ContextResponse), error };
  }

  async _sendReply(request, response, messageId) {
    const replyQueue = responseSqsId(request);
    if (!replyQueue) return null;

    const requestQueue = requestSqsId(request);
    if (!requestQueue) {
      return new Error(`RequestSqsId is empty for message ${messageId}`);
    }

    if (!this.options.replyMode) return null;
    if (!this.sqsClient) {
      return new Error('sqs reply mode requires an sqsClient or @aws-sdk/client-sqs');
    }

    const rsp = {
      request_sqs_id: requestQueue,
      response_sqs_id: replyQueue,
      correlation_id: correlationId(request),
      payload: encodePayload(response),
      error: '',
    };

    try {
      await this._sendMessage({ MessageBody: JSON.stringify(rsp), QueueUrl: replyQueue });
      return null;
    } catch (sendErr) {
      return sendErr instanceof Error ? sendErr : new Error(String(sendErr));
    }
  }

  async _sendMessage(params) {
    if (this.sqsClient && typeof this.sqsClient.sendMessage === 'function') {
      return this.sqsClient.sendMessage(params);
    }

    if (this.sqsClient && typeof this.sqsClient.send === 'function') {
      let command;
      try {
        const { SendMessageCommand } = require('@aws-sdk/client-sqs');
        command = new SendMessageCommand(params);
      } catch (_) {
        command = { input: params, commandName: 'SendMessageCommand' };
      }
      return this.sqsClient.send(command);
    }

    throw new Error('sqs client must implement sendMessage(params) or send(command)');
  }
}

module.exports = { Engine };
