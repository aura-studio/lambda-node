"use strict";

const http = require("node:http");
const {
  assert,
  lambda,
  encodePayload,
  decodePayload,
  createContext,
  exampleDynamicOptions,
  encodeEnvelope,
  decodeEnvelope,
  startHttpEngine,
  fetchText,
  listen,
  closeServer,
  getFreePort,
  cleanGenerated,
  ok,
  delay,
} = require("./common");

const steps = new Map([
  ["00-clean", stepClean],
  ["01-smoke", stepSmoke],
  ["02-dynamic", stepDynamic],
  ["03-http-api", stepHttpApi],
  ["04-http-wapi", stepHttpWapi],
  ["05-reqresp", stepReqResp],
  ["06-event", stepEvent],
  ["07-sqs", stepSqs],
  ["08-server", stepServer],
  ["09-clients", stepClients],
  ["99-run-all-local", runAllLocal],
]);

async function runStep(name, env = process.env) {
  const step = steps.get(name);
  if (!step) {
    throw new Error(`unknown example step: ${name}`);
  }
  const ctx = createContext(env);
  await step(ctx);
}

async function main(defaultStep) {
  const step = process.argv[2] || defaultStep;
  try {
    await runStep(step);
  } catch (err) {
    console.error("error:", err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
}

async function stepClean(ctx) {
  cleanGenerated(ctx);
  ok("generated example files removed");
}

async function stepSmoke() {
  expectFunction(lambda, "serve");
  expectFunction(lambda, "start");
  for (const name of [
    "withLambdaType",
    "withHttpOptions",
    "withSqsOptions",
    "withReqRespOptions",
    "withEventOptions",
    "withDynamicOptions",
    "withServeConfig",
    "withServeConfigFile",
    "withDefaultServeConfigFile",
  ]) {
    expectFunction(lambda, name);
  }
  for (const name of [
    "withAddress",
    "withConfig",
    "withConfigFile",
    "withDebugMode",
    "withOs",
    "withRunMode",
    "withStaticPackage",
  ]) {
    assert.equal(lambda[name], undefined, `${name} should stay on its module namespace`);
  }
  for (const name of ["server", "dynamic", "http", "reqresp", "sqs", "event", "client", "runtime", "protocol"]) {
    assert.equal(typeof lambda[name], "object", `${name} should be exported`);
  }

  for (const name of [
    "Dynamic",
    "MetaGenerator",
    "Tunnel",
    "EnvelopeTunnel",
    "LambdaPackageTunnel",
    "envelopeHandlerFromModule",
    "metaFromModule",
    "nativeHTTPHandlerFromModule",
    "tunnelFromModule",
    "newOptions",
    "withOs",
    "withArch",
    "withCompiler",
    "withVariant",
    "withLocalWarehouse",
    "withRemoteWarehouse",
    "withPackageNamespace",
    "withPackageDefaultVersion",
    "withStaticPackage",
    "withPreloadPackage",
    "optionFromConfig",
    "withConfig",
    "withConfigFile",
    "defaultConfigCandidates",
    "findDefaultConfigFile",
    "withDefaultConfigFile",
  ]) {
    expectFunction(lambda.dynamic, name);
  }

  for (const name of [
    "serve",
    "close",
    "Engine",
    "cors",
    "newOptions",
    "normalizePath",
    "matchMethod",
    "withAddress",
    "withDebugMode",
    "withCorsMode",
    "withStaticLink",
    "withPrefixLink",
    "withPageNotFoundPath",
    "optionFromConfig",
    "withConfig",
    "withConfigFile",
    "defaultConfigCandidates",
    "findDefaultConfigFile",
    "withDefaultConfigFile",
  ]) {
    expectFunction(lambda.http, name);
  }

  for (const moduleName of ["reqresp", "event"]) {
    for (const name of [
      "serve",
      "start",
      "createHandler",
      "close",
      "Engine",
      "newOptions",
      "withDebugMode",
      "optionFromConfig",
      "withConfig",
      "withConfigFile",
      "defaultConfigCandidates",
      "findDefaultConfigFile",
      "withDefaultConfigFile",
    ]) {
      expectFunction(lambda[moduleName], name);
    }
  }

  for (const name of [
    "serve",
    "start",
    "createHandler",
    "close",
    "Engine",
    "newOptions",
    "withSQSClient",
    "withRunMode",
    "withReplyMode",
    "withDebugMode",
    "optionFromConfig",
    "withConfig",
    "withConfigFile",
    "defaultConfigCandidates",
    "findDefaultConfigFile",
    "withDefaultConfigFile",
  ]) {
    expectFunction(lambda.sqs, name);
  }
  for (const name of ["RunModeStrict", "RunModePartial", "RunModeBatch", "RunModeReentrant"]) {
    assert.equal(typeof lambda.sqs[name], "string", `${name} should be exported`);
  }

  for (const name of [
    "serve",
    "start",
    "newOptions",
    "withLambdaType",
    "withHttpOptions",
    "withSqsOptions",
    "withReqRespOptions",
    "withEventOptions",
    "withDynamicOptions",
    "withServeConfig",
    "withServeConfigFile",
    "defaultServeConfigCandidates",
    "findDefaultServeConfigFile",
    "withDefaultServeConfigFile",
  ]) {
    expectFunction(lambda.server, name);
  }

  for (const name of ["HttpClient", "ReqRespClient", "SqsClient", "EventClient"]) {
    expectFunction(lambda.client, name);
  }
  for (const name of ["start", "isRuntimeAvailable", "parseEvent", "buildContext"]) {
    expectFunction(lambda.runtime, name);
  }
  for (const name of [
    "encodePayload",
    "decodePayload",
    "isStrictBase64",
    "encodeReqRespRequest",
    "decodeReqRespRequest",
    "encodeReqRespResponse",
    "decodeReqRespResponse",
    "encodeEventRequest",
    "decodeEventRequest",
    "encodeSqsRequest",
    "decodeSqsRequest",
    "encodeSqsResponse",
    "decodeSqsResponse",
  ]) {
    expectFunction(lambda.protocol, name);
  }

  const httpOptions = lambda.http.newOptions(
    lambda.http.withStaticLink("/old", "/api/envelope/v1/echo", "POST"),
    lambda.http.withPrefixLink("/native", "/wapi/native/v1"),
  );
  assert.ok(httpOptions.staticLinkMap["/old"]);
  assert.ok(httpOptions.prefixLinkMap["/native"]);
  const sqsProto = lambda.protocol.decodeSqsRequest(lambda.protocol.encodeSqsRequest({
    request_sqs_id: "request",
    response_sqs_id: "response",
    correlation_id: "corr",
    path: "/api/envelope/v1/echo",
    payload: Buffer.from("proto"),
  }));
  assert.equal(sqsProto.payload.toString("utf8"), "proto");
  ok("export surface and option helpers are available");
}

async function stepDynamic() {
  const dyn = new lambda.dynamic.Dynamic(...exampleDynamicOptions());
  const envelope = await dyn.invokePackage(
    "envelope",
    "v1",
    "/echo",
    encodeEnvelope({ name: "dynamic" }, { source: "02-dynamic" }),
  );
  const decoded = decodeEnvelope(envelope);
  assert.equal(decoded.payload.message, "hello dynamic");
  console.log(JSON.stringify(decoded, null, 2));

  const fallback = decodeEnvelope(await dyn.invokePackage(
    "envelope",
    "latest",
    "/echo",
    encodeEnvelope({ name: "default-version" }),
  ));
  assert.equal(fallback.payload.message, "hello default-version");

  const upper = decodeEnvelope(await dyn.invokePackage(
    "upper",
    "v1",
    "/upper",
    encodeEnvelope({ name: "upper" }),
  ));
  assert.equal(upper.meta.handler, "upper");
  console.log(JSON.stringify(upper, null, 2));

  const meta = JSON.parse(await dyn.metaPackage("envelope", "v1"));
  assert.equal(meta.name, "envelope");
  console.log(JSON.stringify(meta, null, 2));
  ok("dynamic package invoke/meta/default-version paths work");
}

async function stepHttpApi() {
  const server = await startHttpEngine();
  try {
    let result = await fetchText(`${server.baseUrl}/api/envelope/v1/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "http-api" }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(JSON.parse(result.text).message, "hello http-api");

    result = await fetchText(`${server.baseUrl}/api/envelope/v1/echo?name=query`);
    assert.equal(result.response.status, 200);
    assert.equal(JSON.parse(result.text).message, "hello query");

    result = await fetchText(`${server.baseUrl}/api/envelope/v1/plain`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "plain" }),
    });
    assert.equal(result.response.status, 201);
    assert.equal(result.text, "plain:plain");

    result = await fetchText(`${server.baseUrl}/meta/envelope/v1`);
    assert.equal(result.response.status, 200);
    assert.ok(JSON.parse(result.text).service);

    result = await fetchText(`${server.baseUrl}/_/api/envelope/v1/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "debug" }),
    });
    assert.equal(result.response.status, 200);
    assert.match(result.text, /Response:/);

    result = await fetchText(`${server.baseUrl}/missing`);
    assert.equal(result.response.status, 404);
  } finally {
    await server.close();
  }
  ok("HTTP API/meta/debug/status examples passed");
}

async function stepHttpWapi() {
  const server = await startHttpEngine();
  try {
    let result = await fetchText(`${server.baseUrl}/wapi/native/v1/hello?x=1`, {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "x-example-target": "direct",
      },
      body: "wire-body",
    });
    let body = JSON.parse(result.text);
    assert.equal(result.response.status, 200);
    assert.equal(body.url, "/hello?x=1");
    assert.equal(body.body, "wire-body");

    result = await fetchText(`${server.baseUrl}/native-prefix/mapped?x=2`, {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "x-example-target": "prefix",
      },
      body: "mapped-body",
    });
    body = JSON.parse(result.text);
    assert.equal(result.response.status, 200);
    assert.equal(body.url, "/mapped?x=2");
    assert.equal(body.target, "prefix");
  } finally {
    await server.close();
  }
  ok("HTTP WAPI native req/res examples passed");
}

async function stepReqResp() {
  const engine = new lambda.reqresp.Engine(
    [lambda.reqresp.withDebugMode(false)],
    exampleDynamicOptions(),
  );

  let response = await engine.invoke({
    path: "/api/envelope/v1/echo",
    payload: encodePayload(JSON.stringify({ name: "reqresp" })),
  });
  assert.equal(response.error, "");
  console.log(decodePayload(response.payload));
  assert.equal(JSON.parse(decodePayload(response.payload)).message, "hello reqresp");

  response = await engine.invoke({ path: "/meta/envelope/v1", payload: "" });
  assert.equal(response.error, "");
  assert.ok(JSON.parse(decodePayload(response.payload)).service);

  const handler = lambda.reqresp.createHandler([], exampleDynamicOptions());
  response = await handler({
    path: "/_/api/envelope/v1/echo",
    payload: encodePayload(JSON.stringify({ name: "debug-reqresp" })),
  });
  assert.equal(response.error, "");
  console.log(decodePayload(response.payload));
  ok("ReqResp engine and handler examples passed");
}

async function stepEvent() {
  const envelopePackage = require("../packages/envelope/v1");
  const engine = new lambda.event.Engine([], exampleDynamicOptions());
  const before = envelopePackage.calls.length;

  const response = await engine.invoke({
    path: "/api/envelope/v1/echo",
    payload: encodePayload(JSON.stringify({ name: "event" })),
  });
  assert.equal(response, null);
  assert.equal(envelopePackage.calls.length, before + 1);

  await assert.rejects(
    engine.invoke({
      path: "/api/envelope/v1/error",
      payload: encodePayload(JSON.stringify({ name: "event-error" })),
    }),
    /example envelope failure/,
  );
  ok("Event engine fire-and-forget and error examples passed");
}

async function stepSqs() {
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
    exampleDynamicOptions(),
  );

  const result = await engine.invoke({
    Records: [
      {
        messageId: "msg-1",
        body: JSON.stringify({
          request_sqs_id: "request-queue",
          response_sqs_id: "response-queue",
          correlation_id: "corr-1",
          path: "/api/envelope/v1/echo",
          payload: encodePayload(JSON.stringify({ name: "sqs" })),
        }),
      },
    ],
  });
  assert.deepEqual(result, { batchItemFailures: [] });
  const reply = JSON.parse(sentMessages[0].MessageBody);
  const replyPayload = JSON.parse(decodePayload(reply.payload));
  console.log(JSON.stringify({ reply, replyPayload }, null, 2));
  assert.equal(replyPayload.message, "hello sqs");

  await assertRunMode(lambda.sqs.RunModeStrict, "strict");
  await assertRunMode(lambda.sqs.RunModePartial, "partial");
  await assert.rejects(assertRunMode(lambda.sqs.RunModeBatch, "batch"), /Unexpected token|not-json/);
  await assert.rejects(assertRunMode(lambda.sqs.RunModeReentrant, "reentrant"), /Unexpected token|not-json/);
  ok("SQS reply mode and run modes examples passed");
}

async function assertRunMode(runMode, label) {
  const engine = new lambda.sqs.Engine(
    [lambda.sqs.withRunMode(runMode)],
    exampleDynamicOptions(),
  );
  const result = await engine.invoke({
    Records: [
      { messageId: `${label}-bad`, body: "not-json" },
      {
        messageId: `${label}-good`,
        body: JSON.stringify({
          path: "/api/envelope/v1/echo",
          payload: encodePayload(JSON.stringify({ name: label })),
        }),
      },
    ],
  });
  if (runMode === lambda.sqs.RunModeStrict) {
    assert.deepEqual(result.batchItemFailures, [
      { itemIdentifier: `${label}-bad` },
      { itemIdentifier: `${label}-good` },
    ]);
  } else if (runMode === lambda.sqs.RunModePartial) {
    assert.deepEqual(result.batchItemFailures, [
      { itemIdentifier: `${label}-bad` },
    ]);
  }
  return result;
}

async function stepServer() {
  const reqrespHandler = await lambda.serve(
    lambda.withLambdaType("reqresp"),
    lambda.withReqRespOptions(lambda.reqresp.withDebugMode(false)),
    lambda.withDynamicOptions(...exampleDynamicOptions()),
  );
  const reqrespResponse = await reqrespHandler({
    path: "/api/envelope/v1/echo",
    payload: encodePayload(JSON.stringify({ name: "server-reqresp" })),
  });
  assert.equal(JSON.parse(decodePayload(reqrespResponse.payload)).message, "hello server-reqresp");

  const eventHandler = await lambda.serve(
    lambda.withLambdaType("event"),
    lambda.withDynamicOptions(...exampleDynamicOptions()),
  );
  await eventHandler({
    path: "/api/envelope/v1/echo",
    payload: encodePayload(JSON.stringify({ name: "server-event" })),
  });

  const sqsHandler = await lambda.serve(
    lambda.withLambdaType("sqs"),
    lambda.withSqsOptions(lambda.sqs.withRunMode(lambda.sqs.RunModePartial)),
    lambda.withDynamicOptions(...exampleDynamicOptions()),
  );
  const sqsResponse = await sqsHandler({
    Records: [
      {
        messageId: "server-sqs",
        body: JSON.stringify({
          path: "/api/envelope/v1/echo",
          payload: encodePayload(JSON.stringify({ name: "server-sqs" })),
        }),
      },
    ],
  });
  assert.deepEqual(sqsResponse, { batchItemFailures: [] });

  const port = await getFreePort();
  await lambda.serve(
    lambda.withLambdaType("http"),
    lambda.withHttpOptions(lambda.http.withAddress(`127.0.0.1:${port}`)),
    lambda.withDynamicOptions(...exampleDynamicOptions()),
  );
  try {
    const result = await fetchText(`http://127.0.0.1:${port}/api/envelope/v1/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "server-http" }),
    });
    assert.equal(JSON.parse(result.text).message, "hello server-http");
  } finally {
    await lambda.http.close();
  }

  const options = lambda.server.newOptions(lambda.withServeConfig(`
lambda: reqresp
reqresp:
  mode:
    debug: true
`));
  assert.equal(options.lambda, "reqresp");
  assert.equal(options.reqresp.length, 1);
  ok("server unified serve/config examples passed");
}

async function stepClients() {
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      method: req.method,
      url: req.url,
      body: Buffer.concat(chunks).toString("utf8"),
      trace: req.headers["x-trace"] || "",
    }));
  });
  const baseUrl = await listen(server);

  try {
    const httpClient = new lambda.client.HttpClient({ baseURL: baseUrl, timeout: 1000 });
    let response = await httpClient.get("/client-get");
    console.log(response.body.toString("utf8"));
    assert.equal(JSON.parse(response.body).method, "GET");
    response = await httpClient.doWithHeaders("POST", "/client-post", "body", { "x-trace": "client" });
    assert.equal(JSON.parse(response.body).trace, "client");
  } finally {
    await closeServer(server);
  }

  const lambdaClient = {
    sent: [],
    async send(command) {
      this.sent.push(command.input);
      const request = JSON.parse(Buffer.from(command.input.Payload).toString("utf8"));
      return {
        Payload: Buffer.from(JSON.stringify({
          payload: encodePayload(JSON.stringify({
            invocationType: command.input.InvocationType,
            path: request.path,
            payload: decodePayload(request.payload),
          })),
          error: "",
        })),
      };
    },
  };

  const reqrespClient = new lambda.client.ReqRespClient({
    functionName: "example-reqresp",
    lambdaClient,
    timeout: 1000,
  });
  const reqresp = await reqrespClient.call("/api/envelope/v1/echo", "client-reqresp");
  console.log(reqresp.payload);
  assert.equal(JSON.parse(reqresp.payload).invocationType, "RequestResponse");

  const eventClient = new lambda.client.EventClient({
    functionName: "example-event",
    lambdaClient,
    timeout: 1000,
  });
  await eventClient.send("/api/envelope/v1/echo", "client-event");
  assert.equal(lambdaClient.sent[lambdaClient.sent.length - 1].InvocationType, "Event");

  const sentMessages = [];
  const sqsClient = new lambda.client.SqsClient({
    requestSqsId: "request-queue",
    responseSqsId: "response-queue",
    timeout: 1000,
    sqsClient: {
      async sendMessage(params) {
        sentMessages.push(params);
        return {};
      },
      async receiveMessage() {
        await delay(25);
        return { Messages: [] };
      },
      async deleteMessage() {
        return {};
      },
    },
  });

  const pending = sqsClient.call("/api/envelope/v1/echo", "client-sqs");
  while (sentMessages.length === 0) await delay(5);
  const request = JSON.parse(sentMessages[0].MessageBody);
  sqsClient._handleIncomingMessage({
    Body: JSON.stringify({
      request_sqs_id: request.request_sqs_id,
      response_sqs_id: request.response_sqs_id,
      correlation_id: request.correlation_id,
      payload: encodePayload("client-sqs-response"),
      error: "",
    }),
  });
  const sqsResponse = await pending;
  sqsClient.close();
  console.log(JSON.stringify(sqsResponse));
  assert.equal(sqsResponse.payload, "client-sqs-response");
  ok("HTTP/Lambda/SQS clients examples passed");
}

async function runAllLocal(ctx) {
  for (const name of [
    "00-clean",
    "01-smoke",
    "02-dynamic",
    "03-http-api",
    "04-http-wapi",
    "05-reqresp",
    "06-event",
    "07-sqs",
    "08-server",
    "09-clients",
  ]) {
    await steps.get(name)(ctx);
  }
  ok("all lambda-node examples passed");
}

function expectFunction(obj, name) {
  assert.equal(typeof obj[name], "function", `${name} should be a function`);
}

if (require.main === module) {
  main("99-run-all-local");
}

module.exports = { main, runStep };
