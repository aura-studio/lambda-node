"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PORT = Number(process.env.LAMBDA_NODE_EXAMPLE_UI_PORT || 3461);
const SCRIPT_DIR = __dirname;

const steps = [
  ["00-clean", "Clean generated files", "Local (in-process)"],
  ["01-smoke", "Check exported API surface", "Local (in-process)"],
  ["02-dynamic", "Invoke dynamic packages directly", "Local (in-process)"],
  ["03-http-api", "Exercise HTTP /api and /meta", "Local (in-process)"],
  ["04-http-wapi", "Exercise HTTP /wapi req/res mode", "Local (in-process)"],
  ["05-reqresp", "Exercise ReqResp Lambda mode", "Local (in-process)"],
  ["06-event", "Exercise Event Lambda mode", "Local (in-process)"],
  ["07-sqs", "Exercise SQS reply and run modes", "Local (in-process)"],
  ["08-server", "Exercise unified server entrypoint", "Local (in-process)"],
  ["09-clients", "Exercise client helpers", "Local (in-process)"],
  ["99-run-all-local", "Run all local steps", "Local (in-process)"],
  ["10-localstack-up", "Start LocalStack (S3+SQS) & upload 6 packages", "LocalStack e2e (Docker)"],
  ["11-e2e-http", "HTTP /api: load package from S3 → invoke", "LocalStack e2e (Docker)"],
  ["12-e2e-http-wapi", "HTTP /wapi: native handler from S3 → invoke", "LocalStack e2e (Docker)"],
  ["13-e2e-reqresp", "ReqResp: load package from S3 → invoke", "LocalStack e2e (Docker)"],
  ["14-e2e-sqs", "SQS: load from S3 → invoke → SQS reply", "LocalStack e2e (Docker)"],
  ["15-e2e-event", "Event: load package from S3 → fire-and-forget", "LocalStack e2e (Docker)"],
  ["16-e2e-bundle", "Bundle variant: load bundle.js from S3 → invoke", "LocalStack e2e (Docker)"],
  ["17-localstack-down", "Stop LocalStack & clean workspace", "LocalStack e2e (Docker)"],
  ["98-run-all-e2e", "Run full LocalStack e2e cycle (6 modes)", "LocalStack e2e (Docker)"],
  ["20-app-http", "HTTP app: api+wapi × full+bundle (4 cases)", "Standalone apps (npm install + Docker)"],
  ["21-app-reqresp", "ReqResp app: 2 routes × full+bundle (4 cases)", "Standalone apps (npm install + Docker)"],
  ["22-app-sqs", "SQS app: 2 routes × full+bundle, SQS reply (4 cases)", "Standalone apps (npm install + Docker)"],
  ["23-app-event", "Event app: 2 routes × full+bundle, marker (4 cases)", "Standalone apps (npm install + Docker)"],
  ["24-app-http-docker", "HTTP app: build Dockerfile Lambda and invoke api+wapi", "Standalone apps (Dockerfile Lambda)"],
  ["25-app-reqresp-docker", "ReqResp app: build Dockerfile Lambda and invoke 2 routes", "Standalone apps (Dockerfile Lambda)"],
  ["26-app-sqs-docker", "SQS app: build Dockerfile Lambda and verify reply queue", "Standalone apps (Dockerfile Lambda)"],
  ["27-app-event-docker", "Event app: build Dockerfile Lambda and fire events", "Standalone apps (Dockerfile Lambda)"],
];

const clients = new Map();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderPage());
    return;
  }

  if (url.pathname === "/events" && req.method === "GET") {
    const id = url.searchParams.get("id");
    if (!id) {
      res.writeHead(400);
      res.end("missing id");
      return;
    }
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(":ok\n\n");
    clients.set(id, res);
    req.on("close", () => clients.delete(id));
    return;
  }

  if (url.pathname === "/run" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const { step, id } = JSON.parse(body || "{}");
        if (!step || !id) {
          res.writeHead(400);
          res.end("missing step/id");
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        runStep(step, id);
      } catch {
        res.writeHead(400);
        res.end("bad json");
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

function renderSteps() {
  let html = "";
  let currentGroup = null;
  for (const [id, label, group] of steps) {
    const groupName = group || "Steps";
    if (groupName !== currentGroup) {
      html += `<div class="group-title">${groupName}</div>`;
      currentGroup = groupName;
    }
    html += `<button data-step="${id}"><strong>${id}</strong><span>${label}</span></button>`;
  }
  return html;
}

function renderPage() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>lambda-node examples</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; color: #1d2935; background: #f5f7fb; }
    main { max-width: 1120px; margin: 0 auto; padding: 28px; }
    h1 { margin: 0 0 18px; font-size: 24px; }
    .layout { display: grid; grid-template-columns: 360px 1fr; gap: 18px; align-items: start; }
    .steps, .log { background: white; border: 1px solid #d8e0ea; border-radius: 8px; overflow: hidden; }
    button { width: 100%; text-align: left; border: 0; border-bottom: 1px solid #edf1f6; background: white; padding: 12px 14px; cursor: pointer; }
    button:hover { background: #eef5ff; }
    button strong { display: block; font-size: 14px; }
    button span { display: block; color: #5c6b7a; font-size: 12px; margin-top: 3px; }
    .group-title { padding: 10px 14px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #6a7787; background: #f0f4fa; border-bottom: 1px solid #dfe6ef; }
    .group-title:first-child { border-top: 0; }
    pre { min-height: 560px; margin: 0; padding: 14px; overflow: auto; font-size: 12px; line-height: 1.45; background: #111827; color: #e6edf7; }
    @media (max-width: 840px) { .layout { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>lambda-node examples</h1>
    <div class="layout">
      <section class="steps">
        ${renderSteps()}
      </section>
      <section class="log"><pre id="log"></pre></section>
    </div>
  </main>
  <script>
    const id = Math.random().toString(16).slice(2);
    let firstOpen = false;
    const log = document.querySelector("#log");
    function connect() {
      const events = new EventSource("/events?id=" + id);
      events.addEventListener("open", () => {
        if (firstOpen) location.reload();
        firstOpen = true;
      });
      events.addEventListener("out", (event) => {
        const data = JSON.parse(event.data);
        log.textContent += data.text;
        log.scrollTop = log.scrollHeight;
      });
      events.addEventListener("done", (event) => {
        const data = JSON.parse(event.data);
        log.textContent += "\\n[exit " + data.code + "] " + data.step + "\\n";
        log.scrollTop = log.scrollHeight;
      });
      events.addEventListener("error", () => {
        events.close();
        setTimeout(connect, 2000);
      });
    }
    connect();
    document.querySelectorAll("button[data-step]").forEach((button) => {
      button.addEventListener("click", async () => {
        const step = button.dataset.step;
        log.textContent = "$ node examples/scripts/" + step + ".js\\n";
        await fetch("/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ step, id })
        });
      });
    });
  </script>
</body>
</html>`;
}

function runStep(step, id) {
  const script = path.join(SCRIPT_DIR, `${step}.js`);
  if (!fs.existsSync(script)) {
    send(id, "out", { text: `missing script: ${script}\n` });
    send(id, "done", { step, code: 1 });
    return;
  }

  const child = spawn(process.execPath, [script], {
    cwd: path.dirname(SCRIPT_DIR),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (data) => send(id, "out", { text: data.toString("utf8") }));
  child.stderr.on("data", (data) => send(id, "out", { text: data.toString("utf8") }));
  child.on("close", (code) => send(id, "done", { step, code: code || 0 }));
  child.on("error", (err) => {
    send(id, "out", { text: `spawn failed: ${err.message}\n` });
    send(id, "done", { step, code: 1 });
  });
}

function send(id, event, data) {
  const client = clients.get(id);
  if (!client) return;
  client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`lambda-node example UI: http://127.0.0.1:${PORT}`);
  });
}
