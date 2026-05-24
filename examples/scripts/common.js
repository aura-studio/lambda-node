"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const lambda = require("../../src");
const { encodePayload, decodePayload } = require("../../src/protocol/payload");

const SCRIPT_DIR = __dirname;
const EXAMPLES_DIR = path.dirname(SCRIPT_DIR);
const REPO_ROOT = path.dirname(EXAMPLES_DIR);

function createContext(env = process.env) {
  return {
    env: { ...env },
    scriptDir: SCRIPT_DIR,
    examplesDir: EXAMPLES_DIR,
    repoRoot: REPO_ROOT,
    tmpDir: env.LAMBDA_NODE_EXAMPLE_TMP || path.join(EXAMPLES_DIR, ".tmp"),
  };
}

function exampleDynamicOptions() {
  return [
    lambda.dynamic.withPackageNamespace("lambda-example"),
    lambda.dynamic.withPackageDefaultVersion("v1"),
    lambda.dynamic.withStaticPackage({
      package: "envelope",
      version: "v1",
      handler: require("../packages/envelope/v1"),
    }),
    lambda.dynamic.withStaticPackage({
      package: "native",
      version: "v1",
      handler: require("../packages/native/v1"),
    }),
    lambda.dynamic.withStaticPackage({
      package: "upper",
      version: "v1",
      handler: require("../packages/upper-tunnel"),
    }),
  ];
}

function encodeEnvelope(payload, meta = {}) {
  return JSON.stringify({
    meta,
    data: Buffer.from(JSON.stringify(payload)).toString("base64"),
  });
}

function decodeEnvelope(raw) {
  const envelope = JSON.parse(raw || "{}");
  const text = Buffer.from(envelope.data || "", "base64").toString("utf8");
  return {
    meta: envelope.meta || {},
    payload: text ? JSON.parse(text) : null,
  };
}

async function startHttpEngine(httpOpts = [], dynamicOpts = exampleDynamicOptions()) {
  const engine = new lambda.http.Engine(
    [
      lambda.http.withPrefixLink("/native-prefix", "/wapi/native/v1"),
      lambda.http.withPageNotFoundPath("/api/envelope/v1/echo", "POST"),
      ...httpOpts,
    ],
    dynamicOpts,
  );
  const server = http.createServer(engine.app);
  const baseUrl = await listen(server);
  return {
    engine,
    server,
    baseUrl,
    close: () => closeServer(server),
  };
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  console.log(`HTTP ${response.status} ${url}`);
  console.log(text);
  return { response, text };
}

async function listen(server, port = 0) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await closeServer(server);
  return port;
}

function cleanGenerated(ctx) {
  removePath(ctx.tmpDir);
}

function removePath(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function runNpm(args, options = {}) {
  if (process.platform === "win32") {
    return run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm", ...args], options);
  }
  return run("npm", args, options);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...(options.env || {}) },
    stdio: options.encoding ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: options.encoding,
    shell: false,
  });
  if (result.error || result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr}` : "";
    throw new Error(
      `command failed: ${command} ${args.join(" ")} (${result.error?.message ?? result.status})${stderr}`,
    );
  }
  return result;
}

function ok(message) {
  console.log(`ok: ${message}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
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
  removePath,
  run,
  runNpm,
  ok,
  delay,
};
