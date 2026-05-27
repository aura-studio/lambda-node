'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const http = require('http');

const lambda = require('../src');
const { encodePayload, decodePayload } = require('../src/protocol/payload');

const exampleMod = require('./packages/example/v1');
const nativeMod = (req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      url: req.url,
      originalUrl: req.originalUrl,
      body: Buffer.concat(chunks).toString('utf8'),
      hasExternalPath: Boolean(req.headers['x-original-path']),
    }));
  });
};
const upperTunnel = {
  async Init() {},
  async Invoke(route, req) {
    return JSON.stringify({
      meta: { route, mode: 'upper' },
      data: Buffer.from(JSON.stringify({ route, req })).toString('base64'),
    });
  },
  async Meta() {
    return JSON.stringify({ name: 'upper', version: 'v1' });
  },
  async Close() {},
};

describe('Export surface', () => {
  it('should expose top-level with helpers', () => {
    for (const name of [
      'withLambdaType',
      'withHttpOptions',
      'withSqsOptions',
      'withReqRespOptions',
      'withEventOptions',
      'withDynamicOptions',
      'withServeConfig',
      'withServeConfigFile',
      'withDefaultServeConfigFile',
      'withOs',
      'withArch',
      'withCompiler',
      'withVariant',
      'withLocalWarehouse',
      'withRemoteWarehouse',
      'withPackageNamespace',
      'withPackageDefaultVersion',
      'withStaticPackage',
      'withPreloadPackage',
      'withDynamicConfig',
      'withDynamicConfigFile',
      'withDefaultDynamicConfigFile',
      'withAddress',
      'withCorsMode',
      'withStaticLink',
      'withPrefixLink',
      'withPageNotFoundPath',
      'withHttpDebugMode',
      'withHttpConfig',
      'withHttpConfigFile',
      'withDefaultHttpConfigFile',
      'withReqRespDebugMode',
      'withReqRespConfig',
      'withReqRespConfigFile',
      'withDefaultReqRespConfigFile',
      'withSQSClient',
      'withRunMode',
      'withReplyMode',
      'withSqsDebugMode',
      'withSqsConfig',
      'withSqsConfigFile',
      'withDefaultSqsConfigFile',
      'withEventDebugMode',
      'withEventConfig',
      'withEventConfigFile',
      'withDefaultEventConfigFile',
    ]) {
      assert.strictEqual(typeof lambda[name], 'function', `${name} should be exported`);
    }

    assert.strictEqual(lambda.withPrefixLink, lambda.http.withPrefixLink);
    assert.strictEqual(lambda.withDynamicOptions, lambda.server.withDynamicOptions);
    assert.strictEqual(lambda.withSqsConfigFile, lambda.sqs.withConfigFile);
  });
});

// Test 1: Dynamic package loading
describe('Dynamic', () => {
  it('should load a registered package and invoke it', async () => {
    const dyn = new lambda.dynamic.Dynamic(
      lambda.dynamic.withStaticPackage({ package: 'example', version: 'v1', handler: exampleMod }),
    );

    const tunnel = await dyn.getPackage('example', 'v1');
    assert.ok(tunnel, 'tunnel should not be null');

    const reqEnvelope = JSON.stringify({
      meta: { route: '/test' },
      data: Buffer.from('hello world').toString('base64'),
    });

    const rsp = await tunnel.invoke('/test', reqEnvelope);
    const parsed = JSON.parse(rsp);
    assert.ok(parsed.data, 'response should have data');

    const decoded = Buffer.from(parsed.data, 'base64').toString('utf8');
    const body = JSON.parse(decoded);
    assert.strictEqual(body.echo, 'hello world');
  });

  it('should return meta from the package', async () => {
    const dyn = new lambda.dynamic.Dynamic(
      lambda.dynamic.withStaticPackage({ package: 'example', version: 'v1', handler: exampleMod }),
    );

    const tunnel = await dyn.getPackage('example', 'v1');
    const metaStr = await tunnel.meta();
    const metaObj = JSON.parse(metaStr);
    assert.strictEqual(metaObj.name, 'example');
    assert.strictEqual(metaObj.version, 'v1');
  });

  it('should invoke uppercase Tunnel packages through dynamic-node helpers', async () => {
    const dyn = new lambda.dynamic.Dynamic(
      lambda.dynamic.withStaticPackage({ package: 'upper', version: 'v1', handler: upperTunnel }),
    );

    const rsp = await dyn.invokePackage('upper', 'v1', '/upper-test', 'hello upper');
    const decoded = JSON.parse(Buffer.from(JSON.parse(rsp).data, 'base64').toString('utf8'));
    assert.deepStrictEqual(decoded, { route: '/upper-test', req: 'hello upper' });

    const meta = JSON.parse(await dyn.metaPackage('upper', 'v1'));
    assert.strictEqual(meta.name, 'upper');
  });
});

// Test 2: ReqResp Engine
describe('ReqResp Engine', () => {
  it('should invoke and return response', async () => {
    const engine = new lambda.reqresp.Engine(
      [],
      [lambda.dynamic.withStaticPackage({ package: 'example', version: 'v1', handler: exampleMod })],
    );

    const resp = await engine.invoke({
      path: '/api/example/v1/test',
      payload: encodePayload(JSON.stringify({ message: 'hello' })),
    });

    assert.ok(resp, 'response should not be null');
    assert.strictEqual(resp.error, '');
    assert.ok(resp.payload, 'payload should not be empty');

    const body = JSON.parse(decodePayload(resp.payload));
    assert.deepStrictEqual(JSON.parse(body.echo), { message: 'hello' });
  });
});

// Test 3: Event Engine
describe('Event Engine', () => {
  it('should invoke without error', async () => {
    const engine = new lambda.event.Engine(
      [],
      [lambda.dynamic.withStaticPackage({ package: 'example', version: 'v1', handler: exampleMod })],
    );

    await engine.invoke({
      path: '/api/example/v1/test',
      payload: encodePayload(JSON.stringify({ message: 'hello' })),
    });
  });
});

// Test 4: SQS Engine protocol compatibility
describe('SQS Engine protocol', () => {
  it('should accept Go-compatible JSON and emit Go-compatible reply JSON', async () => {
    const sentMessages = [];
    const engine = new lambda.sqs.Engine(
      [
        lambda.sqs.withRunMode(lambda.sqs.RunModePartial),
        lambda.sqs.withReplyMode(true),
        lambda.sqs.withSQSClient({
          sendMessage: async (params) => {
            sentMessages.push(params);
            return {};
          },
        }),
      ],
      [lambda.dynamic.withStaticPackage({ package: 'example', version: 'v1', handler: exampleMod })],
    );

    const result = await engine.invoke({
      Records: [
        {
          messageId: 'msg-1',
          body: JSON.stringify({
            request_sqs_id: 'request-queue',
            response_sqs_id: 'response-queue',
            correlation_id: 'corr-1',
            path: '/api/example/v1/test',
            payload: encodePayload('hello sqs'),
          }),
        },
      ],
    });

    assert.deepStrictEqual(result, { batchItemFailures: [] });
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].QueueUrl, 'response-queue');

    const reply = JSON.parse(sentMessages[0].MessageBody);
    assert.strictEqual(reply.request_sqs_id, 'request-queue');
    assert.strictEqual(reply.response_sqs_id, 'response-queue');
    assert.strictEqual(reply.correlation_id, 'corr-1');

    const body = JSON.parse(decodePayload(reply.payload));
    assert.strictEqual(body.echo, 'hello sqs');
  });

  it('should support AWS SDK v3 send(command) clients', async () => {
    const sentCommands = [];
    const engine = new lambda.sqs.Engine(
      [
        lambda.sqs.withRunMode(lambda.sqs.RunModePartial),
        lambda.sqs.withReplyMode(true),
        lambda.sqs.withSQSClient({
          send: async (command) => {
            sentCommands.push(command);
            return {};
          },
        }),
      ],
      [lambda.dynamic.withStaticPackage({ package: 'example', version: 'v1', handler: exampleMod })],
    );

    const result = await engine.invoke({
      Records: [
        {
          messageId: 'msg-v3',
          body: JSON.stringify({
            request_sqs_id: 'request-queue',
            response_sqs_id: 'response-queue',
            correlation_id: 'corr-v3',
            path: '/api/example/v1/test',
            payload: encodePayload('hello v3'),
          }),
        },
      ],
    });

    assert.deepStrictEqual(result, { batchItemFailures: [] });
    assert.strictEqual(sentCommands.length, 1);
    assert.strictEqual(sentCommands[0].input.QueueUrl, 'response-queue');
  });

  it('should mark reply requests without request_sqs_id as failed', async () => {
    const engine = new lambda.sqs.Engine(
      [
        lambda.sqs.withRunMode(lambda.sqs.RunModePartial),
        lambda.sqs.withReplyMode(true),
        lambda.sqs.withSQSClient({ sendMessage: async () => ({}) }),
      ],
      [lambda.dynamic.withStaticPackage({ package: 'example', version: 'v1', handler: exampleMod })],
    );

    const result = await engine.invoke({
      Records: [
        {
          messageId: 'msg-missing-request-id',
          body: JSON.stringify({
            response_sqs_id: 'response-queue',
            correlation_id: 'corr-missing',
            path: '/api/example/v1/test',
            payload: encodePayload('hello missing request id'),
          }),
        },
      ],
    });

    assert.deepStrictEqual(result, {
      batchItemFailures: [{ itemIdentifier: 'msg-missing-request-id' }],
    });
  });

  it('should fail batch mode on reply send errors', async () => {
    const engine = new lambda.sqs.Engine(
      [
        lambda.sqs.withRunMode(lambda.sqs.RunModeBatch),
        lambda.sqs.withReplyMode(true),
        lambda.sqs.withSQSClient({
          sendMessage: async () => {
            throw new Error('reply failed');
          },
        }),
      ],
      [lambda.dynamic.withStaticPackage({ package: 'example', version: 'v1', handler: exampleMod })],
    );

    await assert.rejects(
      engine.invoke({
        Records: [
          {
            messageId: 'msg-batch-reply-error',
            body: JSON.stringify({
              request_sqs_id: 'request-queue',
              response_sqs_id: 'response-queue',
              correlation_id: 'corr-batch',
              path: '/api/example/v1/test',
              payload: encodePayload('hello batch'),
            }),
          },
        ],
      }),
      /reply failed/
    );
  });

  it('should continue reentrant mode after reply send errors and fail at the end', async () => {
    let attempts = 0;
    const engine = new lambda.sqs.Engine(
      [
        lambda.sqs.withRunMode(lambda.sqs.RunModeReentrant),
        lambda.sqs.withReplyMode(true),
        lambda.sqs.withSQSClient({
          sendMessage: async () => {
            attempts += 1;
            if (attempts === 1) throw new Error('reply failed');
            return {};
          },
        }),
      ],
      [lambda.dynamic.withStaticPackage({ package: 'example', version: 'v1', handler: exampleMod })],
    );

    await assert.rejects(
      engine.invoke({
        Records: [
          {
            messageId: 'msg-reentrant-error-1',
            body: JSON.stringify({
              request_sqs_id: 'request-queue',
              response_sqs_id: 'response-queue',
              correlation_id: 'corr-reentrant-1',
              path: '/api/example/v1/test',
              payload: encodePayload('hello reentrant 1'),
            }),
          },
          {
            messageId: 'msg-reentrant-error-2',
            body: JSON.stringify({
              request_sqs_id: 'request-queue',
              response_sqs_id: 'response-queue',
              correlation_id: 'corr-reentrant-2',
              path: '/api/example/v1/test',
              payload: encodePayload('hello reentrant 2'),
            }),
          },
        ],
      }),
      /reply failed/
    );

    assert.strictEqual(attempts, 2);
  });
});

// Test 5: Protobuf helpers
describe('Protocol protobuf helpers', () => {
  it('should round-trip Go-compatible SQS protobuf messages', () => {
    const encoded = lambda.protocol.encodeSqsRequest({
      request_sqs_id: 'request-queue',
      response_sqs_id: 'response-queue',
      correlation_id: 'corr-proto',
      path: '/api/example/v1/test',
      payload: Buffer.from('hello proto'),
    });

    const decoded = lambda.protocol.decodeSqsRequest(encoded);
    assert.strictEqual(decoded.request_sqs_id, 'request-queue');
    assert.strictEqual(decoded.response_sqs_id, 'response-queue');
    assert.strictEqual(decoded.correlation_id, 'corr-proto');
    assert.strictEqual(decoded.path, '/api/example/v1/test');
    assert.strictEqual(decoded.payload.toString('utf8'), 'hello proto');
  });
});

// Test 6: Client timeouts
describe('Client timeouts', () => {
  it('should timeout ReqResp Lambda invokes', async () => {
    const client = new lambda.client.ReqRespClient({
      functionName: 'fn',
      timeout: 10,
      lambdaClient: {
        send: () => new Promise(() => {}),
      },
    });

    await assert.rejects(client.call('/api/example/v1/test', 'hello'), /request timeout/);
  });

  it('should timeout Event Lambda invokes', async () => {
    const client = new lambda.client.EventClient({
      functionName: 'fn',
      timeout: 10,
      lambdaClient: {
        send: () => new Promise(() => {}),
      },
    });

    await assert.rejects(client.send('/api/example/v1/test', 'hello'), /request timeout/);
  });

  it('should allow SQS clients with direct sendMessage methods', async () => {
    const sentMessages = [];
    const client = new lambda.client.SqsClient({
      requestSqsId: 'request-queue',
      sqsClient: {
        sendMessage: async (params) => {
          sentMessages.push(params);
          return {};
        },
      },
    });

    await client.send('/api/example/v1/test', 'hello sqs client');
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].QueueUrl, 'request-queue');
  });
});

// Test 7: Runtime entrypoints
describe('Runtime entrypoints', () => {
  it('should expose explicit start entrypoints', () => {
    assert.strictEqual(typeof lambda.start, 'function');
    assert.strictEqual(typeof lambda.server.start, 'function');
    assert.strictEqual(typeof lambda.reqresp.start, 'function');
    assert.strictEqual(typeof lambda.sqs.start, 'function');
    assert.strictEqual(typeof lambda.event.start, 'function');
  });

  it('should fail clearly when Runtime API is unavailable', async () => {
    const oldRuntimeApi = process.env.AWS_LAMBDA_RUNTIME_API;
    delete process.env.AWS_LAMBDA_RUNTIME_API;

    try {
      await assert.rejects(
        lambda.runtime.start(async () => null),
        /AWS_LAMBDA_RUNTIME_API is not set/
      );
      await assert.rejects(
        lambda.server.start(lambda.server.withLambdaType('reqresp')),
        /AWS_LAMBDA_RUNTIME_API is not set/
      );
    } finally {
      if (oldRuntimeApi === undefined) {
        delete process.env.AWS_LAMBDA_RUNTIME_API;
      } else {
        process.env.AWS_LAMBDA_RUNTIME_API = oldRuntimeApi;
      }
    }
  });

  it('should process one Runtime API invocation', async () => {
    const oldRuntimeApi = process.env.AWS_LAMBDA_RUNTIME_API;
    const received = {};

    const runtimeServer = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/2018-06-01/runtime/invocation/next') {
        res.setHeader('lambda-runtime-aws-request-id', 'req-1');
        res.setHeader('lambda-runtime-deadline-ms', String(Date.now() + 30000));
        res.end(JSON.stringify({ message: 'hello runtime' }));
        return;
      }

      if (req.method === 'POST' && req.url === '/2018-06-01/runtime/invocation/req-1/response') {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          received.response = Buffer.concat(chunks).toString('utf8');
          res.end('');
        });
        return;
      }

      res.statusCode = 404;
      res.end('');
    });

    await new Promise((resolve) => runtimeServer.listen(0, '127.0.0.1', resolve));

    try {
      const { port } = runtimeServer.address();
      process.env.AWS_LAMBDA_RUNTIME_API = `127.0.0.1:${port}`;

      await lambda.runtime.start(
        async (event, context) => ({
          message: event.message,
          requestId: context.awsRequestId,
        }),
        { maxInvocations: 1 }
      );

      assert.deepStrictEqual(JSON.parse(received.response), {
        message: 'hello runtime',
        requestId: 'req-1',
      });
    } finally {
      await new Promise((resolve) => runtimeServer.close(resolve));
      if (oldRuntimeApi === undefined) {
        delete process.env.AWS_LAMBDA_RUNTIME_API;
      } else {
        process.env.AWS_LAMBDA_RUNTIME_API = oldRuntimeApi;
      }
    }
  });
});

// Test 8: HTTP Engine integration
describe('HTTP Server', () => {
  let server;
  const port = 18901;

  before(async () => {
    const engine = new lambda.http.Engine(
      [
        lambda.http.withAddress(`:${port}`),
        lambda.http.withPrefixLink('/native-prefix', '/wapi/native/v1'),
      ],
      [
        lambda.dynamic.withStaticPackage({ package: 'example', version: 'v1', handler: exampleMod }),
        lambda.dynamic.withStaticPackage({ package: 'native', version: 'v1', handler: nativeMod }),
      ],
    );
    server = engine.app.listen(port);
  });

  after(() => {
    if (server) server.close();
  });

  it('should respond to health check', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/health-check`);
    assert.strictEqual(resp.status, 200);
    const text = await resp.text();
    assert.strictEqual(text, 'OK');
  });

  it('should handle API requests', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/api/example/v1/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello from test' }),
    });
    assert.strictEqual(resp.status, 200);
    const body = await resp.text();
    assert.ok(body.length > 0, 'body should not be empty');
    assert.strictEqual(JSON.parse(body).route, '/test');
  });

  it('should route WAPI requests to a native HTTP handler', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/wapi/native/v1/a/b/c?x=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'raw-body',
    });
    assert.strictEqual(resp.status, 200);
    const body = await resp.json();
    assert.strictEqual(body.url, '/a/b/c?x=1');
    assert.strictEqual(body.originalUrl, '/a/b/c?x=1');
    assert.strictEqual(body.body, 'raw-body');
    assert.strictEqual(body.hasExternalPath, false);
  });

  it('should keep only the mapped WAPI path visible after prefix rewrite', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/native-prefix/d/e/f?x=2`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'mapped-body',
    });
    assert.strictEqual(resp.status, 200);
    const body = await resp.json();
    assert.strictEqual(body.url, '/d/e/f?x=2');
    assert.strictEqual(body.originalUrl, '/d/e/f?x=2');
    assert.strictEqual(body.body, 'mapped-body');
    assert.strictEqual(body.hasExternalPath, false);
  });

  it('should return 404 for unknown paths', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/unknown`);
    assert.strictEqual(resp.status, 404);
  });

  it('should handle meta requests', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/meta/example/v1`);
    assert.strictEqual(resp.status, 200);
    const body = await resp.json();
    assert.ok(body.service, 'should have service info');
    assert.ok(body.lambda, 'should have lambda info');
  });
});
